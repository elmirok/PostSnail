import { describe, expect, test } from "vitest";
import { unzipSync } from "../../vendor/fflate/browser.js";
import { decodeText } from "../../src/bytes.js";
import { normalizePost } from "../../src/content.js";
import { generateSigningKeyPair } from "../../src/crypto.js";
import { buildStaticExport } from "../../src/exporter.js";
import { handleRequest } from "../src/app";
import { processCrawlMessage } from "../src/crawler";
import { processScheduledChecks } from "../src/scheduler";
import type { CrawlMessage, RegistryQueue, RegistryStore } from "../src/types";

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

  async search({ q, tag, scope = "content" }: { q: string; tag: string; scope?: string }): Promise<{ items: any[]; nextCursor: string | null }> {
    const items = [];
    for (const site of this.sites.values()) {
      if (site.hidden) continue;
      const siteText = `${site.siteTitle} ${site.description} ${site.handle} ${site.canonicalUrl} ${site.siteUrl}`.toLowerCase();
      const sitePosts = this.posts.get(site.id) || [];
      const shellMatchesQ = !q || siteText.includes(q);
      const shellMatchesTag = !tag || sitePosts.some((post) => post.tags.includes(tag));
      if ((scope === "all" || scope === "shell") && shellMatchesQ && shellMatchesTag) {
        items.push({ type: "shell", site, shell: site });
      }
      if (scope === "shell") continue;
      for (const post of this.posts.get(site.id) || []) {
        const matchesQ = !q || post.searchText.includes(q) || siteText.includes(q);
        const matchesTag = !tag || post.tags.includes(tag);
        if (matchesQ && matchesTag) items.push({ type: "content", site, post });
      }
    }
    return { items, nextCursor: null };
  }
}

async function fixtureDocuments(options: { keys?: ReturnType<typeof generateSigningKeyPair>; title?: string; body?: string; generatedAt?: string; withImage?: boolean } = {}) {
  const keys = options.keys || generateSigningKeyPair();
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
      siteUrl: "https://creator.example",
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
    keys
  };
}

function mappedFetch(documents: { wellKnown: string; manifest: string }) {
  return async (url: string | URL | Request): Promise<Response> => {
    const target = String(url);
    if (target === "https://creator.example/.well-known/postsnail.json") {
      return new Response(documents.wellKnown, { headers: { "content-type": "application/json" } });
    }
    if (target === "https://creator.example/postsnail.manifest.json") {
      return new Response(documents.manifest, { headers: { "content-type": "application/json" } });
    }
    return new Response("missing", { status: 404 });
  };
}

describe("registry API and crawl flow", () => {
  test("serves the Forest homepage for GET and HEAD", async () => {
    const store = new MemoryStore();
    const queue = new MemoryQueue();
    const deps = { store, queue, now: () => "2026-06-05T00:00:00.000Z", rateLimitSecret: "test-secret" };

    const get = await handleRequest(new Request("https://registry.example/"), deps);
    expect(get.status).toBe(200);
    expect(get.headers.get("content-type")).toContain("text/html");
    expect(await get.text()).toContain("PostSnail Forest");

    const head = await handleRequest(new Request("https://registry.example/", { method: "HEAD" }), deps);
    expect(head.status).toBe(200);
    expect(head.headers.get("content-type")).toContain("text/html");
    expect(await head.text()).toBe("");
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
