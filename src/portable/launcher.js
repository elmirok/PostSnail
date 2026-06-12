import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { resolve } from "node:path";

import { resolvePortableAdminUrl, resolvePortableBridgeUrl, resolvePortableBundleRoot, resolvePortableDataDir, resolvePortableStatusPath, resolvePortableTmpDir } from "./paths.js";
import { loadPortableBundleInfo, selectPortableRuntimeRoot, writePortableStatus } from "./update.js";
import { startPortableServer } from "./server.js";

export async function runPortableLauncher({
  entryPoint = import.meta.url,
  fetchImpl = globalThis.fetch,
  spawnImpl = spawn,
  openImpl = openBrowser,
  host = "127.0.0.1",
  adminPort,
  bridgePort,
  skipBrowser = false,
} = {}) {
  const bundleRoot = resolvePortableBundleRoot(entryPoint);
  const bundleInfo = await loadPortableBundleInfo(bundleRoot);
  const dataDir = resolvePortableDataDir(bundleRoot);
  await mkdir(dataDir, { recursive: true });
  await mkdir(resolvePortableTmpDir(bundleRoot), { recursive: true });

  const update = await selectPortableRuntimeRoot({
    bundleRoot,
    bundleInfo,
    fetchImpl,
  });

  const runtimeRoot = update.activeRoot || bundleRoot;
  const adminListenPort = Number(adminPort || (await findFreePort(host)));
  const bridgeListenPort = Number(bridgePort || (await findFreePort(host)));
  const server = await startPortableServer({
    rootDir: runtimeRoot,
    host,
    port: adminListenPort,
  });
  const bridge = await startPortableBridge({
    runtimeRoot,
    bundleRoot,
    host,
    port: bridgeListenPort,
    spawnImpl,
    fetchImpl,
  });

  const adminUrl = resolvePortableAdminUrl(server.port);
  const bridgeUrl = resolvePortableBridgeUrl(bridge.port);
  const status = {
    bundleRoot,
    runtimeRoot,
    version: bundleInfo.version,
    updateState: update.updateState,
    updateMessage: update.message,
    updateVersion: update.manifest?.bundleVersion || null,
    adminUrl,
    bridgeUrl,
    bridgeState: bridge.state,
    writableDataPath: dataDir,
    startedAt: new Date().toISOString(),
  };

  await writePortableStatus(resolvePortableStatusPath(bundleRoot), status);
  console.log(renderPortableStatus(status));

  if (!skipBrowser) {
    await openImpl(adminUrl);
  }

  process.once("SIGINT", () => shutdown(server, bridge));
  process.once("SIGTERM", () => shutdown(server, bridge));

  return { ...status, server, bridge };
}

async function startPortableBridge({ runtimeRoot, bundleRoot, host, port, spawnImpl, fetchImpl }) {
  const bridgeScript = resolve(runtimeRoot, "scripts", "snaillift-surge-bridge.js");
  const env = {
    ...process.env,
    POSTSNAIL_SURGE_BRIDGE_HOST: host,
    POSTSNAIL_SURGE_BRIDGE_PORT: String(port),
    TMPDIR: resolve(bundleRoot, "data", "tmp"),
    TMP: resolve(bundleRoot, "data", "tmp"),
    TEMP: resolve(bundleRoot, "data", "tmp"),
  };

  try {
    const child = spawnImpl(process.execPath, [bridgeScript], {
      cwd: runtimeRoot,
      env,
      stdio: "ignore",
      detached: false,
    });
    const state = await waitForBridgeHealth(port, fetchImpl);
    return { child, port, state };
  } catch (error) {
    return {
      child: null,
      port,
      state: "unavailable",
      error: error instanceof Error ? error.message : String(error || "Bridge failed to start."),
    };
  }
}

async function waitForBridgeHealth(port, fetchImpl = globalThis.fetch) {
  const bridgeUrl = `http://127.0.0.1:${port}/health`;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetchImpl(bridgeUrl);
      if (response.ok) return "ready";
    } catch {
      // ignore and retry
    }
    await delay(100);
  }
  return "unavailable";
}

async function shutdown(server, bridge) {
  try {
    await server?.close?.();
  } catch {
    // ignore
  }
  try {
    bridge?.child?.kill?.("SIGTERM");
  } catch {
    // ignore
  }
}

function renderPortableStatus(status) {
  return [
    "PostSnail Portable ready.",
    `Version: ${status.version}`,
    `Update: ${status.updateState}${status.updateVersion ? ` (${status.updateVersion})` : ""}`,
    `Admin: ${status.adminUrl}`,
    `Bridge: ${status.bridgeState} (${status.bridgeUrl})`,
    `Data: ${status.writableDataPath}`,
    "",
  ].join("\n");
}

async function openBrowser(url) {
  const platform = process.platform;
  if (platform === "darwin") {
    await runSpawn("open", [url]);
    return;
  }
  if (platform === "win32") {
    await runSpawn("cmd", ["/c", "start", "", url]);
    return;
  }
  await runSpawn("xdg-open", [url]);
}

function runSpawn(command, args) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      stdio: "ignore",
      detached: false,
    });
    child.on("error", () => resolvePromise());
    child.on("close", () => resolvePromise());
  });
}

async function findFreePort(host) {
  const server = createNetServer();
  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, host, () => resolvePromise());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise((resolvePromise) => server.close(() => resolvePromise()));
    throw new Error("Unable to allocate a portable port.");
  }
  const port = address.port;
  await new Promise((resolvePromise) => server.close(() => resolvePromise()));
  return port;
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
