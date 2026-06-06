import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { migrateWorkspace } from "../src/migrations.js";
import { createRouteAssetMap } from "../src/core/assets/routeAssets.js";
import { validatePublicExportFiles } from "../src/core/export/safety.js";
import {
  validatePluginManifest,
  validatePluginPermissions,
} from "../src/core/plugins/pluginManifest.js";
import { validateThemeManifest } from "../src/core/themes/themeManifest.js";

const root = process.cwd();
const encoder = new TextEncoder();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function textBytes(value) {
  return encoder.encode(value);
}

const roadmapFiles = [
  "postsnail-master-roadmap-for-codex.md",
  "postsnail-core-foundation-plan.md",
  "compatibility-migrations-psep-codex-plan.md",
  "snaillift-codex-plan.md",
  "shellnames-codex-plan.md",
  "postsnail-plugin-theme-system-plan.md",
  "postsnail-pages-cms-plugin-plan-v2.md",
  "postsnail-comments-codex-plan.md",
  "postsnail-cli-headless-publisher-plan.md",
  "aurel-shellscribe-full-auto-workflow-plan.md",
  "forest-ux-polish-plan.md",
  "postsnail-reader-plan.md",
  "canopy-future-project-plan.md",
  "shellseed-decentralized-hosting-plan.md",
  "postsnail-inbox-mailsnail-future-plan.md",
  "postsnail-cloudflare-deploy-plan.md",
];

test("roadmap files live under docs/roadmap and master starts with Core Foundation Sprint 0", () => {
  for (const file of roadmapFiles) {
    assert.ok(existsSync(join(root, "docs/roadmap", file)), file);
  }

  const master = read("docs/roadmap/postsnail-master-roadmap-for-codex.md");
  assert.match(master, /## 0\. PostSnail Core Foundation/);
  assert.match(master, /\(postsnail-core-foundation-plan\.md\)/);
  assert.match(master, /\(postsnail-plugin-theme-system-plan\.md\)/);
  assert.match(master, /\(postsnail-pages-cms-plugin-plan-v2\.md\)/);
  assert.match(master, /\(shellseed-decentralized-hosting-plan\.md\)/);
  assert.ok(
    master.indexOf("## 0. PostSnail Core Foundation") < master.indexOf("## 1. Compatibility"),
    "Core Foundation must precede Compatibility/PSEP",
  );
  assert.doesNotMatch(master, /postsnail-plugin-theme-core-plan\.md/);
  assert.doesNotMatch(master, /postsnail-pages-cms-plugin-plan\.md\)/);
  assert.doesNotMatch(master, /shellseed-codex-plan\.md/);
});

test("plugin manifests validate ids, capabilities, permissions, feature gates, and route runtime declarations", () => {
  const manifest = {
    protocol: "postsnail-plugin-v1",
    id: "postsnail-comments",
    name: "PostSnail Comments",
    version: "0.1.0",
    requiredFeatures: [],
    optionalFeatures: ["route-assets"],
    extensions: { experimental: true },
    capabilities: ["adminPanel", "exportAssets", "runtimeAssets", "storePluginState"],
    permissions: ["read:posts", "write:pluginState", "export:assets", "fetch:trackers"],
    admin: { entry: "admin/comments.js", loadWhen: ["admin:comments"] },
    export: { hooks: ["build:routes", "build:assets"] },
    runtime: {
      entry: "runtime/comments.js",
      css: ["runtime/comments.css"],
      loadWhen: ["routeType:post", "feature:comments-enabled"],
    },
    state: { schemaVersion: 1 },
    budgets: { runtimeJsMaxKb: 30, runtimeCssMaxKb: 15, exportTimeMaxMs: 1000 },
  };

  const result = validatePluginManifest(manifest);
  assert.equal(result.ok, true, result.errors?.join("\n"));
  assert.deepEqual(result.normalized.permissions, [
    "read:posts",
    "write:pluginState",
    "export:assets",
    "fetch:trackers",
  ]);
  assert.deepEqual(result.normalized.extensions, { experimental: true });

  const unknownRequired = validatePluginManifest({
    ...manifest,
    requiredFeatures: ["timeline-rewrite"],
  });
  assert.equal(unknownRequired.ok, false);
  assert.match(unknownRequired.errors.join("\n"), /Unsupported required feature: timeline-rewrite/);

  const globalRuntime = validatePluginManifest({
    ...manifest,
    runtime: { entry: "runtime/comments.js" },
  });
  assert.equal(globalRuntime.ok, false);
  assert.match(globalRuntime.errors.join("\n"), /runtime assets must declare loadWhen/i);

  const badPermission = validatePluginPermissions(["read:posts", "deploy:nuclear"]);
  assert.equal(badPermission.ok, false);
  assert.match(badPermission.errors.join("\n"), /Unknown plugin permission: deploy:nuclear/);
});

