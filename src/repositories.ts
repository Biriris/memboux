import type { Bindings, EventRow, MediaRow } from "./domain";
import { mediaObjectKeys } from "./media-variants";
import { purgeExpiredRateLimits } from "./rate-limit";
import { reconcileQuotaUsage, releaseStorage } from "./quotas";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function purgeExpiredOperationalRecords(db: D1Database, now = Date.now()) {
  const results = await db.batch([
    db.prepare("DELETE FROM session WHERE expiresAt<=?").bind(now),
    db.prepare("DELETE FROM verification WHERE expiresAt<=?").bind(now),
    db.prepare("DELETE FROM event_invitations WHERE (accepted_at IS NULL AND expires_at<=?) OR (accepted_at IS NOT NULL AND accepted_at<=?)").bind(now, now - 90 * DAY_MS),
    db.prepare("DELETE FROM media_removal_requests WHERE status IN ('resolved','dismissed') AND resolved_at IS NOT NULL AND resolved_at<=?").bind(now - 365 * DAY_MS),
    db.prepare("DELETE FROM privacy_requests WHERE status IN ('resolved','dismissed') AND resolved_at IS NOT NULL AND resolved_at<=?").bind(now - 3 * 365 * DAY_MS),
    db.prepare("DELETE FROM email_delivery_attempts WHERE created_at<=?").bind(now - 30 * DAY_MS),
    db.prepare("DELETE FROM cloud_oauth_states WHERE expires_at<=?").bind(now),
  ]);
  return results.reduce((total, result) => total + Number(result.meta.changes ?? 0), 0);
}

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

export async function permanentlyDeleteEvent(
  env: Pick<Bindings, "DB" | "MEDIA">,
  eventId: string,
) {
  const usage = await env.DB.prepare(
    "SELECT COALESCE(SUM(m.size_bytes),0) size_bytes,(SELECT user_id FROM event_members WHERE event_id=? AND role='owner' LIMIT 1) owner_id FROM media m WHERE m.event_id=?",
  ).bind(eventId, eventId).first<{ size_bytes: number; owner_id: string | null }>();
  const objects = await env.DB.prepare("SELECT object_key FROM media WHERE event_id=?")
    .bind(eventId)
    .all<{ object_key: string }>();
  const availableTables = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('event_covers','event_wedding_menus')",
  ).all<{ name: string }>();
  const tableNames = new Set(availableTables.results.map((table) => table.name));
  const auxiliaryObjectKeys: string[] = [];
  if (tableNames.has("event_covers")) {
    const cover = await env.DB.prepare("SELECT object_key FROM event_covers WHERE event_id=?")
      .bind(eventId).first<{ object_key: string }>();
    if (cover?.object_key) auxiliaryObjectKeys.push(cover.object_key);
  }
  if (tableNames.has("event_wedding_menus")) {
    const menu = await env.DB.prepare("SELECT object_key FROM event_wedding_menus WHERE event_id=?")
      .bind(eventId).first<{ object_key: string }>();
    if (menu?.object_key) auxiliaryObjectKeys.push(menu.object_key);
  }
  if (auxiliaryObjectKeys.length) await env.MEDIA.delete([...new Set(auxiliaryObjectKeys)]);
  for (let index = 0; index < objects.results.length; index += 333) {
    await env.MEDIA.delete(
      objects.results.slice(index, index + 333).flatMap((item) => mediaObjectKeys(item.object_key)),
    );
  }
  await env.DB.prepare("DELETE FROM media WHERE event_id=?").bind(eventId).run();
  await releaseStorage(
    env.DB,
    usage?.owner_id ?? null,
    Number(usage?.size_bytes ?? 0),
  );
  return env.DB.prepare("DELETE FROM events WHERE id=?").bind(eventId).run();
}

export async function purgeExpiredTrash(env: Bindings) {
  const now = Date.now();
  const expiredMedia = await env.DB.prepare("SELECT m.id,m.object_key,m.size_bytes,(SELECT user_id FROM event_members WHERE event_id=m.event_id AND role='owner' LIMIT 1) owner_id FROM media m WHERE m.purge_at IS NOT NULL AND m.purge_at<=? LIMIT 100")
    .bind(now)
    .all<{ id: string; object_key: string; size_bytes:number; owner_id:string|null }>();

  if (expiredMedia.results.length) {
    await env.MEDIA.delete(expiredMedia.results.flatMap((item) => mediaObjectKeys(item.object_key)));
    await env.DB.batch(expiredMedia.results.map((item) => env.DB.prepare("DELETE FROM media WHERE id=?").bind(item.id)));
    for(const item of expiredMedia.results)await releaseStorage(env.DB,item.owner_id,item.size_bytes);
  }

  const expiredEvents = await env.DB.prepare("SELECT id FROM events WHERE purge_at IS NOT NULL AND purge_at<=? LIMIT 25")
    .bind(now)
    .all<{ id: string }>();

  for (const event of expiredEvents.results) {
    await permanentlyDeleteEvent(env, event.id);
  }

  await purgeExpiredRateLimits(env.DB, now);
  await purgeExpiredOperationalRecords(env.DB, now);
  await reconcileQuotaUsage(env.DB,now);
}
