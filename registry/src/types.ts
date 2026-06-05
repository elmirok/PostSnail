export type SubmissionStatus = "queued" | "crawling" | "indexed" | "failed";

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
  generatedAt: string;
  lastVerifiedAt: string;
  hidden: number;
  createdAt: string;
  updatedAt: string;
  latestCrawlStatus: SubmissionStatus;
  latestCrawlMessage: string;
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
  publishedAt: string;
  searchText: string;
  visible: number;
  createdAt: string;
  updatedAt: string;
}

export interface SearchParams {
  q: string;
  tag: string;
  limit: number;
  cursor: string | null;
}

export interface SearchResult {
  items: Array<{
    site: RegistrySite;
    post: RegistryPost;
  }>;
  nextCursor: string | null;
}

export interface RegistryStore {
  incrementRateLimit(key: string, windowStart?: string, now?: string): Promise<number>;
  findRecentSubmission(siteUrl: string, now?: string): Promise<{ id: string; status: string } | null>;
  createSubmission(submission: SubmissionRecord): Promise<void>;
  getSubmission(id: string): Promise<SubmissionRecord | null>;
  markSubmissionCrawling(id: string, now: string): Promise<void>;
  markSubmissionFailed(id: string, message: string, now: string): Promise<void>;
  upsertVerifiedSite(site: RegistrySite, posts: RegistryPost[], submissionId: string, now: string): Promise<void>;
  getSite(id: string): Promise<RegistrySite | null>;
  getPostsForSite(id: string, limit?: number): Promise<RegistryPost[]>;
  setSiteHidden(id: string, hidden: boolean, now?: string): Promise<void>;
  search(params: SearchParams): Promise<SearchResult>;
}

export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
