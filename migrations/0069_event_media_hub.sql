-- Event media hub: albums, guest attribution, moderation, exports and privacy-safe analytics.
-- Existing media remains in the event's main gallery and remains approved.

CREATE TABLE event_albums (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  privacy TEXT NOT NULL DEFAULT 'public' CHECK (privacy IN ('public','protected','private')),
  pin_hash TEXT,
  share_token_hash TEXT,
  cover_media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
  allow_uploads INTEGER NOT NULL DEFAULT 1 CHECK (allow_uploads IN (0,1)),
  allow_downloads INTEGER NOT NULL DEFAULT 1 CHECK (allow_downloads IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE(event_id, slug)
);

CREATE INDEX idx_event_albums_event_order
  ON event_albums(event_id, deleted_at, sort_order, created_at);

ALTER TABLE media ADD COLUMN album_id TEXT REFERENCES event_albums(id) ON DELETE SET NULL;
ALTER TABLE media ADD COLUMN guest_session_id TEXT;
ALTER TABLE media ADD COLUMN moderation_status TEXT NOT NULL DEFAULT 'approved'
  CHECK (moderation_status IN ('pending','approved','hidden'));

ALTER TABLE multipart_upload_sessions ADD COLUMN album_id TEXT REFERENCES event_albums(id) ON DELETE SET NULL;
ALTER TABLE multipart_upload_sessions ADD COLUMN guest_session_id TEXT;
ALTER TABLE multipart_upload_sessions ADD COLUMN moderation_status TEXT NOT NULL DEFAULT 'approved';

CREATE INDEX idx_media_event_album_uploaded
  ON media(event_id, album_id, moderation_status, uploaded_at DESC);

CREATE TABLE event_guest_sessions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  visitor_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  upload_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(event_id, visitor_hash)
);

CREATE INDEX idx_event_guest_sessions_event_seen
  ON event_guest_sessions(event_id, last_seen_at DESC);

CREATE TABLE event_activity_events (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'gallery_view','album_view','qr_open','upload_completed','guestbook_created',
    'comment_created','reaction_created','slideshow_view','export_requested'
  )),
  visitor_hash TEXT,
  album_id TEXT REFERENCES event_albums(id) ON DELETE SET NULL,
  media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
  occurred_at INTEGER NOT NULL
);

CREATE INDEX idx_event_activity_event_type_time
  ON event_activity_events(event_id, activity_type, occurred_at DESC);

CREATE TABLE event_export_jobs (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  album_id TEXT REFERENCES event_albums(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('queued','ready','expired','failed')),
  item_count INTEGER NOT NULL DEFAULT 0,
  total_bytes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_event_export_jobs_event_created
  ON event_export_jobs(event_id, created_at DESC);

ALTER TABLE event_experience_settings ADD COLUMN media_moderation_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE event_experience_settings ADD COLUMN guest_downloads_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE event_experience_settings ADD COLUMN slideshow_album_id TEXT REFERENCES event_albums(id) ON DELETE SET NULL;
ALTER TABLE event_experience_settings ADD COLUMN slideshow_only_approved INTEGER NOT NULL DEFAULT 1;
ALTER TABLE event_experience_settings ADD COLUMN slideshow_interval_seconds INTEGER NOT NULL DEFAULT 6;
ALTER TABLE event_experience_settings ADD COLUMN guestbook_video_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE event_experience_settings ADD COLUMN guestbook_private INTEGER NOT NULL DEFAULT 0;

ALTER TABLE event_guestbook_entries ADD COLUMN media_id TEXT REFERENCES media(id) ON DELETE SET NULL;
ALTER TABLE event_guestbook_entries ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public','host_only'));
