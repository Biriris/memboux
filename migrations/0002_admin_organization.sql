ALTER TABLE events ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived'));
ALTER TABLE events ADD COLUMN notes TEXT NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN updated_at INTEGER;

UPDATE events SET updated_at = created_at WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_events_status_created ON events(status, created_at DESC);
