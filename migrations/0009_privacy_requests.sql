ALTER TABLE events ADD COLUMN gallery_pin_hash TEXT;

CREATE TABLE IF NOT EXISTS media_removal_requests (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_removal_requests_event_status
ON media_removal_requests(event_id, status, created_at DESC);
