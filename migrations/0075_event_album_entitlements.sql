ALTER TABLE commerce_products ADD COLUMN album_limit INTEGER
  CHECK(album_limit IS NULL OR (album_limit >= 0 AND album_limit <= 100));

UPDATE commerce_products
SET album_limit = CASE product_key
  WHEN 'event_free' THEN 1
  WHEN 'event_pass' THEN 3
  WHEN 'event_plus' THEN 5
  ELSE album_limit
END
WHERE product_key IN ('event_free','event_pass','event_plus');

ALTER TABLE event_access ADD COLUMN album_limit INTEGER DEFAULT 1
  CHECK(album_limit IS NULL OR (album_limit >= 0 AND album_limit <= 100));

UPDATE event_access
SET album_limit = CASE
  WHEN plan_key = 'event_free' OR access_state = 'free' THEN 1
  WHEN plan_key = 'event_pass' THEN 3
  WHEN plan_key = 'event_plus' THEN 5
  WHEN enforcement_state = 'enforced' AND access_state = 'preview' THEN 1
  ELSE NULL
END;

CREATE TRIGGER event_albums_package_limit_before_insert
BEFORE INSERT ON event_albums
WHEN EXISTS (
  SELECT 1
  FROM event_access access
  WHERE access.event_id = NEW.event_id
    AND access.enforcement_state = 'enforced'
    AND access.album_limit IS NOT NULL
    AND (
      SELECT COUNT(*)
      FROM event_albums album
      WHERE album.event_id = NEW.event_id
        AND album.deleted_at IS NULL
    ) >= access.album_limit
)
BEGIN
  SELECT RAISE(ABORT, 'event_album_limit_reached');
END;
