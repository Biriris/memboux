import type { Bindings } from "./domain";

export type RestoreMediaResult = "restored" | "duplicate" | "missing";

export async function restoreDeletedMedia(db: D1Database, mediaId: string): Promise<RestoreMediaResult> {
  const media = await db.prepare("SELECT event_id,content_hash FROM media WHERE id=? AND deleted_at IS NOT NULL")
    .bind(mediaId)
    .first<{ event_id: string; content_hash: string | null }>();
  if (!media) return "missing";

  if (media.content_hash) {
    const duplicate = await db.prepare("SELECT 1 FROM media WHERE event_id=? AND content_hash=? AND deleted_at IS NULL AND id<>?")
      .bind(media.event_id, media.content_hash, mediaId)
      .first();
    if (duplicate) return "duplicate";
  }

  await db.prepare("UPDATE media SET deleted_at=NULL,purge_at=NULL,reported_at=NULL WHERE id=? AND deleted_at IS NOT NULL")
    .bind(mediaId)
    .run();
  return "restored";
}

export async function permanentlyDeleteMedia(env: Pick<Bindings, "DB" | "MEDIA">, mediaId: string) {
  const media = await env.DB.prepare("SELECT object_key FROM media WHERE id=? AND deleted_at IS NOT NULL")
    .bind(mediaId)
    .first<{ object_key: string }>();
  if (!media) return false;

  await env.MEDIA.delete(media.object_key);
  await env.DB.prepare("DELETE FROM media WHERE id=? AND deleted_at IS NOT NULL").bind(mediaId).run();
  return true;
}
