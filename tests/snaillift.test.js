import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { encodeText } from "../src/bytes.js";
import { normalizePost } from "../src/content.js";
import { generateSigningKeyPair } from "../src/crypto.js";
import { buildStaticExport } from "../src/exporter.js";
import { createDeploymentLogEntry, redactDeploymentSecrets } from "../src/snaillift/deploymentLog.js";
import { announceForestAfterLiveVerification } from "../src/snaillift/forestAnnounce.js";
import { verifySnailLiftLiveSite } from "../src/snaillift/liveVerifier.js";
import { validateProviderManifest } from "../src/snaillift/providers.js";
import {
  buildCloudflarePagesCommand,
  cloudflarePagesProvider,
  validateCloudflarePagesSettings,
} from "../src/snaillift/providers/cloudflarePages.js";
import { runSnailLiftSafety } from "../src/snaillift/safety.js";

const root = process.cwd();

test("runSnailLiftSafety accepts public generated files", () => {
  const result = runSnailLiftSafety({
    "index.html": encodeText("<h1>PostSnail</h1>"),
    "postsnail.manifest.json": encodeText("{}"),
    ".well-known/postsnail.json": encodeText("{}"),
    "assets/logo.png": new Uint8Array([1, 2, 3]),
  });

  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.fileCount, 4);
});

test("runSnailLiftSafety blocks private shell and key material", () => {
  const result = runSnailLiftSafety({
    "backup.postsnail": encodeText("postsnail-workspace"),
    "drafts/private.html": encodeText("draft body"),
    "posts/published/index.html": encodeText("rawPrivateKey = abc"),
    ".env": encodeText("CLOUDFLARE_API_TOKEN=secret"),
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /\.postsnail/);
  assert.match(result.errors.join("\n"), /drafts/);
  assert.match(result.errors.join("\n"), /rawPrivateKey/);
  assert.match(result.errors.join("\n"), /\.env/);
});

test("deployment logs redact secrets and never store provider tokens", () => {
  const redacted = redactDeploymentSecrets({
    provider: "cloudflare-pages",
    apiToken: "secret-token",
    token: "another-secret",
    authorization: "Bearer secret",
    nested: { githubToken: "ghp_secret" },
  });

  assert.equal(redacted.apiToken, "[redacted]");
  assert.equal(redacted.token, "[redacted]");
  assert.equal(redacted.authorization, "[redacted]");
  assert.equal(redacted.nested.githubToken, "[redacted]");

  const entry = createDeploymentLogEntry({
    provider: "cloudflare-pages",
    siteUrl: "https://creator.example/",
    deploymentUrl: "https://abc.pages.dev/",
    bundleFingerprint: "psn1-sha3-512-test",
    status: "success",
    forestAnnounced: true,
    apiToken: "secret-token",
    startedAt: "2026-06-06T00:00:00.000Z",
    finishedAt: "2026-06-06T00:01:00.000Z",
  });

  assert.equal(entry.apiToken, undefined);
  assert.equal(entry.provider, "cloudflare-pages");
  assert.equal(entry.status, "success");
  assert.equal(entry.forestAnnounced, true);
});

test("provider manifests validate required fields", () => {
  const valid = validateProviderManifest(cloudflarePagesProvider);
  assert.equal(valid.ok, true, valid.errors.join("\n"));

  const invalid = validateProviderManifest({ id: "bad-provider" });
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join("\n"), /provider name is required/);
  assert.match(invalid.errors.join("\n"), /provider deploy function is required/);
});

test("Cloudflare Pages settings validate required deploy fields", () => {
  const missing = validateCloudflarePagesSettings({});
  assert.equal(missing.ok, false);
  assert.match(missing.errors.join("\n"), /accountId is required/);
  assert.match(missing.errors.join("\n"), /projectName is required/);
  assert.match(missing.errors.join("\n"), /siteUrl is required/);

  const valid = validateCloudflarePagesSettings({
    accountId: "abc123",
    projectName: "My PostSnail",
    branch: "main",
    siteUrl: "https://creator.example",
  });
  assert.equal(valid.ok, true, valid.errors.join("\n"));
  assert.equal(valid.normalized.projectName, "my-postsnail");
  assert.equal(valid.normalized.branch, "main");
  assert.equal(valid.normalized.siteUrl, "https://creator.example/");
});

