import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import { encodeText } from "../src/bytes.js";
import { canonicalJson } from "../src/canonical.js";
import {
  generateSigningKeyPair,
  publicKeyToText,
  signBytes,
  signatureToText,
} from "../src/crypto.js";
import { buildPortableBundle } from "../src/portable/bundle.js";
import { runPortableLauncher } from "../src/portable/launcher.js";
import { derivePortableSeedBytes } from "../src/portable/seed.js";
import {
  loadPortableBundleInfo,
  selectPortableRuntimeRoot,
  stagePortableRelease,
  verifyPortableReleaseManifest,
} from "../src/portable/update.js";
import { zipSync, unzipSync } from "../vendor/fflate/browser.js";

const root = process.cwd();

test("portable release manifest verifies and rejects tampering", () => {
  const keys = generateSigningKeyPair(derivePortableSeedBytes("postsnail-portable-test-seed"));
  const manifest = {
    protocol: "postsnail-portable-release",
    version: 1,
    bundleVersion: "0.1.1",
    bundleUrl: "https://postsnail.org/portable/",
    artifactUrl: "https://postsnail.org/releases/postsnail-portable.zip",
    artifactFingerprint: "psn1-sha3-512-test",
    publicKey: publicKeyToText(keys.publicKey),
    publishedAt: "2026-06-12T00:00:00.000Z",
    requiredFeatures: ["portable-launcher", "local-admin", "bridge-helper"],
    optionalFeatures: [],
  };
  const signature = signBytes(encodeText(canonicalJson(manifest)), keys.secretKey);
  const signed = { ...manifest, signature: signatureToText(signature) };

  const verified = verifyPortableReleaseManifest(signed, publicKeyToText(keys.publicKey));
  assert.equal(verified.ok, true, verified.errors.join("\n"));

  const tampered = { ...signed, artifactFingerprint: "psn1-sha3-512-tampered" };
  const rejected = verifyPortableReleaseManifest(tampered, publicKeyToText(keys.publicKey));
  assert.equal(rejected.ok, false);
  assert.match(rejected.errors.join("\n"), /signature verification failed|public key mismatch|artifact fingerprint/iu);
});

test("portable release staging extracts files and blocks unsafe paths", async () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "postsnail-portable-stage-"));
  const dataDir = join(fixtureDir, "data");
  await mkdir(dataDir, { recursive: true });

  const manifest = {
    bundleVersion: "0.1.2",
  };
  const zipBytes = zipSync({
    "index.html": encodeText("<h1>ok</h1>"),
    "admin/index.html": encodeText("<p>admin</p>"),
    "portable/bundle.json": encodeText("{}"),
  });
  const stageRoot = await stagePortableRelease({
    dataDir,
    manifest,
    artifactBytes: zipBytes,
  });

  assert.equal(existsSync(join(stageRoot, "index.html")), true);
  assert.equal(existsSync(join(stageRoot, "admin", "index.html")), true);
  assert.equal(existsSync(join(dataDir, "updates", "0.1.2", "manifest.json")), true);

  const unsafeBytes = zipSync({
    "../evil.txt": encodeText("nope"),
  });
  await assert.rejects(
    stagePortableRelease({
      dataDir,
      manifest: { bundleVersion: "0.1.3" },
      artifactBytes: unsafeBytes,
    }),
    /Unsafe portable release path/,
  );
});

