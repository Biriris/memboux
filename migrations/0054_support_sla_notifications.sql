ALTER TABLE support_conversations ADD COLUMN sla_reminder_status TEXT
CHECK (sla_reminder_status IN ('pending','sent','failed','unassigned','disabled','invalid_recipient'));
ALTER TABLE support_conversations ADD COLUMN sla_reminder_last_attempt_at INTEGER;
ALTER TABLE support_conversations ADD COLUMN sla_reminder_sent_at INTEGER;

ALTER TABLE support_conversations ADD COLUMN sla_escalation_status TEXT
CHECK (sla_escalation_status IN ('pending','sent','failed','unassigned','disabled','invalid_recipient'));
ALTER TABLE support_conversations ADD COLUMN sla_escalation_last_attempt_at INTEGER;
ALTER TABLE support_conversations ADD COLUMN sla_escalation_sent_at INTEGER;
ALTER TABLE support_conversations ADD COLUMN sla_notification_last_error TEXT;

CREATE INDEX idx_support_sla_reminders
ON support_conversations(first_admin_response_at,first_response_due_at,sla_reminder_sent_at,sla_escalation_sent_at);
