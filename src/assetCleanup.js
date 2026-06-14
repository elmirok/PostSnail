import { slugify } from "./content.js";

export function findUnusedAssets(workspace = {}, options = {}) {
  const assets = Array.isArray(workspace.assets) ? workspace.assets : [];
  if (!assets.length) return [];
  const references = collectReferenceStrings(workspace, options.extraReferences || []);
  return assets.filter((asset) => !isAssetReferenced(asset, references));
}

export function removeUnusedAssets(workspace = {}, options = {}) {
  const removedAssets = findUnusedAssets(workspace, options);
  const removedIds = new Set(removedAssets.map((asset) => String(asset.id || "")));
  const state = {
    ...workspace,
    assets: (Array.isArray(workspace.assets) ? workspace.assets : []).filter((asset) => !removedIds.has(String(asset.id || ""))),
  };
  return { state, removedAssets };
}

function collectReferenceStrings(workspace, extraReferences) {
  const references = [];
  const withoutAssetBodies = { ...workspace, assets: [] };
  scanReferences(withoutAssetBodies, references);
  for (const reference of extraReferences) scanReferences(reference, references);
  return references.map((value) => value.toLowerCase());
}

function scanReferences(value, references) {
  if (value === null || value === undefined) return;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    references.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => scanReferences(item, references));
    return;
  }
  if (typeof value === "object") {
    Object.values(value).forEach((nested) => scanReferences(nested, references));
  }
}

function isAssetReferenced(asset, references) {
  const tokens = assetReferenceTokens(asset);
  return references.some((reference) => tokens.some((token) => reference === token || reference.includes(token)));
}

function assetReferenceTokens(asset) {
  const id = String(asset?.id || "").trim();
  const name = String(asset?.name || asset?.filename || "").trim();
  const extension = /\.[a-z0-9]{2,5}$/iu.exec(name)?.[0] || "";
  const base = extension ? name.slice(0, -extension.length) : name;
  return [id, name, base ? `${slugify(base)}${extension.toLowerCase()}` : ""]
    .map((token) => token.toLowerCase())
    .filter((token) => token.length >= 3);
}
