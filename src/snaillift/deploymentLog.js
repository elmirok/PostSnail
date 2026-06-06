const SECRET_KEY_PATTERN = /(token|secret|authorization|password|apiKey|apiToken)/iu;
const VALID_STATUSES = new Set(["success", "failed", "verified", "prepared"]);

export function redactDeploymentSecrets(value) {
  if (Array.isArray(value)) return value.map(redactDeploymentSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? "[redacted]" : redactDeploymentSecrets(nested),
    ]),
  );
}

export function createDeploymentLogEntry(source = {}) {
  const clean = redactDeploymentSecrets(source);
  return {
    provider: String(clean.provider || "unknown"),
    siteUrl: String(clean.siteUrl || ""),
    deploymentUrl: String(clean.deploymentUrl || ""),
    bundleFingerprint: String(clean.bundleFingerprint || ""),
    startedAt: String(clean.startedAt || new Date().toISOString()),
    finishedAt: String(clean.finishedAt || ""),
    status: VALID_STATUSES.has(clean.status) ? clean.status : "failed",
    forestAnnounced: Boolean(clean.forestAnnounced),
    message: String(clean.message || ""),
  };
}
