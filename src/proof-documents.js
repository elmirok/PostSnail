import { canonicalJson } from "./canonical.js";
import { encodeText } from "./bytes.js";
import {
  publicKeyToText,
  sha3Hex,
  signBytes,
  signatureToText,
  textToBytes,
  verifyBytes,
} from "./crypto.js";
import {
  ANNOUNCE_TYPE,
  COMMIT_TYPE,
  COMMIT_VERSION,
  COMMITS_TYPE,
  DIGEST_SUITE,
  FEED_PATH,
  FINGERPRINT_SUITE,
  IDENTITY_TYPE,
  IDENTITY_VERSION,
  LATEST_COMMIT_PATH,
  MANIFEST_PATH,
  POSTSNAIL_PROTOCOL,
  RSS_PATH,
  SIGNATURE_SUITE,
  SITEMAP_PATH,
  WELL_KNOWN_PATH,
} from "./protocol.js";

export function normalizeSiteUrl(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  try {
    const url = new URL(source);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
    return url.toString().replace(/\/$/u, "");
  } catch {
    return source.replace(/\/+$/u, "");
  }
}

export function canonicalSiteUrl(value) {
  const normalized = normalizeSiteUrl(value);
  return normalized ? `${normalized}/` : "";
}

export function domainFromSiteUrl(value) {
  try {
    return new URL(canonicalSiteUrl(value)).hostname;
  } catch {
    return "";
  }
}

export function siteUrlForPath(siteUrl, path) {
  const normalized = canonicalSiteUrl(siteUrl);
  if (!normalized) return path;
  return new URL(path, normalized).toString();
}

export function normalizeTopics(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(/[\n,]/u);
  return Array.from(
    new Set(
      list
        .map((item) => String(item || "").trim().toLowerCase())
        .filter(Boolean)
        .map((item) => item.replace(/[^a-z0-9-]+/gu, "-").replace(/^-+|-+$/gu, ""))
        .filter(Boolean),
    ),
  ).sort();
}

export function normalizeTrackerUrls(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(/[\n,]/u);
  const seen = new Set();
  const result = [];
  for (const item of list) {
    const source = String(item || "").trim();
    if (!source) continue;
    try {
      const url = new URL(source);
      if (url.protocol !== "https:") continue;
      url.hash = "";
      url.search = "";
      url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
      const normalized = url.toString();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push(normalized);
      }
    } catch {
      // Invalid tracker URLs are ignored; the creator can still export locally.
    }
  }
  return result;
}

export function normalizeIndexingPolicy(value) {
  const source = String(value || "allow").trim().toLowerCase();
  return ["allow", "noindex"].includes(source) ? source : "allow";
}

export function normalizeDiscoverySettings(settings = {}) {
  return {
    language: String(settings.language || "en").trim() || "en",
    topics: normalizeTopics(settings.topics),
    preferredTrackers: normalizeTrackerUrls(settings.preferredTrackers),
    indexingPolicy: normalizeIndexingPolicy(settings.indexingPolicy),
  };
}

export function buildDiscovery(profile, settings = {}) {
  const cleanSettings = normalizeDiscoverySettings(settings);
  return {
    canonicalManifestUrl: siteUrlForPath(profile.siteUrl, MANIFEST_PATH),
    wellKnownUrl: siteUrlForPath(profile.siteUrl, WELL_KNOWN_PATH),
    feedUrl: siteUrlForPath(profile.siteUrl, FEED_PATH),
    rssUrl: siteUrlForPath(profile.siteUrl, RSS_PATH),
    sitemapUrl: siteUrlForPath(profile.siteUrl, SITEMAP_PATH),
    language: cleanSettings.language,
    topics: cleanSettings.topics,
    preferredTrackers: cleanSettings.preferredTrackers,
    indexingPolicy: cleanSettings.indexingPolicy,
  };
}

export function signRecord(payload, secretKey, signatureField = "signature") {
  return {
    ...payload,
    [signatureField]: signatureToText(signBytes(encodeText(canonicalJson(payload)), secretKey)),
  };
}

export function verifySignedRecord(record, publicKey, signatureField = "signature") {
  const payload = { ...objectRecord(record) };
  const signatureText = payload[signatureField];
  delete payload[signatureField];
  const signature = safeBytes(signatureText);
  const key = safeBytes(publicKey);
  return Boolean(signature && key && verifyBytes(encodeText(canonicalJson(payload)), signature, key));
}

