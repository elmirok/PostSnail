CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  canonical_url TEXT NOT NULL,
  manifest_url TEXT NOT NULL,
  site_title TEXT NOT NULL,
  handle TEXT NOT NULL,
  description TEXT NOT NULL,
  site_url TEXT NOT NULL,
  public_key TEXT NOT NULL,
  bundle_fingerprint TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  last_verified_at TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  latest_crawl_status TEXT NOT NULL DEFAULT 'indexed',
  latest_crawl_message TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_canonical_public_key ON sites (canonical_url, public_key);
CREATE INDEX IF NOT EXISTS idx_sites_hidden ON sites (hidden);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  tags_text TEXT NOT NULL,
  digest TEXT NOT NULL,
  published_at TEXT NOT NULL,
  search_text TEXT NOT NULL,
  visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_site_slug ON posts (site_id, slug);
CREATE INDEX IF NOT EXISTS idx_posts_search ON posts (visible, published_at, id);
CREATE INDEX IF NOT EXISTS idx_posts_site ON posts (site_id);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  site_url TEXT NOT NULL,
  status TEXT NOT NULL,
  site_id TEXT,
  message TEXT NOT NULL DEFAULT '',
  requester_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_submissions_site_status ON submissions (site_url, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions (status, updated_at);

CREATE TABLE IF NOT EXISTS crawl_runs (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  site_url TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_crawl_runs_submission ON crawl_runs (submission_id, started_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
