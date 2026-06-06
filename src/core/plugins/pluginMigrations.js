import { normalizePluginState } from "./pluginRegistry.js";
import { validatePluginManifest } from "./pluginManifest.js";

export function migratePluginState(plugins = {}, manifests = []) {
  const normalized = normalizePluginState(plugins);
  const manifestIds = new Set();
  for (const manifest of manifests) {
    const validation = validatePluginManifest(manifest);
    if (validation.ok) {
      manifestIds.add(validation.normalized.id);
    }
  }

  const warnings = [];
  for (const entry of normalized.installed) {
    if (!manifestIds.has(entry.id)) {
      warnings.push(`This workspace uses plugin ${entry.id}, but it is not installed. Its state is preserved.`);
    }
  }
  for (const id of Object.keys(normalized.state)) {
    if (!normalized.installed.some((entry) => entry.id === id)) {
      warnings.push(`This workspace has preserved state for plugin ${id}, but the plugin is not installed.`);
    }
  }

  return {
    plugins: normalized,
    warnings,
  };
}
