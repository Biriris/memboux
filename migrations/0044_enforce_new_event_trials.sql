-- Preserve legacy unlocked events while activating the lifecycle already shown
-- in the product UI for preview and trial events.
UPDATE event_access
SET enforcement_state = 'enforced',
    media_limit = 20,
    guest_access_enabled = CASE WHEN access_state = 'trial' THEN 1 ELSE 0 END,
    guest_uploads_enabled = CASE WHEN access_state = 'trial' THEN 1 ELSE 0 END,
    original_downloads_enabled = 0,
    updated_at = unixepoch('now') * 1000
WHERE access_state IN ('preview', 'trial');
