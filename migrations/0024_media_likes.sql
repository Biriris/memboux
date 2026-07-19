CREATE TABLE IF NOT EXISTS media_likes (
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  actor_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (media_id, actor_key)
);

CREATE INDEX IF NOT EXISTS idx_media_likes_created
ON media_likes(created_at DESC);
