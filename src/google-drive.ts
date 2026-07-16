import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type {
  Bindings,
  CloudConnectionRow,
  EventBackupItemRow,
  EventBackupRow,
} from "./domain";

export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const GOOGLE_DRIVE_REDIRECT_URI = "https://memboux.com/api/cloud/google/callback";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

type DriveFile = { id: string; name?: string; size?: string };

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
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`memboux-google-drive-token:v1:${secret}`),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptDriveRefreshToken(secret: string, userId: string, token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(`memboux-drive:${userId}`) },
    await encryptionKey(secret),
    encoder.encode(token),
  );
  return {
    encryptedToken: bytesToBase64Url(new Uint8Array(ciphertext)),
    iv: bytesToBase64Url(iv),
  };
}

export async function decryptDriveRefreshToken(
  secret: string,
  userId: string,
  encryptedToken: string,
  iv: string,
) {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64UrlToBytes(iv),
      additionalData: encoder.encode(`memboux-drive:${userId}`),
    },
    await encryptionKey(secret),
    base64UrlToBytes(encryptedToken),
  );
  return new TextDecoder().decode(plaintext);
}

export function randomOAuthState() {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export function googleDriveAuthorizationUrl(clientId: string, state: string) {
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: GOOGLE_DRIVE_REDIRECT_URI,
    response_type: "code",
    scope: GOOGLE_DRIVE_SCOPE,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${query}`;
}

export function sanitizeDriveFolderName(value: string) {
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || "Memboux event").slice(0, 120);
}

function driveDate(value: string) {
  return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(2, 4)}`;
}

const mimeExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-m4v": "m4v",
};

export function driveExportFilename(sequence: number, contentType: string, objectKey: string) {
  const objectExtension = objectKey.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase();
  const extension = mimeExtensions[contentType.toLowerCase()] ?? objectExtension ?? "bin";
  return `${String(sequence).padStart(4, "0")}.${extension}`;
}

async function tokenRequest(body: URLSearchParams) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const result = await response.json().catch(() => ({})) as TokenResponse;
  if (!response.ok) {
    throw new Error(`Google OAuth request failed (${result.error ?? response.status})`);
  }
  return result;
}

export function exchangeGoogleDriveCode(env: Bindings, code: string) {
  return tokenRequest(new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: GOOGLE_DRIVE_REDIRECT_URI,
  }));
}

async function refreshGoogleDriveAccessToken(env: Bindings, connection: CloudConnectionRow) {
  const refreshToken = await decryptDriveRefreshToken(
    env.BETTER_AUTH_SECRET,
    connection.user_id,
    connection.encrypted_refresh_token,
    connection.token_iv,
  );
  const result = await tokenRequest(new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  }));
  if (!result.access_token) throw new Error("Google did not return an access token");
  return result.access_token;
}

async function driveJson<T>(url: string, accessToken: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const result = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(`Google Drive request failed (${response.status}): ${result.error?.message ?? "unknown error"}`);
  }
  return result;
}

function driveQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findDriveFile(accessToken: string, query: string) {
  const params = new URLSearchParams({
    q: `trashed=false and ${query}`,
    spaces: "drive",
    fields: "files(id,name,size)",
    pageSize: "10",
  });
  const result = await driveJson<{ files?: DriveFile[] }>(
    `https://www.googleapis.com/drive/v3/files?${params}`,
    accessToken,
  );
  return result.files?.[0] ?? null;
}

async function createDriveFolder(
  accessToken: string,
  name: string,
  appProperties: Record<string, string>,
  parentId?: string,
) {
  return driveJson<DriveFile>(
    "https://www.googleapis.com/drive/v3/files?fields=id,name",
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        appProperties,
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    },
  );
}

async function ensureBackupFolder(env: Bindings, backupId: string) {
  const backup = await env.DB.prepare(
    `SELECT b.*,e.eventName,e.event_start_date,e.event_end_date
     FROM event_backups b JOIN events e ON e.id=b.event_id WHERE b.id=?`,
  ).bind(backupId).first<EventBackupRow & {
    eventName: string;
    event_start_date: string | null;
    event_end_date: string | null;
  }>();
  if (!backup) throw new Error("Backup no longer exists");
  if (backup.provider_folder_id) return backup.provider_folder_id;

  const connection = await env.DB.prepare(
    "SELECT * FROM cloud_connections WHERE user_id=? AND provider='google_drive'",
  ).bind(backup.user_id).first<CloudConnectionRow>();
  if (!connection) throw new Error("Google Drive is no longer connected");
  const accessToken = await refreshGoogleDriveAccessToken(env, connection);

  const existingRoot = await findDriveFile(
    accessToken,
    "mimeType='application/vnd.google-apps.folder' and appProperties has { key='membouxRoot' and value='v1' }",
  );
  let rootFolderId = existingRoot?.id ?? null;
  if (!rootFolderId) {
    rootFolderId = existingRoot?.id ?? (await createDriveFolder(
      accessToken,
      "Memboux",
      { membouxRoot: "v1" },
    )).id;
    await env.DB.prepare(
      "UPDATE cloud_connections SET root_folder_id=?,updated_at=? WHERE id=?",
    ).bind(rootFolderId, Date.now(), connection.id).run();
  }

  const folderQuery = [
    "mimeType='application/vnd.google-apps.folder'",
    `'${driveQuery(rootFolderId)}' in parents`,
    `appProperties has { key='membouxBackupId' and value='${driveQuery(backup.id)}' }`,
  ].join(" and ");
  const existingFolder = await findDriveFile(accessToken, folderQuery);
  const dateSuffix = backup.event_start_date
    ? ` (${driveDate(backup.event_start_date)}${backup.event_end_date && backup.event_end_date !== backup.event_start_date ? ` – ${driveDate(backup.event_end_date)}` : ""})`
    : "";
  const folderId = existingFolder?.id ?? (await createDriveFolder(
    accessToken,
    sanitizeDriveFolderName(`${backup.eventName}${dateSuffix}`),
    { membouxBackupId: backup.id, membouxEventId: backup.event_id },
    rootFolderId,
  )).id;
  await env.DB.prepare(
    "UPDATE event_backups SET provider_folder_id=?,updated_at=? WHERE id=?",
  ).bind(folderId, Date.now(), backup.id).run();
  return folderId;
}

