import { describe, expect, test } from "vitest";
import { unzipSync } from "../../vendor/fflate/browser.js";
import { decodeText } from "../../src/bytes.js";
import { normalizePost } from "../../src/content.js";
import { canonicalJson } from "../../src/canonical.js";
import { encodeText } from "../../src/bytes.js";
import { generateSigningKeyPair, publicKeyToText, signBytes, signatureToText } from "../../src/crypto.js";
import { buildStaticExport } from "../../src/exporter.js";
import { buildSiteMovePayload, signSiteMoveRecord } from "../../src/siteMoves.js";
import { handleRequest } from "../src/app";
import { processCrawlMessage } from "../src/crawler";
import { processScheduledChecks } from "../src/scheduler";
import type { CrawlMessage, RegistryQueue, RegistryStore, ShellNameRecord, SiteMoveRecord } from "../src/types";

class MemoryQueue implements RegistryQueue {
  messages: CrawlMessage[] = [];
  async send(message: CrawlMessage): Promise<void> {
    this.messages.push(message);
  }
}

class MemoryStore implements RegistryStore {
  submissions = new Map<string, any>();
  sites = new Map<string, any>();
  posts = new Map<string, any[]>();
  hidden = new Set<string>();
  rateCounts = new Map<string, number>();
  pending = new Map<string, string>();
  checked: string[] = [];
  shellNames = new Map<string, ShellNameRecord>();
  hiddenShellNames = new Set<string>();
  siteMoves = new Map<string, SiteMoveRecord>();

  async incrementRateLimit(key: string): Promise<number> {
    const next = (this.rateCounts.get(key) || 0) + 1;
    this.rateCounts.set(key, next);
    return next;
  }

  async findRecentSubmission(siteUrl: string): Promise<{ id: string; status: string } | null> {
    for (const submission of this.submissions.values()) {
      if (submission.siteUrl === siteUrl && ["queued", "crawling", "indexed"].includes(submission.status)) {
        return { id: submission.id, status: submission.status };
      }
    }
    return null;
  }

  async findActiveSubmission(siteUrl: string): Promise<{ id: string; status: string } | null> {
    for (const submission of this.submissions.values()) {
      if (submission.siteUrl === siteUrl && ["queued", "crawling"].includes(submission.status)) {
        return { id: submission.id, status: submission.status };
      }
    }
    return null;
  }

  async createSubmission(submission: any): Promise<void> {
    this.submissions.set(submission.id, submission);
  }

  async getSubmission(id: string): Promise<any | null> {
    return this.submissions.get(id) || null;
  }

  async markSubmissionCrawling(id: string, now: string): Promise<void> {
    const submission = this.submissions.get(id);
    if (submission) Object.assign(submission, { status: "crawling", updatedAt: now });
  }

  async markSubmissionFailed(id: string, message: string, now: string): Promise<void> {
    const submission = this.submissions.get(id);
    if (submission) Object.assign(submission, { status: "failed", message, updatedAt: now });
  }

  async upsertVerifiedSite(site: any, posts: any[], submissionId: string, now: string): Promise<void> {
    this.sites.set(site.id, {
      ...site,
      hidden: this.hidden.has(site.id) ? 1 : 0,
      lastVerifiedAt: now,
      lastCheckedAt: now,
      nextCheckAt: "2026-06-05T01:00:00.000Z",
      checkIntervalMinutes: 60,
      unchangedCheckCount: 0,
      failureCount: 0,
      pendingFingerprint: ""
    });
    this.posts.set(site.id, posts);
    const submission = this.submissions.get(submissionId);
    if (submission) Object.assign(submission, { status: "indexed", siteId: site.id, updatedAt: now });
  }

  async getSiteByCanonicalUrl(siteUrl: string): Promise<any | null> {
    for (const site of this.sites.values()) {
      if (site.canonicalUrl === siteUrl) return site;
    }
    return null;
  }

  async getDueSites(now: string, limit: number): Promise<any[]> {
    return Array.from(this.sites.values())
      .filter((site) => !site.hidden && site.nextCheckAt <= now)
      .slice(0, limit);
  }

  async recordPendingRefresh(siteId: string, fingerprint: string, nextCheckAt: string, now: string): Promise<void> {
    const site = this.sites.get(siteId);
    if (site) Object.assign(site, { pendingFingerprint: fingerprint, nextCheckAt, lastCheckedAt: now });
    this.pending.set(siteId, fingerprint);
  }

  async recordRefreshQueued(siteId: string, fingerprint: string, nextCheckAt: string, now: string): Promise<void> {
    const site = this.sites.get(siteId);
    if (site) Object.assign(site, { pendingFingerprint: fingerprint, nextCheckAt, lastCheckedAt: now, latestCrawlStatus: "queued" });
  }

  async recordRefreshCheck(siteId: string, outcome: { changed: boolean; failed: boolean; fingerprint?: string }, now: string, nextCheckAt: string, intervalMinutes: number): Promise<void> {
    const site = this.sites.get(siteId);
    if (!site) return;
    this.checked.push(siteId);
    Object.assign(site, {
      lastCheckedAt: now,
      nextCheckAt,
      checkIntervalMinutes: intervalMinutes,
      unchangedCheckCount: outcome.changed || outcome.failed ? 0 : (site.unchangedCheckCount || 0) + 1,
      failureCount: outcome.failed ? (site.failureCount || 0) + 1 : 0,
      pendingFingerprint: outcome.changed ? outcome.fingerprint || "" : site.pendingFingerprint || ""
    });
  }

  async getSite(id: string): Promise<any | null> {
    return this.sites.get(id) || null;
  }

  async getPostsForSite(id: string): Promise<any[]> {
    return this.posts.get(id) || [];
  }

  async setSiteHidden(id: string, hidden: boolean): Promise<void> {
    if (hidden) this.hidden.add(id);
    else this.hidden.delete(id);
    const site = this.sites.get(id);
    if (site) site.hidden = hidden ? 1 : 0;
  }

  async search({ q, tag, scope = "content", sort = "best", limit = 20, cursor = null }: { q: string; tag: string; scope?: string; sort?: string; limit?: number; cursor?: string | null }): Promise<{ items: any[]; nextCursor: string | null }> {
    const items = [];
    const now = "2026-06-05T00:00:00.000Z";
    for (const site of this.sites.values()) {
      if (site.hidden) continue;
      const siteText = `${site.siteTitle} ${site.description} ${site.handle} ${site.canonicalUrl} ${site.siteUrl}`.toLowerCase();
      const sitePosts = this.posts.get(site.id) || [];
      const shellName = Array.from(this.shellNames.values()).find((record) => {
        if (record.hidden || record.status !== "active" || record.expiresAt <= now) return false;
        return record.publicKey === site.publicKey;
      });
      const shellNameText = shellName ? `${shellName.name} ${shellName.fullName} ${shellName.siteUrl} ${shellName.searchText}`.toLowerCase() : "";
      const shellMatchesQ = !q || siteText.includes(q) || shellNameText.includes(q);
      const shellMatchesTag = !tag || sitePosts.some((post) => post.tags.includes(tag));
      if ((scope === "all" || scope === "shell") && shellMatchesQ && shellMatchesTag) {
        items.push({ type: "shell", site, shell: site, shellName });
      }
      if (scope === "shell") continue;
      for (const post of this.posts.get(site.id) || []) {
        const matchesQ = !q || post.searchText.includes(q) || siteText.includes(q);
        const matchesTag = !tag || post.tags.includes(tag);
        if (matchesQ && matchesTag) items.push({ type: "content", site, post });
      }
    }
    if (scope === "all" || scope === "shell") {
      for (const shellName of this.shellNames.values()) {
        if (shellName.hidden || shellName.status !== "active" || shellName.expiresAt <= now) continue;
        if (this.shellNameConflictsWithIndexedSite(shellName)) continue;
        const indexedSite = Array.from(this.sites.values()).find((site) => {
          if (site.hidden) return false;
          return shellName.publicKey === site.publicKey;
        });
        if (indexedSite) continue;
        const matchesQ = !q || shellName.searchText.includes(q);
        if (matchesQ && !tag) items.push({ type: "shellname", shellName, sortAt: shellName.updatedAt });
      }
    }
    items.sort((left: any, right: any) => compareTestItems(left, right, sort));
    const start = cursor ? Math.max(items.findIndex((item: any) => testCursorId(item) === cursor) + 1, 0) : 0;
    const page = items.slice(start, start + limit);
    return { items: page, nextCursor: items.length > start + limit ? testCursorId(page.at(-1)) : null };
  }

