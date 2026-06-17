import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { encryptSecretKey, generateSigningKeyPair, publicKeyToText } from "../src/crypto.js";
import { getCliCommandCatalog } from "../src/cli/catalog.js";
import { runCli } from "../src/cli/run.js";
import { exportWorkspaceVault, importWorkspaceVault } from "../src/workspace.js";

const cliPath = join(process.cwd(), "bin/postsnail.js");

test("postsnail --help prints top-level commands", () => {
  const output = execFileSync(process.execPath, [cliPath, "--help"], { encoding: "utf8" });

  for (const command of getCliCommandCatalog()) {
    assert.match(output, new RegExp(command.usage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(output, /postsnail menu|Command Center|TUI/);
});

test("postsnail workspace info opens an encrypted shell and prints summary", async () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "postsnail-cli-"));
  const workspacePath = join(fixtureDir, "fixture.postsnail");
  const exported = await exportWorkspaceVault({
    profile: { siteTitle: "CLI Fixture", handle: "cli-fixture" },
    posts: [{
      id: "p1",
      title: "Hello",
      slug: "hello",
      body: "CLI body",
      tags: [],
      status: "published",
      excerpt: "CLI body",
      imageIds: [],
      createdAt: "2026-06-07T00:00:00.000Z",
      updatedAt: "2026-06-07T00:00:00.000Z",
      publishedAt: "2026-06-07T00:00:00.000Z",
    }],
    assets: [],
    identity: {},
    settings: {},
    commitHistory: [],
    plugins: { installed: [], lock: {}, state: {} },
    moderation: { approvedComments: [], rejectedComments: [], blockedPublicKeys: [] },
    trackerUrls: [],
    shellNames: [],
    appearance: { frontendTheme: "quiet-feed", adminTheme: "default", themeSettings: {} },
    exportHistory: [],
  }, "correct horse battery staple");
  writeFileSync(workspacePath, exported.text);

  const output = execFileSync(
    process.execPath,
    [cliPath, "workspace", "info", "--workspace", workspacePath, "--passphrase", "correct horse battery staple"],
    { encoding: "utf8" },
  );

  assert.match(output, /CLI Fixture/);
  assert.match(output, /Published posts: 1/);
});

test("postsnail workspace create, profile set, and identity generate manage an encrypted shell", async () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "postsnail-cli-full-"));
  const workspacePath = join(fixtureDir, "created.postsnail");

  await captureCli([
    "workspace",
    "create",
    "--workspace",
    workspacePath,
    "--passphrase",
    "shell phrase",
    "--site-title",
    "CLI Created",
    "--handle",
    "cli-created",
    "--site-url",
    "https://cli-created.example/",
  ]);
  assert.equal(existsSync(workspacePath), true);

  await captureCli([
    "profile",
    "set",
    "--workspace",
    workspacePath,
    "--passphrase",
    "shell phrase",
    "--description",
    "A CLI managed Shell",
  ]);

  const identityOutput = await captureCli([
    "identity",
    "generate",
    "--workspace",
    workspacePath,
    "--passphrase",
    "shell phrase",
    "--identity-passphrase",
    "identity phrase",
  ]);
  assert.match(identityOutput, /Public key:/);

  const reopened = await importWorkspaceVault(readFileSync(workspacePath, "utf8"), "shell phrase");
  assert.equal(reopened.state.profile.siteTitle, "CLI Created");
  assert.equal(reopened.state.profile.description, "A CLI managed Shell");
  assert.equal(reopened.state.identity.algorithm, "ML-DSA-65");
  assert.match(reopened.state.identity.publicKey, /^base64:/);
});

