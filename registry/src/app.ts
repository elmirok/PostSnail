import { encodeText } from "../../src/bytes.js";
import { normalizeTags } from "../../src/content.js";
import { sha3Hex } from "../../src/crypto.js";
import { verifyAnnouncePayload } from "../../src/proof-documents.js";
import { D1RegistryStore } from "./db";
import { renderSearchPage } from "./html";
import { normalizedSearchText, randomId } from "./ids";
import { fetchJson } from "./remote";
import { addMinutes, createRefreshSubmission } from "./scheduler";
import { normalizeSubmittedUrl, sameOriginUrl } from "./url";
import type {
  CrawlMessage,
  Fetcher,
  RegistryPost,
  RegistryQueue,
  RegistrySite,
  RegistryStore,
  SearchParams,
  SubmissionRecord,
} from "./types";

const MAX_SUBMIT_BYTES = 8192;
const MAX_ANNOUNCE_BYTES = 24 * 1024;

export interface AppDeps {
  store: RegistryStore;
  queue: RegistryQueue;
  adminToken?: string;
  rateLimitSecret?: string;
  now?: () => string;
  fetcher?: Fetcher;
}

type RuntimeEnv = Env & {
  ADMIN_TOKEN?: string;
  RATE_LIMIT_SECRET?: string;
};

export function depsFromEnv(env: RuntimeEnv): AppDeps {
  return {
    store: new D1RegistryStore(env.DB),
    queue: env.CRAWL_QUEUE,
    adminToken: env.ADMIN_TOKEN,
    rateLimitSecret: env.RATE_LIMIT_SECRET,
  };
}

export async function handleRequest(request: Request, deps: AppDeps): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (request.method === "GET" && url.pathname === "/") {
    return new Response(renderSearchPage(), { headers: htmlHeaders() });
  }
  try {
    if (request.method === "POST" && url.pathname === "/api/submit") return await handleSubmit(request, deps);
    if (request.method === "POST" && url.pathname === "/api/announce") return await handleAnnounce(request, deps);
    if (request.method === "GET" && url.pathname.startsWith("/api/submissions/")) return await handleSubmission(url, deps);
    if (request.method === "GET" && url.pathname === "/api/search") return await handleSearch(url, deps);
    if (request.method === "GET" && url.pathname.startsWith("/api/sites/")) return await handleSite(url, deps);
    if (request.method === "POST" && url.pathname.startsWith("/api/admin/sites/")) return await handleAdmin(request, url, deps);
    return json({ error: "Not found." }, 404);
  } catch (error) {
    const message = error instanceof PublicError ? error.message : "Request could not be completed.";
    const status = error instanceof PublicError ? error.status : 500;
    return json({ error: message }, status);
  }
}

async function handleSubmit(request: Request, deps: AppDeps): Promise<Response> {
  const body = await readJsonRequest(request, MAX_SUBMIT_BYTES);
  const rawUrl = typeof body.url === "string" ? body.url : "";
  const normalized = normalizeForSubmit(rawUrl);
  const now = deps.now?.() || new Date().toISOString();
  const requesterHash = requesterHashFor(request, deps.rateLimitSecret || "postsnail-local-dev");
  await enforceRateLimit(deps.store, requesterHash, now);
  const recent = await deps.store.findRecentSubmission(normalized.siteUrl, now);
  if (recent) throw new PublicError(409, "This site is already queued or recently indexed.");
  const submission: SubmissionRecord = {
    id: randomId("sub"),
    siteUrl: normalized.siteUrl,
    status: "queued",
    siteId: null,
    message: "",
    requesterHash,
    createdAt: now,
    updatedAt: now,
  };
  await deps.store.createSubmission(submission);
  await deps.queue.send({ submissionId: submission.id, siteUrl: submission.siteUrl });
  return json({ submissionId: submission.id, status: "queued", siteUrl: submission.siteUrl }, 202);
}

