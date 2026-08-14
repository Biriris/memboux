import type { EventAccessRow } from "./domain";

export const EVENT_FREE_MEDIA_LIMIT = 50;
export const EVENT_FREE_ALBUM_LIMIT = 1;
export const EVENT_FREE_PRODUCT_KEY = "event_free";
export const EVENT_FREE_UPLOAD_WINDOW_DAYS = 14;

export function isEventMediaLimitConstraint(error: unknown) {
  return error instanceof Error && (
    error.message.includes("event_media_limit_reached")
    || error.message.includes("trial_media_limit_reached")
  );
}

export function isEventAlbumLimitConstraint(error: unknown) {
  return error instanceof Error && error.message.includes("event_album_limit_reached");
}

export function isEventUploadWindowConstraint(error: unknown) {
  return error instanceof Error && error.message.includes("event_upload_window_closed");
}

export async function getEventAccess(db: D1Database, eventId: string): Promise<EventAccessRow> {
  const row = await db.prepare("SELECT * FROM event_access WHERE event_id=?")
    .bind(eventId)
    .first<EventAccessRow>()
    .catch(() => null);
  if (row) return row;

  const now = Date.now();
  return {
    event_id: eventId,
    access_state: "unlocked",
    enforcement_state: "observe",
    plan_key: null,
    media_limit: 2_147_483_647,
    album_limit: null,
    media_uploads_consumed: 0,
    upload_window_days: null,
    upload_window_started_at: null,
    upload_window_ends_at: null,
    premium_activated_at: null,
    guest_access_enabled: 1,
    guest_uploads_enabled: 1,
    original_downloads_enabled: 1,
    unlocked_at: now,
    expires_at: null,
    created_at: now,
    updated_at: now,
  };
}

export async function activateEventFreePlan(db: D1Database, eventId: string, now = Date.now()) {
  const result = await db.prepare(`UPDATE event_access SET
      access_state='free',enforcement_state='enforced',plan_key=?,media_limit=?,
      album_limit=?,
      upload_window_days=?,upload_window_started_at=NULL,upload_window_ends_at=NULL,
      guest_access_enabled=1,guest_uploads_enabled=1,original_downloads_enabled=1,
      unlocked_at=COALESCE(unlocked_at,?),expires_at=NULL,updated_at=?
    WHERE event_id=? AND premium_activated_at IS NULL
      AND access_state IN ('preview','free','expired')
    RETURNING *`)
    .bind(EVENT_FREE_PRODUCT_KEY, EVENT_FREE_MEDIA_LIMIT, EVENT_FREE_ALBUM_LIMIT, EVENT_FREE_UPLOAD_WINDOW_DAYS, now, now, eventId)
    .first<EventAccessRow>();
  return result ?? getEventAccess(db, eventId);
}

export async function eventAlbumCapacity(db: D1Database, eventId: string) {
  const [access, count] = await Promise.all([
    getEventAccess(db, eventId),
    db.prepare("SELECT COUNT(*) total FROM event_albums WHERE event_id=? AND deleted_at IS NULL")
      .bind(eventId).first<{ total: number }>(),
  ]);
  const used = Number(count?.total ?? 0);
  const limit = access.enforcement_state === "observe" ? null : access.album_limit ?? EVENT_FREE_ALBUM_LIMIT;
  return {
    access,
    used,
    limit,
    remaining: limit === null ? Number.POSITIVE_INFINITY : Math.max(0, limit - used),
    allowed: limit === null || used < limit,
  };
}

export function eventAccessAllows(access: EventAccessRow, capability: "guest_access" | "guest_uploads" | "original_downloads") {
  if (access.enforcement_state === "observe") return true;
  if (access.access_state === "free" || access.access_state === "unlocked") return true;
  if (access.access_state === "expired") return false;
  if (capability === "guest_access") return access.guest_access_enabled === 1;
  if (capability === "guest_uploads") return access.guest_uploads_enabled === 1;
  return access.original_downloads_enabled === 1;
}

export function eventOriginalExportsEnabled(
  access: Pick<EventAccessRow, "access_state" | "enforcement_state" | "original_downloads_enabled">,
) {
  if (access.enforcement_state === "observe" || access.access_state === "free" || access.access_state === "unlocked") return true;
  if (access.access_state === "expired") return false;
  return access.original_downloads_enabled === 1;
}

export function eventOfficialAlbumEnabled(
  access: Pick<EventAccessRow, "access_state" | "enforcement_state" | "plan_key">,
) {
  if (access.enforcement_state === "observe") return true;
  if (access.access_state !== "unlocked") return false;
  return access.plan_key !== EVENT_FREE_PRODUCT_KEY;
}

export async function eventOriginalExportsAllowed(db: D1Database, eventId: string) {
  return eventOriginalExportsEnabled(await getEventAccess(db, eventId));
}

export async function eventMediaUsage(db: D1Database, eventId: string) {
  const [access, gallery, wedding, pending] = await Promise.all([
    db.prepare("SELECT media_uploads_consumed FROM event_access WHERE event_id=?")
      .bind(eventId).first<{ media_uploads_consumed: number }>().catch(() => null),
    db.prepare("SELECT COUNT(*) total FROM media WHERE event_id=? AND deleted_at IS NULL")
      .bind(eventId).first<{ total: number }>().catch(() => null),
    db.prepare("SELECT COUNT(*) total FROM event_wedding_media WHERE event_id=?")
      .bind(eventId).first<{ total: number }>().catch(() => null),
    db.prepare(`SELECT COUNT(*) total FROM multipart_upload_sessions
      WHERE event_id=? AND status IN ('uploading','completing') AND expires_at>?`)
      .bind(eventId, Date.now()).first<{ total: number }>().catch(() => null),
  ]);
  const galleryMedia = Number(gallery?.total ?? 0);
  const weddingMedia = Number(wedding?.total ?? 0);
  const pendingUploads = Number(pending?.total ?? 0);
  const completedActive = galleryMedia + weddingMedia;
  const consumedUploads = Math.max(Number(access?.media_uploads_consumed ?? 0), completedActive);
  return {
    galleryMedia,
    weddingMedia,
    pendingUploads,
    consumedUploads,
    total: consumedUploads + pendingUploads,
  };
}

export async function eventMediaCapacity(
  db: D1Database,
  eventId: string,
  requested = 1,
  ownerUpload = false,
) {
  const access = await getEventAccess(db, eventId);
  if (access.enforcement_state === "observe")
    return { allowed: true, reason: null, access, used: 0, remaining: Number.POSITIVE_INFINITY };
  if (ownerUpload ? access.access_state === "expired" : !eventAccessAllows(access, "guest_uploads"))
    return { allowed: false, reason: "access_closed" as const, access, used: 0, remaining: 0 };
  if (
    (access.access_state === "free" || access.access_state === "unlocked")
    && typeof access.upload_window_ends_at === "number"
    && access.upload_window_ends_at <= Date.now()
  ) {
    console.warn(JSON.stringify({
      event: "event_upload_window_blocked",
      eventId,
      planKey: access.plan_key,
      uploadWindowEndsAt: access.upload_window_ends_at,
    }));
    return { allowed: false, reason: "upload_window_closed" as const, access, used: 0, remaining: 0 };
  }
  const used = (await eventMediaUsage(db, eventId)).total;
  const remaining = Math.max(0, access.media_limit - used);
  const allowed = used <= access.media_limit && requested <= remaining;
  return { allowed, reason: allowed ? null : "media_limit" as const, access, used, remaining };
}