test("postsnail plugin, post, page, asset, and comment commands mutate shell state without leaking secrets", async () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "postsnail-cli-content-"));
  const workspacePath = join(fixtureDir, "content.postsnail");
  const pagePath = join(fixtureDir, "page.md");
  const commentPath = join(fixtureDir, "comment.json");
  const keys = generateSigningKeyPair();
  const encryptedSecretKey = await encryptSecretKey(keys.secretKey, "identity phrase");
  const exported = await exportWorkspaceVault({
    profile: { siteTitle: "Content CLI", handle: "content-cli", siteUrl: "https://content.example/" },
    posts: [],
    assets: [{ id: "unused-image", filename: "unused.png", dataUrl: "data:image/png;base64,AAAA" }],
    identity: {
      algorithm: "ML-DSA-65",
      publicKey: publicKeyToText(keys.publicKey),
      encryptedSecretKey,
      createdAt: "2026-06-14T00:00:00.000Z",
    },
    plugins: { installed: [], lock: {}, state: { unknownPlugin: { preserved: true } } },
    moderation: { approvedComments: [], rejectedComments: [], blockedPublicKeys: [] },
  }, "shell phrase");
  writeFileSync(workspacePath, exported.text);
  writeFileSync(pagePath, [
    "---",
    "title: CLI Page",
    "path: /cli-page/",
    "status: published",
    "---",
    "Page body from the CLI.",
    "",
  ].join("\n"));
  writeFileSync(commentPath, JSON.stringify({
    protocol: "postsnail-comment-v1",
    version: 1,
    type: "postsnail_comment",
    requiredFeatures: ["signed-comment"],
    optionalFeatures: [],
    extensions: {},
    target: {
      sitePublicKey: publicKeyToText(keys.publicKey),
      postSlug: "missing",
      postDigest: "sha3-512:none",
    },
    author: { publicKey: publicKeyToText(keys.publicKey), displayName: "CLI Reader" },
    content: { body: "Hello from comments." },
    createdAt: "2026-06-14T00:00:00.000Z",
    commentId: "bad",
    signature: "base64:bad",
  }, null, 2));

  await captureCli(["plugin", "enable", "postsnail-pages", "--workspace", workspacePath, "--passphrase", "shell phrase"]);
  await captureCli(["post", "new", "--workspace", workspacePath, "--passphrase", "shell phrase", "--title", "CLI Post", "--slug", "cli-post", "--body", "CLI body", "--status", "published", "--tags", "cli,test"]);
  await captureCli(["post", "status", "--workspace", workspacePath, "--passphrase", "shell phrase", "--slug", "cli-post", "--status", "draft"]);
  await captureCli(["page", "import", pagePath, "--workspace", workspacePath, "--passphrase", "shell phrase"]);
  const unusedOutput = await captureCli(["asset", "delete-unused", "--workspace", workspacePath, "--passphrase", "shell phrase"]);
  assert.match(unusedOutput, /Removed unused assets: 1/);
  const commentOutput = await captureCli(["comment", "verify", commentPath]);
  assert.match(commentOutput, /Comment verification failed/);
  await captureCli(["comment", "block-key", "--workspace", workspacePath, "--passphrase", "shell phrase", "--public-key", publicKeyToText(keys.publicKey)]);

  const reopened = await importWorkspaceVault(readFileSync(workspacePath, "utf8"), "shell phrase");
  assert.deepEqual(reopened.state.plugins.state.unknownPlugin, { preserved: true });
  assert.equal(reopened.state.plugins.installed.some((entry) => entry.id === "postsnail-pages" && entry.enabled), true);
  assert.equal(reopened.state.posts[0].slug, "cli-post");
  assert.equal(reopened.state.posts[0].status, "draft");
  assert.equal(reopened.state.plugins.state["postsnail-pages"].pages[0].path, "/cli-page/");
  assert.equal(reopened.state.assets.length, 0);
  assert.deepEqual(reopened.state.moderation.blockedPublicKeys, [publicKeyToText(keys.publicKey)]);
});

test("postsnail rejects unknown commands", () => {
  assert.throws(
    () => execFileSync(process.execPath, [cliPath, "bogus"], { encoding: "utf8" }),
    /Unknown command/,
  );
});

test("postsnail workspace info fails safely on wrong passphrase", async () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "postsnail-cli-"));
  const workspacePath = join(fixtureDir, "fixture.postsnail");
  const exported = await exportWorkspaceVault({ profile: { siteTitle: "CLI Fixture" } }, "correct horse battery staple");
  writeFileSync(workspacePath, exported.text);

  assert.throws(
    () => execFileSync(
      process.execPath,
      [cliPath, "workspace", "info", "--workspace", workspacePath, "--passphrase", "wrong passphrase"],
      { encoding: "utf8" },
    ),
    /Unable to decrypt workspace/,
  );
});

