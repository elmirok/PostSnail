import test from "node:test";
import assert from "node:assert/strict";

import { buildStaticExport } from "../src/exporter.js";
import { verifyRemoteSite } from "../src/remote-verifier.js";
import { generateSigningKeyPair } from "../src/crypto.js";
import { normalizePost } from "../src/content.js";

test("verifyRemoteSite verifies signed public proof metadata", async () => {
  const keys = generateSigningKeyPair();
  const post = normalizePost({
    id: "remote-1",
    title: "Remote proof",
    body: "A signed remote verification fixture.",
    status: "published",
    createdAt: "2026-06-05T00:00:00.000Z",
  });
  const result = await buildStaticExport({
    profile: {
      siteTitle: "Remote Feed",
      description: "Remote verification fixture.",
      handle: "remote",
      siteUrl: "https://remote.example/",
    },
    posts: [post],
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
    generatedAt: "2026-06-05T00:00:00.000Z",
  });
  const fetcher = async (url) => {
    if (url === "https://remote.example/.well-known/postsnail.json") {
      return jsonResponse(result.wellKnown);
    }
    if (url === "https://remote.example/postsnail.manifest.json") {
      return jsonResponse(result.manifest);
    }
    if (url === "https://remote.example/.well-known/postsnail/latest-commit.json") {
      return jsonResponse(result.latestCommit);
    }
    return new Response("Not found", { status: 404 });
  };

  const verification = await verifyRemoteSite("https://remote.example/", fetcher);

  assert.equal(verification.ok, true);
  assert.equal(verification.summary.siteTitle, "Remote Feed");
  assert.equal(verification.summary.bundleFingerprint, result.manifest.bundleFingerprint);
  assert.equal(verification.checks.every((check) => check.ok), true);
});

test("verifyRemoteSite rejects non-HTTPS public URLs", async () => {
  await assert.rejects(
    () => verifyRemoteSite("http://example.com/", async () => jsonResponse({})),
    /public https site URL/u,
  );
});

function jsonResponse(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
