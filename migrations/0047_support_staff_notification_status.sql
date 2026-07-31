ALTER TABLE support_conversations ADD COLUMN notification_delivery_status TEXT
  CHECK (notification_delivery_status IN (
    'pending','sent','failed','disabled','invalid_recipient','unassigned'
  ));

ALTER TABLE support_conversations ADD COLUMN notification_last_attempt_at INTEGER;
ALTER TABLE support_conversations ADD COLUMN notification_last_error TEXT;

UPDATE support_conversations
SET notification_delivery_status='sent',
    notification_last_attempt_at=notification_sent_at
WHERE notification_sent_at IS NOT NULL;

CREATE INDEX idx_support_notification_failures
ON support_conversations(notification_delivery_status,last_message_at DESC)
WHERE notification_delivery_status='failed';
