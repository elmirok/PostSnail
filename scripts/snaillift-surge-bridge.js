import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { decodeBase64 } from "../src/bytes.js";
import { runSnailLiftSafety } from "../src/snaillift/safety.js";
import { validateSurgeSettings } from "../src/snaillift/providers/surge.js";
import { unzipSync } from "../vendor/fflate/browser.js";

const HOST = process.env.POSTSNAIL_SURGE_BRIDGE_HOST || "127.0.0.1";
const PORT = Number(process.env.POSTSNAIL_SURGE_BRIDGE_PORT || 8788);
const DEFAULT_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${HOST}:${PORT}`);
  if (request.method === "OPTIONS") {
    writeJson(response, 204, { ok: true });
    return;
  }
  if (request.method === "GET" && url.pathname === "/health") {
    writeJson(response, 200, { ok: true, bridge: "surge", version: 1 });
    return;
  }
  if (request.method === "POST" && url.pathname === "/publish") {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    let payload = {};
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      writeJson(response, 400, { ok: false, message: "Bridge request must be JSON." });
      return;
    }

    const validation = validateSurgeSettings(payload);
    if (!validation.ok) {
      writeJson(response, 400, { ok: false, message: validation.errors.join("; ") });
      return;
    }

    const zipBase64 = String(payload.zipBase64 || "").trim();
    if (!zipBase64) {
      writeJson(response, 400, { ok: false, message: "Missing ZIP payload." });
      return;
    }

    const zipBytes = decodeBase64(zipBase64);
    const workRoot = await mkdtemp(join(tmpdir(), "postsnail-surge-"));
    const stageDir = join(workRoot, sanitizeProjectDir(validation.normalized.projectDir));

    try {
      mkdirSync(stageDir, { recursive: true });
      const files = unzipSync(zipBytes);
      const safety = runSnailLiftSafety(files);
      if (!safety.ok) {
        writeJson(response, 400, {
          ok: false,
          message: safety.errors[0] || "Surge bridge safety check failed.",
          errors: safety.errors,
        });
        return;
      }

      for (const [path, bytes] of Object.entries(files)) {
        const targetPath = resolve(stageDir, path);
        if (!targetPath.startsWith(resolve(stageDir))) {
          throw new Error(`Unsafe archive path: ${path}`);
        }
        mkdirSync(dirname(targetPath), { recursive: true });
        writeFileSync(targetPath, bytes);
      }

      writeFileSync(join(stageDir, "CNAME"), `${validation.normalized.domain}\n`, "utf8");

      const result = await publishWithSurge({
        cwd: stageDir,
        domain: validation.normalized.domain,
        surgeLogin: validation.normalized.surgeLogin,
        surgeToken: validation.normalized.surgeToken,
      });

      writeJson(response, 200, {
        ok: true,
        message: result.message || "Surge published.",
        deploymentUrl: validation.normalized.siteUrl,
        stdout: result.stdout,
      });
    } catch (error) {
      writeJson(response, 500, {
        ok: false,
        message: error instanceof Error ? error.message : String(error || "Surge bridge failed."),
      });
    } finally {
      rmSync(workRoot, { recursive: true, force: true });
    }
    return;
  }

  writeJson(response, 404, { ok: false, message: "Not found." });
});

server.listen(PORT, HOST, () => {
  console.log(`PostSnail Surge bridge listening on http://${HOST}:${PORT}`);
  console.log("Run the PostSnail admin publish button after unlocking the Shell.");
});

async function publishWithSurge({ cwd, domain, surgeLogin, surgeToken } = {}) {
  const env = {
    ...process.env,
    SURGE_LOGIN: surgeLogin,
    SURGE_TOKEN: surgeToken,
  };

  const commands = [
    { command: "surge", args: [cwd, "--domain", domain], env },
    { command: "npx", args: ["--yes", "surge", cwd, "--domain", domain], env },
  ];

  let lastError = null;
  for (const entry of commands) {
    const outcome = await runCommand(entry.command, entry.args, entry.env, cwd);
    if (outcome.error && outcome.error.code === "ENOENT" && entry.command === "surge") {
      lastError = outcome.error;
      continue;
    }
    if (outcome.code === 0) {
      return {
        message: "Surge publish completed.",
        stdout: `${outcome.stdout}\n${outcome.stderr}`.trim(),
      };
    }
    lastError = new Error(`${entry.command} exited with code ${outcome.code}. ${outcome.stderr || outcome.stdout}`.trim());
    break;
  }

  throw lastError || new Error("Surge publish failed.");
}

function runCommand(command, args, env, cwd) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      resolvePromise({ code: -1, stdout, stderr, error });
    });
    child.on("close", (code) => {
      resolvePromise({ code: Number(code ?? -1), stdout, stderr });
    });
  });
}

function sanitizeProjectDir(value) {
  const text = String(value || "").trim();
  if (!text) return "postsnail-public";
  const cleaned = text.replace(/[^A-Za-z0-9._/-]+/gu, "-").replace(/\/+$/u, "");
  if (!cleaned || cleaned.startsWith("/") || cleaned.includes("..") || cleaned.split("/").includes(".git")) {
    return "postsnail-public";
  }
  return cleaned;
}

function writeJson(response, status, body) {
  response.writeHead(status, DEFAULT_HEADERS);
  response.end(JSON.stringify(body));
}

