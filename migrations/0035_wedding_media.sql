-- Pre-wedding media gallery for wedding events.
-- Each wedding event can upload photos to a dedicated pre-wedding gallery,
-- separate from the guest event gallery. These photos can then be assigned
-- to portrait slots (hero, story, divider_1, divider_2, divider_3).

CREATE TABLE IF NOT EXISTS event_wedding_media (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK(media_type IN ('image','video')),
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_at INTEGER NOT NULL,
  uploaded_by_user_id TEXT,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wedding_media_event
ON event_wedding_media(event_id, uploaded_at);
