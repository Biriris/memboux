CREATE TABLE multipart_upload_sessions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  upload_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  media_id TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image','video')),
  size_bytes INTEGER NOT NULL,
  part_size INTEGER NOT NULL,
  total_parts INTEGER NOT NULL,
  client_fingerprint TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  uploaded_by_user_id TEXT,
  origin TEXT NOT NULL DEFAULT 'guest' CHECK (origin IN ('guest','official')),
  reservation_owner_id TEXT,
  upload_consent_at INTEGER,
  upload_policy_version TEXT,
  captured_at INTEGER,
  status TEXT NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading','completing','completed','duplicate','aborted','failed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  completed_at INTEGER,
  notified_at INTEGER
);

CREATE TABLE multipart_upload_parts (
  session_id TEXT NOT NULL REFERENCES multipart_upload_sessions(id) ON DELETE CASCADE,
  part_number INTEGER NOT NULL,
  etag TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  client_hash TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, part_number)
);

CREATE INDEX idx_multipart_upload_sessions_expiry
ON multipart_upload_sessions(status, expires_at);

CREATE INDEX idx_multipart_upload_sessions_resume
ON multipart_upload_sessions(event_id, client_fingerprint, status, expires_at);

CREATE INDEX idx_multipart_upload_sessions_notifications
ON multipart_upload_sessions(event_id, notified_at, completed_at);
