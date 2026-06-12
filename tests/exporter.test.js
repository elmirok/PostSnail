import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync } from "../vendor/fflate/browser.js";

import { decodeText } from "../src/bytes.js";
import { buildStaticExport } from "../src/exporter.js";
import { generateSigningKeyPair, publicKeyToText } from "../src/crypto.js";
import { normalizePost } from "../src/content.js";
import { enablePlugin, installPlugin } from "../src/core/plugins/pluginRegistry.js";
import { signCommentPacket } from "../src/comments/plugin.js";
import {
  POSTSNAIL_COMMENTS_PLUGIN_ID,
  getOfficialPluginManifest,
  POSTSNAIL_PAGES_PLUGIN_ID,
  POSTSNAIL_SNAILLIFT_PLUGIN_ID,
} from "../src/core/plugins/officialCatalog.js";

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
  const expectedNames = [
    ".well-known/postsnail.json",
    ".well-known/postsnail/commits.json",
    ".well-known/postsnail/latest-commit.json",
    "_headers",
    "CORS",
    "about/index.html",
    "archive/index.html",
    "assets/postsnail-brand/postsnail-icon.png",
    "assets/postsnail-brand/postsnail-logo.png",
    "assets/tiny-proof.png",
    "feed.json",
    "index.html",
    "netlify.toml",
    "posts/hello-postsnail/index.html",
    "postsnail.manifest.json",
    "rss.xml",
    "sitemap.xml",
    "tags/intro/index.html",
    "tags/signed/index.html",
  ];

  assert.equal(names.length, expectedNames.length);
  for (const name of expectedNames) {
    assert.ok(names.includes(name), `expected ZIP to include ${name}`);
  }

  const manifest = JSON.parse(decodeText(files["postsnail.manifest.json"]));
  assert.ok(result.files["index.html"]);
  assert.ok(result.files["postsnail.manifest.json"]);
  assert.deepEqual(Object.keys(result.files).sort(), names);
  assert.deepEqual(result.fileDigests, manifest.files);
  assert.equal(result.bundleFingerprint, manifest.bundleFingerprint);
  assert.equal(result.exportSafety.ok, true);
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