  async getShellName(name: string): Promise<ShellNameRecord | null> {
    return this.shellNames.get(name) || null;
  }

  async getShellNameByPublicKey(publicKey: string): Promise<ShellNameRecord | null> {
    for (const shellName of this.shellNames.values()) {
      if (shellName.publicKey === publicKey && shellName.status === "active" && !shellName.hidden) return shellName;
    }
    return null;
  }

  async upsertShellName(record: ShellNameRecord): Promise<void> {
    this.shellNames.set(record.name, record);
  }

  async setShellNameHidden(name: string, hidden: boolean, now = "2026-06-05T00:00:00.000Z"): Promise<void> {
    const record = this.shellNames.get(name);
    if (record) Object.assign(record, { hidden: hidden ? 1 : 0, updatedAt: now });
  }

  async searchShellNames(q: string, limit: number, now = "2026-06-05T00:00:00.000Z"): Promise<ShellNameRecord[]> {
    return Array.from(this.shellNames.values())
      .filter((record) => !record.hidden && record.status === "active" && record.expiresAt > now)
      .filter((record) => !this.shellNameConflictsWithIndexedSite(record))
      .filter((record) => !q || record.searchText.includes(q))
      .slice(0, limit);
  }

  async recentShellNames(limit: number, now = "2026-06-05T00:00:00.000Z"): Promise<ShellNameRecord[]> {
    return Array.from(this.shellNames.values())
      .filter((record) => !record.hidden && record.status === "active" && record.expiresAt > now)
      .filter((record) => !this.shellNameConflictsWithIndexedSite(record))
      .slice(-limit)
      .reverse();
  }

  async exportShellNames(now = "2026-06-05T00:00:00.000Z"): Promise<ShellNameRecord[]> {
    return Array.from(this.shellNames.values())
      .filter((record) => !record.hidden && record.status === "active" && record.expiresAt > now)
      .filter((record) => !this.shellNameConflictsWithIndexedSite(record));
  }

  shellNameConflictsWithIndexedSite(shellName: ShellNameRecord): boolean {
    return Array.from(this.sites.values()).some((site) => {
      if (site.hidden) return false;
      if (site.publicKey === shellName.publicKey) return false;
      return normalizeTestUrl(shellName.siteUrl) === normalizeTestUrl(site.canonicalUrl) || normalizeTestUrl(shellName.siteUrl) === normalizeTestUrl(site.siteUrl);
    });
  }

  async getSiteMove(id: string): Promise<SiteMoveRecord | null> {
    return this.siteMoves.get(id) || null;
  }

  async getSiteMoveBySignature(signature: string): Promise<SiteMoveRecord | null> {
    for (const move of this.siteMoves.values()) {
      if (move.signature === signature) return move;
    }
    return null;
  }

  async recordSiteMove(move: SiteMoveRecord, options: { hideOldSite?: boolean; now?: string } = {}): Promise<void> {
    this.siteMoves.set(move.id, move);
    if (options.hideOldSite) {
      const site = this.sites.get(move.fromSiteId);
      if (site) Object.assign(site, {
        hidden: 1,
        latestCrawlStatus: "moved",
        latestCrawlMessage: `Moved to ${move.toUrl}`,
        updatedAt: options.now || move.appliedAt,
      });
      this.hidden.add(move.fromSiteId);
    }
  }
}

function compareTestItems(left: any, right: any, sort: string): number {
  if (sort === "az") return testLabel(left).localeCompare(testLabel(right));
  if (sort === "za") return testLabel(right).localeCompare(testLabel(left));
  if (sort === "oldest") return testDate(left).localeCompare(testDate(right));
  if (sort === "verified") return testVerifiedDate(right).localeCompare(testVerifiedDate(left));
  return testDate(right).localeCompare(testDate(left)) || testLabel(left).localeCompare(testLabel(right));
}

function testLabel(item: any): string {
  if (item.type === "content") return String(item.post.title || "").toLowerCase();
  if (item.type === "shell") return String(item.shell.siteTitle || item.shell.handle || item.shellName?.fullName || "").toLowerCase();
  return String(item.shellName.fullName || item.shellName.name || "").toLowerCase();
}

function testDate(item: any): string {
  if (item.type === "content") return item.post.publishedAt || "";
  if (item.type === "shell") return [item.shellName?.updatedAt || "", item.shell.lastVerifiedAt || item.shell.generatedAt || ""].sort().at(-1) || "";
  return item.shellName.updatedAt || "";
}

function testVerifiedDate(item: any): string {
  if (item.type === "content") return item.site.lastVerifiedAt || item.site.generatedAt || "";
  if (item.type === "shell") return item.shell.lastVerifiedAt || item.shell.generatedAt || "";
  return item.shellName.updatedAt || "";
}

function testCursorId(item: any): string {
  if (!item) return "";
  if (item.type === "content") return `content:${item.post.id}`;
  if (item.type === "shell") return `shell:${item.shell.id}`;
  return `shellname:${item.shellName.name}`;
}

function normalizeTestUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    if (!url.pathname) url.pathname = "/";
    return url.toString();
  } catch {
    return String(value || "").toLowerCase();
  }
}

async function fixtureDocuments(options: { keys?: ReturnType<typeof generateSigningKeyPair>; siteUrl?: string; title?: string; body?: string; generatedAt?: string; withImage?: boolean } = {}) {
  const keys = options.keys || generateSigningKeyPair();
  const siteUrl = options.siteUrl || "https://creator.example";
  const post = normalizePost({
    id: "p1",
    title: options.title || "Searchable Proof",
    body: options.body || "A useful searchable excerpt.",
    tags: ["Proof"],
    status: "published",
    imageIds: options.withImage ? ["image-1"] : [],
    createdAt: "2026-06-05T00:00:00.000Z"
  });
  const assets: any[] = options.withImage ? [{
    id: "image-1",
    name: "Search Thumb.png",
    type: "image/png",
    dataBase64: "iVBORw0KGgo=",
    alt: "Search thumbnail",
    createdAt: "2026-06-05T00:00:00.000Z"
  }] : [];
  const result = await buildStaticExport({
    profile: {
      siteTitle: "Search Feed",
      description: "Findable signed feed.",
      handle: "search-feed",
      siteUrl,
      about: ""
    },
    settings: { showPoweredBy: false },
    posts: [post],
    assets,
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
    generatedAt: options.generatedAt || "2026-06-05T00:00:00.000Z"
  } as any);
  const files = unzipSync(result.zipBytes, {}) as Record<string, Uint8Array>;
  return {
    wellKnown: decodeText(files[".well-known/postsnail.json"]),
    manifest: decodeText(files["postsnail.manifest.json"]),
    announcePayload: result.announcePayload,
    keys,
    bundleFingerprint: result.bundleFingerprint,
    siteUrl: new URL(siteUrl).origin + "/"
  };
}

