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
    imageIds: ["image-1"],
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
    assets: [
      {
        id: "image-1",
        name: "Tiny Proof.png",
        type: "image/png",
        alt: "Tiny proof pixel",
        dataBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
        createdAt: "2026-06-05T00:00:00.000Z",
      },
    ],
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
    generatedAt: "2026-06-05T00:00:00.000Z",
  });

  const files = unzipSync(result.zipBytes);
  const names = Object.keys(files).sort();

  assert.deepEqual(
    [
      ".well-known/postsnail.json",
      ".well-known/postsnail/commits.json",
      ".well-known/postsnail/latest-commit.json",
      "about/index.html",
      "archive/index.html",
      "assets/tiny-proof.png",
      "feed.json",
      "index.html",
      "posts/hello-postsnail/index.html",
      "postsnail.manifest.json",
      "rss.xml",
      "sitemap.xml",
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
  assert.deepEqual(manifest.posts[0].record.imageFiles, ["tiny-proof.png"]);
  assert.equal(manifest.posts[0].signature.startsWith("base64:"), true);
  assert.equal(manifest.bundleFingerprint.startsWith("psn1-sha3-512-"), true);
  assert.equal(result.filename, "postsnail-postsnail-test.zip");

  const indexHtml = decodeText(files["index.html"]);
  const postHtml = decodeText(files["posts/hello-postsnail/index.html"]);
  const tagHtml = decodeText(files["tags/intro/index.html"]);
  assert.match(indexHtml, /src="assets\/tiny-proof\.png"/);
  assert.match(indexHtml, /href="posts\/hello-postsnail\/"/);
  assert.match(tagHtml, /href="..\/..\/posts\/hello-postsnail\/"/);
  assert.match(tagHtml, /href="..\/..\/tags\/intro\/"/);
  for (const html of [indexHtml, postHtml, tagHtml]) {
    assert.doesNotMatch(html, /© 2026 Boaz Alhadeff/);
    assert.doesNotMatch(html, /PostSnail is Apache-2\.0 licensed/);
    assert.doesNotMatch(html, /NOTICE attribution/);
  }
});
