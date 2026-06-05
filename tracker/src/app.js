import { canonicalJson } from "../../src/canonical.js";
import { encodeText } from "../../src/bytes.js";
import { buildExcerpt } from "../../src/content.js";
import { sha3Hex, textToBytes, verifyBytes } from "../../src/crypto.js";
import {
  ANNOUNCE_TYPE,
  POSTSNAIL_PROTOCOL,
  SIGNATURE_SUITE,
} from "../../src/protocol.js";
import {
  manifestHash,
  verifyAnnouncePayload,
  verifyIdentityDocument,
} from "../../src/proof-documents.js";

const MAX_BODY_BYTES = 16 * 1024;
const MAX_JSON_BYTES = 160 * 1024;

export function createTrackerApp({ fetcher = fetch } = {}) {
  const blogs = new Map();
  return {
    async fetch(request) {
      const url = new URL(request.url);
      try {
        if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, service: "postsnail-tracker", protocol: POSTSNAIL_PROTOCOL });
        if (request.method === "GET" && url.pathname === "/recent.json") return json({ protocol: POSTSNAIL_PROTOCOL, items: Array.from(blogs.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 50) });
        if (request.method === "GET" && url.pathname === "/export/blogs.json") return json({ protocol: POSTSNAIL_PROTOCOL, blogs: Array.from(blogs.values()).sort((a, b) => a.domain.localeCompare(b.domain)) });
        if (request.method === "GET" && url.pathname.startsWith("/blogs/") && url.pathname.endsWith(".json")) {
          const domain = decodeURIComponent(url.pathname.slice(7, -5));
          const record = blogs.get(domain);
          return record ? json(record) : json({ error: "Blog not found." }, 404);
        }
        if (request.method === "POST" && url.pathname === "/announce") {
          const payload = await readJsonRequest(request);
          const result = await handleAnnounce(payload, fetcher);
          blogs.set(result.domain, result);
          return json({ status: "accepted", domain: result.domain, bundleFingerprint: result.bundleFingerprint }, 202);
        }
        return json({ error: "Not found." }, 404);
      } catch (error) {
        return json({ error: publicMessage(error) }, error instanceof PublicError ? error.status : 500);
      }
    },
  };
}

async function handleAnnounce(payload, fetcher) {
  const announce = verifyAnnouncePayload(payload);
  if (!announce.ok) throw new PublicError(400, announce.errors.join(" "));
  if (payload.type !== ANNOUNCE_TYPE || payload.signatureSuite !== SIGNATURE_SUITE) {
    throw new PublicError(400, "Unsupported announce payload.");
  }
  const siteUrl = assertHttpsUrl(payload.siteUrl);
  const wellKnownUrl = sameOriginUrl(siteUrl, payload.wellKnownUrl || ".well-known/postsnail.json").toString();
  const manifestUrl = sameOriginUrl(siteUrl, payload.manifestUrl || "postsnail.manifest.json").toString();
  const [wellKnown, manifest] = await Promise.all([
    fetchJson(wellKnownUrl, fetcher),
    fetchJson(manifestUrl, fetcher),
  ]);
  const identity = verifyIdentityDocument(wellKnown, { manifest, siteUrl });
  if (!identity.ok) throw new PublicError(400, "Identity proof failed.");
  if (wellKnown.publicKey !== payload.publicKey || manifest.publicKey !== payload.publicKey) throw new PublicError(400, "Public key mismatch.");
  if (wellKnown.bundleFingerprint !== payload.bundleFingerprint || manifest.bundleFingerprint !== payload.bundleFingerprint) throw new PublicError(400, "Bundle fingerprint mismatch.");

  const manifestPayload = { ...manifest };
  const manifestSignature = manifestPayload.manifestSignature;
  delete manifestPayload.manifestSignature;
  const signature = safeBytes(manifestSignature);
  const publicKey = safeBytes(manifest.publicKey);
  if (!signature || !publicKey || !verifyBytes(encodeText(canonicalJson(manifestPayload)), signature, publicKey)) {
    throw new PublicError(400, "Manifest signature failed.");
  }

  return {
    domain: new URL(siteUrl).hostname,
    canonicalUrl: siteUrl,
    siteTitle: manifest.site?.siteTitle || wellKnown.siteTitle || "Untitled Microblog",
    handle: manifest.site?.handle || wellKnown.handle || "",
    description: manifest.site?.description || wellKnown.description || "",
    publicKey: manifest.publicKey,
    bundleFingerprint: manifest.bundleFingerprint,
    manifestHash: manifestHash(manifest),
    manifestUrl,
    wellKnownUrl,
    updatedAt: new Date().toISOString(),
    posts: Array.isArray(manifest.posts) ? manifest.posts.slice(0, 50).map(summaryPost).filter(Boolean) : [],
  };
}

function summaryPost(proof) {
  const record = proof && typeof proof.record === "object" ? proof.record : null;
  if (!record) return null;
  return {
    slug: String(record.slug || proof.slug || ""),
    title: String(record.title || record.slug || ""),
    excerpt: String(record.excerpt || buildExcerpt(record.body || "")),
    tags: Array.isArray(record.tags) ? record.tags.map(String) : [],
    digest: String(proof.digest || ""),
    publishedAt: String(record.publishedAt || record.createdAt || ""),
  };
}

function assertHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") throw new Error();
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
    return url.toString();
  } catch {
    throw new PublicError(400, "Submit a public https URL.");
  }
}

function sameOriginUrl(origin, pointer) {
  const base = new URL(origin);
  const next = new URL(String(pointer || ""), base);
  if (next.origin !== base.origin) throw new PublicError(400, "Proof URL must stay on the creator origin.");
  return next;
}

async function fetchJson(url, fetcher) {
  const response = await fetcher(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new PublicError(400, "Proof document could not be fetched.");
  const text = await readBoundedText(response, MAX_JSON_BYTES);
  try {
    return JSON.parse(text);
  } catch {
    throw new PublicError(400, "Proof document is not valid JSON.");
  }
}

async function readJsonRequest(request) {
  const text = await readBoundedText(request, MAX_BODY_BYTES);
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new PublicError(400, "Request body must be JSON.");
  }
}

async function readBoundedText(response, maxBytes) {
  const contentLength = Number(response.headers?.get?.("content-length") || "0");
  if (contentLength > maxBytes) throw new PublicError(400, "JSON document is too large.");
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new PublicError(400, "JSON document is too large.");
  return text;
}

function safeBytes(value) {
  try {
    return value ? textToBytes(value) : null;
  } catch {
    return null;
  }
}

function publicMessage(error) {
  return error instanceof PublicError ? error.message : "Request could not be completed.";
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

class PublicError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
