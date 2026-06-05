import { describe, expect, test } from "vitest";
import { normalizeSubmittedUrl, assertSafeHttpsUrl } from "../src/url";

describe("registry URL safety", () => {
  test("normalizes public https submissions to an origin URL", () => {
    expect(normalizeSubmittedUrl("https://Creator.Example/posts/hello?x=1#top")).toEqual({
      siteUrl: "https://creator.example/",
      hostname: "creator.example"
    });
  });

  test("rejects non-https and local/private targets", () => {
    for (const url of [
      "http://example.com",
      "https://localhost/",
      "https://dev.localhost/",
      "https://127.0.0.1/",
      "https://10.0.0.2/",
      "https://172.16.0.5/",
      "https://192.168.1.5/",
      "https://[::1]/"
    ]) {
      expect(() => normalizeSubmittedUrl(url), url).toThrow(/public https/i);
    }
  });

  test("rejects unsafe redirect destinations", () => {
    expect(() => assertSafeHttpsUrl(new URL("http://example.com/"))).toThrow(/public https/i);
    expect(() => assertSafeHttpsUrl(new URL("https://169.254.169.254/"))).toThrow(/public https/i);
  });
});
