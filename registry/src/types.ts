export type SubmissionStatus = "queued" | "crawling" | "indexed" | "failed" | "moved";

export interface CrawlMessage {
  submissionId: string;
  siteUrl: string;
}

export interface RegistryQueue {
  send(message: CrawlMessage): Promise<unknown>;
}

export interface SubmissionRecord {
  id: string;
  siteUrl: string;
  status: SubmissionStatus;
  siteId: string | null;
  message: string;
  requesterHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegistrySite {
  id: string;
  canonicalUrl: string;
  manifestUrl: string;
  siteTitle: string;
  handle: string;
  description: string;
  siteUrl: string;
  publicKey: string;
  bundleFingerprint: string;
  logoUrl: string;
  details: Record<string, unknown>;
  generatedAt: string;
  lastVerifiedAt: string;
  hidden: number;
  createdAt: string;
  updatedAt: string;
  latestCrawlStatus: SubmissionStatus;
  latestCrawlMessage: string;
  lastCheckedAt: string;
  nextCheckAt: string;
  checkIntervalMinutes: number;
  unchangedCheckCount: number;
  failureCount: number;
  pendingFingerprint: string;
}

export interface RegistryPost {
  id: string;
  siteId: string;
  slug: string;
  title: string;
  url: string;
  excerpt: string;
  tags: string[];
  digest: string;
  thumbnailUrl: string;
  details: Record<string, unknown>;
  publishedAt: string;
  searchText: string;
  visible: number;
  createdAt: string;
  updatedAt: string;
}

export interface ShellNameRecord {
  name: string;
  fullName: string;
  forest: string;
  siteUrl: string;
  publicKey: string;
  bundleFingerprint: string;
  record: Record<string, unknown>;
  signature: string;
  status: "active" | "expired" | "hidden";
  hidden: number;
  expiresAt: string;
  searchText: string;
  createdAt: string;
  updatedAt: string;
}

export interface SiteMoveRecord {
  id: string;
  fromSiteId: string;
  toSiteId: string;
  fromUrl: string;
  toUrl: string;
  publicKey: string;
  bundleFingerprint: string;
  mode: "move" | "mirror";
  status: "moved" | "mirror";
  record: Record<string, unknown>;
  signature: string;
  createdAt: string;
  appliedAt: string;
}

export interface SearchParams {
  q: string;
  tag: string;
  scope?: "all" | "content" | "shell";
  sort?: "best" | "newest" | "oldest" | "az" | "za" | "verified";
  limit: number;
  cursor: string | null;
}

export type SearchResultItem =
  | { type: "content"; site: RegistrySite; post: RegistryPost; shell?: undefined; sortAt?: string }
  | { type: "shell"; site: RegistrySite; shell: RegistrySite; shellName?: ShellNameRecord; post?: undefined; sortAt?: string }
  | { type: "shellname"; shellName: ShellNameRecord; site?: undefined; shell?: undefined; post?: undefined; sortAt?: string };

export interface SearchResult {
  items: SearchResultItem[];
  nextCursor: string | null;
}

export interface RegistryStore {
  incrementRateLimit(key: string, windowStart?: string, now?: string): Promise<number>;
  findRecentSubmission(siteUrl: string, now?: string): Promise<{ id: string; status: string } | null>;
  findActiveSubmission(siteUrl: string, now?: string): Promise<{ id: string; status: string } | null>;
  createSubmission(submission: SubmissionRecord): Promise<void>;
  getSubmission(id: string): Promise<SubmissionRecord | null>;
  markSubmissionCrawling(id: string, now: string): Promise<void>;
  markSubmissionFailed(id: string, message: string, now: string): Promise<void>;
  upsertVerifiedSite(site: RegistrySite, posts: RegistryPost[], submissionId: string, now: string): Promise<void>;
  getSite(id: string): Promise<RegistrySite | null>;
  getSiteByCanonicalUrl(siteUrl: string): Promise<RegistrySite | null>;
  getDueSites(now: string, limit: number): Promise<RegistrySite[]>;
  getPostsForSite(id: string, limit?: number): Promise<RegistryPost[]>;
  findPostByPublicKeyDigest(publicKey: string, digest: string, slug?: string): Promise<{ site: RegistrySite; post: RegistryPost } | null>;
  recordPendingRefresh(siteId: string, fingerprint: string, nextCheckAt: string, now: string): Promise<void>;
  recordRefreshQueued(siteId: string, fingerprint: string, nextCheckAt: string, now: string): Promise<void>;
  recordRefreshCheck(siteId: string, outcome: { changed: boolean; failed: boolean; fingerprint?: string }, now: string, nextCheckAt: string, intervalMinutes: number): Promise<void>;
  setSiteHidden(id: string, hidden: boolean, now?: string): Promise<void>;
  search(params: SearchParams): Promise<SearchResult>;
  getShellName(name: string): Promise<ShellNameRecord | null>;
  getShellNameByPublicKey(publicKey: string): Promise<ShellNameRecord | null>;
  upsertShellName(record: ShellNameRecord): Promise<void>;
  setShellNameHidden(name: string, hidden: boolean, now?: string): Promise<void>;
  searchShellNames(q: string, limit: number, now?: string): Promise<ShellNameRecord[]>;
  recentShellNames(limit: number, now?: string): Promise<ShellNameRecord[]>;
  exportShellNames(now?: string): Promise<ShellNameRecord[]>;
  getSiteMove(id: string): Promise<SiteMoveRecord | null>;
  getSiteMoveBySignature(signature: string): Promise<SiteMoveRecord | null>;
  recordSiteMove(move: SiteMoveRecord, options?: { hideOldSite?: boolean; now?: string }): Promise<void>;
}

export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
