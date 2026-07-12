ALTER TABLE events ADD COLUMN eventName TEXT;
UPDATE events SET eventName = couple WHERE eventName IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_event_name ON events(eventName);
