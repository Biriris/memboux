ALTER TABLE event_wedding_profiles
ADD COLUMN template_key TEXT NOT NULL DEFAULT 'cypress';

ALTER TABLE event_wedding_profiles
ADD COLUMN publish_status TEXT NOT NULL DEFAULT 'draft';

ALTER TABLE event_wedding_profiles
ADD COLUMN accent_color TEXT;

CREATE INDEX IF NOT EXISTS idx_wedding_profiles_public_page
ON event_wedding_profiles(publish_status, template_key, updated_at DESC);
