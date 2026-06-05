ALTER TABLE sites ADD COLUMN last_checked_at TEXT NOT NULL DEFAULT '';
ALTER TABLE sites ADD COLUMN next_check_at TEXT NOT NULL DEFAULT '';
ALTER TABLE sites ADD COLUMN check_interval_minutes INTEGER NOT NULL DEFAULT 60;
ALTER TABLE sites ADD COLUMN unchanged_check_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sites ADD COLUMN failure_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sites ADD COLUMN pending_fingerprint TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_sites_next_check ON sites (hidden, next_check_at, id);
