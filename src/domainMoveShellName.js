import {
  buildShellNamePayload,
  normalizeForestHost,
  normalizeShellNameName,
  signShellNameRecord,
} from "./shellnames.js";

export function findShellNameForMove(shellNames, { forestUrl, publicKey, name = "" } = {}) {
  const list = Array.isArray(shellNames) ? shellNames : [];
  const forest = normalizeForestHost(forestUrl || "https://forest.postsnail.org");
  const key = String(publicKey || "");
  const desiredName = normalizeShellNameName(name);
  return list.find((item) => {
    if (!item || typeof item !== "object") return false;
    if (desiredName && normalizeShellNameName(item.name) !== desiredName) return false;
    if (key && String(item.publicKey || item.record?.publicKey || "") !== key) return false;
    return normalizeForestHost(item.forest || item.record?.forest || forest) === forest;
  }) || null;
}

export function buildMovedShellNameUpdate({
  shellName,
  forestUrl,
  toUrl,
  publicKey,
  bundleFingerprint,
  secretKey,
  updatedAt,
}) {
  if (!shellName?.name) return null;
  const payload = buildShellNamePayload({
    name: shellName.name,
    forest: forestUrl || shellName.forest || shellName.record?.forest || "https://forest.postsnail.org",
    siteUrl: toUrl,
    publicKey,
    bundleFingerprint,
    updatedAt: updatedAt || new Date().toISOString(),
    extensions: shellName.record?.extensions || shellName.extensions || {},
  });
  return {
    name: payload.name,
    record: signShellNameRecord(payload, secretKey),
  };
}

export function shellNameFromForestResponse({ result = {}, record, shellName = {}, forestUrl, publicKey }) {
  const forest = result.forest || record.forest || shellName.forest || normalizeForestHost(forestUrl || "https://forest.postsnail.org");
  const name = result.name || record.name || shellName.name;
  return {
    ...shellName,
    forest,
    name,
    fullName: result.fullName || record.fullName || shellName.fullName || `@${name}@${forest}`,
    record: result.record || record,
    siteUrl: result.siteUrl || record.siteUrl,
    publicKey: result.publicKey || publicKey || record.publicKey || shellName.publicKey || "",
    bundleFingerprint: result.bundleFingerprint || record.bundleFingerprint || shellName.bundleFingerprint || "",
    status: result.status || shellName.status || "active",
    expiresAt: result.expiresAt || shellName.expiresAt || "",
    updatedAt: result.updatedAt || record.updatedAt || new Date().toISOString(),
  };
}
