ALTER TABLE event_wedding_profiles
ADD COLUMN ceremony_place_id TEXT;

ALTER TABLE event_wedding_profiles
ADD COLUMN ceremony_lat REAL;

ALTER TABLE event_wedding_profiles
ADD COLUMN ceremony_lng REAL;

ALTER TABLE event_wedding_profiles
ADD COLUMN reception_place_id TEXT;

ALTER TABLE event_wedding_profiles
ADD COLUMN reception_lat REAL;

ALTER TABLE event_wedding_profiles
ADD COLUMN reception_lng REAL;

CREATE TABLE IF NOT EXISTS event_wedding_menus (
  event_id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  updated_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES user(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_wedding_menus_updated
ON event_wedding_menus(updated_at DESC);
