CREATE TABLE IF NOT EXISTS event_wedding_profiles (
  event_id TEXT PRIMARY KEY,
  partner_one_name TEXT NOT NULL DEFAULT '',
  partner_two_name TEXT NOT NULL DEFAULT '',
  welcome_message TEXT NOT NULL DEFAULT '',
  story TEXT NOT NULL DEFAULT '',
  ceremony_at TEXT,
  ceremony_location TEXT NOT NULL DEFAULT '',
  reception_at TEXT,
  reception_location TEXT NOT NULL DEFAULT '',
  dress_code TEXT NOT NULL DEFAULT '',
  contact_name TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  travel_notes TEXT NOT NULL DEFAULT '',
  accommodation_notes TEXT NOT NULL DEFAULT '',
  gift_message TEXT NOT NULL DEFAULT '',
  gift_url TEXT NOT NULL DEFAULT '',
  wizard_step INTEGER NOT NULL DEFAULT 1 CHECK (wizard_step BETWEEN 1 AND 5),
  wizard_completed_at INTEGER,
  catalog_version TEXT NOT NULL DEFAULT 'wedding-2026-v1',
  estimated_total_minor INTEGER NOT NULL DEFAULT 3900,
  currency TEXT NOT NULL DEFAULT 'EUR',
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS event_wedding_features (
  event_id TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  price_minor INTEGER NOT NULL DEFAULT 0,
  catalog_version TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, feature_key),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wedding_profiles_completion
ON event_wedding_profiles(wizard_completed_at, updated_at DESC);
