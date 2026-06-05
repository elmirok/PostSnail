import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync, zipSync, strToU8 } from "../vendor/fflate/browser.js";

import { canonicalJson } from "../src/canonical.js";
import { decodeText, encodeText } from "../src/bytes.js";
import { normalizePost } from "../src/content.js";
import { generateSigningKeyPair, signBytes, signatureToText } from "../src/crypto.js";
import { buildStaticExport } from "../src/exporter.js";
import { migrateWorkspace } from "../src/migrations.js";
import {
  checkRequiredFeatures,
  collectCompatibilityWarnings,
  getOptionalExtension,
  hasOptionalFeature,
  isLegacyManifest,
  normalizeLegacyManifest,
} from "../src/compatibility.js";
import {
  CURRENT_COMMIT_VERSION,
  CURRENT_IDENTITY_VERSION,
  CURRENT_MANIFEST_VERSION,
  CURRENT_WORKSPACE_VERSION,
  KNOWN_OPTIONAL_FEATURES,
  POSTSNAIL_PROTOCOL,
  POSTSNAIL_PROTOCOL_VERSION,
  REQUIRED_CORE_FEATURES,
} from "../src/protocol.js";
import { verifyPostSnailZip } from "../src/verifier.js";

const generatedAt = "2026-06-05T00:00:00.000Z";

async function signedFixture() {
  const keys = generateSigningKeyPair();
  const post = normalizePost({
    id: "p1",
    title: "Compatibility Note",
    body: "A valid export used for compatibility tests.",
    tags: ["compat"],
    status: "published",
    createdAt: generatedAt,
  });
  const result = await buildStaticExport({
    profile: {
      siteTitle: "Compatibility Feed",
      description: "A signed compatibility fixture.",
      handle: "compatibility",
      siteUrl: "https://compat.example",
    },
    posts: [post],
    assets: [],
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
    generatedAt,
  });
  return { keys, result };
}

function resignManifest(manifest, secretKey) {
  const payload = { ...manifest };
  delete payload.manifestSignature;
  return {
    ...payload,
    manifestSignature: signatureToText(signBytes(encodeText(canonicalJson(payload)), secretKey)),
  };
}

function resignIdentity(identity, secretKey) {
  const payload = { ...identity };
  delete payload.identitySignature;
  return {
    ...payload,
    identitySignature: signatureToText(signBytes(encodeText(canonicalJson(payload)), secretKey)),
  };
}

function replaceProofFiles(zipBytes, replacements) {
  const files = unzipSync(zipBytes);
  for (const [name, value] of Object.entries(replacements)) {
    if (value === null) delete files[name];
    else files[name] = strToU8(JSON.stringify(value, null, 2));
  }
  return zipSync(files, { level: 9 });
}

test("protocol constants expose stable core and extension declarations", () => {
  assert.equal(POSTSNAIL_PROTOCOL, "postsnail");
  assert.equal(POSTSNAIL_PROTOCOL_VERSION, 1);
  assert.equal(CURRENT_MANIFEST_VERSION, 1);
  assert.equal(CURRENT_IDENTITY_VERSION, 1);
  assert.equal(CURRENT_COMMIT_VERSION, 1);
  assert.equal(CURRENT_WORKSPACE_VERSION, 1);
  assert.deepEqual(REQUIRED_CORE_FEATURES, ["signed-manifest", "file-hashes"]);
  assert.ok(KNOWN_OPTIONAL_FEATURES.includes("workspace-vault"));
  assert.ok(KNOWN_OPTIONAL_FEATURES.includes("plugins"));
});

test("compatibility helpers ignore optional extensions and reject unknown required features", () => {
  const record = {
    protocol: POSTSNAIL_PROTOCOL,
    version: 1,
    requiredFeatures: ["signed-manifest", "file-hashes", "future-required"],
    optionalFeatures: ["sitemap", "unknown-optional"],
    extensions: { "unknown-optional": { preserved: true } },
  };

  const required = checkRequiredFeatures(record, REQUIRED_CORE_FEATURES);
  assert.equal(required.ok, false);
  assert.deepEqual(required.unknownRequiredFeatures, ["future-required"]);
  assert.equal(hasOptionalFeature(record, "unknown-optional"), true);
  assert.deepEqual(getOptionalExtension(record, "unknown-optional"), { preserved: true });
  assert.match(required.errors.join("\n"), /Unsupported required feature: future-required/);

  const warnings = collectCompatibilityWarnings({ protocol: "postsnail-v1", manifestVersion: 1 });
  assert.match(warnings.join("\n"), /legacy/i);
});

test("new exports declare protocol compatibility features on major proof files", async () => {
  const { result } = await signedFixture();
  const files = unzipSync(result.zipBytes);
  const manifest = JSON.parse(decodeText(files["postsnail.manifest.json"]));
  const identity = JSON.parse(decodeText(files[".well-known/postsnail.json"]));
  const latestCommit = JSON.parse(decodeText(files[".well-known/postsnail/latest-commit.json"]));
  const announce = result.announcePayload;

  for (const file of [manifest, identity, latestCommit, announce]) {
    assert.equal(file.protocol, POSTSNAIL_PROTOCOL);
    assert.equal(file.version, 1);
    assert.deepEqual(file.requiredFeatures, REQUIRED_CORE_FEATURES);
    assert.equal(typeof file.extensions, "object");
  }
  assert.equal(manifest.manifestVersion, CURRENT_MANIFEST_VERSION);
  assert.equal(identity.identityVersion, CURRENT_IDENTITY_VERSION);
  assert.equal(latestCommit.commitVersion, CURRENT_COMMIT_VERSION);
  assert.ok(manifest.optionalFeatures.includes("sitemap"));
  assert.ok(identity.optionalFeatures.includes("identity-document"));
  assert.ok(latestCommit.optionalFeatures.includes("commit-history"));
});

