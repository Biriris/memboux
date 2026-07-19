ALTER TABLE event_invitations ADD COLUMN invitation_kind TEXT NOT NULL DEFAULT 'member'
  CHECK (invitation_kind IN ('member','professional'));

CREATE TABLE IF NOT EXISTS account_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
  invitation_id TEXT REFERENCES event_invitations(id) ON DELETE SET NULL,
  actor_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  actor_name TEXT,
  type TEXT NOT NULL CHECK (type IN ('invitation_accepted','media_uploaded')),
  item_count INTEGER NOT NULL DEFAULT 1 CHECK (item_count > 0),
  created_at INTEGER NOT NULL,
  read_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_account_notifications_user_unread
ON account_notifications(user_id,read_at,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_account_notifications_event
ON account_notifications(event_id,created_at DESC);

CREATE TABLE IF NOT EXISTS event_covers (
  event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  source_media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  updated_at INTEGER NOT NULL
);
