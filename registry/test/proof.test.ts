import { describe, expect, test } from "vitest";
import { unzipSync } from "../../vendor/fflate/browser.js";
import { decodeText } from "../../src/bytes.js";
import { normalizePost } from "../../src/content.js";
import { generateSigningKeyPair, publicKeyToText } from "../../src/crypto.js";
import { buildStaticExport } from "../../src/exporter.js";
import { verifyProofDocuments } from "../src/proof";

async function proofFixture() {
  const keys = generateSigningKeyPair();
  const post = normalizePost({
    id: "p1",
    title: "Registry Proof",
    body: "This full body must not be indexed by the registry.",
    tags: ["Registry", "Proof"],
    status: "published",
    createdAt: "2026-06-05T00:00:00.000Z"
  });
  const result = await buildStaticExport({
    profile: {
      siteTitle: "Registry Feed",
      description: "Signed summary feed.",
      handle: "registry-feed",
      siteUrl: "https://creator.example",
      about: "About registry feed."
    },
    posts: [post],
    assets: [],
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
    generatedAt: "2026-06-05T00:00:00.000Z"
  });
  const files = unzipSync(result.zipBytes, {}) as Record<string, Uint8Array>;
  return {
    wellKnown: JSON.parse(decodeText(files[".well-known/postsnail.json"])),
    manifest: JSON.parse(decodeText(files["postsnail.manifest.json"])),
    keys
  };
}

describe("remote PostSnail proof verification", () => {
  test("accepts valid proof documents and extracts summary-only posts", async () => {
    const { wellKnown, manifest } = await proofFixture();
    const verification = verifyProofDocuments("https://creator.example/", wellKnown, manifest);

    expect(verification.ok).toBe(true);
    expect(verification.site.siteTitle).toBe("Registry Feed");
    expect(verification.posts).toHaveLength(1);
    expect(verification.posts[0]).toMatchObject({
      slug: "registry-proof",
      title: "Registry Proof",
      excerpt: "This full body must not be indexed by the registry.",
      tags: ["proof", "registry"],
      url: "https://creator.example/posts/registry-proof/"
    });
    expect("body" in verification.posts[0]).toBe(false);
  });

  test("rejects tampered post records", async () => {
    const { wellKnown, manifest } = await proofFixture();
    manifest.posts[0].record.title = "Changed after signing";

    const verification = verifyProofDocuments("https://creator.example/", wellKnown, manifest);

    expect(verification.ok).toBe(false);
    expect(verification.errors.join("\n")).toMatch(/post registry-proof digest mismatch/i);
    expect(verification.errors.join("\n")).toMatch(/post registry-proof signature failed/i);
  });

  test("rejects mismatched well-known metadata and wrong keys", async () => {
    const { wellKnown, manifest } = await proofFixture();
    wellKnown.bundleFingerprint = "psn1-sha3-512-not-real";
    manifest.publicKey = publicKeyToText(generateSigningKeyPair().publicKey);

    const verification = verifyProofDocuments("https://creator.example/", wellKnown, manifest);

    expect(verification.ok).toBe(false);
    expect(verification.errors.join("\n")).toMatch(/well-known bundle fingerprint mismatch/i);
    expect(verification.errors.join("\n")).toMatch(/manifest signature failed/i);
  });

  test("rejects unsupported manifest versions and missing fields", async () => {
    const { wellKnown, manifest } = await proofFixture();
    manifest.manifestVersion = 99;
    delete manifest.algorithm.digest;
    delete manifest.publicKey;

    const verification = verifyProofDocuments("https://creator.example/", wellKnown, manifest);

    expect(verification.ok).toBe(false);
    expect(verification.errors.join("\n")).toMatch(/unsupported manifest version/i);
    expect(verification.errors.join("\n")).toMatch(/sha3-512/i);
    expect(verification.errors.join("\n")).toMatch(/public key/i);
  });
});
