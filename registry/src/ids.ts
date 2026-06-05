import { encodeText } from "../../src/bytes.js";
import { sha3Hex } from "../../src/crypto.js";

export function stableId(prefix: string, value: string, length = 32): string {
  return `${prefix}_${sha3Hex(encodeText(value)).slice(0, length)}`;
}

export function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function normalizedSearchText(value: string): string {
  return String(value ?? "").toLowerCase().replace(/\s+/gu, " ").trim();
}

export function tagsText(tags: string[]): string {
  return `|${tags.join("|")}|`;
}
