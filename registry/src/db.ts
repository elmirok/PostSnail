import type { RegistryPost, RegistrySite, RegistryStore, SearchParams, SearchResult, SubmissionRecord } from "./types";
import { tagsText } from "./ids";

interface Row {
  [key: string]: unknown;
}

export class D1RegistryStore implements RegistryStore {
  constructor(private readonly db: D1Database) {}

  async incrementRateLimit(key: string, windowStart = "", now = new Date().toISOString()): Promise<number> {
    await this.db.prepare(
      `INSERT INTO rate_limits (key, window_start, count, updated_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at`,
    ).bind(key, windowStart, now).run();
    const row = await this.db.prepare("SELECT count FROM rate_limits WHERE key = ?").bind(key).first<{ count: number }>();
    return Number(row?.count || 0);
  }

  async findRecentSubmission(siteUrl: string, now = new Date().toISOString()): Promise<{ id: string; status: string } | null> {
    const cutoff = new Date(Date.parse(now) - 24 * 60 * 60 * 1000).toISOString();
    const row = await this.db.prepare(
      `SELECT id, status FROM submissions
       WHERE site_url = ?
         AND status IN ('queued', 'crawling', 'indexed')
         AND updated_at >= ?
       ORDER BY updated_at DESC
       LIMIT 1`,
    ).bind(siteUrl, cutoff).first<{ id: string; status: string }>();
    return row || null;
  }

  async createSubmission(submission: SubmissionRecord): Promise<void> {
    await this.db.prepare(
      `INSERT INTO submissions (id, site_url, status, site_id, message, requester_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        submission.id,
        submission.siteUrl,
        submission.status,
        submission.siteId,
        submission.message,
        submission.requesterHash,
        submission.createdAt,
        submission.updatedAt,
      )
      .run();
  }

  async getSubmission(id: string): Promise<SubmissionRecord | null> {
    const row = await this.db.prepare("SELECT * FROM submissions WHERE id = ?").bind(id).first<Row>();
    return row ? rowToSubmission(row) : null;
  }

  async markSubmissionCrawling(id: string, now: string): Promise<void> {
    await this.db.prepare("UPDATE submissions SET status = 'crawling', message = '', updated_at = ? WHERE id = ?")
      .bind(now, id)
      .run();
    await this.db.prepare(
      `INSERT INTO crawl_runs (id, submission_id, site_url, status, message, started_at)
       SELECT ?, id, site_url, 'crawling', '', ? FROM submissions WHERE id = ?`,
    ).bind(`crawl_${crypto.randomUUID().replaceAll("-", "")}`, now, id).run();
  }

  async markSubmissionFailed(id: string, message: string, now: string): Promise<void> {
    await this.db.batch([
      this.db.prepare("UPDATE submissions SET status = 'failed', message = ?, updated_at = ? WHERE id = ?").bind(message, now, id),
      this.db.prepare(
        `UPDATE crawl_runs SET status = 'failed', message = ?, finished_at = ?
         WHERE submission_id = ? AND finished_at IS NULL`,
      ).bind(message, now, id),
    ]);
  }

  async upsertVerifiedSite(site: RegistrySite, posts: RegistryPost[], submissionId: string, now: string): Promise<void> {
    const statements: D1PreparedStatement[] = [
      this.db.prepare(
        `INSERT INTO sites (
          id, canonical_url, manifest_url, site_title, handle, description, site_url, public_key,
          bundle_fingerprint, generated_at, last_verified_at, hidden, created_at, updated_at,
          latest_crawl_status, latest_crawl_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          canonical_url = excluded.canonical_url,
          manifest_url = excluded.manifest_url,
          site_title = excluded.site_title,
          handle = excluded.handle,
          description = excluded.description,
          site_url = excluded.site_url,
          public_key = excluded.public_key,
          bundle_fingerprint = excluded.bundle_fingerprint,
          generated_at = excluded.generated_at,
          last_verified_at = excluded.last_verified_at,
          updated_at = excluded.updated_at,
          latest_crawl_status = excluded.latest_crawl_status,
          latest_crawl_message = excluded.latest_crawl_message`,
      ).bind(
        site.id,
        site.canonicalUrl,
        site.manifestUrl,
        site.siteTitle,
        site.handle,
        site.description,
        site.siteUrl,
        site.publicKey,
        site.bundleFingerprint,
        site.generatedAt,
        now,
        site.hidden,
        now,
        now,
        "indexed",
        "",
      ),
      this.db.prepare("DELETE FROM posts WHERE site_id = ?").bind(site.id),
    ];
    for (const post of posts) {
      statements.push(
        this.db.prepare(
          `INSERT INTO posts (
            id, site_id, slug, title, url, excerpt, tags_json, tags_text, digest, published_at,
            search_text, visible, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        ).bind(
          post.id,
          site.id,
          post.slug,
          post.title,
          post.url,
          post.excerpt,
          JSON.stringify(post.tags),
          tagsText(post.tags),
          post.digest,
          post.publishedAt,
          post.searchText,
          now,
          now,
        ),
      );
    }
    statements.push(
      this.db.prepare("UPDATE submissions SET status = 'indexed', site_id = ?, message = '', updated_at = ? WHERE id = ?")
        .bind(site.id, now, submissionId),
      this.db.prepare(
        `UPDATE crawl_runs SET status = 'indexed', message = '', finished_at = ?
         WHERE submission_id = ? AND finished_at IS NULL`,
      ).bind(now, submissionId),
    );
    await this.db.batch(statements);
  }