async function handleAnnounce(request: Request, deps: AppDeps): Promise<Response> {
  const payload = await readJsonRequest(request, MAX_ANNOUNCE_BYTES);
  const announce = verifyAnnouncePayload(payload);
  if (!announce.ok) throw new PublicError(400, announce.errors.join(" "));
  const normalized = normalizeForSubmit(stringValue(payload.siteUrl));
  const now = deps.now?.() || new Date().toISOString();
  const requesterHash = requesterHashFor(request, deps.rateLimitSecret || "postsnail-local-dev");
  await enforceAnnounceRateLimit(deps.store, requesterHash, normalized.siteUrl, now);

  const wellKnownUrl = sameOriginUrl(normalized.siteUrl, stringValue(payload.wellKnownUrl) || ".well-known/postsnail.json").toString();
  sameOriginUrl(normalized.siteUrl, stringValue(payload.manifestUrl) || "postsnail.manifest.json");
  const fingerprint = stringValue(payload.bundleFingerprint);
  const publicKey = stringValue(payload.publicKey);
  const site = await deps.store.getSiteByCanonicalUrl(normalized.siteUrl);
  if (site && site.publicKey !== publicKey) throw new PublicError(401, "Announce public key does not match the indexed site.");

  let wellKnown: Record<string, unknown>;
  try {
    wellKnown = objectRecord(await fetchJson(wellKnownUrl, deps.fetcher || fetch, normalized.siteUrl));
  } catch {
    if (site) {
      await deps.store.recordPendingRefresh(site.id, fingerprint, addMinutes(now, 15), now);
      return json({ status: "pending_live_site", siteUrl: normalized.siteUrl, bundleFingerprint: fingerprint }, 202);
    }
    throw new PublicError(400, "Live PostSnail proof metadata could not be fetched.");
  }
  if (stringValue(wellKnown.publicKey) !== publicKey) throw new PublicError(401, "Live public key does not match the announce payload.");
  if (stringValue(wellKnown.bundleFingerprint) !== fingerprint) {
    if (site) {
      await deps.store.recordPendingRefresh(site.id, fingerprint, addMinutes(now, 15), now);
      return json({ status: "pending_live_site", siteUrl: normalized.siteUrl, bundleFingerprint: fingerprint }, 202);
    }
    throw new PublicError(409, "Live site has not published the announced fingerprint.");
  }
  if (site?.bundleFingerprint === fingerprint) {
    await deps.store.recordRefreshCheck(site.id, { changed: false, failed: false }, now, addMinutes(now, 60), 60);
    return json({ status: "current", siteUrl: normalized.siteUrl, bundleFingerprint: fingerprint }, 200);
  }
  const active = await deps.store.findActiveSubmission(normalized.siteUrl, now);
  if (active) throw new PublicError(409, "This site already has an active refresh.");
  const submission = await createRefreshSubmission(deps.store, deps.queue, normalized.siteUrl, site?.id || null, requesterHash, now);
  if (site) await deps.store.recordRefreshQueued(site.id, fingerprint, addMinutes(now, 60), now);
  return json({ status: "queued", submissionId: submission.id, siteUrl: normalized.siteUrl }, 202);
}

function normalizeForSubmit(rawUrl: string): { siteUrl: string; hostname: string } {
  try {
    return normalizeSubmittedUrl(rawUrl);
  } catch (error) {
    throw new PublicError(400, error instanceof Error ? error.message : "Submit a public https URL.");
  }
}

async function handleSubmission(url: URL, deps: AppDeps): Promise<Response> {
  const id = url.pathname.split("/").pop() || "";
  const submission = await deps.store.getSubmission(id);
  if (!submission) return json({ error: "Submission not found." }, 404);
  return json({
    submissionId: submission.id,
    status: submission.status,
    siteId: submission.siteId || undefined,
    message: submission.message || undefined,
    updatedAt: submission.updatedAt,
  });
}

async function handleSearch(url: URL, deps: AppDeps): Promise<Response> {
  const tag = normalizeTags([url.searchParams.get("tag") || ""])[0] || "";
  const params: SearchParams = {
    q: normalizedSearchText(url.searchParams.get("q") || ""),
    tag,
    scope: normalizeScope(url.searchParams.get("scope")),
    limit: clampLimit(url.searchParams.get("limit")),
    cursor: url.searchParams.get("cursor"),
  };
  const result = await deps.store.search(params);
  return json({
    items: result.items.map((item) => ({
      type: item.type || "content",
      site: publicSite(item.site),
      post: item.post ? publicPost(item.post) : undefined,
      shell: item.shell ? publicShell(item.shell) : undefined,
    })),
    nextCursor: result.nextCursor,
  }, 200, { "cache-control": "public, max-age=30, stale-while-revalidate=120" });
}

async function handleSite(url: URL, deps: AppDeps): Promise<Response> {
  const id = url.pathname.split("/").pop() || "";
  const site = await deps.store.getSite(id);
  if (!site || site.hidden) return json({ error: "Site not found." }, 404);
  const posts = await deps.store.getPostsForSite(site.id, 100);
  return json({
    site: publicSite(site),
    posts: posts.map((post) => publicPost(post)),
    latestCrawlStatus: site.latestCrawlStatus,
    latestCrawlMessage: site.latestCrawlMessage || undefined,
  }, 200, { "cache-control": "public, max-age=60, stale-while-revalidate=300" });
}

