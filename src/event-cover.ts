export type ResolvedEventCover = {
  source_media_id: string | null;
  object_key: string;
  content_type: string;
  updated_at: number;
  automatic: boolean;
};

/**
 * Resolves an owner's saved cover first, then the oldest active event image.
 * The fallback remains dynamic so an owner selection always wins without
 * copying another R2 object or mutating cover state during an upload.
 */
export async function resolveEventCover(db: D1Database, eventId: string) {
  return db.prepare(`
    SELECT source_media_id,object_key,content_type,updated_at,automatic FROM (
      SELECT source_media_id,object_key,content_type,updated_at,0 automatic
      FROM event_covers WHERE event_id=?
      UNION ALL
      SELECT id source_media_id,object_key,content_type,uploaded_at updated_at,1 automatic
      FROM media
      WHERE event_id=? AND media_type='image' AND deleted_at IS NULL AND reported_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM event_covers WHERE event_id=?)
    )
    ORDER BY automatic ASC,updated_at ASC,source_media_id ASC
    LIMIT 1
  `).bind(eventId, eventId, eventId).first<{
    source_media_id: string | null;
    object_key: string;
    content_type: string;
    updated_at: number;
    automatic: 0 | 1;
  }>().then((row): ResolvedEventCover | null => row ? {
    ...row,
    automatic: row.automatic === 1,
  } : null);
}
