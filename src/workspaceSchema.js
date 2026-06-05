export const WORKSPACE_SCHEMA = "postsnail-workspace-data";
export const RAW_PRIVATE_KEY_ERROR = "Workspace data must not contain raw private signing keys.";

export function createWorkspaceData(source = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  assertNoRawPrivateKeys(source);
  const settings = cleanObject(source.settings);
  return {
    schema: WORKSPACE_SCHEMA,
    version: Number.isInteger(source.version) ? source.version : 1,
    createdAt: String(source.createdAt || now),
    updatedAt: String(options.updatedAt || source.updatedAt || now),
    profile: cleanObject(source.profile),
    posts: cleanArray(source.posts),
    assets: cleanArray(source.assets),
    identity: cleanObject(source.identity),
    settings,
    commitHistory: cleanArray(source.commitHistory),
    plugins: normalizePlugins(source.plugins),
    moderation: normalizeModeration(source.moderation),
    trackerUrls: normalizeTrackerUrls(source.trackerUrls, settings),
    exportHistory: cleanArray(source.exportHistory),
  };
}

export function assertNoRawPrivateKeys(value) {
  scanForRawPrivateKeys(value, []);
}

function scanForRawPrivateKeys(value, path) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForRawPrivateKeys(item, [...path, String(index)]));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (isRawPrivateKeyName(key)) {
      throw new Error(RAW_PRIVATE_KEY_ERROR);
    }
    scanForRawPrivateKeys(nested, [...path, key]);
  }
}

function isRawPrivateKeyName(key) {
  return new Set([
    "secretKey",
    "privateKey",
    "rawPrivateKey",
    "rawSecretKey",
    "privateSigningKey",
    "secretSigningKey",
    "signingSecretKey",
  ]).has(String(key));
}

function normalizePlugins(value) {
  const source = cleanObject(value);
  return {
    installed: cleanArray(source.installed),
    lock: cleanObject(source.lock),
    state: cleanObject(source.state),
  };
}

function normalizeModeration(value) {
  const source = cleanObject(value);
  return {
    approvedComments: cleanArray(source.approvedComments),
    rejectedComments: cleanArray(source.rejectedComments),
    blockedPublicKeys: cleanArray(source.blockedPublicKeys),
  };
}

function normalizeTrackerUrls(value, settings) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(settings.preferredTrackers || "")
    .split(/[\n,]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanArray(value) {
  return Array.isArray(value) ? cloneJson(value) : [];
}

function cleanObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? cloneJson(value) : {};
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}
