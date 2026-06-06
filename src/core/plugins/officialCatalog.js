import { createPluginRegistry } from "./pluginRegistry.js";

export const POSTSNAIL_SNAILLIFT_PLUGIN_ID = "postsnail-snaillift";

export const POSTSNAIL_SNAILLIFT_MANIFEST = {
  protocol: "postsnail-plugin-v1",
  id: POSTSNAIL_SNAILLIFT_PLUGIN_ID,
  name: "SnailLift",
  version: "0.1.0",
  description: "Official deployment assistant for publishing public PostSnail Website ZIP output.",
  author: "PostSnail",
  type: "official",
  requiredFeatures: [],
  optionalFeatures: [],
  extensions: {
    official: true,
    builtIn: true,
    adminOnly: true,
  },
  capabilities: ["adminPanel", "storePluginState"],
  permissions: ["deploy:provider", "fetch:external", "write:pluginState"],
  admin: {
    entry: "admin/snaillift.js",
    loadWhen: ["admin:generate"],
  },
  export: {
    hooks: [],
  },
  runtime: {},
  state: {
    schemaVersion: 1,
  },
  budgets: {
    exportTimeMaxMs: 1000,
  },
};

export function getOfficialPluginCatalog() {
  return [cloneJson(POSTSNAIL_SNAILLIFT_MANIFEST)];
}

export function getOfficialPluginManifest(id) {
  const pluginId = String(id || "").trim();
  const manifest = getOfficialPluginCatalog().find((item) => item.id === pluginId);
  if (!manifest) {
    throw new Error(`Unknown official PostSnail plugin: ${pluginId}`);
  }
  return manifest;
}

export function isPluginEnabled(plugins = {}, id) {
  const registry = createPluginRegistry(getOfficialPluginCatalog(), plugins);
  return Boolean(registry.resolvePlugin(String(id || "").trim())?.enabled);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
