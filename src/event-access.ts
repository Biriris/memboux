import type { EventAccessRow } from "./domain";

export const EVENT_TRIAL_DAYS = 14;
export const EVENT_TRIAL_MEDIA_LIMIT = 20;

export function isTrialMediaLimitConstraint(error: unknown) {
  return error instanceof Error && error.message.includes("trial_media_limit_reached");
}

export async function getEventAccess(db: D1Database, eventId: string): Promise<EventAccessRow> {
  const row = await db.prepare("SELECT * FROM event_access WHERE event_id=?")
    .bind(eventId)
    .first<EventAccessRow>()
    .catch(() => null);
  if (row) {
    const now = Date.now();
    if (
      row.enforcement_state === "enforced"
      && row.access_state === "trial"
      && row.trial_ends_at !== null
      && row.trial_ends_at <= now
    ) {
      const expired = await db.prepare(`UPDATE event_access SET
          access_state='expired',guest_access_enabled=0,guest_uploads_enabled=0,
          original_downloads_enabled=0,expires_at=COALESCE(expires_at,trial_ends_at),updated_at=?
        WHERE event_id=? AND access_state='trial' AND enforcement_state='enforced'
        RETURNING *`)
        .bind(now, eventId)
        .first<EventAccessRow>()
        .catch(() => null);
      if (expired) return expired;
    }
    return row;
  }

  const now = Date.now();
  return {
    event_id: eventId,
    access_state: "unlocked",
    enforcement_state: "observe",
    media_limit: 2_147_483_647,
    media_uploads_consumed: 0,
    guest_access_enabled: 1,
    guest_uploads_enabled: 1,
    original_downloads_enabled: 1,
    trial_started_at: null,
    trial_ends_at: null,
    unlocked_at: now,
    expires_at: null,
    created_at: now,
    updated_at: now,
  };
}

export async function startEventTrial(db: D1Database, eventId: string, now = Date.now()) {
  const trialEndsAt = now + EVENT_TRIAL_DAYS * 86_400_000;
  const result = await db.prepare(`UPDATE event_access SET
      access_state='trial',enforcement_state='enforced',media_limit=?,guest_access_enabled=1,
      guest_uploads_enabled=1,original_downloads_enabled=0,
      trial_started_at=COALESCE(trial_started_at,?),trial_ends_at=COALESCE(trial_ends_at,?),
      updated_at=?
    WHERE event_id=? AND access_state='preview'
    RETURNING *`)
    .bind(EVENT_TRIAL_MEDIA_LIMIT, now, trialEndsAt, now, eventId)
    .first<EventAccessRow>();
  return result ?? getEventAccess(db, eventId);
}

export function eventAccessAllows(access: EventAccessRow, capability: "guest_access" | "guest_uploads" | "original_downloads") {
  if (access.enforcement_state === "observe") return true;
  if (access.access_state === "unlocked") return true;
  if (access.access_state === "expired") return false;
  if (capability === "guest_access") return access.guest_access_enabled === 1;
  if (capability === "guest_uploads") return access.guest_uploads_enabled === 1;
  return access.original_downloads_enabled === 1;
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
  if (access.enforcement_state === "observe" || access.access_state === "unlocked")
    return { allowed: true, access, used: 0, remaining: Number.POSITIVE_INFINITY };
  if (ownerUpload ? access.access_state === "expired" : !eventAccessAllows(access, "guest_uploads"))
    return { allowed: false, access, used: 0, remaining: 0 };
  const used = (await eventMediaUsage(db, eventId)).total;
  const remaining = Math.max(0, access.media_limit - used);
  return { allowed: used <= access.media_limit && requested <= remaining, access, used, remaining };
}
