import type { EventRow } from "./domain";

export const EVENT_ARCHIVE_FORMAT = "memboux-event-archive";
export const EVENT_ARCHIVE_VERSION = 1;
export const EVENT_ARCHIVE_MAX_BYTES = 8 * 1024 * 1024;

export type EventArchive = {
  format: typeof EVENT_ARCHIVE_FORMAT;
  version: typeof EVENT_ARCHIVE_VERSION;
  exportedAt: string;
  event: Pick<EventRow, "eventName" | "default_locale" | "event_start_date" | "event_end_date" | "event_type" | "location" | "location_place_id" | "location_lat" | "location_lng" | "location_provider" | "notes">;
  data: {
    verticalProfile: Record<string, unknown> | null;
    weddingProfile: Record<string, unknown> | null;
    weddingFeatures: Record<string, unknown>[];
    experienceSettings: Record<string, unknown> | null;
    albums: Record<string, unknown>[];
    branding: Record<string, unknown> | null;
    qrDesigns: Record<string, unknown>[];
    weddingGuestGroups: Record<string, unknown>[];
    weddingGuests: Record<string, unknown>[];
    weddingTables: Record<string, unknown>[];
    weddingSeatAssignments: Record<string, unknown>[];
    weddingMenuCourses: Record<string, unknown>[];
    weddingPortraitAssignments?: Record<string, unknown>[];
  };
  cloudBackup?: {
    version: number;
    provider: "google_drive" | "dropbox";
    sourceEventId: string;
    generatedAt: string;
    files: Array<{
      itemKey: string;
      kind: "gallery_media" | "wedding_media" | "event_cover" | "wedding_menu";
      sourceId: string;
      filename: string;
      contentType: string;
      sizeBytes: number;
      providerFileId: string;
      metadata: Record<string, unknown>;
    }>;
  };
  excluded: string[];
};

const one = (db: D1Database, sql: string, eventId: string) => db.prepare(sql).bind(eventId).first<Record<string, unknown>>();
const many = async (db: D1Database, sql: string, eventId: string) => (await db.prepare(sql).bind(eventId).all<Record<string, unknown>>()).results;

export async function buildEventArchive(db: D1Database, event: EventRow): Promise<EventArchive> {
  const [verticalProfile, weddingProfile, weddingFeatures, experienceSettings, albums, branding, qrDesigns, weddingGuestGroups, weddingGuests, weddingTables, weddingSeatAssignments, weddingMenuCourses, weddingPortraitAssignments] = await Promise.all([
    one(db, "SELECT * FROM event_vertical_profiles WHERE event_id=?", event.id),
    one(db, "SELECT * FROM event_wedding_profiles WHERE event_id=?", event.id),
    many(db, "SELECT * FROM event_wedding_features WHERE event_id=? ORDER BY feature_key", event.id),
    one(db, "SELECT * FROM event_experience_settings WHERE event_id=?", event.id),
    many(db, "SELECT id,slug,name,description,privacy,allow_uploads,allow_downloads,sort_order,created_at,updated_at FROM event_albums WHERE event_id=? AND deleted_at IS NULL ORDER BY sort_order,created_at", event.id),
    one(db, "SELECT brand_name,primary_color,background_color,hide_memboux,updated_at FROM event_branding WHERE event_id=?", event.id),
    many(db, "SELECT id,name,config_json,created_at,updated_at FROM event_qr_designs WHERE event_id=? ORDER BY updated_at DESC", event.id),
    many(db, "SELECT id,name,created_at,updated_at FROM event_wedding_guest_groups WHERE event_id=? ORDER BY name", event.id),
    many(db, "SELECT id,group_id,first_name,last_name,email,phone,plus_one_limit,invited_to_ceremony,invited_to_reception,rsvp_status,party_size,dietary_notes,notes,created_at,updated_at FROM event_wedding_guests WHERE event_id=? ORDER BY last_name,first_name", event.id),
    many(db, "SELECT id,name,shape,capacity,sort_order,position_x,position_y,created_at,updated_at FROM event_wedding_tables WHERE event_id=? ORDER BY sort_order,name", event.id),
    many(db, "SELECT s.guest_id,s.table_id,s.seat_number,s.assigned_at FROM event_wedding_seat_assignments s JOIN event_wedding_guests g ON g.id=s.guest_id WHERE g.event_id=?", event.id),
    many(db, "SELECT id,course_type,title,description,sort_order,created_at,updated_at FROM event_wedding_menu_courses WHERE event_id=? ORDER BY sort_order,id", event.id),
    many(db, "SELECT media_id,slot,position,updated_at FROM event_wedding_portrait_assignments WHERE event_id=? ORDER BY slot", event.id),
  ]);
  const stripEventId = (row: Record<string, unknown> | null) => {
    if (!row) return null;
    const { event_id: _eventId, ...safe } = row;
    return safe;
  };
  return {
    format: EVENT_ARCHIVE_FORMAT,
    version: EVENT_ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    event: {
      eventName: event.eventName,
      default_locale: event.default_locale,
      event_start_date: event.event_start_date,
      event_end_date: event.event_end_date,
      event_type: event.event_type,
      location: event.location,
      location_place_id: event.location_place_id,
      location_lat: event.location_lat,
      location_lng: event.location_lng,
      location_provider: event.location_provider,
      notes: event.notes,
    },
    data: {
      verticalProfile: stripEventId(verticalProfile),
      weddingProfile: stripEventId(weddingProfile),
      weddingFeatures: weddingFeatures.map((row) => stripEventId(row)!),
      experienceSettings: stripEventId(experienceSettings),
      albums,
      branding,
      qrDesigns,
      weddingGuestGroups,
      weddingGuests,
      weddingTables,
      weddingSeatAssignments,
      weddingMenuCourses,
      weddingPortraitAssignments,
    },
    excluded: [
      "media binaries and derivatives (use Google Drive backup or original ZIP export)",
      "paid package entitlements and orders",
      "account memberships, invitations, access tokens and PIN hashes",
      "analytics, guest sessions and audit activity",
    ],
  };
}

