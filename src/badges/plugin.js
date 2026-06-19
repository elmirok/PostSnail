import { canonicalJson } from "../canonical.js";
import { encodeBase64, encodeText } from "../bytes.js";
import { buildExcerpt, slugify } from "../content.js";
import { sha3Hex, textToBytes, verifyBytes } from "../crypto.js";
import { siteUrlForPath } from "../proof-documents.js";

export const POSTSNAIL_BADGES_PLUGIN_ID = "postsnail-badges";
export const BADGE_CLAIM_PROTOCOL = "postsnail-badge-claim";
export const BADGE_CLAIM_VERSION = 1;
export const BADGE_SEED_SUITE = "sha3-512-post-signature";
export const BADGE_HASH_PREFIX = "psb1-sha3-512-";

const DEFAULT_FOREST_URL = "https://forest.postsnail.org";
const MOTIFS = ["plant", "leaf", "mushroom", "insect", "fish", "bird", "shell", "flower", "seedpod", "tree"];
const COLOR_PAIRS = [
  ["#fffdf7", "#2f7a55"],
  ["#fffdf7", "#080a2f"],
  ["#fffdf7", "#cf1e3d"],
  ["#080a2f", "#ff8f9a"],
  ["#2f7a55", "#fffdf7"],
  ["#d3c8bf", "#080a2f"],
  ["#fffdf7", "#ef4056"],
  ["#080a2f", "#d3c8bf"],
];

export function badgeHashForSignature(signature) {
  const bytes = textToBytes(signature);
  return `${BADGE_HASH_PREFIX}${sha3Hex(bytes)}`;
}

export function createSignatureBadge(signature, options = {}) {
  const badgeHash = options.badgeHash || badgeHashForSignature(signature);
  const hex = badgeHash.replace(BADGE_HASH_PREFIX, "");
  const motif = MOTIFS[seedByte(hex, 0) % MOTIFS.length];
  const colors = COLOR_PAIRS[seedByte(hex, 1) % COLOR_PAIRS.length];
  const pixels = motifPixels(motif, hex);
  const svg = renderBadgeSvg({ badgeHash, motif, colors, pixels, title: options.title || "PostSnail signature badge" });
  return {
    badgeHash,
    badgeSeedSuite: BADGE_SEED_SUITE,
    motif,
    colors,
    svg,
  };
}

export function buildBadgeClaimForPost({
  profile,
  post,
  proof,
  publicKeyText,
  generatedAt,
  forestUrl,
  shellName = "",
}) {
  const badge = createSignatureBadge(proof.signature, { title: post.title || post.slug });
  const sourceSiteUrl = profile.siteUrl || "";
  const slug = String(post.slug || proof.slug || "").trim();
  return {
    protocol: BADGE_CLAIM_PROTOCOL,
    version: BADGE_CLAIM_VERSION,
    badgeHash: badge.badgeHash,
    badgeSeedSuite: BADGE_SEED_SUITE,
    forestUrl: normalizeForestUrl(forestUrl) || DEFAULT_FOREST_URL,
    shellName: String(shellName || "").trim(),
    sourcePublicKey: publicKeyText,
    sourceSiteUrl,
    postUrl: siteUrlForPath(sourceSiteUrl, `posts/${slug}/`),
    slug,
    title: String(post.title || slug).trim(),
    tags: normalizeClaimTags(post.tags),
    excerpt: String(post.excerpt || buildExcerpt(post.body || "")).trim(),
    postDigest: proof.digest,
    postSignature: proof.signature,
    badgeSvgPath: `badges/posts/${slug}.svg`,
    publishedAt: String(post.publishedAt || post.createdAt || "").trim(),
    generatedAt,
    requiredFeatures: [],
    optionalFeatures: ["forest-tracker", "signature-badge"],
    extensions: {},
    record: cloneJson(proof.record || {}),
  };
}

