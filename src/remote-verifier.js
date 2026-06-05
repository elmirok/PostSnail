import { canonicalJson } from "./canonical.js";
import { encodeText } from "./bytes.js";
import { sha3Hex, textToBytes, verifyBytes } from "./crypto.js";
import {
  manifestHash,
  verifyCommitRecord,
  verifyIdentityDocument,
} from "./proof-documents.js";
import { checkRequiredFeatures, protocolMatches, protocolVersionFor } from "./compatibility.js";
import { MANIFEST_VERSION, REQUIRED_CORE_FEATURES } from "./protocol.js";

export async function verifyRemoteSite(siteUrl, fetcher = fetch) {
  const checks = [];
  const normalized = normalizeRemoteSiteUrl(siteUrl);
  const wellKnownUrl = new URL(".well-known/postsnail.json", normalized).toString();
  let wellKnown;
  let manifest;
  let latestCommit = null;
  try {
    wellKnown = await fetchJson(wellKnownUrl, fetcher);
    const manifestUrl = sameOriginUrl(normalized, wellKnown.manifestUrl || wellKnown.manifest || "postsnail.manifest.json").toString();
    manifest = await fetchJson(manifestUrl, fetcher);
    add(checks, "Well-known fetched", true);
    add(checks, "Manifest fetched", true);
    const identity = verifyIdentityDocument(wellKnown, { manifest, siteUrl: normalized });
    add(checks, "Identity valid", identity.ok, identity.errors.concat(identity.warnings).join(" "));
    const featureCheck = checkRequiredFeatures(manifest, REQUIRED_CORE_FEATURES);
    add(checks, "Manifest protocol valid", !manifest.protocol || protocolMatches(manifest.protocol), "Manifest protocol mismatch.");
    add(checks, "Manifest version supported", protocolVersionFor(manifest) <= MANIFEST_VERSION, "Unsupported manifest protocol version.");
    add(checks, "Manifest required features supported", featureCheck.ok, featureCheck.errors.join(" "));

    const manifestPayload = { ...manifest };
    const signature = safeBytes(manifestPayload.manifestSignature);
    delete manifestPayload.manifestSignature;
    const publicKey = safeBytes(manifest.publicKey);
    const manifestOk = Boolean(signature && publicKey && verifyBytes(encodeText(canonicalJson(manifestPayload)), signature, publicKey));
    add(checks, "Manifest signature valid", manifestOk, "Manifest signature failed.");

    if (wellKnown.latestCommitUrl) {
      latestCommit = await fetchJson(sameOriginUrl(normalized, wellKnown.latestCommitUrl).toString(), fetcher);
      const commit = verifyCommitRecord(latestCommit, {
        publicKey: manifest.publicKey,
        manifestHash: manifestHash(manifest),
        bundleFingerprint: manifest.bundleFingerprint,
      });
      add(checks, "Latest commit valid", commit.ok, commit.errors.join(" "));
    } else {
      add(checks, "Latest commit valid", true, "No latest commit declared.");
    }
    return {
      ok: checks.every((check) => check.ok),
      checks,
      summary: {
        siteUrl: normalized,
        siteTitle: manifest.site?.siteTitle || wellKnown.siteTitle || "",
        bundleFingerprint: manifest.bundleFingerprint || "",
        publicKey: manifest.publicKey || "",
        manifestHash: manifest ? sha3Hex(encodeText(canonicalJson(manifest))) : "",
      },
      wellKnown,
      manifest,
      latestCommit,
    };
  } catch (error) {
    const message = error instanceof TypeError
      ? "Remote verification was blocked. The site may need CORS headers that allow this verifier to fetch public proof files."
      : error.message;
    add(checks, "Remote fetch", false, message);
    return {
      ok: false,
      checks,
      summary: { siteUrl: normalized, siteTitle: "", bundleFingerprint: "", publicKey: "", manifestHash: "" },
      wellKnown,
      manifest,
      latestCommit,
    };
  }
}

function normalizeRemoteSiteUrl(value) {
  const url = new URL(String(value || ""));
  if (url.protocol !== "https:") throw new Error("Enter a public https site URL.");
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
  return url.toString();
}

function sameOriginUrl(siteUrl, pointer) {
  const base = new URL(siteUrl);
  const next = new URL(String(pointer || ""), base);
  if (next.origin !== base.origin) throw new Error("Proof URL moved off the creator origin.");
  return next;
}

async function fetchJson(url, fetcher) {
  const response = await fetcher(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("Proof document could not be fetched.");
  return response.json();
}

function safeBytes(value) {
  try {
    return value ? textToBytes(value) : null;
  } catch {
    return null;
  }
}

function add(checks, label, ok, error = "") {
  checks.push({ label, ok: Boolean(ok), error: ok ? "" : error });
}
