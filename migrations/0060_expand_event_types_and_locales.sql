-- D1 keeps foreign-key actions active while constraints are deferred. Avoid
-- rebuilding the parent events table because that would cascade into every
-- event-owned table. Preserve the original constrained columns as legacy data
-- and make the expanded columns the canonical application fields.

ALTER TABLE events RENAME COLUMN default_locale TO default_locale_legacy;
ALTER TABLE events ADD COLUMN default_locale TEXT NOT NULL DEFAULT 'el'
  CHECK (default_locale IN ('el', 'en', 'fr', 'de', 'es', 'it'));
UPDATE events SET default_locale = default_locale_legacy;

ALTER TABLE events RENAME COLUMN event_type TO event_type_legacy;
ALTER TABLE events ADD COLUMN event_type TEXT NOT NULL DEFAULT 'other'
  CHECK (event_type IN (
    'wedding',
    'engagement',
    'bachelor',
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
UPDATE events SET event_type = event_type_legacy;

-- SQLite follows renamed columns when maintaining indexes, so the existing
-- event-type index now points at event_type_legacy. Recreate it for the new
-- canonical column.
DROP INDEX idx_events_event_type;
CREATE INDEX idx_events_event_type ON events(event_type);

-- OAuth state is a short-lived child of user and has no dependent tables, so
-- it can be rebuilt without risking cascading deletion of application data.
CREATE TABLE cloud_oauth_states_next (
  state_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_drive', 'dropbox')),
  locale TEXT NOT NULL CHECK (locale IN ('el', 'en', 'fr', 'de', 'es', 'it')),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

INSERT INTO cloud_oauth_states_next (
  state_hash, user_id, provider, locale, expires_at, created_at
)
SELECT state_hash, user_id, provider, locale, expires_at, created_at
FROM cloud_oauth_states;

DROP TABLE cloud_oauth_states;
ALTER TABLE cloud_oauth_states_next RENAME TO cloud_oauth_states;
CREATE INDEX idx_cloud_oauth_states_expiry ON cloud_oauth_states(expires_at);
