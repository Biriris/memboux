PRAGMA foreign_keys = OFF;

CREATE TABLE account_notifications_next (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
  invitation_id TEXT REFERENCES event_invitations(id) ON DELETE SET NULL,
  actor_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  actor_name TEXT,
  type TEXT NOT NULL CHECK (type IN (
    'invitation_accepted',
    'media_uploaded',
    'trial_ending_3d',
    'trial_ending_1d',
    'trial_expired'
  )),
  item_count INTEGER NOT NULL DEFAULT 1 CHECK (item_count > 0),
  created_at INTEGER NOT NULL,
  read_at INTEGER
);

INSERT INTO account_notifications_next (
  id,user_id,event_id,invitation_id,actor_user_id,actor_name,
  type,item_count,created_at,read_at
)
SELECT
  id,user_id,event_id,invitation_id,actor_user_id,actor_name,
  type,item_count,created_at,read_at
FROM account_notifications;

DROP TABLE account_notifications;
ALTER TABLE account_notifications_next RENAME TO account_notifications;

CREATE INDEX idx_account_notifications_user_unread
ON account_notifications(user_id,read_at,created_at DESC);

CREATE INDEX idx_account_notifications_event
ON account_notifications(event_id,created_at DESC);

CREATE UNIQUE INDEX idx_account_trial_notification_once
ON account_notifications(user_id,event_id,type)
WHERE type IN ('trial_ending_3d','trial_ending_1d','trial_expired');

PRAGMA foreign_keys = ON;
