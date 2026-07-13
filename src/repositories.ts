import type { Bindings, EventRow, MediaRow } from "./domain";

export async function getEvent(db: D1Database, code: string, includeDeleted = false) {
  return db.prepare(`SELECT * FROM events WHERE code = ?${includeDeleted ? "" : " AND deleted_at IS NULL"}`)
    .bind(code.toUpperCase())
    .first<EventRow>();
}

export async function getMedia(db: D1Database, eventId: string, includeDeleted = false) {
  const result = await db.prepare(`SELECT * FROM media WHERE event_id = ?${includeDeleted ? "" : " AND deleted_at IS NULL AND reported_at IS NULL"} ORDER BY COALESCE(captured_at, uploaded_at) ASC, uploaded_at ASC`)
    .bind(eventId)
    .all<MediaRow>();
  return result.results;
}

export async function purgeExpiredTrash(env: Bindings) {
  const now = Date.now();
  const expiredMedia = await env.DB.prepare("SELECT id,object_key FROM media WHERE purge_at IS NOT NULL AND purge_at<=? LIMIT 100")
    .bind(now)
    .all<{ id: string; object_key: string }>();

  if (expiredMedia.results.length) {
    await env.MEDIA.delete(expiredMedia.results.map((item) => item.object_key));
    await env.DB.batch(expiredMedia.results.map((item) => env.DB.prepare("DELETE FROM media WHERE id=?").bind(item.id)));
  }

  const expiredEvents = await env.DB.prepare("SELECT id FROM events WHERE purge_at IS NOT NULL AND purge_at<=? LIMIT 25")
    .bind(now)
    .all<{ id: string }>();

  for (const event of expiredEvents.results) {
    const objects = await env.DB.prepare("SELECT object_key FROM media WHERE event_id=?")
      .bind(event.id)
      .all<{ object_key: string }>();
    if (objects.results.length) await env.MEDIA.delete(objects.results.map((item) => item.object_key));
    await env.DB.prepare("DELETE FROM events WHERE id=?").bind(event.id).run();
  }
}
