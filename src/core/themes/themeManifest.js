import { checkRequiredFeatures } from "../../compatibility.js";
import { normalizeStringList } from "../plugins/pluginPermissions.js";

export const KNOWN_THEME_FEATURES = [
  "frontend-theme",
  "admin-theme",
  "template-slots",
  "route-assets",
  "admin-theme-tokens",
];

export function validateThemeManifest(manifest) {
  const errors = [];
  const warnings = [];
  const source = objectRecord(manifest);

  if (source !== manifest || Object.keys(source).length === 0) {
    errors.push("Theme manifest must be an object.");
  }
  if (source.protocol !== "postsnail-theme-v1") {
    errors.push("Theme manifest protocol must be postsnail-theme-v1.");
  }
  if (!["postsnail-frontend-theme", "postsnail-admin-theme"].includes(source.type)) {
    errors.push("Theme type must be postsnail-frontend-theme or postsnail-admin-theme.");
  }
  if (!isValidId(source.id)) {
    errors.push("Theme id must be lowercase letters, numbers, and hyphens.");
  }
  if (!String(source.name || "").trim()) {
    errors.push("Theme name is required.");
  }
  if (!String(source.version || "").trim()) {
    errors.push("Theme version is required.");
  }

  const featureCheck = checkRequiredFeatures(source, KNOWN_THEME_FEATURES);
  errors.push(...featureCheck.errors);

  if (source.type === "postsnail-frontend-theme") {
    validateFrontendTheme(source, errors);
  }
  if (source.type === "postsnail-admin-theme") {
    validateAdminTheme(source, errors);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalized: {
      protocol: "postsnail-theme-v1",
      type: String(source.type || ""),
      id: String(source.id || "").trim(),
      name: String(source.name || "").trim(),
      version: String(source.version || "").trim(),
      requiredFeatures: normalizeStringList(source.requiredFeatures),
      optionalFeatures: normalizeStringList(source.optionalFeatures),
      extensions: cloneObject(source.extensions),
      templates: cloneObject(source.templates),
      assets: cloneObject(source.assets),
      tokens: cloneObject(source.tokens),
      settings: cloneObject(source.settings),
    },
  };
}

function validateFrontendTheme(source, errors) {
  const templates = objectRecord(source.templates);
  for (const slot of ["home", "post", "archive", "tag"]) {
    if (!isSafeRelativePath(templates[slot])) {
      errors.push(`Frontend theme template is required and must be safe: ${slot}`);
    }
  }

  const assets = objectRecord(source.assets);
  for (const path of [...normalizeStringList(assets.css), ...normalizeStringList(assets.js)]) {
    if (!isSafeRelativePath(path)) {
      errors.push(`Frontend theme asset must be a safe relative path: ${path}`);
    }
  }
}

function validateAdminTheme(source, errors) {
  const tokens = objectRecord(source.tokens);
  if (Object.keys(tokens).length === 0) {
    errors.push("Admin theme tokens are required.");
  }
  for (const [name, value] of Object.entries(tokens)) {
    if (!name.startsWith("--ps-")) {
      errors.push("Admin theme tokens must use --ps- names.");
    }
    if (typeof value !== "string") {
      errors.push(`Admin theme token value must be a string: ${name}`);
    }
  }

  const assets = objectRecord(source.assets);
  if (source.runtime || source.entry || normalizeStringList(assets.js).length > 0) {
    errors.push("Admin themes must not declare JavaScript runtime assets.");
  }
}

function isValidId(value) {
  return /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/u.test(String(value || ""));
}

function isSafeRelativePath(value) {
  const text = String(value || "").trim();
  return Boolean(text) && !text.startsWith("/") && !text.includes("..") && !/^[a-z]+:/iu.test(text);
}

function objectRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cloneObject(value) {
  return JSON.parse(JSON.stringify(objectRecord(value)));
}
