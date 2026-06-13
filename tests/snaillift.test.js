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
import { buildSurgeBridgeCommand, surgeProvider, validateSurgeSettings } from "../src/snaillift/providers/surge.js";
import { runSnailLiftSafety } from "../src/snaillift/safety.js";
import { zipSync } from "../vendor/fflate/browser.js";

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
    provider: "surge",
    apiToken: "secret-token",
    token: "another-secret",
    authorization: "Bearer secret",
    nested: { surgeToken: "surge_secret" },
  });

  assert.equal(redacted.apiToken, "[redacted]");
  assert.equal(redacted.token, "[redacted]");
  assert.equal(redacted.authorization, "[redacted]");
  assert.equal(redacted.nested.surgeToken, "[redacted]");

  const entry = createDeploymentLogEntry({
    provider: "surge",
    siteUrl: "https://creator.example/",
    deploymentUrl: "https://creator.surge.sh/",
    bundleFingerprint: "psn1-sha3-512-test",
    status: "success",
    forestAnnounced: true,
    apiToken: "secret-token",
    startedAt: "2026-06-06T00:00:00.000Z",
    finishedAt: "2026-06-06T00:01:00.000Z",
  });

  assert.equal(entry.apiToken, undefined);
  assert.equal(entry.provider, "surge");
  assert.equal(entry.status, "success");
  assert.equal(entry.forestAnnounced, true);
});

test("provider manifests validate required fields", () => {
  const valid = validateProviderManifest(surgeProvider);
  assert.equal(valid.ok, true, valid.errors.join("\n"));

  const invalid = validateProviderManifest({ id: "bad-provider" });
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join("\n"), /provider name is required/);
  assert.match(invalid.errors.join("\n"), /provider deploy function is required/);
});

test("Surge settings validate required publish fields and safe paths", () => {
  const missing = validateSurgeSettings({});
  assert.equal(missing.ok, false);
  assert.match(missing.errors.join("\n"), /domain is required/);
  assert.match(missing.errors.join("\n"), /siteUrl is required/);
  assert.match(missing.errors.join("\n"), /surgeLogin is required/);
  assert.match(missing.errors.join("\n"), /surgeToken is required/);

  const valid = validateSurgeSettings({
    domain: "Elmirok.Hilazon6.Com",
    siteUrl: "https://elmirok.hilazon6.com",
    projectDir: "postsnail-public",
    surgeLogin: "boaz@example.com",
    surgeToken: "surge-token-value",
  });

  assert.equal(valid.ok, true, valid.errors.join("\n"));
  assert.equal(valid.normalized.domain, "elmirok.hilazon6.com");
  assert.equal(valid.normalized.siteUrl, "https://elmirok.hilazon6.com/");
  assert.equal(valid.normalized.projectDir, "postsnail-public");
});

test("Surge bridge command stays token-free and names the helper", () => {
  const command = buildSurgeBridgeCommand({
    domain: "elmirok.hilazon6.com",
    siteUrl: "https://elmirok.hilazon6.com/",
    projectDir: "postsnail-public",
  });

  assert.match(command, /npm run surge:bridge/);
  assert.doesNotMatch(command, /token|login|password|authorization/iu);
});

test("Surge provider publishes through the local bridge without leaking secrets", async () => {
  const zipBytes = zipSync({
    "index.html": encodeText("<h1>ok</h1>"),
    "postsnail.manifest.json": encodeText("{}"),
    ".well-known/postsnail.json": encodeText("{}"),
  });

  let posted = null;
  const result = await surgeProvider.deploy({
    zipBytes,
    settings: {
      domain: "elmirok.hilazon6.com",
      siteUrl: "https://elmirok.hilazon6.com",
      projectDir: "postsnail-public",
      surgeLogin: "boaz@example.com",
      surgeToken: "surge-token-value",
    },
    fetcher: async (input, init = {}) => {
      const url = String(input);
      if (url === "http://127.0.0.1:8788/health") {
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url === "http://127.0.0.1:8788/publish") {
        posted = JSON.parse(String(init.body || "{}"));
        return new Response(JSON.stringify({
          ok: true,
          message: "Surge published.",
          deploymentUrl: "https://elmirok.hilazon6.com/",
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected bridge request: ${url}`);
    },
  });

  assert.equal(result.ok, true, result.message);
  assert.equal(result.code, "published");
  assert.equal(result.deploymentUrl, "https://elmirok.hilazon6.com/");
  assert.equal(result.publishState, "verified");
  assert.equal(result.safety.ok, true);
  assert.match(JSON.stringify(result), /Surge published/);
  assert.equal(typeof posted.zipBase64, "string");
  assert.equal(posted.domain, "elmirok.hilazon6.com");
  assert.equal(posted.siteUrl, "https://elmirok.hilazon6.com/");
  assert.equal(posted.projectDir, "postsnail-public");
  assert.equal(posted.surgeLogin, "boaz@example.com");
  assert.doesNotMatch(JSON.stringify(result), /surge-token-value|authorization|password/iu);
});

test("Surge provider falls back cleanly when the local bridge is unavailable", async () => {
  const zipBytes = zipSync({
    "index.html": encodeText("<h1>ok</h1>"),
    "postsnail.manifest.json": encodeText("{}"),
    ".well-known/postsnail.json": encodeText("{}"),
  });

  const result = await surgeProvider.deploy({
    zipBytes,
    settings: {
      domain: "elmirok.hilazon6.com",
      siteUrl: "https://elmirok.hilazon6.com",
      projectDir: "postsnail-public",
      surgeLogin: "boaz@example.com",
      surgeToken: "surge-token-value",
    },
    fetcher: async () => {
      throw new TypeError("Failed to fetch");
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "surge-bridge-unavailable");
  assert.match(result.message, /local Surge bridge/i);
  assert.match(result.bridgeCommand, /npm run surge:bridge/);
  assert.doesNotMatch(JSON.stringify(result), /surge-token-value|authorization|password/iu);
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
    "src/workspaceCrypto.js",
    "src/proof-documents.js",
    "src/protocol.js",
    "src/crypto.js",
  ];

  for (const file of coreFiles) {
    const source = readFileSync(join(root, file), "utf8");
    assert.doesNotMatch(source, /snaillift|snailLift|cloudflare|github|wrangler/iu, file);
  }

  const workspaceSchema = readFileSync(join(root, "src/workspaceSchema.js"), "utf8");
  assert.doesNotMatch(workspaceSchema, /cloudflare|github|wrangler/iu, "src/workspaceSchema.js");
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

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