test("theme manifests validate frontend and admin themes with required feature checks", () => {
  const frontend = validateThemeManifest({
    type: "postsnail-frontend-theme",
    id: "quiet-feed",
    name: "Quiet Feed",
    version: "1.0.0",
    requiredFeatures: [],
    optionalFeatures: ["template-slots"],
    templates: {
      home: "templates/home.html",
      post: "templates/post.html",
      archive: "templates/archive.html",
      tag: "templates/tag.html",
    },
    assets: { css: ["assets/theme.css"], js: [] },
    settings: {},
  });
  assert.equal(frontend.ok, true, frontend.errors?.join("\n"));

  const admin = validateThemeManifest({
    type: "postsnail-admin-theme",
    id: "shell-coral",
    name: "Shell Coral",
    version: "1.0.0",
    requiredFeatures: [],
    tokens: {
      "--ps-bg": "#fffdf7",
      "--ps-text": "#080a2f",
      "--ps-brand": "#ef4056",
    },
  });
  assert.equal(admin.ok, true, admin.errors?.join("\n"));

  const badAdmin = validateThemeManifest({
    type: "postsnail-admin-theme",
    id: "unsafe-admin",
    name: "Unsafe Admin",
    version: "1.0.0",
    tokens: { color: "red" },
    assets: { js: ["runtime/admin.js"] },
  });
  assert.equal(badAdmin.ok, false);
  assert.match(badAdmin.errors.join("\n"), /Admin theme tokens must use --ps-/);
  assert.match(badAdmin.errors.join("\n"), /Admin themes must not declare JavaScript runtime assets/);

  const unknownRequired = validateThemeManifest({
    ...frontend.normalized,
    requiredFeatures: ["immersive-3d-theme"],
  });
  assert.equal(unknownRequired.ok, false);
  assert.match(unknownRequired.errors.join("\n"), /Unsupported required feature: immersive-3d-theme/);
});

test("route asset maps include only assets declared for matching routes", () => {
  const map = createRouteAssetMap([
    {
      route: "/",
      type: "home",
      template: "home",
      assets: ["/assets/theme.css"],
      plugins: ["postsnail-search"],
    },
    {
      route: "/posts/hello",
      type: "post",
      template: "post",
      assets: ["/assets/theme.css", "/plugins/comments.js", "/plugins/comments.js"],
      plugins: ["postsnail-comments"],
    },
  ]);

  assert.deepEqual(map["/"].assets, ["/assets/theme.css"]);
  assert.deepEqual(map["/posts/hello/"].assets, ["/assets/theme.css", "/plugins/comments.js"]);
  assert.deepEqual(map["/"].plugins, ["postsnail-search"]);
  assert.deepEqual(map["/posts/hello/"].plugins, ["postsnail-comments"]);
  assert.equal(map["/"].assets.includes("/plugins/comments.js"), false);
});

test("public export safety blocks private markers and unsafe paths", () => {
  const safe = validatePublicExportFiles({
    "index.html": textBytes("<h1>ok</h1>"),
    ".well-known/postsnail.json": textBytes("{}"),
    "assets/site.webp": new Uint8Array([1, 2, 3]),
  });
  assert.equal(safe.ok, true, safe.errors.join("\n"));

  const unsafe = validatePublicExportFiles({
    "../secret.txt": textBytes("x"),
    ".env": textBytes("TOKEN=secret"),
    "drafts/private.html": textBytes("Private draft"),
    "backup.postsnail": textBytes("postsnail-workspace"),
    "posts/ok/index.html": textBytes("rawPrivateKey = abc"),
    "private-plugin-state/plugin.json": textBytes("{}"),
  });
  assert.equal(unsafe.ok, false);
  const errors = unsafe.errors.join("\n");
  assert.match(errors, /Unsafe path/);
  assert.match(errors, /\.env/);
  assert.match(errors, /\.postsnail/);
  assert.match(errors, /drafts/);
  assert.match(errors, /rawPrivateKey/);
  assert.match(errors, /private-plugin-state/);

  const svg = validatePublicExportFiles({ "assets/icon.svg": textBytes("<svg></svg>") });
  assert.equal(svg.ok, true, svg.errors.join("\n"));
  assert.match(svg.warnings.join("\n"), /SVG assets should only come from trusted project code/);
});

test("workspace migration preserves unknown optional plugin and theme state", () => {
  const migrated = migrateWorkspace(
    {
      profile: { siteTitle: "Migrated" },
      posts: [],
      assets: [],
      plugins: {
        installed: [{ id: "postsnail-pages", version: "0.1.0" }],
        lock: { "postsnail-pages": "sha3-test" },
        state: { unknownPlugin: { mode: "preserved" } },
      },
      extensions: { themeState: { unknownThemeField: true } },
    },
    { now: "2026-06-06T00:00:00.000Z" },
  );

  assert.equal(migrated.migratedFromLegacy, true);
  assert.deepEqual(migrated.plugins.installed, [{ id: "postsnail-pages", version: "0.1.0" }]);
  assert.deepEqual(migrated.plugins.lock, { "postsnail-pages": "sha3-test" });
  assert.deepEqual(migrated.plugins.state, { unknownPlugin: { mode: "preserved" } });
  assert.deepEqual(migrated.extensions, { themeState: { unknownThemeField: true } });
});
