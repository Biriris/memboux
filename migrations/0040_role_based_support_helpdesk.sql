ALTER TABLE admin_members ADD COLUMN notification_email TEXT;
ALTER TABLE admin_members ADD COLUMN support_notifications_enabled INTEGER NOT NULL DEFAULT 1;

ALTER TABLE support_conversations ADD COLUMN category TEXT NOT NULL DEFAULT 'general'
  CHECK (category IN ('technical','account','events','billing','privacy','moderation','general'));
ALTER TABLE support_conversations ADD COLUMN required_role TEXT;
ALTER TABLE support_conversations ADD COLUMN assigned_admin_member_id TEXT
  REFERENCES admin_members(id) ON DELETE SET NULL;
ALTER TABLE support_conversations ADD COLUMN escalated_at INTEGER;
ALTER TABLE support_conversations ADD COLUMN notification_sent_at INTEGER;
ALTER TABLE support_conversations ADD COLUMN source TEXT NOT NULL DEFAULT 'chat'
  CHECK (source IN ('chat','email'));

ALTER TABLE support_messages ADD COLUMN actor_admin_member_id TEXT
  REFERENCES admin_members(id) ON DELETE SET NULL;
ALTER TABLE support_messages ADD COLUMN email_delivery_status TEXT
  CHECK (email_delivery_status IN ('pending','sent','failed'));

CREATE INDEX IF NOT EXISTS idx_support_conversations_assignment
ON support_conversations(assigned_admin_member_id, status, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_conversations_department
ON support_conversations(required_role, status, last_message_at DESC);
