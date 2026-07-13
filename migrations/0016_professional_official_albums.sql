ALTER TABLE media ADD COLUMN origin TEXT NOT NULL DEFAULT 'guest' CHECK (origin IN ('guest','official'));
ALTER TABLE media ADD COLUMN uploaded_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS professional_profiles (
  user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  bio TEXT NOT NULL DEFAULT '',
  website TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS event_professional_assignments (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  professional_user_id TEXT NOT NULL REFERENCES professional_profiles(user_id) ON DELETE CASCADE,
  assigned_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','accepted','revoked')),
  created_at INTEGER NOT NULL,
  accepted_at INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (event_id,professional_user_id)
);

CREATE TABLE IF NOT EXISTS official_album_items (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  added_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (event_id,media_id)
);

CREATE INDEX IF NOT EXISTS idx_professional_assignments_user_status
ON event_professional_assignments(professional_user_id,status,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_official_album_event_position
ON official_album_items(event_id,position,created_at);

CREATE INDEX IF NOT EXISTS idx_media_event_origin
ON media(event_id,origin,deleted_at,reported_at);
