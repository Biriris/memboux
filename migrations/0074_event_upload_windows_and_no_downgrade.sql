-- Keep event packages tied to a bounded contribution period and prevent a
-- premium event from being downgraded to Free after activation.

ALTER TABLE commerce_products ADD COLUMN upload_window_days INTEGER
  CHECK (upload_window_days IS NULL OR upload_window_days BETWEEN 1 AND 365);

UPDATE commerce_products
SET upload_window_days = CASE product_key
  WHEN 'event_free' THEN 14
  WHEN 'event_pass' THEN 45
  WHEN 'event_plus' THEN 90
  ELSE upload_window_days
END,
updated_at = unixepoch('now') * 1000
WHERE product_key IN ('event_free','event_pass','event_plus');

ALTER TABLE event_access ADD COLUMN upload_window_days INTEGER
  CHECK (upload_window_days IS NULL OR upload_window_days BETWEEN 1 AND 365);
ALTER TABLE event_access ADD COLUMN upload_window_started_at INTEGER;
ALTER TABLE event_access ADD COLUMN upload_window_ends_at INTEGER;
ALTER TABLE event_access ADD COLUMN premium_activated_at INTEGER;

UPDATE event_access
SET upload_window_days = CASE
      WHEN plan_key = 'event_free' OR access_state = 'free' THEN 14
      WHEN plan_key = 'event_plus' THEN 90
      WHEN plan_key = 'event_pass' THEN 45
      ELSE NULL
    END,
    premium_activated_at = CASE
      WHEN plan_key IS NOT NULL AND plan_key <> 'event_free'
        THEN COALESCE(unlocked_at,created_at)
      ELSE premium_activated_at
    END,
    updated_at = unixepoch('now') * 1000;

CREATE TRIGGER event_access_no_premium_to_free
BEFORE UPDATE OF access_state,plan_key,premium_activated_at ON event_access
WHEN OLD.premium_activated_at IS NOT NULL
  AND (
    NEW.premium_activated_at IS NULL
    OR NEW.access_state = 'free'
    OR NEW.plan_key = 'event_free'
  )
BEGIN
  SELECT RAISE(ABORT, 'premium_event_cannot_downgrade_to_free');
END;

DROP TRIGGER IF EXISTS media_event_limit_before_insert;
CREATE TRIGGER media_event_limit_before_insert
BEFORE INSERT ON media
WHEN EXISTS (
  SELECT 1 FROM event_access access
  WHERE access.event_id=NEW.event_id
    AND access.enforcement_state='enforced'
    AND (
      access.access_state='expired'
      OR access.media_uploads_consumed >= access.media_limit
      OR (access.upload_window_ends_at IS NOT NULL
          AND access.upload_window_ends_at <= CAST(strftime('%s','now') AS INTEGER) * 1000)
    )
)
BEGIN
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM event_access access
      WHERE access.event_id=NEW.event_id
        AND access.upload_window_ends_at IS NOT NULL
        AND access.upload_window_ends_at <= CAST(strftime('%s','now') AS INTEGER) * 1000
    ) THEN RAISE(ABORT, 'event_upload_window_closed')
    ELSE RAISE(ABORT, 'event_media_limit_reached')
  END;
END;

DROP TRIGGER IF EXISTS media_event_usage_after_insert;
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
      upload_window_started_at=CASE
        WHEN access_state IN ('free','unlocked') AND upload_window_days IS NOT NULL
          THEN COALESCE(upload_window_started_at,CAST(strftime('%s','now') AS INTEGER) * 1000)
        ELSE upload_window_started_at
      END,
      upload_window_ends_at=CASE
        WHEN access_state IN ('free','unlocked') AND upload_window_days IS NOT NULL
          THEN COALESCE(upload_window_ends_at,
            CAST(strftime('%s','now') AS INTEGER) * 1000 + upload_window_days * 86400000)
        ELSE upload_window_ends_at
      END,
      updated_at=CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE event_id=NEW.event_id;
END;

