import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { encodeText } from "../src/bytes.js";
import { normalizePost } from "../src/content.js";
import { generateSigningKeyPair, sha3Hex } from "../src/crypto.js";
import { buildStaticExport } from "../src/exporter.js";
import { createDeploymentLogEntry, redactDeploymentSecrets } from "../src/snaillift/deploymentLog.js";
import { announceForestAfterLiveVerification } from "../src/snaillift/forestAnnounce.js";
import { verifySnailLiftLiveSite } from "../src/snaillift/liveVerifier.js";
import { validateProviderManifest } from "../src/snaillift/providers.js";
import { buildSurgeBridgeCommand, surgeProvider, validateSurgeSettings } from "../src/snaillift/providers/surge.js";
import {
  buildCloudflarePagesCommand,
  buildCloudflarePagesCreateCommand,
  cloudflarePagesProvider,
  validateCloudflarePagesSettings,
} from "../src/snaillift/providers/cloudflarePages.js";
import {
  buildGithubPagesCommands,
  githubPagesProvider,
  validateGithubPagesSettings,
} from "../src/snaillift/providers/githubPages.js";
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
  const github = validateProviderManifest(githubPagesProvider);
  assert.equal(github.ok, true, github.errors.join("\n"));

  const invalid = validateProviderManifest({ id: "bad-provider" });
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join("\n"), /provider name is required/);
  assert.match(invalid.errors.join("\n"), /provider deploy function is required/);
});

test("GitHub Pages settings validate required deploy fields and safe paths", () => {
  const missing = validateGithubPagesSettings({});
  assert.equal(missing.ok, false);
  assert.match(missing.errors.join("\n"), /owner is required/);
  assert.match(missing.errors.join("\n"), /repo is required/);
  assert.match(missing.errors.join("\n"), /siteUrl is required/);

  for (const targetDir of ["/public", "../public", ".git", "docs/../site", "bad dir"]) {
    const invalid = validateGithubPagesSettings({
      owner: "boaz",
      repo: "postsnail-site",
      targetDir,
      siteUrl: "https://boaz.github.io/postsnail-site/",
    });
    assert.equal(invalid.ok, false, targetDir);
    assert.match(invalid.errors.join("\n"), /targetDir is invalid/);
  }

  const valid = validateGithubPagesSettings({
    owner: "Boaz",
    repo: "PostSnail Site",
    targetDir: "blog",
    siteUrl: "https://boaz.github.io/postsnail-site",
  });
  assert.equal(valid.ok, true, valid.errors.join("\n"));
  assert.equal(valid.normalized.owner, "boaz");
  assert.equal(valid.normalized.repo, "postsnail-site");
  assert.equal(valid.normalized.branch, "gh-pages");
  assert.equal(valid.normalized.targetDir, "blog");
  assert.equal(valid.normalized.siteUrl, "https://boaz.github.io/postsnail-site/");
});