  async getSite(id: string): Promise<RegistrySite | null> {
    const row = await this.db.prepare("SELECT * FROM sites WHERE id = ?").bind(id).first<Row>();
    return row ? rowToSite(row) : null;
  }

  async getPostsForSite(id: string, limit = 100): Promise<RegistryPost[]> {
    const result = await this.db.prepare(
      `SELECT id AS post_id, site_id, slug, title, url, excerpt, tags_json, digest, published_at,
        search_text, visible, created_at AS post_created_at, updated_at AS post_updated_at
       FROM posts
       WHERE site_id = ? AND visible = 1
       ORDER BY published_at DESC, id DESC
       LIMIT ?`,
    ).bind(id, Math.min(Math.max(limit, 1), 100)).all<Row>();
    return (result.results || []).map(rowToPost);
  }

  async setSiteHidden(id: string, hidden: boolean, now = new Date().toISOString()): Promise<void> {
    await this.db.prepare("UPDATE sites SET hidden = ?, updated_at = ? WHERE id = ?").bind(hidden ? 1 : 0, now, id).run();
  }

  async search(params: SearchParams): Promise<SearchResult> {
    const limit = Math.min(Math.max(params.limit || 20, 1), 50);
    const conditions = ["s.hidden = 0", "p.visible = 1"];
    const values: unknown[] = [];
    if (params.q) {
      const like = `%${escapeLike(params.q)}%`;
      conditions.push("(p.search_text LIKE ? ESCAPE '\\' OR s.site_title LIKE ? ESCAPE '\\' OR s.description LIKE ? ESCAPE '\\')");
      values.push(like, like, like);
    }
    if (params.tag) {
      conditions.push("p.tags_text LIKE ?");
      values.push(`%|${params.tag}|%`);
    }
    const cursor = parseCursor(params.cursor);
    if (cursor) {
      conditions.push("(p.published_at < ? OR (p.published_at = ? AND p.id < ?))");
      values.push(cursor.publishedAt, cursor.publishedAt, cursor.id);
    }
    values.push(limit + 1);
    const result = await this.db.prepare(
      `SELECT
        s.id AS site_id, s.canonical_url, s.manifest_url, s.site_title, s.handle, s.description,
        s.site_url, s.public_key, s.bundle_fingerprint, s.generated_at, s.last_verified_at,
        s.hidden, s.created_at AS site_created_at, s.updated_at AS site_updated_at,
        s.latest_crawl_status, s.latest_crawl_message,
        p.id AS post_id, p.slug, p.title, p.url, p.excerpt, p.tags_json, p.digest,
        p.published_at, p.search_text, p.visible, p.created_at AS post_created_at, p.updated_at AS post_updated_at
       FROM posts p
       JOIN sites s ON s.id = p.site_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY p.published_at DESC, p.id DESC
       LIMIT ?`,
    ).bind(...values).all<Row>();
    const rows = result.results || [];
    const pageRows = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? makeCursor(rowToPost(rows[limit])) : null;
    return {
      items: pageRows.map((row) => ({ site: rowToSite(row), post: rowToPost(row) })),
      nextCursor,
    };
  }
}

function rowToSubmission(row: Row): SubmissionRecord {
  return {
    id: String(row.id || ""),
    siteUrl: String(row.site_url || ""),
    status: String(row.status || "failed") as SubmissionRecord["status"],
    siteId: row.site_id ? String(row.site_id) : null,
    message: String(row.message || ""),
    requesterHash: String(row.requester_hash || ""),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

function rowToSite(row: Row): RegistrySite {
  return {
    id: String(row.site_id || row.id || ""),
    canonicalUrl: String(row.canonical_url || ""),
    manifestUrl: String(row.manifest_url || ""),
    siteTitle: String(row.site_title || ""),
    handle: String(row.handle || ""),
    description: String(row.description || ""),
    siteUrl: String(row.site_url || ""),
    publicKey: String(row.public_key || ""),
    bundleFingerprint: String(row.bundle_fingerprint || ""),
    generatedAt: String(row.generated_at || ""),
    lastVerifiedAt: String(row.last_verified_at || ""),
    hidden: Number(row.hidden || 0),
    createdAt: String(row.site_created_at || row.created_at || ""),
    updatedAt: String(row.site_updated_at || row.updated_at || ""),
    latestCrawlStatus: String(row.latest_crawl_status || "indexed") as RegistrySite["latestCrawlStatus"],
    latestCrawlMessage: String(row.latest_crawl_message || ""),
  };
}

function rowToPost(row: Row): RegistryPost {
  return {
    id: String(row.post_id || row.id || ""),
    siteId: String(row.site_id || ""),
    slug: String(row.slug || ""),
    title: String(row.title || ""),
    url: String(row.url || ""),
    excerpt: String(row.excerpt || ""),
    tags: parseTags(row.tags_json),
    digest: String(row.digest || ""),
    publishedAt: String(row.published_at || ""),
    searchText: String(row.search_text || ""),
    visible: Number(row.visible || 0),
    createdAt: String(row.post_created_at || row.created_at || ""),
    updatedAt: String(row.post_updated_at || row.updated_at || ""),
  };
}

function parseTags(value: unknown): string[] {
  try {
    const tags = JSON.parse(String(value || "[]"));
    return Array.isArray(tags) ? tags.map(String) : [];
  } catch {
    return [];
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (match) => `\\${match}`);
}

function makeCursor(post: RegistryPost): string {
  return btoa(JSON.stringify({ publishedAt: post.publishedAt, id: post.id })).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function parseCursor(value: string | null): { publishedAt: string; id: string } | null {
  if (!value) return null;
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(padded));
    if (typeof parsed.publishedAt === "string" && typeof parsed.id === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}
