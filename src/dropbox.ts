import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { Bindings, CloudConnectionRow, EventBackupItemRow, EventBackupRow, MediaRow } from "./domain";
import { driveExportFilename } from "./google-drive";

export const DROPBOX_SCOPE = "files.content.write files.metadata.read";
export const DROPBOX_REDIRECT_URI = "https://memboux.com/api/cloud/dropbox/callback";

type DropboxTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

type DropboxMetadata = {
  id: string;
  name: string;
  path_lower?: string;
  path_display?: string;
};

const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKey(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`memboux-dropbox-token:v1:${secret}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptDropboxRefreshToken(secret: string, userId: string, token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(`memboux-dropbox:${userId}`) },
    await encryptionKey(secret),
    encoder.encode(token),
  );
  return { encryptedToken: bytesToBase64Url(new Uint8Array(ciphertext)), iv: bytesToBase64Url(iv) };
}

export async function decryptDropboxRefreshToken(
  secret: string,
  userId: string,
  encryptedToken: string,
  iv: string,
) {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64UrlToBytes(iv),
      additionalData: encoder.encode(`memboux-dropbox:${userId}`),
    },
    await encryptionKey(secret),
    base64UrlToBytes(encryptedToken),
  );
  return new TextDecoder().decode(plaintext);
}

function requireDropboxConfig(env: Bindings) {
  if (!env.DROPBOX_APP_KEY || !env.DROPBOX_APP_SECRET) throw new Error("Dropbox is not configured");
  return { key: env.DROPBOX_APP_KEY, secret: env.DROPBOX_APP_SECRET };
}

export function dropboxAuthorizationUrl(appKey: string, state: string) {
  const query = new URLSearchParams({
    client_id: appKey,
    redirect_uri: DROPBOX_REDIRECT_URI,
    response_type: "code",
    token_access_type: "offline",
    scope: DROPBOX_SCOPE,
    state,
  });
  return `https://www.dropbox.com/oauth2/authorize?${query}`;
}

async function tokenRequest(env: Bindings, body: URLSearchParams) {
  const config = requireDropboxConfig(env);
  const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${config.key}:${config.secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const result = await response.json().catch(() => ({})) as DropboxTokenResponse;
  if (!response.ok) throw new Error(`Dropbox OAuth request failed (${result.error ?? response.status})`);
  return result;
}

export function exchangeDropboxCode(env: Bindings, code: string) {
  return tokenRequest(env, new URLSearchParams({
    code,
    grant_type: "authorization_code",
    redirect_uri: DROPBOX_REDIRECT_URI,
  }));
}

export function exchangeDropboxRefreshToken(env: Bindings, refreshToken: string) {
  return tokenRequest(env, new URLSearchParams({
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  }));
}

async function refreshDropboxAccessToken(env: Bindings, connection: CloudConnectionRow) {
  const refreshToken = await decryptDropboxRefreshToken(
    env.BETTER_AUTH_SECRET,
    connection.user_id,
    connection.encrypted_refresh_token,
    connection.token_iv,
  );
  const result = await exchangeDropboxRefreshToken(env, refreshToken);
  if (!result.access_token) throw new Error("Dropbox did not return an access token");
  return result.access_token;
}

export function sanitizeDropboxFolderName(value: string) {
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f\\/:?*"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  return (cleaned || "Memboux event").slice(0, 100);
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : "Unknown backup error")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .slice(0, 500);
}

export type DropboxBackupQueueResult =
  | { status: "queued"; backupId: string }
  | { status: "active"; backupId: string }
  | { status: "up_to_date"; backupId: null }
  | { status: "not_connected" | "not_member" | "not_configured"; backupId: null };