DROP TRIGGER IF EXISTS wedding_media_event_limit_before_insert;
CREATE TRIGGER wedding_media_event_limit_before_insert
BEFORE INSERT ON event_wedding_media
WHEN EXISTS (
  SELECT 1 FROM event_access access
  WHERE access.event_id=NEW.event_id
    AND access.enforcement_state='enforced'
    AND (
      access.access_state='expired'
      OR access.media_uploads_consumed >= access.media_limit
      OR (access.upload_window_ends_at IS NOT NULL
          AND access.upload_window_ends_at <= CAST(strftime('%s','now') AS INTEGER) * 1000)
    )
)
BEGIN
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM event_access access
      WHERE access.event_id=NEW.event_id
        AND access.upload_window_ends_at IS NOT NULL
        AND access.upload_window_ends_at <= CAST(strftime('%s','now') AS INTEGER) * 1000
    ) THEN RAISE(ABORT, 'event_upload_window_closed')
    ELSE RAISE(ABORT, 'event_media_limit_reached')
  END;
END;

DROP TRIGGER IF EXISTS wedding_media_event_usage_after_insert;
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
      upload_window_started_at=CASE
        WHEN access_state IN ('free','unlocked') AND upload_window_days IS NOT NULL
          THEN COALESCE(upload_window_started_at,CAST(strftime('%s','now') AS INTEGER) * 1000)
        ELSE upload_window_started_at
      END,
      upload_window_ends_at=CASE
        WHEN access_state IN ('free','unlocked') AND upload_window_days IS NOT NULL
          THEN COALESCE(upload_window_ends_at,
            CAST(strftime('%s','now') AS INTEGER) * 1000 + upload_window_days * 86400000)
        ELSE upload_window_ends_at
      END,
      updated_at=CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE event_id=NEW.event_id;
END;

DROP TRIGGER IF EXISTS multipart_event_limit_before_insert;
CREATE TRIGGER multipart_event_limit_before_insert
BEFORE INSERT ON multipart_upload_sessions
WHEN NEW.status IN ('uploading','completing')
  AND EXISTS (
    SELECT 1 FROM event_access access
    WHERE access.event_id=NEW.event_id
      AND access.enforcement_state='enforced'
      AND (
        access.access_state='expired'
        OR (access.upload_window_ends_at IS NOT NULL
            AND access.upload_window_ends_at <= CAST(strftime('%s','now') AS INTEGER) * 1000)
        OR access.media_uploads_consumed
          + (SELECT COUNT(*) FROM multipart_upload_sessions session
             WHERE session.event_id=NEW.event_id
               AND session.status IN ('uploading','completing')
               AND session.expires_at > CAST(strftime('%s','now') AS INTEGER) * 1000)
          >= access.media_limit
      )
  )
BEGIN
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM event_access access
      WHERE access.event_id=NEW.event_id
        AND access.upload_window_ends_at IS NOT NULL
        AND access.upload_window_ends_at <= CAST(strftime('%s','now') AS INTEGER) * 1000
    ) THEN RAISE(ABORT, 'event_upload_window_closed')
    ELSE RAISE(ABORT, 'event_media_limit_reached')
  END;
END;

CREATE TRIGGER multipart_event_window_after_insert
AFTER INSERT ON multipart_upload_sessions
WHEN NEW.status IN ('uploading','completing')
BEGIN
  UPDATE event_access
  SET upload_window_started_at=COALESCE(upload_window_started_at,
        CAST(strftime('%s','now') AS INTEGER) * 1000),
      upload_window_ends_at=COALESCE(upload_window_ends_at,
        CAST(strftime('%s','now') AS INTEGER) * 1000 + upload_window_days * 86400000),
      updated_at=CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE event_id=NEW.event_id
    AND enforcement_state='enforced'
    AND access_state IN ('free','unlocked')
    AND upload_window_days IS NOT NULL;
END;

CREATE INDEX idx_event_access_upload_window
ON event_access(upload_window_ends_at,access_state,enforcement_state);
