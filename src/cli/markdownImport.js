import { normalizePost } from "../content.js";

export function parseFrontmatterMarkdown(sourceText) {
  const text = String(sourceText || "");
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/u);
  if (!match) {
    throw new Error("Markdown draft must start with YAML-style frontmatter.");
  }

  const [, frontmatter, body] = match;
  const meta = {};
  const lines = frontmatter.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    if (!raw.trim()) continue;
    const keyMatch = raw.match(/^([A-Za-z0-9_-]+):(.*)$/u);
    if (!keyMatch) {
      throw new Error(`Unsupported frontmatter line: ${raw}`);
    }
    const [, key, remainder] = keyMatch;
    const value = remainder.trim();
    if (!value) {
      const items = [];
      while (index + 1 < lines.length && /^\s*-\s+/u.test(lines[index + 1])) {
        index += 1;
        items.push(unquote(lines[index].replace(/^\s*-\s+/u, "").trim()));
      }
      meta[key] = items;
      continue;
    }
    meta[key] = unquote(value);
  }
  return { meta, body: body.trim() };
}

export function buildImportedPost({ meta, body, existingPost = null }) {
  const known = new Set(["title", "slug", "excerpt", "tags", "status"]);
  const extensions = Object.fromEntries(
    Object.entries(meta).filter(([key]) => !known.has(key)),
  );
  const post = normalizePost({
    ...existingPost,
    title: meta.title,
    slug: meta.slug,
    excerpt: meta.excerpt,
    tags: meta.tags || [],
    status: meta.status === "ready" ? "published" : "draft",
    body,
    updatedAt: new Date().toISOString(),
  });
  return Object.keys(extensions).length
    ? {
        ...post,
        extensions: {
          ...(existingPost?.extensions || {}),
          importedFrontmatter: extensions,
        },
      }
    : post;
}

function unquote(value) {
  return String(value || "").replace(/^['"]|['"]$/gu, "");
}