function mappedFetch(documents: { wellKnown: string; manifest: string; siteUrl?: string } | Array<{ wellKnown: string; manifest: string; siteUrl?: string }>) {
  const list = Array.isArray(documents) ? documents : [documents];
  const byUrl = new Map<string, { wellKnown: string; manifest: string }>();
  for (const docs of list) {
    const origin = new URL(docs.siteUrl || "https://creator.example/").origin;
    byUrl.set(`${origin}/.well-known/postsnail.json`, docs);
    byUrl.set(`${origin}/postsnail.manifest.json`, docs);
  }
  return async (url: string | URL | Request): Promise<Response> => {
    const target = String(url);
    const docs = byUrl.get(target);
    if (docs && target.endsWith("/.well-known/postsnail.json")) {
      return new Response(docs.wellKnown, { headers: { "content-type": "application/json" } });
    }
    if (docs && target.endsWith("/postsnail.manifest.json")) {
      return new Response(docs.manifest, { headers: { "content-type": "application/json" } });
    }
    return new Response("missing", { status: 404 });
  };
}

function signedShellNameRecord(options: {
  name?: string;
  siteUrl?: string;
  publicKey?: string;
  secretKey?: Uint8Array;
  bundleFingerprint?: string;
  createdAt?: string;
} = {}) {
  const keys = options.publicKey && options.secretKey
    ? { publicKey: options.publicKey, secretKey: options.secretKey }
    : (() => {
        const pair = generateSigningKeyPair();
        return { publicKey: publicKeyToText(pair.publicKey), secretKey: pair.secretKey };
      })();
  const name = options.name || "elmirok";
  const payload = {
    protocol: "postsnail-shellname",
    version: 1,
    name,
    forest: "forest.postsnail.org",
    fullName: `@${name}@forest.postsnail.org`,
    siteUrl: options.siteUrl || "https://creator.example/",
    publicKey: keys.publicKey,
    bundleFingerprint: options.bundleFingerprint || "psn1-sha3-512-test",
    createdAt: options.createdAt || "2026-06-05T00:00:00.000Z",
    requiredFeatures: [],
    optionalFeatures: ["forest-tracker"],
    extensions: {},
  };
  return {
    record: {
      ...payload,
      signature: signatureToText(signBytes(encodeText(canonicalJson(payload)), keys.secretKey)),
    },
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
  };
}

async function signedSiteMoveRecord(options: {
  keys: ReturnType<typeof generateSigningKeyPair>;
  fromUrl: string;
  toUrl: string;
  bundleFingerprint: string;
  mode?: "move" | "mirror";
  createdAt?: string;
}) {
  const payload = buildSiteMovePayload({
    mode: options.mode || "move",
    fromUrl: options.fromUrl,
    toUrl: options.toUrl,
    publicKey: publicKeyToText(options.keys.publicKey),
    bundleFingerprint: options.bundleFingerprint,
    createdAt: options.createdAt || "2026-06-05T00:00:00.000Z",
  });
  return signSiteMoveRecord(payload, options.keys.secretKey);
}

