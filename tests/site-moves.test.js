import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSiteMovePayload,
  signSiteMoveRecord,
  verifySiteMoveRecord,
} from "../src/siteMoves.js";
import { generateSigningKeyPair, publicKeyToText } from "../src/crypto.js";

const FIXED_TIME = "2026-06-14T10:00:00.000Z";
const FINGERPRINT = `psn1-sha3-512-${"a".repeat(128)}`;

test("site move records sign and verify with the publisher key", async () => {
  const keys = generateSigningKeyPair();
  const identity = { ...keys, publicKey: publicKeyToText(keys.publicKey) };
  const payload = buildSiteMovePayload({
    mode: "move",
    fromUrl: "https://old.example/blog",
    toUrl: "https://new.example/",
    publicKey: identity.publicKey,
    bundleFingerprint: FINGERPRINT,
    createdAt: FIXED_TIME,
  });

  const signed = await signSiteMoveRecord(payload, identity.secretKey);
  const verified = await verifySiteMoveRecord(signed);

  assert.equal(verified.ok, true);
  assert.equal(verified.record.protocol, "postsnail-site-move");
  assert.equal(verified.record.mode, "move");
  assert.equal(verified.record.fromUrl, "https://old.example/");
  assert.equal(verified.record.toUrl, "https://new.example/");
  assert.equal(verified.record.publicKey, identity.publicKey);
  assert.equal(signed.signature.startsWith("base64:"), true);
  assert.equal(JSON.stringify(signed).includes("secretKey"), false);
  assert.equal(JSON.stringify(signed).includes("privateKey"), false);
});

test("site move records reject tampered signed fields", async () => {
  const keys = generateSigningKeyPair();
  const identity = { ...keys, publicKey: publicKeyToText(keys.publicKey) };
  const payload = buildSiteMovePayload({
    mode: "mirror",
    fromUrl: "https://old.example/",
    toUrl: "https://new.example/",
    publicKey: identity.publicKey,
    bundleFingerprint: FINGERPRINT,
    createdAt: FIXED_TIME,
  });

  const signed = await signSiteMoveRecord(payload, identity.secretKey);
  const tampered = { ...signed, toUrl: "https://attacker.example/" };
  const verified = await verifySiteMoveRecord(tampered);

  assert.equal(verified.ok, false);
  assert.match(verified.errors.join("\n"), /signature/i);
});

test("site move records require safe HTTPS origins", () => {
  const identity = {
    publicKey: `base64:${Buffer.alloc(1952).toString("base64")}`,
  };

  assert.throws(
    () =>
      buildSiteMovePayload({
        mode: "move",
        fromUrl: "http://old.example/",
        toUrl: "https://new.example/",
        publicKey: identity.publicKey,
        bundleFingerprint: FINGERPRINT,
        createdAt: FIXED_TIME,
      }),
    /https/i,
  );

  assert.throws(
    () =>
      buildSiteMovePayload({
        mode: "move",
        fromUrl: "https://old.example/",
        toUrl: "https://127.0.0.1/",
        publicKey: identity.publicKey,
        bundleFingerprint: FINGERPRINT,
        createdAt: FIXED_TIME,
      }),
    /public HTTPS/i,
  );
});