export function parseEventArchive(value: unknown): EventArchive | null {
  if (!value || typeof value !== "object") return null;
  const archive = value as Partial<EventArchive>;
  if (archive.format !== EVENT_ARCHIVE_FORMAT || archive.version !== EVENT_ARCHIVE_VERSION) return null;
  if (!archive.event || typeof archive.event.eventName !== "string" || !archive.event.eventName.trim()) return null;
  if (!archive.data || typeof archive.data !== "object") return null;
  for (const key of ["weddingFeatures", "albums", "qrDesigns", "weddingGuestGroups", "weddingGuests", "weddingTables", "weddingSeatAssignments", "weddingMenuCourses"] as const) {
    if (!Array.isArray(archive.data[key])) return null;
  }
  if (archive.data.weddingPortraitAssignments && !Array.isArray(archive.data.weddingPortraitAssignments)) return null;
  if (archive.cloudBackup) {
    if (archive.cloudBackup.version !== 1 || !["google_drive", "dropbox"].includes(archive.cloudBackup.provider)) return null;
    if (!Array.isArray(archive.cloudBackup.files) || archive.cloudBackup.files.length > 20_000) return null;
    for (const file of archive.cloudBackup.files) {
      if (!file || typeof file.providerFileId !== "string" || !file.providerFileId || typeof file.contentType !== "string") return null;
      if (!Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0) return null;
      if (!["gallery_media", "wedding_media", "event_cover", "wedding_menu"].includes(file.kind)) return null;
    }
  }
  return archive as EventArchive;
}

const allowedColumns = {
  event_vertical_profiles: ["headline", "host_name", "introduction", "story", "schedule_notes", "guest_notes", "contact_email", "theme_key", "wizard_step", "wizard_completed_at", "publish_status", "updated_at", "custom_fields_json"],
  event_wedding_profiles: ["partner_one_name", "partner_two_name", "welcome_message", "story", "ceremony_at", "ceremony_location", "reception_at", "reception_location", "dress_code", "contact_name", "contact_email", "contact_phone", "travel_notes", "accommodation_notes", "gift_message", "gift_url", "wizard_step", "wizard_completed_at", "catalog_version", "estimated_total_minor", "currency", "updated_at", "template_key", "publish_status", "accent_color", "ceremony_place_id", "ceremony_lat", "ceremony_lng", "reception_place_id", "reception_lat", "reception_lng"],
  event_experience_settings: ["rsvp_enabled", "guestbook_enabled", "comments_enabled", "slideshow_enabled", "guestbook_moderation", "updated_at", "media_moderation_enabled", "guest_downloads_enabled", "slideshow_album_id", "slideshow_only_approved", "slideshow_interval_seconds", "guestbook_video_enabled", "guestbook_private", "slideshow_include_videos", "slideshow_show_names", "slideshow_shuffle", "slideshow_transition", "guest_bulk_downloads_enabled"],
} as const;

function insertRecord(db: D1Database, table: keyof typeof allowedColumns, eventId: string, source: Record<string, unknown>) {
  const columns = allowedColumns[table].filter((column) => Object.hasOwn(source, column));
  const names = ["event_id", ...columns];
  return db.prepare(`INSERT INTO ${table} (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`)
    .bind(eventId, ...columns.map((column) => source[column] ?? null));
}

