import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync } from "../vendor/fflate/browser.js";

import { decodeText } from "../src/bytes.js";
import { normalizePost } from "../src/content.js";
import { generateSigningKeyPair } from "../src/crypto.js";
import { buildStaticExport } from "../src/exporter.js";
import { exportWorkspaceVault, importWorkspaceVault } from "../src/workspace.js";
import {
  BADGE_HASH_PREFIX,
  badgeClaimFileName,
  badgeHashForSignature,
  createSignatureBadge,
  importBadgeClaim,
  normalizeBadgesState,
  POSTSNAIL_BADGES_PLUGIN_ID,
  verifyBadgeClaim,
} from "../src/badges/plugin.js";
import { enablePlugin, installPlugin } from "../src/core/plugins/pluginRegistry.js";
import { getOfficialPluginManifest } from "../src/core/plugins/officialCatalog.js";

const now = "2026-06-05T12:00:00.000Z";

function post() {
  return normalizePost({
    id: "p1",
    title: "Collectible Proof",
    body: "A public post that readers can collect as a badge.",
    tags: ["proof", "badge"],
    status: "published",
    createdAt: now,
  });
}

async function badgeFixture() {
  const keys = generateSigningKeyPair();
  const result = await buildStaticExport({
    profile: {
      siteTitle: "Badge Site",
      description: "Collectible proof seals.",
      handle: "badge-site",
      siteUrl: "https://badges.example",
    },
    posts: [post()],
    settings: { showPoweredBy: false, preferredTrackers: "https://forest.postsnail.org" },
    shellNames: [{ forest: "forest.postsnail.org", name: "badges", fullName: "@badges@forest.postsnail.org", record: { protocol: "postsnail-shellname" } }],
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
    generatedAt: now,
  });
  const files = unzipSync(result.zipBytes);
  const claimPath = Object.keys(files).find((name) => /^badges\/claims\/collectible-proof\.postsnail\.badge\.[a-f0-9]{32}\.json$/u.test(name));
  assert.ok(claimPath, "expected hashed badge claim filename");
  const claim = JSON.parse(decodeText(files[claimPath]));
  return { result, files, claim, claimPath, keys };
}

test("signature badges are deterministic two-color safe SVGs", async () => {
  const { claim } = await badgeFixture();
  const first = createSignatureBadge(claim.postSignature);
  const second = createSignatureBadge(claim.postSignature);
  const other = createSignatureBadge(`${claim.postSignature.slice(0, -4)}AAAA`);

  assert.equal(first.svg, second.svg);
  assert.notEqual(first.badgeHash, other.badgeHash);
  assert.match(first.badgeHash, new RegExp(`^${BADGE_HASH_PREFIX}[a-f0-9]{128}$`));
  assert.equal(first.badgeHash, badgeHashForSignature(claim.postSignature));
  assert.match(first.svg, /<metadata>/);
  assert.match(first.svg, new RegExp(first.badgeHash));
  assert.doesNotMatch(first.svg, /<script|href=|onload=/i);

  const fills = Array.from(first.svg.matchAll(/fill="(#[a-f0-9]{6})"/giu), (match) => match[1].toLowerCase());
  assert.equal(new Set(fills).size, 2);
});

test("generated public ZIP includes badge SVGs and downloadable verified claim files", async () => {
  const { files, claim, claimPath } = await badgeFixture();
  const postHtml = decodeText(files["posts/collectible-proof/index.html"]);
  const manifest = JSON.parse(decodeText(files["postsnail.manifest.json"]));
  const wellKnown = JSON.parse(decodeText(files[".well-known/postsnail.json"]));

  assert.ok(files["badges/posts/collectible-proof.svg"]);
  assert.ok(files[claimPath]);
  assert.equal(claimPath, `badges/claims/${badgeClaimFileName(claim)}`);
  assert.equal(claim.protocol, "postsnail-badge-claim");
  assert.equal(claim.shellName, "@badges@forest.postsnail.org");
  assert.equal(claim.forestUrl, "https://forest.postsnail.org");
  assert.equal(claim.sourceSiteUrl, "https://badges.example");
  assert.equal(claim.postUrl, "https://badges.example/posts/collectible-proof/");
  assert.deepEqual(claim.tags, ["badge", "proof"]);
  assert.ok(claim.record.body.includes("public post"));
  assert.match(postHtml, /Download badge claim/);
  assert.match(postHtml, /data-postsnail-badge-hash=/);
  assert.match(postHtml, /badges\/claims\/collectible-proof\.postsnail\.badge\.[a-f0-9]{32}\.json/);
  assert.ok(manifest.optionalFeatures.includes("signature-badge"));
  assert.ok(wellKnown.optionalFeatures.includes("signature-badge"));
});

