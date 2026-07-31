CREATE TABLE support_attachments (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES support_conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES support_messages(id) ON DELETE CASCADE
);

CREATE INDEX idx_support_attachments_message
  ON support_attachments(message_id, created_at);

CREATE INDEX idx_support_attachments_conversation
  ON support_attachments(conversation_id, created_at);
