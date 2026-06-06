import { buildExcerpt, slugify } from "../content.js";

export const POSTSNAIL_PAGES_PLUGIN_ID = "postsnail-pages";
export const PAGES_PLUGIN_VERSION = "0.1.0";
export const PAGES_SCHEMA_VERSION = 1;
export const PAGE_STATUSES = ["draft", "published", "archived"];
export const DEFAULT_BLOG_INDEX_PATH = "/blog/";

const RESERVED_PREFIXES = [
  "/.well-known/",
  "/archive/",
  "/assets/",
  "/posts/",
  "/tags/",
  "/trackers/",
];

const RESERVED_ROUTES = new Set([
  "/about/",
  "/feed.json",
  "/postsnail.manifest.json",
  "/rss.xml",
  "/sitemap.xml",
]);

export function createPagesItem(type = "page", source = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const itemType = type === "doc" ? "doc" : "page";
  const base = objectRecord(source);
  if (itemType === "doc") {
    const title = cleanText(base.title || "Untitled doc");
    return {
      ...cloneObject(base),
      id: cleanText(base.id || cryptoId()),
      type: "doc",
      title,
      slug: slugify(base.slug || title || "doc"),
      section: cleanText(base.section),
      order: Number.isFinite(Number(base.order)) ? Number(base.order) : 0,
      status: normalizeStatus(base.status),
      body: cleanText(base.body),
      seo: normalizeSeo(base.seo),
      createdAt: cleanText(base.createdAt || now),
      updatedAt: cleanText(base.updatedAt || now),
      publishedAt: cleanText(base.publishedAt || (base.status === "published" ? now : "")),
    };
  }

  const title = cleanText(base.title || "Untitled page");
  return {
    ...cloneObject(base),
    id: cleanText(base.id || cryptoId()),
    type: "page",
    title,
    slug: slugify(base.slug || title || "page"),
    path: normalizePublicRoute(base.path || `/${slugify(base.slug || title || "page")}/`),
    status: normalizeStatus(base.status),
    excerpt: cleanText(base.excerpt || buildExcerpt(cleanText(base.body))),
    body: cleanText(base.body),
    template: cleanText(base.template || "page"),
    seo: normalizeSeo(base.seo),
    createdAt: cleanText(base.createdAt || now),
    updatedAt: cleanText(base.updatedAt || now),
    publishedAt: cleanText(base.publishedAt || (base.status === "published" ? now : "")),
  };
}

export function normalizePagesState(value = {}) {
  const source = objectRecord(value);
  return {
    ...cloneObject(source),
    schemaVersion: PAGES_SCHEMA_VERSION,
    pages: cleanArray(source.pages).map((item) => createPagesItem("page", item)),
    docs: cleanArray(source.docs).map((item) => createPagesItem("doc", item)),
    navigation: normalizeNavigation(source.navigation),
    settings: normalizePagesSettings(source.settings),
  };
}

export function normalizePagesSettings(value = {}) {
  const source = objectRecord(value);
  return {
    ...cloneObject(source),
    blogIndexPath: normalizePublicRoute(source.blogIndexPath || DEFAULT_BLOG_INDEX_PATH),
  };
}

export function normalizeNavigation(value = []) {
  return cleanArray(value)
    .map((item) => {
      const source = objectRecord(item);
      const label = cleanText(source.label);
      const url = cleanText(source.url);
      if (!label || !url) return null;
      return {
        ...cloneObject(source),
        label,
        url: url.startsWith("/") ? normalizePublicRoute(url) : url,
      };
    })
    .filter(Boolean);
}

