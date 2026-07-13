ALTER TABLE media ADD COLUMN upload_consent_at INTEGER;
ALTER TABLE media ADD COLUMN upload_policy_version TEXT;

CREATE INDEX IF NOT EXISTS idx_media_upload_policy_version
ON media(upload_policy_version, upload_consent_at);
