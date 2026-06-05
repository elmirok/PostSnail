import { describe, expect, test } from "vitest";
import { unzipSync } from "../../vendor/fflate/browser.js";
import { decodeText } from "../../src/bytes.js";
import { normalizePost } from "../../src/content.js";
import { generateSigningKeyPair } from "../../src/crypto.js";
import { buildStaticExport } from "../../src/exporter.js";
import { handleRequest } from "../src/app";
import { processCrawlMessage } from "../src/crawler";
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
    this.sites.set(site.id, { ...site, hidden: this.hidden.has(site.id) ? 1 : 0, lastVerifiedAt: now });
    this.posts.set(site.id, posts);
    const submission = this.submissions.get(submissionId);
    if (submission) Object.assign(submission, { status: "indexed", siteId: site.id, updatedAt: now });
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

  async search({ q, tag }: { q: string; tag: string }): Promise<{ items: any[]; nextCursor: string | null }> {
    const items = [];
    for (const site of this.sites.values()) {
      if (site.hidden) continue;
      for (const post of this.posts.get(site.id) || []) {
        const matchesQ = !q || post.searchText.includes(q);
        const matchesTag = !tag || post.tags.includes(tag);
        if (matchesQ && matchesTag) items.push({ site, post });
      }
    }
    return { items, nextCursor: null };
  }
}

async function fixtureDocuments() {
  const keys = generateSigningKeyPair();
  const post = normalizePost({
    id: "p1",
    title: "Searchable Proof",
    body: "A useful searchable excerpt.",
    tags: ["Proof"],
    status: "published",
    createdAt: "2026-06-05T00:00:00.000Z"
  });
  const result = await buildStaticExport({
    profile: {
      siteTitle: "Search Feed",
      description: "Findable signed feed.",
      handle: "search-feed",
      siteUrl: "https://creator.example",
      about: ""
    },
    posts: [post],
    assets: [],
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
    generatedAt: "2026-06-05T00:00:00.000Z"
  });
  const files = unzipSync(result.zipBytes, {}) as Record<string, Uint8Array>;
  return {
    wellKnown: decodeText(files[".well-known/postsnail.json"]),
    manifest: decodeText(files["postsnail.manifest.json"])
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
    const results = await search.json() as any;
    expect(results.items).toHaveLength(1);
    expect(results.items[0].post).toMatchObject({ title: "Searchable Proof", digest: expect.stringMatching(/^[a-f0-9]{128}$/) });
    expect(results.items[0].post.body).toBeUndefined();
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
});
