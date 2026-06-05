import { unzipSync } from "../vendor/fflate/browser.js";
import { canonicalJson } from "./canonical.js";
import { decodeText, encodeText } from "./bytes.js";
import { fingerprintForBytes, sha3Hex, textToBytes, verifyBytes } from "./crypto.js";

export async function verifyPostSnailZip(zipBytes) {
  const checks = [];
  const errors = [];
  let files;

  try {
    files = unzipSync(zipBytes);
  } catch {
    return failure("Invalid ZIP. Choose a PostSnail-generated .zip file.");
  }

  const manifestBytes = files["postsnail.manifest.json"];
  const wellKnownBytes = files[".well-known/postsnail.json"];
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

  addCheck(checks, errors, "Manifest version", manifest.manifestVersion === 1, "Unsupported manifest version.");
  addCheck(
    checks,
    errors,
    "Digest algorithm",
    manifest.algorithm?.digest === "SHA3-512",
    "Manifest does not declare SHA3-512 digests.",
  );
  addCheck(
    checks,
    errors,
    "Signature algorithm",
    manifest.algorithm?.signature === "ML-DSA-65",
    "Manifest does not declare ML-DSA-65 signatures.",
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
  verifyWellKnown(manifest, wellKnown, checks, errors);
  verifyBundleFingerprint(manifest, checks, errors);

  return {
    ok: errors.length === 0,
    errors,
    checks,
    manifest,
    summary: {
      siteTitle: manifest.site?.siteTitle || "Untitled Microblog",
      handle: manifest.site?.handle || "",
      postCount: postChecks.postCount,
      fileCount: fileChecks.fileCount,
      bundleFingerprint: manifest.bundleFingerprint || "",
      generatedAt: manifest.generatedAt || "",
    },
  };
}

function verifyPosts(manifest, publicKey, checks, errors) {
  const posts = Array.isArray(manifest.posts) ? manifest.posts : [];
  addCheck(checks, errors, "Post proofs present", posts.length > 0, "Manifest has no post proofs.");
  for (const post of posts) {
    const slug = post.slug || "unknown";
    const recordBytes = encodeText(canonicalJson(post.record));
    const digestOk = sha3Hex(recordBytes) === post.digest;
    addCheck(checks, errors, `Post digest: ${slug}`, digestOk, `Post ${slug} digest mismatch.`);

    const signature = safeBytes(post.signature);
    const signatureOk = Boolean(publicKey && signature && verifyBytes(recordBytes, signature, publicKey));
    addCheck(checks, errors, `Post signature: ${slug}`, signatureOk, `Post ${slug} signature failed.`);
  }
  return { postCount: posts.length };
}

function verifyFiles(manifest, files, checks, errors) {
  const expected = manifest.files && typeof manifest.files === "object" ? manifest.files : {};
  const names = Object.keys(expected);
  addCheck(checks, errors, "File digest list", names.length > 0, "Manifest has no file digest list.");
  for (const name of names) {
    const bytes = files[name];
    if (!bytes) {
      addCheck(checks, errors, `File present: ${name}`, false, `Missing file: ${name}`);
      continue;
    }
    const digestOk = sha3Hex(bytes) === expected[name];
    addCheck(checks, errors, `File hash: ${name}`, digestOk, `File hash mismatch: ${name}`);
  }
  const proofFiles = new Set(["postsnail.manifest.json", ".well-known/postsnail.json"]);
  const extraFiles = Object.keys(files).filter((name) => !Object.hasOwn(expected, name) && !proofFiles.has(name));
  addCheck(
    checks,
    errors,
    "No unlisted files",
    extraFiles.length === 0,
    `Unlisted file(s) in ZIP: ${extraFiles.join(", ")}`,
  );
  return { fileCount: names.length };
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

function verifyWellKnown(manifest, wellKnown, checks, errors) {
  if (!wellKnown) return;
  addCheck(checks, errors, ".well-known protocol", wellKnown.protocol === "postsnail-v1", ".well-known protocol mismatch.");
  addCheck(
    checks,
    errors,
    ".well-known manifest pointer",
    wellKnown.manifest === "postsnail.manifest.json",
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

function manifestPayload(manifest) {
  const { manifestSignature, ...payload } = manifest;
  return payload;
}

function addCheck(checks, errors, label, ok, error) {
  checks.push({ label, ok: Boolean(ok), error: ok ? "" : error });
  if (!ok) errors.push(error);
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
    manifest: null,
    summary: {
      siteTitle: "",
      handle: "",
      postCount: 0,
      fileCount: 0,
      bundleFingerprint: "",
      generatedAt: "",
    },
  };
}
