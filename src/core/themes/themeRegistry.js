import { validateThemeManifest } from "./themeManifest.js";
import { BUILTIN_THEMES, DEFAULT_ADMIN_THEME, QUIET_FEED_THEME } from "./builtinThemes.js";

export function createThemeRegistry(manifests = []) {
  const frontend = new Map();
  const admin = new Map();

  for (const manifest of [...BUILTIN_THEMES, ...manifests]) {
    const validation = validateThemeManifest(manifest);
    if (!validation.ok) {
      throw new Error(`Invalid theme manifest: ${validation.errors.join("; ")}`);
    }
    const normalized = {
      ...validation.normalized,
      publicAssets: cloneRecord(manifest.publicAssets),
      slots: Array.isArray(manifest.slots) ? [...manifest.slots] : [],
      budgets: cloneRecord(manifest.budgets),
    };
    if (normalized.type === "postsnail-frontend-theme") {
      frontend.set(normalized.id, normalized);
    }
    if (normalized.type === "postsnail-admin-theme") {
      admin.set(normalized.id, normalized);
    }
  }

  return {
    frontend,
    admin,
    listFrontendThemes() {
      return [...frontend.values()].map(cloneJson);
    },
    listAdminThemes() {
      return [...admin.values()].map(cloneJson);
    },
    getFrontendTheme(id) {
      return cloneJson(frontend.get(String(id || "")));
    },
    getAdminTheme(id) {
      return cloneJson(admin.get(String(id || "")));
    },
  };
}

export function resolveFrontendTheme(appearance = {}, registry = createThemeRegistry()) {
  const id = String(appearance?.frontendTheme || QUIET_FEED_THEME.id);
  return registry.getFrontendTheme(id) || registry.getFrontendTheme(QUIET_FEED_THEME.id) || cloneJson(QUIET_FEED_THEME);
}

export function resolveAdminThemeTokens(appearance = {}, registry = createThemeRegistry()) {
  const id = String(appearance?.adminTheme || DEFAULT_ADMIN_THEME.id);
  const theme = registry.getAdminTheme(id) || registry.getAdminTheme(DEFAULT_ADMIN_THEME.id) || DEFAULT_ADMIN_THEME;
  return cloneRecord(theme.tokens);
}

function cloneRecord(value) {
  return cloneJson(value && typeof value === "object" && !Array.isArray(value) ? value : {});
}

function cloneJson(value) {
  return typeof value === "undefined" ? undefined : JSON.parse(JSON.stringify(value));
}
