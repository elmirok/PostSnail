import test from "node:test";
import assert from "node:assert/strict";

import { exportBackup } from "../src/backup.js";
import { CURRENT_WORKSPACE_VERSION, migrateWorkspace } from "../src/migrations.js";
import { exportWorkspaceVault, importLegacyBackupJson, importWorkspaceVault } from "../src/workspace.js";
import { createWorkspaceData } from "../src/workspaceSchema.js";

const now = "2026-06-05T12:00:00.000Z";
const passphrase = "correct horse battery staple";

function sampleState() {
  return {
    profile: { siteTitle: "Vault Test", handle: "vault", description: "Private editable source." },
    posts: [
      {
        id: "p1",
        title: "Public note",
        slug: "public-note",
        body: "Published body survives inside the encrypted workspace.",
        tags: ["alpha"],
        status: "published",
        excerpt: "Published body survives",
        imageIds: ["asset-1"],
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
      },
      {
        id: "d1",
        title: "Private draft",
        slug: "private-draft",
        body: "Private draft body only belongs in the workspace.",
        tags: ["draft"],
        status: "draft",
        excerpt: "Private draft",
        imageIds: [],
        createdAt: now,
        updatedAt: now,
        publishedAt: "",
      },
    ],
    assets: [
      {
        id: "asset-1",
        name: "pixel.png",
        type: "image/png",
        dataBase64: "iVBORw0KGgo=",
        createdAt: now,
      },
    ],
    identity: {
      algorithm: "ML-DSA-65",
      publicKey: "base64:cHVibGlj",
      encryptedSecretKey: { version: 1, salt: "salt", iv: "iv", data: "ciphertext" },
      createdAt: now,
    },
    settings: { warnMetadata: true, preferredTrackers: "https://tracker.example/announce" },
    commitHistory: [{ id: "commit-1", bundleFingerprint: "psn1-sha3-512-old" }],
    plugins: {
      installed: [{ id: "proof-widget", version: "1.0.0" }],
      lock: { "proof-widget": "sha3-locked" },
      state: {
        "proof-widget": { token: "plugin-private-token" },
        "postsnail-pages": {
          schemaVersion: 1,
          pages: [{ id: "home", title: "Home", path: "/", status: "published", body: "CMS homepage body" }],
          docs: [{ id: "protocol", title: "Protocol", slug: "protocol", status: "draft", body: "Private draft doc" }],
          navigation: [{ label: "Home", url: "/" }],
          settings: { blogIndexPath: "/blog/" },
          unknownFutureField: { keep: true },
        },
        "postsnail-badges": {
          schemaVersion: 1,
          claims: [
            {
              protocol: "postsnail-badge-claim",
              version: 1,
              badgeHash: `psb1-sha3-512-${"a".repeat(128)}`,
              sourcePublicKey: "base64:cHVibGlj",
              postDigest: "digest-1",
              postSignature: "base64:c2ln",
              title: "Collected public proof",
              claimedAt: now,
            },
          ],
          settings: { publishBadgePage: true, pagePath: "/badges/" },
          unknownFutureField: { keep: true },
        },
      },
    },
    moderation: {
      approvedComments: [{ id: "c1", body: "Approved public comment" }],
      rejectedComments: [{ id: "c2", body: "Rejected private moderation note" }],
      blockedPublicKeys: ["base64:blocked"],
    },
    trackerUrls: ["https://tracker.example/announce"],
    shellNames: [
      {
        forest: "forest.postsnail.org",
        name: "vault",
        fullName: "@vault@forest.postsnail.org",
        record: {
          protocol: "postsnail-shellname",
          version: 1,
          name: "vault",
          publicKey: "base64:cHVibGlj",
          extensions: { unknown: "preserved" },
        },
      },
    ],
    siteMoves: [
      {
        id: "move-1",
        status: "moved",
        fromUrl: "https://old.example/",
        toUrl: "https://new.example/",
        record: {
          protocol: "postsnail-site-move",
          version: 1,
          mode: "move",
          fromUrl: "https://old.example/",
          toUrl: "https://new.example/",
          publicKey: "base64:cHVibGlj",
          bundleFingerprint: "psn1-sha3-512-old",
          extensions: { unknown: "preserved" },
        },
      },
    ],
    appearance: {
      frontendTheme: "quiet-feed",
      adminTheme: "shell-night",
      themeSettings: {
        "quiet-feed": { accentColor: "#ef4056" },
        "unknown-theme": { preserved: true },
      },
    },
    exportHistory: [{ filename: "postsnail-vault-test.zip", exportedAt: now }],
  };
}

test("encrypted .postsnail workspace round trips editable state without plaintext leakage", async () => {
  const exported = await exportWorkspaceVault(sampleState(), passphrase, { now });

  assert.equal(exported.filename, "postsnail-vault-test.postsnail");
  assert.match(exported.text, /"format": "postsnail-workspace"/);
  assert.match(exported.envelope.workspaceFingerprint, /^psw1-sha3-512-/);
  assert.doesNotMatch(exported.text, /Private draft body/);
  assert.doesNotMatch(exported.text, /Published body survives/);
  assert.doesNotMatch(exported.text, /plugin-private-token/);
  assert.doesNotMatch(exported.text, /CMS homepage body/);
  assert.doesNotMatch(exported.text, /Private draft doc/);

  const imported = await importWorkspaceVault(exported.text, passphrase);
  assert.equal(imported.workspace.version, CURRENT_WORKSPACE_VERSION);
  assert.deepEqual(imported.state.posts, sampleState().posts);
  assert.deepEqual(imported.state.assets, sampleState().assets);
  assert.deepEqual(imported.state.plugins, sampleState().plugins);
  assert.deepEqual(imported.state.commitHistory, sampleState().commitHistory);
  assert.deepEqual(imported.state.moderation, sampleState().moderation);
  assert.deepEqual(imported.state.shellNames, sampleState().shellNames);
  assert.deepEqual(imported.state.siteMoves, sampleState().siteMoves);
  assert.deepEqual(imported.state.appearance, sampleState().appearance);
});

