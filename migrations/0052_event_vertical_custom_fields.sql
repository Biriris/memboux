ALTER TABLE event_vertical_profiles
ADD COLUMN custom_fields_json TEXT NOT NULL DEFAULT '{}';
