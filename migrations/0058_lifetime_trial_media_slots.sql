-- A trial slot is consumed by a successful upload and is not returned by
-- deleting the file. This closes the upload/delete cycle that could otherwise
-- turn a 20-file trial into unlimited lifetime uploads.

ALTER TABLE event_access
ADD COLUMN media_uploads_consumed INTEGER NOT NULL DEFAULT 0
CHECK (media_uploads_consumed >= 0);

UPDATE event_access
SET media_uploads_consumed =
  (SELECT COUNT(*) FROM media m
    WHERE m.event_id = event_access.event_id)
  + (SELECT COUNT(*) FROM event_wedding_media wm
    WHERE wm.event_id = event_access.event_id)
WHERE enforcement_state = 'enforced';

DROP TRIGGER IF EXISTS media_trial_limit_before_insert;
DROP TRIGGER IF EXISTS wedding_media_trial_limit_before_insert;
DROP TRIGGER IF EXISTS media_trial_limit_before_restore;
DROP TRIGGER IF EXISTS multipart_trial_limit_before_insert;

CREATE TRIGGER media_trial_limit_before_insert
BEFORE INSERT ON media
WHEN EXISTS (
  SELECT 1 FROM event_access access
  WHERE access.event_id = NEW.event_id
    AND access.enforcement_state = 'enforced'
    AND (
      access.access_state = 'expired'
      OR access.media_uploads_consumed >= access.media_limit
    )
)
BEGIN
  SELECT RAISE(ABORT, 'trial_media_limit_reached');
END;

CREATE TRIGGER media_trial_usage_after_insert
AFTER INSERT ON media
WHEN EXISTS (
  SELECT 1 FROM event_access access
  WHERE access.event_id = NEW.event_id
    AND access.enforcement_state = 'enforced'
    AND access.access_state IN ('preview','trial')
)
BEGIN
  UPDATE event_access
  SET media_uploads_consumed = media_uploads_consumed + 1,
      updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
  WHERE event_id = NEW.event_id;
END;

CREATE TRIGGER wedding_media_trial_limit_before_insert
BEFORE INSERT ON event_wedding_media
WHEN EXISTS (
  SELECT 1 FROM event_access access
  WHERE access.event_id = NEW.event_id
    AND access.enforcement_state = 'enforced'
    AND (
      access.access_state = 'expired'
      OR access.media_uploads_consumed >= access.media_limit
    )
)
BEGIN
  SELECT RAISE(ABORT, 'trial_media_limit_reached');
END;

CREATE TRIGGER wedding_media_trial_usage_after_insert
AFTER INSERT ON event_wedding_media
WHEN EXISTS (
  SELECT 1 FROM event_access access
  WHERE access.event_id = NEW.event_id
    AND access.enforcement_state = 'enforced'
    AND access.access_state IN ('preview','trial')
)
BEGIN
  UPDATE event_access
  SET media_uploads_consumed = media_uploads_consumed + 1,
      updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
  WHERE event_id = NEW.event_id;
END;

-- Restoring a previously uploaded file does not consume another slot, but an
-- expired event still cannot reactivate media.
CREATE TRIGGER media_trial_limit_before_restore
BEFORE UPDATE OF deleted_at ON media
WHEN OLD.deleted_at IS NOT NULL
  AND NEW.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM event_access access
    WHERE access.event_id = NEW.event_id
      AND access.enforcement_state = 'enforced'
      AND access.access_state = 'expired'
  )
BEGIN
  SELECT RAISE(ABORT, 'trial_media_limit_reached');
END;

CREATE TRIGGER multipart_trial_limit_before_insert
BEFORE INSERT ON multipart_upload_sessions
WHEN NEW.status IN ('uploading', 'completing')
  AND EXISTS (
    SELECT 1 FROM event_access access
    WHERE access.event_id = NEW.event_id
      AND access.enforcement_state = 'enforced'
      AND (
        access.access_state = 'expired'
        OR access.media_uploads_consumed
          + (SELECT COUNT(*) FROM multipart_upload_sessions session
             WHERE session.event_id = NEW.event_id
               AND session.status IN ('uploading', 'completing')
               AND session.expires_at > CAST(strftime('%s', 'now') AS INTEGER) * 1000)
          >= access.media_limit
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'trial_media_limit_reached');
END;