test("buildStaticExport includes configured ShellName metadata as an optional public extension", async () => {
  const keys = generateSigningKeyPair();
  const post = normalizePost({
    id: "p1",
    title: "Named Shell",
    body: "A public post for a named shell.",
    status: "published",
    createdAt: "2026-06-05T00:00:00.000Z",
  });

  const shellNames = [
    {
      forest: "forest.postsnail.org",
      name: "named",
      fullName: "@named@forest.postsnail.org",
      record: {
        protocol: "postsnail-shellname",
        version: 1,
        name: "named",
        fullName: "@named@forest.postsnail.org",
        siteUrl: "https://named.example/",
        publicKey: "base64:placeholder",
        signature: "base64:signature",
        extensions: { unknownOptional: true },
      },
    },
  ];

  const result = await buildStaticExport({
    profile: { siteTitle: "Named Site", handle: "named", siteUrl: "https://named.example" },
    posts: [post],
    shellNames,
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
    generatedAt: "2026-06-05T00:00:00.000Z",
  });
  const files = unzipSync(result.zipBytes);
  const manifest = JSON.parse(decodeText(files["postsnail.manifest.json"]));
  const wellKnown = JSON.parse(decodeText(files[".well-known/postsnail.json"]));

  assert.deepEqual(manifest.shellNames, shellNames);
  assert.deepEqual(wellKnown.shellNames, shellNames);
  assert.ok(manifest.optionalFeatures.includes("shellnames"));
  assert.ok(wellKnown.optionalFeatures.includes("shellnames"));
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

test("buildStaticExport does not publish SnailLift settings or private plugin state", async () => {
  const keys = generateSigningKeyPair();
  const published = normalizePost({
    id: "p1",
    title: "SnailLift Privacy",
    body: "Public post body.",
    status: "published",
    createdAt: "2026-06-05T00:00:00.000Z",
  });
  const plugins = enablePlugin(
    installPlugin(
      {
        installed: [],
        lock: {},
        state: {
          [POSTSNAIL_SNAILLIFT_PLUGIN_ID]: {
            schemaVersion: 1,
            provider: "surge",
            surgeLogin: "boaz@example.com",
            surgeToken: "private-provider-token",
          },
        },
      },
      getOfficialPluginManifest(POSTSNAIL_SNAILLIFT_PLUGIN_ID),
    ),
    POSTSNAIL_SNAILLIFT_PLUGIN_ID,
  );

  const result = await buildStaticExport({
    profile: { siteTitle: "SnailLift Privacy", handle: "privacy", siteUrl: "https://example.com" },
    posts: [published],
    assets: [],
    settings: {
      snailLiftSurgeSiteUrl: "https://creator.example/",
      snailLiftSurgeDomain: "creator.surge.sh",
      snailLiftSurgeProjectDir: "postsnail-public",
      snailLiftSurgeLogin: "boaz@example.com",
      snailLiftSurgeToken: "private-surge-token",
    },
    plugins,
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
    generatedAt: "2026-06-05T00:00:00.000Z",
  });

  const files = unzipSync(result.zipBytes);
  const combined = Object.entries(files)
    .map(([name, bytes]) => `${name}\n${decodeText(bytes)}`)
    .join("\n");
  const manifest = JSON.parse(decodeText(files["postsnail.manifest.json"]));

  assert.equal(manifest.extensions.plugins[POSTSNAIL_SNAILLIFT_PLUGIN_ID].version, "0.1.0");
  assert.deepEqual(manifest.extensions.plugins[POSTSNAIL_SNAILLIFT_PLUGIN_ID].publicFiles, []);
  assert.doesNotMatch(combined, /private-provider-token/);
  assert.doesNotMatch(combined, /private-surge-token/);
  assert.doesNotMatch(combined, /creator\.surge\.sh/);
});

test("buildStaticExport publishes Pages routes and moves blog index when homepage is overridden", async () => {
  const keys = generateSigningKeyPair();
  const post = normalizePost({
    id: "p1",
    title: "Blog Note",
    body: "The blog feed moved.",
    status: "published",
    createdAt: "2026-06-05T00:00:00.000Z",
  });
  const plugins = enablePlugin(
    installPlugin(
      {
        installed: [],
        lock: {},
        state: {
          [POSTSNAIL_PAGES_PLUGIN_ID]: {
            schemaVersion: 1,
            pages: [
              {
                id: "home",
                title: "Custom Home",
                path: "/",
                status: "published",
                body: "Welcome to the Pages homepage.",
                seo: { description: "Custom home description." },
              },
              {
                id: "private-page",
                title: "Private Page",
                path: "/private/",
                status: "draft",
                body: "Draft page body must stay private.",
              },
            ],
            docs: [
              {
                id: "protocol",
                title: "Protocol",
                slug: "protocol",
                status: "published",
                body: "Protocol docs are public.",
                seo: { description: "Protocol docs description." },
              },
              {
                id: "private-doc",
                title: "Private Doc",
                slug: "private-doc",
                status: "archived",
                body: "Archived doc body must stay private.",
              },
            ],
            navigation: [
              { label: "Home", url: "/" },
              { label: "Docs", url: "/docs/" },
              { label: "Blog", url: "/blog/" },
            ],
            settings: { blogIndexPath: "/blog/" },
            privateNote: "private-pages-state",
          },
        },
      },
      getOfficialPluginManifest(POSTSNAIL_PAGES_PLUGIN_ID),
    ),
    POSTSNAIL_PAGES_PLUGIN_ID,
  );

  const result = await buildStaticExport({
    profile: { siteTitle: "Pages Site", handle: "pages", siteUrl: "https://pages.example" },
    posts: [post],
    plugins,
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
    generatedAt: "2026-06-05T00:00:00.000Z",
  });
  const files = unzipSync(result.zipBytes);
  const names = Object.keys(files).sort();
  const homeHtml = decodeText(files["index.html"]);
  const blogHtml = decodeText(files["blog/index.html"]);
  const docsIndexHtml = decodeText(files["docs/index.html"]);
  const docHtml = decodeText(files["docs/protocol/index.html"]);
  const sitemap = decodeText(files["sitemap.xml"]);
  const manifest = JSON.parse(decodeText(files["postsnail.manifest.json"]));
  const combined = Object.values(files).map(decodeText).join("\n");

  assert.ok(names.includes("index.html"));
  assert.ok(names.includes("blog/index.html"));
  assert.ok(names.includes("docs/index.html"));
  assert.ok(names.includes("docs/protocol/index.html"));
  assert.match(homeHtml, /Custom Home/);
  assert.match(homeHtml, /Welcome to the Pages homepage/);
  assert.doesNotMatch(homeHtml, /Blog Note/);
  assert.match(blogHtml, /Blog Note/);
  assert.match(docsIndexHtml, /Protocol/);
  assert.match(docHtml, /Protocol docs are public/);
  assert.match(sitemap, /https:\/\/pages\.example\//);
  assert.match(sitemap, /https:\/\/pages\.example\/blog\//);
  assert.match(sitemap, /https:\/\/pages\.example\/docs\/protocol\//);
  assert.deepEqual(manifest.extensions.plugins[POSTSNAIL_PAGES_PLUGIN_ID], {
    version: "0.1.0",
    publicFiles: [],
    contentTypes: ["page", "doc"],
    routes: ["/", "/docs/", "/docs/protocol/"],
  });
  assert.doesNotMatch(combined, /Draft page body/);
  assert.doesNotMatch(combined, /Archived doc body/);
  assert.doesNotMatch(combined, /private-pages-state/);
});

test("buildStaticExport publishes approved comments runtime without rejected moderation state", async () => {
  const keys = generateSigningKeyPair();
  const commenterKeys = generateSigningKeyPair();
  const post = normalizePost({
    id: "p1",
    title: "Commented Post",
    body: "A public post with approved replies.",
    status: "published",
    createdAt: "2026-06-05T00:00:00.000Z",
  });
  const plugins = enablePlugin(
    installPlugin(
      {
        installed: [],
        lock: {},
        state: {
          [POSTSNAIL_COMMENTS_PLUGIN_ID]: {
            schemaVersion: 1,
            trackerUrls: ["https://comments.example"],
          },
        },
      },
      getOfficialPluginManifest(POSTSNAIL_COMMENTS_PLUGIN_ID),
    ),
    POSTSNAIL_COMMENTS_PLUGIN_ID,
  );

  const proofSeed = await buildStaticExport({
    profile: { siteTitle: "Comments Site", handle: "comments", siteUrl: "https://comments.example" },
    posts: [post],
    plugins,
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
    generatedAt: "2026-06-05T04:00:00.000Z",
  });
  const postDigest = proofSeed.manifest.posts[0].digest;
  const sitePublicKey = publicKeyToText(keys.publicKey);

  const approvedComment = signCommentPacket({
    protocol: "postsnail-comment-v1",
    version: 1,
    type: "postsnail_comment",
    target: {
      sitePublicKey,
      postSlug: "commented-post",
      postDigest,
      bundleFingerprint: "psn1-sha3-512-old",
    },
    author: {
      displayName: "Reader One",
      handle: "reader-one",
      siteUrl: "https://reader.example/",
      shellName: "@reader@forest.postsnail.org",
      publicKey: publicKeyToText(commenterKeys.publicKey),
    },
    content: {
      format: "markdown",
      body: "Approved static reply.",
    },
    createdAt: "2026-06-05T01:00:00.000Z",
    parentCommentId: "",
    requiredFeatures: ["signed-comment"],
    optionalFeatures: [],
    extensions: {},
    signatureSuite: "ML-DSA-65",
    digestSuite: "SHA3-512",
  }, commenterKeys.secretKey);

  const result = await buildStaticExport({
    profile: { siteTitle: "Comments Site", handle: "comments", siteUrl: "https://comments.example" },
    posts: [post],
    plugins,
    moderation: {
      approvedComments: [
        {
          comment: approvedComment,
          approvedAt: "2026-06-05T02:00:00.000Z",
          source: "manual-review",
        },
      ],
      rejectedComments: [
        {
          comment: {
            ...approvedComment,
            content: { format: "markdown", body: "Rejected private moderation note." },
          },
          rejectedAt: "2026-06-05T03:00:00.000Z",
          moderationNote: "private moderation note",
        },
      ],
      blockedPublicKeys: ["base64:blocked-reader"],
    },
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
    generatedAt: "2026-06-05T04:00:00.000Z",
  });

  const files = unzipSync(result.zipBytes);
  const postHtml = decodeText(files["posts/commented-post/index.html"]);
  const approvedJson = JSON.parse(decodeText(files["plugins/postsnail-comments/approved-comments.json"]));
  const pluginManifest = JSON.parse(decodeText(files["plugins/postsnail-comments/plugin-manifest.json"]));
  const combined = Object.entries(files)
    .map(([name, bytes]) => `${name}\n${decodeText(bytes)}`)
    .join("\n");
  const manifest = JSON.parse(decodeText(files["postsnail.manifest.json"]));

  assert.ok(files["plugins/postsnail-comments/runtime/comments.js"]);
  assert.ok(files["plugins/postsnail-comments/runtime/comments.css"]);
  assert.ok(files["plugins/postsnail-comments/approved-comments.json"]);
  assert.ok(files["plugins/postsnail-comments/plugin-manifest.json"]);
  assert.match(postHtml, /id="postsnail-comments"/);
  assert.match(postHtml, /postsnail:comments-enabled/);
  assert.match(postHtml, /postsnail:post-slug/);
  assert.match(postHtml, /postsnail:site-public-key/);
  assert.match(postHtml, /plugins\/postsnail-comments\/runtime\/comments\.js/);
  assert.match(postHtml, /plugins\/postsnail-comments\/runtime\/comments\.css/);
  assert.equal(approvedJson.protocol, "postsnail-comments-static-v1");
  assert.equal(approvedJson.comments.length, 1);
  assert.equal(approvedJson.comments[0].comment.content.body, "Approved static reply.");
  assert.equal(pluginManifest.id, "postsnail-comments");
  assert.equal(manifest.extensions.plugins[POSTSNAIL_COMMENTS_PLUGIN_ID].version, "0.1.0");
  assert.ok(manifest.optionalFeatures.includes("comments"));
  assert.deepEqual(manifest.extensions.routeAssets["/posts/commented-post/"].plugins, ["postsnail-comments"]);
  assert.doesNotMatch(combined, /Rejected private moderation note/);
  assert.doesNotMatch(combined, /private moderation note/);
  assert.doesNotMatch(combined, /base64:blocked-reader/);
});
