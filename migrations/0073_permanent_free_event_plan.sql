-- Replace the expiring trial with a real, non-expiring Free event plan.
-- Existing trial/expired trial events are preserved as active Free events.

INSERT OR IGNORE INTO commerce_products (
  product_key,scope,billing_model,
  name_en,name_el,name_fr,name_de,name_es,name_it,
  description_en,description_el,description_fr,description_de,description_es,description_it,
  amount_minor,currency,media_limit,event_duration_days,
  guest_access_enabled,original_downloads_enabled,
  active,checkout_enabled,sort_order,created_at,updated_at
) VALUES (
  'event_free','event','one_time',
  'Free','Free','Free','Free','Free','Free',
  'A complete event experience for up to 50 photos or videos.',
  'Πλήρης εμπειρία event για έως 50 φωτογραφίες ή βίντεο.',
  'Une expérience événement complète pour 50 photos ou vidéos maximum.',
  'Ein vollständiges Event-Erlebnis für bis zu 50 Fotos oder Videos.',
  'Una experiencia de evento completa para hasta 50 fotos o vídeos.',
  'Un’esperienza evento completa per un massimo di 50 foto o video.',
  0,'EUR',50,NULL,1,1,1,1,0,
  unixepoch('now') * 1000,unixepoch('now') * 1000
);

DROP TRIGGER IF EXISTS media_trial_limit_before_insert;
DROP TRIGGER IF EXISTS media_trial_usage_after_insert;
DROP TRIGGER IF EXISTS wedding_media_trial_limit_before_insert;
DROP TRIGGER IF EXISTS wedding_media_trial_usage_after_insert;
DROP TRIGGER IF EXISTS media_trial_limit_before_restore;
DROP TRIGGER IF EXISTS multipart_trial_limit_before_insert;

ALTER TABLE event_access RENAME TO event_access_0073_old;

CREATE TABLE event_access (
  event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  access_state TEXT NOT NULL DEFAULT 'preview'
    CHECK (access_state IN ('preview','free','unlocked','expired')),
  enforcement_state TEXT NOT NULL DEFAULT 'observe'
    CHECK (enforcement_state IN ('observe','enforced')),
  plan_key TEXT REFERENCES commerce_products(product_key) ON DELETE RESTRICT,
  media_limit INTEGER NOT NULL DEFAULT 50 CHECK (media_limit >= 0),
  media_uploads_consumed INTEGER NOT NULL DEFAULT 0
    CHECK (media_uploads_consumed >= 0),
  guest_access_enabled INTEGER NOT NULL DEFAULT 0
    CHECK (guest_access_enabled IN (0,1)),
  guest_uploads_enabled INTEGER NOT NULL DEFAULT 0
    CHECK (guest_uploads_enabled IN (0,1)),
  original_downloads_enabled INTEGER NOT NULL DEFAULT 0
    CHECK (original_downloads_enabled IN (0,1)),
  unlocked_at INTEGER,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO event_access (
  event_id,access_state,enforcement_state,plan_key,media_limit,
  media_uploads_consumed,guest_access_enabled,guest_uploads_enabled,
  original_downloads_enabled,unlocked_at,expires_at,created_at,updated_at
)
SELECT
  event_id,
  CASE
    WHEN access_state IN ('trial','expired') THEN 'free'
    ELSE access_state
  END,
  enforcement_state,
  CASE
    WHEN access_state IN ('trial','expired') THEN 'event_free'
    ELSE NULL
  END,
  CASE
    WHEN access_state IN ('preview','trial','expired') THEN MAX(media_limit,50)
    ELSE media_limit
  END,
  MAX(
    media_uploads_consumed,
    (SELECT COUNT(*) FROM media m WHERE m.event_id=event_access_0073_old.event_id)
      + (SELECT COUNT(*) FROM event_wedding_media wm WHERE wm.event_id=event_access_0073_old.event_id)
  ),
  CASE WHEN access_state IN ('trial','expired') THEN 1 ELSE guest_access_enabled END,
  CASE WHEN access_state IN ('trial','expired') THEN 1 ELSE guest_uploads_enabled END,
  CASE WHEN access_state IN ('trial','expired') THEN 1 ELSE original_downloads_enabled END,
  unlocked_at,
  CASE WHEN access_state IN ('trial','expired') THEN NULL ELSE expires_at END,
  created_at,
  unixepoch('now') * 1000
FROM event_access_0073_old;

DROP TABLE event_access_0073_old;

CREATE INDEX idx_event_access_state
ON event_access(access_state,enforcement_state,updated_at DESC);

CREATE INDEX idx_event_access_plan
ON event_access(plan_key,access_state,updated_at DESC);

CREATE TRIGGER media_event_limit_before_insert
BEFORE INSERT ON media
WHEN EXISTS (
  SELECT 1 FROM event_access access
  WHERE access.event_id=NEW.event_id
    AND access.enforcement_state='enforced'
    AND (
      access.access_state='expired'
      OR access.media_uploads_consumed >= access.media_limit
    )
)
BEGIN
  SELECT RAISE(ABORT, 'event_media_limit_reached');
END;

CREATE TRIGGER media_event_usage_after_insert
AFTER INSERT ON media
WHEN EXISTS (
  SELECT 1 FROM event_access access
  WHERE access.event_id=NEW.event_id
    AND access.enforcement_state='enforced'
    AND access.access_state IN ('preview','free','unlocked')
)
BEGIN
  UPDATE event_access
  SET media_uploads_consumed=media_uploads_consumed + 1,
      updated_at=CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE event_id=NEW.event_id;
END;

CREATE TRIGGER wedding_media_event_limit_before_insert
BEFORE INSERT ON event_wedding_media
WHEN EXISTS (
  SELECT 1 FROM event_access access
  WHERE access.event_id=NEW.event_id
    AND access.enforcement_state='enforced'
    AND (
      access.access_state='expired'
      OR access.media_uploads_consumed >= access.media_limit
    )
)
BEGIN
  SELECT RAISE(ABORT, 'event_media_limit_reached');
END;

CREATE TRIGGER wedding_media_event_usage_after_insert
AFTER INSERT ON event_wedding_media
WHEN EXISTS (
  SELECT 1 FROM event_access access
  WHERE access.event_id=NEW.event_id
    AND access.enforcement_state='enforced'
    AND access.access_state IN ('preview','free','unlocked')
)
BEGIN
  UPDATE event_access
  SET media_uploads_consumed=media_uploads_consumed + 1,
      updated_at=CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE event_id=NEW.event_id;
END;

CREATE TRIGGER media_event_limit_before_restore
BEFORE UPDATE OF deleted_at ON media
WHEN OLD.deleted_at IS NOT NULL
  AND NEW.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM event_access access
    WHERE access.event_id=NEW.event_id
      AND access.enforcement_state='enforced'
      AND access.access_state='expired'
  )
BEGIN
  SELECT RAISE(ABORT, 'event_media_limit_reached');
END;

CREATE TRIGGER multipart_event_limit_before_insert
BEFORE INSERT ON multipart_upload_sessions
WHEN NEW.status IN ('uploading','completing')
  AND EXISTS (
    SELECT 1 FROM event_access access
    WHERE access.event_id=NEW.event_id
      AND access.enforcement_state='enforced'
      AND (
        access.access_state='expired'
        OR access.media_uploads_consumed
          + (SELECT COUNT(*) FROM multipart_upload_sessions session
             WHERE session.event_id=NEW.event_id
               AND session.status IN ('uploading','completing')
               AND session.expires_at > CAST(strftime('%s','now') AS INTEGER) * 1000)
          >= access.media_limit
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'event_media_limit_reached');
END;
