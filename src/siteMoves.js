import { encodeText } from "./bytes.js";
import { canonicalJson } from "./canonical.js";
import { publicKeyToText, signBytes, signatureToText, textToBytes, verifyBytes } from "./crypto.js";
import { SITE_MOVE_TYPE } from "./protocol.js";

export const SITE_MOVE_PROTOCOL = SITE_MOVE_TYPE;
export const SITE_MOVE_VERSION = 1;
export const SITE_MOVE_REQUIRED_FEATURES = [];
export const SITE_MOVE_OPTIONAL_FEATURES = ["forest-tracker"];
export const SITE_MOVE_MODES = new Set(["move", "mirror"]);

export function canonicalSiteMoveUrl(value) {
  const url = new URL(String(value || ""));
  if (url.protocol !== "https:") throw new Error("Site move URLs must be public HTTPS.");
  if (url.username || url.password) throw new Error("Site move URLs must not include credentials.");
  if (!isPublicHostname(url.hostname)) throw new Error("Site move URLs must be public HTTPS origins.");
  return `${url.origin}/`;
}

export function buildSiteMovePayload({
  mode,
  fromUrl,
  toUrl,
  publicKey,
  bundleFingerprint,
  createdAt,
  extensions = {},
}) {
  const cleanMode = normalizeSiteMoveMode(mode);
  const canonicalFromUrl = canonicalSiteMoveUrl(fromUrl);
  const canonicalToUrl = canonicalSiteMoveUrl(toUrl);
  if (canonicalFromUrl === canonicalToUrl) throw new Error("Site move source and destination must differ.");
  const publicKeyText = typeof publicKey === "string" ? publicKey : publicKeyToText(publicKey);
  const timestamp = String(createdAt || new Date().toISOString());
  const fingerprint = String(bundleFingerprint || "");
  if (!/^psn1-sha3-512-[a-f0-9]{128}$/iu.test(fingerprint)) {
    throw new Error("Site move bundle fingerprint must be a psn1-sha3-512 fingerprint.");
  }
  return {
    protocol: SITE_MOVE_PROTOCOL,
    version: SITE_MOVE_VERSION,
    mode: cleanMode,
    fromUrl: canonicalFromUrl,
    toUrl: canonicalToUrl,
    publicKey: publicKeyText,
    bundleFingerprint: fingerprint,
    createdAt: timestamp,
    requiredFeatures: [...SITE_MOVE_REQUIRED_FEATURES],
    optionalFeatures: [...SITE_MOVE_OPTIONAL_FEATURES],
    extensions: clonePlainObject(extensions),
  };
}

export function signSiteMoveRecord(payload, secretKey) {
  const cleanPayload = buildSiteMovePayload(payload);
  return {
    ...cleanPayload,
    signature: signatureToText(signBytes(encodeText(canonicalJson(cleanPayload)), secretKey)),
  };
}

export function verifySiteMoveRecord(record, expected = {}) {
  const source = objectRecord(record);
  const errors = [];
  if (source.protocol !== SITE_MOVE_PROTOCOL) errors.push("Site move protocol mismatch.");
  if (Number(source.version) !== SITE_MOVE_VERSION) errors.push("Unsupported site move version.");
  const mode = normalizeSiteMoveMode(source.mode, errors);
  if (expected.mode && mode !== expected.mode) errors.push("Site move mode mismatch.");
  let fromUrl = "";
  let toUrl = "";
  try {
    fromUrl = canonicalSiteMoveUrl(source.fromUrl);
    if (source.fromUrl !== fromUrl) errors.push("Site move source URL must be canonical.");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Site move source URL is invalid.");
  }
  try {
    toUrl = canonicalSiteMoveUrl(source.toUrl);
    if (source.toUrl !== toUrl) errors.push("Site move destination URL must be canonical.");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Site move destination URL is invalid.");
  }
  if (fromUrl && toUrl && fromUrl === toUrl) errors.push("Site move source and destination must differ.");
  if (expected.fromUrl && fromUrl !== canonicalSiteMoveUrl(expected.fromUrl)) errors.push("Site move source URL mismatch.");
  if (expected.toUrl && toUrl !== canonicalSiteMoveUrl(expected.toUrl)) errors.push("Site move destination URL mismatch.");
  if (!Array.isArray(source.requiredFeatures) || source.requiredFeatures.length > 0) {
    errors.push("Site move record declares unsupported required features.");
  }
  if (!Array.isArray(source.optionalFeatures)) errors.push("Site move optional features must be an array.");
  if (!source.extensions || typeof source.extensions !== "object" || Array.isArray(source.extensions)) {
    errors.push("Site move extensions must be an object.");
  }
  const publicKey = String(source.publicKey || "");
  if (!publicKey) errors.push("Site move public key is required.");
  if (expected.publicKey && publicKey !== String(expected.publicKey)) errors.push("Site move public key mismatch.");
  const fingerprint = String(source.bundleFingerprint || "");
  if (!/^psn1-sha3-512-[a-f0-9]{128}$/iu.test(fingerprint)) {
    errors.push("Site move bundle fingerprint must be a psn1-sha3-512 fingerprint.");
  }
  if (!source.createdAt || Number.isNaN(Date.parse(String(source.createdAt)))) {
    errors.push("Site move createdAt timestamp is invalid.");
  }
  const payload = { ...source };
  delete payload.signature;
  const signature = safeBytes(source.signature);
  const key = safeBytes(publicKey);
  if (!signature || !key || !verifyBytes(encodeText(canonicalJson(payload)), signature, key)) {
    errors.push("Site move signature failed.");
  }
  return {
    ok: errors.length === 0,
    errors,
    mode,
    fromUrl,
    toUrl,
    publicKey,
    bundleFingerprint: fingerprint,
    record: source,
  };
}

function normalizeSiteMoveMode(value, errors = null) {
  const mode = String(value || "").trim().toLowerCase();
  if (!SITE_MOVE_MODES.has(mode)) {
    if (errors) {
      errors.push("Site move mode must be move or mirror.");
      return mode || "move";
    }
    throw new Error("Site move mode must be move or mirror.");
  }
  return mode;
}

function isPublicHostname(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost")) return false;
  if (host === "0.0.0.0" || host.startsWith("127.") || host.startsWith("169.254.")) return false;
  if (/^10\./u.test(host) || /^192\.168\./u.test(host)) return false;
  const private172 = host.match(/^172\.(\d+)\./u);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(host)) return false;
  if (host.includes(":") || host.startsWith("[") || host.endsWith("]")) return false;
  return true;
}

function clonePlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : {};
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