export function buildIdentityDocument({
  profile,
  settings = {},
  publicKey,
  bundleFingerprint,
  generatedAt,
  secretKey,
}) {
  const publicKeyText = typeof publicKey === "string" ? publicKey : publicKeyToText(publicKey);
  const discovery = buildDiscovery(profile, settings);
  const payload = {
    protocol: POSTSNAIL_PROTOCOL,
    type: IDENTITY_TYPE,
    identityVersion: IDENTITY_VERSION,
    domain: domainFromSiteUrl(profile.siteUrl),
    canonicalUrl: canonicalSiteUrl(profile.siteUrl),
    siteTitle: profile.siteTitle,
    description: profile.description,
    handle: profile.handle,
    publicKey: publicKeyText,
    signatureSuite: SIGNATURE_SUITE,
    digestSuite: DIGEST_SUITE,
    fingerprintSuite: FINGERPRINT_SUITE,
    manifestUrl: discovery.canonicalManifestUrl,
    feedUrl: discovery.feedUrl,
    rssUrl: discovery.rssUrl,
    sitemapUrl: discovery.sitemapUrl,
    latestCommitUrl: siteUrlForPath(profile.siteUrl, LATEST_COMMIT_PATH),
    bundleFingerprint,
    generatedAt,
    preferredTrackers: discovery.preferredTrackers,
    indexingPolicy: discovery.indexingPolicy,
    // Legacy aliases keep Sprint 3 registries compatible while v1 discovery settles.
    manifest: MANIFEST_PATH,
    siteUrl: normalizeSiteUrl(profile.siteUrl),
  };
  return signRecord(payload, secretKey, "identitySignature");
}