export function verifyBadgeClaim(claim) {
  const errors = [];
  const record = objectRecord(claim);
  if (record.protocol !== BADGE_CLAIM_PROTOCOL) errors.push("Badge claim protocol mismatch.");
  if (Number(record.version) !== BADGE_CLAIM_VERSION) errors.push("Unsupported badge claim version.");
  if (record.badgeSeedSuite !== BADGE_SEED_SUITE) errors.push("Badge seed suite mismatch.");
  if (!String(record.badgeHash || "").startsWith(BADGE_HASH_PREFIX)) errors.push("Badge hash mismatch.");
  if (!String(record.sourcePublicKey || "").startsWith("base64:")) errors.push("Badge source public key is required.");
  if (!String(record.postSignature || "").startsWith("base64:")) errors.push("Badge post signature is required.");
  const postRecord = objectRecord(record.record);
  if (!Object.keys(postRecord).length) errors.push("Badge claim is missing the public post record needed for verification.");

  if (Object.keys(postRecord).length) {
    const recordBytes = encodeText(canonicalJson(postRecord));
    const digest = sha3Hex(recordBytes);
    if (digest !== String(record.postDigest || "")) errors.push("Badge post digest does not match the public post record.");
    try {
      const signature = textToBytes(String(record.postSignature || ""));
      const publicKey = textToBytes(String(record.sourcePublicKey || ""));
      if (!verifyBytes(recordBytes, signature, publicKey)) errors.push("Badge post signature failed.");
    } catch {
      errors.push("Badge post signature failed.");
    }
  }

  try {
    const expectedHash = badgeHashForSignature(String(record.postSignature || ""));
    if (String(record.badgeHash || "") !== expectedHash) errors.push("Badge hash does not match the post signature.");
  } catch {
    errors.push("Badge hash does not match the post signature.");
  }

  if (Array.isArray(record.requiredFeatures) && record.requiredFeatures.length > 0) {
    errors.push("Badge claim declares unsupported required features.");
  }

  return {
    ok: errors.length === 0,
    errors,
    claim: sanitizeBadgeClaim(record),
  };
}

export function normalizeBadgesState(value = {}) {
  const source = objectRecord(value);
  return {
    schemaVersion: 1,
    claims: cleanArray(source.claims).map(sanitizeBadgeClaim).filter((claim) => claim.badgeHash && claim.postDigest),
    settings: {
      publishBadgePage: source.settings?.publishBadgePage !== false,
      pagePath: normalizeBadgePagePath(source.settings?.pagePath || "/badges/"),
    },
    ...preserveUnknownBadgeState(source),
  };
}

export function importBadgeClaim(state, claim, options = {}) {
  const verification = verifyBadgeClaim(claim);
  if (!verification.ok) {
    throw new Error(verification.errors.join(" "));
  }
  const badges = normalizeBadgesState(state);
  const claimedAt = options.claimedAt || new Date().toISOString();
  const nextClaim = {
    ...verification.claim,
    claimedAt: verification.claim.claimedAt || claimedAt,
  };
  const key = badgeClaimKey(nextClaim);
  const existing = badges.claims.some((item) => badgeClaimKey(item) === key);
  const claims = existing
    ? badges.claims.map((item) => (badgeClaimKey(item) === key ? { ...item, ...nextClaim, claimedAt: item.claimedAt || nextClaim.claimedAt } : item))
    : [nextClaim, ...badges.claims];
  return {
    duplicate: existing,
    claim: nextClaim,
    state: {
      ...badges,
      claims: sortBadgeClaims(claims),
    },
  };
}

export function buildBadgeCollectionPublicData(value = {}) {
  const state = normalizeBadgesState(value);
  if (!state.settings.publishBadgePage) return null;
  const claims = state.claims.map(sanitizeBadgeClaim).filter((claim) => claim.badgeHash && claim.postSignature);
  return {
    pagePath: state.settings.pagePath,
    claims: sortBadgeClaims(claims),
    groups: groupBadgeClaims(claims),
    publicFiles: claims.map((claim) => `/badges/collection/${badgeFileName(claim)}.svg`),
  };
}

export function sortBadgeClaims(claims = []) {
  return cleanArray(claims).sort((left, right) => (
    String(left.claimedAt || "").localeCompare(String(right.claimedAt || "")) ||
    String(left.forestUrl || "").localeCompare(String(right.forestUrl || "")) ||
    String(left.shellName || left.sourceSiteUrl || "").localeCompare(String(right.shellName || right.sourceSiteUrl || "")) ||
    String(left.title || "").localeCompare(String(right.title || "")) ||
    String(left.badgeHash || "").localeCompare(String(right.badgeHash || ""))
  ));
}

export function groupBadgeClaims(claims = []) {
  const groups = [];
  for (const claim of sortBadgeClaims(claims)) {
    const forest = normalizeForestUrl(claim.forestUrl) || DEFAULT_FOREST_URL;
    const shell = claim.shellName || claim.sourceSiteUrl || "Unknown Shell";
    let forestGroup = groups.find((group) => group.forest === forest);
    if (!forestGroup) {
      forestGroup = { forest, shells: [] };
      groups.push(forestGroup);
    }
    let shellGroup = forestGroup.shells.find((group) => group.name === shell);
    if (!shellGroup) {
      shellGroup = { name: shell, claims: [] };
      forestGroup.shells.push(shellGroup);
    }
    shellGroup.claims.push(claim);
  }
  return groups;
}

export function forestResolverUrlForClaim(claim) {
  const forest = normalizeForestUrl(claim.forestUrl) || DEFAULT_FOREST_URL;
  const url = new URL("/go/post", forest);
  url.searchParams.set("publicKey", claim.sourcePublicKey || "");
  url.searchParams.set("digest", claim.postDigest || "");
  if (claim.slug) url.searchParams.set("slug", claim.slug);
  return url.toString();
}

