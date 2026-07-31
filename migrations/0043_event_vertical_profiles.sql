CREATE TABLE event_vertical_profiles (
  event_id TEXT PRIMARY KEY,
  headline TEXT NOT NULL DEFAULT '',
  host_name TEXT NOT NULL DEFAULT '',
  introduction TEXT NOT NULL DEFAULT '',
  story TEXT NOT NULL DEFAULT '',
  schedule_notes TEXT NOT NULL DEFAULT '',
  guest_notes TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  theme_key TEXT NOT NULL DEFAULT 'signature'
    CHECK (theme_key IN ('signature','vivid','editorial','minimal')),
  wizard_step INTEGER NOT NULL DEFAULT 1 CHECK (wizard_step BETWEEN 1 AND 4),
  wizard_completed_at INTEGER,
  publish_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (publish_status IN ('draft','published')),
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX idx_event_vertical_profiles_completion
ON event_vertical_profiles(wizard_completed_at, updated_at DESC);

CREATE INDEX idx_event_vertical_profiles_publish
ON event_vertical_profiles(publish_status, theme_key, updated_at DESC);
