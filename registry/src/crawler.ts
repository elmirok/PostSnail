import { fetchProofDocuments } from "./remote";
import { verifyProofDocuments } from "./proof";
import type { CrawlMessage, Fetcher, RegistryQueue, RegistryStore } from "./types";

export interface CrawlDeps {
  store: RegistryStore;
  queue?: RegistryQueue;
  fetcher?: Fetcher;
  now?: () => string;
}

export async function processCrawlMessage(message: CrawlMessage, deps: CrawlDeps): Promise<void> {
  const now = deps.now?.() || new Date().toISOString();
  const fetcher = deps.fetcher || fetch;
  await deps.store.markSubmissionCrawling(message.submissionId, now);
  try {
    const { wellKnown, manifest } = await fetchProofDocuments(message.siteUrl, fetcher);
    const verification = verifyProofDocuments(message.siteUrl, wellKnown, manifest, now);
    if (!verification.ok) {
      await deps.store.markSubmissionFailed(message.submissionId, "Proof verification failed.", now);
      log("warn", "crawl_failed", { submissionId: message.submissionId, siteUrl: message.siteUrl, errors: verification.errors });
      return;
    }
    await deps.store.upsertVerifiedSite(verification.site, verification.posts, message.submissionId, now);
    log("log", "crawl_indexed", { submissionId: message.submissionId, siteUrl: message.siteUrl, siteId: verification.site.id, posts: verification.posts.length });
  } catch (error) {
    await deps.store.markSubmissionFailed(message.submissionId, "Proof documents could not be verified.", now);
    log("warn", "crawl_error", { submissionId: message.submissionId, siteUrl: message.siteUrl, error: error instanceof Error ? error.message : "unknown" });
  }
}

function log(level: "log" | "warn", event: string, data: Record<string, unknown>): void {
  console[level](JSON.stringify({ event, ...data }));
}
