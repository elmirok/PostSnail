import { sameOriginUrl } from "./url";
import type { Fetcher } from "./types";

const MAX_JSON_BYTES = 160 * 1024;

export async function fetchProofDocuments(siteUrl: string, fetcher: Fetcher): Promise<{ wellKnown: unknown; manifest: unknown }> {
  const wellKnownUrl = new URL(".well-known/postsnail.json", siteUrl).toString();
  const wellKnown = await fetchJson(wellKnownUrl, fetcher, siteUrl);
  const manifestPointer = getManifestPointer(wellKnown);
  const manifestUrl = sameOriginUrl(siteUrl, manifestPointer || "postsnail.manifest.json").toString();
  const manifest = await fetchJson(manifestUrl, fetcher, siteUrl);
  return { wellKnown, manifest };
}

export async function fetchJson(url: string, fetcher: Fetcher, expectedOrigin: string, redirects = 0): Promise<unknown> {
  if (redirects > 3) throw new Error("Too many redirects.");
  const response = await fetcher(url, { redirect: "manual", headers: { accept: "application/json" } });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) throw new Error("Redirect missing location.");
    const redirected = sameOriginUrl(expectedOrigin, location);
    return fetchJson(redirected.toString(), fetcher, expectedOrigin, redirects + 1);
  }
  if (!response.ok) throw new Error("Proof document could not be fetched.");
  const text = await readBoundedText(response, MAX_JSON_BYTES);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Proof document is not valid JSON.");
  }
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const contentLength = Number(response.headers.get("content-length") || "0");
  if (contentLength > maxBytes) throw new Error("Proof document is too large.");
  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) throw new Error("Proof document is too large.");
    return new TextDecoder().decode(buffer);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > maxBytes) throw new Error("Proof document is too large.");
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function getManifestPointer(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  const pointer = record.manifestUrl || record.manifest;
  return typeof pointer === "string" ? pointer : "";
}
