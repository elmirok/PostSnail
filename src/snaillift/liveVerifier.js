import { verifyRemoteSite } from "../remote-verifier.js";

export async function verifySnailLiftLiveSite({ siteUrl, exportResult, expectedPublicKey = "", fetcher = fetch } = {}) {
  const errors = [];
  const warnings = [];
  let remote;

  try {
    remote = await verifyRemoteSite(siteUrl, fetcher);
  } catch (error) {
    return { ok: false, errors: [safeMessage(error)], warnings };
  }

  for (const check of remote.checks || []) {
    if (!check.ok) errors.push(check.error || check.label || "Remote verification failed.");
  }

  const expectedFingerprint = exportResult?.bundleFingerprint || exportResult?.manifest?.bundleFingerprint || "";
  const liveFingerprint =
    remote.summary?.bundleFingerprint || remote.manifest?.bundleFingerprint || remote.wellKnown?.bundleFingerprint || "";
  const livePublicKey = remote.summary?.publicKey || remote.manifest?.publicKey || remote.wellKnown?.publicKey || "";
  if (expectedFingerprint && liveFingerprint !== expectedFingerprint) {
    errors.push(`Live bundle fingerprint mismatch. Expected ${expectedFingerprint}, found ${liveFingerprint || "none"}.`);
  }
  if (exportResult?.manifest?.publicKey && remote.manifest?.publicKey !== exportResult.manifest.publicKey) {
    errors.push("Live public key does not match the generated export.");
  }
  if (expectedPublicKey && livePublicKey !== expectedPublicKey) {
    errors.push("Live public key does not match this Shell.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    bundleFingerprint: liveFingerprint,
    manifest: remote.manifest,
    wellKnown: remote.wellKnown,
    latestCommit: remote.latestCommit,
    checks: remote.checks || [],
  };
}

function safeMessage(error) {
  return error instanceof Error ? error.message : "Unable to verify live site.";
}
