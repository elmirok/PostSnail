import {
  CURRENT_MANIFEST_VERSION,
  LEGACY_POSTSNAIL_PROTOCOL,
  POSTSNAIL_PROTOCOL,
  POSTSNAIL_PROTOCOL_VERSION,
  REQUIRED_CORE_FEATURES,
} from "./protocol.js";

export function checkRequiredFeatures(file, knownFeatures = REQUIRED_CORE_FEATURES) {
  const required = Array.isArray(file?.requiredFeatures) ? file.requiredFeatures.map(String) : [];
  const known = new Set(Array.isArray(knownFeatures) ? knownFeatures.map(String) : []);
  const unknownRequiredFeatures = required.filter((feature) => !known.has(feature));
  return {
    ok: unknownRequiredFeatures.length === 0,
    unknownRequiredFeatures,
    errors: unknownRequiredFeatures.map((feature) => `Unsupported required feature: ${feature}`),
  };
}

export function getOptionalExtension(file, name) {
  const extensions = objectRecord(file?.extensions);
  return cloneJson(extensions[String(name)]);
}

export function hasOptionalFeature(file, name) {
  return Array.isArray(file?.optionalFeatures) && file.optionalFeatures.map(String).includes(String(name));
}

export function isLegacyManifest(manifest) {
  const record = objectRecord(manifest);
  return (
    !record.protocol ||
    record.protocol === LEGACY_POSTSNAIL_PROTOCOL ||
    !record.version ||
    !Array.isArray(record.requiredFeatures) ||
    !Array.isArray(record.optionalFeatures)
  );
}

export function normalizeLegacyManifest(manifest) {
  const record = cloneJson(objectRecord(manifest));
  const normalized = {
    ...record,
    requiredFeatures: Array.isArray(record.requiredFeatures) ? record.requiredFeatures.map(String) : [...REQUIRED_CORE_FEATURES],
    optionalFeatures: Array.isArray(record.optionalFeatures) ? record.optionalFeatures.map(String) : [],
    extensions: objectRecord(record.extensions),
  };
  normalized.protocol = POSTSNAIL_PROTOCOL;
  normalized.version = Number(record.version || record.manifestVersion || CURRENT_MANIFEST_VERSION);
  return {
    ...normalized,
  };
}

export function assertSupportedVersion(file, currentVersion, label) {
  const version = versionFor(file);
  if (version > currentVersion) {
    throw new Error(`${label} was created by a newer PostSnail version.`);
  }
  if (version < 1) {
    throw new Error(`Unsupported ${label} version.`);
  }
  return version;
}

export function collectCompatibilityWarnings(file) {
  const warnings = [];
  const record = objectRecord(file);
  if (!record.protocol || record.protocol === LEGACY_POSTSNAIL_PROTOCOL) {
    warnings.push("Legacy PostSnail export: missing current protocol declaration.");
  }
  if (!Array.isArray(record.requiredFeatures) || !Array.isArray(record.optionalFeatures)) {
    warnings.push("Legacy PostSnail export: missing feature declarations.");
  }
  return warnings;
}

export function protocolMatches(value) {
  return value === POSTSNAIL_PROTOCOL || value === LEGACY_POSTSNAIL_PROTOCOL;
}

export function protocolVersionFor(file) {
  if (file?.protocol === LEGACY_POSTSNAIL_PROTOCOL) return 1;
  return Number(file?.version || POSTSNAIL_PROTOCOL_VERSION);
}

function versionFor(file) {
  const record = objectRecord(file);
  return Number(
    record.version ||
      record.manifestVersion ||
      record.identityVersion ||
      record.commitVersion ||
      POSTSNAIL_PROTOCOL_VERSION,
  );
}

function objectRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cloneJson(value) {
  return typeof value === "undefined" ? undefined : JSON.parse(JSON.stringify(value));
}
