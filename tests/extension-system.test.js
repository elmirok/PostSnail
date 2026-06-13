import assert from "node:assert/strict";
import { test } from "node:test";
import { unzipSync } from "../vendor/fflate/browser.js";

import { normalizePost } from "../src/content.js";
import { generateSigningKeyPair } from "../src/crypto.js";
import { buildStaticExport } from "../src/exporter.js";
import {
  createPluginRegistry,
  disablePlugin,
  enablePlugin,
  installPlugin,
} from "../src/core/plugins/pluginRegistry.js";
import { planPluginHooks } from "../src/core/plugins/pluginHooks.js";
import { migratePluginState } from "../src/core/plugins/pluginMigrations.js";
import {
  createThemeRegistry,
  resolveAdminThemeTokens,
  resolveFrontendTheme,
} from "../src/core/themes/themeRegistry.js";
import { QUIET_FEED_THEME } from "../src/core/themes/builtinThemes.js";
import { TEMPLATE_SLOTS } from "../src/core/themes/templateSlots.js";
import { resolveRouteAssets } from "../src/core/assets/routeAssets.js";
import {
  getOfficialPluginCatalog,
  POSTSNAIL_COMMENTS_PLUGIN_ID,
  getOfficialPluginManifest,
  isPluginEnabled,
  POSTSNAIL_PAGES_PLUGIN_ID,
  POSTSNAIL_SNAILLIFT_PLUGIN_ID,
} from "../src/core/plugins/officialCatalog.js";

const decoder = new TextDecoder();

function decodeText(bytes) {
  return decoder.decode(bytes);
}

function commentsManifest() {
  return {
    protocol: "postsnail-plugin-v1",
    id: "postsnail-comments",
    name: "PostSnail Comments",
    version: "0.1.0",
    requiredFeatures: [],
    optionalFeatures: ["route-assets"],
    capabilities: ["exportRoutes", "runtimeAssets", "storePluginState"],
    permissions: ["read:posts", "write:pluginState", "export:routes"],
    export: { hooks: ["export:routes", "export:assets"] },
    runtime: {
      entry: "runtime/comments.js",
      css: ["runtime/comments.css"],
      loadWhen: ["routeType:post", "feature:comments-enabled"],
    },
    state: { schemaVersion: 1 },
    budgets: { runtimeJsMaxKb: 30, runtimeCssMaxKb: 15 },
  };
}

test("plugin registry installs, enables, disables, and resolves validated manifests without mutation", () => {
  const original = { installed: [], lock: {}, state: { "postsnail-comments": { mode: "kept" } } };
  const installed = installPlugin(original, commentsManifest());
  assert.deepEqual(original.installed, []);
  assert.equal(installed.installed[0].id, "postsnail-comments");
  assert.equal(installed.installed[0].enabled, false);
  assert.match(installed.lock["postsnail-comments"], /^sha3-512:/);
  assert.deepEqual(installed.state["postsnail-comments"], { mode: "kept" });

  const enabled = enablePlugin(installed, "postsnail-comments");
  const disabled = disablePlugin(enabled, "postsnail-comments");
  assert.equal(enabled.installed[0].enabled, true);
  assert.equal(disabled.installed[0].enabled, false);

  const registry = createPluginRegistry([commentsManifest()], enabled);
  assert.deepEqual(registry.listInstalled().map((plugin) => plugin.id), ["postsnail-comments"]);
  assert.deepEqual(registry.listEnabled().map((plugin) => plugin.id), ["postsnail-comments"]);
  assert.equal(registry.resolvePlugin("postsnail-comments").manifest.name, "PostSnail Comments");
});

test("plugin hook planner returns deterministic structured plans and never executes plugin code", () => {
  const installed = enablePlugin(installPlugin({ installed: [], lock: {}, state: {} }, commentsManifest()), "postsnail-comments");
  const registry = createPluginRegistry([commentsManifest()], installed);

  assert.deepEqual(planPluginHooks(registry, "export:routes"), [
    {
      pluginId: "postsnail-comments",
      hook: "export:routes",
      order: 0,
      capabilities: ["exportRoutes", "runtimeAssets", "storePluginState"],
      permissions: ["read:posts", "write:pluginState", "export:routes"],
    },
  ]);
  assert.deepEqual(planPluginHooks(registry, "export:feeds"), []);
  assert.throws(() => planPluginHooks(registry, "global:hidden"), /Unsupported plugin hook/);
});

