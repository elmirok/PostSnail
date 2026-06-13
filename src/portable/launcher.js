import { spawn } from "node:child_process";
import { closeSync, createReadStream, createWriteStream, openSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";

import { resolvePortableAdminUrl, resolvePortableBridgeUrl, resolvePortableBundleRoot, resolvePortableDataDir, resolvePortableStatusPath, resolvePortableTmpDir } from "./paths.js";
import { loadPortableBundleInfo, selectPortableRuntimeRoot, writePortableStatus } from "./update.js";
import { startPortableServer } from "./server.js";

export async function runPortableLauncher({
  entryPoint = import.meta.url,
  fetchImpl = globalThis.fetch,
  spawnImpl = spawn,
  openImpl = openBrowser,
  host = "127.0.0.1",
  runMode,
  promptRunMode,
  skipMenu = false,
  adminPort,
  bridgePort,
  forestPort,
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
  const selectedRunMode = await resolvePortableRunMode({ runMode, promptRunMode, skipMenu });
  const shouldRunAdmin = selectedRunMode === "admin" || selectedRunMode === "both";
  const shouldRunForest = selectedRunMode === "forest" || selectedRunMode === "both";

  let server = null;
  let bridge = { child: null, port: null, state: "skipped" };
  let forest = { child: null, port: null, state: "skipped" };

  if (shouldRunAdmin) {
    const adminListenPort = Number(adminPort || (await findFreePort(host)));
    const bridgeListenPort = Number(bridgePort || (await findFreePort(host)));
    server = await startPortableServer({
      rootDir: runtimeRoot,
      host,
      port: adminListenPort,
    });
    bridge = await startPortableBridge({
      runtimeRoot,
      bundleRoot,
      host,
      port: bridgeListenPort,
      spawnImpl,
      fetchImpl,
    });
  }

  if (shouldRunForest) {
    const forestListenPort = Number(forestPort || (await findFreePort(host)));
    forest = await startPortableForest({
      runtimeRoot,
      bundleRoot,
      host,
      port: forestListenPort,
      spawnImpl,
      fetchImpl,
    });
  }

  const adminUrl = server ? resolvePortableAdminUrl(server.port) : null;
  const bridgeUrl = bridge.port ? resolvePortableBridgeUrl(bridge.port) : null;
  const forestUrl = forest.port ? `http://${host}:${forest.port}/` : null;
  const status = {
    bundleRoot,
    runtimeRoot,
    runMode: selectedRunMode,
    version: bundleInfo.version,
    updateState: update.updateState,
    updateMessage: update.message,
    updateVersion: update.manifest?.bundleVersion || null,
    adminState: server ? "ready" : "skipped",
    adminUrl,
    bridgeUrl,
    bridgeState: bridge.state,
    forestUrl,
    forestState: forest.state,
    writableDataPath: dataDir,
    startedAt: new Date().toISOString(),
  };

  await writePortableStatus(resolvePortableStatusPath(bundleRoot), status);
  console.log(renderPortableStatus(status));

  if (!skipBrowser) {
    for (const url of openUrlsForStatus(status)) {
      await openImpl(url);
    }
  }

  process.once("SIGINT", () => shutdown(server, bridge, forest));
  process.once("SIGTERM", () => shutdown(server, bridge, forest));

  return { ...status, server, bridge, forest };
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

async function startPortableForest({ runtimeRoot, bundleRoot, host, port, spawnImpl, fetchImpl }) {
  const registryRoot = resolve(runtimeRoot, "registry");
  const persistenceDir = resolve(bundleRoot, "data", "forest-wrangler");
  await mkdir(persistenceDir, { recursive: true });
  const env = {
    ...process.env,
    TMPDIR: resolve(bundleRoot, "data", "tmp"),
    TMP: resolve(bundleRoot, "data", "tmp"),
    TEMP: resolve(bundleRoot, "data", "tmp"),
  };
  const args = [
    "--yes",
    "wrangler@4.98.0",
    "dev",
    "--local",
    "--ip",
    host,
    "--port",
    String(port),
    "--persist-to",
    persistenceDir,
    "--show-interactive-dev-session=false",
  ];

  try {
    const child = spawnImpl(npxCommand(), args, {
      cwd: registryRoot,
      env,
      stdio: "ignore",
      detached: false,
    });
    const state = await waitForHttpHealth(`http://${host}:${port}/`, {
      fetchImpl,
      child,
      attempts: 180,
      delayMs: 500,
    });
    return { child, port, state };
  } catch (error) {
    return {
      child: null,
      port,
      state: "unavailable",
      error: error instanceof Error ? error.message : String(error || "Forest failed to start."),
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

async function waitForHttpHealth(url, { fetchImpl = globalThis.fetch, child = null, attempts = 20, delayMs = 100 } = {}) {
  let exited = false;
  child?.once?.("exit", () => {
    exited = true;
  });
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (exited) return "unavailable";
    try {
      const response = await fetchImpl(url);
      if (response.ok) return "ready";
    } catch {
      // ignore and retry
    }
    await delay(delayMs);
  }
  return "unavailable";
}

async function shutdown(server, bridge, forest) {
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
  try {
    forest?.child?.kill?.("SIGTERM");
  } catch {
    // ignore
  }
}

function renderPortableStatus(status) {
  return [
    "PostSnail Portable ready.",
    `Version: ${status.version}`,
    `Update: ${status.updateState}${status.updateVersion ? ` (${status.updateVersion})` : ""}`,
    `Mode: ${labelForRunMode(status.runMode)}`,
    `Admin: ${status.adminState}${status.adminUrl ? ` (${status.adminUrl})` : ""}`,
    `Bridge: ${status.bridgeState}${status.bridgeUrl ? ` (${status.bridgeUrl})` : ""}`,
    `Forest: ${status.forestState}${status.forestUrl ? ` (${status.forestUrl})` : ""}`,
    `Data: ${status.writableDataPath}`,
    "",
  ].join("\n");
}

function openUrlsForStatus(status) {
  if (status.runMode === "forest") return status.forestUrl ? [status.forestUrl] : [];
  if (status.runMode === "both") {
    return [status.adminUrl, status.forestUrl].filter(Boolean);
  }
  return status.adminUrl ? [status.adminUrl] : [];
}

async function resolvePortableRunMode({ runMode, promptRunMode, skipMenu }) {
  if (runMode) return normalizeRunMode(runMode);
  if (promptRunMode) return normalizeRunMode(await promptRunMode());
  if (skipMenu) return "admin";
  try {
    return normalizeRunMode(await promptPortableRunMode());
  } catch {
    return "admin";
  }
}

async function promptPortableRunMode() {
  const streams = openPromptStreams();
  const rl = createInterface({
    input: streams.input,
    output: streams.output,
  });
  try {
    streams.output.write([
      "",
      "What do you want to run?",
      "  1) Admin only (local Shell editor + publishing bridge)",
      "  2) Forest only (local tracker/search worker)",
      "  3) Admin + Forest",
      "",
    ].join("\n"));
    const answer = await rl.question("Choose 1, 2, or 3 [1]: ");
    return normalizeRunMode(answer || "1");
  } finally {
    rl.close();
    streams.close();
  }
}

function openPromptStreams() {
  if (process.stdin.isTTY && process.stdout.isTTY) {
    return {
      input: process.stdin,
      output: process.stdout,
      close() {},
    };
  }
  if (process.platform !== "win32") {
    const probe = openSync("/dev/tty", "r");
    closeSync(probe);
    const input = createReadStream("/dev/tty");
    const output = createWriteStream("/dev/tty");
    return {
      input,
      output,
      close() {
        input.destroy();
        output.end();
      },
    };
  }
  throw new Error("Portable menu is unavailable without an interactive terminal.");
}

function normalizeRunMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "1" || mode === "admin" || mode === "a") return "admin";
  if (mode === "2" || mode === "forest" || mode === "f") return "forest";
  if (mode === "3" || mode === "both" || mode === "all" || mode === "b") return "both";
  throw new Error("Choose admin, forest, or both.");
}

function labelForRunMode(mode) {
  if (mode === "forest") return "Forest only";
  if (mode === "both") return "Admin + Forest";
  return "Admin only";
}

function npxCommand() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
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
