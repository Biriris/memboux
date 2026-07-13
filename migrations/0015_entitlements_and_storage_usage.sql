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

CREATE TRIGGER IF NOT EXISTS user_entitlement_after_insert
AFTER INSERT ON "user"
BEGIN
  INSERT OR IGNORE INTO account_entitlements (user_id,plan_key,storage_limit_bytes,event_limit,member_limit,updated_at)
  VALUES (NEW.id,'beta',21474836480,25,25,CAST(unixepoch()*1000 AS INTEGER));
  INSERT OR IGNORE INTO account_storage_usage (user_id,used_bytes,updated_at)
  VALUES (NEW.id,0,CAST(unixepoch()*1000 AS INTEGER));
END;

CREATE TRIGGER IF NOT EXISTS media_storage_quota_before_insert
BEFORE INSERT ON media
WHEN EXISTS (SELECT 1 FROM event_members WHERE event_id=NEW.event_id AND role='owner')
BEGIN
  SELECT CASE WHEN
    COALESCE((SELECT su.used_bytes FROM account_storage_usage su WHERE su.user_id=(SELECT user_id FROM event_members WHERE event_id=NEW.event_id AND role='owner' LIMIT 1)),0) + NEW.size_bytes
    > COALESCE((SELECT ae.storage_limit_bytes FROM account_entitlements ae WHERE ae.user_id=(SELECT user_id FROM event_members WHERE event_id=NEW.event_id AND role='owner' LIMIT 1)),21474836480)
  THEN RAISE(ABORT,'storage_quota_exceeded') END;
END;

CREATE TRIGGER IF NOT EXISTS media_storage_usage_after_insert
AFTER INSERT ON media
WHEN EXISTS (SELECT 1 FROM event_members WHERE event_id=NEW.event_id AND role='owner')
BEGIN
  INSERT INTO account_storage_usage (user_id,used_bytes,updated_at)
  SELECT user_id,NEW.size_bytes,CAST(unixepoch()*1000 AS INTEGER)
  FROM event_members WHERE event_id=NEW.event_id AND role='owner' LIMIT 1
  ON CONFLICT(user_id) DO UPDATE SET used_bytes=used_bytes+NEW.size_bytes,updated_at=excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS media_storage_usage_after_delete
AFTER DELETE ON media
WHEN EXISTS (SELECT 1 FROM event_members WHERE event_id=OLD.event_id AND role='owner')
BEGIN
  UPDATE account_storage_usage
  SET used_bytes=MAX(0,used_bytes-OLD.size_bytes),updated_at=CAST(unixepoch()*1000 AS INTEGER)
  WHERE user_id=(SELECT user_id FROM event_members WHERE event_id=OLD.event_id AND role='owner' LIMIT 1);
END;

CREATE TRIGGER IF NOT EXISTS owned_event_quota_before_insert
BEFORE INSERT ON event_members
WHEN NEW.role='owner'
BEGIN
  SELECT CASE WHEN
    (SELECT COUNT(*) FROM event_members em JOIN events e ON e.id=em.event_id WHERE em.user_id=NEW.user_id AND em.role='owner' AND e.deleted_at IS NULL)
    >= COALESCE((SELECT event_limit FROM account_entitlements WHERE user_id=NEW.user_id),25)
  THEN RAISE(ABORT,'event_quota_exceeded') END;
END;

CREATE TRIGGER IF NOT EXISTS collaborator_quota_before_invitation
BEFORE INSERT ON event_invitations
WHEN EXISTS (SELECT 1 FROM event_members WHERE event_id=NEW.event_id AND role='owner')
BEGIN
  SELECT CASE WHEN
    (SELECT COUNT(*) FROM event_members WHERE event_id=NEW.event_id AND role!='owner') +
    (SELECT COUNT(*) FROM event_invitations WHERE event_id=NEW.event_id AND accepted_at IS NULL AND expires_at>CAST(unixepoch()*1000 AS INTEGER) AND lower(email)<>lower(NEW.email))
    >= COALESCE((SELECT ae.member_limit FROM account_entitlements ae WHERE ae.user_id=(SELECT user_id FROM event_members WHERE event_id=NEW.event_id AND role='owner' LIMIT 1)),25)
  THEN RAISE(ABORT,'collaborator_quota_exceeded') END;
END;

CREATE TRIGGER IF NOT EXISTS collaborator_quota_before_member
BEFORE INSERT ON event_members
WHEN NEW.role!='owner' AND EXISTS (SELECT 1 FROM event_members WHERE event_id=NEW.event_id AND role='owner')
BEGIN
  SELECT CASE WHEN
    (SELECT COUNT(*) FROM event_members WHERE event_id=NEW.event_id AND role!='owner')
    >= COALESCE((SELECT ae.member_limit FROM account_entitlements ae WHERE ae.user_id=(SELECT user_id FROM event_members WHERE event_id=NEW.event_id AND role='owner' LIMIT 1)),25)
  THEN RAISE(ABORT,'collaborator_quota_exceeded') END;
END;

CREATE INDEX IF NOT EXISTS idx_account_entitlements_plan ON account_entitlements(plan_key);