test("workspace import fails safely for wrong passphrase and tampered ciphertext", async () => {
  const exported = await exportWorkspaceVault(sampleState(), passphrase, { now });

  await assert.rejects(
    () => exportWorkspaceVault(sampleState(), "short", { now }),
    /Passphrase must be at least 10 characters\./,
  );

  await assert.rejects(
    () => importWorkspaceVault(exported.text, "wrong passphrase"),
    /Unable to decrypt workspace\. Check the passphrase or file integrity\./,
  );

  const tampered = JSON.parse(exported.text);
  tampered.ciphertext = `${tampered.ciphertext.slice(0, -2)}aa`;
  await assert.rejects(
    () => importWorkspaceVault(JSON.stringify(tampered), passphrase),
    /Unable to decrypt workspace\. Check the passphrase or file integrity\./,
  );
});

test("workspace import rejects a mismatched workspace fingerprint", async () => {
  const exported = await exportWorkspaceVault(sampleState(), passphrase, { now });
  const tampered = JSON.parse(exported.text);
  tampered.workspaceFingerprint = "psw1-sha3-512-deadbeef";

  await assert.rejects(
    () => importWorkspaceVault(JSON.stringify(tampered), passphrase),
    /Workspace fingerprint mismatch\./,
  );
});

test("legacy JSON backup imports through workspace schema and rejects raw private keys", () => {
  const legacy = exportBackup(sampleState());
  const imported = importLegacyBackupJson(legacy, { now });

  assert.equal(imported.migrated, true);
  assert.equal(imported.workspace.schema, "postsnail-workspace-data");
  assert.equal(imported.workspace.version, CURRENT_WORKSPACE_VERSION);
  assert.deepEqual(imported.state.plugins, sampleState().plugins);
  assert.deepEqual(imported.state.posts, sampleState().posts);

  const rawBackup = {
    app: "PostSnail",
    version: 1,
    state: { identity: { publicKey: "base64:cHVibGlj", secretKey: "raw-private-key" } },
  };
  assert.throws(
    () => importLegacyBackupJson(JSON.stringify(rawBackup), { now }),
    /Workspace data must not contain raw private signing keys\./,
  );
  assert.throws(
    () => createWorkspaceData({ identity: { secretKey: "raw-private-key" } }, { now }),
    /Workspace data must not contain raw private signing keys\./,
  );
});

test("workspace migration v1 defaults missing containers and rejects future versions", () => {
  const migrated = migrateWorkspace({
    schema: "postsnail-workspace-data",
    version: 1,
    createdAt: now,
    updatedAt: now,
    profile: { siteTitle: "Sparse" },
    posts: [],
  });

  assert.equal(migrated.version, CURRENT_WORKSPACE_VERSION);
  assert.deepEqual(migrated.plugins, { installed: [], lock: {}, state: {} });
  assert.deepEqual(migrated.moderation, { approvedComments: [], rejectedComments: [], blockedPublicKeys: [] });
  assert.deepEqual(migrated.trackerUrls, []);
  assert.deepEqual(migrated.shellNames, []);
  assert.deepEqual(migrated.siteMoves, []);
  assert.deepEqual(migrated.appearance, {
    frontendTheme: "quiet-feed",
    adminTheme: "default",
    themeSettings: {},
  });
  assert.deepEqual(migrated.exportHistory, []);

  assert.throws(
    () => migrateWorkspace({ schema: "postsnail-workspace-data", version: 999 }),
    /This workspace was created by a newer PostSnail version\./,
  );
});

test("workspace preserves SnailLift settings and deployment logs without secrets", () => {
  const workspace = createWorkspaceData({
    settings: {
      snailLiftSurgeSiteUrl: "https://creator.example/",
      snailLiftSurgeDomain: "creator.surge.sh",
      snailLiftSurgeProjectDir: "postsnail-public",
      snailLiftSurgeLogin: "boaz@example.com",
      snailLiftSurgeToken: "must-not-survive",
    },
    exportHistory: [
      {
        provider: "surge",
        siteUrl: "https://creator.example/",
        bundleFingerprint: "psn1-sha3-512-test",
        status: "success",
        surgeToken: "must-not-survive",
        surgeLogin: "boaz@example.com",
        authorization: "Bearer must-not-survive",
      },
    ],
  }, { now });

  assert.equal(workspace.settings.snailLiftSurgeSiteUrl, "https://creator.example/");
  assert.equal(workspace.settings.snailLiftSurgeDomain, "creator.surge.sh");
  assert.equal(workspace.settings.snailLiftSurgeProjectDir, "postsnail-public");
  assert.equal(workspace.settings.snailLiftSurgeLogin, "boaz@example.com");
  assert.equal(workspace.settings.snailLiftSurgeToken, "must-not-survive");
  assert.equal(workspace.exportHistory[0].surgeToken, undefined);
  assert.equal(workspace.exportHistory[0].surgeLogin, "boaz@example.com");
  assert.equal(workspace.exportHistory[0].authorization, undefined);
});
