import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync, zipSync, strToU8 } from "../vendor/fflate/browser.js";

import { decodeText } from "../src/bytes.js";
import { normalizePost } from "../src/content.js";
import { generateSigningKeyPair } from "../src/crypto.js";
import { buildStaticExport } from "../src/exporter.js";
import { verifyPostSnailZip } from "../src/verifier.js";

async function buildFixtureZip(overrides = {}) {
  const keys = generateSigningKeyPair();
  const post = normalizePost({
    id: "p1",
    title: "Verified Post",
    body: "This post should verify.",
    tags: ["proof"],
    status: "published",
    createdAt: "2026-06-05T00:00:00.000Z",
  });
  return buildStaticExport({
    profile: {
      siteTitle: "Verifier Feed",
      description: "A signed feed.",
      handle: "verifier",
      siteUrl: "https://example.com",
      about: "About verification.",
      ...(overrides.profile || {}),
    },
    posts: [post],
    assets: [],
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
    generatedAt: "2026-06-05T00:00:00.000Z",
  });
}

function replaceManifest(zipBytes, mutate) {
  const files = unzipSync(zipBytes);
  const manifest = JSON.parse(decodeText(files["postsnail.manifest.json"]));
  mutate(manifest);
  files["postsnail.manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  return zipSync(files, { level: 9 });
}

function replaceWellKnown(zipBytes, mutate) {
  const files = unzipSync(zipBytes);
  const wellKnown = JSON.parse(decodeText(files[".well-known/postsnail.json"]));
  mutate(wellKnown);
  files[".well-known/postsnail.json"] = strToU8(JSON.stringify(wellKnown, null, 2));
  return zipSync(files, { level: 9 });
}

test("verifyPostSnailZip accepts a valid signed export", async () => {
  const result = await buildFixtureZip();
  const verification = await verifyPostSnailZip(result.zipBytes);

  assert.equal(verification.ok, true);
  assert.equal(verification.summary.postCount, 1);
  assert.equal(verification.summary.fileCount > 0, true);
  assert.equal(verification.summary.bundleFingerprint.startsWith("psn1-sha3-512-"), true);
  assert.equal(verification.checks.every((check) => check.ok), true);
});

test("verifyPostSnailZip rejects a tampered manifest", async () => {
  const result = await buildFixtureZip();
  const tampered = replaceManifest(result.zipBytes, (manifest) => {
    manifest.site.siteTitle = "Tampered Feed";
  });
  const verification = await verifyPostSnailZip(tampered);

  assert.equal(verification.ok, false);
  assert.match(verification.errors.join("\n"), /Manifest signature failed/);
});

test("verifyPostSnailZip rejects a tampered post record", async () => {
  const result = await buildFixtureZip();
  const tampered = replaceManifest(result.zipBytes, (manifest) => {
    manifest.posts[0].record.body = "Changed after signing.";
  });
  const verification = await verifyPostSnailZip(tampered);

  assert.equal(verification.ok, false);
  assert.match(verification.errors.join("\n"), /Post verified-post digest mismatch/);
  assert.match(verification.errors.join("\n"), /Post verified-post signature failed/);
});

test("verifyPostSnailZip rejects a tampered file hash", async () => {
  const result = await buildFixtureZip();
  const files = unzipSync(result.zipBytes);
  files["index.html"] = strToU8(`${decodeText(files["index.html"])}\n<!-- changed -->`);
  const verification = await verifyPostSnailZip(zipSync(files, { level: 9 }));

  assert.equal(verification.ok, false);
  assert.match(verification.errors.join("\n"), /File hash mismatch: index\.html/);
});

test("verifyPostSnailZip rejects tampered well-known metadata", async () => {
  const result = await buildFixtureZip();
  const files = unzipSync(result.zipBytes);
  const wellKnown = JSON.parse(decodeText(files[".well-known/postsnail.json"]));
  wellKnown.bundleFingerprint = "psn1-sha3-512-not-the-real-fingerprint";
  files[".well-known/postsnail.json"] = strToU8(JSON.stringify(wellKnown, null, 2));
  const verification = await verifyPostSnailZip(zipSync(files, { level: 9 }));

  assert.equal(verification.ok, false);
  assert.match(verification.errors.join("\n"), /\.well-known bundle fingerprint mismatch/);
});

test("verifyPostSnailZip rejects tampered identity signatures", async () => {
  const result = await buildFixtureZip();
  const tampered = replaceWellKnown(result.zipBytes, (wellKnown) => {
    const suffix = wellKnown.identitySignature.slice(8);
    wellKnown.identitySignature = `base64:${suffix[0] === "A" ? "B" : "A"}${suffix.slice(1)}`;
  });
  const verification = await verifyPostSnailZip(tampered);

  assert.equal(verification.ok, false);
  assert.match(verification.errors.join("\n"), /Identity signature/);
});

test("verifyPostSnailZip warns but passes when no site URL is declared", async () => {
  const result = await buildFixtureZip({ profile: { siteUrl: "" } });
  const verification = await verifyPostSnailZip(result.zipBytes);

  assert.equal(verification.ok, true);
  assert.equal(verification.summary.domainBinding, "not declared");
  assert.match(verification.warnings.join("\n"), /domain binding was not checked/i);
});

test("verifyPostSnailZip rejects unlisted extra files", async () => {
  const result = await buildFixtureZip();
  const files = unzipSync(result.zipBytes);
  files["unexpected.js"] = strToU8("alert('not part of the signed bundle')");
  const verification = await verifyPostSnailZip(zipSync(files, { level: 9 }));

  assert.equal(verification.ok, false);
  assert.match(verification.errors.join("\n"), /Unlisted file\(s\) in ZIP: unexpected\.js/);
});

test("verifyPostSnailZip rejects the wrong public key", async () => {
  const result = await buildFixtureZip();
  const wrongKey = generateSigningKeyPair().publicKey;
  const tampered = replaceManifest(result.zipBytes, (manifest) => {
    manifest.publicKey = `base64:${Buffer.from(wrongKey).toString("base64")}`;
  });
  const verification = await verifyPostSnailZip(tampered);

  assert.equal(verification.ok, false);
  assert.match(verification.errors.join("\n"), /Manifest signature failed/);
  assert.match(verification.errors.join("\n"), /Post verified-post signature failed/);
});

test("verifyPostSnailZip rejects missing required files", async () => {
  const result = await buildFixtureZip();
  const files = unzipSync(result.zipBytes);
  delete files["postsnail.manifest.json"];
  const verification = await verifyPostSnailZip(zipSync(files, { level: 9 }));

  assert.equal(verification.ok, false);
  assert.match(verification.errors.join("\n"), /Missing postsnail\.manifest\.json/);
});

test("verifyPostSnailZip rejects invalid ZIP bytes", async () => {
  const verification = await verifyPostSnailZip(strToU8("not a zip"));

  assert.equal(verification.ok, false);
  assert.match(verification.errors.join("\n"), /Invalid ZIP/);
});
