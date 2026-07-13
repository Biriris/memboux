ALTER TABLE media ADD COLUMN reported_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_media_reported
ON media(reported_at, deleted_at);
