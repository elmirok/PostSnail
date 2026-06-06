export const KNOWN_PLUGIN_PERMISSIONS = [
  "read:posts",
  "write:posts",
  "read:pages",
  "write:pages",
  "read:assets",
  "write:assets",
  "read:profile",
  "write:profile",
  "read:manifest",
  "write:manifestExtensions",
  "read:pluginState",
  "write:pluginState",
  "export:routes",
  "export:assets",
  "export:sitemap",
  "export:feeds",
  "fetch:trackers",
  "fetch:external",
  "deploy:provider",
];

const DANGEROUS_PLUGIN_PERMISSIONS = new Set([
  "deploy:provider",
  "fetch:external",
  "write:manifestExtensions",
  "write:posts",
  "write:profile",
]);

export function validatePluginPermissions(permissions = []) {
  const normalized = normalizeStringList(permissions);
  const known = new Set(KNOWN_PLUGIN_PERMISSIONS);
  const errors = [];
  const warnings = [];

  for (const permission of normalized) {
    if (!known.has(permission)) {
      errors.push(`Unknown plugin permission: ${permission}`);
      continue;
    }
    if (DANGEROUS_PLUGIN_PERMISSIONS.has(permission)) {
      warnings.push(`Sensitive plugin permission requires creator review: ${permission}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    permissions: normalized,
  };
}

export function normalizeStringList(value = []) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const text = String(item || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}
