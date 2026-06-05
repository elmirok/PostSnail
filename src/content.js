export function slugify(value) {
  const slug = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .replace(/-{2,}/gu, "-");
  return slug || "post";
}

export function normalizeTags(tags) {
  const list = Array.isArray(tags) ? tags : String(tags ?? "").split(",");
  return Array.from(
    new Set(
      list
        .map((tag) => slugify(tag))
        .filter((tag) => tag && tag !== "post"),
    ),
  ).sort();
}

export function normalizePost(input) {
  const now = new Date().toISOString();
  const body = String(input.body ?? "");
  const title = String(input.title ?? "").trim();
  const createdAt = input.createdAt || now;
  const status = input.status === "draft" ? "draft" : "published";
  const slugSource = input.slug || title || body.split(/\s+/u).slice(0, 8).join(" ");
  return {
    id: String(input.id || crypto.randomUUID()),
    title,
    slug: slugify(slugSource),
    body,
    tags: normalizeTags(input.tags),
    status,
    excerpt: buildExcerpt(input.excerpt || body),
    imageIds: Array.isArray(input.imageIds) ? input.imageIds.map(String) : [],
    createdAt,
    updatedAt: input.updatedAt || createdAt,
    publishedAt: status === "published" ? input.publishedAt || createdAt : "",
  };
}

export function buildExcerpt(value, maxLength = 180) {
  const plain = String(value ?? "")
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, " ")
    .replace(/\[[^\]]+\]\([^)]*\)/gu, "$1")
    .replace(/[#*_>`~\-[\]]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength - 1).trim()}...`;
}

export function uniqueSlug(baseSlug, existingSlugs) {
  const base = slugify(baseSlug);
  if (!existingSlugs.has(base)) return base;
  let index = 2;
  while (existingSlugs.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}
