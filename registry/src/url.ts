export interface NormalizedSubmissionUrl {
  siteUrl: string;
  hostname: string;
}

export function normalizeSubmittedUrl(value: string): NormalizedSubmissionUrl {
  let url: URL;
  try {
    url = new URL(String(value ?? "").trim());
  } catch {
    throw new Error("Submit a public https URL.");
  }
  assertSafeHttpsUrl(url);
  return {
    siteUrl: `${url.origin}/`,
    hostname: url.hostname.toLowerCase(),
  };
}

export function assertSafeHttpsUrl(url: URL): void {
  if (url.protocol !== "https:") {
    throw new Error("Submit a public https URL.");
  }
  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("Submit a public https URL.");
  }
  if (isIpLiteral(hostname)) {
    throw new Error("Submit a public https URL.");
  }
}

function isIpLiteral(hostname: string): boolean {
  if (hostname.includes(":")) return true;
  const parts = hostname.split(".");
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/u.test(part))) return false;
  const octets = parts.map((part) => Number(part));
  if (!octets.every((part) => part >= 0 && part <= 255)) return false;
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a === 169 && b === 254 ||
    a === 172 && b >= 16 && b <= 31 ||
    a === 192 && b === 168 ||
    a === 100 && b >= 64 && b <= 127 ||
    a === 192 && b === 0 ||
    a === 192 && b === 0 ||
    a === 198 && (b === 18 || b === 19) ||
    a === 198 && b === 51 ||
    a === 203 && b === 0 ||
    a >= 224
  );
}

export function sameOriginUrl(base: string, value: string): URL {
  const baseUrl = new URL(base);
  const next = new URL(value, baseUrl);
  assertSafeHttpsUrl(next);
  if (next.origin !== baseUrl.origin) {
    throw new Error("Manifest URL must stay on the submitted origin.");
  }
  return next;
}