export function badgeFileName(claim) {
  const hash = String(claim.badgeHash || "").replace(BADGE_HASH_PREFIX, "").slice(0, 32);
  return slugify(`${claim.slug || claim.title || "badge"}-${hash || "claim"}`);
}

export function badgeClaimFileName(claim) {
  const slug = slugify(claim.slug || claim.title || "post");
  const hash = String(claim.badgeHash || "").replace(BADGE_HASH_PREFIX, "").slice(0, 32) || "unknown";
  return `${slug}.postsnail.badge.${hash}.json`;
}

export function badgeDataUriForClaim(claim) {
  const badge = createSignatureBadge(claim.postSignature, { badgeHash: claim.badgeHash, title: claim.title });
  return `data:image/svg+xml;base64,${encodeBase64(encodeText(badge.svg))}`;
}

function renderBadgeSvg({ badgeHash, motif, colors, pixels, title }) {
  const [background, foreground] = colors;
  const metadata = {
    protocol: "postsnail-signature-badge",
    version: 1,
    badgeHash,
    badgeSeedSuite: BADGE_SEED_SUITE,
    motif,
  };
  const rects = pixels
    .map(([x, y]) => `<rect x="${x}" y="${y}" width="1" height="1"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="128" height="128" role="img" aria-label="${escapeXml(title)}" shape-rendering="crispEdges">
<metadata>${escapeXml(JSON.stringify(metadata))}</metadata>
<rect width="16" height="16" fill="${background}"/>
<g fill="${foreground}">${rects}</g>
</svg>`;
}

function motifPixels(motif, hex) {
  const jitter = seedByte(hex, 2) % 2;
  const mirrored = seedByte(hex, 3) % 2 === 1;
  const pixels = {
    plant: [[8,3],[7,4],[8,4],[9,4],[6,5],[7,5],[8,5],[9,5],[10,5],[8,6],[8,7],[7,8],[8,8],[9,8],[7,9],[8,9],[9,9],[8,10],[8,11],[7,12],[8,12],[9,12]],
    leaf: [[7,3],[8,3],[6,4],[7,4],[8,4],[9,4],[5,5],[6,5],[7,5],[8,5],[9,5],[10,5],[5,6],[6,6],[7,6],[8,6],[9,6],[6,7],[7,7],[8,7],[6,8],[7,8],[7,9],[8,9],[8,10],[9,11],[10,12]],
    mushroom: [[6,4],[7,4],[8,4],[9,4],[5,5],[6,5],[7,5],[8,5],[9,5],[10,5],[4,6],[5,6],[6,6],[7,6],[8,6],[9,6],[10,6],[11,6],[5,7],[7,7],[10,7],[7,8],[8,8],[8,9],[7,10],[8,10],[8,11],[7,12],[8,12],[9,12]],
    insect: [[7,3],[8,3],[6,4],[9,4],[7,5],[8,5],[5,6],[7,6],[8,6],[10,6],[4,7],[6,7],[7,7],[8,7],[9,7],[11,7],[5,8],[7,8],[8,8],[10,8],[6,9],[9,9],[7,10],[8,10],[6,11],[9,11]],
    fish: [[5,5],[6,5],[7,5],[8,5],[11,5],[4,6],[5,6],[6,6],[7,6],[8,6],[9,6],[10,6],[12,6],[3,7],[4,7],[5,7],[6,7],[8,7],[9,7],[10,7],[11,7],[12,7],[4,8],[5,8],[6,8],[7,8],[8,8],[9,8],[10,8],[12,8],[5,9],[6,9],[7,9],[8,9],[11,9]],
    bird: [[7,3],[8,3],[6,4],[7,4],[8,4],[9,4],[5,5],[6,5],[7,5],[8,5],[9,5],[10,5],[4,6],[5,6],[6,6],[7,6],[8,6],[9,6],[11,6],[6,7],[7,7],[8,7],[9,7],[10,7],[7,8],[8,8],[9,8],[8,9],[7,10],[9,10],[6,11],[10,11]],
    shell: [[7,3],[8,3],[6,4],[7,4],[8,4],[9,4],[5,5],[6,5],[8,5],[10,5],[4,6],[5,6],[7,6],[9,6],[11,6],[4,7],[6,7],[8,7],[10,7],[12,7],[4,8],[5,8],[7,8],[9,8],[11,8],[5,9],[6,9],[7,9],[8,9],[9,9],[10,9],[6,10],[7,10],[8,10],[9,10],[7,11],[8,11]],
    flower: [[7,3],[8,3],[6,4],[7,4],[8,4],[9,4],[5,5],[6,5],[8,5],[9,5],[10,5],[6,6],[7,6],[8,6],[9,6],[7,7],[8,7],[8,8],[8,9],[6,10],[8,10],[10,10],[7,11],[8,11],[9,11],[8,12]],
    seedpod: [[8,3],[7,4],[8,4],[9,4],[6,5],[7,5],[8,5],[9,5],[10,5],[6,6],[8,6],[10,6],[6,7],[7,7],[8,7],[9,7],[10,7],[7,8],[8,8],[9,8],[8,9],[7,10],[8,10],[9,10],[8,11],[8,12]],
    tree: [[8,2],[7,3],[8,3],[9,3],[6,4],[7,4],[8,4],[9,4],[10,4],[5,5],[6,5],[7,5],[8,5],[9,5],[10,5],[11,5],[6,6],[7,6],[8,6],[9,6],[10,6],[7,7],[8,7],[9,7],[8,8],[8,9],[7,10],[8,10],[9,10],[7,11],[8,11],[9,11],[6,12],[7,12],[8,12],[9,12],[10,12]],
  }[motif] || [];
  return Array.from(
    new Set(
      pixels.map(([x, y]) => {
        const nextX = mirrored ? 15 - x : x;
        return `${Math.min(15, Math.max(0, nextX))},${Math.min(15, Math.max(0, y + jitter))}`;
      }),
    ),
    (entry) => entry.split(",").map(Number),
  );
}

function sanitizeBadgeClaim(value) {
  const source = objectRecord(value);
  return {
    protocol: BADGE_CLAIM_PROTOCOL,
    version: BADGE_CLAIM_VERSION,
    badgeHash: String(source.badgeHash || "").trim(),
    badgeSeedSuite: String(source.badgeSeedSuite || BADGE_SEED_SUITE).trim(),
    forestUrl: normalizeForestUrl(source.forestUrl) || DEFAULT_FOREST_URL,
    shellName: String(source.shellName || "").trim(),
    sourcePublicKey: String(source.sourcePublicKey || "").trim(),
    sourceSiteUrl: String(source.sourceSiteUrl || "").trim(),
    postUrl: String(source.postUrl || "").trim(),
    slug: slugify(source.slug || source.title || "post"),
    title: String(source.title || source.slug || "Untitled post").trim(),
    tags: normalizeClaimTags(source.tags),
    excerpt: String(source.excerpt || "").trim(),
    postDigest: String(source.postDigest || "").trim(),
    postSignature: String(source.postSignature || "").trim(),
    badgeSvgPath: String(source.badgeSvgPath || "").trim(),
    publishedAt: String(source.publishedAt || "").trim(),
    generatedAt: String(source.generatedAt || "").trim(),
    claimedAt: String(source.claimedAt || "").trim(),
    requiredFeatures: [],
    optionalFeatures: normalizeClaimTags(source.optionalFeatures).includes("signature-badge")
      ? normalizeClaimTags(source.optionalFeatures)
      : ["forest-tracker", "signature-badge"],
    extensions: cleanPublicExtensions(source.extensions),
  };
}

function preserveUnknownBadgeState(source) {
  const clean = {};
  for (const [key, value] of Object.entries(source)) {
    if (["schemaVersion", "claims", "settings"].includes(key)) continue;
    clean[key] = cloneJson(value);
  }
  return clean;
}

function cleanPublicExtensions(value) {
  const source = objectRecord(value);
  const clean = {};
  for (const [key, nested] of Object.entries(source)) {
    if (/record|body|private|secret|token|password/iu.test(key)) continue;
    clean[key] = cloneJson(nested);
  }
  return clean;
}

function normalizeBadgePagePath(value) {
  const source = String(value || "/badges/").trim();
  const slug = slugify(source.replace(/^\/|\/$/gu, "") || "badges");
  return `/${slug}/`;
}

function normalizeForestUrl(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  try {
    const url = source.includes("://") ? new URL(source) : new URL(`https://${source}`);
    if (url.protocol !== "https:") return "";
    url.hash = "";
    url.search = "";
    url.pathname = "/";
    return url.toString().replace(/\/$/u, "");
  } catch {
    return "";
  }
}

function badgeClaimKey(claim) {
  return `${claim.sourcePublicKey}\n${claim.postDigest}`;
}

function normalizeClaimTags(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(/[\n,]/u);
  return Array.from(new Set(list.map((item) => String(item || "").trim()).filter(Boolean))).sort();
}

function seedByte(hex, index) {
  const clean = String(hex || "").replace(/[^a-f0-9]/giu, "");
  if (!clean) return 0;
  const offset = (index * 2) % Math.max(clean.length - 1, 1);
  return Number.parseInt(clean.slice(offset, offset + 2).padEnd(2, "0"), 16) || 0;
}

function objectRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cleanArray(value) {
  return Array.isArray(value) ? cloneJson(value) : [];
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
