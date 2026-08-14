import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { Bindings, CloudProvider } from "./domain";
import { parseEventArchive, type EventArchive } from "./event-archive";
import { dropboxAccessTokenForUser } from "./dropbox";
import { googleDriveAccessTokenForUser } from "./google-drive";

type CloudRestoreJob = {
  id: string;
  user_id: string;
  event_id: string;
  provider: CloudProvider;
  status: "queued" | "running" | "completed" | "failed";
  manifest_json: string;
  album_map_json: string;
};
type CloudRestoreIdentity = Pick<CloudRestoreJob, "id" | "user_id" | "event_id" | "provider">;

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : "Unknown restore error")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 500);
}

async function stableId(namespace: string, source: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${namespace}:${source}`)));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes.slice(0, 16), (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function restoredObjectKey(eventId: string, kind: string, id: string, filename: string) {
  const extension = filename.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase() ?? "bin";
  return `restored/${eventId}/${kind}/${id}.${extension}`;
}

async function providerDownload(env: Bindings, job: CloudRestoreIdentity, providerFileId: string) {
  if (job.provider === "google_drive") {
    const token = await googleDriveAccessTokenForUser(env, job.user_id);
    return fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(providerFileId)}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
  const token = await dropboxAccessTokenForUser(env, job.user_id);
  return fetch("https://content.dropboxapi.com/2/files/download", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Dropbox-API-Arg": JSON.stringify({ path: providerFileId }) },
  });
}

async function restoreFile(
  env: Bindings,
  job: CloudRestoreIdentity,
  file: NonNullable<EventArchive["cloudBackup"]>["files"][number],
  albumMap: Record<string, string>,
) {
  const id = await stableId(job.id, file.itemKey);
  const objectKey = restoredObjectKey(job.event_id, file.kind, id, file.filename);
  const response = await providerDownload(env, job, file.providerFileId);
  if (!response.ok || !response.body) throw new Error(`Cloud file download failed (${response.status})`);
  const declaredLength = Number(response.headers.get("Content-Length") ?? file.sizeBytes);
  if (file.sizeBytes > 0 && Number.isFinite(declaredLength) && declaredLength !== file.sizeBytes) {
    throw new Error(`Cloud file size does not match the event manifest (${file.filename})`);
  }
  const stored = await env.MEDIA.put(objectKey, response.body, { httpMetadata: { contentType: file.contentType } });
  if (file.sizeBytes > 0 && stored.size !== file.sizeBytes) {
    await env.MEDIA.delete(objectKey);
    throw new Error(`Restored cloud file size is invalid (${file.filename})`);
  }
  const metadata = file.metadata ?? {};
  const now = Date.now();
  if (file.kind === "gallery_media") {
    const sourceAlbum = String(metadata.album_id ?? "");
    await env.DB.prepare(`INSERT OR IGNORE INTO media
      (id,event_id,object_key,media_type,content_type,uploaded_by,uploaded_at,captured_at,content_hash,canonical_hash,
       size_bytes,title,upload_consent_at,upload_policy_version,origin,uploaded_by_user_id,album_id,moderation_status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      id, job.event_id, objectKey, metadata.media_type === "video" ? "video" : "image", file.contentType,
      String(metadata.uploaded_by ?? "Restored backup").slice(0, 100), Number(metadata.uploaded_at ?? now),
      Number.isFinite(Number(metadata.captured_at)) ? Number(metadata.captured_at) : null,
      typeof metadata.content_hash === "string" ? metadata.content_hash : null,
      typeof metadata.canonical_hash === "string" ? metadata.canonical_hash : null,
      file.sizeBytes, typeof metadata.title === "string" ? metadata.title.slice(0, 200) : null,
      Number.isFinite(Number(metadata.upload_consent_at)) ? Number(metadata.upload_consent_at) : null,
      typeof metadata.upload_policy_version === "string" ? metadata.upload_policy_version : null,
      metadata.origin === "official" ? "official" : "guest", null, albumMap[sourceAlbum] ?? null,
      ["pending", "hidden"].includes(String(metadata.moderation_status)) ? metadata.moderation_status : "approved",
    ).run();
  } else if (file.kind === "wedding_media") {
    await env.DB.prepare(`INSERT OR IGNORE INTO event_wedding_media
      (id,event_id,object_key,media_type,content_type,size_bytes,uploaded_at,uploaded_by_user_id)
      VALUES (?,?,?,?,?,?,?,?)`).bind(
      id, job.event_id, objectKey, metadata.media_type === "video" ? "video" : "image", file.contentType,
      file.sizeBytes, Number(metadata.uploaded_at ?? now), job.user_id,
    ).run();
  } else if (file.kind === "event_cover") {
    await env.DB.prepare(`INSERT INTO event_covers (event_id,source_media_id,object_key,content_type,updated_by,updated_at)
      VALUES (?,?,?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET source_media_id=excluded.source_media_id,
      object_key=excluded.object_key,content_type=excluded.content_type,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
      .bind(job.event_id, null, objectKey, file.contentType, job.user_id, now).run();
  } else {
    await env.DB.prepare(`INSERT INTO event_wedding_menus
      (event_id,object_key,content_type,original_filename,size_bytes,updated_by,updated_at)
      VALUES (?,?,?,?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET object_key=excluded.object_key,
      content_type=excluded.content_type,original_filename=excluded.original_filename,size_bytes=excluded.size_bytes,
      updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(
      job.event_id, objectKey, file.contentType,
      String(metadata.original_filename ?? file.filename).slice(0, 200), file.sizeBytes, job.user_id, now,
    ).run();
  }
  return { id, kind: file.kind, sourceId: file.sourceId };
}

export class CloudEventRestoreWorkflow extends WorkflowEntrypoint<Bindings, { restoreId: string }> {
  async run(event: WorkflowEvent<{ restoreId: string }>, step: WorkflowStep) {
    const snapshot = await step.do("load cloud event restore", async () => {
      const job = await this.env.DB.prepare("SELECT * FROM cloud_event_restore_jobs WHERE id=?")
        .bind(event.payload.restoreId).first<CloudRestoreJob>();
      if (!job) throw new Error("Cloud restore no longer exists");
      const archive = parseEventArchive(JSON.parse(job.manifest_json));
      if (!archive?.cloudBackup || archive.cloudBackup.provider !== job.provider) throw new Error("Cloud restore manifest is invalid");
      const now = Date.now();
      await this.env.DB.prepare("UPDATE cloud_event_restore_jobs SET status='running',started_at=COALESCE(started_at,?),updated_at=? WHERE id=?")
        .bind(now, now, job.id).run();
      return {
        job: { id: job.id, user_id: job.user_id, event_id: job.event_id, provider: job.provider },
        albumMapJson: job.album_map_json,
        totalItems: archive.cloudBackup.files.length,
      };
    });
    const albumMap = JSON.parse(snapshot.albumMapJson) as Record<string, string>;
    let failed = 0;
    const weddingIds = new Map<string, string>();
    for (let index = 0; index < snapshot.totalItems; index++) {
      try {
        const restored = await step.do(
          `restore cloud file ${index + 1}`,
          { retries: { limit: 5, delay: "10 seconds", backoff: "exponential" }, timeout: "30 minutes" },
          async () => {
            const row = await this.env.DB.prepare("SELECT * FROM cloud_event_restore_items WHERE restore_id=? AND sequence_no=?")
              .bind(snapshot.job.id, index + 1).first<{
                item_key: string; kind: NonNullable<EventArchive["cloudBackup"]>["files"][number]["kind"];
                source_id: string; filename: string; content_type: string; size_bytes: number;
                provider_file_id: string; metadata_json: string; status: string; target_id: string | null;
              }>();
            if (!row) throw new Error("Cloud restore item is missing");
            if (row.status === "completed" && row.target_id) return { id: row.target_id, kind: row.kind, sourceId: row.source_id };
            const file: NonNullable<EventArchive["cloudBackup"]>["files"][number] = {
              itemKey: row.item_key, kind: row.kind, sourceId: row.source_id, filename: row.filename,
              contentType: row.content_type, sizeBytes: Number(row.size_bytes), providerFileId: row.provider_file_id,
              metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
            };
            const result = await restoreFile(this.env, snapshot.job, file, albumMap);
            const now = Date.now();
            await this.env.DB.batch([
              this.env.DB.prepare("UPDATE cloud_event_restore_items SET status='completed',target_id=?,error_message=NULL,updated_at=? WHERE restore_id=? AND sequence_no=?")
                .bind(result.id, now, snapshot.job.id, index + 1),
              this.env.DB.prepare("UPDATE cloud_event_restore_jobs SET completed_items=(SELECT COUNT(*) FROM cloud_event_restore_items WHERE restore_id=? AND status='completed'),updated_at=? WHERE id=?")
                .bind(snapshot.job.id, now, snapshot.job.id),
            ]);
            return result;
          },
        );
        if (restored.kind === "wedding_media") weddingIds.set(restored.sourceId, restored.id);
      } catch (error) {
        failed++;
        await step.do(`record failed cloud file ${index + 1}`, async () => {
          const now = Date.now();
          await this.env.DB.batch([
            this.env.DB.prepare("UPDATE cloud_event_restore_items SET status='failed',error_message=?,updated_at=? WHERE restore_id=? AND sequence_no=?")
              .bind(safeError(error), now, snapshot.job.id, index + 1),
            this.env.DB.prepare("UPDATE cloud_event_restore_jobs SET failed_items=(SELECT COUNT(*) FROM cloud_event_restore_items WHERE restore_id=? AND status='failed'),error_message=?,updated_at=? WHERE id=?")
              .bind(snapshot.job.id, safeError(error), now, snapshot.job.id),
          ]);
          return true;
        });
      }
    }
    await step.do("restore wedding portrait assignments", async () => {
      const stored = await this.env.DB.prepare("SELECT manifest_json FROM cloud_event_restore_jobs WHERE id=?")
        .bind(snapshot.job.id).first<{ manifest_json: string }>();
      const archive = stored ? parseEventArchive(JSON.parse(stored.manifest_json)) : null;
      if (!archive) throw new Error("Cloud restore manifest is missing");
      const assignments = archive.data.weddingPortraitAssignments ?? [];
      const statements = assignments.flatMap((assignment) => {
        const mediaId = weddingIds.get(String(assignment.media_id ?? ""));
        if (!mediaId || !["hero", "story", "divider_1", "divider_2", "divider_3"].includes(String(assignment.slot))) return [];
        return [this.env.DB.prepare(`INSERT OR REPLACE INTO event_wedding_portrait_assignments
          (event_id,media_id,slot,position,updated_at) VALUES (?,?,?,?,?)`).bind(
          snapshot.job.event_id, mediaId, assignment.slot, Number(assignment.position ?? 0), Date.now(),
        )];
      });
      if (statements.length) await this.env.DB.batch(statements);
    });
    return step.do("finalize cloud event restore", async () => {
      const counts = await this.env.DB.prepare("SELECT failed_items FROM cloud_event_restore_jobs WHERE id=?")
        .bind(snapshot.job.id).first<{ failed_items: number }>();
      const failureCount = Number(counts?.failed_items ?? failed);
      const now = Date.now();
      await this.env.DB.prepare("UPDATE cloud_event_restore_jobs SET status=?,error_message=?,completed_at=?,updated_at=? WHERE id=?")
        .bind(failureCount ? "failed" : "completed", failureCount ? `${failureCount} file(s) could not be restored` : null, now, now, snapshot.job.id).run();
      return { status: failureCount ? "failed" : "completed", restoreId: snapshot.job.id };
    });
  }
}
