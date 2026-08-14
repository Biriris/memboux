import type { MediaRow } from "./domain";
import { cookieValue, sha256 } from "./utils";

export const MEDIA_LIKE_COOKIE = "memboux_like_visitor";
export const MEDIA_LIKE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

export type LikeableMediaRow = MediaRow & {
  like_count: number;
  viewer_liked: number;
};

export type GalleryMediaCount = {
  total: number;
  photos: number;
  videos: number;
};

type GalleryMediaOptions = {
  albumId?: string | null;
  publicOnly?: boolean;
  excludeOfficial?: boolean;
  limit?: number;
  offset?: number;
  sort?: "chronology" | "latest" | "oldest" | "rating";
};

const validVisitorToken = (value: string | undefined) =>
  Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));

export function existingMediaLikeVisitor(request: Request) {
  const value = cookieValue(request, MEDIA_LIKE_COOKIE);
  return validVisitorToken(value) ? value! : null;
}

export function mediaLikeVisitor(request: Request) {
  return existingMediaLikeVisitor(request) ?? crypto.randomUUID();
}

export function mediaLikeActorKey(secret: string, visitorToken: string) {
  return sha256(`media-like:${secret}:${visitorToken}`);
}

export async function getGalleryMediaWithLikes(
  db: D1Database,
  eventId: string,
  actorKey: string,
  options: GalleryMediaOptions = {},
) {
  const albumFilter = options.albumId === undefined ? "" : options.albumId === null ? "AND m.album_id IS NULL" : "AND m.album_id=?";
  const moderationFilter = options.publicOnly ? "AND m.moderation_status='approved'" : "";
  const originFilter = options.excludeOfficial ? "AND m.origin!='official'" : "";
  const limit = Number.isInteger(options.limit) ? Math.max(1, Math.min(100, Number(options.limit))) : null;
  const offset = limit === null ? 0 : Math.max(0, Number.isInteger(options.offset) ? Number(options.offset) : 0);
  const pageClause = limit === null ? "" : "LIMIT ? OFFSET ?";
  const orderClause = options.sort === "latest"
    ? "m.uploaded_at DESC"
    : options.sort === "oldest"
      ? "m.uploaded_at ASC"
      : options.sort === "rating"
        ? "like_count DESC,m.uploaded_at DESC"
        : "COALESCE(m.captured_at,m.uploaded_at) ASC,m.uploaded_at ASC";
  const bindings: unknown[] = [actorKey, eventId];
  if (typeof options.albumId === "string") bindings.push(options.albumId);
  if (limit !== null) bindings.push(limit, offset);
  const result = await db.prepare(`SELECT m.*,
      (SELECT COUNT(*) FROM media_likes ml WHERE ml.media_id=m.id) like_count,
      EXISTS(SELECT 1 FROM media_likes own WHERE own.media_id=m.id AND own.actor_key=?) viewer_liked
    FROM media m
    WHERE m.event_id=? AND m.deleted_at IS NULL AND m.reported_at IS NULL ${albumFilter} ${moderationFilter} ${originFilter}
    ORDER BY ${orderClause} ${pageClause}`)
    .bind(...bindings)
    .all<LikeableMediaRow>();
  return result.results;
}

export async function countGalleryMedia(
  db: D1Database,
  eventId: string,
  options: Omit<GalleryMediaOptions, "limit" | "offset"> = {},
): Promise<GalleryMediaCount> {
  const albumFilter = options.albumId === undefined ? "" : options.albumId === null ? "AND album_id IS NULL" : "AND album_id=?";
  const moderationFilter = options.publicOnly ? "AND moderation_status='approved'" : "";
  const originFilter = options.excludeOfficial ? "AND origin!='official'" : "";
  const bindings: unknown[] = [eventId];
  if (typeof options.albumId === "string") bindings.push(options.albumId);
  const row = await db.prepare(`SELECT COUNT(*) total,
      SUM(CASE WHEN media_type='image' THEN 1 ELSE 0 END) photos,
      SUM(CASE WHEN media_type='video' THEN 1 ELSE 0 END) videos
    FROM media
    WHERE event_id=? AND deleted_at IS NULL AND reported_at IS NULL ${albumFilter} ${moderationFilter} ${originFilter}`)
    .bind(...bindings)
    .first<{ total: number; photos: number | null; videos: number | null }>();
  return {
    total: Number(row?.total ?? 0),
    photos: Number(row?.photos ?? 0),
    videos: Number(row?.videos ?? 0),
  };
}

export async function getOfficialMediaWithLikes(
  db: D1Database,
  eventId: string,
  actorKey: string,
) {
  const result = await db.prepare(`SELECT m.*,
      (SELECT COUNT(*) FROM media_likes ml WHERE ml.media_id=m.id) like_count,
      EXISTS(SELECT 1 FROM media_likes own WHERE own.media_id=m.id AND own.actor_key=?) viewer_liked
    FROM official_album_items o
    JOIN media m ON m.id=o.media_id
    WHERE o.event_id=? AND m.deleted_at IS NULL AND m.reported_at IS NULL
    ORDER BY o.position,o.created_at`)
    .bind(actorKey, eventId)
    .all<LikeableMediaRow>();
  return result.results;
}

export async function toggleMediaLike(
  db: D1Database,
  eventId: string,
  mediaId: string,
  actorKey: string,
) {
  const media = await db.prepare(`SELECT id FROM media
    WHERE id=? AND event_id=? AND media_type='image'
      AND deleted_at IS NULL AND reported_at IS NULL`)
    .bind(mediaId, eventId)
    .first<{ id: string }>();
  if (!media) return null;

  const existing = await db.prepare(
    "SELECT 1 liked FROM media_likes WHERE media_id=? AND actor_key=?",
  ).bind(mediaId, actorKey).first<{ liked: number }>();
  const liked = !existing;
  if (liked) {
    await db.prepare(
      "INSERT OR IGNORE INTO media_likes (media_id,actor_key,created_at) VALUES (?,?,?)",
    ).bind(mediaId, actorKey, Date.now()).run();
  } else {
    await db.prepare("DELETE FROM media_likes WHERE media_id=? AND actor_key=?")
      .bind(mediaId, actorKey)
      .run();
  }
  const count = await db.prepare("SELECT COUNT(*) total FROM media_likes WHERE media_id=?")
    .bind(mediaId)
    .first<{ total: number }>();
  return { liked, count: Number(count?.total ?? 0) };
}
