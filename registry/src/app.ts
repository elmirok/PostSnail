import { encodeText } from "../../src/bytes.js";
import { normalizeTags } from "../../src/content.js";
import { sha3Hex } from "../../src/crypto.js";
import { verifyAnnouncePayload } from "../../src/proof-documents.js";
import { verifySiteMoveRecord } from "../../src/siteMoves.js";
import { normalizeShellNameName, verifyShellNameRecord } from "../../src/shellnames.js";
import { D1RegistryStore } from "./db";
import { renderForestCss, renderForestScript, renderSearchPage, renderShellNameProfile } from "./html";
import { normalizedSearchText, randomId, stableId } from "./ids";
import { fetchJson, fetchProofDocuments } from "./remote";
import { verifyProofDocuments } from "./proof";
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
  ShellNameRecord,
  SiteMoveRecord,
  SubmissionRecord,
} from "./types";

const MAX_SUBMIT_BYTES = 8192;
const MAX_ANNOUNCE_BYTES = 24 * 1024;
const MAX_SHELLNAME_BYTES = 24 * 1024;
const MAX_SITE_MOVE_BYTES = 24 * 1024;
const MAX_SEARCH_QUERY_CHARS = 160;
const MAX_SEARCH_TAG_CHARS = 48;
const MAX_SEARCH_CURSOR_CHARS = 512;
const SEARCH_SORTS = new Set(["best", "newest", "oldest", "az", "za", "verified"]);
const PUBLIC_DETAIL_KEYS = new Set([
  "bundleFingerprint",
  "createdAt",
  "crawlMessage",
  "crawlStatus",
  "description",
  "digest",
  "expiresAt",
  "excerpt",
  "forest",
  "fullName",
  "generatedAt",
  "handle",
  "imageFiles",
  "logoUrl",
  "manifestUrl",
  "name",
  "postUrl",
  "publicKey",
  "publishedAt",
  "resultType",
  "siteUrl",
  "slug",
  "status",
  "tags",
  "thumbnailUrl",
  "title",
  "updatedAt",
  "url",
  "verifiedAt",
]);

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
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/") {
    return new Response(request.method === "HEAD" ? null : renderSearchPage(), { headers: htmlHeaders() });
  }
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/forest.css") {
    return new Response(request.method === "HEAD" ? null : renderForestCss(), { headers: staticAssetHeaders("text/css; charset=utf-8") });
  }
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/forest.js") {
    return new Response(request.method === "HEAD" ? null : renderForestScript(), { headers: staticAssetHeaders("text/javascript; charset=utf-8") });
  }
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/assets/brand/postsnail-icon.png") {
    return Response.redirect("https://postsnail.org/assets/brand/postsnail-icon.png", 302);
  }
  try {
    if (request.method === "POST" && url.pathname === "/api/submit") return await handleSubmit(request, deps);
    if (request.method === "POST" && url.pathname === "/api/announce") return await handleAnnounce(request, deps);
    if (request.method === "POST" && url.pathname === "/api/site-moves") return await handleSiteMove(request, deps);
    if (request.method === "GET" && url.pathname.startsWith("/api/site-moves/") && url.pathname.endsWith(".json")) return await handleSiteMoveJson(url, deps);
    if (request.method === "GET" && url.pathname.startsWith("/api/submissions/")) return await handleSubmission(url, deps);
    if (request.method === "GET" && url.pathname === "/api/search") return await handleSearch(url, deps);
    if (request.method === "GET" && url.pathname.startsWith("/api/sites/")) return await handleSite(url, deps);
    if (request.method === "GET" && url.pathname === "/go/post") return await handlePostResolver(url, deps);
    if (request.method === "POST" && url.pathname === "/shellnames/register") return await handleShellNameRegister(request, url, deps);
    if (request.method === "POST" && url.pathname === "/shellnames/update") return await handleShellNameUpdate(request, url, deps);
    if (request.method === "POST" && url.pathname === "/shellnames/renew") return await handleShellNameRenew(request, url, deps);
    if (request.method === "GET" && url.pathname === "/shellnames/search") return await handleShellNameSearch(url, deps);
    if (request.method === "GET" && url.pathname === "/shellnames/recent.json") return await handleShellNameRecent(deps);
    if (request.method === "GET" && url.pathname === "/shellnames/export.json") return await handleShellNameExport(deps);
    if (request.method === "GET" && url.pathname.startsWith("/shellnames/") && url.pathname.endsWith(".json")) return await handleShellNameJson(url, deps);
    if (request.method === "GET" && url.pathname.startsWith("/@/") && url.pathname.endsWith(".json")) return await handleShellNameSlashJson(url, deps);
    if (request.method === "GET" && /^\/@[a-z0-9_-]+$/iu.test(url.pathname)) return await handleShellNameProfile(url, deps);
    if (request.method === "POST" && url.pathname.startsWith("/api/admin/shellnames/")) return await handleShellNameAdmin(request, url, deps);
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

async function handleSiteMove(request: Request, deps: AppDeps): Promise<Response> {
  const body = await readJsonRequest(request, MAX_SITE_MOVE_BYTES);
  const record = objectRecord(body.record).protocol ? objectRecord(body.record) : body;
  const verified = await verifySiteMoveRecord(record);
  if (!verified.ok) throw new PublicError(siteMoveErrorStatus(verified.errors), verified.errors.join(" "));
  const fromUrl = normalizeForSubmit(verified.fromUrl).siteUrl;
  const toUrl = normalizeForSubmit(verified.toUrl).siteUrl;
  const now = deps.now?.() || new Date().toISOString();

  const signature = stringValue(verified.record.signature);
  const existing = await deps.store.getSiteMoveBySignature(signature);
  if (existing) return json(siteMoveResponse(existing), existing.mode === "move" ? 202 : 200);

  const requesterHash = requesterHashFor(request, deps.rateLimitSecret || "postsnail-local-dev");
  await enforceSiteMoveRateLimit(deps.store, requesterHash, verified.publicKey, now);

  const oldSite = await deps.store.getSiteByCanonicalUrl(fromUrl);
  if (!oldSite) throw new PublicError(404, "Old indexed site was not found in Forest.");
  if (oldSite.publicKey !== verified.publicKey) throw new PublicError(401, "Move public key does not match the old indexed site.");

  let proof;
  try {
    const documents = await fetchProofDocuments(toUrl, deps.fetcher || fetch);
    proof = verifyProofDocuments(toUrl, documents.wellKnown, documents.manifest, now);
  } catch {
    throw new PublicError(409, "New live site proof metadata could not be fetched.");
  }
  if (!proof.ok) throw new PublicError(409, "New live site proof did not verify.");
  if (proof.site.publicKey !== verified.publicKey) throw new PublicError(401, "New live site public key does not match the move record.");
  if (proof.site.bundleFingerprint !== verified.bundleFingerprint) throw new PublicError(409, "New live site fingerprint does not match the move record.");

  const indexedNewSite = await deps.store.getSiteByCanonicalUrl(toUrl);
  if (indexedNewSite && indexedNewSite.publicKey !== verified.publicKey) {
    throw new PublicError(401, "New indexed site public key does not match the move record.");
  }
  const move: SiteMoveRecord = {
    id: stableId("move", `${fromUrl}\n${toUrl}\n${verified.publicKey}\n${signature}`),
    fromSiteId: oldSite.id,
    toSiteId: indexedNewSite?.id || proof.site.id,
    fromUrl,
    toUrl,
    publicKey: verified.publicKey,
    bundleFingerprint: verified.bundleFingerprint,
    mode: verified.mode === "mirror" ? "mirror" : "move",
    status: verified.mode === "mirror" ? "mirror" : "moved",
    record: verified.record,
    signature,
    createdAt: stringValue(verified.record.createdAt) || now,
    appliedAt: now,
  };
  await deps.store.recordSiteMove(move, { hideOldSite: move.mode === "move", now });
  return json(siteMoveResponse(move), move.mode === "move" ? 202 : 200);
}

function normalizeForSubmit(rawUrl: string): { siteUrl: string; hostname: string } {
  try {
    return normalizeSubmittedUrl(rawUrl);
  } catch (error) {
    throw new PublicError(400, error instanceof Error ? error.message : "Submit a public https URL.");
  }
}

async function handleSiteMoveJson(url: URL, deps: AppDeps): Promise<Response> {
  const id = url.pathname.split("/").pop()?.replace(/\.json$/u, "") || "";
  const move = await deps.store.getSiteMove(id);
  if (!move) return json({ error: "Site move not found." }, 404, { "cache-control": "public, max-age=30, stale-while-revalidate=120" });
  return json({ siteMove: publicSiteMove(move) }, 200, { "cache-control": "public, max-age=60, stale-while-revalidate=300" });
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
  validateSearchInputs(url);
  const tag = normalizeTags([url.searchParams.get("tag") || ""])[0] || "";
  const params: SearchParams = {
    q: normalizedSearchText(url.searchParams.get("q") || ""),
    tag,
    scope: normalizeScope(url.searchParams.get("scope")),
    sort: normalizeSort(url.searchParams.get("sort")),
    limit: clampLimit(url.searchParams.get("limit")),
    cursor: url.searchParams.get("cursor"),
  };
  const result = await deps.store.search(params);
  return json({
    items: result.items.map((item) => publicSearchItem(item, deps.now?.() || new Date().toISOString())),
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

async function handlePostResolver(url: URL, deps: AppDeps): Promise<Response> {
  const publicKey = stringValue(url.searchParams.get("publicKey")).trim();
  const digest = stringValue(url.searchParams.get("digest")).trim();
  const slug = stringValue(url.searchParams.get("slug")).trim();
  if (!publicKey.startsWith("base64:") || publicKey.length > 4096) {
    return new Response(renderPostResolverPage(null, { publicKey, digest, slug, message: "The badge resolver needs a valid PostSnail public key." }), { status: 400, headers: htmlHeaders() });
  }
  if (!/^[a-f0-9]{128}$/iu.test(digest)) {
    return new Response(renderPostResolverPage(null, { publicKey, digest, slug, message: "The badge resolver needs a valid SHA3-512 post digest." }), { status: 400, headers: htmlHeaders() });
  }
  if (slug && !/^[a-z0-9-]{1,160}$/iu.test(slug)) {
    return new Response(renderPostResolverPage(null, { publicKey, digest, slug, message: "The badge resolver slug is not valid." }), { status: 400, headers: htmlHeaders() });
  }
  const match = await deps.store.findPostByPublicKeyDigest(publicKey, digest.toLowerCase(), slug.toLowerCase());
  if (!match) {
    return new Response(renderPostResolverPage(null, { publicKey, digest, slug, message: "Post not found in Forest yet." }), {
      status: 404,
      headers: htmlHeaders({ "cache-control": "public, max-age=30, stale-while-revalidate=120" }),
    });
  }
  return Response.redirect(match.post.url, 302);
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

async function handleShellNameRegister(request: Request, url: URL, deps: AppDeps): Promise<Response> {
  const { record, name, now, requesterHash } = await readShellNameRequest(request, url, deps);
  if (await deps.store.getShellName(name)) throw new PublicError(409, "That ShellName is already registered.");
  const existingForKey = await deps.store.getShellNameByPublicKey(record.publicKey);
  if (existingForKey && existingForKey.name !== name) throw new PublicError(409, "This public key already has an active ShellName.");
  await enforceShellNameRateLimit(deps.store, requesterHash, record.publicKey, now);
  await requireShellNameLiveProof(record, deps, now);
  const shellName = buildShellNameRecord(record, now);
  await deps.store.upsertShellName(shellName);
  return json(publicShellName(shellName, now), 201);
}

async function handleShellNameUpdate(request: Request, url: URL, deps: AppDeps): Promise<Response> {
  const { record, name, now, requesterHash } = await readShellNameRequest(request, url, deps);
  const existing = await deps.store.getShellName(name);
  if (!existing) throw new PublicError(404, "ShellName not found.");
  if (existing.publicKey !== record.publicKey) throw new PublicError(401, "Only the ShellName signing key can update this record.");
  await enforceShellNameRateLimit(deps.store, requesterHash, record.publicKey, now);
  await requireShellNameLiveProof(record, deps, now);
  const shellName = buildShellNameRecord(record, now, existing);
  await deps.store.upsertShellName(shellName);
  return json(publicShellName(shellName, now));
}

async function handleShellNameRenew(request: Request, url: URL, deps: AppDeps): Promise<Response> {
  const { record, name, now, requesterHash } = await readShellNameRequest(request, url, deps);
  const existing = await deps.store.getShellName(name);
  if (!existing) throw new PublicError(404, "ShellName not found.");
  if (existing.publicKey !== record.publicKey) throw new PublicError(401, "Only the ShellName signing key can renew this record.");
  await enforceShellNameRateLimit(deps.store, requesterHash, record.publicKey, now);
  await requireShellNameLiveProof(record, deps, now);
  const shellName = buildShellNameRecord(record, now, existing);
  await deps.store.upsertShellName(shellName);
  return json(publicShellName(shellName, now));
}

async function requireShellNameLiveProof(record: ReturnType<typeof verifyShellNameRecord>, deps: AppDeps, now: string): Promise<void> {
  let proof;
  try {
    const documents = await fetchProofDocuments(record.siteUrl, deps.fetcher || fetch);
    proof = verifyProofDocuments(record.siteUrl, documents.wellKnown, documents.manifest, now);
  } catch {
    throw new PublicError(409, "ShellName live site proof metadata could not be fetched.");
  }
  if (!proof.ok) throw new PublicError(409, "ShellName live site proof did not verify.");
  if (proof.site.publicKey !== record.publicKey) throw new PublicError(401, "ShellName public key does not match the live site proof.");
  if (record.bundleFingerprint && record.bundleFingerprint !== proof.site.bundleFingerprint) {
    throw new PublicError(409, "ShellName bundle fingerprint does not match the live site proof.");
  }
}

async function readShellNameRequest(request: Request, url: URL, deps: AppDeps): Promise<{ record: ReturnType<typeof verifyShellNameRecord>; name: string; now: string; requesterHash: string }> {
  const body = await readJsonRequest(request, MAX_SHELLNAME_BYTES);
  const requestedName = normalizeShellNameName(stringValue(body.name) || stringValue(objectRecord(body.record).name));
  const verified = verifyShellNameRecord(body.record, { name: requestedName, forest: url.hostname });
  if (!verified.ok) throw new PublicError(verified.errors.some((error) => /signature/i.test(error)) ? 401 : 400, verified.errors.join(" "));
  const now = deps.now?.() || new Date().toISOString();
  return {
    record: verified,
    name: verified.name,
    now,
    requesterHash: requesterHashFor(request, deps.rateLimitSecret || "postsnail-local-dev"),
  };
}

function buildShellNameRecord(verified: ReturnType<typeof verifyShellNameRecord>, now: string, existing?: ShellNameRecord): ShellNameRecord {
  const expiresAt = addYears(now, 1);
  const status = existing?.hidden ? "hidden" : "active";
  return {
    name: verified.name,
    fullName: verified.fullName,
    forest: verified.forest,
    siteUrl: verified.siteUrl,
    publicKey: verified.publicKey,
    bundleFingerprint: verified.bundleFingerprint,
    record: verified.record,
    signature: stringValue(verified.record.signature),
    status,
    hidden: existing?.hidden || 0,
    expiresAt,
    searchText: normalizedSearchText(`${verified.name} ${verified.fullName} ${verified.siteUrl} ${verified.publicKey} ${verified.bundleFingerprint}`),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

async function handleShellNameJson(url: URL, deps: AppDeps): Promise<Response> {
  const name = normalizeShellNameName(url.pathname.split("/").pop()?.replace(/\.json$/u, "") || "");
  const record = await deps.store.getShellName(name);
  if (!record) return json({ error: "ShellName not found." }, 404, { "cache-control": "public, max-age=30, stale-while-revalidate=120" });
  return json({ shellName: await publicShellNameChecked(record, deps) }, 200, { "cache-control": "public, max-age=30, stale-while-revalidate=120" });
}

async function handleShellNameSlashJson(url: URL, deps: AppDeps): Promise<Response> {
  const name = normalizeShellNameName(url.pathname.split("/").pop()?.replace(/\.json$/u, "") || "");
  const record = await deps.store.getShellName(name);
  if (!record) return json({ error: "ShellName not found." }, 404, { "cache-control": "public, max-age=30, stale-while-revalidate=120" });
  return json({ shellName: await publicShellNameChecked(record, deps) }, 200, { "cache-control": "public, max-age=30, stale-while-revalidate=120" });
}

async function handleShellNameProfile(url: URL, deps: AppDeps): Promise<Response> {
  const name = normalizeShellNameName(url.pathname.slice(2));
  const record = await deps.store.getShellName(name);
  if (!record) return new Response(renderShellNameProfile(null), { status: 404, headers: htmlHeaders() });
  return new Response(renderShellNameProfile(await publicShellNameChecked(record, deps)), { headers: htmlHeaders() });
}

async function handleShellNameSearch(url: URL, deps: AppDeps): Promise<Response> {
  const q = normalizedSearchText(url.searchParams.get("q") || "");
  const limit = clampLimit(url.searchParams.get("limit"));
  const items = await deps.store.searchShellNames(q, limit, deps.now?.() || new Date().toISOString());
  return json({ items: items.map((item) => publicShellName(item, deps.now?.() || new Date().toISOString())) }, 200, { "cache-control": "public, max-age=30, stale-while-revalidate=120" });
}

async function handleShellNameRecent(deps: AppDeps): Promise<Response> {
  const now = deps.now?.() || new Date().toISOString();
  const items = await deps.store.recentShellNames(25, now);
  return json({ items: items.map((item) => publicShellName(item, now)) }, 200, { "cache-control": "public, max-age=60, stale-while-revalidate=300" });
}

async function handleShellNameExport(deps: AppDeps): Promise<Response> {
  const now = deps.now?.() || new Date().toISOString();
  const shellNames = await deps.store.exportShellNames(now);
  return json({ protocol: "postsnail-shellnames-export", version: 1, exportedAt: now, shellNames: shellNames.map((item) => publicShellName(item, now)) }, 200, { "cache-control": "public, max-age=300, stale-while-revalidate=600" });
}

async function handleShellNameAdmin(request: Request, url: URL, deps: AppDeps): Promise<Response> {
  if (!(await hasAdminAccess(request, deps.adminToken))) return json({ error: "Unauthorized." }, 401);
  const parts = url.pathname.split("/");
  const name = normalizeShellNameName(parts[4] || "");
  const action = parts[5] || "";
  const now = deps.now?.() || new Date().toISOString();
  const record = await deps.store.getShellName(name);
  if (!record) return json({ error: "ShellName not found." }, 404);
  if (action === "hide" || action === "unhide") {
    await deps.store.setShellNameHidden(name, action === "hide", now);
    return json({ name, hidden: action === "hide" });
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

async function enforceShellNameRateLimit(store: RegistryStore, requesterHash: string, publicKey: string, now: string): Promise<void> {
  const hour = now.slice(0, 13);
  const day = now.slice(0, 10);
  const ipHourCount = await store.incrementRateLimit(`shellname:${requesterHash}:hour:${hour}`, `${hour}:00:00Z`, now);
  const ipDayCount = await store.incrementRateLimit(`shellname:${requesterHash}:day:${day}`, `${day}T00:00:00Z`, now);
  const keyHash = sha3Hex(encodeText(publicKey));
  const keyHourCount = await store.incrementRateLimit(`shellname-key:${keyHash}:hour:${hour}`, `${hour}:00:00Z`, now);
  const keyDayCount = await store.incrementRateLimit(`shellname-key:${keyHash}:day:${day}`, `${day}T00:00:00Z`, now);
  if (ipHourCount > 6 || ipDayCount > 24 || keyHourCount > 4 || keyDayCount > 12) {
    throw new PublicError(429, "ShellName rate limit reached.");
  }
}

async function enforceSiteMoveRateLimit(store: RegistryStore, requesterHash: string, publicKey: string, now: string): Promise<void> {
  const hour = now.slice(0, 13);
  const day = now.slice(0, 10);
  const ipHourCount = await store.incrementRateLimit(`site-move:${requesterHash}:hour:${hour}`, `${hour}:00:00Z`, now);
  const ipDayCount = await store.incrementRateLimit(`site-move:${requesterHash}:day:${day}`, `${day}T00:00:00Z`, now);
  const keyHash = sha3Hex(encodeText(publicKey));
  const keyHourCount = await store.incrementRateLimit(`site-move-key:${keyHash}:hour:${hour}`, `${hour}:00:00Z`, now);
  const keyDayCount = await store.incrementRateLimit(`site-move-key:${keyHash}:day:${day}`, `${day}T00:00:00Z`, now);
  if (ipHourCount > 6 || ipDayCount > 24 || keyHourCount > 4 || keyDayCount > 12) {
    throw new PublicError(429, "Site move rate limit reached.");
  }
}

function siteMoveErrorStatus(errors: string[]): number {
  return errors.some((error) => /signature|public key/i.test(error)) ? 401 : 400;
}

function requesterHashFor(request: Request, secret: string): string {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return sha3Hex(encodeText(`${secret}:${ip}`));
}

function htmlHeaders(extra: HeadersInit = {}): HeadersInit {
  return {
    "content-type": "text/html; charset=utf-8",
    "content-security-policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    ...extra,
  };
}

function staticAssetHeaders(contentType: string): HeadersInit {
  return {
    "content-type": contentType,
    "cache-control": "public, max-age=300, stale-while-revalidate=3600",
    "x-content-type-options": "nosniff",
  };
}

function validateSearchInputs(url: URL): void {
  if ((url.searchParams.get("q") || "").length > MAX_SEARCH_QUERY_CHARS) {
    throw new PublicError(400, "Search query is too long.");
  }
  if ((url.searchParams.get("tag") || "").length > MAX_SEARCH_TAG_CHARS) {
    throw new PublicError(400, "Search tag is too long.");
  }
  if ((url.searchParams.get("cursor") || "").length > MAX_SEARCH_CURSOR_CHARS) {
    throw new PublicError(400, "Search cursor is too long.");
  }
  const sort = url.searchParams.get("sort");
  if (sort && !SEARCH_SORTS.has(sort)) {
    throw new PublicError(400, "Unsupported search sort.");
  }
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
    details: sanitizePublicDetails(site.details),
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
    details: sanitizePublicDetails(post.details),
    publishedAt: post.publishedAt,
  };
}

function publicSearchItem(item: Awaited<ReturnType<RegistryStore["search"]>>["items"][number], now: string) {
  if (item.type === "shellname") {
    return {
      type: "shellname",
      shellName: publicShellName(item.shellName, now),
    };
  }
  return {
    type: item.type || "content",
    site: publicSite(item.site),
    post: item.post ? publicPost(item.post) : undefined,
    shell: item.shell ? publicShell(item.shell) : undefined,
    shellName: item.type === "shell" && item.shellName ? publicShellName(item.shellName, now) : undefined,
  };
}

function renderPostResolverPage(match: { site: RegistrySite; post: RegistryPost } | null, context: { publicKey: string; digest: string; slug: string; message: string }): string {
  const title = match ? "Post found in Forest" : "Post not found in Forest yet";
  const target = match?.post.url || "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - PostSnail Forest</title>
  <link rel="stylesheet" href="/forest.css">
</head>
<body>
  <main class="forest-shell resolver-shell">
    <header class="forest-topline">
      <a class="forest-brand" href="/"><img src="/assets/brand/postsnail-icon.png" alt="" width="24" height="24"><span>PostSnail Forest</span></a>
    </header>
    <section class="result resolver-card">
      <div class="result-body">
        <div class="meta"><span>Badge resolver</span><span>Discovery only</span></div>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(match ? "Forest found the current visible indexed post for this public key and digest." : context.message)}</p>
        ${target ? `<p><a class="btn primary" href="${escapeAttr(target)}" rel="noopener noreferrer">Open post</a></p>` : ""}
        <details open>
          <summary>Proof details</summary>
          <dl class="detail-grid">
            <dt>Public key</dt><dd>${escapeHtml(context.publicKey)}</dd>
            <dt>Digest</dt><dd>${escapeHtml(context.digest)}</dd>
            <dt>Slug</dt><dd>${escapeHtml(context.slug || "not supplied")}</dd>
            ${match ? `<dt>Resolved URL</dt><dd>${escapeHtml(target)}</dd><dt>Site</dt><dd>${escapeHtml(match.site.siteTitle || match.site.canonicalUrl)}</dd>` : ""}
          </dl>
        </details>
      </div>
    </section>
  </main>
</body>
</html>`;
}

function publicShellName(record: ShellNameRecord, now: string) {
  const status = record.hidden ? "hidden" : record.expiresAt <= now ? "expired" : record.status;
  return {
    name: record.name,
    fullName: record.fullName,
    forest: record.forest,
    siteUrl: record.siteUrl,
    publicKey: record.publicKey,
    bundleFingerprint: record.bundleFingerprint,
    record: record.record,
    signature: record.signature,
    status,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function publicShellNameChecked(record: ShellNameRecord, deps: AppDeps) {
  const now = deps.now?.() || new Date().toISOString();
  const publicRecord = publicShellName(record, now);
  const indexedSite = await deps.store.getSiteByCanonicalUrl(record.siteUrl);
  if (indexedSite && !indexedSite.hidden && indexedSite.publicKey !== record.publicKey) {
    return {
      ...publicRecord,
      status: "conflict",
      warning: "This ShellName points to a site indexed with a different public key.",
    };
  }
  return publicRecord;
}

function publicSiteMove(record: SiteMoveRecord) {
  return {
    id: record.id,
    fromSiteId: record.fromSiteId,
    toSiteId: record.toSiteId,
    fromUrl: record.fromUrl,
    toUrl: record.toUrl,
    publicKey: record.publicKey,
    bundleFingerprint: record.bundleFingerprint,
    mode: record.mode,
    status: record.status,
    record: record.record,
    signature: record.signature,
    createdAt: record.createdAt,
    appliedAt: record.appliedAt,
  };
}

function siteMoveResponse(record: SiteMoveRecord) {
  return {
    status: record.status,
    moveId: record.id,
    fromUrl: record.fromUrl,
    toUrl: record.toUrl,
  };
}

function sanitizePublicDetails(value: unknown): Record<string, unknown> {
  const source = objectRecord(value);
  const clean: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(source)) {
    if (!PUBLIC_DETAIL_KEYS.has(key) || nested === undefined || nested === null || nested === "") continue;
    if (Array.isArray(nested)) {
      if (nested.length) clean[key] = nested;
      continue;
    }
    if (typeof nested === "object") {
      if (Object.keys(objectRecord(nested)).length) clean[key] = objectRecord(nested);
      continue;
    }
    clean[key] = nested;
  }
  return clean;
}

function normalizeScope(value: string | null): SearchParams["scope"] {
  if (value === "all" || value === "shell" || value === "content") return value;
  return "content";
}

function normalizeSort(value: string | null): SearchParams["sort"] {
  if (value && SEARCH_SORTS.has(value)) return value as SearchParams["sort"];
  return "best";
}

function clampLimit(value: string | null): number {
  const number = Number(value || 20);
  if (!Number.isFinite(number)) return 20;
  return Math.min(Math.max(Math.floor(number), 1), 50);
}

function addYears(value: string, years: number): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return new Date(Date.now() + years * 365 * 24 * 60 * 60 * 1000).toISOString();
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString();
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value: unknown): string {
  return escapeHtml(value);
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