export function restoreEventArchiveStatements(
  db: D1Database,
  archive: EventArchive,
  eventId: string,
  userId: string,
  now: number,
  providedAlbumIds?: Map<string, string>,
) {
  const statements: D1PreparedStatement[] = [];
  if (archive.data.verticalProfile) statements.push(insertRecord(db, "event_vertical_profiles", eventId, { ...archive.data.verticalProfile, publish_status: "draft", updated_at: now }));
  if (archive.data.weddingProfile) statements.push(insertRecord(db, "event_wedding_profiles", eventId, { ...archive.data.weddingProfile, publish_status: "draft", updated_at: now }));
  for (const feature of archive.data.weddingFeatures.slice(0, 100)) {
    statements.push(db.prepare("INSERT INTO event_wedding_features (event_id,feature_key,enabled,price_minor,catalog_version,updated_at) VALUES (?,?,?,?,?,?)")
      .bind(eventId, feature.feature_key, feature.enabled, feature.price_minor, feature.catalog_version, now));
  }
  const albumIds = providedAlbumIds ?? new Map<string, string>();
  for (const album of archive.data.albums.slice(0, 5)) {
    const sourceId = String(album.id ?? "");
    const id = albumIds.get(sourceId) ?? crypto.randomUUID();
    albumIds.set(sourceId, id);
    statements.push(db.prepare("INSERT INTO event_albums (id,event_id,slug,name,description,privacy,allow_uploads,allow_downloads,sort_order,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, eventId, String(album.slug ?? "album").slice(0, 80), String(album.name ?? "Album").slice(0, 80), String(album.description ?? "").slice(0, 240), album.privacy, album.allow_uploads, album.allow_downloads, album.sort_order, userId, now, now));
  }
  if (archive.data.experienceSettings) {
    const selectedAlbum = String(archive.data.experienceSettings.slideshow_album_id ?? "");
    const settings = { ...archive.data.experienceSettings, slideshow_album_id: albumIds.get(selectedAlbum) ?? null, updated_at: now };
    statements.push(insertRecord(db, "event_experience_settings", eventId, settings));
  }
  if (archive.data.branding) {
    const branding = archive.data.branding;
    statements.push(db.prepare("INSERT INTO event_branding (event_id,brand_name,primary_color,background_color,logo_media_id,hide_memboux,updated_by,updated_at) VALUES (?,?,?,?,NULL,?,?,?)")
      .bind(eventId, branding.brand_name, branding.primary_color, branding.background_color, branding.hide_memboux, userId, now));
  }
  for (const design of archive.data.qrDesigns.slice(0, 50)) {
    statements.push(db.prepare("INSERT INTO event_qr_designs (id,event_id,name,config_json,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), eventId, design.name, design.config_json, userId, userId, now, now));
  }
  const groupIds = new Map<string, string>();
  for (const group of archive.data.weddingGuestGroups.slice(0, 100)) {
    const id = crypto.randomUUID();
    groupIds.set(String(group.id ?? ""), id);
    statements.push(db.prepare("INSERT INTO event_wedding_guest_groups (id,event_id,name,created_at,updated_at) VALUES (?,?,?,?,?)")
      .bind(id, eventId, String(group.name ?? "Group").slice(0, 80), now, now));
  }
  const guestIds = new Map<string, string>();
  for (const guest of archive.data.weddingGuests.slice(0, 5000)) {
    const id = crypto.randomUUID();
    guestIds.set(String(guest.id ?? ""), id);
    statements.push(db.prepare(`INSERT INTO event_wedding_guests
      (id,event_id,group_id,first_name,last_name,email,phone,plus_one_limit,invited_to_ceremony,invited_to_reception,rsvp_status,party_size,dietary_notes,notes,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, eventId, groupIds.get(String(guest.group_id ?? "")) ?? null, guest.first_name, guest.last_name, guest.email, guest.phone, guest.plus_one_limit, guest.invited_to_ceremony, guest.invited_to_reception, guest.rsvp_status, guest.party_size, guest.dietary_notes, guest.notes, now, now));
  }
  const tableIds = new Map<string, string>();
  for (const table of archive.data.weddingTables.slice(0, 500)) {
    const id = crypto.randomUUID();
    tableIds.set(String(table.id ?? ""), id);
    statements.push(db.prepare("INSERT INTO event_wedding_tables (id,event_id,name,shape,capacity,sort_order,position_x,position_y,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(id, eventId, table.name, table.shape, table.capacity, table.sort_order, table.position_x ?? null, table.position_y ?? null, now, now));
  }
  for (const seat of archive.data.weddingSeatAssignments.slice(0, 5000)) {
    const guestId = guestIds.get(String(seat.guest_id ?? ""));
    const tableId = tableIds.get(String(seat.table_id ?? ""));
    if (guestId && tableId) statements.push(db.prepare("INSERT INTO event_wedding_seat_assignments (guest_id,table_id,seat_number,assigned_at) VALUES (?,?,?,?)")
      .bind(guestId, tableId, seat.seat_number ?? null, now));
  }
  for (const course of archive.data.weddingMenuCourses.slice(0, 100)) {
    statements.push(db.prepare("INSERT INTO event_wedding_menu_courses (id,event_id,course_type,title,description,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), eventId, course.course_type, course.title, course.description, course.sort_order, now, now));
  }
  return statements;
}
