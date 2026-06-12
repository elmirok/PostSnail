import { encodeBase64, decodeBase64 } from "../../bytes.js";
import { zipSync, unzipSync } from "../../../vendor/fflate/browser.js";
import { assertSnailLiftSafe } from "../safety.js";

const DEFAULT_SURGE_BRIDGE_URL = "http://127.0.0.1:8788";
const DEFAULT_PROJECT_DIR = "postsnail-public";

export const surgeProvider = {
  id: "surge",
  name: "Surge",
  async deploy({ zipBytes, files, settings = {}, secrets = {}, fetcher = fetch } = {}) {
    const safety = assertSnailLiftSafe(files || {});
    const validation = validateSurgeSettings(settings);
    const bridgeCommand = buildSurgeBridgeCommand(validation.normalized);
    if (!validation.ok) {
      return {
        ok: false,
        code: "invalid-surge-settings",
        message: validation.errors.join("; "),
        safety,
        bridgeCommand,
        publishState: "not-configured",
      };
    }

    if (!validation.normalized.surgeLogin || !validation.normalized.surgeToken) {
      return {
        ok: false,
        code: "surge-credentials-missing",
        message: "Add a Surge login and token inside the encrypted Shell, or use the public ZIP fallback.",
        safety,
        bridgeCommand,
        publishState: "not-configured",
      };
    }

    const archiveBytes = normalizeArchiveBytes(zipBytes, files);
    if (!archiveBytes) {
      return {
        ok: false,
        code: "surge-archive-missing",
        message: "Build the public ZIP before sending it to the Surge bridge.",
        safety,
        bridgeCommand,
        publishState: "not-configured",
      };
    }

    const payload = {
      zipBase64: encodeBase64(archiveBytes),
      domain: validation.normalized.domain,
      siteUrl: validation.normalized.siteUrl,
      projectDir: validation.normalized.projectDir,
      surgeLogin: validation.normalized.surgeLogin,
      surgeToken: validation.normalized.surgeToken,
    };

    try {
      const response = await fetcher(`${validation.normalized.bridgeUrl}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await readBridgeBody(response);
      if (!response.ok || body.ok === false) {
        return {
          ok: false,
          code: "surge-publish-failed",
          message: body.message || body.error || "Surge publish failed.",
          bridgeCommand,
          safety,
          publishState: "error",
        };
      }

      return {
        ok: true,
        code: "published",
        message: body.message || "Surge publish completed.",
        deploymentUrl: body.deploymentUrl || validation.normalized.siteUrl,
        bridgeUrl: validation.normalized.bridgeUrl,
        safety,
        publishState: "verified",
      };
    } catch (error) {
      return {
        ok: false,
        code: "surge-bridge-unavailable",
        message: "Start the local Surge bridge with npm run surge:bridge, then publish again.",
        bridgeCommand,
        safety,
        publishState: "not-configured",
        error: error instanceof Error ? error.message : String(error || ""),
      };
    }
  },
};

export function validateSurgeSettings(settings = {}) {
  const errors = [];
  const siteUrl = normalizeHttpsUrl(settings.siteUrl);
  const domain = normalizeSurgeDomain(settings.domain || (siteUrl ? new URL(siteUrl).hostname : ""));
  const projectDir = normalizeProjectDir(settings.projectDir);
  const surgeLogin = normalizeLogin(settings.surgeLogin);
  const surgeToken = normalizeToken(settings.surgeToken);
  const bridgeUrl = normalizeBridgeUrl(settings.bridgeUrl) || DEFAULT_SURGE_BRIDGE_URL;

  if (!siteUrl) errors.push("siteUrl is required");
  if (!domain) errors.push("domain is required");
  if (!surgeLogin) errors.push("surgeLogin is required");
  if (!surgeToken) errors.push("surgeToken is required");

  return {
    ok: errors.length === 0,
    errors,
    normalized: {
      siteUrl,
      domain,
      projectDir: projectDir || DEFAULT_PROJECT_DIR,
      surgeLogin,
      surgeToken,
      bridgeUrl,
    },
  };
}

export function buildSurgeBridgeCommand() {
  return "npm run surge:bridge";
}

function normalizeArchiveBytes(zipBytes, files) {
  if (zipBytes instanceof Uint8Array && zipBytes.length) return zipBytes;
  if (!files || typeof files !== "object") return null;
  return zipSync(files, { level: 9 });
}

async function readBridgeBody(response) {
  try {
    return await response.clone().json();
  } catch {
    return { message: await response.text() };
  }
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

function normalizeSurgeDomain(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const sanitized = text.replace(/^https?:\/\//iu, "").replace(/\/.*$/u, "").toLowerCase();
  if (!/^[a-z0-9.-]+(?::[0-9]+)?$/u.test(sanitized)) return "";
  if (sanitized.startsWith("-") || sanitized.includes("..")) return "";
  return sanitized;
}

function normalizeProjectDir(value) {
  const text = String(value || "").trim();
  if (!text) return DEFAULT_PROJECT_DIR;
  if (!/^[A-Za-z0-9._/-]+$/u.test(text)) return "";
  if (text.startsWith("/") || text.includes("..") || text.split("/").includes(".git")) return "";
  return text.replace(/\/+$/u, "") || DEFAULT_PROJECT_DIR;
}

function normalizeLogin(value) {
  const text = String(value || "").trim();
  return text ? text : "";
}

function normalizeToken(value) {
  const text = String(value || "").trim();
  return text ? text : "";
}

function normalizeBridgeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!["http:", "https:"].includes(url.protocol)) return "";
    if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) return "";
    return url.origin.replace(/\/+$/u, "");
  } catch {
    return "";
  }
}

