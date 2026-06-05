import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync } from "../vendor/fflate/browser.js";

import { decodeText } from "../src/bytes.js";
import { buildStaticExport } from "../src/exporter.js";
import { generateSigningKeyPair } from "../src/crypto.js";
import { normalizePost } from "../src/content.js";

test("buildStaticExport creates the expected signed static bundle", async () => {
  const keys = generateSigningKeyPair();
  const post = normalizePost({
    id: "p1",
    title: "Hello PostSnail",
    body: "A local-first post.",
    tags: ["intro", "signed"],
    status: "published",
    createdAt: "2026-06-05T00:00:00.000Z",
  });

  const result = await buildStaticExport({
    profile: {
      siteTitle: "PostSnail Test",
      description: "A signed microblog.",
      handle: "tester",
      siteUrl: "https://example.com",
      about: "About this site.",
    },
    posts: [post],
    assets: [],
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
    generatedAt: "2026-06-05T00:00:00.000Z",
  });

  const files = unzipSync(result.zipBytes);
  const names = Object.keys(files).sort();

  assert.deepEqual(
    [
      ".well-known/postsnail.json",
      "about/index.html",
      "archive/index.html",
      "feed.json",
      "index.html",
      "posts/hello-postsnail/index.html",
      "postsnail.manifest.json",
      "rss.xml",
      "tags/intro/index.html",
      "tags/signed/index.html",
    ],
    names,
  );

  const manifest = JSON.parse(decodeText(files["postsnail.manifest.json"]));
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.algorithm.signature, "ML-DSA-65");
  assert.equal(manifest.algorithm.digest, "SHA3-512");
  assert.equal(manifest.posts[0].slug, "hello-postsnail");
  assert.equal(manifest.posts[0].record.body, "A local-first post.");
  assert.equal(manifest.posts[0].signature.startsWith("base64:"), true);
  assert.equal(manifest.bundleFingerprint.startsWith("psn1-sha3-512-"), true);
  assert.equal(result.filename, "postsnail-postsnail-test.zip");
});
