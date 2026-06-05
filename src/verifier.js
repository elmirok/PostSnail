import { unzipSync } from "../vendor/fflate/browser.js";
import { canonicalJson } from "./canonical.js";
import { decodeText, encodeText } from "./bytes.js";
import { fingerprintForBytes, sha3Hex, textToBytes, verifyBytes } from "./crypto.js";
import {
  manifestHash,
  verifyCommitLog,
  verifyCommitRecord,
  verifyIdentityDocument,
} from "./proof-documents.js";
import {
  COMMITS_PATH,
  DIGEST_SUITE,
  FINGERPRINT_SUITE,
  LATEST_COMMIT_PATH,
  MANIFEST_PATH,
  MANIFEST_VERSION,
  REQUIRED_CORE_FEATURES,
  SIGNATURE_SUITE,
  WELL_KNOWN_PATH,
} from "./protocol.js";
import {
  checkRequiredFeatures,
  collectCompatibilityWarnings,
  protocolMatches,
  protocolVersionFor,
} from "./compatibility.js";

export async function verifyPostSnailZip(zipBytes) {
  const checks = [];
  const errors = [];
  const warnings = [];
  let files;

  try {
    files = unzipSync(zipBytes);
  } catch {
    return failure("Invalid ZIP. Choose a PostSnail-generated .zip file.");
  }

  const manifestBytes = files[MANIFEST_PATH];
  const wellKnownBytes = files[WELL_KNOWN_PATH];
  const latestCommitBytes = files[LATEST_COMMIT_PATH];
  const commitsBytes = files[COMMITS_PATH];
  if (!manifestBytes) {
    return failure("Missing postsnail.manifest.json.");
  }
  addCheck(checks, errors, ".well-known metadata", Boolean(wellKnownBytes), "Missing .well-known/postsnail.json.");

  let manifest;
  try {
    manifest = JSON.parse(decodeText(manifestBytes));
  } catch {
    return failure("postsnail.manifest.json is not valid JSON.");
  }

  const wellKnown = parseWellKnown(wellKnownBytes, checks, errors);
  const latestCommit = parseOptionalJson(latestCommitBytes, checks, errors, "Latest commit", "latest-commit.json is not valid JSON.");
  const commits = parseOptionalJson(commitsBytes, checks, errors, "Commit log", "commits.json is not valid JSON.");

  warnings.push(...collectCompatibilityWarnings(manifest));
  if (wellKnown) warnings.push(...collectCompatibilityWarnings(wellKnown));
  addCheck(checks, errors, "Manifest protocol", !manifest.protocol || protocolMatches(manifest.protocol), "Manifest protocol mismatch.");
  addCheck(checks, errors, "Manifest protocol version", protocolVersionFor(manifest) <= MANIFEST_VERSION, "Unsupported manifest protocol version.");
  addFeatureChecks(manifest, checks, errors, "Manifest");
  addCheck(checks, errors, "Manifest version", Number(manifest.manifestVersion || MANIFEST_VERSION) === MANIFEST_VERSION, "Unsupported manifest version.");
  addCheck(
    checks,
    errors,
    "Manifest digest suite",
    manifest.algorithm?.digest === DIGEST_SUITE,
    "Manifest does not declare SHA3-512 digests.",
  );
  addCheck(
    checks,
    errors,
    "Manifest signature suite",
    manifest.algorithm?.signature === SIGNATURE_SUITE,
    "Manifest does not declare ML-DSA-65 signatures.",
  );
  addCheck(
    checks,
    errors,
    "Manifest fingerprint suite",
    manifest.algorithm?.fingerprint === FINGERPRINT_SUITE,
    "Manifest does not declare psn1-sha3-512 fingerprints.",
  );

  const publicKey = safeBytes(manifest.publicKey);
  addCheck(checks, errors, "Public key", Boolean(publicKey), "Manifest public key is missing or invalid.");

  if (publicKey) {
    const payload = manifestPayload(manifest);
    const manifestSignature = safeBytes(manifest.manifestSignature);
    const manifestOk = Boolean(
      manifestSignature && verifyBytes(encodeText(canonicalJson(payload)), manifestSignature, publicKey),
    );
    addCheck(checks, errors, "Manifest signature", manifestOk, "Manifest signature failed.");
  }

  const postChecks = verifyPosts(manifest, publicKey, checks, errors);
  const fileChecks = verifyFiles(manifest, files, checks, errors);
  const identityOk = verifyWellKnown(manifest, wellKnown, checks, errors, warnings);
  verifyBundleFingerprint(manifest, checks, errors);
  const commitOk = verifyCommitFiles(manifest, latestCommit, commits, checks, errors, warnings);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    checks,
    manifest,
    summary: {
      siteTitle: manifest.site?.siteTitle || "Untitled Microblog",
      handle: manifest.site?.handle || "",
      postCount: postChecks.postCount,
      fileCount: fileChecks.fileCount,
      bundleFingerprint: manifest.bundleFingerprint || "",
      generatedAt: manifest.generatedAt || "",
      zipVerified: errors.length === 0,
      manifestSignatureValid: checks.some((check) => check.label === "Manifest signature" && check.ok),
      postSignaturesValid: postChecks.signaturesValid,
      fileHashesValid: fileChecks.hashesValid,
      identityValid: identityOk,
      domainBinding: domainBindingSummary(manifest, wellKnown),
      commitHistoryValid: commitOk,
      publicKey: manifest.publicKey || "",
    },
  };
}

