import { sha3_512 } from "../vendor/@noble/hashes/sha3.js";
import { ml_dsa65 } from "../vendor/@noble/post-quantum/ml-dsa.js";
import { bytesToHex, decodeBase64, encodeBase64, encodeText } from "./bytes.js";

const KEY_ITERATIONS = 250000;

export function sha3Hex(bytes) {
  return bytesToHex(sha3_512(bytes));
}

export function fingerprintForBytes(bytes) {
  return `psn1-sha3-512-${sha3Hex(bytes)}`;
}

export function generateSigningKeyPair(seed) {
  const keys = ml_dsa65.keygen(seed);
  return {
    publicKey: new Uint8Array(keys.publicKey),
    secretKey: new Uint8Array(keys.secretKey),
  };
}

export function signBytes(bytes, secretKey) {
  return new Uint8Array(ml_dsa65.sign(bytes, asBytes(secretKey)));
}

export function verifyBytes(bytes, signature, publicKey) {
  try {
    return ml_dsa65.verify(asBytes(signature), bytes, asBytes(publicKey));
  } catch {
    return false;
  }
}

export async function encryptSecretKey(secretKey, passphrase) {
  if (!String(passphrase ?? "").trim()) {
    throw new Error("Passphrase is required.");
  }
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveAesKey(passphrase, salt);
  const encrypted = await subtle().encrypt({ name: "AES-GCM", iv }, key, asBytes(secretKey));
  return {
    version: 1,
    kdf: "PBKDF2-SHA-256",
    cipher: "AES-GCM",
    iterations: KEY_ITERATIONS,
    salt: encodeBase64(salt),
    iv: encodeBase64(iv),
    data: encodeBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptSecretKey(encrypted, passphrase) {
  try {
    const salt = decodeBase64(encrypted.salt);
    const iv = decodeBase64(encrypted.iv);
    const data = decodeBase64(encrypted.data);
    const key = await deriveAesKey(passphrase, salt, encrypted.iterations || KEY_ITERATIONS);
    const decrypted = await subtle().decrypt({ name: "AES-GCM", iv }, key, data);
    return new Uint8Array(decrypted);
  } catch {
    throw new Error("Unable to decrypt signing key.");
  }
}

export function publicKeyToText(publicKey) {
  return `base64:${encodeBase64(asBytes(publicKey))}`;
}

export function signatureToText(signature) {
  return `base64:${encodeBase64(asBytes(signature))}`;
}

export function textToBytes(value) {
  const source = String(value ?? "");
  return decodeBase64(source.startsWith("base64:") ? source.slice(7) : source);
}

function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") return textToBytes(value);
  return new Uint8Array(value);
}

async function deriveAesKey(passphrase, salt, iterations = KEY_ITERATIONS) {
  const material = await subtle().importKey(
    "raw",
    encodeText(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle().deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function randomBytes(size) {
  const bytes = new Uint8Array(size);
  cryptoObject().getRandomValues(bytes);
  return bytes;
}

function subtle() {
  return cryptoObject().subtle;
}

function cryptoObject() {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto is required.");
  }
  return globalThis.crypto;
}

