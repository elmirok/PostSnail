import { canonicalJson } from "../../canonical.js";
import { encodeText } from "../../bytes.js";
import { sha3Hex } from "../../crypto.js";
import { validatePluginManifest } from "./pluginManifest.js";

export function createPluginRegistry(manifests = [], workspacePlugins = {}) {
  const manifestMap = new Map();
  const plugins = normalizePluginState(workspacePlugins);
  const workspaceManifests = plugins.installed.map((entry) => entry.manifest).filter(Boolean);
  for (const manifest of [...manifests, ...workspaceManifests]) {
    const validation = validatePluginManifest(manifest);
    if (!validation.ok) {
      throw new Error(`Invalid plugin manifest: ${validation.errors.join("; ")}`);
    }
    manifestMap.set(validation.normalized.id, validation.normalized);
  }

  const installed = plugins.installed.map((entry) => {
    const manifest = manifestMap.get(entry.id) || null;
    return {
      ...entry,
      manifest,
      missing: !manifest,
    };
  });
  const warnings = installed
    .filter((entry) => entry.missing)
    .map((entry) => `This workspace uses plugin ${entry.id}, but it is not installed. Its state is preserved.`);

  return {
    warnings,
    plugins,
    manifests: manifestMap,
    listInstalled() {
      return installed.map(cloneJson);
    },
    listEnabled() {
      return installed.filter((entry) => entry.enabled && entry.manifest).map(cloneJson);
    },
    resolvePlugin(id) {
      const entry = installed.find((plugin) => plugin.id === id);
      return entry ? cloneJson(entry) : null;
    },
  };
}

export function installPlugin(state = {}, manifest) {
  const validation = validatePluginManifest(manifest);
  if (!validation.ok) {
    throw new Error(`Invalid plugin manifest: ${validation.errors.join("; ")}`);
  }
  const plugins = normalizePluginState(state);
  const normalized = validation.normalized;
  const existing = plugins.installed.find((entry) => entry.id === normalized.id);
  const entry = {
    ...(existing || {}),
    id: normalized.id,
    version: normalized.version,
    enabled: Boolean(existing?.enabled),
    manifest: normalized,
  };
  const installed = [
    ...plugins.installed.filter((item) => item.id !== normalized.id),
    entry,
  ].sort(comparePluginEntries);
  return {
    installed,
    lock: {
      ...plugins.lock,
      [normalized.id]: manifestHash(normalized),
    },
    state: plugins.state,
  };
}

export function enablePlugin(state = {}, id) {
  return setPluginEnabled(state, id, true);
}

export function disablePlugin(state = {}, id) {
  return setPluginEnabled(state, id, false);
}

export function normalizePluginState(value = {}) {
  const source = objectRecord(value);
  return {
    installed: normalizeInstalled(source.installed),
    lock: cloneRecord(source.lock),
    state: cloneRecord(source.state),
  };
}

function setPluginEnabled(state, id, enabled) {
  const plugins = normalizePluginState(state);
  const pluginId = String(id || "").trim();
  if (!plugins.installed.some((entry) => entry.id === pluginId)) {
    throw new Error(`Plugin is not installed: ${pluginId}`);
  }
  return {
    ...plugins,
    installed: plugins.installed.map((entry) => (
      entry.id === pluginId ? { ...entry, enabled } : entry
    )),
  };
}

function normalizeInstalled(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const source = objectRecord(entry);
      const id = String(source.id || "").trim();
      if (!id) return null;
      return {
        ...cloneRecord(source),
        id,
        version: String(source.version || ""),
        enabled: Boolean(source.enabled),
      };
    })
    .filter(Boolean)
    .sort(comparePluginEntries);
}

function manifestHash(manifest) {
  return `sha3-512:${sha3Hex(encodeText(canonicalJson(manifest)))}`;
}

function comparePluginEntries(a, b) {
  return String(a.id).localeCompare(String(b.id));
}

function objectRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cloneRecord(value) {
  return cloneJson(objectRecord(value));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}