export async function prepareDropboxBackup(
  db: D1Database,
  eventId: string,
  userId: string,
): Promise<DropboxBackupQueueResult> {
  const connection = await db.prepare(
    "SELECT 1 FROM cloud_connections WHERE user_id=? AND provider='dropbox'",
  ).bind(userId).first();
  if (!connection) return { status: "not_connected", backupId: null };
  const membership = await db.prepare(
    `SELECT 1 FROM event_members em JOIN events e ON e.id=em.event_id
     WHERE em.event_id=? AND em.user_id=? AND e.deleted_at IS NULL`,
  ).bind(eventId, userId).first();
  if (!membership) return { status: "not_member", backupId: null };
  const active = await db.prepare(
    "SELECT id FROM event_backups WHERE event_id=? AND user_id=? AND provider='dropbox' AND status IN ('queued','running')",
  ).bind(eventId, userId).first<{ id: string }>();
  if (active) return { status: "active", backupId: active.id };

  const media = await db.prepare(
    `SELECT m.* FROM media m
     WHERE m.event_id=? AND m.deleted_at IS NULL AND m.reported_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM event_backup_items i JOIN event_backups b ON b.id=i.backup_id
         WHERE i.media_id=m.id AND i.status='completed' AND b.event_id=m.event_id
           AND b.user_id=? AND b.provider='dropbox'
       )
     ORDER BY COALESCE(m.captured_at,m.uploaded_at),m.uploaded_at,m.id`,
  ).bind(eventId, userId).all<MediaRow>();
  if (!media.results.length) return { status: "up_to_date", backupId: null };

  const previous = await db.prepare(
    `SELECT COUNT(DISTINCT i.media_id) total FROM event_backup_items i
     JOIN event_backups b ON b.id=i.backup_id
     WHERE b.event_id=? AND b.user_id=? AND b.provider='dropbox' AND i.status='completed'`,
  ).bind(eventId, userId).first<{ total: number }>();
  const sequenceStart = Number(previous?.total ?? 0);
  const backupId = crypto.randomUUID();
  const now = Date.now();
  const totalBytes = media.results.reduce((sum, item) => sum + Number(item.size_bytes), 0);

  try {
    await db.prepare(
      `INSERT INTO event_backups (id,event_id,user_id,provider,status,total_items,total_bytes,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(backupId, eventId, userId, "dropbox", "queued", media.results.length, totalBytes, now, now).run();
    for (let offset = 0; offset < media.results.length; offset += 50) {
      const chunk = media.results.slice(offset, offset + 50);
      await db.batch(chunk.map((item, index) => {
        const sequence = sequenceStart + offset + index + 1;
        return db.prepare(
          `INSERT INTO event_backup_items (backup_id,media_id,sequence_no,object_key,content_type,size_bytes,filename,status,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
        ).bind(
          backupId,
          item.id,
          sequence,
          item.object_key,
          item.content_type,
          item.size_bytes,
          driveExportFilename(sequence, item.content_type, item.object_key),
          "pending",
          now,
        );
      }));
    }
  } catch (error) {
    await db.prepare("DELETE FROM event_backups WHERE id=?").bind(backupId).run().catch(() => undefined);
    const concurrent = await db.prepare(
      "SELECT id FROM event_backups WHERE event_id=? AND user_id=? AND provider='dropbox' AND status IN ('queued','running')",
    ).bind(eventId, userId).first<{ id: string }>();
    if (concurrent) return { status: "active", backupId: concurrent.id };
    throw error;
  }
  return { status: "queued", backupId };
}

export async function queueDropboxBackupForEvent(env: Bindings, eventId: string, userId: string) {
  if (!env.DROPBOX_APP_KEY || !env.DROPBOX_APP_SECRET) {
    return { status: "not_configured", backupId: null } as const;
  }
  const prepared = await prepareDropboxBackup(env.DB, eventId, userId);
  if (prepared.status !== "queued") return prepared;
  try {
    const instance = await env.DROPBOX_BACKUP_WORKFLOW.create({
      id: prepared.backupId,
      params: { backupId: prepared.backupId },
      retention: { successRetention: "7 days", errorRetention: "14 days" },
    });
    await env.DB.prepare("UPDATE event_backups SET workflow_instance_id=?,updated_at=? WHERE id=?")
      .bind(instance.id, Date.now(), prepared.backupId).run();
  } catch (error) {
    const now = Date.now();
    await env.DB.prepare(
      "UPDATE event_backups SET status='failed',error_message=?,completed_at=?,updated_at=? WHERE id=?",
    ).bind("The automatic Dropbox backup could not be queued", now, now, prepared.backupId).run();
    console.error(JSON.stringify({ event: "dropbox_backup_queue_failed", backupId: prepared.backupId, error: safeError(error) }));
  }
  return prepared;
}

