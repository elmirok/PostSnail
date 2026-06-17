import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync } from "../vendor/fflate/browser.js";

import { canonicalJson } from "../src/canonical.js";
import { decodeText, encodeText } from "../src/bytes.js";
import { normalizePost } from "../src/content.js";
import { generateSigningKeyPair, sha3Hex, signBytes, verifyBytes, textToBytes } from "../src/crypto.js";
import { buildStaticExport } from "../src/exporter.js";
import {
  COMMIT_VERSION,
  CURRENT_COMMIT_VERSION,
  CURRENT_IDENTITY_VERSION,
  CURRENT_MANIFEST_VERSION,
  DIGEST_SUITE,
  FINGERPRINT_SUITE,
  IDENTITY_VERSION,
  MANIFEST_VERSION,
  POSTSNAIL_PROTOCOL,
  POSTSNAIL_PROTOCOL_VERSION,
  REQUIRED_CORE_FEATURES,
  SIGNATURE_SUITE,
} from "../src/protocol.js";

function unsigned(record, signatureField) {
  const copy = { ...record };
  delete copy[signatureField];
  return copy;
}

test("protocol constants describe postsnail suites and versions", () => {
  assert.equal(POSTSNAIL_PROTOCOL, "postsnail");
  assert.equal(POSTSNAIL_PROTOCOL_VERSION, 1);
  assert.equal(CURRENT_MANIFEST_VERSION, 1);
  assert.equal(CURRENT_IDENTITY_VERSION, 1);
  assert.equal(CURRENT_COMMIT_VERSION, 1);
  assert.equal(MANIFEST_VERSION, 1);
  assert.equal(IDENTITY_VERSION, 1);
  assert.equal(COMMIT_VERSION, 1);
  assert.deepEqual(REQUIRED_CORE_FEATURES, ["signed-manifest", "file-hashes"]);
  assert.equal(SIGNATURE_SUITE, "ML-DSA-65");
  assert.equal(DIGEST_SUITE, "SHA3-512");
  assert.equal(FINGERPRINT_SUITE, "psn1-sha3-512");
});

