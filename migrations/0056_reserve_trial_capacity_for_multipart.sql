-- Reserve one trial-media slot as soon as a resumable upload session starts.
-- The application preflight gives a friendly response; this trigger closes the
-- concurrent-request race atomically before R2 parts are accepted.

CREATE TRIGGER IF NOT EXISTS multipart_trial_limit_before_insert
BEFORE INSERT ON multipart_upload_sessions
WHEN NEW.status IN ('uploading', 'completing')
  AND EXISTS (
    SELECT 1
    FROM event_access access
    WHERE access.event_id = NEW.event_id
      AND access.enforcement_state = 'enforced'
      AND (
        access.access_state = 'expired'
        OR (
          (SELECT COUNT(*) FROM media m
            WHERE m.event_id = NEW.event_id AND m.deleted_at IS NULL)
          + (SELECT COUNT(*) FROM event_wedding_media wm
            WHERE wm.event_id = NEW.event_id)
          + (SELECT COUNT(*) FROM multipart_upload_sessions session
            WHERE session.event_id = NEW.event_id
              AND session.status IN ('uploading', 'completing')
              AND session.expires_at > CAST(strftime('%s', 'now') AS INTEGER) * 1000)
        ) >= access.media_limit
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'trial_media_limit_reached');
END;
