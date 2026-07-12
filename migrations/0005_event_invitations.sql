CREATE TABLE IF NOT EXISTS event_invitations (
  id TEXT NOT NULL PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'viewer')),
  invited_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER,
  UNIQUE (event_id, email)
);

CREATE INDEX IF NOT EXISTS idx_event_invitations_email
  ON event_invitations(email, accepted_at, expires_at);