async function handleAdmin(request: Request, url: URL, deps: AppDeps): Promise<Response> {
  if (!(await hasAdminAccess(request, deps.adminToken))) return json({ error: "Unauthorized." }, 401);
  const parts = url.pathname.split("/");
  const siteId = parts[4] || "";
  const action = parts[5] || "";
  const now = deps.now?.() || new Date().toISOString();
  const site = await deps.store.getSite(siteId);
  if (!site) return json({ error: "Site not found." }, 404);
  if (action === "hide" || action === "unhide") {
    await deps.store.setSiteHidden(siteId, action === "hide", now);
    return json({ siteId, hidden: action === "hide" });
  }
  if (action === "recrawl") {
    const submission: SubmissionRecord = {
      id: randomId("sub"),
      siteUrl: site.canonicalUrl,
      status: "queued",
      siteId: site.id,
      message: "",
      requesterHash: "admin",
      createdAt: now,
      updatedAt: now,
    };
    await deps.store.createSubmission(submission);
    const message: CrawlMessage = { submissionId: submission.id, siteUrl: site.canonicalUrl };
    await deps.queue.send(message);
    return json({ submissionId: submission.id, status: "queued", siteUrl: site.canonicalUrl }, 202);
  }
  return json({ error: "Not found." }, 404);
}

async function enforceRateLimit(store: RegistryStore, requesterHash: string, now: string): Promise<void> {
  const hour = now.slice(0, 13);
  const day = now.slice(0, 10);
  const hourCount = await store.incrementRateLimit(`${requesterHash}:hour:${hour}`, `${hour}:00:00Z`, now);
  const dayCount = await store.incrementRateLimit(`${requesterHash}:day:${day}`, `${day}T00:00:00Z`, now);
  if (hourCount > 10 || dayCount > 50) throw new PublicError(429, "Submission rate limit reached.");
}

async function enforceAnnounceRateLimit(store: RegistryStore, requesterHash: string, siteUrl: string, now: string): Promise<void> {
  await enforceRateLimit(store, requesterHash, now);
  const hour = now.slice(0, 13);
  const day = now.slice(0, 10);
  const siteHash = sha3Hex(encodeText(siteUrl));
  const siteHourCount = await store.incrementRateLimit(`announce:${siteHash}:hour:${hour}`, `${hour}:00:00Z`, now);
  const siteDayCount = await store.incrementRateLimit(`announce:${siteHash}:day:${day}`, `${day}T00:00:00Z`, now);
  if (siteHourCount > 6 || siteDayCount > 24) throw new PublicError(429, "Announce rate limit reached.");
}

function requesterHashFor(request: Request, secret: string): string {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return sha3Hex(encodeText(`${secret}:${ip}`));
}

function htmlHeaders(): HeadersInit {
  return {
    "content-type": "text/html; charset=utf-8",
    "content-security-policy":
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  };
}

async function readJsonRequest(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") || "0");
  if (length > maxBytes) throw new PublicError(400, "Request body is too large.");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new PublicError(400, "Request body is too large.");
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw new PublicError(400, "Request body must be JSON.");
  }
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function hasAdminAccess(request: Request, token?: string): Promise<boolean> {
  if (!token) return false;
  const header = request.headers.get("authorization") || "";
  const value = header.startsWith("Bearer ") ? header.slice(7) : "";
  return constantTimeEqual(value, token);
}

async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  let diff = 0;
  for (let index = 0; index < leftBytes.length; index += 1) diff |= leftBytes[index] ^ rightBytes[index];
  return diff === 0 && a.length === b.length;
}

function publicSite(site: RegistrySite) {
  return {
    id: site.id,
    url: site.canonicalUrl,
    title: site.siteTitle,
    handle: site.handle,
    description: site.description,
    manifestUrl: site.manifestUrl,
    publicKey: site.publicKey,
    bundleFingerprint: site.bundleFingerprint,
    logoUrl: site.logoUrl,
    details: site.details || {},
    generatedAt: site.generatedAt,
    lastVerifiedAt: site.lastVerifiedAt,
    latestCrawlStatus: site.latestCrawlStatus,
    latestCrawlMessage: site.latestCrawlMessage || undefined,
  };
}

function publicShell(site: RegistrySite) {
  return publicSite(site);
}

function publicPost(post: RegistryPost) {
  return {
    slug: post.slug,
    title: post.title,
    url: post.url,
    excerpt: post.excerpt,
    tags: post.tags,
    digest: post.digest,
    thumbnailUrl: post.thumbnailUrl,
    details: post.details || {},
    publishedAt: post.publishedAt,
  };
}

function normalizeScope(value: string | null): SearchParams["scope"] {
  if (value === "all" || value === "shell" || value === "content") return value;
  return "content";
}

function clampLimit(value: string | null): number {
  const number = Number(value || 20);
  if (!Number.isFinite(number)) return 20;
  return Math.min(Math.max(Math.floor(number), 1), 50);
}

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders(), ...headers },
  });
}

function corsHeaders(): HeadersInit {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
  };
}

class PublicError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}