function verifyPosts(manifest, publicKey, checks, errors) {
  const posts = Array.isArray(manifest.posts) ? manifest.posts : [];
  addCheck(checks, errors, "Post proofs present", posts.length > 0, "Manifest has no post proofs.");
  let signaturesValid = true;
  for (const post of posts) {
    const slug = post.slug || "unknown";
    const recordBytes = encodeText(canonicalJson(post.record));
    const digestOk = sha3Hex(recordBytes) === post.digest;
    addCheck(checks, errors, `Post digest: ${slug}`, digestOk, `Post ${slug} digest mismatch.`);

    const signature = safeBytes(post.signature);
    const signatureOk = Boolean(publicKey && signature && verifyBytes(recordBytes, signature, publicKey));
    if (!signatureOk) signaturesValid = false;
    addCheck(checks, errors, `Post signature: ${slug}`, signatureOk, `Post ${slug} signature failed.`);
  }
  return { postCount: posts.length, signaturesValid };
}

function verifyFiles(manifest, files, checks, errors) {
  const expected = manifest.files && typeof manifest.files === "object" ? manifest.files : {};
  const names = Object.keys(expected);
  addCheck(checks, errors, "File digest list", names.length > 0, "Manifest has no file digest list.");
  let hashesValid = true;
  for (const name of names) {
    const bytes = files[name];
    if (!bytes) {
      hashesValid = false;
      addCheck(checks, errors, `File present: ${name}`, false, `Missing file: ${name}`);
      continue;
    }
    const digestOk = sha3Hex(bytes) === expected[name];
    if (!digestOk) hashesValid = false;
    addCheck(checks, errors, `File hash: ${name}`, digestOk, `File hash mismatch: ${name}`);
  }
  const proofFiles = new Set([MANIFEST_PATH, WELL_KNOWN_PATH, LATEST_COMMIT_PATH, COMMITS_PATH]);
  const extraFiles = Object.keys(files).filter((name) => !Object.hasOwn(expected, name) && !proofFiles.has(name));
  if (extraFiles.length) hashesValid = false;
  addCheck(
    checks,
    errors,
    "No unlisted files",
    extraFiles.length === 0,
    `Unlisted file(s) in ZIP: ${extraFiles.join(", ")}`,
  );
  return { fileCount: names.length, hashesValid };
}

function parseWellKnown(bytes, checks, errors) {
  if (!bytes) return null;
  try {
    const data = JSON.parse(decodeText(bytes));
    addCheck(checks, errors, ".well-known JSON", true, "");
    return data;
  } catch {
    addCheck(checks, errors, ".well-known JSON", false, ".well-known/postsnail.json is not valid JSON.");
    return null;
  }
}

function parseOptionalJson(bytes, checks, errors, label, error) {
  if (!bytes) return null;
  try {
    const data = JSON.parse(decodeText(bytes));
    addCheck(checks, errors, `${label} JSON`, true, "");
    return data;
  } catch {
    addCheck(checks, errors, `${label} JSON`, false, error);
    return null;
  }
}

