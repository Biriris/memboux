ALTER TABLE events ADD COLUMN deleted_at INTEGER;
ALTER TABLE events ADD COLUMN purge_at INTEGER;
ALTER TABLE media ADD COLUMN title TEXT;
ALTER TABLE media ADD COLUMN deleted_at INTEGER;
ALTER TABLE media ADD COLUMN purge_at INTEGER;

UPDATE media SET title = uploaded_by WHERE title IS NULL;

CREATE INDEX IF NOT EXISTS idx_events_deleted_purge ON events(deleted_at, purge_at);
CREATE INDEX IF NOT EXISTS idx_media_deleted_purge ON media(deleted_at, purge_at);

