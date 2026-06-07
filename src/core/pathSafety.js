export function isSafeRelativePath(value) {
  const text = String(value || "").trim();
  if (!text || text.startsWith("/") || hasUnsafePathSyntax(text)) return false;
  const decoded = decodeSafePath(text);
  return Boolean(decoded) && safeSegments(decoded);
}

export function isSafeAbsolutePath(value) {
  const text = String(value || "").trim();
  if (!text.startsWith("/") || hasUnsafePathSyntax(text)) return false;
  const decoded = decodeSafePath(text);
  return Boolean(decoded) && safeSegments(decoded.slice(1));
}

function hasUnsafePathSyntax(text) {
  if (/[\u0000-\u001f\\?#]/u.test(text)) return true;
  if (/^[a-z]+:/iu.test(text)) return true;
  let decoded = text;
  try {
    decoded = decodeURIComponent(text);
  } catch {
    return true;
  }
  if (decoded !== text && hasUnsafePathSyntax(decoded)) return true;
  return false;
}

function decodeSafePath(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return "";
  }
}

function safeSegments(text) {
  return text
    .split("/")
    .every((segment) => segment && segment !== "." && segment !== ".." && !segment.startsWith("."));
}
