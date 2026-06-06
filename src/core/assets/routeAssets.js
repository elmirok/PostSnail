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
  const path = String(value || "").trim();
  return Boolean(path) && path.startsWith("/") && !path.includes("..") && !/^[a-z]+:/iu.test(path);
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
