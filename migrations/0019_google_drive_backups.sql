CREATE TABLE IF NOT EXISTS cloud_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_drive')),
  encrypted_refresh_token TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  scope TEXT NOT NULL,
  root_folder_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, provider)
);

CREATE TABLE IF NOT EXISTS cloud_oauth_states (
  state_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_drive')),
  locale TEXT NOT NULL CHECK (locale IN ('el', 'en')),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS event_backups (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_drive')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  workflow_instance_id TEXT,
  provider_folder_id TEXT,
  total_items INTEGER NOT NULL DEFAULT 0,
  completed_items INTEGER NOT NULL DEFAULT 0,
  failed_items INTEGER NOT NULL DEFAULT 0,
  total_bytes INTEGER NOT NULL DEFAULT 0,
  completed_bytes INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS event_backup_items (
  backup_id TEXT NOT NULL REFERENCES event_backups(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL,
  sequence_no INTEGER NOT NULL,
  object_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  filename TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  provider_file_id TEXT,
  error_message TEXT,
  completed_at INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (backup_id, media_id)
);

CREATE INDEX IF NOT EXISTS idx_cloud_connections_user
ON cloud_connections(user_id, provider);

CREATE INDEX IF NOT EXISTS idx_cloud_oauth_states_expiry
ON cloud_oauth_states(expires_at);

CREATE INDEX IF NOT EXISTS idx_event_backups_event_created
ON event_backups(event_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_backups_user_created
ON event_backups(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_backups_one_active
ON event_backups(event_id, user_id, provider)
WHERE status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS idx_event_backup_items_status
ON event_backup_items(backup_id, status, sequence_no);
