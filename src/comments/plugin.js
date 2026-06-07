import { canonicalJson } from "../canonical.js";
import { encodeText } from "../bytes.js";
import { checkRequiredFeatures } from "../compatibility.js";
import { buildExcerpt, slugify } from "../content.js";
import {
  publicKeyToText,
  sha3Hex,
  signBytes,
  signatureToText,
  textToBytes,
  verifyBytes,
} from "../crypto.js";

export const POSTSNAIL_COMMENTS_PLUGIN_ID = "postsnail-comments";
export const COMMENTS_PLUGIN_VERSION = "0.1.0";
export const COMMENTS_SCHEMA_VERSION = 1;
export const COMMENTS_PLUGIN_PROTOCOL = "postsnail-comment-v1";
export const STATIC_COMMENTS_PROTOCOL = "postsnail-comments-static-v1";
export const COMMENT_REQUIRED_FEATURES = ["signed-comment"];

export function normalizeCommentsPluginState(value = {}) {
  const source = objectRecord(value);
  return {
    ...cloneObject(source),
    schemaVersion: COMMENTS_SCHEMA_VERSION,
    trackerUrls: normalizeTrackerUrls(source.trackerUrls),
    allowLiveReplies: source.allowLiveReplies !== false && source.allowLiveReplies !== "false",
    lastImportedAt: String(source.lastImportedAt || "").trim(),
    lastVerifiedCommentId: String(source.lastVerifiedCommentId || "").trim(),
  };
}

