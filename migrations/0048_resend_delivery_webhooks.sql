ALTER TABLE email_delivery_attempts ADD COLUMN delivery_outcome TEXT
  CHECK (delivery_outcome IN (
    'accepted','delivered','delayed','bounced','complained','failed'
  ));
ALTER TABLE email_delivery_attempts ADD COLUMN delivery_event_at INTEGER;

ALTER TABLE support_messages ADD COLUMN email_provider_message_id TEXT;
ALTER TABLE support_messages ADD COLUMN email_delivery_outcome TEXT
  CHECK (email_delivery_outcome IN (
    'accepted','delivered','delayed','bounced','complained','failed'
  ));
ALTER TABLE support_messages ADD COLUMN email_delivery_event_at INTEGER;

ALTER TABLE support_conversations ADD COLUMN notification_provider_message_id TEXT;
ALTER TABLE support_conversations ADD COLUMN notification_delivery_outcome TEXT
  CHECK (notification_delivery_outcome IN (
    'accepted','delivered','delayed','bounced','complained','failed'
  ));
ALTER TABLE support_conversations ADD COLUMN notification_delivery_event_at INTEGER;

CREATE TABLE resend_webhook_events (
  svix_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  provider_message_id TEXT NOT NULL,
  event_created_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE INDEX idx_email_delivery_provider_message
ON email_delivery_attempts(provider_message_id);

CREATE INDEX idx_support_message_email_provider
ON support_messages(email_provider_message_id)
WHERE email_provider_message_id IS NOT NULL;

CREATE INDEX idx_support_notification_email_provider
ON support_conversations(notification_provider_message_id)
WHERE notification_provider_message_id IS NOT NULL;

CREATE INDEX idx_resend_webhook_received
ON resend_webhook_events(received_at DESC);

