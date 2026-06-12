import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson } from "../canonical.js";
import { encodeText } from "../bytes.js";
import { fingerprintForBytes, textToBytes, verifyBytes } from "../crypto.js";
import { isSafeRelativePath } from "../core/pathSafety.js";
import { unzipSync } from "../../vendor/fflate/browser.js";

const DEFAULT_PORTABLE_BUNDLE_INFO = {
  name: "PostSnail Portable",
  version: "0.1.0",
  adminPath: "admin/",
  updateManifestUrl: "portable/update-manifest.json",
  releasePublicKey: "",
  defaultAdminPort: 4173,
  defaultBridgePort: 8788,
};

export async function loadPortableBundleInfo(bundleRoot) {
  const infoPath = resolve(bundleRoot, "portable", "bundle.json");
  try {
    const text = await readFile(infoPath, "utf8");
    const parsed = JSON.parse(text);
    return {
      ...DEFAULT_PORTABLE_BUNDLE_INFO,
      ...parsed,
      version: String(parsed?.version || DEFAULT_PORTABLE_BUNDLE_INFO.version),
      adminPath: String(parsed?.adminPath || DEFAULT_PORTABLE_BUNDLE_INFO.adminPath),
      updateManifestUrl: String(parsed?.updateManifestUrl || DEFAULT_PORTABLE_BUNDLE_INFO.updateManifestUrl),
      releasePublicKey: String(parsed?.releasePublicKey || DEFAULT_PORTABLE_BUNDLE_INFO.releasePublicKey),
      defaultAdminPort: Number(parsed?.defaultAdminPort || DEFAULT_PORTABLE_BUNDLE_INFO.defaultAdminPort),
      defaultBridgePort: Number(parsed?.defaultBridgePort || DEFAULT_PORTABLE_BUNDLE_INFO.defaultBridgePort),
    };
  } catch {
    return { ...DEFAULT_PORTABLE_BUNDLE_INFO };
  }
}

export async function selectPortableRuntimeRoot({
  bundleRoot,
  bundleInfo,
  fetchImpl = globalThis.fetch,
} = {}) {
  const dataDir = resolve(bundleRoot, "data");
  await ensurePortableDataDirs(dataDir);

  const manifestSource = resolveManifestSource(bundleRoot, bundleInfo);
  if (!manifestSource) {
    return {
      activeRoot: bundleRoot,
      updateState: "disabled",
      message: "Update checks are not configured.",
    };
  }

  try {
    const manifestLoad = await loadPortableReleaseManifest(manifestSource, { bundleRoot, fetchImpl });
    const manifest = manifestLoad.manifest;
    const verifyResult = verifyPortableReleaseManifest(manifest, bundleInfo.releasePublicKey);
    if (!verifyResult.ok) {
      return {
        activeRoot: bundleRoot,
        updateState: "verification-failed",
        message: verifyResult.errors.join("; "),
        manifest,
      };
    }

    if (compareVersions(manifest.bundleVersion, bundleInfo.version) <= 0) {
      return {
        activeRoot: bundleRoot,
        updateState: "current",
        message: `PostSnail Portable ${bundleInfo.version} is current.`,
        manifest,
      };
    }

    const artifactLoad = await loadPortableArtifact(manifest, manifestLoad.source, { bundleRoot, fetchImpl });
    const actualFingerprint = fingerprintForBytes(artifactLoad.bytes);
    if (actualFingerprint !== manifest.artifactFingerprint) {
      return {
        activeRoot: bundleRoot,
        updateState: "verification-failed",
        message: "Portable release artifact fingerprint mismatch.",
        manifest,
      };
    }

    const stageRoot = await stagePortableRelease({
      dataDir,
      manifest,
      artifactBytes: artifactLoad.bytes,
    });
    return {
      activeRoot: stageRoot,
      updateState: "updated",
      message: `Staged PostSnail Portable ${manifest.bundleVersion}.`,
      manifest,
      stageRoot,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "Portable update failed.");
    if (/fetch|network|not found/i.test(message)) {
      return {
        activeRoot: bundleRoot,
        updateState: "offline",
        message: "Portable update check is offline. Using bundled snapshot.",
      };
    }
    return {
      activeRoot: bundleRoot,
      updateState: "error",
      message,
    };
  }
}

export async function loadPortableReleaseManifest(source, { bundleRoot, fetchImpl = globalThis.fetch } = {}) {
  const locator = resolvePortableLocator(source, bundleRoot);
  const text = await readPortableText(locator, { fetchImpl });
  const manifest = JSON.parse(text);
  return {
    manifest,
    source: locator,
  };
}

