-- The original wedding wizard shipped with five steps. The current flow has a
-- sixth review/publish step, so rebuild the profile table with the matching
-- constraint while preserving every existing profile and place coordinate.

CREATE TABLE event_wedding_profiles_v2 (
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
  wizard_step INTEGER NOT NULL DEFAULT 1 CHECK (wizard_step BETWEEN 1 AND 6),
  wizard_completed_at INTEGER,
  catalog_version TEXT NOT NULL DEFAULT 'wedding-2026-v1',
  estimated_total_minor INTEGER NOT NULL DEFAULT 3900,
  currency TEXT NOT NULL DEFAULT 'EUR',
  updated_at INTEGER NOT NULL,
  template_key TEXT NOT NULL DEFAULT 'cypress',
  publish_status TEXT NOT NULL DEFAULT 'draft',
  accent_color TEXT,
  ceremony_place_id TEXT,
  ceremony_lat REAL,
  ceremony_lng REAL,
  reception_place_id TEXT,
  reception_lat REAL,
  reception_lng REAL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

INSERT INTO event_wedding_profiles_v2 (
  event_id, partner_one_name, partner_two_name, welcome_message, story,
  ceremony_at, ceremony_location, reception_at, reception_location, dress_code,
  contact_name, contact_email, contact_phone, travel_notes, accommodation_notes,
  gift_message, gift_url, wizard_step, wizard_completed_at, catalog_version,
  estimated_total_minor, currency, updated_at, template_key, publish_status,
  accent_color, ceremony_place_id, ceremony_lat, ceremony_lng,
  reception_place_id, reception_lat, reception_lng
)
SELECT
  event_id, partner_one_name, partner_two_name, welcome_message, story,
  ceremony_at, ceremony_location, reception_at, reception_location, dress_code,
  contact_name, contact_email, contact_phone, travel_notes, accommodation_notes,
  gift_message, gift_url, wizard_step, wizard_completed_at, catalog_version,
  estimated_total_minor, currency, updated_at, template_key, publish_status,
  accent_color, ceremony_place_id, ceremony_lat, ceremony_lng,
  reception_place_id, reception_lat, reception_lng
FROM event_wedding_profiles;

DROP TABLE event_wedding_profiles;
ALTER TABLE event_wedding_profiles_v2 RENAME TO event_wedding_profiles;

CREATE INDEX idx_wedding_profiles_completion
ON event_wedding_profiles(wizard_completed_at, updated_at DESC);

CREATE INDEX idx_wedding_profiles_public_page
ON event_wedding_profiles(publish_status, template_key, updated_at DESC);
