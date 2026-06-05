import { describe, expect, test } from "vitest";
import { fetchJson } from "../src/remote";

describe("remote proof fetch guardrails", () => {
  test("rejects oversized JSON documents before parsing", async () => {
    const fetcher = async () => new Response("{}", {
      headers: { "content-length": String(200 * 1024), "content-type": "application/json" }
    });

    await expect(fetchJson("https://creator.example/postsnail.manifest.json", fetcher, "https://creator.example/"))
      .rejects.toThrow(/too large/i);
  });

  test("rejects redirects to non-https or cross-origin targets", async () => {
    const fetcher = async () => new Response(null, {
      status: 302,
      headers: { location: "http://creator.example/postsnail.manifest.json" }
    });

    await expect(fetchJson("https://creator.example/.well-known/postsnail.json", fetcher, "https://creator.example/"))
      .rejects.toThrow(/public https/i);
  });
});