async function uploadDriveObject(
  accessToken: string,
  folderId: string,
  item: EventBackupItemRow,
  object: R2ObjectBody,
) {
  const initiation = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": item.content_type,
        "X-Upload-Content-Length": String(object.size),
      },
      body: JSON.stringify({
        name: item.filename,
        parents: [folderId],
        appProperties: {
          membouxBackupId: item.backup_id,
          membouxMediaId: item.media_id,
        },
      }),
    },
  );
  if (!initiation.ok) {
    const detail = await initiation.text().catch(() => "");
    throw new Error(`Could not start Drive upload (${initiation.status}): ${detail.slice(0, 180)}`);
  }
  const sessionUrl = initiation.headers.get("Location");
  if (!sessionUrl) throw new Error("Google Drive did not return an upload session");

  const upload = await fetch(sessionUrl, {
    method: "PUT",
    headers: {
      "Content-Type": item.content_type,
      "Content-Length": String(object.size),
    },
    body: object.body,
  });
  const result = await upload.json().catch(() => ({})) as DriveFile & { error?: { message?: string } };
  if (!upload.ok || !result.id) {
    throw new Error(`Drive upload failed (${upload.status}): ${result.error?.message ?? "unknown error"}`);
  }
  return result;
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

async function uploadBackupItem(env: Bindings, backupId: string, mediaId: string) {
  const item = await env.DB.prepare(
    "SELECT * FROM event_backup_items WHERE backup_id=? AND media_id=?",
  ).bind(backupId, mediaId).first<EventBackupItemRow>();
  if (!item) throw new Error("Backup item no longer exists");
  if (item.status === "completed" && item.provider_file_id) return item.provider_file_id;

  const backup = await env.DB.prepare(
    "SELECT * FROM event_backups WHERE id=?",
  ).bind(backupId).first<EventBackupRow>();
  if (!backup?.provider_folder_id) throw new Error("Backup destination is not ready");
  const connection = await env.DB.prepare(
    "SELECT * FROM cloud_connections WHERE user_id=? AND provider='google_drive'",
  ).bind(backup.user_id).first<CloudConnectionRow>();
  if (!connection) throw new Error("Google Drive is no longer connected");
  const accessToken = await refreshGoogleDriveAccessToken(env, connection);

  const existing = await findDriveFile(accessToken, [
    `'${driveQuery(backup.provider_folder_id)}' in parents`,
    `appProperties has { key='membouxBackupId' and value='${driveQuery(backupId)}' }`,
    `appProperties has { key='membouxMediaId' and value='${driveQuery(mediaId)}' }`,
  ].join(" and "));
  const uploaded = existing ?? await (async () => {
    const object = await env.MEDIA.get(item.object_key);
    if (!object) throw new Error("The source file is no longer available in Memboux");
    if (object.size !== item.size_bytes) throw new Error("The source file size changed after the backup started");
    return uploadDriveObject(accessToken, backup.provider_folder_id!, item, object);
  })();

  await env.DB.prepare(
    `UPDATE event_backup_items SET status='completed',provider_file_id=?,error_message=NULL,completed_at=?,updated_at=?
     WHERE backup_id=? AND media_id=?`,
  ).bind(uploaded.id, Date.now(), Date.now(), backupId, mediaId).run();
  await updateBackupAggregate(env.DB, backupId);
  return uploaded.id;
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : "Unknown backup error").replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 500);
}

export class GoogleDriveBackupWorkflow extends WorkflowEntrypoint<Bindings, { backupId: string }> {
  async run(event: WorkflowEvent<{ backupId: string }>, step: WorkflowStep) {
    const snapshot = await step.do("load backup snapshot", async () => {
      const backup = await this.env.DB.prepare("SELECT id,status FROM event_backups WHERE id=?")
        .bind(event.payload.backupId)
        .first<{ id: string; status: EventBackupRow["status"] }>();
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
        "prepare Google Drive folder",
        { retries: { limit: 5, delay: "10 seconds", backoff: "exponential" }, timeout: "10 minutes" },
        () => ensureBackupFolder(this.env, snapshot.backupId),
      );
    } catch (error) {
      await step.do("record destination failure", async () => {
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
          `upload item ${item.sequence_no}`,
          { retries: { limit: 5, delay: "10 seconds", backoff: "exponential" }, timeout: "30 minutes" },
          () => uploadBackupItem(this.env, snapshot.backupId, item.media_id),
        );
      } catch (error) {
        await step.do(`record item ${item.sequence_no} failure`, async () => {
          const now = Date.now();
          await this.env.DB.prepare(
            "UPDATE event_backup_items SET status='failed',error_message=?,updated_at=? WHERE backup_id=? AND media_id=?",
          ).bind(safeError(error), now, snapshot.backupId, item.media_id).run();
          await updateBackupAggregate(this.env.DB, snapshot.backupId);
        });
      }
    }

    return step.do("finalize backup", async () => {
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
