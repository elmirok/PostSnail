const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".txt",
  ".xml",
  ".svg",
  ".surgeignore",
]);

const PUBLIC_EXTENSIONS = new Set([
  ...TEXT_EXTENSIONS,
  ".avif",
  ".gif",
  ".ico",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".woff",
  ".woff2",
]);

const PRIVATE_PATH_SEGMENTS = new Set([
  "admin-private",
  "drafts",
  "private",
  "private-plugin-state",
  "recovery",
  "rejected-comments",
  "workspace",
]);

const FORBIDDEN_FILENAMES = new Set([
  ".env",
  ".env.local",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "wrangler.jsonc",
]);

const SERVER_EXTENSIONS = new Set([
  ".bash",
  ".env",
  ".php",
  ".py",
  ".rb",
  ".sh",
  ".sql",
  ".sqlite",
]);

const PRIVATE_TEXT_MARKERS = [
  "postsnail-workspace",
  "encrypted-workspace",
  "encryptedSecretKey",
  "rawPrivateKey",
  "rawSecretKey",
  "privateSigningKey",
  "secretSigningKey",
  "signingSecretKey",
  "plugin-private-token",
  "private-plugin-state",
  "rejected-comments",
  "Rejected private moderation note",
  "CLOUDFLARE_API_TOKEN",
  "GITHUB_TOKEN",
];

const decoder = new TextDecoder();

export function validatePublicExportFiles(files = {}) {
  const errors = [];
  const warnings = [];
  const entries = objectEntries(files);

  for (const [path, bytes] of entries) {
    validatePath(path, errors, warnings);
    validateContent(path, bytes, errors, warnings);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    fileCount: entries.length,
  };
}

function validatePath(path, errors, warnings) {
  const normalized = String(path || "");
  const lower = normalized.toLowerCase();
  const basename = lower.split("/").pop() || "";
  const extension = extensionFor(lower);

  if (!isSafePublicPath(normalized)) {
    errors.push(`Unsafe path in public export: ${normalized}`);
  }
  if (lower.endsWith(".postsnail")) {
    errors.push(`Public export must not include .postsnail files: ${normalized}`);
  }
  if (FORBIDDEN_FILENAMES.has(basename)) {
    errors.push(`Public export must not include server/env files: ${normalized}`);
  }
  if (SERVER_EXTENSIONS.has(extension)) {
    errors.push(`Public export must not include server/env files: ${normalized}`);
  }
  if (extension && !PUBLIC_EXTENSIONS.has(extension)) {
    warnings.push(`Review uncommon public export extension: ${normalized}`);
  }
  if (extension === ".svg") {
    warnings.push(`SVG assets should only come from trusted project code: ${normalized}`);
  }

  for (const segment of lower.split("/")) {
    if (PRIVATE_PATH_SEGMENTS.has(segment)) {
      errors.push(`Public export must not include private path segment "${segment}": ${normalized}`);
    }
  }
}

function validateContent(path, bytes, errors) {
  const extension = extensionFor(String(path || "").toLowerCase());
  if (!TEXT_EXTENSIONS.has(extension) && extension !== ".postsnail") return;

  const text = decodeMaybeText(bytes);
  for (const marker of PRIVATE_TEXT_MARKERS) {
    if (text.includes(marker)) {
      errors.push(`Public export file contains private marker "${marker}": ${path}`);
    }
  }
}

export function isSafePublicPath(path) {
  const text = String(path || "");
  if (text === ".surgeignore") return true;
  if (!text || text.startsWith("/") || text.includes("\\") || /[\u0000-\u001f]/u.test(text)) {
    return false;
  }
  if (/^[a-z]+:/iu.test(text)) return false;
  const segments = text.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return false;
  return segments.every((segment, index) => index === 0 || !segment.startsWith(".") || segments[index - 1] === ".well-known");
}

function extensionFor(path) {
  const filename = path.split("/").pop() || "";
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot) : "";
}

function decodeMaybeText(value) {
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return decoder.decode(value);
  if (ArrayBuffer.isView(value)) return decoder.decode(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  if (value instanceof ArrayBuffer) return decoder.decode(new Uint8Array(value));
  return "";
}

function objectEntries(files) {
  return files && typeof files === "object" && !Array.isArray(files) ? Object.entries(files) : [];
}