test("badge claim import verifies digest signature and dedupes claims", async () => {
  const { claim } = await badgeFixture();
  const verification = verifyBadgeClaim(claim);
  assert.equal(verification.ok, true);

  const imported = importBadgeClaim(undefined, claim, { claimedAt: now });
  assert.equal(imported.duplicate, false);
  assert.equal(imported.state.claims.length, 1);
  assert.equal(imported.state.claims[0].claimedAt, now);
  assert.equal(imported.state.claims[0].record, undefined);

  const duplicate = importBadgeClaim(imported.state, claim, { claimedAt: "2026-06-06T00:00:00.000Z" });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.state.claims.length, 1);

  assert.throws(
    () => importBadgeClaim(undefined, { ...claim, postDigest: `${"0".repeat(128)}` }),
    /digest/i,
  );
  assert.throws(
    () => importBadgeClaim(undefined, { ...claim, sourcePublicKey: "base64:AAAA" }),
    /signature/i,
  );
  assert.throws(
    () => importBadgeClaim(undefined, { ...claim, postSignature: "base64:AAAA" }),
    /signature|hash/i,
  );
});

test("badge plugin state survives encrypted Shell export and can publish a badge collection page", async () => {
  const { claim } = await badgeFixture();
  const imported = importBadgeClaim(undefined, claim, { claimedAt: now });
  const plugins = enablePlugin(
    installPlugin(
      {
        installed: [],
        lock: {},
        state: {
          [POSTSNAIL_BADGES_PLUGIN_ID]: imported.state,
        },
      },
      getOfficialPluginManifest(POSTSNAIL_BADGES_PLUGIN_ID),
    ),
    POSTSNAIL_BADGES_PLUGIN_ID,
  );

  const exportedShell = await exportWorkspaceVault({
    profile: { siteTitle: "Reader Shell" },
    plugins,
  }, "correct horse battery staple", { now });
  const opened = await importWorkspaceVault(exportedShell.text, "correct horse battery staple");
  assert.deepEqual(
    normalizeBadgesState(opened.state.plugins.state[POSTSNAIL_BADGES_PLUGIN_ID]).claims,
    imported.state.claims,
  );

  const keys = generateSigningKeyPair();
  const zip = await buildStaticExport({
    profile: { siteTitle: "Reader Shell", handle: "reader", siteUrl: "https://reader.example" },
    posts: [post()],
    plugins,
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
    generatedAt: now,
  });
  const files = unzipSync(zip.zipBytes);
  const badgePage = decodeText(files["badges/index.html"]);
  const combined = Object.values(files).map(decodeText).join("\n");
  const manifest = JSON.parse(decodeText(files["postsnail.manifest.json"]));

  assert.match(badgePage, /Badge collection/);
  assert.match(badgePage, /forest\.postsnail\.org\/go\/post/);
  assert.ok(Object.keys(files).some((name) => name.startsWith("badges/collection/") && name.endsWith(".svg")));
  assert.equal(manifest.extensions.plugins[POSTSNAIL_BADGES_PLUGIN_ID].claimCount, 1);
  assert.doesNotMatch(combined, /private badge admin/i);
  assert.doesNotMatch(combined, /postsnail-workspace|encryptedSecretKey|rawPrivateKey/);
});