export async function queueAllDropboxBackupsForUser(env: Bindings, userId: string) {
  const events = await env.DB.prepare(
    `SELECT em.event_id FROM event_members em JOIN events e ON e.id=em.event_id
     WHERE em.user_id=? AND e.deleted_at IS NULL`,
  ).bind(userId).all<{ event_id: string }>();
  for (const event of events.results) await queueDropboxBackupForEvent(env, event.event_id, userId);
}

async function dropboxRpc<T>(accessToken: string, endpoint: string, body: unknown) {
  const response = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({})) as T & { error_summary?: string };
  if (!response.ok) throw new Error(`Dropbox request failed (${response.status}): ${result.error_summary ?? "unknown error"}`);
  return result;
}

async function ensureDropboxFolder(env: Bindings, backupId: string) {
  const backup = await env.DB.prepare(
    `SELECT b.*,e.eventName FROM event_backups b JOIN events e ON e.id=b.event_id WHERE b.id=?`,
  ).bind(backupId).first<EventBackupRow & { eventName: string }>();
  if (!backup) throw new Error("Backup no longer exists");
  if (backup.provider_folder_id) return backup.provider_folder_id;
  const connection = await env.DB.prepare(
    "SELECT * FROM cloud_connections WHERE user_id=? AND provider='dropbox'",
  ).bind(backup.user_id).first<CloudConnectionRow>();
  if (!connection) throw new Error("Dropbox is no longer connected");
  const accessToken = await refreshDropboxAccessToken(env, connection);
  const folderPath = `/Memboux/${sanitizeDropboxFolderName(backup.eventName)}-${backup.event_id.slice(0, 8)}`;
  let metadata: DropboxMetadata;
  try {
    const created = await dropboxRpc<{ metadata: DropboxMetadata }>(accessToken, "files/create_folder_v2", {
      path: folderPath,
      autorename: false,
    });
    metadata = created.metadata;
  } catch (error) {
    metadata = await dropboxRpc<DropboxMetadata>(accessToken, "files/get_metadata", {
      path: folderPath,
      include_deleted: false,
    }).catch(() => { throw error; });
  }
  const storedPath = metadata.path_display ?? folderPath;
  await env.DB.prepare("UPDATE event_backups SET provider_folder_id=?,updated_at=? WHERE id=?")
    .bind(storedPath, Date.now(), backup.id).run();
  return storedPath;
}

async function updateBackupAggregate(db: D1Database, backupId: string) {
  const now = Date.now();
  return db.prepare(
    `UPDATE event_backups SET
      completed_items=(SELECT COUNT(*) FROM event_backup_items WHERE backup_id=? AND status='completed'),
      failed_items=(SELECT COUNT(*) FROM event_backup_items WHERE backup_id=? AND status='failed'),
      completed_bytes=COALESCE((SELECT SUM(size_bytes) FROM event_backup_items WHERE backup_id=? AND status='completed'),0),
      updated_at=? WHERE id=?`,
  ).bind(backupId, backupId, backupId, now, backupId).run();
}

async function uploadDropboxItem(env: Bindings, backupId: string, mediaId: string) {
  const item = await env.DB.prepare("SELECT * FROM event_backup_items WHERE backup_id=? AND media_id=?")
    .bind(backupId, mediaId).first<EventBackupItemRow>();
  if (!item) throw new Error("Backup item no longer exists");
  if (item.status === "completed" && item.provider_file_id) return item.provider_file_id;
  const backup = await env.DB.prepare("SELECT * FROM event_backups WHERE id=?")
    .bind(backupId).first<EventBackupRow>();
  if (!backup?.provider_folder_id) throw new Error("Backup destination is not ready");
  const connection = await env.DB.prepare(
    "SELECT * FROM cloud_connections WHERE user_id=? AND provider='dropbox'",
  ).bind(backup.user_id).first<CloudConnectionRow>();
  if (!connection) throw new Error("Dropbox is no longer connected");
  const accessToken = await refreshDropboxAccessToken(env, connection);
  const object = await env.MEDIA.get(item.object_key);
  if (!object) throw new Error("The source file is no longer available in Memboux");
  if (object.size !== item.size_bytes) throw new Error("The source file size changed after the backup started");
  const upload = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({
        path: `${backup.provider_folder_id}/${item.filename}`,
        mode: "overwrite",
        autorename: false,
        mute: true,
        strict_conflict: false,
      }),
    },
    body: object.body,
  });
  const uploaded = await upload.json().catch(() => ({})) as DropboxMetadata & { error_summary?: string };
  if (!upload.ok || !uploaded.id) {
    throw new Error(`Dropbox upload failed (${upload.status}): ${uploaded.error_summary ?? "unknown error"}`);
  }
  const now = Date.now();
  await env.DB.prepare(
    `UPDATE event_backup_items SET status='completed',provider_file_id=?,error_message=NULL,completed_at=?,updated_at=?
     WHERE backup_id=? AND media_id=?`,
  ).bind(uploaded.id, now, now, backupId, mediaId).run();
  await updateBackupAggregate(env.DB, backupId);
  return uploaded.id;
}

