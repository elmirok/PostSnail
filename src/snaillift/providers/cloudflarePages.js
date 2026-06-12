import { encodeBase64, encodeText } from "../../bytes.js";
import { sha3Hex } from "../../crypto.js";
import { isSafePublicPath } from "../../core/export/safety.js";
import { assertSnailLiftSafe } from "../safety.js";

const CLOUDFLARE_API_ROOT = "https://api.cloudflare.com/client/v4";
const PAGES_UPLOAD_BUCKET_SIZE = 40 * 1024 * 1024;
const PAGES_UPLOAD_BUCKET_FILE_COUNT = 2000;
const PAGES_UPLOAD_CONCURRENCY = 3;
const PAGES_UPLOAD_ATTEMPTS = 5;
const PAGES_DEPLOYMENT_ATTEMPTS = 12;

export const cloudflarePagesProvider = {
  id: "cloudflare-pages",
  name: "Cloudflare Pages",
  async deploy({ files, settings = {}, secrets = {}, fetcher = fetch, createProjectIfMissing = false } = {}) {
    const safety = assertSnailLiftSafe(files || {});
    const validation = validateCloudflarePagesSettings(settings);
    if (!validation.ok) {
      return {
        ok: false,
        code: "invalid-cloudflare-settings",
        message: validation.errors.join("; "),
        safety,
      };
    }

    const token = normalizeToken(secrets.apiToken || settings.apiToken || settings.snailLiftCloudflareApiToken);
    const fallbackCommand = buildCloudflarePagesCommand({
      ...validation.normalized,
      apiToken: token,
      directory: settings.directory || "postsnail-public",
    });

    if (!token) {
      return {
        ok: false,
        code: "cloudflare-token-missing",
        message:
          "Add a Cloudflare API token to publish from PostSnail, or use the command assistant fallback after exporting the ZIP.",
        fallbackCommand,
        safety,
        publishState: "not-configured",
      };
    }

    try {
      const project = await ensureCloudflarePagesProject({
        fetcher,
        accountId: validation.normalized.accountId,
        projectName: validation.normalized.projectName,
        branch: validation.normalized.branch,
        token,
        createProjectIfMissing,
      });

      if (project.missing && !createProjectIfMissing) {
        return {
          ok: false,
          code: "cloudflare-project-missing",
          message: `Cloudflare Pages project ${validation.normalized.projectName} does not exist yet. Create it and then publish?`,
          createProjectCommand: buildCloudflarePagesCreateCommand({
            ...validation.normalized,
            directory: settings.directory || "postsnail-public",
          }),
          fallbackCommand,
          safety,
          publishState: "not-configured",
        };
      }

      const deployment = await publishCloudflarePagesSite({
        files: files || {},
        settings: validation.normalized,
        token,
        fetcher,
        projectCreated: true,
      });
      return {
        ok: true,
        code: "published",
        message: "Cloudflare Pages publish completed.",
        deploymentUrl: deployment.url || validation.normalized.siteUrl,
        deployment,
        safety,
        projectCreated: true,
        publishState: "verified",
      };
    } catch (error) {
      return {
        ok: false,
        code: "cloudflare-publish-failed",
        message: safeMessage(error),
        fallbackCommand,
        safety,
        publishState: "error",
      };
    }
  },
};

