ALTER TABLE events ADD COLUMN location_place_id TEXT;
ALTER TABLE events ADD COLUMN location_lat REAL;
ALTER TABLE events ADD COLUMN location_lng REAL;
ALTER TABLE events ADD COLUMN location_provider TEXT;

CREATE INDEX IF NOT EXISTS idx_events_location_coordinates
ON events(location_lat, location_lng);
