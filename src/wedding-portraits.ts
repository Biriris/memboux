import type { MediaRow } from "./domain";

/**
 * The visual slots available for pre-wedding portraits.
 * Each slot maps to a specific position in the wedding template layout.
 */
export const portraitSlots = ["hero", "story", "divider_1", "divider_2", "divider_3"] as const;
export type PortraitSlot = typeof portraitSlots[number];

export type WeddingPortraitRow = {
  event_id: string;
  media_id: string;
  slot: PortraitSlot;
  position: number;
  updated_at: number;
};

export type PortraitWithMedia = WeddingPortraitRow & {
  media: MediaRow;
};

export function isValidPortraitSlot(value: unknown): value is PortraitSlot {
  return typeof value === "string" && (portraitSlots as readonly string[]).includes(value);
}

/**
 * Fetches all assigned portraits for a wedding event, joined with media info.
 */
export async function getWeddingPortraits(
  db: D1Database,
  eventId: string,
): Promise<PortraitWithMedia[]> {
  const result = await db.prepare(`
    SELECT p.*, wm.id AS media_id, wm.object_key, wm.media_type, wm.content_type,
           wm.size_bytes, wm.uploaded_at, wm.uploaded_by_user_id
    FROM event_wedding_portrait_assignments p
    JOIN event_wedding_media wm ON wm.id = p.media_id
    WHERE p.event_id = ?
    ORDER BY p.position, p.slot
  `).bind(eventId).all<any>();
  return result.results.map((row) => ({
    event_id: row.event_id,
    media_id: row.media_id,
    slot: row.slot as PortraitSlot,
    position: row.position,
    updated_at: row.updated_at,
    media: {
      id: row.media_id,
      event_id: row.event_id,
      object_key: row.object_key,
      media_type: row.media_type,
      content_type: row.content_type,
      uploaded_by: row.uploaded_by_user_id ?? "",
      uploaded_at: row.uploaded_at,
      captured_at: null,
      content_hash: null,
      canonical_hash: null,
      reported_at: null,
      size_bytes: row.size_bytes,
      title: null,
      deleted_at: null,
      purge_at: null,
      upload_consent_at: null,
      upload_policy_version: null,
      origin: "guest" as const,

      uploaded_by_user_id: row.uploaded_by_user_id,
    },
  }));

}


/**
 * Assigns a media item to a portrait slot (upsert).
 */
export async function upsertWeddingPortrait(
  db: D1Database,
  eventId: string,
  mediaId: string,
  slot: PortraitSlot,
): Promise<boolean> {
  const ownedMedia = await db.prepare(
    "SELECT 1 AS found FROM event_wedding_media WHERE id=? AND event_id=?",
  ).bind(mediaId, eventId).first<{ found: number }>();
  if (!ownedMedia) return false;

  const now = Date.now();
  const existing = await db.prepare(
    "SELECT position FROM event_wedding_portrait_assignments WHERE event_id=? AND slot=?"
  ).bind(eventId, slot).first<{ position: number }>();
  const position = existing ? existing.position : 0;
  await db.prepare(`
    INSERT INTO event_wedding_portrait_assignments (event_id, media_id, slot, position, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(event_id, slot) DO UPDATE SET
      media_id = excluded.media_id,
      position = excluded.position,
      updated_at = excluded.updated_at
  `).bind(eventId, mediaId, slot, position, now).run();
  return true;
}

/**
 * Removes a portrait assignment from a slot.
 */
export async function deleteWeddingPortrait(
  db: D1Database,
  eventId: string,
  slot: PortraitSlot,
): Promise<void> {
  await db.prepare(
    "DELETE FROM event_wedding_portrait_assignments WHERE event_id=? AND slot=?"
  ).bind(eventId, slot).run();
}

/**
 * Returns a map of slot -> media object key for quick template rendering.
 */
export async function getWeddingPortraitMap(
  db: D1Database,
  eventId: string,
): Promise<Record<string, string | null>> {
  const rows = await db.prepare(`
    SELECT p.slot, wm.object_key
    FROM event_wedding_portrait_assignments p
    JOIN event_wedding_media wm ON wm.id = p.media_id
    WHERE p.event_id = ?
  `).bind(eventId).all<{ slot: string; object_key: string }>();

  const map: Record<string, string | null> = {
    hero: null,
    story: null,
    divider_1: null,
    divider_2: null,
    divider_3: null,
  };
  for (const row of rows.results) {
    map[row.slot] = row.object_key;
  }
  return map;
}

/**
 * A pre-wedding media item stored in the dedicated wedding gallery.
 */
export type WeddingMediaRow = {
  id: string;
  event_id: string;
  object_key: string;
  media_type: "image" | "video";
  content_type: string;
  size_bytes: number;
  uploaded_at: number;
  uploaded_by_user_id: string | null;
};

/**
 * Fetches all pre-wedding media for a wedding event.
 */
export async function getWeddingMedia(
  db: D1Database,
  eventId: string,
): Promise<WeddingMediaRow[]> {
  const result = await db.prepare(
    "SELECT * FROM event_wedding_media WHERE event_id=? ORDER BY uploaded_at DESC"
  ).bind(eventId).all<WeddingMediaRow>();
  return result.results;
}

/**
 * Inserts a new pre-wedding media record.
 */
export async function insertWeddingMedia(
  db: D1Database,
  eventId: string,
  objectKey: string,
  mediaType: "image" | "video",
  contentType: string,
  sizeBytes: number,
  uploadedByUserId: string | null,
): Promise<string> {
  const id = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO event_wedding_media (id,event_id,object_key,media_type,content_type,size_bytes,uploaded_at,uploaded_by_user_id) VALUES (?,?,?,?,?,?,?,?)"
  ).bind(id, eventId, objectKey, mediaType, contentType, sizeBytes, Date.now(), uploadedByUserId).run();
  return id;
}

/**
 * Deletes a pre-wedding media record by id.
 */
export async function deleteWeddingMedia(
  db: D1Database,
  mediaId: string,
): Promise<boolean> {
  const result = await db.prepare(
    "DELETE FROM event_wedding_media WHERE id=?"
  ).bind(mediaId).run();
  return result.meta.changes > 0;
}


