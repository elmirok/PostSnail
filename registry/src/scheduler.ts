import { fetchJson } from "./remote";
import { randomId } from "./ids";
import type { CrawlMessage, Fetcher, RegistryQueue, RegistrySite, RegistryStore, SubmissionRecord } from "./types";

const DEFAULT_CHECK_LIMIT = 20;
const ACTIVE_INTERVAL_MINUTES = 60;
const PENDING_RETRY_MINUTES = 15;
const MAX_QUIET_INTERVAL_MINUTES = 24 * 60;
const MAX_FAILURE_INTERVAL_MINUTES = 24 * 60;

export interface ScheduledDeps {
  store: RegistryStore;
  queue: RegistryQueue;
  fetcher?: Fetcher;
  now?: () => string;
}

export async function processScheduledChecks(deps: ScheduledDeps, options: { limit?: number } = {}): Promise<{ checked: number; queued: number; unchanged: number; failed: number }> {
  const now = deps.now?.() || new Date().toISOString();
  const fetcher = deps.fetcher || fetch;
  const dueSites = await deps.store.getDueSites(now, options.limit || DEFAULT_CHECK_LIMIT);
  const summary = { checked: 0, queued: 0, unchanged: 0, failed: 0 };
  for (const site of dueSites) {
    summary.checked += 1;
    const result = await checkSite(site, deps.store, deps.queue, fetcher, now);
    summary[result] += 1;
  }
  return summary;
}

async function checkSite(site: RegistrySite, store: RegistryStore, queue: RegistryQueue, fetcher: Fetcher, now: string): Promise<"queued" | "unchanged" | "failed"> {
  try {
    const wellKnown = objectRecord(await fetchJson(new URL(".well-known/postsnail.json", site.canonicalUrl).toString(), fetcher, site.canonicalUrl));
    const liveFingerprint = stringValue(wellKnown.bundleFingerprint);
    const livePublicKey = stringValue(wellKnown.publicKey);
    if (!liveFingerprint || livePublicKey !== site.publicKey) {
      await recordFailedCheck(site, store, now);
      return "failed";
    }
    if (liveFingerprint !== site.bundleFingerprint) {
      const active = await store.findActiveSubmission(site.canonicalUrl, now);
      if (!active) {
        const submission = await createRefreshSubmission(store, queue, site.canonicalUrl, site.id, "scheduled", now);
        void submission;
      }
      await store.recordRefreshCheck(site.id, { changed: true, failed: false, fingerprint: liveFingerprint }, now, addMinutes(now, ACTIVE_INTERVAL_MINUTES), ACTIVE_INTERVAL_MINUTES);
      await store.recordRefreshQueued(site.id, liveFingerprint, addMinutes(now, ACTIVE_INTERVAL_MINUTES), now);
      return "queued";
    }
    const retryPendingSoon = Boolean(site.pendingFingerprint && site.pendingFingerprint !== liveFingerprint);
    const nextInterval = retryPendingSoon ? PENDING_RETRY_MINUTES : nextQuietInterval(site.checkIntervalMinutes);
    await store.recordRefreshCheck(site.id, { changed: false, failed: false }, now, addMinutes(now, nextInterval), nextInterval);
    return "unchanged";
  } catch {
    await recordFailedCheck(site, store, now);
    return "failed";
  }
}

async function recordFailedCheck(site: RegistrySite, store: RegistryStore, now: string): Promise<void> {
  const nextInterval = nextFailureInterval(site.checkIntervalMinutes);
  await store.recordRefreshCheck(site.id, { changed: false, failed: true }, now, addMinutes(now, nextInterval), nextInterval);
}

export async function createRefreshSubmission(store: RegistryStore, queue: RegistryQueue, siteUrl: string, siteId: string | null, requesterHash: string, now: string): Promise<SubmissionRecord> {
  const submission: SubmissionRecord = {
    id: randomId("sub"),
    siteUrl,
    status: "queued",
    siteId,
    message: "",
    requesterHash,
    createdAt: now,
    updatedAt: now,
  };
  await store.createSubmission(submission);
  const message: CrawlMessage = { submissionId: submission.id, siteUrl };
  await queue.send(message);
  return submission;
}

export function addMinutes(value: string, minutes: number): string {
  return new Date(Date.parse(value) + minutes * 60 * 1000).toISOString();
}

function nextQuietInterval(current: number): number {
  return Math.min(Math.max(current || ACTIVE_INTERVAL_MINUTES, ACTIVE_INTERVAL_MINUTES) * 2, MAX_QUIET_INTERVAL_MINUTES);
}

function nextFailureInterval(current: number): number {
  return Math.min(Math.max(current || ACTIVE_INTERVAL_MINUTES, ACTIVE_INTERVAL_MINUTES) * 2, MAX_FAILURE_INTERVAL_MINUTES);
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
