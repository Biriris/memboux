import type { Bindings } from "./domain";
import { mediaObjectKeys } from "./media-variants";
import { releaseStorage } from "./quotas";

export type RestoreMediaResult = "restored" | "duplicate" | "missing";

export async function restoreDeletedMedia(db: D1Database, mediaId: string): Promise<RestoreMediaResult> {
  const media = await db.prepare("SELECT event_id,content_hash,canonical_hash FROM media WHERE id=? AND deleted_at IS NOT NULL")
    .bind(mediaId)
    .first<{ event_id: string; content_hash: string | null; canonical_hash: string | null }>();
  if (!media) return "missing";

  if (media.content_hash || media.canonical_hash) {
    const duplicate = await db.prepare("SELECT 1 FROM media WHERE event_id=? AND deleted_at IS NULL AND id<>? AND (content_hash=? OR canonical_hash=?)")
      .bind(media.event_id, mediaId, media.content_hash, media.canonical_hash)
      .first();
    if (duplicate) return "duplicate";
  }

  await db.prepare("UPDATE media SET deleted_at=NULL,purge_at=NULL,reported_at=NULL WHERE id=? AND deleted_at IS NOT NULL")
    .bind(mediaId)
    .run();
  return "restored";
}

export async function permanentlyDeleteMedia(env: Pick<Bindings, "DB" | "MEDIA">, mediaId: string) {
  const media = await env.DB.prepare(`SELECT m.object_key,m.size_bytes,(SELECT user_id FROM event_members WHERE event_id=m.event_id AND role='owner' LIMIT 1) owner_id FROM media m WHERE m.id=? AND m.deleted_at IS NOT NULL`)
    .bind(mediaId)
    .first<{ object_key: string; size_bytes:number; owner_id:string|null }>();
  if (!media) return false;

  await env.MEDIA.delete(mediaObjectKeys(media.object_key));
  const result=await env.DB.prepare("DELETE FROM media WHERE id=? AND deleted_at IS NOT NULL").bind(mediaId).run();
  if(result.meta.changes)await releaseStorage(env.DB,media.owner_id,media.size_bytes);
  return true;
}
