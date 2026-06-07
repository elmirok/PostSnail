import test from "node:test";
import assert from "node:assert/strict";

import { decodeBase64, encodeBase64, hexToBytes } from "../src/bytes.js";
import { canonicalJson } from "../src/canonical.js";
import {
  decryptSecretKey,
  encryptSecretKey,
  fingerprintForBytes,
  generateSigningKeyPair,
  sha3Hex,
  signBytes,
  verifyBytes,
} from "../src/crypto.js";
import { normalizePost, slugify } from "../src/content.js";
import { exportBackup, importBackup } from "../src/backup.js";
import { renderMarkdown } from "../src/markdown.js";

test("slugify creates stable readable slugs", () => {
  assert.equal(slugify(" Hello, Quantum Proof World! "), "hello-quantum-proof-world");
  assert.equal(slugify("אבג micro blog"), "micro-blog");
  assert.equal(slugify(""), "post");
});

test("normalizePost creates canonical publish records", () => {
  const post = normalizePost({
    id: "p1",
    title: "A signed note",
    body: "Body text",
    tags: "Crypto, Microblog, crypto",
    status: "published",
    createdAt: "2026-06-05T00:00:00.000Z",
  });

  assert.equal(post.slug, "a-signed-note");
  assert.deepEqual(post.tags, ["crypto", "microblog"]);
  assert.equal(post.excerpt, "Body text");
  assert.equal(post.publishedAt, "2026-06-05T00:00:00.000Z");
});

test("canonicalJson sorts object keys recursively", () => {
  assert.equal(
    canonicalJson({ b: 2, a: { d: 4, c: 3 }, list: [{ z: 1, y: 2 }] }),
    '{"a":{"c":3,"d":4},"b":2,"list":[{"y":2,"z":1}]}',
  );
});

test("sha3Hex and fingerprintForBytes use SHA3-512 output", () => {
  const digest = sha3Hex(new TextEncoder().encode("abc"));
  assert.equal(
    digest,
    "b751850b1a57168a5693cd924b6b096e08f621827444f70d884f5d0240d2712e10e116e9192af3c91a7ec57647e3934057340b4cf408d5a56592f8274eec53f0",
  );
  assert.equal(fingerprintForBytes(new TextEncoder().encode("abc")), `psn1-sha3-512-${digest}`);
});

test("ML-DSA-65 signs and verifies bytes", () => {
  const keys = generateSigningKeyPair();
  const payload = new TextEncoder().encode(canonicalJson({ hello: "postsnail" }));
  const signature = signBytes(payload, keys.secretKey);

  assert.equal(verifyBytes(payload, signature, keys.publicKey), true);
  assert.equal(verifyBytes(new TextEncoder().encode("changed"), signature, keys.publicKey), false);
});

test("private key encryption round trips and rejects wrong passphrases", async () => {
  const keys = generateSigningKeyPair();
  const encrypted = await encryptSecretKey(keys.secretKey, "correct horse battery staple");
  const decrypted = await decryptSecretKey(encrypted, "correct horse battery staple");

  assert.deepEqual(decrypted, keys.secretKey);
  await assert.rejects(
    () => decryptSecretKey(encrypted, "wrong passphrase"),
    /Unable to decrypt signing key/,
  );
  await assert.rejects(
    () => encryptSecretKey(keys.secretKey, "short"),
    /Passphrase must be at least 10 characters\./,
  );
});

test("base64 helpers preserve binary bytes", () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 255]);
  assert.deepEqual(decodeBase64(encodeBase64(bytes)), bytes);
  assert.deepEqual(hexToBytes("000102faff"), bytes);
});

test("backup export and import round trip app state without raw key plaintext", async () => {
  const state = {
    profile: { siteTitle: "Boaz Notes", handle: "boaz" },
    posts: [{ id: "p1", slug: "hello", body: "Hello" }],
    assets: [{ id: "a1", name: "image.png", dataBase64: "abc" }],
    identity: { publicKey: "pub", encryptedSecretKey: { salt: "s", iv: "i", data: "d" } },
    settings: { theme: "quiet" },
  };

  const backup = exportBackup(state);
  assert.equal(backup.includes('"secretKey":'), false);
  assert.match(JSON.parse(backup).backupFingerprint, /^psn1-sha3-512-/);
  assert.deepEqual(importBackup(backup), state);
  const tampered = JSON.parse(backup);
  tampered.state.profile.siteTitle = "Changed";
  assert.throws(() => importBackup(JSON.stringify(tampered)), /backup fingerprint/i);

  const legacyBackup = JSON.parse(backup);
  delete legacyBackup.backupFingerprint;
  assert.deepEqual(importBackup(JSON.stringify(legacyBackup)), state);
});

test("renderMarkdown sanitizes script tags and event attributes", () => {
  const html = renderMarkdown("Hello <script>alert(1)</script><img src=x onerror=alert(1)>");

  assert.equal(html.includes("<script"), false);
  assert.equal(html.includes("onerror"), false);
  assert.equal(html.includes("<p>Hello"), true);
});
