import { mediaLikeActorKey, mediaLikeVisitor } from "./media-likes";
import { constantTimeEqual, cookieValue, sha256 } from "./utils";

export type AlbumPrivacy = "public" | "protected" | "private";

export type EventAlbumRow = {
  id: string;
  event_id: string;
  slug: string;
  name: string;
  description: string;
  privacy: AlbumPrivacy;
  pin_hash: string | null;
  share_token_hash: string | null;
  cover_media_id: string | null;
  allow_uploads: 0 | 1;
  allow_downloads: 0 | 1;
  sort_order: number;
  created_by: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  media_count?: number;
};

export type EventActivityType =
  | "gallery_view"
  | "album_view"
  | "qr_open"
  | "upload_completed"
  | "guestbook_created"
  | "comment_created"
  | "reaction_created"
  | "slideshow_view"
  | "export_requested";

export function normalizeAlbumSlug(value: string) {
  return value.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "album";
}

export async function uniqueAlbumSlug(db: D1Database, eventId: string, value: string, excludeId = "") {
  const base = normalizeAlbumSlug(value);
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const slug = suffix ? `${base.slice(0, 44)}-${suffix + 1}` : base;
    const found = await db.prepare("SELECT 1 FROM event_albums WHERE event_id=? AND slug=? AND id<>?")
      .bind(eventId, slug, excludeId).first();
    if (!found) return slug;
  }
  return `${base.slice(0, 35)}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function listEventAlbums(db: D1Database, eventId: string, includePrivate = true) {
  const privacyFilter = includePrivate ? "" : "AND a.privacy!='private'";
  const result = await db.prepare(`SELECT a.*,
      (SELECT COUNT(*) FROM media m WHERE m.album_id=a.id AND m.deleted_at IS NULL) media_count
    FROM event_albums a
    WHERE a.event_id=? AND a.deleted_at IS NULL ${privacyFilter}
    ORDER BY a.sort_order,a.created_at`)
    .bind(eventId).all<EventAlbumRow>();
  return result.results;
}

export async function findEventAlbum(db: D1Database, eventId: string, slug: string) {
  return db.prepare("SELECT * FROM event_albums WHERE event_id=? AND slug=? AND deleted_at IS NULL")
    .bind(eventId, slug).first<EventAlbumRow>();
}

export function albumAccessCookieName(albumId: string) {
  return `mbx_album_${albumId.replaceAll("-", "").slice(0, 20)}`;
}

export function albumAccessToken(secret: string, album: Pick<EventAlbumRow, "id" | "pin_hash">) {
  return sha256(`album-access-v1:${secret}:${album.id}:${album.pin_hash ?? "private"}`);
}

export async function hasAlbumAccess(request: Request, secret: string, album: EventAlbumRow) {
  if (album.privacy !== "protected") return true;
  const supplied = cookieValue(request, albumAccessCookieName(album.id));
  return Boolean(supplied && constantTimeEqual(supplied, await albumAccessToken(secret, album)));
}

export async function anonymousVisitor(db: D1Database, request: Request, secret: string, eventId: string, displayName = "") {
  const visitorToken = mediaLikeVisitor(request);
  const visitorHash = await mediaLikeActorKey(secret, visitorToken);
  const name = displayName.trim().replace(/\s+/g, " ").slice(0, 80);
  if (name) {
    const now = Date.now();
    await db.prepare(`INSERT INTO event_guest_sessions
        (id,event_id,visitor_hash,display_name,first_seen_at,last_seen_at,upload_count)
      VALUES (?,?,?,?,?,?,0)
      ON CONFLICT(event_id,visitor_hash) DO UPDATE SET
        display_name=excluded.display_name,last_seen_at=excluded.last_seen_at`)
      .bind(crypto.randomUUID(), eventId, visitorHash, name, now, now).run();
  }
  const session = await db.prepare("SELECT id FROM event_guest_sessions WHERE event_id=? AND visitor_hash=?")
    .bind(eventId, visitorHash).first<{ id: string }>();
  return { visitorToken, visitorHash, guestSessionId: session?.id ?? null };
}

export async function recordEventActivity(
  db: D1Database,
  input: { eventId: string; type: EventActivityType; visitorHash?: string | null; albumId?: string | null; mediaId?: string | null; occurredAt?: number },
) {
  await db.prepare(`INSERT INTO event_activity_events
      (id,event_id,activity_type,visitor_hash,album_id,media_id,occurred_at)
    VALUES (?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(), input.eventId, input.type, input.visitorHash ?? null,
      input.albumId ?? null, input.mediaId ?? null, input.occurredAt ?? Date.now()).run();
}

export async function eventAnalyticsSummary(db: D1Database, eventId: string) {
  const [activity, contributors, media, albums] = await Promise.all([
    db.prepare(`SELECT activity_type,COUNT(*) total,COUNT(DISTINCT visitor_hash) unique_visitors
      FROM event_activity_events WHERE event_id=? GROUP BY activity_type`).bind(eventId)
      .all<{ activity_type: EventActivityType; total: number; unique_visitors: number }>(),
    db.prepare("SELECT COUNT(*) total FROM event_guest_sessions WHERE event_id=?")
      .bind(eventId).first<{ total: number }>(),
    db.prepare(`SELECT COUNT(*) total,COALESCE(SUM(size_bytes),0) bytes,
      SUM(CASE WHEN media_type='video' THEN 1 ELSE 0 END) videos
      FROM media WHERE event_id=? AND deleted_at IS NULL`).bind(eventId)
      .first<{ total: number; bytes: number; videos: number }>(),
    db.prepare("SELECT COUNT(*) total FROM event_albums WHERE event_id=? AND deleted_at IS NULL")
      .bind(eventId).first<{ total: number }>(),
  ]);
  const byType = Object.fromEntries(activity.results.map((row) => [row.activity_type, {
    total: Number(row.total), unique: Number(row.unique_visitors),
  }])) as Partial<Record<EventActivityType, { total: number; unique: number }>>;
  return {
    byType,
    contributors: Number(contributors?.total ?? 0),
    media: Number(media?.total ?? 0),
    bytes: Number(media?.bytes ?? 0),
    videos: Number(media?.videos ?? 0),
    albums: Number(albums?.total ?? 0),
  };
}
