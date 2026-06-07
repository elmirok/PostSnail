import { isSafeAbsolutePath } from "../pathSafety.js";

export function createRouteAssetMap(routes = []) {
  const map = {};
  for (const route of Array.isArray(routes) ? routes : []) {
    const source = objectRecord(route);
    const key = normalizeRoutePath(source.route || source.path || "/");
    map[key] = {
      route: key,
      type: String(source.type || ""),
      template: String(source.template || ""),
      theme: String(source.theme || ""),
      plugins: uniqueStrings(source.plugins),
      assets: uniqueStrings(source.assets).filter(isSafePublicAssetPath),
    };
  }
  return map;
}

export function resolveRouteAssets(route = {}, theme = {}, enabledPlugins = []) {
  const source = objectRecord(route);
  const routeType = String(source.type || "");
  const routeTemplate = String(source.template || routeType || "");
  const features = new Set(uniqueStrings(source.features));
  const themeAssets = assetsForTheme(theme);
  const pluginAssets = [];
  const pluginIds = [];

  for (const plugin of Array.isArray(enabledPlugins) ? enabledPlugins : []) {
    const manifest = objectRecord(plugin.manifest || plugin);
    const runtime = objectRecord(manifest.runtime);
    const loadWhen = uniqueStrings(runtime.loadWhen);
    if (!loadWhen.length || !matchesLoadWhen(loadWhen, routeType, routeTemplate, features)) continue;
    const pluginId = String(manifest.id || plugin.id || "").trim();
    if (!pluginId) continue;
    pluginIds.push(pluginId);
    if (runtime.entry) pluginAssets.push(`/plugins/${pluginId}/${runtime.entry}`);
    for (const path of uniqueStrings(runtime.js)) pluginAssets.push(`/plugins/${pluginId}/${path}`);
    for (const path of uniqueStrings(runtime.css)) pluginAssets.push(`/plugins/${pluginId}/${path}`);
  }

  return {
    route: normalizeRoutePath(source.route || source.path || "/"),
    type: routeType,
    template: routeTemplate,
    theme: String(theme.id || ""),
    features: [...features],
    plugins: uniqueStrings(pluginIds),
    assets: uniqueStrings([...themeAssets, ...pluginAssets]).filter(isSafePublicAssetPath),
  };
}

export function normalizeRoutePath(value) {
  let route = String(value || "/").trim().split(/[?#]/u)[0] || "/";
  if (!route.startsWith("/")) route = `/${route}`;
  route = route.replace(/\/{2,}/gu, "/");
  if (route !== "/" && !/\.[a-z0-9]+$/iu.test(route) && !route.endsWith("/")) {
    route = `${route}/`;
  }
  return route;
}

export function isSafePublicAssetPath(value) {
  return isSafeAbsolutePath(value);
}

function uniqueStrings(value = []) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const text = String(item || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function objectRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function assetsForTheme(theme) {
  const publicAssets = objectRecord(theme.publicAssets);
  const legacyAssets = objectRecord(theme.assets);
  const id = String(theme.id || "").trim();
  const css = uniqueStrings(publicAssets.css).length
    ? uniqueStrings(publicAssets.css)
    : uniqueStrings(legacyAssets.css).map((path) => `/themes/${id}/${path}`);
  const js = uniqueStrings(publicAssets.js).length
    ? uniqueStrings(publicAssets.js)
    : uniqueStrings(legacyAssets.js).map((path) => `/themes/${id}/${path}`);
  return [...css, ...js];
}

function matchesLoadWhen(loadWhen, routeType, routeTemplate, features) {
  return loadWhen.every((condition) => {
    if (condition.startsWith("routeType:")) return condition.slice("routeType:".length) === routeType;
    if (condition.startsWith("template:")) return condition.slice("template:".length) === routeTemplate;
    if (condition.startsWith("feature:")) return features.has(condition.slice("feature:".length));
    return false;
  });
}
