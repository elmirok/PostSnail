import test from "node:test";
import assert from "node:assert/strict";

import { decryptLocalShellState, encryptLocalShellState } from "../src/localShell.js";

const now = "2026-06-05T12:00:00.000Z";
const passphrase = "correct horse battery staple";

function sampleState() {
  return {
    profile: { siteTitle: "Locked Shell", handle: "locked", description: "Encrypted local cache." },
    posts: [
      {
        id: "p1",
        title: "Encrypted Local Note",
        slug: "encrypted-local-note",
        body: "This editable post must not be plaintext in IndexedDB.",
        tags: ["shell"],
        status: "published",
        excerpt: "This editable post",
        imageIds: ["asset-1"],
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
      },
    ],
    assets: [{ id: "asset-1", name: "pixel.png", type: "image/png", dataBase64: "iVBORw0KGgo=", createdAt: now }],
    identity: {
      algorithm: "ML-DSA-65",
      publicKey: "base64:cHVibGlj",
      encryptedSecretKey: { version: 1, salt: "salt", iv: "iv", data: "ciphertext" },
      createdAt: now,
    },
    settings: { preferredTrackers: "https://forest.postsnail.org/" },
    commitHistory: [{ id: "commit-1", bundleFingerprint: "psn1-sha3-512-old" }],
    plugins: { installed: [{ id: "plugin" }], lock: { plugin: "locked" }, state: { plugin: { secret: "plugin-secret" } } },
    moderation: { approvedComments: [], rejectedComments: [{ id: "r1", body: "private rejection" }], blockedPublicKeys: [] },
    trackerUrls: ["https://forest.postsnail.org/"],
    exportHistory: [{ filename: "locked.zip", exportedAt: now }],
  };
}

test("encrypted local Shell cache round trips without plaintext leakage", async () => {
  const encrypted = await encryptLocalShellState(sampleState(), passphrase, { now });

  assert.match(encrypted.envelopeText, /"format": "postsnail-workspace"/);
  assert.match(encrypted.envelope.workspaceFingerprint, /^psw1-sha3-512-/);
  assert.doesNotMatch(encrypted.envelopeText, /This editable post must not be plaintext/);
  assert.doesNotMatch(encrypted.envelopeText, /plugin-secret/);
  assert.doesNotMatch(encrypted.envelopeText, /private rejection/);

  const decrypted = await decryptLocalShellState(encrypted.envelopeText, passphrase);
  assert.deepEqual(decrypted.state.posts, sampleState().posts);
  assert.deepEqual(decrypted.state.assets, sampleState().assets);
  assert.deepEqual(decrypted.state.plugins, sampleState().plugins);
  assert.deepEqual(decrypted.state.moderation, sampleState().moderation);
});

test("encrypted local Shell cache rejects a wrong passphrase safely", async () => {
  const encrypted = await encryptLocalShellState(sampleState(), passphrase, { now });

  await assert.rejects(
    () => decryptLocalShellState(encrypted.envelopeText, "wrong passphrase"),
    /Unable to decrypt workspace\. Check the passphrase or file integrity\./,
  );
});
