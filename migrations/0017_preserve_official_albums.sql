PRAGMA defer_foreign_keys = on;

ALTER TABLE official_album_items RENAME TO official_album_items_legacy;

CREATE TABLE official_album_items (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  added_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (event_id,media_id)
);

INSERT INTO official_album_items (event_id,media_id,added_by,position,created_at)
SELECT event_id,media_id,added_by,position,created_at
FROM official_album_items_legacy;

DROP TABLE official_album_items_legacy;

CREATE INDEX idx_official_album_event_position
ON official_album_items(event_id,position,created_at);

PRAGMA defer_foreign_keys = off;
