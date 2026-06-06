import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPagesPublicData,
  createPagesItem,
  normalizePagesState,
  POSTSNAIL_PAGES_PLUGIN_ID,
} from "../src/pages/plugin.js";
import { getOfficialPluginManifest } from "../src/core/plugins/officialCatalog.js";

test("Pages official plugin manifest validates as bundled CMS extension", () => {
  const manifest = getOfficialPluginManifest(POSTSNAIL_PAGES_PLUGIN_ID);

  assert.equal(manifest.id, "postsnail-pages");
  assert.equal(manifest.name, "PostSnail Pages");
  assert.ok(manifest.capabilities.includes("adminPanel"));
  assert.ok(manifest.capabilities.includes("contentTypes"));
  assert.ok(manifest.capabilities.includes("exportRoutes"));
  assert.ok(manifest.capabilities.includes("exportSitemap"));
  assert.ok(manifest.capabilities.includes("storePluginState"));
  assert.ok(manifest.permissions.includes("write:pluginState"));
  assert.ok(manifest.permissions.includes("export:routes"));
  assert.ok(manifest.permissions.includes("export:sitemap"));
  assert.ok(manifest.permissions.includes("export:manifestExtensions"));
  assert.deepEqual(manifest.runtime, {});
});

test("Pages state defaults safely and preserves unknown fields", () => {
  const page = createPagesItem("page", {
    id: "page-1",
    title: "Welcome",
    path: "/",
    status: "published",
    body: "Hello",
    experimental: { keep: true },
  });
  const state = normalizePagesState({
    pages: [page],
    docs: [{ id: "doc-1", title: "Protocol", slug: "protocol", status: "draft", extra: "preserved" }],
    navigation: [{ label: "Docs", url: "/docs/", badge: "kept" }],
    settings: { blogIndexPath: "/journal/" },
    futureField: { keep: "yes" },
  });

  assert.equal(state.schemaVersion, 1);
  assert.equal(state.pages[0].type, "page");
  assert.equal(state.pages[0].path, "/");
  assert.deepEqual(state.pages[0].experimental, { keep: true });
  assert.equal(state.docs[0].type, "doc");
  assert.equal(state.docs[0].extra, "preserved");
  assert.deepEqual(state.navigation[0], { label: "Docs", url: "/docs/", badge: "kept" });
  assert.equal(state.settings.blogIndexPath, "/journal/");
  assert.deepEqual(state.futureField, { keep: "yes" });
});

test("Pages public data exports only published pages and docs with homepage override", () => {
  const state = normalizePagesState({
    pages: [
      { id: "home", title: "Home", path: "/", status: "published", body: "Custom homepage" },
      { id: "draft", title: "Draft Secret", path: "/secret/", status: "draft", body: "Do not export" },
      { id: "about-project", title: "About Project", path: "/about-project/", status: "published", body: "Public page" },
    ],
    docs: [
      { id: "protocol", title: "Protocol", slug: "protocol", status: "published", body: "Public doc" },
      { id: "private-doc", title: "Private Doc", slug: "private-doc", status: "archived", body: "Do not export" },
    ],
    navigation: [
      { label: "Home", url: "/" },
      { label: "Docs", url: "/docs/" },
    ],
    settings: { blogIndexPath: "/blog/" },
  });
  const output = buildPagesPublicData(state);

  assert.equal(output.usesHomepageOverride, true);
  assert.equal(output.blogIndexPath, "/blog/");
  assert.deepEqual(output.routes.map((route) => route.route).sort(), [
    "/",
    "/about-project/",
    "/docs/",
    "/docs/protocol/",
  ]);
  assert.deepEqual(output.metadata, {
    version: "0.1.0",
    contentTypes: ["page", "doc"],
    routes: ["/", "/about-project/", "/docs/", "/docs/protocol/"],
  });
  assert.equal(output.routes.some((route) => route.title === "Draft Secret"), false);
  assert.equal(output.routes.some((route) => route.title === "Private Doc"), false);
});

test("Pages public data rejects unsafe and conflicting public paths", () => {
  assert.throws(
    () => buildPagesPublicData({ pages: [{ title: "Bad", path: "/posts/bad/", status: "published" }] }),
    /reserved PostSnail path/i,
  );
  assert.throws(
    () => buildPagesPublicData({
      pages: [
        { title: "One", path: "/same/", status: "published" },
        { title: "Two", path: "/same/", status: "published" },
      ],
    }),
    /duplicate Pages route/i,
  );
  assert.throws(
    () => buildPagesPublicData({ pages: [{ title: "Unsafe", path: "https://evil.example", status: "published" }] }),
    /safe absolute route/i,
  );
});
