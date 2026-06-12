import { ml_dsa65 } from '../../../vendor/@noble/post-quantum/ml-dsa.js';

export function textToBytes(value) {
  const source = String(value ?? "");
  if (source.startsWith("base64:")) {
    const b64 = source.slice(7);
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(0);
}

export function verifyBytes(bytes, signature, publicKey) {
  try {
    const sigBytes = signature instanceof Uint8Array ? signature : textToBytes(signature);
    const pubBytes = publicKey instanceof Uint8Array ? publicKey : textToBytes(publicKey);
    return ml_dsa65.verify(sigBytes, bytes, pubBytes);
  } catch {
    return false;
  }
}

export async function sha3Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA3-512', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export async function fingerprintForBytes(bytes) {
  const hash = await sha3Hex(bytes);
  return `psn1-sha3-512-${hash}`;
}