CREATE TABLE IF NOT EXISTS admin_members (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','administrator','operations','support','finance','moderator','analyst')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  granted_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  granted_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_admin_access_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_admin_members_role_status
ON admin_members(role, status);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  ip_hash TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created
ON admin_audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor
ON admin_audit_log(actor_user_id, created_at DESC);
