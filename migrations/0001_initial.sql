CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  couple TEXT NOT NULL,
  admin_token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  content_type TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  uploaded_at INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_events_code ON events(code);
CREATE INDEX IF NOT EXISTS idx_media_event_uploaded ON media(event_id, uploaded_at DESC);
