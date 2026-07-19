ALTER TABLE events
ADD COLUMN event_type TEXT NOT NULL DEFAULT 'other'
CHECK (event_type IN (
  'wedding',
  'engagement',
  'birthday',
  'party',
  'baptism',
  'baby',
  'graduation',
  'corporate',
  'trip',
  'reunion',
  'community',
  'memorial',
  'other'
));

CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