function verifyWellKnown(manifest, wellKnown, checks, errors, warnings) {
  if (!wellKnown) return false;
  addCheck(checks, errors, ".well-known protocol", protocolMatches(wellKnown.protocol), ".well-known protocol mismatch.");
  addCheck(checks, errors, ".well-known protocol version", protocolVersionFor(wellKnown) <= MANIFEST_VERSION, "Unsupported .well-known protocol version.");
  addFeatureChecks(wellKnown, checks, errors, ".well-known");
  addCheck(
    checks,
    errors,
    ".well-known manifest pointer",
    (wellKnown.manifest || "postsnail.manifest.json") === "postsnail.manifest.json"
      || wellKnown.manifestUrl === manifest.discovery?.canonicalManifestUrl,
    ".well-known manifest pointer mismatch.",
  );
  addCheck(
    checks,
    errors,
    ".well-known public key",
    wellKnown.publicKey === manifest.publicKey,
    ".well-known public key mismatch.",
  );
  addCheck(
    checks,
    errors,
    ".well-known bundle fingerprint",
    wellKnown.bundleFingerprint === manifest.bundleFingerprint,
    ".well-known bundle fingerprint mismatch.",
  );
  addCheck(
    checks,
    errors,
    ".well-known site title",
    wellKnown.siteTitle === manifest.site?.siteTitle,
    ".well-known site title mismatch.",
  );
  addCheck(checks, errors, ".well-known handle", wellKnown.handle === manifest.site?.handle, ".well-known handle mismatch.");
  addCheck(checks, errors, ".well-known site URL", wellKnown.siteUrl === manifest.site?.siteUrl, ".well-known site URL mismatch.");
  addCheck(
    checks,
    errors,
    ".well-known generated time",
    wellKnown.generatedAt === manifest.generatedAt,
    ".well-known generated time mismatch.",
  );
  const identity = verifyIdentityDocument(wellKnown, { manifest, siteUrl: manifest.site?.siteUrl || "" });
  for (const warning of identity.warnings) {
    warnings.push(warning);
    checks.push({ label: "Domain binding", ok: true, warning, error: "" });
  }
  addCheck(checks, errors, "Identity signature", identity.ok, identity.errors.join(" "));
  return identity.ok;
}

function verifyBundleFingerprint(manifest, checks, errors) {
  const expected = fingerprintForBytes(encodeText(canonicalJson({ files: manifest.files, posts: manifest.posts })));
  addCheck(
    checks,
    errors,
    "Bundle fingerprint",
    manifest.bundleFingerprint === expected,
    "Bundle fingerprint mismatch.",
  );
}

function verifyCommitFiles(manifest, latestCommit, commitLog, checks, errors, warnings) {
  if (!latestCommit && !commitLog) {
    warnings.push("No signed commit history found; this may be a legacy PostSnail export.");
    checks.push({ label: "Commit history", ok: true, warning: warnings.at(-1), error: "" });
    return false;
  }
  const context = {
    publicKey: manifest.publicKey,
    manifestHash: manifestHash(manifest),
    bundleFingerprint: manifest.bundleFingerprint,
  };
  let ok = true;
  if (latestCommit) {
    const latest = verifyCommitRecord(latestCommit, context);
    ok &&= latest.ok;
    addCheck(checks, errors, "Latest commit", latest.ok, latest.errors.join(" "));
  } else {
    ok = false;
    addCheck(checks, errors, "Latest commit", false, "Missing latest commit file.");
  }
  if (commitLog) {
    const commits = Array.isArray(commitLog.commits) ? commitLog.commits : [];
    const log = verifyCommitLog(commits, context);
    ok &&= log.ok;
    const latestMatches = commits.length > 0 && canonicalJson(commits.at(-1)) === canonicalJson(latestCommit);
    addCheck(checks, errors, "Commit log", log.ok && latestMatches, log.errors.concat(latestMatches ? [] : ["Latest commit is not the final commit in commits.json."]).join(" "));
  } else {
    ok = false;
    addCheck(checks, errors, "Commit log", false, "Missing commits.json.");
  }
  return ok;
}

function domainBindingSummary(manifest, wellKnown) {
  if (!manifest.site?.siteUrl) return "not declared";
  if (!wellKnown) return "invalid";
  const identity = verifyIdentityDocument(wellKnown, { manifest, siteUrl: manifest.site.siteUrl });
  return identity.ok ? "valid" : "invalid";
}

function manifestPayload(manifest) {
  const { manifestSignature, ...payload } = manifest;
  return payload;
}

function addCheck(checks, errors, label, ok, error) {
  checks.push({ label, ok: Boolean(ok), error: ok ? "" : error });
  if (!ok) errors.push(error);
}

function addFeatureChecks(record, checks, errors, label) {
  const features = checkRequiredFeatures(record, REQUIRED_CORE_FEATURES);
  addCheck(checks, errors, `${label} required features`, features.ok, features.errors.join(" "));
}

function safeBytes(value) {
  try {
    return value ? textToBytes(value) : null;
  } catch {
    return null;
  }
}

function failure(error) {
  return {
    ok: false,
    errors: [error],
    checks: [{ label: "ZIP", ok: false, error }],
    warnings: [],
    manifest: null,
    summary: {
      siteTitle: "",
      handle: "",
      postCount: 0,
      fileCount: 0,
      bundleFingerprint: "",
      generatedAt: "",
      zipVerified: false,
      manifestSignatureValid: false,
      postSignaturesValid: false,
      fileHashesValid: false,
      identityValid: false,
      domainBinding: "invalid",
      commitHistoryValid: false,
      publicKey: "",
    },
  };
}