test("buildStaticExport emits signed identity, discovery metadata, sitemap, commit history, and announce payload", async () => {
  const keys = generateSigningKeyPair();
  const previousCommit = {
    type: "postsnail-commit",
    protocol: POSTSNAIL_PROTOCOL,
    commitVersion: COMMIT_VERSION,
    sequence: 1,
    previousCommit: null,
    manifestHash: "old-manifest",
    bundleFingerprint: "old-bundle",
    createdAt: "2026-06-04T00:00:00.000Z",
    summary: { siteTitle: "Old", postCount: 1, fileCount: 1 },
    publicKey: "old-key",
    signatureSuite: SIGNATURE_SUITE,
    signature: "old-signature",
  };
  const previousCommitHash = sha3Hex(encodeText(canonicalJson(previousCommit)));
  const post = normalizePost({
    id: "p1",
    title: "Protocol Ready",
    body: "Signed identity and commit history.",
    tags: ["Protocol", "Signed"],
    status: "published",
    createdAt: "2026-06-05T00:00:00.000Z",
  });

  const result = await buildStaticExport({
    profile: {
      siteTitle: "Protocol Feed",
      description: "A protocol-ready signed microblog.",
      handle: "protocol-feed",
      siteUrl: "https://creator.example",
      about: "About protocol feed.",
    },
    settings: {
      language: "en",
      topics: "protocol, microblog, signed",
      preferredTrackers: "https://tracker.example/announce\nhttps://tracker.example/announce\nhttp://tracker.example/bad",
      indexingPolicy: "allow",
    },
    commitHistory: [previousCommit],
    posts: [post],
    assets: [],
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
    generatedAt: "2026-06-05T00:00:00.000Z",
  });

  const files = unzipSync(result.zipBytes);
  assert.ok(files["sitemap.xml"]);
  assert.ok(files[".surgeignore"]);
  assert.ok(files[".well-known/postsnail.json"]);
  assert.ok(files[".well-known/postsnail/latest-commit.json"]);
  assert.ok(files[".well-known/postsnail/commits.json"]);
  const surgeIgnore = decodeText(files[".surgeignore"]);
  assert.match(surgeIgnore, /\*\.postsnail/);
  assert.match(surgeIgnore, /\*\.txt/);
  assert.match(surgeIgnore, /!\.well-known\/\*\*/);

  const wellKnown = JSON.parse(decodeText(files[".well-known/postsnail.json"]));
  assert.equal(wellKnown.protocol, POSTSNAIL_PROTOCOL);
  assert.equal(wellKnown.version, POSTSNAIL_PROTOCOL_VERSION);
  assert.deepEqual(wellKnown.requiredFeatures, REQUIRED_CORE_FEATURES);
  assert.equal(wellKnown.type, "postsnail-identity");
  assert.equal(wellKnown.identityVersion, IDENTITY_VERSION);
  assert.equal(wellKnown.domain, "creator.example");
  assert.equal(wellKnown.canonicalUrl, "https://creator.example/");
  assert.equal(wellKnown.manifestUrl, "https://creator.example/postsnail.manifest.json");
  assert.equal(wellKnown.latestCommitUrl, "https://creator.example/.well-known/postsnail/latest-commit.json");
  assert.deepEqual(wellKnown.preferredTrackers, ["https://tracker.example/announce"]);
  assert.equal(
    verifyBytes(encodeText(canonicalJson(unsigned(wellKnown, "identitySignature"))), textToBytes(wellKnown.identitySignature), keys.publicKey),
    true,
  );

  const manifest = JSON.parse(decodeText(files["postsnail.manifest.json"]));
  assert.equal(manifest.protocol, POSTSNAIL_PROTOCOL);
  assert.equal(manifest.version, POSTSNAIL_PROTOCOL_VERSION);
  assert.equal(manifest.manifestVersion, MANIFEST_VERSION);
  assert.deepEqual(manifest.requiredFeatures, REQUIRED_CORE_FEATURES);
  assert.equal(manifest.discovery.canonicalManifestUrl, "https://creator.example/postsnail.manifest.json");
  assert.equal(manifest.discovery.wellKnownUrl, "https://creator.example/.well-known/postsnail.json");
  assert.equal(manifest.discovery.sitemapUrl, "https://creator.example/sitemap.xml");
  assert.deepEqual(manifest.discovery.topics, ["microblog", "protocol", "signed"]);
  assert.deepEqual(manifest.discovery.preferredTrackers, ["https://tracker.example/announce"]);
  assert.equal(manifest.files[".surgeignore"], undefined);

  const sitemap = decodeText(files["sitemap.xml"]);
  assert.match(sitemap, /<loc>https:\/\/creator\.example\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/creator\.example\/posts\/protocol-ready\/<\/loc>/);
  assert.match(decodeText(files["posts/protocol-ready/index.html"]), /<script type="application\/ld\+json">/);
  assert.match(decodeText(files["posts/protocol-ready/index.html"]), /property="article:published_time"/);

  const latestCommit = JSON.parse(decodeText(files[".well-known/postsnail/latest-commit.json"]));
  assert.equal(latestCommit.protocol, POSTSNAIL_PROTOCOL);
  assert.equal(latestCommit.version, POSTSNAIL_PROTOCOL_VERSION);
  assert.equal(latestCommit.commitVersion, COMMIT_VERSION);
  assert.deepEqual(latestCommit.requiredFeatures, REQUIRED_CORE_FEATURES);
  assert.equal(latestCommit.sequence, 2);
  assert.equal(latestCommit.previousCommit, previousCommitHash);
  assert.equal(latestCommit.manifestHash, sha3Hex(encodeText(canonicalJson(manifest))));
  assert.equal(latestCommit.bundleFingerprint, manifest.bundleFingerprint);
  assert.equal(
    verifyBytes(encodeText(canonicalJson(unsigned(latestCommit, "signature"))), textToBytes(latestCommit.signature), keys.publicKey),
    true,
  );

  const commits = JSON.parse(decodeText(files[".well-known/postsnail/commits.json"]));
  assert.equal(commits.protocol, POSTSNAIL_PROTOCOL);
  assert.equal(commits.commits.length, 2);
  assert.deepEqual(result.commitHistory, commits.commits);

  assert.equal(result.announcePayload.type, "postsnail-announce");
  assert.equal(result.announcePayload.protocol, POSTSNAIL_PROTOCOL);
  assert.equal(result.announcePayload.version, POSTSNAIL_PROTOCOL_VERSION);
  assert.deepEqual(result.announcePayload.requiredFeatures, REQUIRED_CORE_FEATURES);
  assert.equal(result.announcePayload.siteUrl, "https://creator.example/");
  assert.equal(result.announcePayload.manifestUrl, "https://creator.example/postsnail.manifest.json");
  assert.equal(
    verifyBytes(encodeText(canonicalJson(unsigned(result.announcePayload, "signature"))), textToBytes(result.announcePayload.signature), keys.publicKey),
    true,
  );
});

test("commit verification rejects mismatched manifest hash and signatures", async () => {
  const keys = generateSigningKeyPair();
  const payload = {
    type: "postsnail-commit",
    protocol: POSTSNAIL_PROTOCOL,
    commitVersion: COMMIT_VERSION,
    sequence: 1,
    previousCommit: null,
    manifestHash: "abc",
    bundleFingerprint: "psn1-sha3-512-abc",
    createdAt: "2026-06-05T00:00:00.000Z",
    summary: { siteTitle: "Test", postCount: 1, fileCount: 1 },
    publicKey: `base64:${Buffer.from(keys.publicKey).toString("base64")}`,
    signatureSuite: SIGNATURE_SUITE,
  };
  const commit = {
    ...payload,
    signature: `base64:${Buffer.from(signBytes(encodeText(canonicalJson(payload)), keys.secretKey)).toString("base64")}`,
  };
  const { verifyCommitRecord } = await import("../src/proof-documents.js");

  assert.equal(verifyCommitRecord(commit, { publicKey: payload.publicKey, manifestHash: "abc", bundleFingerprint: "psn1-sha3-512-abc" }).ok, true);
  assert.equal(verifyCommitRecord({ ...commit, manifestHash: "changed" }, { publicKey: payload.publicKey, manifestHash: "abc", bundleFingerprint: "psn1-sha3-512-abc" }).ok, false);
  assert.equal(verifyCommitRecord({ ...commit, signature: commit.signature.replace(/.$/u, "A") }, { publicKey: payload.publicKey, manifestHash: "abc", bundleFingerprint: "psn1-sha3-512-abc" }).ok, false);

  const { verifyCommitLog } = await import("../src/proof-documents.js");
  assert.equal(verifyCommitLog([{ ...commit, sequence: 2 }], { publicKey: payload.publicKey, manifestHash: "abc", bundleFingerprint: "psn1-sha3-512-abc" }).ok, false);
});
