ALTER TABLE media ADD COLUMN content_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_media_event_content_hash
ON media(event_id, content_hash);
