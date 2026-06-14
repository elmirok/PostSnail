import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { encodeText } from "../bytes.js";
import { canonicalJson } from "../canonical.js";
import {
  fingerprintForBytes,
  generateSigningKeyPair,
  publicKeyToText,
  signBytes,
  signatureToText,
} from "../crypto.js";
import { zipSync } from "../../vendor/fflate/browser.js";
import { derivePortableSeedBytes } from "./seed.js";

const DEFAULT_RELEASE_SEED = "postsnail-portable-release-development-seed";

export async function buildPortableBundle({
  sourceRoot = process.cwd(),
  outDir = resolve(sourceRoot, "dist", "postsnail-portable"),
  zipPath = resolve(sourceRoot, "dist", "postsnail-portable.zip"),
  releaseSeed = process.env.POSTSNAIL_PORTABLE_RELEASE_SEED || DEFAULT_RELEASE_SEED,
  updateManifestUrl = process.env.POSTSNAIL_PORTABLE_UPDATE_MANIFEST_URL || "portable/update-manifest.json",
  updateArtifactUrl = process.env.POSTSNAIL_PORTABLE_UPDATE_ARTIFACT_URL || "https://postsnail.org/releases/postsnail-portable.zip",
  skipAdminBuild = false,
} = {}) {
  if (!skipAdminBuild) {
    execFileSync(process.execPath, [resolve(sourceRoot, "scripts", "prepare-admin-assets.js")], {
      cwd: sourceRoot,
      stdio: "inherit",
    });
  }

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const copyTargets = [
    "admin",
    "app.js",
    "assets",
    "bin",
    "docs",
    "favicon.png",
    "favicon.svg",
    "features-qa.css",
    "features-qa.html",
    "index.html",
    "LICENSE",
    "NOTICE",
    "package.json",
    "portable",
    "README.md",
    "scripts",
    "site.css",
    "site.js",
    "src",
    "styles.css",
    "THIRD_PARTY_NOTICES.md",
    "vendor",
    "verify-remote.html",
    "verify-remote.js",
    "_headers",
    "btc-wallet-qr.svg",
  ];

  for (const entry of copyTargets) {
    await copyEntry(resolve(sourceRoot, entry), resolve(outDir, entry));
  }

  await mkdir(resolve(outDir, "data"), { recursive: true });
  await writeFile(resolve(outDir, "data", ".gitkeep"), "", "utf8");

  const bundleInfo = await createPortableBundleInfo({
    sourceRoot,
    outDir,
    updateManifestUrl,
    releaseSeed,
  });
  await mkdir(resolve(outDir, "portable"), { recursive: true });
  await writeFile(resolve(outDir, "portable", "bundle.json"), `${JSON.stringify(bundleInfo, null, 2)}\n`, "utf8");

  const zipBytes = await buildZipFromDirectory(outDir);
  await writeFile(zipPath, zipBytes);

  const manifest = await createPortableReleaseManifest({
    bundleVersion: bundleInfo.version,
    bundleUrl: bundleInfo.bundleUrl,
    artifactUrl: updateArtifactUrl,
    artifactFingerprint: fingerprintForBytes(zipBytes),
    publicKey: bundleInfo.releasePublicKey,
    releaseSeed,
  });
  await writeFile(resolve(outDir, "portable", "update-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    outDir,
    zipPath,
    bundleInfo,
  };
}

async function createPortableBundleInfo({ sourceRoot, outDir, updateManifestUrl, releaseSeed }) {
  const packageJson = JSON.parse(await readFile(resolve(sourceRoot, "package.json"), "utf8"));
  const { publicKey } = generateSigningKeyPair(derivePortableSeedBytes(releaseSeed));
  return {
    name: "PostSnail Portable",
    version: String(packageJson.version || "0.1.0"),
    bundleUrl: pathToFileURL(outDir).href,
    adminPath: "admin/",
    updateManifestUrl,
    releasePublicKey: publicKeyToText(publicKey),
    defaultAdminPort: 4173,
    defaultBridgePort: 8788,
  };
}

async function createPortableReleaseManifest({ bundleVersion, bundleUrl, artifactUrl, artifactFingerprint, publicKey, releaseSeed }) {
  const { publicKey: releasePublicKey, secretKey } = generateSigningKeyPair(derivePortableSeedBytes(releaseSeed));
  const manifest = {
    protocol: "postsnail-portable-release",
    version: 1,
    bundleVersion,
    bundleUrl,
    artifactUrl,
    artifactFingerprint,
    publicKey: publicKey || publicKeyToText(releasePublicKey),
    publishedAt: new Date().toISOString(),
    requiredFeatures: ["portable-launcher", "local-admin", "bridge-helper"],
    optionalFeatures: ["cli-command-center"],
  };
  const signature = signBytes(encodeText(canonicalJson(manifest)), secretKey);
  return {
    ...manifest,
    signature: signatureToText(signature),
  };
}

async function copyEntry(source, target) {
  const stats = await safeStat(source);
  if (!stats) return;
  if (stats.isDirectory()) {
    await mkdir(target, { recursive: true });
    const entries = await readdir(source, { withFileTypes: true });
    for (const entry of entries) {
      if (isIgnoredPortableFile(entry.name)) continue;
      await copyEntry(resolve(source, entry.name), resolve(target, entry.name));
    }
    return;
  }
  if (!stats.isFile()) return;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, await readFile(source));
}

async function buildZipFromDirectory(rootDir) {
  const files = {};
  await collectFiles(rootDir, rootDir, files);
  return zipSync(files, { level: 6 });
}

async function collectFiles(rootDir, currentDir, files) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    if (isIgnoredPortableFile(entry.name)) continue;
    const fullPath = resolve(currentDir, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(rootDir, fullPath, files);
      continue;
    }
    if (!entry.isFile()) continue;
    const relPath = relative(rootDir, fullPath).replaceAll("\\", "/");
    files[relPath] = await readFile(fullPath);
  }
}

async function safeStat(path) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

function isIgnoredPortableFile(name) {
  return name === ".DS_Store"
    || name === "Thumbs.db"
    || name === "node_modules"
    || name === ".wrangler"
    || name === "coverage"
    || name === "dist";
}
