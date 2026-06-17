import { canonicalJson } from "../../src/canonical.js";
import { encodeText } from "../../src/bytes.js";
import { normalizeTags } from "../../src/content.js";
import { fingerprintForBytes, sha3Hex, textToBytes, verifyBytes } from "../../src/crypto.js";
import { verifyIdentityDocument } from "../../src/proof-documents.js";
import { DIGEST_SUITE, FINGERPRINT_SUITE, MANIFEST_VERSION, REQUIRED_CORE_FEATURES, SIGNATURE_SUITE } from "../../src/protocol.js";
import { checkRequiredFeatures, protocolMatches, protocolVersionFor } from "../../src/compatibility.js";
import { normalizedSearchText, stableId, tagsText } from "./ids";
import { sameOriginUrl } from "./url";
import type { RegistryPost, RegistrySite } from "./types";

export interface VerifiedProof {
  ok: boolean;
  errors: string[];
  site: RegistrySite;
  posts: RegistryPost[];
  manifestUrl: string;
}

interface ManifestPost {
  slug?: unknown;
  digest?: unknown;
  signature?: unknown;
  record?: unknown;
}

export function verifyProofDocuments(siteUrl: string, wellKnown: unknown, manifest: unknown, now = new Date().toISOString()): VerifiedProof {
  const errors: string[] = [];
  const wellKnownRecord = objectRecord(wellKnown);
  const manifestRecord = objectRecord(manifest);
  const manifestUrl = resolveManifestUrl(siteUrl, wellKnownRecord, errors);
  const siteRecord = objectRecord(manifestRecord.site);
  const publicKeyText = stringValue(manifestRecord.publicKey);
  const publicKey = safeBytes(publicKeyText);

  add(errors, protocolMatches(wellKnownRecord.protocol), ".well-known protocol mismatch.");
  add(errors, protocolVersionFor(wellKnownRecord) <= MANIFEST_VERSION, ".well-known protocol version is unsupported.");
  addFeatureErrors(errors, wellKnownRecord);
  add(errors, !manifestRecord.protocol || protocolMatches(manifestRecord.protocol), "Manifest protocol mismatch.");
  add(errors, protocolVersionFor(manifestRecord) <= MANIFEST_VERSION, "Manifest protocol version is unsupported.");
  addFeatureErrors(errors, manifestRecord);
  add(errors, manifestRecord.manifestVersion === MANIFEST_VERSION, "Unsupported manifest version.");
  add(errors, objectRecord(manifestRecord.algorithm).digest === DIGEST_SUITE, "Manifest does not declare SHA3-512 digests.");
  add(errors, objectRecord(manifestRecord.algorithm).signature === SIGNATURE_SUITE, "Manifest does not declare ML-DSA-65 signatures.");
  add(errors, objectRecord(manifestRecord.algorithm).fingerprint === FINGERPRINT_SUITE, "Manifest does not declare psn1-sha3-512 fingerprints.");
  add(errors, Boolean(publicKey), "Manifest public key is missing or invalid.");
  add(errors, stringValue(wellKnownRecord.publicKey) === publicKeyText, ".well-known public key mismatch.");
  add(errors, stringValue(wellKnownRecord.bundleFingerprint) === stringValue(manifestRecord.bundleFingerprint), ".well-known bundle fingerprint mismatch.");
  add(errors, stringValue(wellKnownRecord.siteTitle) === stringValue(siteRecord.siteTitle), ".well-known site title mismatch.");
  add(errors, stringValue(wellKnownRecord.handle) === stringValue(siteRecord.handle), ".well-known handle mismatch.");
  add(errors, stringValue(wellKnownRecord.siteUrl) === stringValue(siteRecord.siteUrl), ".well-known site URL mismatch.");
  add(errors, declaredSiteMatchesRequest(siteUrl, stringValue(siteRecord.siteUrl)), "Declared site URL does not match requested site.");
  add(errors, stringValue(wellKnownRecord.generatedAt) === stringValue(manifestRecord.generatedAt), ".well-known generated time mismatch.");
  if (stringValue(wellKnownRecord.identitySignature)) {
    const identity = verifyIdentityDocument(wellKnownRecord, { manifest: manifestRecord, siteUrl } as any);
    add(errors, identity.ok, identity.errors.join(" "));
  }

  if (publicKey) {
    const { manifestSignature, ...payload } = manifestRecord;
    const signature = safeBytes(stringValue(manifestSignature));
    const ok = Boolean(signature && verifyBytes(encodeText(canonicalJson(payload)), signature, publicKey));
    add(errors, ok, "Manifest signature failed.");
  }

  const posts = Array.isArray(manifestRecord.posts) ? manifestRecord.posts as ManifestPost[] : [];
  add(errors, posts.length > 0, "Manifest has no post proofs.");
  const verifiedPosts = posts.slice(0, 500).map((post) => verifyPost(siteUrl, post, publicKey, errors, now));
  add(errors, posts.length <= 500, "Manifest has too many post proofs.");

  const bundleFingerprint = stringValue(manifestRecord.bundleFingerprint);
  const expectedFingerprint = fingerprintForBytes(encodeText(canonicalJson({
    files: manifestRecord.files,
    posts: manifestRecord.posts,
  })));
  add(errors, bundleFingerprint === expectedFingerprint, "Bundle fingerprint mismatch.");

  const site = buildSite(siteUrl, manifestUrl, siteRecord, publicKeyText, bundleFingerprint, stringValue(manifestRecord.generatedAt), now);
  return {
    ok: errors.length === 0,
    errors,
    site,
    posts: verifiedPosts.map((post) => ({ ...post, id: stableId("post", `${site.id}\n${post.slug}`), siteId: site.id })),
    manifestUrl,
  };
}

