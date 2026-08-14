import type { CloudProvider, EventRow } from "./domain";
import { buildEventArchive, type EventArchive } from "./event-archive";

export const CLOUD_BACKUP_MANIFEST_FILENAME = "memboux-event.json";
export const CLOUD_BACKUP_MANIFEST_VERSION = 1;

export type CloudBackupAssetKind = "gallery_media" | "wedding_media" | "event_cover" | "wedding_menu";

export type CloudBackupAsset = {
  itemKey: string;
  kind: CloudBackupAssetKind;
  sourceId: string;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  filename: string;
  metadata: Record<string, unknown>;
};

export type CloudBackupFile = {
  itemKey: string;
  kind: CloudBackupAssetKind;
  sourceId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  providerFileId: string;
  metadata: Record<string, unknown>;
};

export type CloudEventArchive = EventArchive & { cloudBackup: NonNullable<EventArchive["cloudBackup"]> };

const extensionByType: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "image/heic": "heic", "image/heif": "heif", "video/mp4": "mp4", "video/quicktime": "mov",
  "video/webm": "webm", "video/x-m4v": "m4v", "application/pdf": "pdf",
};

function extension(contentType: string, objectKey: string) {
  return extensionByType[contentType.toLowerCase()] ?? objectKey.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase() ?? "bin";
}

export async function listCloudBackupAssets(db: D1Database, mediaBucket: R2Bucket | undefined, eventId: string): Promise<CloudBackupAsset[]> {
  const [media, weddingMedia, cover, menu] = await Promise.all([
    db.prepare(`SELECT id,object_key,content_type,size_bytes,media_type,uploaded_by,uploaded_at,captured_at,
      content_hash,canonical_hash,title,upload_consent_at,upload_policy_version,origin,album_id,moderation_status FROM media
      WHERE event_id=? AND deleted_at IS NULL AND reported_at IS NULL
      ORDER BY COALESCE(captured_at,uploaded_at),uploaded_at,id`).bind(eventId).all<Record<string, unknown> & { id: string; object_key: string; content_type: string; size_bytes: number }>()
      .catch(() => db.prepare(`SELECT id,object_key,content_type,size_bytes,uploaded_at,captured_at FROM media
        WHERE event_id=? AND deleted_at IS NULL AND reported_at IS NULL
        ORDER BY COALESCE(captured_at,uploaded_at),uploaded_at,id`).bind(eventId)
        .all<Record<string, unknown> & { id: string; object_key: string; content_type: string; size_bytes: number }>()),
    db.prepare(`SELECT id,object_key,content_type,size_bytes,media_type,uploaded_at FROM event_wedding_media
      WHERE event_id=? ORDER BY uploaded_at,id`).bind(eventId).all<Record<string, unknown> & { id: string; object_key: string; content_type: string; size_bytes: number }>()
      .catch(() => ({ results: [] })),
    db.prepare("SELECT object_key,content_type,source_media_id,updated_at FROM event_covers WHERE event_id=?")
      .bind(eventId).first<Record<string, unknown> & { object_key: string; content_type: string }>().catch(() => null),
    db.prepare("SELECT object_key,content_type,size_bytes,original_filename,updated_at FROM event_wedding_menus WHERE event_id=?")
      .bind(eventId).first<Record<string, unknown> & { object_key: string; content_type: string; size_bytes: number }>().catch(() => null),
  ]);
  const assets: CloudBackupAsset[] = [];
  media.results.forEach((row, index) => assets.push({
    itemKey: row.id, kind: "gallery_media", sourceId: row.id, objectKey: row.object_key,
    contentType: row.content_type, sizeBytes: Number(row.size_bytes),
    filename: `${String(index + 1).padStart(4, "0")}.${extension(row.content_type, row.object_key)}`,
    metadata: { ...row, id: undefined, object_key: undefined, content_type: undefined, size_bytes: undefined },
  }));
  weddingMedia.results.forEach((row, index) => assets.push({
    itemKey: `wedding:${row.id}`, kind: "wedding_media", sourceId: row.id, objectKey: row.object_key,
    contentType: row.content_type, sizeBytes: Number(row.size_bytes),
    filename: `wedding-${String(index + 1).padStart(4, "0")}.${extension(row.content_type, row.object_key)}`,
    metadata: { media_type: row.media_type, uploaded_at: row.uploaded_at },
  }));
  if (cover && mediaBucket) {
    const object = await mediaBucket.head(cover.object_key);
    if (object) assets.push({ itemKey: `cover:${eventId}`, kind: "event_cover", sourceId: eventId, objectKey: cover.object_key,
      contentType: cover.content_type, sizeBytes: Number(object.size), filename: `event-cover.${extension(cover.content_type, cover.object_key)}`,
      metadata: { source_media_id: cover.source_media_id, updated_at: cover.updated_at } });
  }
  if (menu) assets.push({ itemKey: `menu:${eventId}`, kind: "wedding_menu", sourceId: eventId, objectKey: menu.object_key,
    contentType: menu.content_type, sizeBytes: Number(menu.size_bytes), filename: `wedding-menu.${extension(menu.content_type, menu.object_key)}`,
    metadata: { original_filename: menu.original_filename, updated_at: menu.updated_at } });
  return assets;
}

export async function buildCloudEventArchive(
  db: D1Database,
  mediaBucket: R2Bucket,
  event: EventRow,
  provider: CloudProvider,
  userId: string,
): Promise<CloudEventArchive> {
  const [archive, assets] = await Promise.all([buildEventArchive(db, event), listCloudBackupAssets(db, mediaBucket, event.id)]);
  const uploadedRows = await db.prepare(`SELECT i.media_id,i.provider_file_id,i.filename,i.completed_at FROM event_backup_items i
    JOIN event_backups b ON b.id=i.backup_id
    WHERE b.event_id=? AND b.user_id=? AND b.provider=? AND i.status='completed' AND i.provider_file_id IS NOT NULL
    ORDER BY i.completed_at DESC`).bind(event.id, userId, provider)
    .all<{ media_id: string; provider_file_id: string; filename: string; completed_at: number }>();
  const uploadedByKey = new Map<string, { provider_file_id: string; filename: string }>();
  for (const row of uploadedRows.results) if (!uploadedByKey.has(row.media_id)) uploadedByKey.set(row.media_id, row);
  const files: CloudBackupFile[] = [];
  for (const asset of assets) {
    const uploaded = uploadedByKey.get(asset.itemKey);
    if (!uploaded?.provider_file_id) continue;
    files.push({
      itemKey: asset.itemKey, kind: asset.kind, sourceId: asset.sourceId,
      filename: uploaded.filename, contentType: asset.contentType, sizeBytes: asset.sizeBytes,
      providerFileId: uploaded.provider_file_id, metadata: asset.metadata,
    });
  }
  return {
    ...archive,
    cloudBackup: {
      version: CLOUD_BACKUP_MANIFEST_VERSION,
      provider,
      sourceEventId: event.id,
      generatedAt: new Date().toISOString(),
      files,
    },
    excluded: archive.excluded.filter((entry) => !entry.startsWith("media binaries")),
  };
}