export async function publishCloudflarePagesSite({
  files = {},
  settings = {},
  token,
  fetcher = fetch,
  projectCreated = false,
} = {}) {
  const validation = validateCloudflarePagesSettings(settings);
  if (!validation.ok) {
    throw new Error(validation.errors.join("; "));
  }
  const normalized = validation.normalized;
  const authHeaders = { Authorization: `Bearer ${String(token || "").trim()}` };
  if (!projectCreated) {
    const project = await fetchCloudflareJson(fetcher, `${CLOUDFLARE_API_ROOT}/accounts/${normalized.accountId}/pages/projects/${normalized.projectName}`, {
      headers: authHeaders,
    });
    if (!project || typeof project !== "object") {
      throw new Error("Cloudflare Pages project could not be loaded.");
    }
  }

  const uploadToken = await fetchCloudflareJson(fetcher, `${CLOUDFLARE_API_ROOT}/accounts/${normalized.accountId}/pages/projects/${normalized.projectName}/upload-token`, {
    headers: authHeaders,
  });
  const jwt = normalizeJwt(uploadToken);
  if (!jwt) {
    throw new Error("Cloudflare Pages upload token was not returned.");
  }

  const filesToUpload = buildPagesFiles(files);
  const uploadFiles = [...filesToUpload].sort((a, b) => b.sizeInBytes - a.sizeInBytes);
  await uploadPagesFiles(fetcher, jwt, uploadFiles);
  await fetchCloudflareJson(fetcher, `${CLOUDFLARE_API_ROOT}/pages/assets/upsert-hashes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ hashes: filesToUpload.map((file) => file.hash) }),
  });

  const formData = new FormData();
  formData.append("manifest", JSON.stringify(Object.fromEntries(filesToUpload.map((file) => [file.path, file.hash]))));
  formData.append("branch", normalized.branch || "main");
  formData.append("commit_message", "Publish PostSnail site");
  formData.append("commit_dirty", "false");

  const headersFile = files["_headers"];
  if (headersFile) {
    formData.append("_headers", new File([headersFile], "_headers", { type: "text/plain" }));
  }
  const redirectsFile = files["_redirects"];
  if (redirectsFile) {
    formData.append("_redirects", new File([redirectsFile], "_redirects", { type: "text/plain" }));
  }

  const deployment = await fetchCloudflareJson(fetcher, `${CLOUDFLARE_API_ROOT}/accounts/${normalized.accountId}/pages/projects/${normalized.projectName}/deployments`, {
    method: "POST",
    headers: authHeaders,
    body: formData,
  });

  if (deployment?.id && deployment?.latest_stage?.status !== "success") {
    await waitForPagesDeployment(fetcher, normalized.accountId, normalized.projectName, deployment.id, authHeaders);
  }

  return deployment;
}

export function validateCloudflarePagesSettings(settings = {}) {
  const errors = [];
  const normalized = {
    accountId: String(settings.accountId || "").trim(),
    projectName: normalizeProjectName(settings.projectName),
    branch: String(settings.branch || "main").trim() || "main",
    siteUrl: normalizeHttpsUrl(settings.siteUrl),
  };

  if (!normalized.accountId) errors.push("accountId is required");
  if (!normalized.projectName) errors.push("projectName is required");
  if (!normalized.siteUrl) errors.push("siteUrl is required");

  return { ok: errors.length === 0, errors, normalized };
}

export function buildCloudflarePagesCommand(settings = {}) {
  const validation = validateCloudflarePagesSettings(settings);
  const normalized = validation.normalized;
  const directory = shellToken(settings.directory || "postsnail-public");
  const projectName = shellToken(normalized.projectName || "<project-name>");
  const branch = shellToken(normalized.branch || "main");
  const accountId = shellToken(normalized.accountId || "<account-id>");
  return `CLOUDFLARE_ACCOUNT_ID=${accountId} CLOUDFLARE_API_TOKEN=<limited-cloudflare-pages-token> npx wrangler pages deploy ${directory} --project-name=${projectName} --branch=${branch}`;
}

export function buildCloudflarePagesCreateCommand(settings = {}) {
  const validation = validateCloudflarePagesSettings(settings);
  const normalized = validation.normalized;
  const projectName = shellToken(normalized.projectName || "<project-name>");
  const branch = shellToken(normalized.branch || "main");
  return `npx wrangler pages project create ${projectName} --production-branch=${branch}`;
}

async function uploadPagesFiles(fetcher, jwt, filesToUpload) {
  if (!filesToUpload.length) return;
  const buckets = createUploadBuckets(filesToUpload);
  for (const bucket of buckets) {
    let attempts = 0;
    while (true) {
      try {
        const payload = bucket.map((file) => ({
          key: file.hash,
          value: encodeBase64(file.bytes),
          metadata: { contentType: file.contentType },
          base64: true,
        }));
        await fetchCloudflareJson(fetcher, `${CLOUDFLARE_API_ROOT}/pages/assets/upload`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify(payload),
        });
        break;
      } catch (error) {
        if (attempts >= PAGES_UPLOAD_ATTEMPTS - 1) {
          throw error;
        }
        attempts += 1;
        await delay(1000 * attempts);
      }
    }
  }
}

function createUploadBuckets(files) {
  const buckets = Array.from({ length: PAGES_UPLOAD_CONCURRENCY }, () => ({
    files: [],
    remainingSize: PAGES_UPLOAD_BUCKET_SIZE,
  }));
  const sorted = [...files].sort((a, b) => b.sizeInBytes - a.sizeInBytes);
  let bucketOffset = 0;
  for (const file of sorted) {
    let inserted = false;
    for (let index = 0; index < buckets.length; index += 1) {
      const bucket = buckets[(index + bucketOffset) % buckets.length];
      if (bucket.remainingSize >= file.sizeInBytes && bucket.files.length < PAGES_UPLOAD_BUCKET_FILE_COUNT) {
        bucket.files.push(file);
        bucket.remainingSize -= file.sizeInBytes;
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      buckets.push({
        files: [file],
        remainingSize: PAGES_UPLOAD_BUCKET_SIZE - file.sizeInBytes,
      });
    }
    bucketOffset += 1;
  }
  return buckets.map((bucket) => bucket.files).filter((bucket) => bucket.length > 0);
}

async function waitForPagesDeployment(fetcher, accountId, projectName, deploymentId, authHeaders) {
  let latest;
  for (let attempt = 0; attempt < PAGES_DEPLOYMENT_ATTEMPTS; attempt += 1) {
    latest = await fetchCloudflareJson(fetcher, `${CLOUDFLARE_API_ROOT}/accounts/${accountId}/pages/projects/${projectName}/deployments/${deploymentId}`, {
      headers: authHeaders,
    });
    const stage = latest?.latest_stage || {};
    if (stage.status === "success" || stage.status === "failure") {
      if (stage.status === "failure") {
        throw new Error("Cloudflare Pages deployment failed.");
      }
      return latest;
    }
    await delay(Math.min(1000 * (attempt + 1), 5000));
  }
  return latest;
}

function buildPagesFiles(files) {
  return Object.entries(files || {})
    .filter(([path, bytes]) => isSafePublicPath(path) && bytes instanceof Uint8Array)
    .map(([path, bytes]) => ({
      path,
      bytes,
      hash: hashForPagesUpload(path, bytes),
      sizeInBytes: bytes.length,
      contentType: contentTypeForPath(path),
    }));
}

function hashForPagesUpload(filePath, bytes) {
  const extension = String(filePath || "").match(/\.[^.]+$/u)?.[0] || "";
  return sha3Hex(encodeText(`${encodeBase64(bytes)}${extension}`)).slice(0, 32);
}

function contentTypeForPath(path) {
  const lower = String(path || "").toLowerCase();
  if (lower.endsWith(".html")) return "text/html; charset=utf-8";
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (lower.endsWith(".txt") || lower.endsWith(".toml") || lower.endsWith(".md")) return "text/plain; charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".ico")) return "image/x-icon";
  if (lower.endsWith(".woff")) return "font/woff";
  if (lower.endsWith(".woff2")) return "font/woff2";
  if (lower.endsWith(".avif")) return "image/avif";
  return "application/octet-stream";
}

async function fetchCloudflareJson(fetcher, url, init = {}) {
  const response = await fetcher(url, init);
  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || `Cloudflare request failed with status ${response.status}.`);
  }
  if (!response.ok) {
    const message = parsed?.errors?.[0]?.message || parsed?.message || parsed?.error || `Cloudflare request failed with status ${response.status}.`;
    const error = new Error(message);
    error.status = response.status;
    error.response = parsed;
    throw error;
  }
  return parsed.result ?? parsed;
}

async function ensureCloudflarePagesProject({
  fetcher,
  accountId,
  projectName,
  branch = "main",
  token,
  createProjectIfMissing = false,
} = {}) {
  const authHeaders = { Authorization: `Bearer ${String(token || "").trim()}` };
  try {
    const project = await fetchCloudflareJson(fetcher, `${CLOUDFLARE_API_ROOT}/accounts/${accountId}/pages/projects/${projectName}`, {
      headers: authHeaders,
    });
    return { ok: true, created: false, missing: false, project };
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
    if (!createProjectIfMissing) {
      return { ok: true, created: false, missing: true, project: null };
    }
    const project = await createCloudflarePagesProject({ fetcher, accountId, projectName, branch, token });
    return { ok: true, created: true, missing: false, project };
  }
}

async function createCloudflarePagesProject({ fetcher, accountId, projectName, branch, token }) {
  return fetchCloudflareJson(fetcher, `${CLOUDFLARE_API_ROOT}/accounts/${accountId}/pages/projects`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${String(token || "").trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: projectName,
      production_branch: branch || "main",
    }),
  });
}

function normalizeProjectName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function normalizeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return "";
    url.hash = "";
    url.search = "";
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return url.href;
  } catch {
    return "";
  }
}

function normalizeToken(value) {
  const text = String(value || "").trim();
  return text || "";
}

function shellToken(value) {
  const text = String(value || "");
  return /^[A-Za-z0-9._/:=-]+$/u.test(text) ? text : JSON.stringify(text);
}

function isSafeShellPath(value) {
  return /^[A-Za-z0-9._/-]+$/u.test(String(value || ""));
}

function safeMessage(error) {
  const message = error instanceof Error ? error.message : "Cloudflare Pages publish failed.";
  if (isCloudflareAuthFailure(message)) {
    return `${message} Cloudflare rejected the token. Check Pages Write or Pages Edit permissions for this account. If Wrangler still needs account visibility, add Memberships Read.`;
  }
  return message || "Cloudflare Pages publish failed.";
}

function isCloudflareAuthFailure(message) {
  const text = String(message || "").toLowerCase();
  return text.includes("authentication error") || text.includes("unauthorized") || text.includes("forbidden") || text.includes("code: 10000");
}

function isNotFoundError(error) {
  return Number(error?.status) === 404 || /not found/i.test(String(error?.message || ""));
}

function normalizeJwt(response) {
  if (typeof response === "string") return response;
  return String(response?.jwt || response?.result?.jwt || "").trim();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
