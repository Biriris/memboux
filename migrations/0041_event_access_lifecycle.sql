-- Provider-neutral event lifecycle. Enforcement deliberately starts in "observe"
-- mode, so existing and newly created events keep working until paid plans launch.
CREATE TABLE IF NOT EXISTS event_access (
  event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  access_state TEXT NOT NULL DEFAULT 'preview'
    CHECK (access_state IN ('preview','trial','unlocked','expired')),
  enforcement_state TEXT NOT NULL DEFAULT 'observe'
    CHECK (enforcement_state IN ('observe','enforced')),
  media_limit INTEGER NOT NULL DEFAULT 20 CHECK (media_limit >= 0),
  guest_access_enabled INTEGER NOT NULL DEFAULT 0
    CHECK (guest_access_enabled IN (0,1)),
  guest_uploads_enabled INTEGER NOT NULL DEFAULT 0
    CHECK (guest_uploads_enabled IN (0,1)),
  original_downloads_enabled INTEGER NOT NULL DEFAULT 0
    CHECK (original_downloads_enabled IN (0,1)),
  trial_started_at INTEGER,
  trial_ends_at INTEGER,
  unlocked_at INTEGER,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Legacy events are explicitly preserved with full access. Observe mode means
-- no access gate is activated before the legal/payment launch decision.
INSERT OR IGNORE INTO event_access (
  event_id, access_state, enforcement_state, media_limit,
  guest_access_enabled, guest_uploads_enabled, original_downloads_enabled,
  unlocked_at, created_at, updated_at
)
SELECT id, 'unlocked', 'observe', 2147483647, 1, 1, 1,
       created_at, created_at, COALESCE(updated_at, created_at)
FROM events;

CREATE INDEX IF NOT EXISTS idx_event_access_state
ON event_access(access_state, enforcement_state, updated_at DESC);
