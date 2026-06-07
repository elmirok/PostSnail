import type { RegistryPost, RegistrySite, RegistryStore, SearchParams, SearchResult, SearchResultItem, ShellNameRecord, SubmissionRecord } from "./types";
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

  async findActiveSubmission(siteUrl: string): Promise<{ id: string; status: string } | null> {
    const row = await this.db.prepare(
      `SELECT id, status FROM submissions
       WHERE site_url = ?
         AND status IN ('queued', 'crawling')
       ORDER BY updated_at DESC
       LIMIT 1`,
    ).bind(siteUrl).first<{ id: string; status: string }>();
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
          bundle_fingerprint, logo_url, details_json, generated_at, last_verified_at, hidden, created_at, updated_at,
          latest_crawl_status, latest_crawl_message, last_checked_at, next_check_at,
          check_interval_minutes, unchanged_check_count, failure_count, pending_fingerprint
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          canonical_url = excluded.canonical_url,
          manifest_url = excluded.manifest_url,
          site_title = excluded.site_title,
          handle = excluded.handle,
          description = excluded.description,
          site_url = excluded.site_url,
          public_key = excluded.public_key,
          bundle_fingerprint = excluded.bundle_fingerprint,
          logo_url = excluded.logo_url,
          details_json = excluded.details_json,
          generated_at = excluded.generated_at,
          last_verified_at = excluded.last_verified_at,
          updated_at = excluded.updated_at,
          latest_crawl_status = excluded.latest_crawl_status,
          latest_crawl_message = excluded.latest_crawl_message,
          last_checked_at = excluded.last_checked_at,
          next_check_at = excluded.next_check_at,
          check_interval_minutes = excluded.check_interval_minutes,
          unchanged_check_count = excluded.unchanged_check_count,
          failure_count = excluded.failure_count,
          pending_fingerprint = excluded.pending_fingerprint`,
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
        site.logoUrl,
        JSON.stringify(site.details || {}),
        site.generatedAt,
        now,
        site.hidden,
        now,
        now,
        "indexed",
        "",
        now,
        addMinutes(now, 60),
        60,
        0,
        0,
        "",
      ),
      this.db.prepare("DELETE FROM posts WHERE site_id = ?").bind(site.id),
    ];
    for (const post of posts) {
      statements.push(
        this.db.prepare(
          `INSERT INTO posts (
            id, site_id, slug, title, url, excerpt, tags_json, tags_text, digest, thumbnail_url,
            details_json, published_at, search_text, visible, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
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
          post.thumbnailUrl,
          JSON.stringify(post.details || {}),
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

  async getSiteByCanonicalUrl(siteUrl: string): Promise<RegistrySite | null> {
    const row = await this.db.prepare("SELECT * FROM sites WHERE canonical_url = ? ORDER BY updated_at DESC LIMIT 1").bind(siteUrl).first<Row>();
    return row ? rowToSite(row) : null;
  }

  async getDueSites(now: string, limit: number): Promise<RegistrySite[]> {
    const result = await this.db.prepare(
      `SELECT * FROM sites
       WHERE hidden = 0
         AND next_check_at <= ?
       ORDER BY next_check_at ASC, id ASC
       LIMIT ?`,
    ).bind(now, Math.min(Math.max(limit, 1), 100)).all<Row>();
    return (result.results || []).map(rowToSite);
  }

  async getPostsForSite(id: string, limit = 100): Promise<RegistryPost[]> {
    const result = await this.db.prepare(
      `SELECT id AS post_id, site_id, slug, title, url, excerpt, tags_json, digest, thumbnail_url,
        details_json AS post_details_json, published_at, search_text, visible,
        created_at AS post_created_at, updated_at AS post_updated_at
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

  async recordPendingRefresh(siteId: string, fingerprint: string, nextCheckAt: string, now: string): Promise<void> {
    await this.db.prepare(
      `UPDATE sites
       SET pending_fingerprint = ?, next_check_at = ?, last_checked_at = ?, latest_crawl_status = 'queued',
         latest_crawl_message = 'Waiting for announced fingerprint to appear on the live site.', updated_at = ?
       WHERE id = ?`,
    ).bind(fingerprint, nextCheckAt, now, now, siteId).run();
  }

  async recordRefreshQueued(siteId: string, fingerprint: string, nextCheckAt: string, now: string): Promise<void> {
    await this.db.prepare(
      `UPDATE sites
       SET pending_fingerprint = ?, next_check_at = ?, last_checked_at = ?, latest_crawl_status = 'queued',
         latest_crawl_message = '', updated_at = ?
       WHERE id = ?`,
    ).bind(fingerprint, nextCheckAt, now, now, siteId).run();
  }

  async recordRefreshCheck(siteId: string, outcome: { changed: boolean; failed: boolean; fingerprint?: string }, now: string, nextCheckAt: string, intervalMinutes: number): Promise<void> {
    await this.db.prepare(
      `UPDATE sites
       SET last_checked_at = ?, next_check_at = ?, check_interval_minutes = ?,
         unchanged_check_count = CASE WHEN ? THEN 0 ELSE unchanged_check_count + 1 END,
         failure_count = CASE WHEN ? THEN failure_count + 1 ELSE 0 END,
         pending_fingerprint = CASE WHEN ? THEN COALESCE(?, pending_fingerprint) ELSE pending_fingerprint END,
         latest_crawl_status = CASE WHEN ? THEN 'failed' ELSE latest_crawl_status END,
         latest_crawl_message = CASE WHEN ? THEN 'Proof metadata could not be checked.' ELSE latest_crawl_message END,
         updated_at = ?
       WHERE id = ?`,
    )
      .bind(
        now,
        nextCheckAt,
        intervalMinutes,
        outcome.changed || outcome.failed ? 1 : 0,
        outcome.failed ? 1 : 0,
        outcome.changed ? 1 : 0,
        outcome.fingerprint || "",
        outcome.failed ? 1 : 0,
        outcome.failed ? 1 : 0,
        now,
        siteId,
      )
      .run();
  }

  async search(params: SearchParams): Promise<SearchResult> {
    const limit = Math.min(Math.max(params.limit || 20, 1), 50);
    const scope = params.scope || "content";
    const sort = params.sort || "best";
    const now = new Date().toISOString();
    const sources = [
      scope !== "shell" ? "content" : "",
      scope !== "content" ? "shell" : "",
      scope !== "content" ? "shellname" : "",
    ].filter(Boolean);
    const sourceLimit = params.cursor
      ? 100
      : scope === "all"
        ? Math.min(Math.ceil(limit / Math.max(sources.length, 1)) + 5, limit + 1)
        : limit + 1;
    const fetchParams = { ...params, sort, cursor: null };
    const rows = [
      ...(scope === "shell" ? [] : await this.searchContentRows(fetchParams, sourceLimit)),
      ...(scope === "content" ? [] : await this.searchShellRows(fetchParams, sourceLimit, now)),
      ...(scope === "content" ? [] : await this.searchShellNameRows(fetchParams, sourceLimit, now)),
    ];
    const mergedItems = mergeSearchItems(rows.map(searchRowToItem), fetchParams).sort((left, right) => compareSearchItems(left, right, fetchParams));
    const cursor = parseCursor(params.cursor);
    const start = cursor ? Math.max(mergedItems.findIndex((item) => stableItemId(item) === cursor.id && (!cursor.type || item.type === cursor.type)) + 1, 0) : 0;
    const items = mergedItems.slice(start, start + limit);
    const nextCursor = mergedItems.length > start + limit ? makeCursorForItem(items.at(-1), fetchParams) : null;
    return {
      items,
      nextCursor,
    };
  }

  private async searchContentRows(params: SearchParams, limit: number): Promise<Row[]> {
    const conditions = ["s.hidden = 0", "p.visible = 1"];
    const values: unknown[] = [];
    addContentSearchConditions(conditions, values, params);
    values.push(limit);
    const result = await this.db.prepare(
      `SELECT
        'content' AS result_type, p.published_at AS sort_at,
        s.id AS site_id, s.canonical_url, s.manifest_url, s.site_title, s.handle, s.description,
        s.site_url, s.public_key, s.bundle_fingerprint, s.logo_url, s.details_json AS site_details_json,
        s.generated_at, s.last_verified_at, s.hidden, s.created_at AS site_created_at,
        s.updated_at AS site_updated_at, s.latest_crawl_status, s.latest_crawl_message,
        p.id AS post_id, p.slug, p.title, p.url, p.excerpt, p.tags_json, p.digest, p.thumbnail_url,
        p.details_json AS post_details_json, p.published_at, p.search_text, p.visible,
        p.created_at AS post_created_at, p.updated_at AS post_updated_at
       FROM posts p
       JOIN sites s ON s.id = p.site_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY ${contentOrderBy(params.sort)}
       LIMIT ?`,
    ).bind(...values).all<Row>();
    return result.results || [];
  }

  private async searchShellRows(params: SearchParams, limit: number, now: string): Promise<Row[]> {
    const conditions = ["s.hidden = 0"];
    const values: unknown[] = [now];
    if (params.q) {
      const like = `%${escapeLike(params.q)}%`;
      conditions.push(
        `(s.site_title LIKE ? ESCAPE '\\'
          OR s.description LIKE ? ESCAPE '\\'
          OR s.handle LIKE ? ESCAPE '\\'
          OR s.canonical_url LIKE ? ESCAPE '\\'
          OR s.site_url LIKE ? ESCAPE '\\')`,
      );
      values.push(like, like, like, like, like);
    }
    if (params.tag) {
      conditions.push(
        `EXISTS (
          SELECT 1 FROM posts p2
          WHERE p2.site_id = s.id AND p2.visible = 1 AND p2.tags_text LIKE ?
        )`,
      );
      values.push(`%|${params.tag}|%`);
    }
    values.push(limit);
    const result = await this.db.prepare(
      `SELECT
        'shell' AS result_type, COALESCE(s.last_verified_at, s.generated_at) AS sort_at,
        s.id AS site_id, s.canonical_url, s.manifest_url, s.site_title, s.handle, s.description,
        s.site_url, s.public_key, s.bundle_fingerprint, s.logo_url, s.details_json AS site_details_json,
        s.generated_at, s.last_verified_at, s.hidden, s.created_at AS site_created_at,
        s.updated_at AS site_updated_at, s.latest_crawl_status, s.latest_crawl_message,
        sn.name AS shell_name_name, sn.full_name AS shell_name_full_name, sn.forest AS shell_name_forest,
        sn.site_url AS shell_name_site_url, sn.public_key AS shell_name_public_key,
        sn.bundle_fingerprint AS shell_name_bundle_fingerprint, sn.record_json AS shell_name_record_json,
        sn.signature AS shell_name_signature, sn.status AS shell_name_status, sn.hidden AS shell_name_hidden,
        sn.expires_at AS shell_name_expires_at, sn.search_text AS shell_name_search_text,
        sn.created_at AS shell_name_created_at, sn.updated_at AS shell_name_updated_at
       FROM sites s
       LEFT JOIN shell_names sn
         ON sn.hidden = 0
        AND sn.status = 'active'
        AND sn.expires_at > ?
        AND (sn.public_key = s.public_key OR sn.site_url = s.canonical_url OR sn.site_url = s.site_url)
       WHERE ${conditions.join(" AND ")}
       ORDER BY ${shellOrderBy(params.sort)}
       LIMIT ?`,
    ).bind(...values).all<Row>();
    return result.results || [];
  }

  private async searchShellNameRows(params: SearchParams, limit: number, now: string): Promise<Row[]> {
    if (params.tag) return [];
    const conditions = ["sn.hidden = 0", "sn.status = 'active'", "sn.expires_at > ?"];
    const values: unknown[] = [now];
    if (params.q) {
      conditions.push("sn.search_text LIKE ? ESCAPE '\\'");
      values.push(`%${escapeLike(params.q)}%`);
    }
    values.push(limit);
    const result = await this.db.prepare(
      `SELECT
        'shellname' AS result_type, sn.updated_at AS sort_at,
        s.id AS site_id, s.canonical_url, s.manifest_url, s.site_title, s.handle, s.description,
        s.site_url AS indexed_site_url, s.public_key AS indexed_public_key,
        s.bundle_fingerprint AS indexed_bundle_fingerprint, s.logo_url, s.details_json AS site_details_json,
        s.generated_at, s.last_verified_at, s.hidden, s.created_at AS site_created_at,
        s.updated_at AS site_updated_at, s.latest_crawl_status, s.latest_crawl_message,
        sn.name, sn.full_name, sn.forest, sn.site_url, sn.public_key, sn.bundle_fingerprint,
        sn.record_json, sn.signature, sn.status, sn.hidden, sn.expires_at, sn.search_text,
        sn.name AS shell_name_name, sn.full_name AS shell_name_full_name, sn.forest AS shell_name_forest,
        sn.site_url AS shell_name_site_url, sn.public_key AS shell_name_public_key,
        sn.bundle_fingerprint AS shell_name_bundle_fingerprint, sn.record_json AS shell_name_record_json,
        sn.signature AS shell_name_signature, sn.status AS shell_name_status, sn.hidden AS shell_name_hidden,
        sn.expires_at AS shell_name_expires_at, sn.search_text AS shell_name_search_text,
        sn.created_at AS shell_name_created_at, sn.updated_at AS shell_name_updated_at,
        sn.created_at, sn.updated_at
       FROM shell_names sn
       LEFT JOIN sites s
         ON s.hidden = 0
        AND (sn.public_key = s.public_key OR sn.site_url = s.canonical_url OR sn.site_url = s.site_url)
       WHERE ${conditions.join(" AND ")}
       ORDER BY ${shellNameOrderBy(params.sort)}
       LIMIT ?`,
    ).bind(...values).all<Row>();
    return result.results || [];
  }

  async getShellName(name: string): Promise<ShellNameRecord | null> {
    const row = await this.db.prepare("SELECT * FROM shell_names WHERE name = ?").bind(name).first<Row>();
    return row ? rowToShellName(row) : null;
  }

  async getShellNameByPublicKey(publicKey: string): Promise<ShellNameRecord | null> {
    const row = await this.db.prepare(
      `SELECT * FROM shell_names
       WHERE public_key = ? AND status = 'active' AND hidden = 0
       ORDER BY updated_at DESC
       LIMIT 1`,
    ).bind(publicKey).first<Row>();
    return row ? rowToShellName(row) : null;
  }

  async upsertShellName(record: ShellNameRecord): Promise<void> {
    await this.db.prepare(
      `INSERT INTO shell_names (
        name, full_name, forest, site_url, public_key, bundle_fingerprint, record_json, signature,
        status, hidden, expires_at, search_text, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        full_name = excluded.full_name,
        forest = excluded.forest,
        site_url = excluded.site_url,
        public_key = excluded.public_key,
        bundle_fingerprint = excluded.bundle_fingerprint,
        record_json = excluded.record_json,
        signature = excluded.signature,
        status = excluded.status,
        hidden = excluded.hidden,
        expires_at = excluded.expires_at,
        search_text = excluded.search_text,
        updated_at = excluded.updated_at`,
    ).bind(
      record.name,
      record.fullName,
      record.forest,
      record.siteUrl,
      record.publicKey,
      record.bundleFingerprint,
      JSON.stringify(record.record || {}),
      record.signature,
      record.status,
      record.hidden,
      record.expiresAt,
      record.searchText,
      record.createdAt,
      record.updatedAt,
    ).run();
  }

  async setShellNameHidden(name: string, hidden: boolean, now = new Date().toISOString()): Promise<void> {
    await this.db.prepare(
      "UPDATE shell_names SET hidden = ?, status = ?, updated_at = ? WHERE name = ?",
    ).bind(hidden ? 1 : 0, hidden ? "hidden" : "active", now, name).run();
  }

  async searchShellNames(q: string, limit: number, now = new Date().toISOString()): Promise<ShellNameRecord[]> {
    const conditions = ["hidden = 0", "status = 'active'", "expires_at > ?"];
    const values: unknown[] = [now];
    if (q) {
      conditions.push("search_text LIKE ? ESCAPE '\\'");
      values.push(`%${escapeLike(q)}%`);
    }
    values.push(Math.min(Math.max(limit, 1), 100));
    const result = await this.db.prepare(
      `SELECT * FROM shell_names
       WHERE ${conditions.join(" AND ")}
       ORDER BY updated_at DESC, name DESC
       LIMIT ?`,
    ).bind(...values).all<Row>();
    return (result.results || []).map(rowToShellName);
  }

  async recentShellNames(limit: number, now = new Date().toISOString()): Promise<ShellNameRecord[]> {
    const result = await this.db.prepare(
      `SELECT * FROM shell_names
       WHERE hidden = 0 AND status = 'active' AND expires_at > ?
       ORDER BY updated_at DESC, name DESC
       LIMIT ?`,
    ).bind(now, Math.min(Math.max(limit, 1), 100)).all<Row>();
    return (result.results || []).map(rowToShellName);
  }

  async exportShellNames(now = new Date().toISOString()): Promise<ShellNameRecord[]> {
    const result = await this.db.prepare(
      `SELECT * FROM shell_names
       WHERE hidden = 0 AND status = 'active' AND expires_at > ?
       ORDER BY name ASC`,
    ).bind(now).all<Row>();
    return (result.results || []).map(rowToShellName);
  }
}

function addContentSearchConditions(conditions: string[], values: unknown[], params: SearchParams): void {
  if (params.q) {
    const like = `%${escapeLike(params.q)}%`;
    conditions.push(
      `(p.search_text LIKE ? ESCAPE '\\'
        OR s.site_title LIKE ? ESCAPE '\\'
        OR s.description LIKE ? ESCAPE '\\'
        OR s.handle LIKE ? ESCAPE '\\'
        OR s.canonical_url LIKE ? ESCAPE '\\'
        OR s.site_url LIKE ? ESCAPE '\\')`,
    );
    values.push(like, like, like, like, like, like);
  }
  if (params.tag) {
    conditions.push("p.tags_text LIKE ?");
    values.push(`%|${params.tag}|%`);
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
    logoUrl: String(row.logo_url || ""),
    details: parseDetails(row.site_details_json || row.details_json),
    generatedAt: String(row.generated_at || ""),
    lastVerifiedAt: String(row.last_verified_at || ""),
    hidden: Number(row.hidden || 0),
    createdAt: String(row.site_created_at || row.created_at || ""),
    updatedAt: String(row.site_updated_at || row.updated_at || ""),
    latestCrawlStatus: String(row.latest_crawl_status || "indexed") as RegistrySite["latestCrawlStatus"],
    latestCrawlMessage: String(row.latest_crawl_message || ""),
    lastCheckedAt: String(row.last_checked_at || row.last_verified_at || ""),
    nextCheckAt: String(row.next_check_at || row.last_verified_at || ""),
    checkIntervalMinutes: Number(row.check_interval_minutes || 60),
    unchangedCheckCount: Number(row.unchanged_check_count || 0),
    failureCount: Number(row.failure_count || 0),
    pendingFingerprint: String(row.pending_fingerprint || ""),
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
    thumbnailUrl: String(row.thumbnail_url || ""),
    details: parseDetails(row.post_details_json || row.details_json),
    publishedAt: String(row.published_at || ""),
    searchText: String(row.search_text || ""),
    visible: Number(row.visible || 0),
    createdAt: String(row.post_created_at || row.created_at || ""),
    updatedAt: String(row.post_updated_at || row.updated_at || ""),
  };
}

function searchRowToItem(row: Row): SearchResultItem {
  if (row.result_type === "shellname") {
    if (row.site_id) {
      const site = rowToSite(row);
      return { type: "shell", site, shell: site, shellName: rowToShellName(row), sortAt: String(row.sort_at || row.updated_at || "") };
    }
    return { type: "shellname", shellName: rowToShellName(row), sortAt: String(row.sort_at || row.updated_at || "") };
  }
  const site = rowToSite(row);
  if (row.result_type === "shell") {
    const shellName = row.shell_name_name ? rowToShellName(row) : undefined;
    return { type: "shell", site, shell: site, shellName, sortAt: String(row.sort_at || site.lastVerifiedAt || site.generatedAt || "") };
  }
  return { type: "content", site, post: rowToPost(row), sortAt: String(row.sort_at || row.published_at || "") };
}

function rowToShellName(row: Row): ShellNameRecord {
  const record = parseDetails(row.shell_name_record_json || row.record_json);
  const hidden = Number(row.shell_name_hidden ?? row.hidden ?? 0);
  const status = hidden ? "hidden" : String(row.shell_name_status || row.status || "active");
  return {
    name: String(row.shell_name_name || row.name || ""),
    fullName: String(row.shell_name_full_name || row.full_name || ""),
    forest: String(row.shell_name_forest || row.forest || ""),
    siteUrl: String(row.shell_name_site_url || row.site_url || ""),
    publicKey: String(row.shell_name_public_key || row.public_key || ""),
    bundleFingerprint: String(row.shell_name_bundle_fingerprint || row.bundle_fingerprint || ""),
    record,
    signature: String(row.shell_name_signature || row.signature || record.signature || ""),
    status: status === "hidden" || status === "expired" ? status : "active",
    hidden,
    expiresAt: String(row.shell_name_expires_at || row.expires_at || ""),
    searchText: String(row.shell_name_search_text || row.search_text || ""),
    createdAt: String(row.shell_name_created_at || row.created_at || ""),
    updatedAt: String(row.shell_name_updated_at || row.updated_at || ""),
  };
}

function mergeSearchItems(items: SearchResultItem[], params: SearchParams): SearchResultItem[] {
  const merged: SearchResultItem[] = [];
  const shellByKey = new Map<string, Extract<SearchResultItem, { type: "shell" }>>();
  const standaloneAliases = new Map<string, Extract<SearchResultItem, { type: "shellname" }>>();

  for (const item of items) {
    if (item.type === "content") {
      merged.push(item);
      continue;
    }
    if (item.type === "shell") {
      const key = shellMergeKey(item);
      const existing = key ? shellByKey.get(key) : undefined;
      const target = existing || item;
      if (item.shellName && !target.shellName) target.shellName = item.shellName;
      if (!existing) {
        merged.push(target);
        if (key) shellByKey.set(key, target);
      }
      if (key && standaloneAliases.has(key)) {
        const alias = standaloneAliases.get(key);
        if (alias && !target.shellName) target.shellName = alias.shellName;
        standaloneAliases.delete(key);
        const index = merged.indexOf(alias as SearchResultItem);
        if (index >= 0) merged.splice(index, 1);
      }
      continue;
    }
    const key = shellNameMergeKey(item.shellName);
    const shell = key ? shellByKey.get(key) : undefined;
    if (shell) {
      if (!shell.shellName) shell.shellName = item.shellName;
      continue;
    }
    merged.push(item);
    if (key) standaloneAliases.set(key, item);
  }

  if (params.scope === "content") return merged.filter((item) => item.type === "content");
  return merged;
}

function shellMergeKey(item: Extract<SearchResultItem, { type: "shell" }>): string {
  return mergeKey(item.shell.publicKey, item.shell.canonicalUrl || item.shell.siteUrl);
}

function shellNameMergeKey(shellName: ShellNameRecord): string {
  return mergeKey(shellName.publicKey, shellName.siteUrl);
}

function mergeKey(publicKey: string, siteUrl: string): string {
  if (publicKey) return `key:${publicKey}`;
  return siteUrl ? `url:${normalizeResultUrl(siteUrl)}` : "";
}

function compareSearchItems(left: SearchResultItem, right: SearchResultItem, params: SearchParams): number {
  const sort = params.sort || "best";
  if (sort === "best") {
    const rank = searchRank(left, params.q) - searchRank(right, params.q);
    if (rank) return rank;
    return compareDesc(sortDate(left, "newest"), sortDate(right, "newest")) || compareAsc(resultLabel(left), resultLabel(right)) || compareAsc(stableItemId(left), stableItemId(right));
  }
  if (sort === "newest") return compareDesc(sortDate(left, "newest"), sortDate(right, "newest")) || compareAsc(resultLabel(left), resultLabel(right));
  if (sort === "oldest") return compareAsc(sortDate(left, "oldest"), sortDate(right, "oldest")) || compareAsc(resultLabel(left), resultLabel(right));
  if (sort === "az") return compareAsc(resultLabel(left), resultLabel(right)) || compareDesc(sortDate(left, "newest"), sortDate(right, "newest"));
  if (sort === "za") return compareDesc(resultLabel(left), resultLabel(right)) || compareDesc(sortDate(left, "newest"), sortDate(right, "newest"));
  return compareDesc(sortDate(left, "verified"), sortDate(right, "verified")) || compareAsc(resultLabel(left), resultLabel(right));
}

function searchRank(item: SearchResultItem, q: string): number {
  if (!q) return 0;
  const fields = rankFields(item).map(normalizeSearchValue).filter(Boolean);
  if (fields.some((field) => field === q)) return 0;
  if (fields.some((field) => field.startsWith(q))) return 1;
  if (fields.some((field) => field.includes(q))) return 2;
  return 3;
}

function rankFields(item: SearchResultItem): string[] {
  if (item.type === "content") {
    return [item.post.title, item.site.handle, item.site.siteTitle, item.site.canonicalUrl, item.site.siteUrl, item.post.searchText];
  }
  if (item.type === "shell") {
    return [
      item.shellName?.name || "",
      item.shellName?.fullName || "",
      item.shell.handle,
      item.shell.siteTitle,
      item.shell.canonicalUrl,
      item.shell.siteUrl,
    ];
  }
  return [item.shellName.name, item.shellName.fullName, item.shellName.siteUrl, item.shellName.searchText];
}

function sortDate(item: SearchResultItem, mode: "newest" | "oldest" | "verified"): string {
  if (item.type === "content") return mode === "verified" ? item.site.lastVerifiedAt || item.site.generatedAt : item.post.publishedAt;
  if (item.type === "shell") {
    if (mode === "verified") return item.shell.lastVerifiedAt || item.shell.generatedAt || item.shellName?.updatedAt || "";
    return maxDate(item.shellName?.updatedAt || "", item.shell.lastVerifiedAt || item.shell.generatedAt || "");
  }
  return item.shellName.updatedAt || item.shellName.createdAt || "";
}

function resultLabel(item: SearchResultItem): string {
  if (item.type === "content") return normalizeSearchValue(item.post.title || item.site.siteTitle || item.post.slug);
  if (item.type === "shell") return normalizeSearchValue(item.shell.siteTitle || item.shell.handle || item.shellName?.fullName || item.shell.canonicalUrl);
  return normalizeSearchValue(item.shellName.fullName || item.shellName.name);
}

function stableItemId(item: SearchResultItem): string {
  if (item.type === "content") return `content:${item.post.id}`;
  if (item.type === "shell") return `shell:${item.shell.id || item.shellName?.name || item.shell.canonicalUrl}`;
  return `shellname:${item.shellName.name}`;
}

function normalizeSearchValue(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function normalizeResultUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    if (!url.pathname) url.pathname = "/";
    return url.toString().replace(/\/$/u, "/");
  } catch {
    return String(value || "").trim().toLowerCase();
  }
}

function maxDate(left: string, right: string): string {
  return left > right ? left : right;
}

function compareAsc(left: string, right: string): number {
  return String(left || "").localeCompare(String(right || ""));
}

function compareDesc(left: string, right: string): number {
  return String(right || "").localeCompare(String(left || ""));
}

function contentOrderBy(sort: SearchParams["sort"]): string {
  if (sort === "oldest") return "p.published_at ASC, p.id ASC";
  if (sort === "az") return "LOWER(p.title) ASC, p.published_at DESC, p.id DESC";
  if (sort === "za") return "LOWER(p.title) DESC, p.published_at DESC, p.id DESC";
  if (sort === "verified") return "COALESCE(s.last_verified_at, s.generated_at) DESC, p.published_at DESC, p.id DESC";
  return "p.published_at DESC, p.id DESC";
}

function shellOrderBy(sort: SearchParams["sort"]): string {
  if (sort === "oldest") return "COALESCE(s.last_verified_at, s.generated_at) ASC, s.id ASC";
  if (sort === "az") return "LOWER(COALESCE(s.site_title, s.handle, s.canonical_url)) ASC, s.id ASC";
  if (sort === "za") return "LOWER(COALESCE(s.site_title, s.handle, s.canonical_url)) DESC, s.id DESC";
  return "COALESCE(s.last_verified_at, s.generated_at) DESC, s.id DESC";
}

function shellNameOrderBy(sort: SearchParams["sort"]): string {
  if (sort === "oldest") return "sn.updated_at ASC, sn.name ASC";
  if (sort === "az") return "LOWER(COALESCE(sn.full_name, sn.name)) ASC, sn.name ASC";
  if (sort === "za") return "LOWER(COALESCE(sn.full_name, sn.name)) DESC, sn.name DESC";
  return "sn.updated_at DESC, sn.name DESC";
}

function parseTags(value: unknown): string[] {
  try {
    const tags = JSON.parse(String(value || "[]"));
    return Array.isArray(tags) ? tags.map(String) : [];
  } catch {
    return [];
  }
}

function parseDetails(value: unknown): Record<string, unknown> {
  try {
    const details = JSON.parse(String(value || "{}"));
    return details && typeof details === "object" && !Array.isArray(details) ? details as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (match) => `\\${match}`);
}

function makeCursorForItem(item: SearchResultItem | undefined, params: SearchParams): string | null {
  if (!item) return null;
  return btoa(JSON.stringify({
    sort: params.sort || "best",
    sortValue: cursorSortValue(item, params.sort || "best"),
    type: item.type,
    id: stableItemId(item),
  })).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function parseCursor(value: string | null): { sort?: string; sortValue?: string; type?: SearchResultItem["type"]; id: string } | null {
  if (!value) return null;
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(padded));
    if (typeof parsed.id === "string") return parsed;
    if (typeof parsed.sortAt === "string" && typeof parsed.id === "string") return { sortValue: parsed.sortAt, id: parsed.id };
    if (typeof parsed.publishedAt === "string" && typeof parsed.id === "string") return { sortValue: parsed.publishedAt, id: parsed.id };
    return null;
  } catch {
    return null;
  }
}

function cursorSortValue(item: SearchResultItem, sort: SearchParams["sort"]): string {
  if (sort === "az" || sort === "za") return resultLabel(item);
  if (sort === "verified") return sortDate(item, "verified");
  if (sort === "oldest") return sortDate(item, "oldest");
  return sortDate(item, "newest");
}

function addMinutes(value: string, minutes: number): string {
  return new Date(Date.parse(value) + minutes * 60 * 1000).toISOString();
}
