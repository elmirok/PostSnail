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
      "assets/postsnail-brand/postsnail-icon.png",
      "assets/postsnail-brand/postsnail-logo.png",
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
  assert.match(indexHtml, /Powered by PostSnail/);
  assert.match(indexHtml, /src="assets\/postsnail-brand\/postsnail-logo\.png"/);
  assert.match(postHtml, /src="\.\.\/\.\.\/assets\/postsnail-brand\/postsnail-logo\.png"/);
  assert.doesNotMatch(indexHtml, /Tracked by/);
  assert.equal(Boolean(files["trackers/index.html"]), false);
  assert.match(indexHtml, /href="posts\/hello-postsnail\/"/);
  assert.match(tagHtml, /href="..\/..\/posts\/hello-postsnail\/"/);
  assert.match(tagHtml, /href="..\/..\/tags\/intro\/"/);
  for (const html of [indexHtml, postHtml, tagHtml]) {
    assert.doesNotMatch(html, /© 2026 Boaz Alhadeff/);
    assert.doesNotMatch(html, /PostSnail is Apache-2\.0 licensed/);
    assert.doesNotMatch(html, /NOTICE attribution/);
  }
});

test("buildStaticExport renders tracker credit page and honors attribution opt-outs", async () => {
  const keys = generateSigningKeyPair();
  const post = normalizePost({
    id: "p1",
    title: "Tracked Post",
    body: "A public post for trackers.",
    status: "published",
    createdAt: "2026-06-05T00:00:00.000Z",
  });

  const enabled = await buildStaticExport({
    profile: { siteTitle: "Tracked Site", handle: "tracked", siteUrl: "https://creator.example" },
    posts: [post],
    assets: [],
    settings: {
      preferredTrackers: "https://forest.postsnail.org\nhttps://tracker.example/announce\nhttp://bad.example",
    },
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
    generatedAt: "2026-06-05T00:00:00.000Z",
  });

  const enabledFiles = unzipSync(enabled.zipBytes);
  const homeHtml = decodeText(enabledFiles["index.html"]);
  const postHtml = decodeText(enabledFiles["posts/tracked-post/index.html"]);
  const trackersHtml = decodeText(enabledFiles["trackers/index.html"]);
  assert.match(homeHtml, /Powered by PostSnail/);
  assert.match(homeHtml, /href="trackers\/"/);
  assert.match(homeHtml, /Tracked by/);
  assert.match(postHtml, /href="\.\.\/\.\.\/trackers\/"/);
  assert.match(trackersHtml, /Tracker credits/);
  assert.match(trackersHtml, /href="https:\/\/forest\.postsnail\.org\/" rel="noopener noreferrer"/);
  assert.match(trackersHtml, /href="https:\/\/tracker\.example\/announce" rel="noopener noreferrer"/);
  assert.doesNotMatch(trackersHtml, /bad\.example/);
  assert.ok(enabledFiles["assets/postsnail-brand/postsnail-logo.png"]);
  assert.ok(enabledFiles["assets/postsnail-brand/postsnail-icon.png"]);

  const poweredOff = await buildStaticExport({
    profile: { siteTitle: "Tracked Site", handle: "tracked", siteUrl: "https://creator.example" },
    posts: [post],
    assets: [],
    settings: {
      preferredTrackers: "https://forest.postsnail.org",
      showPoweredBy: false,
    },
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
    generatedAt: "2026-06-05T00:00:00.000Z",
  });
  const poweredOffFiles = unzipSync(poweredOff.zipBytes);
  const poweredOffHome = decodeText(poweredOffFiles["index.html"]);
  assert.doesNotMatch(poweredOffHome, /Powered by PostSnail/);
  assert.match(poweredOffHome, /Tracked by/);
  assert.equal(Boolean(poweredOffFiles["assets/postsnail-brand/postsnail-logo.png"]), false);
  assert.equal(Boolean(poweredOffFiles["assets/postsnail-brand/postsnail-icon.png"]), false);

  const trackerOff = await buildStaticExport({
    profile: { siteTitle: "Tracked Site", handle: "tracked", siteUrl: "https://creator.example" },
    posts: [post],
    assets: [],
    settings: {
      preferredTrackers: "https://forest.postsnail.org",
      showTrackerCredit: false,
    },
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
    generatedAt: "2026-06-05T00:00:00.000Z",
  });
  const trackerOffFiles = unzipSync(trackerOff.zipBytes);
  const trackerOffHome = decodeText(trackerOffFiles["index.html"]);
  assert.match(trackerOffHome, /Powered by PostSnail/);
  assert.doesNotMatch(trackerOffHome, /Tracked by/);
  assert.equal(Boolean(trackerOffFiles["trackers/index.html"]), false);
});

test("buildStaticExport keeps workspace-only data out of the public ZIP", async () => {
  const keys = generateSigningKeyPair();
  const published = normalizePost({
    id: "p1",
    title: "Public Post",
    body: "Public published body.",
    status: "published",
    createdAt: "2026-06-05T00:00:00.000Z",
  });
  const draft = normalizePost({
    id: "d1",
    title: "Private Draft",
    body: "Private draft body must not ship.",
    status: "draft",
    createdAt: "2026-06-05T00:00:00.000Z",
  });

  const result = await buildStaticExport({
    profile: { siteTitle: "Privacy Test", handle: "privacy", siteUrl: "https://example.com" },
    posts: [published, draft],
    assets: [],
    settings: {
      language: "en",
      pluginState: { token: "plugin-private-token" },
      rejectedComments: [{ body: "Rejected private moderation note" }],
      encryptedWorkspace: "postsnail-workspace",
    },
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
    generatedAt: "2026-06-05T00:00:00.000Z",
  });

  const files = unzipSync(result.zipBytes);
  const combined = Object.entries(files)
    .map(([name, bytes]) => `${name}\n${decodeText(bytes)}`)
    .join("\n");

  assert.doesNotMatch(combined, /Private draft body must not ship/);
  assert.doesNotMatch(combined, /plugin-private-token/);
  assert.doesNotMatch(combined, /Rejected private moderation note/);
  assert.doesNotMatch(combined, /postsnail-workspace/);
  assert.doesNotMatch(combined, /\.postsnail/);
  assert.doesNotMatch(combined, /encryptedSecretKey|secretKey|privateKey|rawPrivateKey/);
  assert.equal(Object.keys(files).some((name) => name.endsWith(".postsnail")), false);
});