test("Cloudflare Pages provider builds a Wrangler fallback command without leaking token values", () => {
  const command = buildCloudflarePagesCommand({
    accountId: "abc123",
    projectName: "my-postsnail",
    branch: "main",
    directory: "postsnail-public",
    apiToken: "secret-token-value",
  });

  assert.match(command, /CLOUDFLARE_ACCOUNT_ID=abc123/);
  assert.match(command, /CLOUDFLARE_API_TOKEN=<limited-cloudflare-pages-token>/);
  assert.match(command, /npx wrangler pages deploy postsnail-public --project-name=my-postsnail --branch=main/);
  assert.doesNotMatch(command, /secret-token-value/);
});

test("Cloudflare Pages browser deploy fails clearly with Wrangler fallback for Sprint 1A", async () => {
  const result = await cloudflarePagesProvider.deploy({
    files: { "index.html": encodeText("ok") },
    settings: {
      accountId: "abc123",
      projectName: "my-postsnail",
      branch: "main",
      siteUrl: "https://creator.example/",
    },
    secrets: { apiToken: "secret-token-value" },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "browser-direct-upload-not-enabled");
  assert.match(result.message, /Use the Wrangler command/);
  assert.match(result.fallbackCommand, /wrangler pages deploy/);
  assert.doesNotMatch(JSON.stringify(result), /secret-token-value/);
});

test("verifySnailLiftLiveSite passes when live proof matches generated export", async () => {
  const exported = await makeExportFixture();
  const fetcher = liveFilesFetcher(exported.files);

  const result = await verifySnailLiftLiveSite({
    siteUrl: "https://creator.example/",
    exportResult: exported,
    fetcher,
  });

  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.bundleFingerprint, exported.bundleFingerprint);
});

test("verifySnailLiftLiveSite fails when live fingerprint differs", async () => {
  const exported = await makeExportFixture();
  const fetcher = async (url) => {
    const key = fileKeyFromUrl(url);
    if (key === "postsnail.manifest.json") {
      const manifest = JSON.parse(new TextDecoder().decode(exported.files[key]));
      manifest.bundleFingerprint = "psn1-sha3-512-wrong";
      return new Response(JSON.stringify(manifest), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const bytes = exported.files[key];
    if (!bytes) return new Response("missing", { status: 404 });
    return new Response(bytes, { status: 200 });
  };

  const result = await verifySnailLiftLiveSite({
    siteUrl: "https://creator.example/",
    exportResult: exported,
    fetcher,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /fingerprint/i);
});

test("Forest announce only happens after live verification succeeds", async () => {
  const exported = await makeExportFixture();
  const requests = [];
  const fetcher = async (request) => {
    requests.push(request);
    return new Response(JSON.stringify({ status: "queued" }), {
      status: 202,
      headers: { "content-type": "application/json" },
    });
  };

  const blocked = await announceForestAfterLiveVerification({
    liveVerification: { ok: false, errors: ["not live"] },
    announcePayload: exported.announcePayload,
    fetcher,
  });
  assert.equal(blocked.ok, false);
  assert.equal(requests.length, 0);

  const sent = await announceForestAfterLiveVerification({
    liveVerification: { ok: true },
    announcePayload: exported.announcePayload,
    fetcher,
  });
  assert.equal(sent.ok, true);
  assert.equal(sent.status, 202);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://forest.postsnail.org/api/announce");
});

test("SnailLift provider logic stays out of PostSnail Core modules", () => {
  const coreFiles = [
    "src/exporter.js",
    "src/workspace.js",
    "src/workspaceSchema.js",
    "src/workspaceCrypto.js",
    "src/proof-documents.js",
    "src/protocol.js",
    "src/crypto.js",
  ];

  for (const file of coreFiles) {
    const source = readFileSync(join(root, file), "utf8");
    assert.doesNotMatch(source, /snaillift|snailLift|cloudflare|github|wrangler/iu, file);
  }
});

async function makeExportFixture() {
  const keys = generateSigningKeyPair();
  const post = normalizePost({
    id: "p1",
    title: "Live Verified",
    body: "Published body.",
    status: "published",
    createdAt: "2026-06-06T00:00:00.000Z",
  });
  return buildStaticExport({
    profile: {
      siteTitle: "Live Test",
      handle: "live",
      siteUrl: "https://creator.example/",
    },
    posts: [post],
    assets: [],
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
    generatedAt: "2026-06-06T00:00:00.000Z",
  });
}

function liveFilesFetcher(files) {
  return async (url) => {
    const key = fileKeyFromUrl(url);
    const bytes = files[key];
    if (!bytes) return new Response("missing", { status: 404 });
    return new Response(bytes, { status: 200 });
  };
}

function fileKeyFromUrl(url) {
  return new URL(url).pathname.replace(/^\//u, "") || "index.html";
}
