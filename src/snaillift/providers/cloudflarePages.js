import { assertSnailLiftSafe } from "../safety.js";

export const cloudflarePagesProvider = {
  id: "cloudflare-pages",
  name: "Cloudflare Pages",
  async deploy({ files, settings = {}, secrets = {} } = {}) {
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
    return {
      ok: false,
      code: "browser-direct-upload-not-enabled",
      message:
        "Cloudflare Pages browser direct upload is not enabled in SnailLift 1A. Use the Wrangler command after extracting the public Website ZIP.",
      fallbackCommand: buildCloudflarePagesCommand({
        ...validation.normalized,
        apiToken: secrets.apiToken,
        directory: settings.directory || "postsnail-public",
      }),
      safety,
    };
  },
};

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

function shellToken(value) {
  const text = String(value || "");
  return /^[A-Za-z0-9._/:=-]+$/u.test(text) ? text : JSON.stringify(text);
}
