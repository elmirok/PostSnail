import { canonicalJson } from "./canonical.js";
import { decodeBase64, decodeText, encodeBase64, encodeText } from "./bytes.js";
import { sha3Hex } from "./crypto.js";

export const WORKSPACE_FORMAT = "postsnail-workspace";
export const WORKSPACE_VAULT_VERSION = 1;
export const WORKSPACE_FINGERPRINT_SUITE = "psw1-sha3-512";
export const WORKSPACE_KDF = "PBKDF2-SHA-256";
export const WORKSPACE_CIPHER = "AES-256-GCM";
export const WORKSPACE_KDF_ITERATIONS = 250000;
export const WORKSPACE_DECRYPT_ERROR = "Unable to decrypt workspace. Check the passphrase or file integrity.";
export const WORKSPACE_FINGERPRINT_ERROR = "Workspace fingerprint mismatch.";

export async function encryptWorkspace(workspace, passphrase, options = {}) {
  assertPassphrase(passphrase);
  const salt = options.salt || randomBytes(16);
  const iv = options.iv || randomBytes(12);
  const createdAt = String(workspace.createdAt || options.now || new Date().toISOString());
  const updatedAt = String(workspace.updatedAt || options.now || new Date().toISOString());
  const plaintext = encodeText(canonicalJson(workspace));
  const workspaceFingerprint = fingerprintForWorkspaceBytes(plaintext);
  const header = {
    format: WORKSPACE_FORMAT,
    version: WORKSPACE_VAULT_VERSION,
    app: "PostSnail",
    createdAt,
    updatedAt,
    kdf: WORKSPACE_KDF,
    cipher: WORKSPACE_CIPHER,
    fingerprintSuite: WORKSPACE_FINGERPRINT_SUITE,
    iterations: options.iterations || WORKSPACE_KDF_ITERATIONS,
    salt: formatBase64(salt),
    iv: formatBase64(iv),
    workspaceFingerprint,
  };
  const key = await deriveWorkspaceKey(passphrase, salt, header.iterations);
  const encrypted = await subtle().encrypt(
    { name: "AES-GCM", iv, additionalData: authenticatedData(header) },
    key,
    plaintext,
  );
  return {
    ...header,
    ciphertext: formatBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptWorkspace(envelopeOrText, passphrase) {
  assertPassphrase(passphrase);
  const envelope = parseWorkspaceEnvelope(envelopeOrText);
  validateEnvelope(envelope);
  try {
    const salt = parseBase64(envelope.salt);
    const iv = parseBase64(envelope.iv);
    const ciphertext = parseBase64(envelope.ciphertext);
    const key = await deriveWorkspaceKey(passphrase, salt, envelope.iterations);
    const decrypted = await subtle().decrypt(
      { name: "AES-GCM", iv, additionalData: authenticatedData(envelope) },
      key,
      ciphertext,
    );
    const plaintext = new Uint8Array(decrypted);
    const expected = fingerprintForWorkspaceBytes(plaintext);
    if (expected !== envelope.workspaceFingerprint) {
      throw new Error(WORKSPACE_FINGERPRINT_ERROR);
    }
    return JSON.parse(decodeText(plaintext));
  } catch (error) {
    if (error?.message === WORKSPACE_FINGERPRINT_ERROR) throw error;
    throw new Error(WORKSPACE_DECRYPT_ERROR);
  }
}

export function serializeWorkspaceEnvelope(envelope) {
  return JSON.stringify(envelope, null, 2);
}

export function parseWorkspaceEnvelope(envelopeOrText) {
  if (typeof envelopeOrText === "string") {
    return JSON.parse(envelopeOrText);
  }
  return envelopeOrText;
}

export function fingerprintForWorkspaceBytes(bytes) {
  return `${WORKSPACE_FINGERPRINT_SUITE}-${sha3Hex(bytes)}`;
}

function validateEnvelope(envelope) {
  if (!envelope || typeof envelope !== "object" || envelope.format !== WORKSPACE_FORMAT || envelope.app !== "PostSnail") {
    throw new Error("This is not a PostSnail workspace vault.");
  }
  if (Number(envelope.version) > WORKSPACE_VAULT_VERSION) {
    throw new Error("This workspace was created by a newer PostSnail version.");
  }
  if (Number(envelope.version) !== WORKSPACE_VAULT_VERSION) {
    throw new Error("Unsupported PostSnail workspace vault version.");
  }
  if (envelope.kdf !== WORKSPACE_KDF || envelope.cipher !== WORKSPACE_CIPHER) {
    throw new Error("Unsupported PostSnail workspace vault algorithms.");
  }
  if (envelope.fingerprintSuite !== WORKSPACE_FINGERPRINT_SUITE) {
    throw new Error("Unsupported PostSnail workspace fingerprint suite.");
  }
  if (!String(envelope.workspaceFingerprint || "").startsWith(`${WORKSPACE_FINGERPRINT_SUITE}-`)) {
    throw new Error(WORKSPACE_FINGERPRINT_ERROR);
  }
}

function authenticatedData(envelope) {
  const { ciphertext, workspaceFingerprint, ...header } = envelope;
  return encodeText(canonicalJson(header));
}

async function deriveWorkspaceKey(passphrase, salt, iterations) {
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

function formatBase64(bytes) {
  return `base64:${encodeBase64(bytes)}`;
}

function parseBase64(value) {
  const source = String(value || "");
  if (!source.startsWith("base64:")) {
    throw new Error("Invalid workspace binary field.");
  }
  return decodeBase64(source.slice(7));
}

function assertPassphrase(passphrase) {
  if (!String(passphrase || "").trim()) {
    throw new Error("Workspace passphrase is required.");
  }
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
