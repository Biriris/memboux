CREATE TABLE IF NOT EXISTS privacy_requests (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('access','correction','deletion','restriction','objection','other')),
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved','dismissed')),
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_status_created
ON privacy_requests(status, created_at DESC);
