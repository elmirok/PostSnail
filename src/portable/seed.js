import { sha3_512 } from "../../vendor/@noble/hashes/sha3.js";
import { encodeText } from "../bytes.js";

export function derivePortableSeedBytes(seed) {
  const digest = sha3_512(encodeText(String(seed ?? "")));
  return digest.slice(0, 32);
}
