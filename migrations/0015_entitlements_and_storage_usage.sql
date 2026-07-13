CREATE TABLE IF NOT EXISTS account_entitlements (
  user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  plan_key TEXT NOT NULL DEFAULT 'beta' CHECK (plan_key IN ('beta','pro','studio','custom')),
  storage_limit_bytes INTEGER NOT NULL DEFAULT 21474836480 CHECK (storage_limit_bytes > 0),
  event_limit INTEGER NOT NULL DEFAULT 25 CHECK (event_limit > 0),
  member_limit INTEGER NOT NULL DEFAULT 25 CHECK (member_limit > 0),
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS account_storage_usage (
  user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  used_bytes INTEGER NOT NULL DEFAULT 0 CHECK (used_bytes >= 0),
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO account_entitlements (user_id,plan_key,storage_limit_bytes,event_limit,member_limit,updated_at)
SELECT id,'beta',21474836480,25,25,CAST(unixepoch()*1000 AS INTEGER) FROM "user";

INSERT OR REPLACE INTO account_storage_usage (user_id,used_bytes,updated_at)
SELECT em.user_id,COALESCE(SUM(m.size_bytes),0),CAST(unixepoch()*1000 AS INTEGER)
FROM event_members em
LEFT JOIN media m ON m.event_id=em.event_id
WHERE em.role='owner'
GROUP BY em.user_id;

CREATE TABLE IF NOT EXISTS account_event_usage (
  user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  active_events INTEGER NOT NULL DEFAULT 0 CHECK (active_events >= 0),
  updated_at INTEGER NOT NULL
);

INSERT OR REPLACE INTO account_event_usage (user_id,active_events,updated_at)
SELECT u.id,COALESCE(SUM(CASE WHEN em.role='owner' AND e.deleted_at IS NULL THEN 1 ELSE 0 END),0),CAST(unixepoch()*1000 AS INTEGER)
FROM "user" u
LEFT JOIN event_members em ON em.user_id=u.id
LEFT JOIN events e ON e.id=em.event_id
GROUP BY u.id;

CREATE INDEX IF NOT EXISTS idx_account_entitlements_plan ON account_entitlements(plan_key);
