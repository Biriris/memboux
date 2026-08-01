ALTER TABLE event_wedding_guests
ADD COLUMN invitation_delivery_status TEXT NOT NULL DEFAULT 'not_sent'
  CHECK (invitation_delivery_status IN ('not_sent','sending','sent','failed'));

ALTER TABLE event_wedding_guests
ADD COLUMN invitation_delivery_attempted_at INTEGER;

ALTER TABLE event_wedding_guests
ADD COLUMN invitation_emailed_at INTEGER;

CREATE INDEX idx_wedding_guests_invitation_delivery
ON event_wedding_guests(event_id,invitation_delivery_status,invitation_delivery_attempted_at)
WHERE email != '';
