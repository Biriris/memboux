CREATE TABLE event_wedding_menu_courses (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  course_type TEXT NOT NULL
    CHECK (course_type IN ('welcome','starter','salad','main','dessert','drinks','late_night','custom')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX idx_wedding_menu_courses_event_order
ON event_wedding_menu_courses(event_id,sort_order,id);