describe("registry API and crawl flow", () => {
  test("serves the Forest homepage for GET and HEAD", async () => {
    const store = new MemoryStore();
    const queue = new MemoryQueue();
    const deps = { store, queue, now: () => "2026-06-05T00:00:00.000Z", rateLimitSecret: "test-secret" };

    const get = await handleRequest(new Request("https://registry.example/"), deps);
    expect(get.status).toBe(200);
    expect(get.headers.get("content-type")).toContain("text/html");
    expect(get.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(get.headers.get("content-security-policy")).toContain("style-src 'self'");
    expect(get.headers.get("content-security-policy")).not.toContain("unsafe-inline");
    expect(await get.text()).toContain("PostSnail Forest");

    const head = await handleRequest(new Request("https://registry.example/", { method: "HEAD" }), deps);
    expect(head.status).toBe(200);
    expect(head.headers.get("content-type")).toContain("text/html");
    expect(await head.text()).toBe("");

    const css = await handleRequest(new Request("https://registry.example/forest.css"), deps);
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toContain("text/css");
    expect(await css.text()).toContain(".forest-brand-icon");

    const js = await handleRequest(new Request("https://registry.example/forest.js"), deps);
    expect(js.status).toBe(200);
    expect(js.headers.get("content-type")).toContain("text/javascript");
    expect(await js.text()).toContain("PUBLIC_DETAIL_KEYS");
  });

  test("queues submissions and rejects duplicate active submissions", async () => {
    const store = new MemoryStore();
    const queue = new MemoryQueue();
    const deps = { store, queue, now: () => "2026-06-05T00:00:00.000Z", rateLimitSecret: "test-secret" };

    const first = await handleRequest(
      new Request("https://registry.example/api/submit", {
        method: "POST",
        body: JSON.stringify({ url: "https://creator.example/posts/one" })
      }),
      deps
    );
    expect(first.status).toBe(202);
    const firstJson = await first.json() as any;
    expect(firstJson).toMatchObject({ status: "queued", siteUrl: "https://creator.example/" });
    expect(queue.messages).toHaveLength(1);

    const duplicate = await handleRequest(
      new Request("https://registry.example/api/submit", {
        method: "POST",
        body: JSON.stringify({ url: "https://creator.example/" })
      }),
      deps
    );
    expect(duplicate.status).toBe(409);
  });

  test("returns 400 for invalid submission URLs", async () => {
    const store = new MemoryStore();
    const queue = new MemoryQueue();
    const response = await handleRequest(
      new Request("https://registry.example/api/submit", {
        method: "POST",
        body: JSON.stringify({ url: "http://example.com" })
      }),
      { store, queue, now: () => "2026-06-05T00:00:00.000Z", rateLimitSecret: "test-secret" }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/public https/i) });
  });

  test("rejects overlong search inputs before hitting storage", async () => {
    const store = new MemoryStore();
    const queue = new MemoryQueue();
    const deps = { store, queue, now: () => "2026-06-05T00:00:00.000Z", rateLimitSecret: "test-secret" };

    const overlong = await handleRequest(new Request(`https://registry.example/api/search?q=${"a".repeat(161)}`), deps);

    expect(overlong.status).toBe(400);
    expect(await overlong.json()).toMatchObject({ error: expect.stringMatching(/Search query is too long/i) });
  });

  test("rate-limits repeated submissions by requester hash", async () => {
    const store = new MemoryStore();
    const queue = new MemoryQueue();
    const deps = { store, queue, now: () => "2026-06-05T00:00:00.000Z", rateLimitSecret: "test-secret" };

    for (let index = 0; index < 10; index += 1) {
      const response = await handleRequest(
        new Request("https://registry.example/api/submit", {
          method: "POST",
          headers: { "cf-connecting-ip": "203.0.113.10" },
          body: JSON.stringify({ url: `https://creator-${index}.example/` })
        }),
        deps
      );
      expect(response.status).toBe(202);
    }

    const limited = await handleRequest(
      new Request("https://registry.example/api/submit", {
        method: "POST",
        headers: { "cf-connecting-ip": "203.0.113.10" },
        body: JSON.stringify({ url: "https://creator-10.example/" })
      }),
      deps
    );
    expect(limited.status).toBe(429);
  });

  test("indexes a verified queued submission and returns search results", async () => {
    const documents = await fixtureDocuments();
    const store = new MemoryStore();
    const queue = new MemoryQueue();
    const deps = {
      store,
      queue,
      now: () => "2026-06-05T00:00:00.000Z",
      rateLimitSecret: "test-secret",
      fetcher: mappedFetch(documents)
    };

    const submitted = await handleRequest(
      new Request("https://registry.example/api/submit", {
        method: "POST",
        body: JSON.stringify({ url: "https://creator.example/" })
      }),
      deps
    );
    const body = await submitted.json() as any;
    await processCrawlMessage(queue.messages[0], deps);

    const status = await handleRequest(new Request(`https://registry.example/api/submissions/${body.submissionId}`), deps);
    expect(await status.json()).toMatchObject({ status: "indexed" });

    const search = await handleRequest(new Request("https://registry.example/api/search?q=searchable&tag=proof"), deps);
    expect(search.headers.get("cache-control")).toBe("public, max-age=30, stale-while-revalidate=120");
    const results = await search.json() as any;
    expect(results.items).toHaveLength(1);
    expect(results.items[0].post).toMatchObject({ title: "Searchable Proof", digest: expect.stringMatching(/^[a-f0-9]{128}$/) });
    expect(results.items[0].post.body).toBeUndefined();

    const hostSearch = await handleRequest(new Request("https://registry.example/api/search?q=creator.example"), deps);
    expect(hostSearch.headers.get("cache-control")).toBe("public, max-age=30, stale-while-revalidate=120");
    const hostResults = await hostSearch.json() as any;
    expect(hostResults.items).toHaveLength(1);

    const site = await handleRequest(new Request(`https://registry.example/api/sites/${results.items[0].site.id}`), deps);
    expect(site.headers.get("cache-control")).toBe("public, max-age=60, stale-while-revalidate=300");
  });

  test("public site JSON allowlists details fields", async () => {
    const store = new MemoryStore();
    const queue = new MemoryQueue();
    const now = "2026-06-05T00:00:00.000Z";
    store.sites.set("site_1", {
      id: "site_1",
      canonicalUrl: "https://creator.example/",
      manifestUrl: "https://creator.example/postsnail.manifest.json",
      siteTitle: "Creator",
      handle: "creator",
      description: "Public description",
      siteUrl: "https://creator.example/",
      publicKey: "base64:public",
      bundleFingerprint: "psn1-sha3-512-test",
      logoUrl: "",
      details: {
        manifestUrl: "https://creator.example/postsnail.manifest.json",
        generatedAt: now,
        body: "should not leave D1",
        privatePluginState: "should not leave D1",
        arbitraryFutureField: "should not leave D1",
      },
      generatedAt: now,
      lastVerifiedAt: now,
      hidden: 0,
      latestCrawlStatus: "indexed",
    });

    const response = await handleRequest(new Request("https://registry.example/api/sites/site_1"), {
      store,
      queue,
      now: () => now,
      rateLimitSecret: "test-secret",
    });
    const json = await response.json() as any;

    expect(response.status).toBe(200);
    expect(json.site.details).toEqual({
      manifestUrl: "https://creator.example/postsnail.manifest.json",
      generatedAt: now,
    });
  });

  test("search scopes return content and public Shell results with summary-only rich details", async () => {
    const documents = await fixtureDocuments({ withImage: true, body: "A private-looking public body should not be in Forest details." });
    const store = new MemoryStore();
    const queue = new MemoryQueue();
    const deps = {
      store,
      queue,
      now: () => "2026-06-05T00:00:00.000Z",
      rateLimitSecret: "test-secret",
      fetcher: mappedFetch(documents)
    };
    const submitted = await handleRequest(
      new Request("https://registry.example/api/submit", {
        method: "POST",
        body: JSON.stringify({ url: "https://creator.example/" })
      }),
      deps
    );
    await submitted.json();
    await processCrawlMessage(queue.messages[0], deps);

    const omittedScope = await handleRequest(new Request("https://registry.example/api/search?q=searchable"), deps);
    const omittedResults = await omittedScope.json() as any;
    expect(omittedResults.items).toHaveLength(1);
    expect(omittedResults.items[0]).toMatchObject({ type: "content", post: { title: "Searchable Proof" } });

    const content = await handleRequest(new Request("https://registry.example/api/search?q=searchable&scope=content"), deps);
    const contentResults = await content.json() as any;
    expect(contentResults.items).toHaveLength(1);
    expect(contentResults.items[0]).toMatchObject({
      type: "content",
      post: {
        thumbnailUrl: "https://creator.example/assets/search-thumb.png",
        details: expect.objectContaining({
          imageFiles: ["search-thumb.png"],
          slug: "searchable-proof"
        })
      }
    });
    expect(JSON.stringify(contentResults.items[0].post.details)).not.toContain("private-looking");

    const shell = await handleRequest(new Request("https://registry.example/api/search?q=creator.example&tag=proof&scope=shell"), deps);
    const shellResults = await shell.json() as any;
    expect(shellResults.items).toHaveLength(1);
    expect(shellResults.items[0]).toMatchObject({
      type: "shell",
      shell: {
        title: "Search Feed",
        details: expect.objectContaining({
          manifestUrl: "https://creator.example/postsnail.manifest.json",
          bundleFingerprint: expect.stringMatching(/^psn1-sha3-512-/)
        })
      }
    });

    const all = await handleRequest(new Request("https://registry.example/api/search?q=search-feed&scope=all"), deps);
    const allResults = await all.json() as any;
    expect(allResults.items.map((item: any) => item.type)).toEqual(expect.arrayContaining(["shell", "content"]));
  });

  test("signed site move hides the old indexed domain after the new live proof verifies", async () => {
    const keys = generateSigningKeyPair();
    const oldDocs = await fixtureDocuments({
      keys,
      siteUrl: "https://old.example",
      title: "Old Domain Post",
      body: "Legacy old-domain content.",
    });
    const newDocs = await fixtureDocuments({
      keys,
      siteUrl: "https://new.example",
      title: "New Domain Post",
      body: "Fresh new-domain content.",
      generatedAt: "2026-06-05T00:10:00.000Z",
    });
    const store = new MemoryStore();
    const queue = new MemoryQueue();
    const deps = {
      store,
      queue,
      now: () => "2026-06-05T00:20:00.000Z",
      rateLimitSecret: "test-secret",
      fetcher: mappedFetch([oldDocs, newDocs])
    };

    await handleRequest(new Request("https://registry.example/api/submit", {
      method: "POST",
      body: JSON.stringify({ url: "https://old.example/" })
    }), deps);
    await processCrawlMessage(queue.messages.shift()!, deps);
    await handleRequest(new Request("https://registry.example/api/submit", {
      method: "POST",
      body: JSON.stringify({ url: "https://new.example/" })
    }), deps);
    await processCrawlMessage(queue.messages.shift()!, deps);

    const oldSite = await store.getSiteByCanonicalUrl("https://old.example/");
    expect(oldSite?.hidden).toBe(0);
    const moveRecord = await signedSiteMoveRecord({
      keys,
      fromUrl: "https://old.example/",
      toUrl: "https://new.example/",
      bundleFingerprint: newDocs.bundleFingerprint,
      mode: "move",
    });

    const moved = await handleRequest(new Request("https://registry.example/api/site-moves", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(moveRecord),
    }), deps);
    expect(moved.status).toBe(202);
    const movedJson = await moved.json() as any;
    expect(movedJson).toMatchObject({ status: "moved", fromUrl: "https://old.example/", toUrl: "https://new.example/" });
    expect((await store.getSiteByCanonicalUrl("https://old.example/"))?.hidden).toBe(1);
    expect((await store.getSiteByCanonicalUrl("https://old.example/"))?.latestCrawlStatus).toBe("moved");

    const oldSearch = await handleRequest(new Request("https://registry.example/api/search?q=old%20domain&scope=all"), deps);
    expect((await oldSearch.json() as any).items).toHaveLength(0);
    const newSearch = await handleRequest(new Request("https://registry.example/api/search?q=new%20domain&scope=all"), deps);
    expect((await newSearch.json() as any).items.length).toBeGreaterThan(0);

    const audit = await handleRequest(new Request(`https://registry.example/api/site-moves/${movedJson.moveId}.json`), deps);
    expect(audit.status).toBe(200);
    const auditJson = await audit.json() as any;
    expect(auditJson.siteMove).toMatchObject({
      id: movedJson.moveId,
      status: "moved",
      fromUrl: "https://old.example/",
      toUrl: "https://new.example/",
      publicKey: publicKeyToText(keys.publicKey),
    });
    expect(JSON.stringify(auditJson)).not.toMatch(/secretKey|privateKey/i);

    const duplicate = await handleRequest(new Request("https://registry.example/api/site-moves", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(moveRecord),
    }), deps);
    expect(duplicate.status).toBe(202);
    expect(await duplicate.json()).toMatchObject({ moveId: movedJson.moveId, status: "moved" });

    for (let index = 0; index < 8; index += 1) {
      const retry = await handleRequest(new Request("https://registry.example/api/site-moves", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(moveRecord),
      }), deps);
      expect(retry.status).toBe(202);
      expect(await retry.json()).toMatchObject({ moveId: movedJson.moveId, status: "moved" });
    }
  });

  test("signed site mirror keeps both domains searchable", async () => {
    const keys = generateSigningKeyPair();
    const oldDocs = await fixtureDocuments({ keys, siteUrl: "https://mirror-old.example", title: "Mirror Old Post", body: "Mirror old." });
    const newDocs = await fixtureDocuments({ keys, siteUrl: "https://mirror-new.example", title: "Mirror New Post", body: "Mirror new.", generatedAt: "2026-06-05T00:10:00.000Z" });
    const store = new MemoryStore();
    const queue = new MemoryQueue();
    const deps = {
      store,
      queue,
      now: () => "2026-06-05T00:20:00.000Z",
      rateLimitSecret: "test-secret",
      fetcher: mappedFetch([oldDocs, newDocs])
    };

    await handleRequest(new Request("https://registry.example/api/submit", { method: "POST", body: JSON.stringify({ url: "https://mirror-old.example/" }) }), deps);
    await processCrawlMessage(queue.messages.shift()!, deps);
    await handleRequest(new Request("https://registry.example/api/submit", { method: "POST", body: JSON.stringify({ url: "https://mirror-new.example/" }) }), deps);
    await processCrawlMessage(queue.messages.shift()!, deps);

    const mirrorRecord = await signedSiteMoveRecord({
      keys,
      fromUrl: "https://mirror-old.example/",
      toUrl: "https://mirror-new.example/",
      bundleFingerprint: newDocs.bundleFingerprint,
      mode: "mirror",
    });
    const response = await handleRequest(new Request("https://registry.example/api/site-moves", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(mirrorRecord),
    }), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "mirror" });
    expect((await store.getSiteByCanonicalUrl("https://mirror-old.example/"))?.hidden).toBe(0);

    const oldSearch = await handleRequest(new Request("https://registry.example/api/search?q=mirror-old&scope=all"), deps);
    expect((await oldSearch.json() as any).items.length).toBeGreaterThan(0);
    const newSearch = await handleRequest(new Request("https://registry.example/api/search?q=mirror-new&scope=all"), deps);
    expect((await newSearch.json() as any).items.length).toBeGreaterThan(0);
  });

  test("site move rejects wrong keys, wrong fingerprints, and missing old domains", async () => {
    const oldKeys = generateSigningKeyPair();
    const newKeys = generateSigningKeyPair();
    const oldDocs = await fixtureDocuments({ keys: oldKeys, siteUrl: "https://wrong-old.example", title: "Wrong Old" });
    const newDocs = await fixtureDocuments({ keys: newKeys, siteUrl: "https://wrong-new.example", title: "Wrong New" });
    const store = new MemoryStore();
    const queue = new MemoryQueue();
    const deps = {
      store,
      queue,
      now: () => "2026-06-05T00:20:00.000Z",
      rateLimitSecret: "test-secret",
      fetcher: mappedFetch([oldDocs, newDocs])
    };

    await handleRequest(new Request("https://registry.example/api/submit", { method: "POST", body: JSON.stringify({ url: "https://wrong-old.example/" }) }), deps);
    await processCrawlMessage(queue.messages.shift()!, deps);

    const wrongKeyRecord = await signedSiteMoveRecord({
      keys: oldKeys,
      fromUrl: "https://wrong-old.example/",
      toUrl: "https://wrong-new.example/",
      bundleFingerprint: newDocs.bundleFingerprint,
      mode: "move",
    });
    const wrongKey = await handleRequest(new Request("https://registry.example/api/site-moves", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(wrongKeyRecord),
    }), deps);
    expect(wrongKey.status).toBe(401);

    const missingOldRecord = await signedSiteMoveRecord({
      keys: newKeys,
      fromUrl: "https://missing-old.example/",
      toUrl: "https://wrong-new.example/",
      bundleFingerprint: newDocs.bundleFingerprint,
      mode: "move",
    });
    const missingOld = await handleRequest(new Request("https://registry.example/api/site-moves", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(missingOldRecord),
    }), deps);
    expect(missingOld.status).toBe(404);

    const badFingerprintRecord = await signedSiteMoveRecord({
      keys: oldKeys,
      fromUrl: "https://wrong-old.example/",
      toUrl: "https://wrong-new.example/",
      bundleFingerprint: `psn1-sha3-512-${"0".repeat(128)}`,
      mode: "move",
    });
    const badFingerprint = await handleRequest(new Request("https://registry.example/api/site-moves", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(badFingerprintRecord),
    }), deps);
    expect(badFingerprint.status).toBe(401);
  });

  test("search merges a ShellName alias into the matching indexed Shell result", async () => {
    const documents = await fixtureDocuments();
    const store = new MemoryStore();
    const queue = new MemoryQueue();
    const deps = {
      store,
      queue,
      now: () => "2026-06-05T00:00:00.000Z",
      rateLimitSecret: "test-secret",
      fetcher: mappedFetch(documents)
    };

    const submitted = await handleRequest(
      new Request("https://registry.example/api/submit", {
        method: "POST",
        body: JSON.stringify({ url: "https://creator.example/" })
      }),
      deps
    );
    await submitted.json();
    await processCrawlMessage(queue.messages[0], deps);

    const shellName = signedShellNameRecord({
      publicKey: publicKeyToText(documents.keys.publicKey),
      secretKey: documents.keys.secretKey,
      bundleFingerprint: documents.announcePayload.bundleFingerprint,
    });
    const registered = await handleRequest(
      new Request("https://forest.postsnail.org/shellnames/register", {
        method: "POST",
        body: JSON.stringify({ name: "elmirok", record: shellName.record }),
      }),
      deps,
    );
    expect(registered.status).toBe(201);

    const search = await handleRequest(new Request("https://forest.postsnail.org/api/search?q=elmirok&scope=shell"), deps);
    const json = await search.json() as any;
    expect(json.items).toHaveLength(1);
    expect(json.items[0]).toMatchObject({
      type: "shell",
      shell: { title: "Search Feed" },
      shellName: {
        name: "elmirok",
        fullName: "@elmirok@forest.postsnail.org",
      },
    });
  });

  test("search supports validated sort modes for content results", async () => {
    const store = new MemoryStore();
    const queue = new MemoryQueue();
    const deps = { store, queue, now: () => "2026-06-05T00:00:00.000Z", rateLimitSecret: "test-secret" };
    const site = {
      id: "site_sort",
      canonicalUrl: "https://sort.example/",
      manifestUrl: "https://sort.example/postsnail.manifest.json",
      siteTitle: "Sort Shell",
      handle: "sort-shell",
      description: "Sorting proof shell",
      siteUrl: "https://sort.example/",
      publicKey: "base64:sort-public",
      bundleFingerprint: "psn1-sha3-512-sort",
      logoUrl: "",
      details: {},
      generatedAt: "2026-06-01T00:00:00.000Z",
      lastVerifiedAt: "2026-06-06T00:00:00.000Z",
      hidden: 0,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-06T00:00:00.000Z",
      latestCrawlStatus: "indexed",
      latestCrawlMessage: "",
      lastCheckedAt: "2026-06-06T00:00:00.000Z",
      nextCheckAt: "2026-06-06T01:00:00.000Z",
      checkIntervalMinutes: 60,
      unchangedCheckCount: 0,
      failureCount: 0,
      pendingFingerprint: "",
    };
    store.sites.set(site.id, site);
    store.posts.set(site.id, [
      {
        id: "post_zeta",
        siteId: site.id,
        slug: "zeta",
        title: "Zeta Proof",
        url: "https://sort.example/posts/zeta/",
        excerpt: "Newest proof",
        tags: ["proof"],
        digest: "digest-zeta",
        thumbnailUrl: "",
        details: {},
        publishedAt: "2026-06-05T00:00:00.000Z",
        searchText: "zeta proof newest",
        visible: 1,
        createdAt: "2026-06-05T00:00:00.000Z",
        updatedAt: "2026-06-05T00:00:00.000Z",
      },
      {
        id: "post_alpha",
        siteId: site.id,
        slug: "alpha",
        title: "Alpha Proof",
        url: "https://sort.example/posts/alpha/",
        excerpt: "Oldest proof",
        tags: ["proof"],
        digest: "digest-alpha",
        thumbnailUrl: "",
        details: {},
        publishedAt: "2026-06-04T00:00:00.000Z",
        searchText: "alpha proof oldest",
        visible: 1,
        createdAt: "2026-06-04T00:00:00.000Z",
        updatedAt: "2026-06-04T00:00:00.000Z",
      },
    ]);

    const az = await handleRequest(new Request("https://forest.postsnail.org/api/search?q=proof&scope=content&sort=az"), deps);
    expect(az.status).toBe(200);
    expect(((await az.json()) as any).items.map((item: any) => item.post.title)).toEqual(["Alpha Proof", "Zeta Proof"]);

    const oldest = await handleRequest(new Request("https://forest.postsnail.org/api/search?q=proof&scope=content&sort=oldest"), deps);
    expect(((await oldest.json()) as any).items.map((item: any) => item.post.title)).toEqual(["Alpha Proof", "Zeta Proof"]);

    const firstPage = await handleRequest(new Request("https://forest.postsnail.org/api/search?q=proof&scope=content&sort=az&limit=1"), deps);
    const firstPageJson = await firstPage.json() as any;
    expect(firstPageJson.items.map((item: any) => item.post.title)).toEqual(["Alpha Proof"]);
    expect(firstPageJson.nextCursor).toEqual(expect.any(String));

    const secondPage = await handleRequest(new Request(`https://forest.postsnail.org/api/search?q=proof&scope=content&sort=az&limit=1&cursor=${encodeURIComponent(firstPageJson.nextCursor)}`), deps);
    expect(((await secondPage.json()) as any).items.map((item: any) => item.post.title)).toEqual(["Zeta Proof"]);

    const invalid = await handleRequest(new Request("https://forest.postsnail.org/api/search?q=proof&scope=content&sort=random"), deps);
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: "Unsupported search sort." });
  });

  test("ShellNames registration, resolution, search, export, update, and renewal use signed records", async () => {
    const documents = await fixtureDocuments({ siteUrl: "https://creator.example/" });
    const store = new MemoryStore();
    const queue = new MemoryQueue();
    const deps = { store, queue, now: () => "2026-06-05T00:00:00.000Z", rateLimitSecret: "test-secret", fetcher: mappedFetch(documents) };
    const signed = signedShellNameRecord({
      publicKey: publicKeyToText(documents.keys.publicKey),
      secretKey: documents.keys.secretKey,
      bundleFingerprint: documents.bundleFingerprint,
    });

    const registered = await handleRequest(
      new Request("https://forest.postsnail.org/shellnames/register", {
        method: "POST",
        body: JSON.stringify({ name: "Elmirok", record: signed.record }),
      }),
      deps,
    );
    expect(registered.status).toBe(201);
    expect(await registered.json()).toMatchObject({
      name: "elmirok",
      fullName: "@elmirok@forest.postsnail.org",
      status: "active",
      siteUrl: "https://creator.example/",
    });

    const resolved = await handleRequest(new Request("https://forest.postsnail.org/shellnames/elmirok.json"), deps);
    expect(resolved.status).toBe(200);
    expect(await resolved.json()).toMatchObject({
      shellName: {
        name: "elmirok",
        fullName: "@elmirok@forest.postsnail.org",
        publicKey: signed.publicKey,
        status: "active",
      },
    });

    const profile = await handleRequest(new Request("https://forest.postsnail.org/@elmirok"), deps);
    expect(profile.status).toBe(200);
    expect(await profile.text()).toContain("@elmirok@forest.postsnail.org");

    const slashAlias = await handleRequest(new Request("https://forest.postsnail.org/@/elmirok.json"), deps);
    expect(slashAlias.status).toBe(200);
    expect(await slashAlias.json()).toMatchObject({ shellName: { name: "elmirok" } });

    const search = await handleRequest(new Request("https://forest.postsnail.org/api/search?q=elmirok&scope=shell"), deps);
    const searchJson = await search.json() as any;
    expect(searchJson.items).toHaveLength(1);
    expect(searchJson.items[0]).toMatchObject({ type: "shellname", shellName: { name: "elmirok" } });

    const shellNameSearch = await handleRequest(new Request("https://forest.postsnail.org/shellnames/search?q=elmi"), deps);
    expect((await shellNameSearch.json() as any).items[0]).toMatchObject({ name: "elmirok" });

    const recent = await handleRequest(new Request("https://forest.postsnail.org/shellnames/recent.json"), deps);
    expect((await recent.json() as any).items[0]).toMatchObject({ name: "elmirok" });

    const exported = await handleRequest(new Request("https://forest.postsnail.org/shellnames/export.json"), deps);
    expect((await exported.json() as any).shellNames[0]).toMatchObject({ name: "elmirok" });

    const duplicate = await handleRequest(
      new Request("https://forest.postsnail.org/shellnames/register", {
        method: "POST",
        body: JSON.stringify({ name: "elmirok", record: signed.record }),
      }),
      deps,
    );
    expect(duplicate.status).toBe(409);

    const updatedDocuments = await fixtureDocuments({
      keys: documents.keys,
      siteUrl: "https://new-creator.example/",
      generatedAt: "2026-06-05T01:00:00.000Z",
    });
    deps.fetcher = mappedFetch([documents, updatedDocuments]);
    const updated = signedShellNameRecord({
      name: "elmirok",
      publicKey: signed.publicKey,
      secretKey: signed.secretKey,
      siteUrl: "https://new-creator.example/",
      bundleFingerprint: updatedDocuments.bundleFingerprint,
      createdAt: "2026-06-05T01:00:00.000Z",
    });
    const update = await handleRequest(
      new Request("https://forest.postsnail.org/shellnames/update", {
        method: "POST",
        body: JSON.stringify({ name: "elmirok", record: updated.record }),
      }),
      deps,
    );
    expect(update.status).toBe(200);
    expect(await update.json()).toMatchObject({ siteUrl: "https://new-creator.example/" });

    const updatedProfile = await handleRequest(new Request("https://forest.postsnail.org/@elmirok"), deps);
    expect(updatedProfile.status).toBe(200);
    const updatedProfileHtml = await updatedProfile.text();
    expect(updatedProfileHtml).toContain("https://new-creator.example/");
    expect(updatedProfileHtml).not.toContain("https://creator.example/");

    const renewed = await handleRequest(
      new Request("https://forest.postsnail.org/shellnames/renew", {
        method: "POST",
        body: JSON.stringify({ name: "elmirok", record: updated.record }),
      }),
      deps,
    );
    expect(renewed.status).toBe(200);
    expect((await renewed.json() as any).expiresAt).toMatch(/^2027-/);
  });

  test("ShellName registration cannot attach an attacker alias to a victim indexed site", async () => {
    const victimDocuments = await fixtureDocuments({
      siteUrl: "https://victim.example/",
      title: "Victim Signed Shell",
      body: "Victim searchable content.",
    });
    const store = new MemoryStore();
    const queue = new MemoryQueue();
    const deps = {
      store,
      queue,
      now: () => "2026-06-05T00:00:00.000Z",
      rateLimitSecret: "test-secret",
      fetcher: mappedFetch(victimDocuments),
    };

    const submitted = await handleRequest(
      new Request("https://forest.postsnail.org/api/submit", {
        method: "POST",
        body: JSON.stringify({ url: "https://victim.example/" }),
      }),
      deps,
    );
    expect(submitted.status).toBe(202);
    await processCrawlMessage(queue.messages.shift()!, deps);

    const attacker = signedShellNameRecord({
      name: "victim-alias",
      siteUrl: "https://victim.example/",
      bundleFingerprint: victimDocuments.bundleFingerprint,
    });
    const hijack = await handleRequest(
      new Request("https://forest.postsnail.org/shellnames/register", {
        method: "POST",
        body: JSON.stringify({ name: "victim-alias", record: attacker.record }),
      }),
      deps,
    );
    expect(hijack.status).toBe(401);
    expect(await hijack.json()).toMatchObject({ error: "ShellName public key does not match the live site proof." });

    const search = await handleRequest(new Request("https://forest.postsnail.org/api/search?q=victim&scope=shell"), deps);
    const searchJson = await search.json() as any;
    expect(searchJson.items).toHaveLength(1);
    expect(searchJson.items[0].shellName).toBeUndefined();
  });

  test("ShellNames rejects invalid, reserved, tampered, wrong-owner, and rate-limited records", async () => {
    const documents = await fixtureDocuments({ siteUrl: "https://creator.example/" });
    const store = new MemoryStore();
    const queue = new MemoryQueue();
    const deps = { store, queue, now: () => "2026-06-05T00:00:00.000Z", rateLimitSecret: "test-secret", fetcher: mappedFetch(documents) };
    const signed = signedShellNameRecord({
      name: "elmirok",
      publicKey: publicKeyToText(documents.keys.publicKey),
      secretKey: documents.keys.secretKey,
      bundleFingerprint: documents.bundleFingerprint,
    });

    const invalid = await handleRequest(
      new Request("https://forest.postsnail.org/shellnames/register", {
        method: "POST",
        body: JSON.stringify({ name: "bo", record: signed.record }),
      }),
      deps,
    );
    expect(invalid.status).toBe(400);

    const reserved = await handleRequest(
      new Request("https://forest.postsnail.org/shellnames/register", {
        method: "POST",
        body: JSON.stringify({ name: "admin", record: signedShellNameRecord({ name: "admin" }).record }),
      }),
      deps,
    );
    expect(reserved.status).toBe(400);

    const tamperedRecord = { ...signed.record, siteUrl: "https://evil.example/" };
    const tampered = await handleRequest(
      new Request("https://forest.postsnail.org/shellnames/register", {
        method: "POST",
        body: JSON.stringify({ name: "elmirok", record: tamperedRecord }),
      }),
      deps,
    );
    expect(tampered.status).toBe(401);

    const registered = await handleRequest(
      new Request("https://forest.postsnail.org/shellnames/register", {
        method: "POST",
        body: JSON.stringify({ name: "elmirok", record: signed.record }),
      }),
      deps,
    );
    expect(registered.status).toBe(201);

    const otherOwner = signedShellNameRecord({ name: "elmirok" });
    const wrongOwner = await handleRequest(
      new Request("https://forest.postsnail.org/shellnames/update", {
        method: "POST",
        body: JSON.stringify({ name: "elmirok", record: otherOwner.record }),
      }),
      deps,
    );
    expect(wrongOwner.status).toBe(401);

    for (let index = 0; index < 6; index += 1) {
      const response = await handleRequest(
        new Request("https://forest.postsnail.org/shellnames/register", {
          method: "POST",
          headers: { "cf-connecting-ip": "203.0.113.40" },
          body: JSON.stringify({ name: `name${index}`, record: signedShellNameRecord({ name: `name${index}` }).record }),
        }),
        deps,
      );
      expect([401, 409]).toContain(response.status);
    }
    const limited = await handleRequest(
      new Request("https://forest.postsnail.org/shellnames/register", {
        method: "POST",
        headers: { "cf-connecting-ip": "203.0.113.40" },
        body: JSON.stringify({ name: "name99", record: signedShellNameRecord({ name: "name99" }).record }),
      }),
      deps,
    );
    expect(limited.status).toBe(429);
  });

  test("ShellNames admin moderation hides and unhides names from search", async () => {
    const documents = await fixtureDocuments({ siteUrl: "https://creator.example/" });
    const store = new MemoryStore();
    const queue = new MemoryQueue();
    const deps = { store, queue, adminToken: "top-secret", now: () => "2026-06-05T00:00:00.000Z", rateLimitSecret: "test-secret", fetcher: mappedFetch(documents) };
    const signed = signedShellNameRecord({
      name: "elmirok",
      publicKey: publicKeyToText(documents.keys.publicKey),
      secretKey: documents.keys.secretKey,
      bundleFingerprint: documents.bundleFingerprint,
    });
    await handleRequest(
      new Request("https://forest.postsnail.org/shellnames/register", {
        method: "POST",
        body: JSON.stringify({ name: "elmirok", record: signed.record }),
      }),
      deps,
    );

    const rejected = await handleRequest(new Request("https://forest.postsnail.org/api/admin/shellnames/elmirok/hide", { method: "POST" }), deps);
    expect(rejected.status).toBe(401);

    const hidden = await handleRequest(
      new Request("https://forest.postsnail.org/api/admin/shellnames/elmirok/hide", {
        method: "POST",
        headers: { authorization: "Bearer top-secret" },
      }),
      deps,
    );
    expect(hidden.status).toBe(200);
    expect((await handleRequest(new Request("https://forest.postsnail.org/api/search?q=elmirok&scope=shell"), deps).then((r) => r.json()) as any).items).toHaveLength(0);

    const hiddenResolve = await handleRequest(new Request("https://forest.postsnail.org/shellnames/elmirok.json"), deps);
    expect(await hiddenResolve.json()).toMatchObject({ shellName: { status: "hidden" } });

    const unhidden = await handleRequest(
      new Request("https://forest.postsnail.org/api/admin/shellnames/elmirok/unhide", {
        method: "POST",
        headers: { authorization: "Bearer top-secret" },
      }),
      deps,
    );
    expect(unhidden.status).toBe(200);
    expect((await handleRequest(new Request("https://forest.postsnail.org/api/search?q=elmirok&scope=shell"), deps).then((r) => r.json()) as any).items).toHaveLength(1);
  });

  test("failed crawls store safe failure state and do not create search results", async () => {
    const documents = await fixtureDocuments();
    const tampered = JSON.parse(documents.manifest);
    tampered.posts[0].record.title = "Changed after signing";
    const store = new MemoryStore();
    const queue = new MemoryQueue();
    const deps = {
      store,
      queue,
      now: () => "2026-06-05T00:00:00.000Z",
      rateLimitSecret: "test-secret",
      fetcher: mappedFetch({ ...documents, manifest: JSON.stringify(tampered) })
    };

    const submitted = await handleRequest(
      new Request("https://registry.example/api/submit", {
        method: "POST",
        body: JSON.stringify({ url: "https://creator.example/" })
      }),
      deps
    );
    const body = await submitted.json() as any;
    await processCrawlMessage(queue.messages[0], deps);

    const status = await handleRequest(new Request(`https://registry.example/api/submissions/${body.submissionId}`), deps);
    expect(await status.json()).toMatchObject({ status: "failed", message: "Proof verification failed." });
    const search = await handleRequest(new Request("https://registry.example/api/search?q=changed"), deps);
    expect((await search.json() as any).items).toHaveLength(0);
  });

  test("admin endpoints require a bearer token and hidden sites disappear from search", async () => {
    const documents = await fixtureDocuments();
    const store = new MemoryStore();
    const queue = new MemoryQueue();
    const deps = {
      store,
      queue,
      adminToken: "top-secret",
      now: () => "2026-06-05T00:00:00.000Z",
      rateLimitSecret: "test-secret",
      fetcher: mappedFetch(documents)
    };
    const submitted = await handleRequest(
      new Request("https://registry.example/api/submit", {
        method: "POST",
        body: JSON.stringify({ url: "https://creator.example/" })
      }),
      deps
    );
    const body = await submitted.json() as any;
    await processCrawlMessage(queue.messages[0], deps);
    const siteId = (await store.getSubmission(body.submissionId))?.siteId;

    const rejected = await handleRequest(new Request(`https://registry.example/api/admin/sites/${siteId}/hide`, { method: "POST" }), deps);
    expect(rejected.status).toBe(401);

    const hidden = await handleRequest(
      new Request(`https://registry.example/api/admin/sites/${siteId}/hide`, {
        method: "POST",
        headers: { authorization: "Bearer top-secret" }
      }),
      deps
    );
    expect(hidden.status).toBe(200);

    const search = await handleRequest(new Request("https://registry.example/api/search?q=searchable"), deps);
    expect((await search.json() as any).items).toHaveLength(0);
  });

  test("signed announce queues a changed registered site and rejects duplicate active refreshes", async () => {
    const original = await fixtureDocuments();
    const updated = await fixtureDocuments({
      keys: original.keys,
      title: "Fresh Announced Proof",
      body: "A useful searchable excerpt with fresh words.",
      generatedAt: "2026-06-05T01:00:00.000Z"
    });
    const store = new MemoryStore();
    const queue = new MemoryQueue();
    const deps = {
      store,
      queue,
      now: () => "2026-06-05T00:00:00.000Z",
      rateLimitSecret: "test-secret",
      fetcher: mappedFetch(original)
    };

    const submitted = await handleRequest(
      new Request("https://registry.example/api/submit", {
        method: "POST",
        body: JSON.stringify({ url: "https://creator.example/" })
      }),
      deps
    );
    await submitted.json();
    await processCrawlMessage(queue.messages.shift()!, deps);
    deps.fetcher = mappedFetch(updated);

    const announced = await handleRequest(
      new Request("https://registry.example/api/announce", {
        method: "POST",
        headers: { "cf-connecting-ip": "203.0.113.20" },
        body: JSON.stringify(updated.announcePayload)
      }),
      deps
    );
    expect(announced.status).toBe(202);
    expect(await announced.json()).toMatchObject({ status: "queued", siteUrl: "https://creator.example/" });
    expect(queue.messages).toHaveLength(1);

    const duplicate = await handleRequest(
      new Request("https://registry.example/api/announce", {
        method: "POST",
        headers: { "cf-connecting-ip": "203.0.113.20" },
        body: JSON.stringify(updated.announcePayload)
      }),
      deps
    );
    expect(duplicate.status).toBe(409);

    await processCrawlMessage(queue.messages.shift()!, deps);
    const search = await handleRequest(new Request("https://registry.example/api/search?q=fresh"), deps);
    expect((await search.json() as any).items[0].post.title).toBe("Fresh Announced Proof");
  });

  test("signed announce returns current or pending_live_site without full duplicate crawl", async () => {
    const documents = await fixtureDocuments();
    const pending = await fixtureDocuments({
      keys: documents.keys,
      title: "Pending Proof",
      generatedAt: "2026-06-05T01:00:00.000Z"
    });
    const store = new MemoryStore();
    const queue = new MemoryQueue();
    const deps = {
      store,
      queue,
      now: () => "2026-06-05T00:00:00.000Z",
      rateLimitSecret: "test-secret",
      fetcher: mappedFetch(documents)
    };

    const submitted = await handleRequest(
      new Request("https://registry.example/api/submit", {
        method: "POST",
        body: JSON.stringify({ url: "https://creator.example/" })
      }),
      deps
    );
    await submitted.json();
    await processCrawlMessage(queue.messages.shift()!, deps);

    const current = await handleRequest(
      new Request("https://registry.example/api/announce", {
        method: "POST",
        body: JSON.stringify(documents.announcePayload)
      }),
      deps
    );
    expect(current.status).toBe(200);
    expect(await current.json()).toMatchObject({ status: "current", bundleFingerprint: documents.announcePayload.bundleFingerprint });
    expect(queue.messages).toHaveLength(0);

    const beforeLive = await handleRequest(
      new Request("https://registry.example/api/announce", {
        method: "POST",
        body: JSON.stringify(pending.announcePayload)
      }),
      deps
    );
    expect(beforeLive.status).toBe(202);
    expect(await beforeLive.json()).toMatchObject({ status: "pending_live_site", bundleFingerprint: pending.announcePayload.bundleFingerprint });
    expect(queue.messages).toHaveLength(0);
    const site = Array.from(store.sites.values())[0];
    expect(site.pendingFingerprint).toBe(pending.announcePayload.bundleFingerprint);
  });

  test("announce rejects bad signatures and mismatched registered public keys", async () => {
    const documents = await fixtureDocuments();
    const wrong = await fixtureDocuments({ title: "Wrong Key Proof" });
    const store = new MemoryStore();
    const queue = new MemoryQueue();
    const deps = {
      store,
      queue,
      now: () => "2026-06-05T00:00:00.000Z",
      rateLimitSecret: "test-secret",
      fetcher: mappedFetch(documents)
    };
    const submitted = await handleRequest(
      new Request("https://registry.example/api/submit", {
        method: "POST",
        body: JSON.stringify({ url: "https://creator.example/" })
      }),
      deps
    );
    await submitted.json();
    await processCrawlMessage(queue.messages.shift()!, deps);

    const tampered = { ...documents.announcePayload, bundleFingerprint: "psn1-sha3-512-tampered" };
    const badSignature = await handleRequest(
      new Request("https://registry.example/api/announce", { method: "POST", body: JSON.stringify(tampered) }),
      deps
    );
    expect(badSignature.status).toBe(400);

    const wrongKey = await handleRequest(
      new Request("https://registry.example/api/announce", { method: "POST", body: JSON.stringify(wrong.announcePayload) }),
      deps
    );
    expect(wrongKey.status).toBe(401);
  });

  test("scheduled checks fetch only well-known for unchanged sites and queue changed fingerprints", async () => {
    const original = await fixtureDocuments();
    const updated = await fixtureDocuments({
      keys: original.keys,
      title: "Scheduled Fresh Proof",
      generatedAt: "2026-06-05T01:00:00.000Z"
    });
    const store = new MemoryStore();
    const queue = new MemoryQueue();
    const fetches: string[] = [];
    const deps = {
      store,
      queue,
      now: () => "2026-06-05T00:00:00.000Z",
      rateLimitSecret: "test-secret",
      fetcher: async (url: string | URL | Request) => {
        fetches.push(String(url));
        return mappedFetch(original)(url);
      }
    };

    const submitted = await handleRequest(
      new Request("https://registry.example/api/submit", {
        method: "POST",
        body: JSON.stringify({ url: "https://creator.example/" })
      }),
      deps
    );
    await submitted.json();
    await processCrawlMessage(queue.messages.shift()!, deps);
    fetches.length = 0;
    const site = Array.from(store.sites.values())[0];
    site.nextCheckAt = "2026-06-05T00:00:00.000Z";

    await processScheduledChecks(deps, { limit: 5 });
    expect(fetches).toEqual(["https://creator.example/.well-known/postsnail.json"]);
    expect(queue.messages).toHaveLength(0);

    fetches.length = 0;
    site.nextCheckAt = "2026-06-05T00:00:00.000Z";
    deps.fetcher = async (url: string | URL | Request) => {
      fetches.push(String(url));
      return mappedFetch(updated)(url);
    };
    await processScheduledChecks(deps, { limit: 5 });
    expect(fetches).toEqual(["https://creator.example/.well-known/postsnail.json"]);
    expect(queue.messages).toHaveLength(1);
    expect(store.checked).toContain(site.id);
  });
});
