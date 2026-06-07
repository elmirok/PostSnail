import { checkRequiredFeatures } from "../../compatibility.js";
import { normalizeStringList, validatePluginPermissions } from "./pluginPermissions.js";
import { isSafeRelativePath } from "../pathSafety.js";

export { validatePluginPermissions } from "./pluginPermissions.js";

export const KNOWN_PLUGIN_FEATURES = [
  "plugin-manifest",
  "plugin-permissions",
  "route-assets",
  "adminPanel",
  "contentTypes",
  "exportAssets",
  "exportRoutes",
  "runtimeAssets",
  "storePluginState",
];

const KNOWN_PLUGIN_CAPABILITIES = new Set([
  "adminPanel",
  "contentTypes",
  "exportAssets",
  "exportRoutes",
  "exportSitemap",
  "exportFeeds",
  "exportManifestExtensions",
  "runtimeAssets",
  "storePluginState",
  "themeSlots",
]);

export function validatePluginManifest(manifest) {
  const errors = [];
  const warnings = [];
  const source = objectRecord(manifest);

  if (source !== manifest || Object.keys(source).length === 0) {
    errors.push("Plugin manifest must be an object.");
  }

  if (source.protocol !== "postsnail-plugin-v1") {
    errors.push("Plugin manifest protocol must be postsnail-plugin-v1.");
  }
  if (!isValidId(source.id)) {
    errors.push("Plugin id must be lowercase letters, numbers, and hyphens.");
  }
  if (!String(source.name || "").trim()) {
    errors.push("Plugin name is required.");
  }
  if (!String(source.version || "").trim()) {
    errors.push("Plugin version is required.");
  }

  const featureCheck = checkRequiredFeatures(source, KNOWN_PLUGIN_FEATURES);
  errors.push(...featureCheck.errors);

  const capabilities = normalizeStringList(source.capabilities);
  for (const capability of capabilities) {
    if (!KNOWN_PLUGIN_CAPABILITIES.has(capability)) {
      errors.push(`Unknown plugin capability: ${capability}`);
    }
  }

  const permissions = validatePluginPermissions(source.permissions);
  errors.push(...permissions.errors);
  warnings.push(...permissions.warnings);

  validateAdminDeclaration(source.admin, errors);
  validateRuntimeDeclaration(source.runtime, errors);
  validateExportDeclaration(source.export, errors);
  validateStateDeclaration(source.state, errors);
  validateBudgets(source.budgets, errors);

  const normalized = {
    protocol: "postsnail-plugin-v1",
    id: String(source.id || "").trim(),
    name: String(source.name || "").trim(),
    version: String(source.version || "").trim(),
    requiredFeatures: normalizeStringList(source.requiredFeatures),
    optionalFeatures: normalizeStringList(source.optionalFeatures),
    extensions: cloneObject(source.extensions),
    capabilities,
    permissions: permissions.permissions,
    admin: cloneObject(source.admin),
    export: cloneObject(source.export),
    runtime: cloneObject(source.runtime),
    state: cloneObject(source.state),
    budgets: cloneObject(source.budgets),
  };

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalized,
  };
}

function validateAdminDeclaration(admin, errors) {
  const record = objectRecord(admin);
  if (!record.entry) return;
  if (!isSafeRelativePath(record.entry)) {
    errors.push("Plugin admin entry must be a safe relative path.");
  }
  if (normalizeStringList(record.loadWhen).length === 0) {
    errors.push("Plugin admin entry must declare loadWhen.");
  }
}

function validateRuntimeDeclaration(runtime, errors) {
  const record = objectRecord(runtime);
  const hasRuntimeAssets = Boolean(record.entry) || normalizeStringList(record.css).length > 0 || normalizeStringList(record.js).length > 0;
  if (!hasRuntimeAssets) return;

  const loadWhen = normalizeStringList(record.loadWhen);
  if (loadWhen.length === 0) {
    errors.push("Plugin runtime assets must declare loadWhen.");
  }
  if (loadWhen.some((condition) => condition === "global" || condition === "all")) {
    errors.push("Plugin runtime assets must not load globally by default.");
  }
  for (const path of [record.entry, ...normalizeStringList(record.css), ...normalizeStringList(record.js)].filter(Boolean)) {
    if (!isSafeRelativePath(path)) {
      errors.push(`Plugin runtime asset must be a safe relative path: ${path}`);
    }
  }
}

function validateExportDeclaration(exportDeclaration, errors) {
  const record = objectRecord(exportDeclaration);
  if (!record.hooks) return;
  for (const hook of normalizeStringList(record.hooks)) {
    if (!/^[a-z]+:[A-Za-z-]+$/u.test(hook)) {
      errors.push(`Plugin export hook is not valid: ${hook}`);
    }
  }
}

function validateStateDeclaration(state, errors) {
  const record = objectRecord(state);
  if (record.schemaVersion === undefined) return;
  if (!Number.isInteger(Number(record.schemaVersion)) || Number(record.schemaVersion) < 1) {
    errors.push("Plugin state schemaVersion must be a positive integer.");
  }
}

function validateBudgets(budgets, errors) {
  const record = objectRecord(budgets);
  for (const [key, value] of Object.entries(record)) {
    if (!Number.isFinite(Number(value)) || Number(value) <= 0) {
      errors.push(`Plugin budget must be a positive number: ${key}`);
    }
  }
}

function isValidId(value) {
  return /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/u.test(String(value || ""));
}

function objectRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cloneObject(value) {
  return JSON.parse(JSON.stringify(objectRecord(value)));
}