test("postsnail post import creates or updates a post by slug from frontmatter markdown", async () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "postsnail-cli-"));
  const workspacePath = join(fixtureDir, "fixture.postsnail");
  const draftPath = join(fixtureDir, "draft.md");
  const exported = await exportWorkspaceVault({
    profile: { siteTitle: "CLI Fixture" },
    posts: [],
  }, "correct horse battery staple");
  writeFileSync(workspacePath, exported.text);
  writeFileSync(
    draftPath,
    [
      "---",
      'title: "Forest Note"',
      'slug: "forest-note"',
      'excerpt: "The shell is the home."',
      "tags:",
      "  - forest",
      "  - notes",
      'status: "ready"',
      "---",
      "",
      "The shell is the home.",
      "",
    ].join("\n"),
  );

  execFileSync(
    process.execPath,
    [cliPath, "post", "import", draftPath, "--workspace", workspacePath, "--passphrase", "correct horse battery staple"],
    { encoding: "utf8" },
  );

  const reopened = await importWorkspaceVault(readFileSync(workspacePath, "utf8"), "correct horse battery staple");
  assert.equal(reopened.state.posts.length, 1);
  assert.equal(reopened.state.posts[0].slug, "forest-note");
  assert.equal(reopened.state.posts[0].status, "published");
  assert.deepEqual(reopened.state.posts[0].tags, ["forest", "notes"]);
  assert.equal(reopened.state.posts[0].body, "The shell is the home.");
});

test("postsnail build writes a public site directory and zip writes a publishable zip", async () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "postsnail-cli-"));
  const outDir = join(fixtureDir, "public");
  const zipPath = join(fixtureDir, "site.zip");
  const workspacePath = join(fixtureDir, "fixture.postsnail");
  const identityKeys = generateSigningKeyPair();
  const encryptedSecretKey = await encryptSecretKey(identityKeys.secretKey, "publisher phrase");
  const exported = await exportWorkspaceVault({
    profile: { siteTitle: "CLI Fixture", handle: "cli-fixture", siteUrl: "https://cli.example" },
    posts: [{
      id: "p1",
      title: "Hello",
      slug: "hello",
      body: "CLI body",
      tags: [],
      status: "published",
      excerpt: "CLI body",
      imageIds: [],
      createdAt: "2026-06-07T00:00:00.000Z",
      updatedAt: "2026-06-07T00:00:00.000Z",
      publishedAt: "2026-06-07T00:00:00.000Z",
    }],
    assets: [],
    identity: {
      algorithm: "ML-DSA-65",
      publicKey: publicKeyToText(identityKeys.publicKey),
      encryptedSecretKey,
      createdAt: "2026-06-07T00:00:00.000Z",
    },
    settings: {},
    commitHistory: [],
    plugins: { installed: [], lock: {}, state: {} },
    moderation: { approvedComments: [], rejectedComments: [], blockedPublicKeys: [] },
    trackerUrls: [],
    shellNames: [],
    appearance: { frontendTheme: "quiet-feed", adminTheme: "default", themeSettings: {} },
    exportHistory: [],
  }, "correct horse battery staple");
  writeFileSync(workspacePath, exported.text);

  execFileSync(process.execPath, [
    cliPath,
    "build",
    "--workspace",
    workspacePath,
    "--passphrase",
    "correct horse battery staple",
    "--identity-passphrase",
    "publisher phrase",
    "--out",
    outDir,
  ], { encoding: "utf8" });
  assert.equal(existsSync(join(outDir, "index.html")), true);
  assert.equal(existsSync(join(outDir, "postsnail.manifest.json")), true);

  const afterBuild = await importWorkspaceVault(readFileSync(workspacePath, "utf8"), "correct horse battery staple");
  assert.equal(afterBuild.state.commitHistory.length, 1);

  execFileSync(process.execPath, [
    cliPath,
    "zip",
    "--workspace",
    workspacePath,
    "--passphrase",
    "correct horse battery staple",
    "--identity-passphrase",
    "publisher phrase",
    "--out",
    zipPath,
  ], { encoding: "utf8" });
  assert.equal(existsSync(zipPath), true);
});

test("postsnail build fails safely when identity passphrase is missing", async () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "postsnail-cli-"));
  const outDir = join(fixtureDir, "public");
  const workspacePath = join(fixtureDir, "fixture.postsnail");
  const identityKeys = generateSigningKeyPair();
  const encryptedSecretKey = await encryptSecretKey(identityKeys.secretKey, "publisher phrase");
  const exported = await exportWorkspaceVault({
    profile: { siteTitle: "CLI Fixture", handle: "cli-fixture", siteUrl: "https://cli.example" },
    posts: [{
      id: "p1",
      title: "Hello",
      slug: "hello",
      body: "CLI body",
      tags: [],
      status: "published",
      excerpt: "CLI body",
      imageIds: [],
      createdAt: "2026-06-07T00:00:00.000Z",
      updatedAt: "2026-06-07T00:00:00.000Z",
      publishedAt: "2026-06-07T00:00:00.000Z",
    }],
    assets: [],
    identity: {
      algorithm: "ML-DSA-65",
      publicKey: publicKeyToText(identityKeys.publicKey),
      encryptedSecretKey,
      createdAt: "2026-06-07T00:00:00.000Z",
    },
    settings: {},
    commitHistory: [],
    plugins: { installed: [], lock: {}, state: {} },
    moderation: { approvedComments: [], rejectedComments: [], blockedPublicKeys: [] },
    trackerUrls: [],
    shellNames: [],
    appearance: { frontendTheme: "quiet-feed", adminTheme: "default", themeSettings: {} },
    exportHistory: [],
  }, "correct horse battery staple");
  writeFileSync(workspacePath, exported.text);

  assert.throws(
    () => execFileSync(process.execPath, [
      cliPath,
      "build",
      "--workspace",
      workspacePath,
      "--passphrase",
      "correct horse battery staple",
      "--out",
      outDir,
    ], { encoding: "utf8" }),
    /Identity passphrase is required/,
  );
});

