import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { isSafeRelativePath } from "../core/pathSafety.js";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

export async function startPortableServer({ rootDir, host = "127.0.0.1", port = 0 } = {}) {
  const server = createServer(async (request, response) => {
    try {
      await handleRequest(request, response, rootDir);
    } catch (error) {
      if (!response.headersSent) {
        response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      }
      response.end(error instanceof Error ? error.message : String(error || "Portable server error"));
    }
  });

  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(port, host, () => resolvePromise());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to determine portable server port.");
  }

  return {
    server,
    host,
    port: address.port,
    url: `http://${host}:${address.port}/`,
    async close() {
      await new Promise((resolvePromise) => server.close(() => resolvePromise()));
    },
  };
}

async function handleRequest(request, response, rootDir) {
  const method = String(request.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    response.writeHead(405, {
      Allow: "GET, HEAD",
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("Method not allowed.");
    return;
  }

  const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
  const pathname = decodePathname(requestUrl.pathname);
  const absolutePath = await resolveStaticPath(rootDir, pathname);
  if (!absolutePath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found.");
    return;
  }

  const bytes = await readFile(absolutePath);
  response.writeHead(200, {
    "Content-Type": contentTypeForPath(absolutePath),
    "Content-Length": bytes.length,
    "Cache-Control": "no-store",
  });
  if (method === "HEAD") {
    response.end();
    return;
  }
  response.end(bytes);
}

async function resolveStaticPath(rootDir, pathname) {
  const normalizedRoot = resolve(rootDir);
  const cleanPath = sanitizeRequestPath(pathname);
  if (cleanPath === null) return null;

  const candidates = [];
  if (cleanPath === "") {
    candidates.push(join(normalizedRoot, "index.html"));
  } else {
    candidates.push(join(normalizedRoot, cleanPath));
    if (!extname(cleanPath)) {
      candidates.push(join(normalizedRoot, `${cleanPath}.html`));
      candidates.push(join(normalizedRoot, cleanPath, "index.html"));
    }
  }

  for (const candidate of candidates) {
    if (!(await isReadableFile(candidate, normalizedRoot))) continue;
    return candidate;
  }

  return null;
}

async function isReadableFile(candidate, normalizedRoot) {
  try {
    const resolved = resolve(candidate);
    if (!resolved.startsWith(`${normalizedRoot}${sep}`) && resolved !== normalizedRoot) {
      return false;
    }
    const stats = await stat(resolved);
    return stats.isFile();
  } catch {
    return false;
  }
}

function sanitizeRequestPath(pathname) {
  const trimmed = String(pathname || "/").replace(/^\/+/u, "");
  if (trimmed === "") return "";
  const withoutTrailingSlash = trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
  if (withoutTrailingSlash === "") return "";
  if (!isSafeRelativePath(withoutTrailingSlash) && withoutTrailingSlash !== "index.html") {
    return null;
  }
  return withoutTrailingSlash;
}

function decodePathname(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return "/";
  }
}

function contentTypeForPath(path) {
  return MIME_TYPES[extname(path).toLowerCase()] || "application/octet-stream";
}