function verifyPost(siteUrl: string, post: ManifestPost, publicKey: Uint8Array | null, errors: string[], now: string): RegistryPost {
  const slug = stringValue(post.slug) || stringValue(objectRecord(post.record).slug) || "unknown";
  const record = objectRecord(post.record);
  const recordBytes = encodeText(canonicalJson(record));
  add(errors, sha3Hex(recordBytes) === stringValue(post.digest), `Post ${slug} digest mismatch.`);
  const signature = safeBytes(stringValue(post.signature));
  add(errors, Boolean(publicKey && signature && verifyBytes(recordBytes, signature, publicKey)), `Post ${slug} signature failed.`);

  const tags = normalizeTags(Array.isArray(record.tags) ? record.tags.map(String) : []);
  const title = stringValue(record.title) || slug;
  const excerpt = stringValue(record.excerpt);
  const publishedAt = stringValue(record.publishedAt) || stringValue(record.createdAt) || "";
  const url = new URL(`posts/${encodeURIComponent(slug)}/`, siteUrl).toString();
  const imageFiles = safeImageFiles(record.imageFiles);
  const thumbnailUrl = imageFiles[0] ? publicAssetUrl(siteUrl, imageFiles[0]) : "";
  const searchText = normalizedSearchText(`${title} ${excerpt} ${tags.join(" ")}`);
  const digest = stringValue(post.digest);
  return {
    id: stableId("post", `${siteUrl}\n${slug}`),
    siteId: "",
    slug,
    title,
    url,
    excerpt,
    tags,
    digest,
    thumbnailUrl,
    details: {
      slug,
      title,
      url,
      excerpt,
      tags,
      digest,
      publishedAt,
      createdAt: stringValue(record.createdAt),
      updatedAt: stringValue(record.updatedAt),
      imageFiles,
      thumbnailUrl,
    },
    publishedAt,
    searchText,
    visible: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function buildSite(siteUrl: string, manifestUrl: string, site: Record<string, unknown>, publicKey: string, fingerprint: string, generatedAt: string, now: string): RegistrySite {
  const id = stableId("site", `${siteUrl}\n${publicKey}`);
  const logoUrl = publicLogoUrl(siteUrl, site);
  return {
    id,
    canonicalUrl: siteUrl,
    manifestUrl,
    siteTitle: stringValue(site.siteTitle) || "Untitled Microblog",
    handle: stringValue(site.handle),
    description: stringValue(site.description),
    siteUrl: stringValue(site.siteUrl),
    publicKey,
    bundleFingerprint: fingerprint,
    logoUrl,
    details: {
      title: stringValue(site.siteTitle) || "Untitled Microblog",
      handle: stringValue(site.handle),
      description: stringValue(site.description),
      url: siteUrl,
      siteUrl: stringValue(site.siteUrl),
      manifestUrl,
      publicKey,
      bundleFingerprint: fingerprint,
      generatedAt,
      logoUrl,
    },
    generatedAt,
    lastVerifiedAt: now,
    hidden: 0,
    createdAt: now,
    updatedAt: now,
    latestCrawlStatus: "indexed",
    latestCrawlMessage: "",
    lastCheckedAt: now,
    nextCheckAt: addMinutes(now, 60),
    checkIntervalMinutes: 60,
    unchangedCheckCount: 0,
    failureCount: 0,
    pendingFingerprint: "",
  };
}

function addMinutes(iso: string, minutes: number): string {
  const base = Date.parse(iso);
  const time = Number.isFinite(base) ? base : Date.now();
  return new Date(time + minutes * 60_000).toISOString();
}

function resolveManifestUrl(siteUrl: string, wellKnown: Record<string, unknown>, errors: string[]): string {
  const pointer = stringValue(wellKnown.manifestUrl) || stringValue(wellKnown.manifest);
  try {
    const manifestUrl = sameOriginUrl(siteUrl, pointer || "postsnail.manifest.json");
    return manifestUrl.toString();
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Manifest URL is invalid.");
    return new URL("postsnail.manifest.json", siteUrl).toString();
  }
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function declaredSiteMatchesRequest(requestedSiteUrl: string, declaredSiteUrl: string): boolean {
  try {
    const requested = new URL(requestedSiteUrl);
    const declared = new URL(declaredSiteUrl);
    requested.hash = "";
    requested.search = "";
    declared.hash = "";
    declared.search = "";
    requested.pathname = requested.pathname.replace(/\/+$/u, "/") || "/";
    declared.pathname = declared.pathname.replace(/\/+$/u, "/") || "/";
    return requested.toString() === declared.toString();
  } catch {
    return false;
  }
}

function safeImageFiles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter(isSafeAssetFileName);
}

function isSafeAssetFileName(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*\.(?:png|jpe?g|webp|gif|avif)$/iu.test(value);
}

function publicAssetUrl(siteUrl: string, fileName: string): string {
  if (!isSafeAssetFileName(fileName)) return "";
  return new URL(`assets/${fileName}`, siteUrl).toString();
}

function publicLogoUrl(siteUrl: string, site: Record<string, unknown>): string {
  const candidates = [
    stringValue(site.logoUrl),
    stringValue(site.logo),
    stringValue(site.iconUrl),
    stringValue(site.avatarUrl),
    stringValue(site.image),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return sameOriginUrl(siteUrl, candidate).toString();
    } catch {
      // Unsupported logo pointers are ignored; fallback badges still render.
    }
  }
  return "";
}

function safeBytes(value: string): Uint8Array | null {
  try {
    return value ? textToBytes(value) : null;
  } catch {
    return null;
  }
}

function add(errors: string[], ok: boolean, error: string): void {
  if (!ok) errors.push(error);
}

function addFeatureErrors(errors: string[], record: Record<string, unknown>): void {
  const features = checkRequiredFeatures(record, REQUIRED_CORE_FEATURES);
  if (!features.ok) errors.push(...features.errors);
}