test("plugin migration preserves missing plugin state and unknown fields with warnings", () => {
  const migrated = migratePluginState(
    {
      installed: [{ id: "missing-widget", version: "9.0.0", enabled: true, extra: "preserve" }],
      lock: { "missing-widget": "sha3-512:old" },
      state: { "missing-widget": { schemaVersion: 99, privateMode: true } },
    },
    [commentsManifest()],
  );

  assert.deepEqual(migrated.plugins.installed[0], {
    id: "missing-widget",
    version: "9.0.0",
    enabled: true,
    extra: "preserve",
  });
  assert.deepEqual(migrated.plugins.state["missing-widget"], { schemaVersion: 99, privateMode: true });
  assert.match(migrated.warnings.join("\n"), /missing-widget.*not installed/i);
});

test("theme registry resolves quiet-feed defaults and CSS-variable-only admin themes", () => {
  const registry = createThemeRegistry([
    QUIET_FEED_THEME,
    {
      protocol: "postsnail-theme-v1",
      type: "postsnail-admin-theme",
      id: "shell-night",
      name: "Shell Night",
      version: "1.0.0",
      requiredFeatures: [],
      tokens: {
        "--ps-bg": "#101318",
        "--ps-text": "#f4f1e8",
      },
    },
  ]);

  assert.equal(resolveFrontendTheme({}, registry).id, "quiet-feed");
  assert.equal(resolveFrontendTheme({ frontendTheme: "missing-theme" }, registry).id, "quiet-feed");
  assert.deepEqual(resolveAdminThemeTokens({ adminTheme: "shell-night" }, registry), {
    "--ps-bg": "#101318",
    "--ps-text": "#f4f1e8",
  });
  assert.ok(TEMPLATE_SLOTS.includes("siteFooter"));
});

test("route asset resolver combines theme and enabled plugin assets only for matching routes", () => {
  const pluginState = enablePlugin(installPlugin({ installed: [], lock: {}, state: {} }, commentsManifest()), "postsnail-comments");
  const registry = createPluginRegistry([commentsManifest()], pluginState);
  const postRoute = resolveRouteAssets(
    { route: "/posts/hello/", type: "post", template: "post", features: ["comments-enabled"] },
    QUIET_FEED_THEME,
    registry.listEnabled(),
  );
  const homeRoute = resolveRouteAssets(
    { route: "/", type: "home", template: "home", features: [] },
    QUIET_FEED_THEME,
    registry.listEnabled(),
  );

  assert.deepEqual(postRoute.assets, [
    "/themes/quiet-feed/theme.css",
    "/plugins/postsnail-comments/runtime/comments.js",
    "/plugins/postsnail-comments/runtime/comments.css",
  ]);
  assert.deepEqual(postRoute.plugins, ["postsnail-comments"]);
  assert.deepEqual(homeRoute.assets, ["/themes/quiet-feed/theme.css"]);
  assert.deepEqual(homeRoute.plugins, []);
});

