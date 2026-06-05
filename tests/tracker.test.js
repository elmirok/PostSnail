import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync } from "../vendor/fflate/browser.js";

import { decodeText } from "../src/bytes.js";
import { normalizePost } from "../src/content.js";
import { generateSigningKeyPair } from "../src/crypto.js";
import { buildStaticExport } from "../src/exporter.js";
import { POSTSNAIL_PROTOCOL } from "../src/protocol.js";
import { createTrackerApp } from "../tracker/src/app.js";

async function fixtureSite() {
  const keys = generateSigningKeyPair();
  const post = normalizePost({
    id: "p1",
    title: "Tracked Post",
    body: "A public summary for trackers.",
    tags: ["tracker"],
    status: "published",
    createdAt: "2026-06-05T00:00:00.000Z",
  });
  const result = await buildStaticExport({
    profile: {
      siteTitle: "Tracked Feed",
      description: "A tracked static feed.",
      handle: "tracked-feed",
      siteUrl: "https://creator.example",
      about: "",
    },
    posts: [post],
    assets: [],
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
    generatedAt: "2026-06-05T00:00:00.000Z",
  });
  const files = unzipSync(result.zipBytes);
  return {
    announcePayload: result.announcePayload,
    wellKnown: decodeText(files[".well-known/postsnail.json"]),
    manifest: decodeText(files["postsnail.manifest.json"]),
  };
}

test("tracker accepts a valid announce, verifies proof documents, and serves public indexes", async () => {
  const fixture = await fixtureSite();
  const tracker = createTrackerApp({
    fetcher: async (url) => {
      if (String(url) === "https://creator.example/.well-known/postsnail.json") return new Response(fixture.wellKnown);
      if (String(url) === "https://creator.example/postsnail.manifest.json") return new Response(fixture.manifest);
      return new Response("missing", { status: 404 });
    },
  });

  const announced = await tracker.fetch(new Request("https://tracker.example/announce", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(fixture.announcePayload),
  }));
  assert.equal(announced.status, 202);
  assert.match(await announced.text(), /accepted/);

  const health = await tracker.fetch(new Request("https://tracker.example/health"));
  assert.deepEqual(await health.json(), { ok: true, service: "postsnail-tracker", protocol: POSTSNAIL_PROTOCOL });

  const recent = await tracker.fetch(new Request("https://tracker.example/recent.json"));
  const recentJson = await recent.json();
  assert.equal(recentJson.items.length, 1);
  assert.equal(recentJson.items[0].domain, "creator.example");

  const exported = await tracker.fetch(new Request("https://tracker.example/export/blogs.json"));
  const exportedJson = await exported.json();
  assert.equal(exportedJson.blogs.length, 1);
  assert.equal(exportedJson.blogs[0].siteTitle, "Tracked Feed");
});

test("tracker rejects malformed or unverifiable announce payloads", async () => {
  const fixture = await fixtureSite();
  const tracker = createTrackerApp({
    fetcher: async () => new Response(fixture.wellKnown),
  });

  const badShape = await tracker.fetch(new Request("https://tracker.example/announce", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ siteUrl: "https://creator.example/" }),
  }));
  assert.equal(badShape.status, 400);

  const tampered = await tracker.fetch(new Request("https://tracker.example/announce", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...fixture.announcePayload, bundleFingerprint: "psn1-sha3-512-tampered" }),
  }));
  assert.equal(tampered.status, 400);
});
