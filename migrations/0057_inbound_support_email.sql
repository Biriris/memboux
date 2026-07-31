-- Make email replies a first-class, replay-safe part of the helpdesk timeline.

ALTER TABLE support_messages ADD COLUMN inbound_email_message_id TEXT;
ALTER TABLE support_messages ADD COLUMN inbound_email_from TEXT;
ALTER TABLE support_messages ADD COLUMN inbound_email_to TEXT;

CREATE UNIQUE INDEX idx_support_message_inbound_email
ON support_messages(inbound_email_message_id)
WHERE inbound_email_message_id IS NOT NULL;