test("postsnail verify passes valid output and fails tampered output", async () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "postsnail-cli-"));
  const outDir = join(fixtureDir, "public");
  const workspacePath = join(fixtureDir, "fixture.postsnail");
  const identityKeys = generateSigningKeyPair();
  const encryptedSecretKey = await encryptSecretKey(identityKeys.secretKey, "publisher phrase");
  const exported = await exportWorkspaceVault({
    profile: { siteTitle: "CLI Fixture", handle: "cli-fixture", siteUrl: "https://cli.example" },
    posts: [{
      id: "p1",
      title: "Hello",
      slug: "hello",
      body: "CLI body",
      tags: [],
      status: "published",
      excerpt: "CLI body",
      imageIds: [],
      createdAt: "2026-06-07T00:00:00.000Z",
      updatedAt: "2026-06-07T00:00:00.000Z",
      publishedAt: "2026-06-07T00:00:00.000Z",
    }],
    assets: [],
    identity: {
      algorithm: "ML-DSA-65",
      publicKey: publicKeyToText(identityKeys.publicKey),
      encryptedSecretKey,
      createdAt: "2026-06-07T00:00:00.000Z",
    },
    settings: {},
    commitHistory: [],
    plugins: { installed: [], lock: {}, state: {} },
    moderation: { approvedComments: [], rejectedComments: [], blockedPublicKeys: [] },
    trackerUrls: [],
    shellNames: [],
    appearance: { frontendTheme: "quiet-feed", adminTheme: "default", themeSettings: {} },
    exportHistory: [],
  }, "correct horse battery staple");
  writeFileSync(workspacePath, exported.text);

  execFileSync(process.execPath, [
    cliPath,
    "build",
    "--workspace",
    workspacePath,
    "--passphrase",
    "correct horse battery staple",
    "--identity-passphrase",
    "publisher phrase",
    "--out",
    outDir,
  ], { encoding: "utf8" });
  const good = execFileSync(process.execPath, [cliPath, "verify", outDir], { encoding: "utf8" });
  assert.match(good, /Verified/);

  writeFileSync(join(outDir, "postsnail.manifest.json"), "{}");
  assert.throws(
    () => execFileSync(process.execPath, [cliPath, "verify", outDir], { encoding: "utf8" }),
    /Verification failed/i,
  );
});

