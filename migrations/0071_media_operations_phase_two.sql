-- Media Operations Phase 2: richer slideshow controls and event presentation branding.

ALTER TABLE event_experience_settings ADD COLUMN slideshow_include_videos INTEGER NOT NULL DEFAULT 1 CHECK (slideshow_include_videos IN (0,1));
ALTER TABLE event_experience_settings ADD COLUMN slideshow_show_names INTEGER NOT NULL DEFAULT 1 CHECK (slideshow_show_names IN (0,1));
ALTER TABLE event_experience_settings ADD COLUMN slideshow_shuffle INTEGER NOT NULL DEFAULT 0 CHECK (slideshow_shuffle IN (0,1));
ALTER TABLE event_experience_settings ADD COLUMN slideshow_transition TEXT NOT NULL DEFAULT 'fade' CHECK (slideshow_transition IN ('fade','zoom','slide'));

CREATE TABLE event_branding (
  event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  brand_name TEXT NOT NULL DEFAULT '',
  primary_color TEXT NOT NULL DEFAULT '#7c3aed',
  background_color TEXT NOT NULL DEFAULT '#f8f5ff',
  logo_media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
  hide_memboux INTEGER NOT NULL DEFAULT 0 CHECK (hide_memboux IN (0,1)),
  updated_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  updated_at INTEGER NOT NULL
);
