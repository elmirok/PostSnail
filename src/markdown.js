import { marked } from "../vendor/marked/marked.esm.js";

marked.setOptions({
  breaks: true,
  gfm: true,
  mangle: false,
  headerIds: false,
});

export function renderMarkdown(markdown, purifier = globalThis.DOMPurify) {
  const raw = marked.parse(String(markdown ?? ""));
  if (purifier?.sanitize) {
    return purifier.sanitize(raw, {
      ALLOWED_TAGS: [
        "a",
        "blockquote",
        "br",
        "code",
        "em",
        "h1",
        "h2",
        "h3",
        "h4",
        "hr",
        "img",
        "li",
        "ol",
        "p",
        "pre",
        "strong",
        "ul",
      ],
      ALLOWED_ATTR: ["alt", "href", "src", "title"],
    });
  }
  return fallbackSanitize(raw);
}

function fallbackSanitize(html) {
  return String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, "")
    .replace(/\s(?:href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/giu, "")
    .replace(/\s(?:href|src)\s*=\s*javascript:[^\s>]+/giu, "");
}

