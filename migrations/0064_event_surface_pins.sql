ALTER TABLE events ADD COLUMN website_pin_hash TEXT;
ALTER TABLE events ADD COLUMN guest_gallery_pin_hash TEXT;
ALTER TABLE events ADD COLUMN official_album_pin_hash TEXT;

-- Preserve the protection level of events that used the former shared PIN.
UPDATE events
SET website_pin_hash = gallery_pin_hash,
    guest_gallery_pin_hash = gallery_pin_hash,
    official_album_pin_hash = gallery_pin_hash
WHERE gallery_pin_hash IS NOT NULL;
