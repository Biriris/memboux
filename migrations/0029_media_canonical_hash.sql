ALTER TABLE media ADD COLUMN canonical_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_media_event_canonical_hash
ON media(event_id, canonical_hash)
WHERE canonical_hash IS NOT NULL AND deleted_at IS NULL;
