export const WORKSPACE_SCHEMA = "postsnail-workspace-data";
export const RAW_PRIVATE_KEY_ERROR = "Workspace data must not contain raw private signing keys.";
const SECRET_LIKE_FIELD_PATTERN = /(api[-_]?key|apiKey|apiToken|token|secret|authorization|password)/iu;
const PRESERVED_SETTINGS_SECRET_KEYS = new Set([
  "snailLiftSurgeToken",
]);

export function createWorkspaceData(source = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  assertNoRawPrivateKeys(source);
  const settings = stripSecretLikeFields(cleanObject(source.settings), {
    allowKeys: PRESERVED_SETTINGS_SECRET_KEYS,
  });
  return {
    schema: WORKSPACE_SCHEMA,
    version: Number.isInteger(source.version) ? source.version : 1,
    migratedFromLegacy: Boolean(source.migratedFromLegacy),
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
    shellNames: cleanArray(source.shellNames),
    appearance: normalizeAppearance(source.appearance),
    exportHistory: normalizeExportHistory(source.exportHistory),
    extensions: cleanObject(source.extensions),
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

function normalizeAppearance(value) {
  const source = cleanObject(value);
  return {
    frontendTheme: String(source.frontendTheme || "quiet-feed").trim() || "quiet-feed",
    adminTheme: String(source.adminTheme || "default").trim() || "default",
    themeSettings: cleanObject(source.themeSettings),
  };
}

function normalizeExportHistory(value) {
  return cleanArray(value).map((entry) => stripSecretLikeFields(entry));
}

function stripSecretLikeFields(value, options = {}) {
  const allowKeys = options.allowKeys || new Set();
  if (Array.isArray(value)) return value.map((entry) => stripSecretLikeFields(entry));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SECRET_LIKE_FIELD_PATTERN.test(key) || allowKeys.has(key))
      .map(([key, nested]) => [key, stripSecretLikeFields(nested)]),
  );
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
