import { canonicalJson } from "./canonical.js";
import { encodeText } from "./bytes.js";
import { publicKeyToText, signBytes, signatureToText, textToBytes, verifyBytes } from "./crypto.js";

export const SHELLNAME_PROTOCOL = "postsnail-shellname";
export const SHELLNAME_VERSION = 1;
export const SHELLNAME_OPTIONAL_FEATURES = ["forest-tracker"];
export const SHELLNAME_REQUIRED_FEATURES = [];
export const SHELLNAME_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{1,30}[a-z0-9]$/u;
export const RESERVED_SHELLNAMES = new Set([
  "admin",
  "api",
  "root",
  "support",
  "help",
  "postsnail",
  "forest",
  "shellname",
  "shellnames",
  "www",
  "mail",
  "legal",
  "security",
  "moderator",
  "moderation",
]);

export function normalizeShellNameName(value) {
  return String(value || "").trim().toLowerCase();
}

export function validateShellNameName(value) {
  const name = normalizeShellNameName(value);
  const errors = [];
  if (!SHELLNAME_NAME_PATTERN.test(name)) errors.push("ShellName must be 3-32 characters using lowercase letters, numbers, underscores, or hyphens.");
  if (RESERVED_SHELLNAMES.has(name)) errors.push("That ShellName is reserved.");
  return { ok: errors.length === 0, name, errors };
}

export function normalizeForestHost(value) {
  const source = String(value || "").trim();
  try {
    const url = source.includes("://") ? new URL(source) : new URL(`https://${source}`);
    return url.hostname.toLowerCase();
  } catch {
    return source.replace(/^https?:\/\//iu, "").split("/")[0].toLowerCase();
  }
}

export function canonicalShellNameSiteUrl(value) {
  const url = new URL(String(value || ""));
  if (url.protocol !== "https:") throw new Error("ShellName site URL must be public HTTPS.");
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/u, "/") || "/";
  return url.toString();
}

export function buildShellNamePayload({
  name,
  forest,
  siteUrl,
  publicKey,
  bundleFingerprint = "",
  createdAt,
  updatedAt,
  extensions = {},
}) {
  const cleanName = validateShellNameName(name).name;
  const forestHost = normalizeForestHost(forest);
  const canonicalSiteUrl = canonicalShellNameSiteUrl(siteUrl);
  const publicKeyText = typeof publicKey === "string" ? publicKey : publicKeyToText(publicKey);
  const timestamp = String(updatedAt || createdAt || new Date().toISOString());
  return {
    protocol: SHELLNAME_PROTOCOL,
    version: SHELLNAME_VERSION,
    name: cleanName,
    forest: forestHost,
    fullName: `@${cleanName}@${forestHost}`,
    siteUrl: canonicalSiteUrl,
    publicKey: publicKeyText,
    bundleFingerprint: String(bundleFingerprint || ""),
    ...(updatedAt ? { updatedAt: timestamp } : { createdAt: timestamp }),
    requiredFeatures: [...SHELLNAME_REQUIRED_FEATURES],
    optionalFeatures: [...SHELLNAME_OPTIONAL_FEATURES],
    extensions: extensions && typeof extensions === "object" && !Array.isArray(extensions) ? JSON.parse(JSON.stringify(extensions)) : {},
  };
}

export function signShellNameRecord(payload, secretKey) {
  const cleanPayload = {
    ...payload,
    name: normalizeShellNameName(payload.name),
    forest: normalizeForestHost(payload.forest),
    fullName: `@${normalizeShellNameName(payload.name)}@${normalizeForestHost(payload.forest)}`,
    siteUrl: canonicalShellNameSiteUrl(payload.siteUrl),
  };
  return {
    ...cleanPayload,
    signature: signatureToText(signBytes(encodeText(canonicalJson(cleanPayload)), secretKey)),
  };
}

export function verifyShellNameRecord(record, expected = {}) {
  const source = objectRecord(record);
  const errors = [];
  const nameCheck = validateShellNameName(source.name);
  if (!nameCheck.ok) errors.push(...nameCheck.errors);
  const forest = normalizeForestHost(source.forest);
  if (source.protocol !== SHELLNAME_PROTOCOL) errors.push("ShellName protocol mismatch.");
  if (Number(source.version) !== SHELLNAME_VERSION) errors.push("Unsupported ShellName version.");
  if (expected.name && nameCheck.name !== normalizeShellNameName(expected.name)) errors.push("ShellName record name mismatch.");
  if (expected.forest && forest !== normalizeForestHost(expected.forest)) errors.push("ShellName forest mismatch.");
  if (source.fullName !== `@${nameCheck.name}@${forest}`) errors.push("ShellName full name mismatch.");
  if (Array.isArray(source.requiredFeatures) && source.requiredFeatures.length > 0) errors.push("ShellName record declares unsupported required features.");
  if (!Array.isArray(source.optionalFeatures)) errors.push("ShellName optional features must be an array.");
  let siteUrl = "";
  try {
    siteUrl = canonicalShellNameSiteUrl(source.siteUrl);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "ShellName site URL is invalid.");
  }
  const publicKey = String(source.publicKey || "");
  if (!publicKey) errors.push("ShellName public key is required.");
  const payload = { ...source };
  delete payload.signature;
  const signature = safeBytes(source.signature);
  const key = safeBytes(publicKey);
  if (!signature || !key || !verifyBytes(encodeText(canonicalJson(payload)), signature, key)) {
    errors.push("ShellName signature failed.");
  }
  return {
    ok: errors.length === 0,
    errors,
    name: nameCheck.name,
    forest,
    fullName: `@${nameCheck.name}@${forest}`,
    siteUrl,
    publicKey,
    bundleFingerprint: String(source.bundleFingerprint || ""),
    record: source,
  };
}

function safeBytes(value) {
  try {
    return value ? textToBytes(String(value)) : null;
  } catch {
    return null;
  }
}

function objectRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
