CREATE TABLE IF NOT EXISTS email_delivery_attempts (
  id TEXT PRIMARY KEY,
  recipient_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('verification','password_reset','account_deletion','event_invitation','professional_assignment')),
  status TEXT NOT NULL CHECK (status IN ('sent','failed')),
  provider_message_id TEXT,
  error_code TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_delivery_created
ON email_delivery_attempts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_delivery_recipient
ON email_delivery_attempts(recipient_hash,created_at DESC);
