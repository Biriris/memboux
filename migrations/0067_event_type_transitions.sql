CREATE TABLE event_type_transitions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  from_event_type TEXT NOT NULL,
  to_event_type TEXT NOT NULL,
  vertical_profile_json TEXT,
  changed_by_user_id TEXT NOT NULL,
  changed_at INTEGER NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX idx_event_type_transitions_event_history
ON event_type_transitions(event_id, changed_at DESC);

CREATE INDEX idx_event_type_transitions_restore
ON event_type_transitions(event_id, from_event_type, changed_at DESC);
