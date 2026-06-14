CREATE TABLE IF NOT EXISTS site_moves (
  id TEXT PRIMARY KEY,
  from_site_id TEXT NOT NULL,
  to_site_id TEXT NOT NULL,
  from_url TEXT NOT NULL,
  to_url TEXT NOT NULL,
  public_key TEXT NOT NULL,
  bundle_fingerprint TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('move', 'mirror')),
  status TEXT NOT NULL CHECK (status IN ('moved', 'mirror')),
  record_json TEXT NOT NULL,
  signature TEXT NOT NULL,
  created_at TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_site_moves_signature ON site_moves(signature);
CREATE INDEX IF NOT EXISTS idx_site_moves_from_site ON site_moves(from_site_id);
CREATE INDEX IF NOT EXISTS idx_site_moves_to_site ON site_moves(to_site_id);
CREATE INDEX IF NOT EXISTS idx_site_moves_public_key ON site_moves(public_key);
CREATE INDEX IF NOT EXISTS idx_site_moves_from_to_key ON site_moves(from_url, to_url, public_key);
