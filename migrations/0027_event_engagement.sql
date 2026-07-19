CREATE TABLE IF NOT EXISTS event_experience_settings (
  event_id TEXT PRIMARY KEY,
  rsvp_enabled INTEGER NOT NULL DEFAULT 1,
  guestbook_enabled INTEGER NOT NULL DEFAULT 1,
  comments_enabled INTEGER NOT NULL DEFAULT 1,
  slideshow_enabled INTEGER NOT NULL DEFAULT 1,
  guestbook_moderation INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS event_rsvps (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  response TEXT NOT NULL CHECK (response IN ('yes','no','maybe')),
  guest_count INTEGER NOT NULL DEFAULT 1,
  dietary_notes TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(event_id,email),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS event_guestbook_entries (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','hidden')),
  created_at INTEGER NOT NULL,
  moderated_at INTEGER,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS media_comments (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved','hidden')),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_event_rsvps_event_updated ON event_rsvps(event_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_guestbook_event_status_created ON event_guestbook_entries(event_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_comments_media_status_created ON media_comments(media_id,status,created_at ASC);
