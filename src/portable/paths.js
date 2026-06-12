import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function resolvePortableBundleRoot(entryPoint = import.meta.url) {
  const filePath = normalizeEntryPoint(entryPoint);
  return resolve(dirname(filePath), "..");
}

export function resolvePortableDataDir(bundleRoot) {
  return resolve(bundleRoot, "data");
}

export function resolvePortableAdminUrl(port) {
  return `http://127.0.0.1:${port}/admin/`;
}

export function resolvePortableBridgeUrl(port) {
  return `http://127.0.0.1:${port}`;
}

export function resolvePortableBundleInfoPath(bundleRoot) {
  return resolve(bundleRoot, "portable", "bundle.json");
}

export function resolvePortableUpdateManifestPath(bundleRoot) {
  return resolve(bundleRoot, "portable", "update-manifest.json");
}

export function resolvePortableBridgeScriptPath(bundleRoot) {
  return resolve(bundleRoot, "scripts", "snaillift-surge-bridge.js");
}

export function resolvePortableStatusPath(bundleRoot) {
  return resolve(bundleRoot, "data", "portable-status.json");
}

export function resolvePortableUpdateCacheDir(bundleRoot) {
  return resolve(bundleRoot, "data", "updates");
}

export function resolvePortableTmpDir(bundleRoot) {
  return resolve(bundleRoot, "data", "tmp");
}

function normalizeEntryPoint(entryPoint) {
  if (typeof entryPoint === "string") {
    if (entryPoint.startsWith("file:")) return fileURLToPath(entryPoint);
    return resolve(entryPoint);
  }
  return fileURLToPath(entryPoint);
}
