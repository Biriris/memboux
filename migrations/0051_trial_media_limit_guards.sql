-- Keep the commercial trial limit authoritative under concurrent requests.
-- Application preflights provide friendly errors; these triggers are the final
-- atomic guard for gallery, official and Wedding-specific media.

CREATE TRIGGER IF NOT EXISTS media_trial_limit_before_insert
BEFORE INSERT ON media
WHEN EXISTS (
  SELECT 1
  FROM event_access access
  WHERE access.event_id = NEW.event_id
    AND access.enforcement_state = 'enforced'
    AND (
      access.access_state = 'expired'
      OR (
        (SELECT COUNT(*) FROM media m WHERE m.event_id = NEW.event_id AND m.deleted_at IS NULL)
        + (SELECT COUNT(*) FROM event_wedding_media wm WHERE wm.event_id = NEW.event_id)
      ) >= access.media_limit
    )
)
BEGIN
  SELECT RAISE(ABORT, 'trial_media_limit_reached');
END;

CREATE TRIGGER IF NOT EXISTS wedding_media_trial_limit_before_insert
BEFORE INSERT ON event_wedding_media
WHEN EXISTS (
  SELECT 1
  FROM event_access access
  WHERE access.event_id = NEW.event_id
    AND access.enforcement_state = 'enforced'
    AND (
      access.access_state = 'expired'
      OR (
        (SELECT COUNT(*) FROM media m WHERE m.event_id = NEW.event_id AND m.deleted_at IS NULL)
        + (SELECT COUNT(*) FROM event_wedding_media wm WHERE wm.event_id = NEW.event_id)
      ) >= access.media_limit
    )
)
BEGIN
  SELECT RAISE(ABORT, 'trial_media_limit_reached');
END;

CREATE TRIGGER IF NOT EXISTS media_trial_limit_before_restore
BEFORE UPDATE OF deleted_at ON media
WHEN OLD.deleted_at IS NOT NULL
  AND NEW.deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM event_access access
    WHERE access.event_id = NEW.event_id
      AND access.enforcement_state = 'enforced'
      AND (
        access.access_state = 'expired'
        OR (
          (SELECT COUNT(*) FROM media m WHERE m.event_id = NEW.event_id AND m.deleted_at IS NULL)
          + (SELECT COUNT(*) FROM event_wedding_media wm WHERE wm.event_id = NEW.event_id)
        ) >= access.media_limit
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'trial_media_limit_reached');
END;
