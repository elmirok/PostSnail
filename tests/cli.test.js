import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { encryptSecretKey, generateSigningKeyPair, publicKeyToText } from "../src/crypto.js";
import { exportWorkspaceVault, importWorkspaceVault } from "../src/workspace.js";

const cliPath = join(process.cwd(), "bin/postsnail.js");

test("postsnail --help prints top-level commands", () => {
  const output = execFileSync(process.execPath, [cliPath, "--help"], { encoding: "utf8" });

  assert.match(output, /workspace info/);
  assert.match(output, /post import/);
  assert.match(output, /build/);
  assert.match(output, /verify/);
  assert.match(output, /zip/);
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
