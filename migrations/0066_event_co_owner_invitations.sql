PRAGMA foreign_keys = OFF;

CREATE TABLE event_invitation_notification_links_0066 (
  notification_id TEXT PRIMARY KEY,
  invitation_id TEXT NOT NULL
);

INSERT INTO event_invitation_notification_links_0066 (notification_id,invitation_id)
SELECT id,invitation_id
FROM account_notifications
WHERE invitation_id IS NOT NULL;

CREATE TABLE event_invitations_next (
  id TEXT NOT NULL PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor', 'viewer')),
  invited_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER,
  token_hash TEXT,
  declined_at INTEGER,
  invitation_kind TEXT NOT NULL DEFAULT 'member'
    CHECK (invitation_kind IN ('member','professional')),
  UNIQUE (event_id, email)
);

INSERT INTO event_invitations_next (
  id,event_id,email,role,invited_by,created_at,expires_at,accepted_at,
  token_hash,declined_at,invitation_kind
)
SELECT
  id,event_id,email,role,invited_by,created_at,expires_at,accepted_at,
  token_hash,declined_at,invitation_kind
FROM event_invitations;

DROP TABLE event_invitations;
ALTER TABLE event_invitations_next RENAME TO event_invitations;

CREATE INDEX idx_event_invitations_email
ON event_invitations(email, accepted_at, expires_at);

CREATE UNIQUE INDEX idx_event_invitations_token_hash
ON event_invitations(token_hash)
WHERE token_hash IS NOT NULL;

CREATE INDEX idx_event_invitations_pending_email
ON event_invitations(email, accepted_at, declined_at, expires_at);

UPDATE account_notifications
SET invitation_id=(
  SELECT links.invitation_id
  FROM event_invitation_notification_links_0066 links
  WHERE links.notification_id=account_notifications.id
)
WHERE id IN (SELECT notification_id FROM event_invitation_notification_links_0066);

DROP TABLE event_invitation_notification_links_0066;

PRAGMA foreign_keys = ON;
