CREATE TABLE IF NOT EXISTS support_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  visitor_token_hash TEXT,
  visitor_name TEXT NOT NULL DEFAULT '',
  visitor_email TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','closed')),
  admin_read_at INTEGER,
  user_read_at INTEGER,
  last_message_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user','admin','system')),
  sender_user_id TEXT,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES support_conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_user_id) REFERENCES "user"(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_support_conversations_inbox
ON support_conversations(status, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_conversations_user
ON support_conversations(user_id, last_message_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_conversations_visitor_token
ON support_conversations(visitor_token_hash)
WHERE visitor_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_support_messages_thread
ON support_messages(conversation_id, created_at ASC);
