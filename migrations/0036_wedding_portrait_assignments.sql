-- Assign pre-wedding media to visual slots used by the public wedding page.
-- This intentionally uses a new table name so environments that received the
-- earlier, incorrect media foreign key can migrate safely without rebuilding it.

CREATE TABLE IF NOT EXISTS event_wedding_portrait_assignments (
  event_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  slot TEXT NOT NULL CHECK(slot IN ('hero','story','divider_1','divider_2','divider_3')),
  position INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, slot),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (media_id) REFERENCES event_wedding_media(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wedding_portrait_assignments_event
ON event_wedding_portrait_assignments(event_id, slot);