export function verifyPortableReleaseManifest(manifest, expectedPublicKey = "") {
  const errors = [];
  if (!manifest || typeof manifest !== "object") {
    errors.push("Portable release manifest is missing.");
    return { ok: false, errors };
  }
  if (manifest.protocol !== "postsnail-portable-release") {
    errors.push("Portable release protocol mismatch.");
  }
  if (manifest.version !== 1) {
    errors.push("Portable release manifest version is unsupported.");
  }
  if (!isNonEmptyText(manifest.bundleVersion)) {
    errors.push("Portable release bundle version is required.");
  }
  if (!isNonEmptyText(manifest.artifactUrl)) {
    errors.push("Portable release artifact URL is required.");
  }
  if (!isNonEmptyText(manifest.artifactFingerprint)) {
    errors.push("Portable release artifact fingerprint is required.");
  }
  if (!isNonEmptyText(manifest.signature)) {
    errors.push("Portable release signature is required.");
  }
  if (!isNonEmptyText(manifest.publicKey)) {
    errors.push("Portable release public key is required.");
  }
  if (isNonEmptyText(expectedPublicKey) && String(manifest.publicKey) !== String(expectedPublicKey)) {
    errors.push("Portable release public key mismatch.");
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const payload = { ...manifest };
  delete payload.signature;
  const payloadBytes = encodeText(canonicalJson(payload));
  const signatureBytes = textToBytes(manifest.signature);
  const publicKeyBytes = textToBytes(expectedPublicKey || manifest.publicKey);

  if (!verifyBytes(payloadBytes, signatureBytes, publicKeyBytes)) {
    return {
      ok: false,
      errors: ["Portable release signature verification failed."],
    };
  }

  return { ok: true, errors: [] };
}

export async function stagePortableRelease({ dataDir, manifest, artifactBytes } = {}) {
  const versionDir = join(dataDir, "updates", sanitizeVersion(manifest.bundleVersion));
  const stageRoot = join(versionDir, "root");
  await rm(versionDir, { recursive: true, force: true });
  await mkdir(stageRoot, { recursive: true });

  const files = unzipSync(artifactBytes);
  for (const [relativePath, bytes] of Object.entries(files)) {
    if (!isSafeRelativePath(relativePath)) {
      throw new Error(`Unsafe portable release path: ${relativePath}`);
    }
    const targetPath = resolve(stageRoot, relativePath);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, bytes);
  }

  await writeFile(join(versionDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return stageRoot;
}

export async function loadPortableArtifact(manifest, sourceLocator, { bundleRoot, fetchImpl = globalThis.fetch } = {}) {
  const artifactLocator = resolvePortableLocator(manifest.artifactUrl, bundleRoot, sourceLocator);
  const bytes = await readPortableBinary(artifactLocator, { fetchImpl });
  return {
    bytes,
    source: artifactLocator,
  };
}

export function compareVersions(left, right) {
  const leftParts = normalizeVersion(left);
  const rightParts = normalizeVersion(right);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function writePortableStatus(statusPath, data) {
  await mkdir(dirname(statusPath), { recursive: true });
  await writeFile(statusPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function ensurePortableDataDirs(dataDir) {
  await mkdir(join(dataDir, "updates"), { recursive: true });
  await mkdir(join(dataDir, "tmp"), { recursive: true });
  await mkdir(join(dataDir, "logs"), { recursive: true });
}

function resolveManifestSource(bundleRoot, bundleInfo) {
  const source = String(
    process.env.POSTSNAIL_PORTABLE_UPDATE_MANIFEST_URL ||
    process.env.POSTSNAIL_PORTABLE_UPDATE_MANIFEST ||
    bundleInfo.updateManifestUrl ||
    "",
  ).trim();
  if (!source) return "";
  if (isUrl(source) || source.startsWith("file:")) return source;
  return resolve(bundleRoot, source);
}

function resolvePortableLocator(source, bundleRoot, baseLocator = null) {
  const text = String(source || "").trim();
  if (!text) {
    throw new Error("Portable release source is required.");
  }
  if (text.startsWith("file:")) {
    return { kind: "file", path: fileURLToPath(text) };
  }
  if (isUrl(text)) {
    return { kind: "url", href: text };
  }
  if (baseLocator?.kind === "url") {
    return { kind: "url", href: new URL(text, baseLocator.href).href };
  }
  if (baseLocator?.kind === "file") {
    return { kind: "file", path: resolve(dirname(baseLocator.path), text) };
  }
  return { kind: "file", path: resolve(bundleRoot, text) };
}

async function readPortableText(locator, { fetchImpl = globalThis.fetch } = {}) {
  if (locator.kind === "url") {
    const response = await fetchImpl(locator.href);
    if (!response.ok) {
      throw new Error(`Unable to fetch portable release manifest: ${response.status}`);
    }
    return await response.text();
  }
  return await readFile(locator.path, "utf8");
}

async function readPortableBinary(locator, { fetchImpl = globalThis.fetch } = {}) {
  if (locator.kind === "url") {
    const response = await fetchImpl(locator.href);
    if (!response.ok) {
      throw new Error(`Unable to fetch portable release artifact: ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
  return new Uint8Array(await readFile(locator.path));
}

function normalizeVersion(value) {
  const text = String(value ?? "").trim();
  if (!text) return [0];
  return text
    .replace(/^v/u, "")
    .split(".")
    .map((part) => {
      const match = String(part).match(/\d+/u);
      return Number.parseInt(match ? match[0] : "0", 10);
    });
}

function sanitizeVersion(value) {
  return String(value || "unknown").replace(/[^0-9A-Za-z._-]+/gu, "-");
}

function isNonEmptyText(value) {
  return String(value ?? "").trim().length > 0;
}

function isUrl(value) {
  return /^https?:\/\//iu.test(String(value || "").trim());
}
