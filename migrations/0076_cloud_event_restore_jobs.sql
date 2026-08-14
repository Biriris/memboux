CREATE TABLE cloud_event_restore_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_drive','dropbox')),
  status TEXT NOT NULL CHECK (status IN ('queued','running','completed','failed')),
  workflow_instance_id TEXT,
  manifest_json TEXT NOT NULL,
  album_map_json TEXT NOT NULL DEFAULT '{}',
  total_items INTEGER NOT NULL DEFAULT 0,
  completed_items INTEGER NOT NULL DEFAULT 0,
  failed_items INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_cloud_event_restore_jobs_user_created
ON cloud_event_restore_jobs(user_id,created_at DESC);

CREATE INDEX idx_cloud_event_restore_jobs_event
ON cloud_event_restore_jobs(event_id,status);

CREATE TABLE cloud_event_restore_items (
  restore_id TEXT NOT NULL REFERENCES cloud_event_restore_jobs(id) ON DELETE CASCADE,
  sequence_no INTEGER NOT NULL,
  item_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('gallery_media','wedding_media','event_cover','wedding_menu')),
  source_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  provider_file_id TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed')),
  target_id TEXT,
  error_message TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (restore_id,sequence_no),
  UNIQUE (restore_id,item_key)
);

CREATE INDEX idx_cloud_event_restore_items_status
ON cloud_event_restore_items(restore_id,status,sequence_no);