test("static export declares optional plugin, theme, and route asset metadata without private state", async () => {
  const keys = generateSigningKeyPair();
  const post = normalizePost({
    id: "p1",
    title: "Extension Metadata",
    body: "Public body only.",
    tags: ["extensions"],
    status: "published",
    createdAt: "2026-06-05T00:00:00.000Z",
  });
  post.features = ["comments-enabled"];
  const plugins = enablePlugin(
    installPlugin(
      {
        installed: [],
        lock: {},
        state: { "postsnail-comments": { token: "private-plugin-token" } },
      },
      commentsManifest(),
    ),
    "postsnail-comments",
  );

  const result = await buildStaticExport({
    profile: { siteTitle: "Extension Site", handle: "ext", siteUrl: "https://ext.example" },
    posts: [post],
    plugins,
    appearance: { frontendTheme: "quiet-feed" },
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
    generatedAt: "2026-06-05T00:00:00.000Z",
  });
  const files = unzipSync(result.zipBytes);
  const manifest = JSON.parse(decodeText(files["postsnail.manifest.json"]));
  const combined = Object.values(files).map(decodeText).join("\n");

  assert.ok(manifest.optionalFeatures.includes("themes"));
  assert.ok(manifest.optionalFeatures.includes("route-assets"));
  assert.equal(manifest.extensions.themes.frontend.id, "quiet-feed");
  assert.equal(manifest.extensions.plugins["postsnail-comments"].version, "0.1.0");
  assert.deepEqual(manifest.extensions.routeAssets["/posts/extension-metadata/"].plugins, ["postsnail-comments"]);
  assert.doesNotMatch(combined, /private-plugin-token/);
});

test("official plugin catalog exposes SnailLift as a bundled admin-only extension", () => {
  const catalog = getOfficialPluginCatalog();
  const manifest = getOfficialPluginManifest(POSTSNAIL_SNAILLIFT_PLUGIN_ID);

  assert.deepEqual(catalog.map((plugin) => plugin.id).sort(), [
    "postsnail-comments",
    "postsnail-pages",
    "postsnail-snaillift",
  ]);
  assert.equal(manifest.id, "postsnail-snaillift");
  assert.equal(manifest.name, "SnailLift");
  assert.deepEqual(manifest.capabilities, ["adminPanel", "storePluginState"]);
  assert.deepEqual(manifest.permissions, ["deploy:provider", "fetch:external", "write:pluginState"]);
  assert.deepEqual(manifest.runtime, {});
  assert.equal(isPluginEnabled({ installed: [] }, "postsnail-snaillift"), false);

  const installed = enablePlugin(
    installPlugin({ installed: [], lock: {}, state: { "postsnail-snaillift": { provider: "surge" } } }, manifest),
    "postsnail-snaillift",
  );
  assert.equal(isPluginEnabled(installed, "postsnail-snaillift"), true);
  assert.deepEqual(installed.state["postsnail-snaillift"], { provider: "surge" });
});

test("official plugin catalog exposes PostSnail Pages as a bundled CMS extension", () => {
  const manifest = getOfficialPluginManifest(POSTSNAIL_PAGES_PLUGIN_ID);

  assert.equal(manifest.id, "postsnail-pages");
  assert.equal(manifest.name, "PostSnail Pages");
  assert.deepEqual(manifest.capabilities, [
    "adminPanel",
    "contentTypes",
    "exportRoutes",
    "exportSitemap",
    "storePluginState",
  ]);
  assert.deepEqual(manifest.permissions, [
    "read:posts",
    "read:assets",
    "write:pluginState",
    "export:routes",
    "export:sitemap",
    "export:manifestExtensions",
  ]);
  assert.deepEqual(manifest.runtime, {});
  assert.equal(isPluginEnabled({ installed: [] }, "postsnail-pages"), false);
});

test("official plugin catalog exposes PostSnail Comments as a bundled moderation extension", () => {
  const manifest = getOfficialPluginManifest(POSTSNAIL_COMMENTS_PLUGIN_ID);

  assert.equal(manifest.id, "postsnail-comments");
  assert.equal(manifest.name, "PostSnail Comments");
  assert.deepEqual(manifest.capabilities, [
    "adminPanel",
    "runtimeAssets",
    "storePluginState",
  ]);
  assert.deepEqual(manifest.permissions, [
    "read:posts",
    "read:pluginState",
    "write:pluginState",
    "export:assets",
    "export:manifestExtensions",
  ]);
  assert.deepEqual(manifest.runtime, {
    entry: "runtime/comments.js",
    css: ["runtime/comments.css"],
    loadWhen: ["routeType:post", "feature:comments-enabled"],
  });
  assert.equal(isPluginEnabled({ installed: [] }, "postsnail-comments"), false);
});
