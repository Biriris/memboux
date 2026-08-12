-- Persistent, event-scoped QR Template Studio designs.

CREATE TABLE event_qr_designs (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_event_qr_designs_event_updated
  ON event_qr_designs(event_id, updated_at DESC);
