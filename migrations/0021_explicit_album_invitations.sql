ALTER TABLE event_invitations ADD COLUMN token_hash TEXT;
ALTER TABLE event_invitations ADD COLUMN declined_at INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_invitations_token_hash
ON event_invitations(token_hash)
WHERE token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_invitations_pending_email
ON event_invitations(email, accepted_at, declined_at, expires_at);