test("postsnail network commands use public signed records and never send private key material", async () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "postsnail-cli-network-"));
  const workspacePath = join(fixtureDir, "network.postsnail");
  const outDir = join(fixtureDir, "public");
  const zipPath = join(fixtureDir, "site.zip");
  const keys = generateSigningKeyPair();
  const encryptedSecretKey = await encryptSecretKey(keys.secretKey, "identity phrase");
  const exported = await exportWorkspaceVault({
    profile: { siteTitle: "Network CLI", handle: "network-cli", siteUrl: "https://network.example/" },
    posts: [{
      id: "p1",
      title: "Network",
      slug: "network",
      body: "Network body",
      tags: ["network"],
      status: "published",
      excerpt: "Network body",
      imageIds: [],
      createdAt: "2026-06-14T00:00:00.000Z",
      updatedAt: "2026-06-14T00:00:00.000Z",
      publishedAt: "2026-06-14T00:00:00.000Z",
    }],
    identity: {
      algorithm: "ML-DSA-65",
      publicKey: publicKeyToText(keys.publicKey),
      encryptedSecretKey,
      createdAt: "2026-06-14T00:00:00.000Z",
    },
    settings: {
      snailLiftSurgeSiteUrl: "https://network.example/",
      snailLiftSurgeDomain: "network.example",
      snailLiftSurgeProjectDir: "postsnail-public",
      snailLiftSurgeLogin: "boaz@example.com",
      snailLiftSurgeToken: "secret-surge-token",
    },
  }, "shell phrase");
  writeFileSync(workspacePath, exported.text);

  await captureCli(["zip", "--workspace", workspacePath, "--passphrase", "shell phrase", "--identity-passphrase", "identity phrase", "--out", zipPath]);
  await captureCli(["build", "--workspace", workspacePath, "--passphrase", "shell phrase", "--identity-passphrase", "identity phrase", "--out", outDir]);
  const wellKnown = JSON.parse(readFileSync(join(outDir, ".well-known", "postsnail.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(outDir, "postsnail.manifest.json"), "utf8"));
  const latestCommit = JSON.parse(readFileSync(join(outDir, ".well-known", "postsnail", "latest-commit.json"), "utf8"));
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const body = init.body ? String(init.body) : "";
    requests.push({ url, method: init.method || "GET", body });
    assert.doesNotMatch(body, /identity phrase|shell phrase|secretKey|privateKey/);
    if (url === "https://network.example/.well-known/postsnail.json") return jsonResponse(wellKnown);
    if (url === "https://network.example/postsnail.manifest.json") return jsonResponse(manifest);
    if (url === "https://network.example/.well-known/postsnail/latest-commit.json") return jsonResponse(latestCommit);
    if (url.endsWith("/api/announce")) return jsonResponse({ status: "queued", submissionId: "sub-1" }, 202);
    if (url.endsWith("/shellnames/register")) return jsonResponse({ name: "network", fullName: "@network@forest.postsnail.org", forest: "forest.postsnail.org", status: "active" });
    if (url.endsWith("/shellnames/update")) return jsonResponse({ name: "network", fullName: "@network@forest.postsnail.org", forest: "forest.postsnail.org", status: "active" });
    if (url.endsWith("/shellnames/renew")) return jsonResponse({ name: "network", fullName: "@network@forest.postsnail.org", forest: "forest.postsnail.org", status: "active" });
    if (url.endsWith("/api/site-moves")) return jsonResponse({ status: "moved", moveId: "move-1", fromUrl: "https://old.example/", toUrl: "https://network.example/" }, 202);
    if (url === "http://127.0.0.1:8788/publish") return jsonResponse({ ok: true, message: "Surge published.", deploymentUrl: "https://network.example/" });
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    await captureCli(["forest", "announce", "--workspace", workspacePath, "--passphrase", "shell phrase", "--identity-passphrase", "identity phrase", "--forest-url", "https://forest.postsnail.org", "--skip-live-verify"]);
    await captureCli(["shellname", "register", "--workspace", workspacePath, "--passphrase", "shell phrase", "--identity-passphrase", "identity phrase", "--name", "network", "--forest-url", "https://forest.postsnail.org"]);
    await captureCli(["domain", "move", "--workspace", workspacePath, "--passphrase", "shell phrase", "--identity-passphrase", "identity phrase", "--from-url", "https://old.example/", "--to-url", "https://network.example/", "--forest-url", "https://forest.postsnail.org", "--skip-live-verify"]);
    await captureCli(["publish", "surge", "--workspace", workspacePath, "--passphrase", "shell phrase", "--identity-passphrase", "identity phrase", "--skip-live-verify"]);
    await assert.rejects(
      () => captureCli(["publish", "surge", "--workspace", workspacePath, "--passphrase", "shell phrase", "--identity-passphrase", "identity phrase", "--skip-live-verify", "--notify-forest"]),
      /Forest notify requires live verification/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests.some((request) => request.url.endsWith("/api/announce")), true);
  assert.equal(requests.some((request) => request.url.endsWith("/shellnames/register")), true);
  assert.equal(requests.some((request) => request.url.endsWith("/api/site-moves")), true);
  assert.equal(requests.some((request) => request.url === "http://127.0.0.1:8788/publish"), true);

  const reopened = await importWorkspaceVault(readFileSync(workspacePath, "utf8"), "shell phrase");
  assert.equal(reopened.state.shellNames[0].fullName, "@network@forest.postsnail.org");
  assert.equal(reopened.state.siteMoves[0].id, "move-1");
});

async function captureCli(argv, options = {}) {
  let output = "";
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk, encoding, callback) => {
    output += String(chunk);
    if (typeof callback === "function") callback();
    return true;
  };
  try {
    await runCli(argv, options);
    return output;
  } finally {
    process.stdout.write = originalWrite;
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
