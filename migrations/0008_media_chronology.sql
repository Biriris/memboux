ALTER TABLE media ADD COLUMN captured_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_media_event_chronology
ON media(event_id, captured_at, uploaded_at);
