CREATE TABLE IF NOT EXISTS shell_names (
  name TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  forest TEXT NOT NULL,
  site_url TEXT NOT NULL,
  public_key TEXT NOT NULL,
  bundle_fingerprint TEXT NOT NULL DEFAULT '',
  record_json TEXT NOT NULL,
  signature TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  hidden INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  search_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shell_names_public_key ON shell_names(public_key);
CREATE INDEX IF NOT EXISTS idx_shell_names_status_expires ON shell_names(status, hidden, expires_at);
CREATE INDEX IF NOT EXISTS idx_shell_names_updated ON shell_names(updated_at);
