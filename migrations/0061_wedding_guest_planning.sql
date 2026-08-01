-- Wedding guest planning is intentionally event-scoped. Contact data does not
-- grant account membership or platform permissions.

CREATE TABLE event_wedding_guest_groups (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_wedding_guest_groups_event
ON event_wedding_guest_groups(event_id,name);

CREATE TABLE event_wedding_guests (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES event_wedding_guest_groups(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  plus_one_limit INTEGER NOT NULL DEFAULT 0 CHECK (plus_one_limit BETWEEN 0 AND 10),
  invited_to_ceremony INTEGER NOT NULL DEFAULT 1 CHECK (invited_to_ceremony IN (0,1)),
  invited_to_reception INTEGER NOT NULL DEFAULT 1 CHECK (invited_to_reception IN (0,1)),
  rsvp_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (rsvp_status IN ('pending','yes','no','maybe')),
  party_size INTEGER NOT NULL DEFAULT 1 CHECK (party_size BETWEEN 1 AND 20),
  dietary_notes TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  invitation_token_hash TEXT,
  invitation_created_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_wedding_guests_event_status
ON event_wedding_guests(event_id,rsvp_status,last_name,first_name);

CREATE INDEX idx_wedding_guests_group
ON event_wedding_guests(group_id,last_name,first_name);

CREATE UNIQUE INDEX idx_wedding_guests_invitation_token
ON event_wedding_guests(invitation_token_hash)
WHERE invitation_token_hash IS NOT NULL;

CREATE UNIQUE INDEX idx_wedding_guests_event_email
ON event_wedding_guests(event_id,email)
WHERE email != '';

CREATE TABLE event_wedding_tables (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  shape TEXT NOT NULL DEFAULT 'round'
    CHECK (shape IN ('round','rectangle','oval','custom')),
  capacity INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 100),
  sort_order INTEGER NOT NULL DEFAULT 0,
  position_x REAL,
  position_y REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(event_id,name)
);

CREATE INDEX idx_wedding_tables_event_order
ON event_wedding_tables(event_id,sort_order,name);

CREATE TABLE event_wedding_seat_assignments (
  guest_id TEXT PRIMARY KEY REFERENCES event_wedding_guests(id) ON DELETE CASCADE,
  table_id TEXT NOT NULL REFERENCES event_wedding_tables(id) ON DELETE CASCADE,
  seat_number INTEGER CHECK (seat_number IS NULL OR seat_number > 0),
  assigned_at INTEGER NOT NULL
);

CREATE INDEX idx_wedding_seats_table
ON event_wedding_seat_assignments(table_id,seat_number);

-- Snapshot every catalog item, including items not selected during setup, so a
-- couple can add it later at the price promised for this event.
CREATE TABLE event_wedding_price_snapshots (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('base','feature')),
  price_minor INTEGER NOT NULL CHECK (price_minor >= 0),
  currency TEXT NOT NULL CHECK (length(currency)=3),
  catalog_version TEXT NOT NULL,
  locked_at INTEGER NOT NULL,
  locked_until INTEGER NOT NULL,
  PRIMARY KEY (event_id,item_key)
);

CREATE INDEX idx_wedding_price_snapshots_expiry
ON event_wedding_price_snapshots(locked_until,event_id);

ALTER TABLE event_rsvps
ADD COLUMN wedding_guest_id TEXT REFERENCES event_wedding_guests(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX idx_event_rsvps_wedding_guest
ON event_rsvps(wedding_guest_id)
WHERE wedding_guest_id IS NOT NULL;
