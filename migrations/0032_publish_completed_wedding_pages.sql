UPDATE event_wedding_profiles
SET publish_status = 'published'
WHERE wizard_completed_at IS NOT NULL
  AND publish_status = 'draft';
