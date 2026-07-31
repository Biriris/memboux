PRAGMA foreign_keys = OFF;

CREATE TABLE email_delivery_attempts_next (
  id TEXT PRIMARY KEY,
  recipient_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN (
    'verification',
    'password_reset',
    'account_deletion',
    'event_invitation',
    'professional_assignment',
    'support_staff_notification',
    'support_customer_reply',
    'support_staff_test'
  )),
  status TEXT NOT NULL CHECK (status IN ('sent','failed')),
  provider_message_id TEXT,
  error_code TEXT,
  created_at INTEGER NOT NULL
);

INSERT INTO email_delivery_attempts_next
  (id,recipient_hash,purpose,status,provider_message_id,error_code,created_at)
SELECT id,recipient_hash,purpose,status,provider_message_id,error_code,created_at
FROM email_delivery_attempts;

DROP TABLE email_delivery_attempts;
ALTER TABLE email_delivery_attempts_next RENAME TO email_delivery_attempts;

CREATE INDEX idx_email_delivery_created
ON email_delivery_attempts(created_at DESC);

CREATE INDEX idx_email_delivery_recipient
ON email_delivery_attempts(recipient_hash,created_at DESC);

PRAGMA foreign_keys = ON;