export class DropboxBackupWorkflow extends WorkflowEntrypoint<Bindings, { backupId: string }> {
  async run(event: WorkflowEvent<{ backupId: string }>, step: WorkflowStep) {
    const snapshot = await step.do("load Dropbox backup snapshot", async () => {
      const backup = await this.env.DB.prepare("SELECT id FROM event_backups WHERE id=? AND provider='dropbox'")
        .bind(event.payload.backupId).first<{ id: string }>();
      if (!backup) throw new Error("Backup no longer exists");
      const now = Date.now();
      await this.env.DB.prepare(
        "UPDATE event_backups SET status='running',started_at=COALESCE(started_at,?),updated_at=? WHERE id=? AND status='queued'",
      ).bind(now, now, backup.id).run();
      const items = await this.env.DB.prepare(
        "SELECT media_id,sequence_no FROM event_backup_items WHERE backup_id=? ORDER BY sequence_no",
      ).bind(backup.id).all<{ media_id: string; sequence_no: number }>();
      return { backupId: backup.id, items: items.results };
    });

    try {
      await step.do(
        "prepare Dropbox folder",
        { retries: { limit: 5, delay: "10 seconds", backoff: "exponential" }, timeout: "10 minutes" },
        () => ensureDropboxFolder(this.env, snapshot.backupId),
      );
    } catch (error) {
      await step.do("record Dropbox destination failure", async () => {
        const now = Date.now();
        await this.env.DB.prepare(
          "UPDATE event_backups SET status='failed',error_message=?,completed_at=?,updated_at=? WHERE id=?",
        ).bind(safeError(error), now, now, snapshot.backupId).run();
      });
      return { status: "failed", backupId: snapshot.backupId };
    }

    for (const item of snapshot.items) {
      try {
        await step.do(
          `upload Dropbox item ${item.sequence_no}`,
          { retries: { limit: 5, delay: "10 seconds", backoff: "exponential" }, timeout: "30 minutes" },
          () => uploadDropboxItem(this.env, snapshot.backupId, item.media_id),
        );
      } catch (error) {
        await step.do(`record Dropbox item ${item.sequence_no} failure`, async () => {
          const now = Date.now();
          await this.env.DB.prepare(
            "UPDATE event_backup_items SET status='failed',error_message=?,updated_at=? WHERE backup_id=? AND media_id=?",
          ).bind(safeError(error), now, snapshot.backupId, item.media_id).run();
          await updateBackupAggregate(this.env.DB, snapshot.backupId);
        });
      }
    }

    return step.do("finalize Dropbox backup", async () => {
      await updateBackupAggregate(this.env.DB, snapshot.backupId);
      const result = await this.env.DB.prepare(
        "SELECT total_items,completed_items,failed_items FROM event_backups WHERE id=?",
      ).bind(snapshot.backupId).first<{ total_items: number; completed_items: number; failed_items: number }>();
      const completed = Boolean(result && result.completed_items === result.total_items && result.failed_items === 0);
      const now = Date.now();
      await this.env.DB.prepare(
        "UPDATE event_backups SET status=?,error_message=?,completed_at=?,updated_at=? WHERE id=?",
      ).bind(
        completed ? "completed" : "failed",
        completed ? null : `${result?.failed_items ?? 0} file(s) could not be backed up`,
        now,
        now,
        snapshot.backupId,
      ).run();
      return { status: completed ? "completed" : "failed", backupId: snapshot.backupId };
    });
  }
}