export function buildPagesPublicData(value = {}) {
  const state = normalizePagesState(value);
  const routes = [];
  const seen = new Set();

  const publishedPages = state.pages
    .filter((item) => item.status === "published")
    .sort((a, b) => String(a.path).localeCompare(String(b.path)));
  const publishedDocs = state.docs
    .filter((item) => item.status === "published")
    .sort((a, b) => Number(a.order) - Number(b.order) || String(a.slug).localeCompare(String(b.slug)));

  for (const page of publishedPages) {
    assertSafePagesRoute(page.path);
    addRoute(routes, seen, {
      type: "page",
      route: page.path,
      filePath: routeToFilePath(page.path),
      title: page.title,
      excerpt: page.excerpt,
      body: page.body,
      seo: page.seo,
      item: page,
    });
  }

  if (publishedDocs.length) {
    addRoute(routes, seen, {
      type: "docs-index",
      route: "/docs/",
      filePath: "docs/index.html",
      title: "Docs",
      excerpt: "Documentation",
      body: "",
      seo: {},
      items: publishedDocs,
    });
  }

  for (const doc of publishedDocs) {
    const route = `/docs/${slugify(doc.slug || doc.title)}/`;
    addRoute(routes, seen, {
      type: "doc",
      route,
      filePath: routeToFilePath(route),
      title: doc.title,
      excerpt: doc.seo?.description || buildExcerpt(doc.body),
      body: doc.body,
      seo: doc.seo,
      item: doc,
    });
  }

  const usesHomepageOverride = routes.some((route) => route.route === "/");
  const blogIndexPath = normalizePublicRoute(state.settings.blogIndexPath || DEFAULT_BLOG_INDEX_PATH);
  if (usesHomepageOverride) {
    assertSafeBlogRoute(blogIndexPath);
    if (seen.has(blogIndexPath)) {
      throw new Error(`Duplicate Pages route: ${blogIndexPath}`);
    }
  }

  const exportedRoutes = routes.map((route) => route.route);
  return {
    state,
    navigation: state.navigation,
    routes,
    usesHomepageOverride,
    blogIndexPath,
    metadata: {
      version: PAGES_PLUGIN_VERSION,
      contentTypes: [
        ...(publishedPages.length ? ["page"] : []),
        ...(publishedDocs.length ? ["doc"] : []),
      ],
      routes: exportedRoutes,
    },
  };
}

export function routeToFilePath(route) {
  const normalized = normalizePublicRoute(route);
  if (normalized === "/") return "index.html";
  return `${normalized.replace(/^\/|\/$/gu, "")}/index.html`;
}

export function normalizePublicRoute(value) {
  const text = cleanText(value);
  if (!text || /^[a-z]+:/iu.test(text) || text.includes("..") || text.includes("\\") || text.includes("//")) {
    throw new Error("Pages path must be a safe absolute route.");
  }
  if (!text.startsWith("/")) {
    throw new Error("Pages path must be a safe absolute route.");
  }
  if (text === "/") return "/";
  return `/${text.replace(/^\/+|\/+$/gu, "")}/`;
}

function addRoute(routes, seen, route) {
  if (seen.has(route.route)) {
    throw new Error(`Duplicate Pages route: ${route.route}`);
  }
  seen.add(route.route);
  routes.push(route);
}

function assertSafePagesRoute(route) {
  if (route === "/") return;
  if (RESERVED_ROUTES.has(route) || RESERVED_PREFIXES.some((prefix) => route.startsWith(prefix))) {
    throw new Error(`Pages route uses a reserved PostSnail path: ${route}`);
  }
}

function assertSafeBlogRoute(route) {
  if (route === "/") {
    throw new Error("Pages blog index path cannot be the homepage when Pages owns the homepage.");
  }
  if (RESERVED_ROUTES.has(route) || RESERVED_PREFIXES.some((prefix) => route.startsWith(prefix))) {
    throw new Error(`Pages blog index uses a reserved PostSnail path: ${route}`);
  }
}

function normalizeStatus(value) {
  const status = cleanText(value || "draft").toLowerCase();
  return PAGE_STATUSES.includes(status) ? status : "draft";
}

function normalizeSeo(value = {}) {
  const source = objectRecord(value);
  return {
    ...cloneObject(source),
    title: cleanText(source.title),
    description: cleanText(source.description),
    canonical: cleanText(source.canonical),
    image: cleanText(source.image),
    noindex: source.noindex === true || source.noindex === "true",
  };
}

function cryptoId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `pages-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function cleanText(value) {
  return String(value || "").trim();
}

function cleanArray(value) {
  return Array.isArray(value) ? cloneJson(value) : [];
}

function objectRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cloneObject(value) {
  return cloneJson(objectRecord(value));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}