test("portable bundle build assembles launcher scripts, docs, and avoids private workspace files", async () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "postsnail portable bundle-"));
  const outDir = join(fixtureDir, "bundle root");
  const zipPath = join(fixtureDir, "bundle archive.zip");
  const result = await buildPortableBundle({
    sourceRoot: root,
    outDir,
    zipPath,
    skipAdminBuild: true,
  });

  assert.equal(result.bundleInfo.version.length > 0, true);
  assert.equal(existsSync(join(outDir, "bin", "postsnail-portable.js")), true);
  assert.equal(existsSync(join(outDir, "portable", "bootstrap.sh")), true);
  assert.equal(existsSync(join(outDir, "portable", "launchers", "postsnail.sh")), true);
  assert.equal(existsSync(join(outDir, "portable", "launchers", "postsnail.command")), true);
  assert.equal(existsSync(join(outDir, "portable", "launchers", "postsnail.cmd")), true);
  assert.equal(existsSync(join(outDir, "docs", "portable-bundle", "index.html")), true);
  assert.equal(existsSync(join(outDir, "portable", "bundle.json")), true);
  assert.equal(existsSync(join(outDir, "portable", "update-manifest.json")), true);
  assert.equal(existsSync(zipPath), true);

  const zipEntries = Object.keys(unzipSync(readFileSync(zipPath)));
  assert.match(zipEntries.join("\n"), /portable\/bundle\.json/);
  assert.match(zipEntries.join("\n"), /portable\/bootstrap\.sh/);
  assert.match(zipEntries.join("\n"), /docs\/portable-bundle\/index\.html/);
  assert.match(zipEntries.join("\n"), /bin\/postsnail-portable\.js/);
  assert.doesNotMatch(zipEntries.join("\n"), /\.postsnail\b/);
  assert.doesNotMatch(zipEntries.join("\n"), /(^|\/)(drafts|private)(\/|$)/i);
  assert.doesNotMatch(zipEntries.join("\n"), /(^|\/)\.env$/i);
  assert.doesNotMatch(zipEntries.join("\n"), /\.(pem|key|secret)$/i);
  const bootstrap = readFileSync(join(outDir, "portable", "bootstrap.sh"), "utf8");
  assert.match(bootstrap, /RELEASE_URL="https:\/\/github\.com\/\$\{REPO_SLUG\}\/releases\/latest\/download\/\$\{RELEASE_ASSET\}"/);
  assert.match(bootstrap, /SOURCE_ARCHIVE_URL="https:\/\/github\.com\/\$\{REPO_SLUG\}\/archive\/refs\/heads\/\$\{SOURCE_BRANCH\}\.zip"/);
  assert.match(bootstrap, /Release asset unavailable, falling back to the GitHub source archive/);
  assert.match(bootstrap, /\/dev\/tty/);
  assert.match(readFileSync(join(outDir, "portable", "bootstrap.sh"), "utf8"), /apt-get|dnf|pacman|zypper|apk|brew/);
});

test("portable launcher resolves spaced bundle paths and starts the local admin and bridge", async () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "postsnail portable launch-"));
  const outDir = join(fixtureDir, "Portable Bundle With Spaces");
  const zipPath = join(fixtureDir, "Portable Bundle With Spaces.zip");
  await buildPortableBundle({
    sourceRoot: root,
    outDir,
    zipPath,
    skipAdminBuild: true,
  });

  const launched = await runPortableLauncher({
    entryPoint: join(outDir, "bin", "postsnail-portable.js"),
    skipBrowser: true,
  });

  assert.equal(launched.updateState, "current");
  assert.equal(launched.bridgeState, "ready");
  assert.match(launched.adminUrl, /^http:\/\/127\.0\.0\.1:\d+\/admin\/$/);
  assert.match(launched.bridgeUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(existsSync(join(outDir, "data", "portable-status.json")), true);

  const status = JSON.parse(readFileSync(join(outDir, "data", "portable-status.json"), "utf8"));
  assert.equal(status.updateState, "current");
  assert.equal(status.bridgeState, "ready");
  assert.equal(status.writableDataPath, join(outDir, "data"));

  if (launched.bridge?.child) {
    const exitPromise = new Promise((resolvePromise) => {
      launched.bridge.child.once("exit", () => resolvePromise());
    });
    launched.bridge.child.kill("SIGTERM");
    await Promise.race([
      exitPromise,
      new Promise((resolvePromise) => setTimeout(resolvePromise, 1000)),
    ]);
  }
  await launched.server.close();
});

test("portable update check falls back offline when the manifest fetch is unavailable", async () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "postsnail-portable-offline-"));
  const bundleRoot = join(fixtureDir, "bundle");
  await mkdir(join(bundleRoot, "portable"), { recursive: true });
  writeFileSync(
    join(bundleRoot, "portable", "bundle.json"),
    JSON.stringify({
      name: "PostSnail Portable",
      version: "0.1.0",
      updateManifestUrl: "https://example.invalid/postsnail-portable.json",
      releasePublicKey: "",
      defaultAdminPort: 4173,
      defaultBridgePort: 8788,
    }, null, 2),
  );

  const info = await loadPortableBundleInfo(bundleRoot);
  const result = await selectPortableRuntimeRoot({
    bundleRoot,
    bundleInfo: info,
    fetchImpl: async () => {
      throw new Error("network offline");
    },
  });

  assert.equal(result.updateState, "offline");
  assert.equal(result.activeRoot, bundleRoot);
  assert.match(result.message, /offline/i);

  await rm(fixtureDir, { recursive: true, force: true });
});
