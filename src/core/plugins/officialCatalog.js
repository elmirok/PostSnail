import { createPluginRegistry } from "./pluginRegistry.js";

export const POSTSNAIL_SNAILLIFT_PLUGIN_ID = "postsnail-snaillift";
export const POSTSNAIL_PAGES_PLUGIN_ID = "postsnail-pages";
export const POSTSNAIL_COMMENTS_PLUGIN_ID = "postsnail-comments";
export const POSTSNAIL_BADGES_PLUGIN_ID = "postsnail-badges";

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
    adminNavigation: {
      label: "SnailLift",
      group: "publish",
      surfacedIn: "generate",
    },
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

export const POSTSNAIL_PAGES_MANIFEST = {
  protocol: "postsnail-plugin-v1",
  id: POSTSNAIL_PAGES_PLUGIN_ID,
  name: "PostSnail Pages",
  version: "0.1.0",
  description: "Official CMS plugin for static pages, docs, navigation, and SEO fields.",
  author: "PostSnail",
  type: "official",
  requiredFeatures: [],
  optionalFeatures: ["route-assets", "themes"],
  extensions: {
    official: true,
    builtIn: true,
    cms: true,
    adminNavigation: {
      label: "Pages CMS",
      group: "plugin",
      tab: "pages",
    },
  },
  capabilities: ["adminPanel", "contentTypes", "exportRoutes", "exportSitemap", "storePluginState"],
  permissions: ["read:posts", "read:assets", "write:pluginState", "export:routes", "export:sitemap", "export:manifestExtensions"],
  admin: {
    entry: "admin/pages.js",
    loadWhen: ["admin:pages"],
  },
  export: {
    hooks: ["export:routes", "export:sitemap", "export:manifestExtensions"],
  },
  runtime: {},
  state: {
    schemaVersion: 1,
  },
  budgets: {
    exportTimeMaxMs: 1000,
  },
};

export const POSTSNAIL_COMMENTS_MANIFEST = {
  protocol: "postsnail-plugin-v1",
  id: POSTSNAIL_COMMENTS_PLUGIN_ID,
  name: "PostSnail Comments",
  version: "0.1.0",
  description: "Official signed comments plugin for approved static replies and future live tracker discovery.",
  author: "PostSnail",
  type: "official",
  requiredFeatures: [],
  optionalFeatures: ["comments", "route-assets"],
  extensions: {
    official: true,
    builtIn: true,
    moderation: true,
    adminNavigation: {
      label: "Comments",
      group: "plugin",
      tab: "comments",
    },
  },
  capabilities: ["adminPanel", "runtimeAssets", "storePluginState"],
  permissions: ["read:posts", "read:pluginState", "write:pluginState", "export:assets", "export:manifestExtensions"],
  admin: {
    entry: "admin/comments.js",
    loadWhen: ["admin:comments"],
  },
  export: {
    hooks: ["export:assets", "export:manifestExtensions"],
  },
  runtime: {
    entry: "runtime/comments.js",
    css: ["runtime/comments.css"],
    loadWhen: ["routeType:post", "feature:comments-enabled"],
  },
  state: {
    schemaVersion: 1,
  },
  budgets: {
    runtimeJsMaxKb: 40,
    runtimeCssMaxKb: 20,
  },
};

export const POSTSNAIL_BADGES_MANIFEST = {
  protocol: "postsnail-plugin-v1",
  id: POSTSNAIL_BADGES_PLUGIN_ID,
  name: "PostSnail Badges",
  version: "0.1.0",
  description: "Official signature badge collection plugin for importing public badge claims and publishing a collection page.",
  author: "PostSnail",
  type: "official",
  requiredFeatures: [],
  optionalFeatures: ["signature-badge", "forest-tracker"],
  extensions: {
    official: true,
    builtIn: true,
    collectible: true,
    adminNavigation: {
      label: "Badges",
      group: "plugin",
      tab: "badges",
    },
  },
  capabilities: ["adminPanel", "storePluginState", "exportRoutes", "exportManifestExtensions"],
  permissions: ["read:posts", "read:pluginState", "write:pluginState", "export:routes", "export:assets", "export:manifestExtensions"],
  admin: {
    entry: "admin/badges.js",
    loadWhen: ["admin:badges"],
  },
  export: {
    hooks: ["export:routes", "export:assets", "export:manifestExtensions"],
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
  return [POSTSNAIL_BADGES_MANIFEST, POSTSNAIL_COMMENTS_MANIFEST, POSTSNAIL_SNAILLIFT_MANIFEST, POSTSNAIL_PAGES_MANIFEST]
    .map(cloneJson)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
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