export function normalizeTrackerUrls(value = []) {
  const list = Array.isArray(value) ? value : String(value || "").split(/[\n,]/u);
  const seen = new Set();
  const result = [];
  for (const item of list) {
    const normalized = normalizeTrackerUrl(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function normalizeTrackerUrl(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  try {
    const url = source.includes("://") ? new URL(source) : new URL(`https://${source}`);
    if (url.protocol !== "https:") return "";
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/u, "");
  } catch {
    return "";
  }
}

export function buildCommentPacket(payload = {}) {
  const normalized = normalizeCommentPacket(payload);
  const unsigned = commentUnsignedPayload(normalized);
  const commentId = commentIdForPayload(unsigned);
  return {
    ...unsigned,
    commentId,
  };
}

export function signCommentPacket(payload, secretKey) {
  const packet = buildCommentPacket(payload);
  return {
    ...packet,
    signature: signatureToText(signBytes(
      encodeText(canonicalJson(signableCommentPayload(packet))),
      secretKey,
    )),
  };
}

export function verifyCommentPacket(packet, options = {}) {
  const errors = [];
  const normalized = normalizeCommentPacket(packet);
  if (normalized.protocol !== COMMENTS_PLUGIN_PROTOCOL) {
    errors.push("Comment protocol must be postsnail-comment-v1.");
  }
  if (normalized.version !== 1) {
    errors.push(normalized.version > 1
      ? "Comment record was created by a newer PostSnail version."
      : "Unsupported comment version.");
  }
  if (normalized.type !== "postsnail_comment") {
    errors.push("Comment type must be postsnail_comment.");
  }

  const featureCheck = checkRequiredFeatures(normalized, COMMENT_REQUIRED_FEATURES);
  errors.push(...featureCheck.errors);

  const expectedCommentId = commentIdForPayload(commentUnsignedPayload(normalized));
  if (normalized.commentId !== expectedCommentId) {
    errors.push("Comment id does not match the canonical unsigned payload.");
  }
  if (!normalized.signature.startsWith("base64:")) {
    errors.push("Comment signature is required.");
  }
  if (!normalized.author.publicKey.startsWith("base64:")) {
    errors.push("Comment author public key is required.");
  }
  if (!normalized.target.sitePublicKey.startsWith("base64:")) {
    errors.push("Comment target site public key is required.");
  }
  if (!normalized.target.postSlug) {
    errors.push("Comment target post slug is required.");
  }
  if (!normalized.target.postDigest) {
    errors.push("Comment target post digest is required.");
  }
  if (!normalized.content.body) {
    errors.push("Comment body is required.");
  }

  const expectedSitePublicKey = String(options.sitePublicKey || "").trim();
  const expectedPostSlug = String(options.postSlug || "").trim();
  const expectedPostDigest = String(options.postDigest || "").trim();
  if (expectedSitePublicKey && normalized.target.sitePublicKey !== expectedSitePublicKey) {
    errors.push("Comment target site public key does not match this Shell.");
  }
  if (expectedPostSlug && normalized.target.postSlug !== expectedPostSlug) {
    errors.push("Comment target post slug does not match the selected post.");
  }
  if (expectedPostDigest && normalized.target.postDigest !== expectedPostDigest) {
    errors.push("Comment target post digest does not match the selected post.");
  }

  const signatureOk = errors.length === 0 && verifyBytes(
    encodeText(canonicalJson(signableCommentPayload(normalized))),
    textToBytes(normalized.signature),
    textToBytes(normalized.author.publicKey),
  );
  if (errors.length === 0 && !signatureOk) {
    errors.push("Comment signature could not be verified.");
  }

  return {
    ok: errors.length === 0,
    errors,
    comment: normalized,
    targetHash: targetHashForComment(normalized),
  };
}

export function createApprovedCommentRecord(packet, options = {}) {
  const verified = verifyCommentPacket(packet, options);
  if (!verified.ok) {
    throw new Error(verified.errors[0] || "Comment could not be verified.");
  }
  return {
    comment: verified.comment,
    approvedAt: String(options.approvedAt || new Date().toISOString()),
    approvedBySitePublicKey: String(options.sitePublicKey || verified.comment.target.sitePublicKey),
    source: String(options.source || "manual-review"),
  };
}

export function createRejectedCommentRecord(packet, options = {}) {
  const verified = verifyCommentPacket(packet, options);
  if (!verified.ok) {
    throw new Error(verified.errors[0] || "Comment could not be verified.");
  }
  return {
    comment: verified.comment,
    rejectedAt: String(options.rejectedAt || new Date().toISOString()),
    moderationNote: String(options.moderationNote || "").trim(),
    source: String(options.source || "manual-review"),
  };
}

export function commentSummary(comment) {
  const normalized = normalizeCommentPacket(comment);
  return {
    commentId: normalized.commentId,
    postSlug: normalized.target.postSlug,
    authorName: normalized.author.displayName || normalized.author.handle || "Unknown author",
    authorKey: normalized.author.publicKey,
    createdAt: normalized.createdAt,
    excerpt: buildExcerpt(normalized.content.body, 120),
  };
}

export function buildApprovedCommentsExport({ moderation = {}, sitePublicKey, secretKey, generatedAt = new Date().toISOString() }) {
  const approvedEntries = normalizeApprovedEntries(moderation.approvedComments)
    .filter((entry) => verifyCommentPacket(entry.comment).ok)
    .sort((a, b) => String(a.approvedAt || "").localeCompare(String(b.approvedAt || "")));
  return {
    protocol: STATIC_COMMENTS_PROTOCOL,
    version: 1,
    generatedAt,
    sitePublicKey,
    requiredFeatures: [],
    optionalFeatures: ["approval-signatures"],
    extensions: {},
    comments: approvedEntries.map((entry) => ({
      comment: entry.comment,
      approvedAt: String(entry.approvedAt || generatedAt),
      approvedBySitePublicKey: sitePublicKey,
      approvalSignature: signatureToText(signBytes(
        encodeText(canonicalJson(approvalPayload(entry.comment, sitePublicKey, entry.approvedAt || generatedAt))),
        secretKey,
      )),
    })),
  };
}

export function buildCommentsPluginPublicManifest(state = {}) {
  const normalized = normalizeCommentsPluginState(state);
  return {
    protocol: "postsnail-plugin-v1",
    id: POSTSNAIL_COMMENTS_PLUGIN_ID,
    name: "PostSnail Comments",
    version: COMMENTS_PLUGIN_VERSION,
    requiredFeatures: [],
    optionalFeatures: ["comments"],
    extensions: {
      trackerUrls: normalized.trackerUrls,
      allowLiveReplies: normalized.allowLiveReplies,
    },
  };
}

export function buildCommentsPublicData({ pluginState = {}, moderation = {}, sitePublicKey, secretKey, postProofs = [], generatedAt = new Date().toISOString() }) {
  const state = normalizeCommentsPluginState(pluginState);
  const digestBySlug = new Map(
    postProofs.map((proof) => [String(proof.slug || "").trim(), String(proof.digest || "").trim()]),
  );
  const approvedEntries = normalizeApprovedEntries(moderation.approvedComments)
    .filter((entry) => {
      const verification = verifyCommentPacket(entry.comment, { sitePublicKey });
      if (!verification.ok) return false;
      const expectedDigest = digestBySlug.get(entry.comment.target.postSlug);
      return Boolean(expectedDigest && expectedDigest === entry.comment.target.postDigest);
    })
    .sort((a, b) => String(a.approvedAt || "").localeCompare(String(b.approvedAt || "")));
  const approvedExport = buildApprovedCommentsExport({
    moderation: { approvedComments: approvedEntries },
    sitePublicKey,
    secretKey,
    generatedAt,
  });

  return {
    enabled: true,
    state,
    approvedEntries,
    approvedExport,
    pluginManifest: buildCommentsPluginPublicManifest(state),
    publicFiles: [
      "/plugins/postsnail-comments/runtime/comments.js",
      "/plugins/postsnail-comments/runtime/comments.css",
      "/plugins/postsnail-comments/approved-comments.json",
      "/plugins/postsnail-comments/plugin-manifest.json",
    ],
  };
}

export function commentsRuntimeScript() {
  return `
const root = document.getElementById("postsnail-comments");
if (root) bootComments(root).catch((error) => {
  root.innerHTML = '<div class="ps-comments-note">Comments could not load.</div>';
  console.error(error);
});

async function bootComments(root) {
  const meta = readMeta();
  if (!meta.enabled) {
    root.innerHTML = "";
    return;
  }
  root.innerHTML = '<div class="ps-comments-loading">Loading comments...</div>';
  const approvedUrl = new URL("../approved-comments.json", import.meta.url);
  let approved = [];
  try {
    const response = await fetch(approvedUrl, { credentials: "omit" });
    if (response.ok) {
      const payload = await response.json();
      approved = Array.isArray(payload.comments) ? payload.comments.filter((entry) => matchesTarget(entry && entry.comment, meta)) : [];
    }
  } catch {}

  root.innerHTML = renderComments(meta, approved);
}

function readMeta() {
  return {
    enabled: metaValue("postsnail:comments-enabled") === "true",
    sitePublicKey: metaValue("postsnail:site-public-key"),
    postSlug: metaValue("postsnail:post-slug"),
    postDigest: metaValue("postsnail:post-digest"),
    trackers: metaValue("postsnail:comment-trackers").split(",").map((item) => item.trim()).filter(Boolean),
  };
}

function metaValue(name) {
  return document.querySelector('meta[name="' + name + '"]')?.content || "";
}

function matchesTarget(comment, meta) {
  return Boolean(
    comment &&
    comment.target &&
    comment.target.sitePublicKey === meta.sitePublicKey &&
    comment.target.postSlug === meta.postSlug &&
    comment.target.postDigest === meta.postDigest,
  );
}

function renderComments(meta, approved) {
  const approvedMarkup = approved.length
    ? approved.map((entry) => renderApprovedEntry(entry)).join("")
    : '<p class="ps-comments-empty">No approved comments yet.</p>';
  const trackersMarkup = meta.trackers.length
    ? '<ul class="ps-comments-trackers">' + meta.trackers.map((url) => '<li><a href="' + escapeAttr(url) + '" rel="noopener noreferrer">' + escapeHtml(url) + '</a></li>').join("") + '</ul>'
    : '<p class="ps-comments-empty">No live trackers configured.</p>';
  return [
    '<section class="ps-comments-shell">',
    '<div class="ps-comments-section">',
    '<h2>Approved comments</h2>',
    approvedMarkup,
    '</div>',
    '<div class="ps-comments-section">',
    '<h2>Live signed replies</h2>',
    '<p class="ps-comments-note">Live signed replies are not part of the static approval set. Compatible trackers may expose them separately.</p>',
    trackersMarkup,
    '</div>',
    '</section>',
  ].join("");
}

function renderApprovedEntry(entry) {
  const comment = entry.comment || {};
  const author = comment.author || {};
  const content = comment.content || {};
  return [
    '<article class="ps-comment">',
    '<header class="ps-comment-head">',
    '<strong>' + escapeHtml(author.displayName || author.handle || "Unknown author") + '</strong>',
    '<span>' + escapeHtml(formatDate(entry.approvedAt || comment.createdAt || "")) + '</span>',
    '</header>',
    author.shellName ? '<p class="ps-comment-meta">' + escapeHtml(author.shellName) + '</p>' : '',
    '<div class="ps-comment-body">' + renderBody(content.body || "") + '</div>',
    '</article>',
  ].join("");
}

function renderBody(text) {
  return String(text || "")
    .split(/\\n{2,}/u)
    .map((paragraph) => '<p>' + escapeHtml(paragraph).replace(/\\n/gu, "<br>") + '</p>')
    .join("");
}

function formatDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/gu, "&#39;");
}
`.trimStart();
}

export function commentsRuntimeCss() {
  return `
#postsnail-comments {
  margin-top: 2.2rem;
  border-top: 1px solid rgba(8, 10, 47, 0.14);
  padding-top: 1.5rem;
}

.ps-comments-shell {
  display: grid;
  gap: 1rem;
}

.ps-comments-section {
  display: grid;
  gap: 0.8rem;
}

.ps-comments-section h2 {
  margin: 0;
  font-size: 1rem;
}

.ps-comment {
  border: 1px solid rgba(8, 10, 47, 0.12);
  background: rgba(255, 255, 255, 0.72);
  padding: 0.9rem 1rem;
}

.ps-comment-head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.9rem;
}

.ps-comment-meta,
.ps-comments-note,
.ps-comments-empty {
  margin: 0;
  color: rgba(8, 10, 47, 0.7);
  font-size: 0.92rem;
}

.ps-comment-body p {
  margin: 0.45rem 0 0;
}

.ps-comments-trackers {
  margin: 0;
  padding-left: 1rem;
}

.ps-comments-trackers a {
  color: inherit;
}
`.trimStart();
}

export function targetHashForComment(comment) {
  const normalized = normalizeCommentPacket(comment);
  return targetHashForTarget(normalized.target);
}

export function targetHashForTarget(target = {}) {
  const normalized = normalizeCommentTarget(target);
  return `psnct-sha3-512-${sha3Hex(encodeText([
    normalized.sitePublicKey,
    normalized.postSlug,
    normalized.postDigest,
  ].join("|")))}`;
}

export function slugToCommentsFeature(post) {
  const slug = slugify(post?.slug || post?.title || "");
  return slug ? `comments:${slug}` : "";
}

function normalizeCommentPacket(value = {}) {
  const source = objectRecord(value);
  return {
    protocol: String(source.protocol || COMMENTS_PLUGIN_PROTOCOL).trim(),
    version: Number.isFinite(Number(source.version)) ? Number(source.version) : 1,
    type: String(source.type || "postsnail_comment").trim(),
    commentId: String(source.commentId || "").trim(),
    target: normalizeCommentTarget(source.target),
    author: normalizeCommentAuthor(source.author),
    content: normalizeCommentContent(source.content),
    createdAt: String(source.createdAt || "").trim(),
    parentCommentId: String(source.parentCommentId || "").trim(),
    requiredFeatures: arrayOfStrings(source.requiredFeatures).length
      ? arrayOfStrings(source.requiredFeatures)
      : [...COMMENT_REQUIRED_FEATURES],
    optionalFeatures: arrayOfStrings(source.optionalFeatures),
    extensions: cloneObject(source.extensions),
    signatureSuite: String(source.signatureSuite || "ML-DSA-65").trim(),
    digestSuite: String(source.digestSuite || "SHA3-512").trim(),
    signature: String(source.signature || "").trim(),
  };
}

function normalizeCommentTarget(value = {}) {
  const source = objectRecord(value);
  return {
    sitePublicKey: String(source.sitePublicKey || "").trim(),
    postSlug: String(source.postSlug || "").trim(),
    postDigest: String(source.postDigest || "").trim(),
    bundleFingerprint: String(source.bundleFingerprint || "").trim(),
  };
}

function normalizeCommentAuthor(value = {}) {
  const source = objectRecord(value);
  return {
    displayName: String(source.displayName || "").trim(),
    handle: String(source.handle || "").trim(),
    siteUrl: String(source.siteUrl || "").trim(),
    shellName: String(source.shellName || "").trim(),
    publicKey: String(source.publicKey || "").trim(),
  };
}

function normalizeCommentContent(value = {}) {
  const source = objectRecord(value);
  return {
    format: String(source.format || "markdown").trim(),
    body: String(source.body || "").trim(),
  };
}

function commentUnsignedPayload(comment) {
  const normalized = normalizeCommentPacket(comment);
  return {
    protocol: normalized.protocol,
    version: normalized.version,
    type: normalized.type,
    target: normalized.target,
    author: normalized.author,
    content: normalized.content,
    createdAt: normalized.createdAt,
    parentCommentId: normalized.parentCommentId,
    requiredFeatures: normalized.requiredFeatures,
    optionalFeatures: normalized.optionalFeatures,
    extensions: normalized.extensions,
    signatureSuite: normalized.signatureSuite,
    digestSuite: normalized.digestSuite,
  };
}

function commentIdForPayload(payload) {
  return `psnc-sha3-512-${sha3Hex(encodeText(canonicalJson(payload)))}`;
}

function signableCommentPayload(comment) {
  const unsigned = commentUnsignedPayload(comment);
  return {
    ...unsigned,
    commentId: commentIdForPayload(unsigned),
  };
}

function approvalPayload(comment, sitePublicKey, approvedAt) {
  return {
    protocol: STATIC_COMMENTS_PROTOCOL,
    version: 1,
    commentId: String(comment?.commentId || "").trim(),
    approvedAt: String(approvedAt || "").trim(),
    approvedBySitePublicKey: String(sitePublicKey || "").trim(),
  };
}

function normalizeApprovedEntries(value = []) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const source = objectRecord(entry);
      const comment = source.comment ? normalizeCommentPacket(source.comment) : null;
      if (!comment) return null;
      return {
        comment,
        approvedAt: String(source.approvedAt || "").trim(),
      };
    })
    .filter(Boolean);
}

function objectRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cloneObject(value) {
  return JSON.parse(JSON.stringify(objectRecord(value)));
}

function arrayOfStrings(value = []) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const text = String(item || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}
