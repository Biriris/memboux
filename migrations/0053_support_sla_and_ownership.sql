ALTER TABLE support_conversations
ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'
CHECK (priority IN ('low','normal','high','urgent'));

ALTER TABLE support_conversations
ADD COLUMN first_response_due_at INTEGER;

ALTER TABLE support_conversations
ADD COLUMN first_admin_response_at INTEGER;

ALTER TABLE support_conversations
ADD COLUMN resolved_at INTEGER;

UPDATE support_conversations
SET priority = CASE
  WHEN category IN ('privacy','moderation') THEN 'urgent'
  WHEN category IN ('billing','account') THEN 'high'
  ELSE 'normal'
END,
first_response_due_at = COALESCE(first_response_due_at, escalated_at + CASE
  WHEN category IN ('privacy','moderation') THEN 3600000
  WHEN category IN ('billing','account') THEN 14400000
  ELSE 43200000
END)
WHERE escalated_at IS NOT NULL;

CREATE INDEX idx_support_sla_queue
ON support_conversations(status,first_admin_response_at,first_response_due_at,priority);