test("GitHub Pages provider builds command-assistant commands without token placeholders", async () => {
  const commands = buildGithubPagesCommands({
    owner: "boaz",
    repo: "postsnail-site",
    branch: "gh-pages",
    targetDir: "blog",
    siteUrl: "https://boaz.github.io/postsnail-site/",
    directory: "postsnail-public",
    token: "secret-token-value",
  });

  const joined = commands.join("\n");
  assert.match(joined, /git clone https:\/\/github\.com\/boaz\/postsnail-site\.git postsnail-github-pages/);
  assert.match(joined, /git checkout gh-pages \|\| git checkout --orphan gh-pages/);
  assert.match(joined, /rsync -a --delete \.\.\/postsnail-public\/ blog\//);
  assert.match(joined, /git add blog/);
  assert.match(joined, /git commit -m "Publish PostSnail site" \|\| true/);
  assert.match(joined, /git push origin gh-pages/);
  assert.doesNotMatch(joined, /secret-token-value|token|password|authorization/iu);

  const result = await githubPagesProvider.deploy({
    files: { "index.html": encodeText("ok") },
    settings: {
      owner: "boaz",
      repo: "postsnail-site",
      branch: "gh-pages",
      targetDir: "blog",
      siteUrl: "https://boaz.github.io/postsnail-site/",
    },
    secrets: { token: "secret-token-value" },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "command-assistant");
  assert.match(result.message, /Run these commands locally/);
  assert.equal(result.commands.length >= 6, true);
  assert.equal(result.safety.ok, true);
  assert.doesNotMatch(JSON.stringify(result), /secret-token-value|authorization/iu);
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

test("Cloudflare Pages provider falls back to the command assistant when no token is available", async () => {
  const result = await cloudflarePagesProvider.deploy({
    files: { "index.html": encodeText("ok") },
    settings: {
      accountId: "abc123",
      projectName: "my-postsnail",
      branch: "main",
      siteUrl: "https://creator.example/",
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "cloudflare-token-missing");
  assert.match(result.message, /command assistant fallback/);
  assert.match(result.fallbackCommand, /wrangler pages deploy/);
  assert.doesNotMatch(JSON.stringify(result), /secret-token-value/);
});

test("Cloudflare Pages provider asks to create a missing project before publishing", async () => {
  const result = await cloudflarePagesProvider.deploy({
    files: { "index.html": encodeText("ok") },
    settings: {
      accountId: "abc123",
      projectName: "my-postsnail",
      branch: "main",
      siteUrl: "https://creator.example/",
    },
    secrets: { apiToken: "cf-secret-token" },
    fetcher: async (input) => {
      const url = String(input);
      if (url.endsWith("/pages/projects/my-postsnail")) {
        return new Response(JSON.stringify({
          errors: [{ message: "Project not found" }],
        }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "cloudflare-project-missing");
  assert.match(result.message, /does not exist yet/i);
  assert.equal(result.createProjectCommand, buildCloudflarePagesCreateCommand({
    accountId: "abc123",
    projectName: "my-postsnail",
    branch: "main",
    siteUrl: "https://creator.example/",
  }));
  assert.match(result.fallbackCommand, /wrangler pages deploy/);
});

test("Cloudflare Pages provider creates a missing project and publishes when approved", async () => {
  const calls = [];
  const files = { "index.html": encodeText("ok") };

  const result = await cloudflarePagesProvider.deploy({
    files,
    settings: {
      accountId: "abc123",
      projectName: "my-postsnail",
      branch: "main",
      siteUrl: "https://creator.example/",
    },
    secrets: { apiToken: "cf-secret-token" },
    createProjectIfMissing: true,
    fetcher: async (input, init = {}) => {
      const url = String(input);
      const method = String(init.method || "GET").toUpperCase();
      calls.push({ url, method, body: init.body });

      if (url.endsWith("/pages/projects/my-postsnail")) {
        return new Response(JSON.stringify({
          errors: [{ message: "Project not found" }],
        }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/pages/projects")) {
        assert.equal(method, "POST");
        const body = JSON.parse(String(init.body || "{}"));
        assert.deepEqual(body, {
          name: "my-postsnail",
          production_branch: "main",
        });
        return new Response(JSON.stringify({
          result: {
            name: "my-postsnail",
            subdomain: "my-postsnail.pages.dev",
          },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/upload-token")) {
        return jsonResponse({ jwt: "upload-jwt" });
      }
      if (url.endsWith("/pages/assets/upload")) {
        return jsonResponse({ jwt: "completion-jwt" });
      }
      if (url.endsWith("/pages/assets/upsert-hashes")) {
        return jsonResponse({ ok: true });
      }
      if (url.endsWith("/deployments")) {
        return jsonResponse({
          id: "deployment-1",
          url: "https://my-postsnail.pages.dev/",
          project_name: "my-postsnail",
          latest_stage: { name: "deploy", status: "success" },
        });
      }
      throw new Error(`Unexpected fetch ${method} ${url}`);
    },
  });

  assert.equal(result.ok, true, result.message);
  assert.equal(result.code, "published");
  assert.equal(result.projectCreated, true);
  assert.equal(result.deploymentUrl, "https://my-postsnail.pages.dev/");
  assert.match(JSON.stringify(calls), /pages\/projects","method":"POST"/);
  assert.match(JSON.stringify(calls), /upload-token/);
  assert.match(JSON.stringify(calls), /deployments/);
});

test("Cloudflare Pages provider explains token permission failures clearly", async () => {
  const result = await cloudflarePagesProvider.deploy({
    files: { "index.html": encodeText("ok") },
    settings: {
      accountId: "abc123",
      projectName: "my-postsnail",
      branch: "main",
      siteUrl: "https://creator.example/",
    },
    secrets: { apiToken: "cf-secret-token" },
    fetcher: async (input) => {
      const url = String(input);
      if (url.endsWith("/pages/projects/my-postsnail")) {
        return new Response(JSON.stringify({
          errors: [{ message: "Authentication error [code: 10000]" }],
        }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "cloudflare-publish-failed");
  assert.match(result.message, /Cloudflare rejected the token/i);
  assert.match(result.message, /Pages (Write|Edit)/i);
  assert.match(result.message, /Memberships Read/i);
  assert.doesNotMatch(JSON.stringify(result), /cf-secret-token/);
});

test("Cloudflare Pages provider can publish from browser runtimes when the API calls succeed", async () => {
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, "window");
  const hadDocument = Object.prototype.hasOwnProperty.call(globalThis, "document");
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const calls = [];

  try {
    globalThis.window = {};
    globalThis.document = {};

    const result = await cloudflarePagesProvider.deploy({
      files: { "index.html": encodeText("ok") },
      settings: {
        accountId: "abc123",
        projectName: "my-postsnail",
        branch: "main",
        siteUrl: "https://creator.example/",
      },
      secrets: { apiToken: "cf-secret-token" },
      fetcher: async (input, init = {}) => {
        const url = String(input);
        const method = String(init.method || "GET").toUpperCase();
        calls.push({ url, method, body: init.body });

        if (url.endsWith("/pages/projects/my-postsnail")) {
          return jsonResponse({
            name: "my-postsnail",
            production_branch: "main",
          });
        }
        if (url.endsWith("/pages/projects/my-postsnail/upload-token")) {
          return jsonResponse({ jwt: "upload-jwt" });
        }
        if (url.endsWith("/pages/assets/upload")) {
          return jsonResponse({ jwt: "completion-jwt" });
        }
        if (url.endsWith("/pages/assets/upsert-hashes")) {
          return jsonResponse({ ok: true });
        }
        if (url.endsWith("/pages/projects/my-postsnail/deployments")) {
          return jsonResponse({
            id: "deployment-1",
            url: "https://my-postsnail.pages.dev/",
            project_name: "my-postsnail",
            latest_stage: { name: "deploy", status: "success" },
          });
        }
        throw new Error(`Unexpected fetch ${method} ${url}`);
      },
    });

    assert.equal(result.ok, true, result.message);
    assert.equal(result.code, "published");
    assert.equal(result.publishState, "verified");
    assert.match(JSON.stringify(calls), /upload-token/);
    assert.match(JSON.stringify(calls), /deployments/);
    assert.equal(result.safety.ok, true);
    assert.doesNotMatch(JSON.stringify(result), /cf-secret-token/);
  } finally {
    if (hadWindow) {
      globalThis.window = originalWindow;
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
    if (hadDocument) {
      globalThis.document = originalDocument;
    } else {
      Reflect.deleteProperty(globalThis, "document");
    }
  }
});

test("Cloudflare Pages provider publishes public files via the Pages API when a token is available", async () => {
  const calls = [];
  const files = {
    "index.html": encodeText("<h1>Publish me</h1>"),
    "about/index.html": encodeText("<p>About page</p>"),
    "_headers": encodeText("/\n  X-Test: 1"),
    "postsnail.manifest.json": encodeText("{}"),
    ".well-known/postsnail.json": encodeText("{}"),
  };

  const fetcher = async (input, init = {}) => {
    const url = String(input);
    const method = String(init.method || "GET").toUpperCase();
    const body = init.body;
    calls.push({ url, method, body });

    if (url.endsWith("/pages/projects/my-postsnail")) {
      return jsonResponse({
        name: "my-postsnail",
        production_branch: "main",
        deployment_configs: {
          production: { compatibility_date: "2026-06-01", compatibility_flags: [] },
        },
      });
    }
    if (url.endsWith("/pages/projects/my-postsnail/upload-token")) {
      return jsonResponse({ jwt: "upload-jwt" });
    }
    if (url.endsWith("/pages/assets/upload")) {
      assert.equal(init.headers.Authorization, "Bearer upload-jwt");
      const payload = JSON.parse(String(body));
      assert.equal(Array.isArray(payload), true);
      assert.equal(payload.length > 0, true);
      return jsonResponse({ jwt: "completion-jwt" });
    }
    if (url.endsWith("/pages/assets/upsert-hashes")) {
      assert.equal(init.headers.Authorization, "Bearer upload-jwt");
      return jsonResponse({ ok: true });
    }
    if (url.endsWith("/pages/projects/my-postsnail/deployments")) {
      assert.equal(method, "POST");
      assert.ok(body instanceof FormData);
      assert.equal(body.get("branch"), "main");
      assert.equal(body.get("manifest"), JSON.stringify({
        "index.html": hashForPagesUpload("index.html", files["index.html"]),
        "about/index.html": hashForPagesUpload("about/index.html", files["about/index.html"]),
        "_headers": hashForPagesUpload("_headers", files["_headers"]),
        "postsnail.manifest.json": hashForPagesUpload("postsnail.manifest.json", files["postsnail.manifest.json"]),
        ".well-known/postsnail.json": hashForPagesUpload(".well-known/postsnail.json", files[".well-known/postsnail.json"]),
      }));
      return jsonResponse({
        id: "deployment-1",
        url: "https://my-postsnail.pages.dev/",
        project_name: "my-postsnail",
        latest_stage: { name: "deploy", status: "success" },
      });
    }
    throw new Error(`Unexpected fetch ${method} ${url}`);
  };

  const result = await cloudflarePagesProvider.deploy({
    files,
    settings: {
      accountId: "abc123",
      projectName: "my-postsnail",
      branch: "main",
      siteUrl: "https://creator.example/",
    },
    secrets: { apiToken: "cf-secret-token" },
    fetcher,
  });

  assert.equal(result.ok, true, result.message);
  assert.equal(result.code, "published");
  assert.equal(result.deploymentUrl, "https://my-postsnail.pages.dev/");
  assert.equal(result.safety.ok, true);
  assert.match(JSON.stringify(calls), /upload-token/);
  assert.match(JSON.stringify(calls), /assets\/upload/);
  assert.match(JSON.stringify(calls), /upsert-hashes/);
  assert.match(JSON.stringify(calls), /deployments/);
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

function hashForPagesUpload(filePath, bytes) {
  const extension = /\.[^.]+$/u.exec(filePath)?.[0] || "";
  return sha3Hex(encodeText(`${Buffer.from(bytes).toString("base64")}${extension}`)).slice(0, 32);
}