export function verifyIdentityDocument(identity, { manifest, siteUrl = "" } = {}) {
  const errors = [];
  const warnings = [];
  const record = objectRecord(identity);
  const manifestRecord = objectRecord(manifest);
  const manifestDiscovery = objectRecord(manifestRecord.discovery);
  const publicKey = stringValue(manifestRecord.publicKey) || stringValue(record.publicKey);
  add(errors, record.protocol === POSTSNAIL_PROTOCOL, "Identity protocol mismatch.");
  add(errors, record.type === IDENTITY_TYPE, "Identity type mismatch.");
  add(errors, record.identityVersion === IDENTITY_VERSION, "Unsupported identity version.");
  add(errors, record.signatureSuite === SIGNATURE_SUITE, "Identity signature suite mismatch.");
  add(errors, record.digestSuite === DIGEST_SUITE, "Identity digest suite mismatch.");
  add(errors, record.fingerprintSuite === FINGERPRINT_SUITE, "Identity fingerprint suite mismatch.");
  add(errors, stringValue(record.publicKey) === publicKey, "Identity public key mismatch.");
  add(errors, verifySignedRecord(record, publicKey, "identitySignature"), "Identity signature failed.");
  if (manifestRecord.publicKey) add(errors, stringValue(record.publicKey) === stringValue(manifestRecord.publicKey), "Identity public key does not match manifest.");
  if (manifestRecord.bundleFingerprint) add(errors, stringValue(record.bundleFingerprint) === stringValue(manifestRecord.bundleFingerprint), "Identity bundle fingerprint mismatch.");
  if (manifestDiscovery.canonicalManifestUrl) add(errors, stringValue(record.manifestUrl) === stringValue(manifestDiscovery.canonicalManifestUrl), "Identity manifest pointer mismatch.");
  if (manifestDiscovery.feedUrl) add(errors, stringValue(record.feedUrl) === stringValue(manifestDiscovery.feedUrl), "Identity feed pointer mismatch.");
  if (manifestDiscovery.rssUrl) add(errors, stringValue(record.rssUrl) === stringValue(manifestDiscovery.rssUrl), "Identity RSS pointer mismatch.");
  if (manifestDiscovery.sitemapUrl) add(errors, stringValue(record.sitemapUrl) === stringValue(manifestDiscovery.sitemapUrl), "Identity sitemap pointer mismatch.");

  const declaredUrl = siteUrl || stringValue(record.canonicalUrl) || stringValue(record.siteUrl);
  if (!declaredUrl) {
    warnings.push("No canonical site URL declared; domain binding was not checked.");
  } else {
    const expectedDomain = domainFromSiteUrl(declaredUrl);
    add(errors, stringValue(record.domain) === expectedDomain, "Identity domain binding mismatch.");
    add(errors, stringValue(record.canonicalUrl) === canonicalSiteUrl(declaredUrl), "Identity canonical URL mismatch.");
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function manifestHash(manifest) {
  return sha3Hex(encodeText(canonicalJson(manifest)));
}

export function commitHash(commit) {
  return sha3Hex(encodeText(canonicalJson(commit)));
}

export function buildCommitRecord({
  commitHistory = [],
  manifest,
  generatedAt,
  publicKey,
  secretKey,
}) {
  const publicKeyText = typeof publicKey === "string" ? publicKey : publicKeyToText(publicKey);
  const previous = commitHistory.at(-1) || null;
  const payload = {
    type: COMMIT_TYPE,
    protocol: POSTSNAIL_PROTOCOL,
    commitVersion: COMMIT_VERSION,
    sequence: Number(previous?.sequence || 0) + 1,
    previousCommit: previous ? commitHash(previous) : null,
    manifestHash: manifestHash(manifest),
    bundleFingerprint: manifest.bundleFingerprint,
    createdAt: generatedAt,
    summary: {
      siteTitle: manifest.site?.siteTitle || "Untitled Microblog",
      handle: manifest.site?.handle || "",
      postCount: Array.isArray(manifest.posts) ? manifest.posts.length : 0,
      fileCount: manifest.files && typeof manifest.files === "object" ? Object.keys(manifest.files).length : 0,
    },
    publicKey: publicKeyText,
    signatureSuite: SIGNATURE_SUITE,
  };
  return signRecord(payload, secretKey);
}

export function buildCommitLog(commits = []) {
  return {
    type: COMMITS_TYPE,
    protocol: POSTSNAIL_PROTOCOL,
    commitVersion: COMMIT_VERSION,
    commits,
  };
}

export function verifyCommitRecord(commit, { publicKey, manifestHash: expectedManifestHash, bundleFingerprint, previousCommit } = {}) {
  const errors = [];
  const record = objectRecord(commit);
  add(errors, record.type === COMMIT_TYPE, "Commit type mismatch.");
  add(errors, record.protocol === POSTSNAIL_PROTOCOL, "Commit protocol mismatch.");
  add(errors, record.commitVersion === COMMIT_VERSION, "Unsupported commit version.");
  add(errors, Number.isInteger(record.sequence) && record.sequence > 0, "Commit sequence is invalid.");
  if (typeof previousCommit !== "undefined") add(errors, record.previousCommit === previousCommit, "Commit previous hash mismatch.");
  add(errors, stringValue(record.publicKey) === stringValue(publicKey), "Commit public key mismatch.");
  add(errors, record.signatureSuite === SIGNATURE_SUITE, "Commit signature suite mismatch.");
  add(errors, stringValue(record.manifestHash) === stringValue(expectedManifestHash), "Commit manifest hash mismatch.");
  add(errors, stringValue(record.bundleFingerprint) === stringValue(bundleFingerprint), "Commit bundle fingerprint mismatch.");
  add(errors, verifySignedRecord(record, stringValue(publicKey)), "Commit signature failed.");
  return { ok: errors.length === 0, errors };
}

export function verifyCommitLog(commits, context) {
  const errors = [];
  const list = Array.isArray(commits) ? commits : [];
  let previousHash = null;
  list.forEach((commit, index) => {
    const expectedContext = index === list.length - 1 ? context : { ...context, manifestHash: commit.manifestHash, bundleFingerprint: commit.bundleFingerprint };
    const result = verifyCommitRecord(commit, { ...expectedContext, previousCommit: previousHash });
    if (!result.ok) errors.push(...result.errors.map((error) => `Commit ${index + 1}: ${error}`));
    previousHash = commitHash(commit);
  });
  return { ok: errors.length === 0, errors };
}

export function buildAnnouncePayload({ identity, manifest, publicKey, secretKey, generatedAt }) {
  const publicKeyText = typeof publicKey === "string" ? publicKey : publicKeyToText(publicKey);
  const payload = {
    type: ANNOUNCE_TYPE,
    protocol: POSTSNAIL_PROTOCOL,
    siteUrl: identity.canonicalUrl,
    domain: identity.domain,
    wellKnownUrl: siteUrlForPath(identity.canonicalUrl, WELL_KNOWN_PATH),
    manifestUrl: identity.manifestUrl,
    bundleFingerprint: manifest.bundleFingerprint,
    publicKey: publicKeyText,
    generatedAt,
    signatureSuite: SIGNATURE_SUITE,
  };
  return signRecord(payload, secretKey);
}

export function verifyAnnouncePayload(payload) {
  const errors = [];
  const record = objectRecord(payload);
  add(errors, record.type === ANNOUNCE_TYPE, "Announce type mismatch.");
  add(errors, record.protocol === POSTSNAIL_PROTOCOL, "Announce protocol mismatch.");
  add(errors, Boolean(stringValue(record.siteUrl)), "Announce site URL is missing.");
  add(errors, Boolean(stringValue(record.wellKnownUrl)), "Announce well-known URL is missing.");
  add(errors, Boolean(stringValue(record.manifestUrl)), "Announce manifest URL is missing.");
  add(errors, Boolean(stringValue(record.bundleFingerprint)), "Announce bundle fingerprint is missing.");
  add(errors, record.signatureSuite === SIGNATURE_SUITE, "Announce signature suite mismatch.");
  add(errors, verifySignedRecord(record, stringValue(record.publicKey)), "Announce signature failed.");
  return { ok: errors.length === 0, errors };
}

function objectRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stringValue(value) {
  return typeof value === "string" ? value : "";
}

function safeBytes(value) {
  try {
    return value ? textToBytes(value) : null;
  } catch {
    return null;
  }
}

function add(errors, ok, error) {
  if (!ok) errors.push(error);
}