test("legacy manifests normalize without mutating and valid legacy ZIPs verify with warnings", async () => {
  const { keys, result } = await signedFixture();
  const files = unzipSync(result.zipBytes);
  const manifest = JSON.parse(decodeText(files["postsnail.manifest.json"]));
  const identity = JSON.parse(decodeText(files[".well-known/postsnail.json"]));
  const legacyManifest = resignManifest(stripCompatibilityFields(manifest), keys.secretKey);
  const legacyIdentity = resignIdentity({
    ...stripCompatibilityFields(identity),
    protocol: "postsnail-v1",
  }, keys.secretKey);

  assert.equal(isLegacyManifest(legacyManifest), true);
  const normalized = normalizeLegacyManifest(legacyManifest);
  assert.equal(normalized.protocol, POSTSNAIL_PROTOCOL);
  assert.equal(normalized.version, CURRENT_MANIFEST_VERSION);
  assert.equal(legacyManifest.protocol, undefined);

  const legacyZip = replaceProofFiles(result.zipBytes, {
    "postsnail.manifest.json": legacyManifest,
    ".well-known/postsnail.json": legacyIdentity,
    ".well-known/postsnail/latest-commit.json": null,
    ".well-known/postsnail/commits.json": null,
  });
  const verification = await verifyPostSnailZip(legacyZip);
  assert.equal(verification.ok, true);
  assert.match(verification.warnings.join("\n"), /legacy PostSnail export/i);
});

test("unknown required features fail clearly while optional extensions are ignored", async () => {
  const { keys, result } = await signedFixture();
  const files = unzipSync(result.zipBytes);
  const manifest = JSON.parse(decodeText(files["postsnail.manifest.json"]));
  manifest.requiredFeatures = [...REQUIRED_CORE_FEATURES, "time-travel-required"];
  manifest.optionalFeatures = [...manifest.optionalFeatures, "unknown-optional"];
  manifest.extensions = { "unknown-optional": { note: "ignored" } };
  const signedManifest = resignManifest(manifest, keys.secretKey);
  const verification = await verifyPostSnailZip(replaceProofFiles(result.zipBytes, {
    "postsnail.manifest.json": signedManifest,
  }));

  assert.equal(verification.ok, false);
  assert.match(verification.errors.join("\n"), /Unsupported required feature: time-travel-required/);
});

test("legacy ZIPs still fail on broken old file hashes", async () => {
  const { keys, result } = await signedFixture();
  const files = unzipSync(result.zipBytes);
  const manifest = JSON.parse(decodeText(files["postsnail.manifest.json"]));
  const identity = JSON.parse(decodeText(files[".well-known/postsnail.json"]));
  files["postsnail.manifest.json"] = strToU8(JSON.stringify(resignManifest(stripCompatibilityFields(manifest), keys.secretKey), null, 2));
  files[".well-known/postsnail.json"] = strToU8(JSON.stringify(resignIdentity({
    ...stripCompatibilityFields(identity),
    protocol: "postsnail-v1",
  }, keys.secretKey), null, 2));
  delete files[".well-known/postsnail/latest-commit.json"];
  delete files[".well-known/postsnail/commits.json"];
  files["index.html"] = strToU8(`${decodeText(files["index.html"])}\n<!-- old tamper -->`);

  const verification = await verifyPostSnailZip(zipSync(files, { level: 9 }));
  assert.equal(verification.ok, false);
  assert.match(verification.errors.join("\n"), /File hash mismatch: index\.html/);
});

test("missing-version legacy workspaces migrate deterministically and preserve plugin state", () => {
  const migrated = migrateWorkspace({
    profile: { siteTitle: "Legacy Workspace" },
    posts: [],
    plugins: {
      installed: [{ id: "legacy-plugin" }],
      lock: { "legacy-plugin": "sha3-lock" },
      state: { "legacy-plugin": { privateSetting: "preserve-me" } },
    },
    extensions: { "unknown-optional": { value: true } },
  }, { now: generatedAt });

  assert.equal(migrated.version, CURRENT_WORKSPACE_VERSION);
  assert.equal(migrated.migratedFromLegacy, true);
  assert.deepEqual(migrated.plugins.state, { "legacy-plugin": { privateSetting: "preserve-me" } });
  assert.deepEqual(migrated.extensions, { "unknown-optional": { value: true } });
});

function stripCompatibilityFields(record) {
  const clone = JSON.parse(JSON.stringify(record));
  delete clone.protocol;
  delete clone.version;
  delete clone.requiredFeatures;
  delete clone.optionalFeatures;
  delete clone.extensions;
  return clone;
}
