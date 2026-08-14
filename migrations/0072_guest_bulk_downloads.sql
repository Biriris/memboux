ALTER TABLE event_experience_settings
ADD COLUMN guest_bulk_downloads_enabled INTEGER NOT NULL DEFAULT 1
CHECK (guest_bulk_downloads_enabled IN (0,1));
