import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  decryptDropboxRefreshToken,
  DROPBOX_REDIRECT_URI,
  DROPBOX_SCOPE,
  dropboxAuthorizationUrl,
  encryptDropboxRefreshToken,
  prepareDropboxBackup,
  sanitizeDropboxFolderName,
} from "../src/dropbox";

describe("Dropbox connection security", () => {
  it("encrypts refresh tokens and binds them to the owning user", async () => {
    const encrypted = await encryptDropboxRefreshToken("a-long-production-secret", "user-1", "refresh-token-value");
    expect(encrypted.encryptedToken).not.toContain("refresh-token-value");
    await expect(decryptDropboxRefreshToken(
      "a-long-production-secret", "user-1", encrypted.encryptedToken, encrypted.iv,
    )).resolves.toBe("refresh-token-value");
    await expect(decryptDropboxRefreshToken(
      "a-long-production-secret", "user-2", encrypted.encryptedToken, encrypted.iv,
    )).rejects.toBeTruthy();
  });

  it("requests offline access and only file-content scopes", () => {
    const authorization = new URL(dropboxAuthorizationUrl("app-key", "csrf-state"));
    expect(authorization.origin).toBe("https://www.dropbox.com");
    expect(authorization.searchParams.get("redirect_uri")).toBe(DROPBOX_REDIRECT_URI);
    expect(authorization.searchParams.get("scope")).toBe(DROPBOX_SCOPE);
    expect(authorization.searchParams.get("token_access_type")).toBe("offline");
    expect(authorization.searchParams.get("state")).toBe("csrf-state");
  });

  it("sanitizes Dropbox path characters", () => {
    expect(sanitizeDropboxFolderName(' Summer / trip: "2026". ')).toBe("Summer trip 2026");
  });
});

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DROP TABLE IF EXISTS event_backup_items"),
    env.DB.prepare("DROP TABLE IF EXISTS event_backups"),
    env.DB.prepare("DROP TABLE IF EXISTS cloud_connections"),
    env.DB.prepare("DROP TABLE IF EXISTS media"),
    env.DB.prepare("DROP TABLE IF EXISTS event_members"),
    env.DB.prepare("DROP TABLE IF EXISTS events"),
    env.DB.prepare("CREATE TABLE events (id TEXT PRIMARY KEY,deleted_at INTEGER)"),
    env.DB.prepare("CREATE TABLE event_members (event_id TEXT,user_id TEXT,role TEXT)"),
    env.DB.prepare(`CREATE TABLE media (
      id TEXT PRIMARY KEY,event_id TEXT,object_key TEXT,content_type TEXT,size_bytes INTEGER,
      captured_at INTEGER,uploaded_at INTEGER,deleted_at INTEGER,reported_at INTEGER
    )`),
    env.DB.prepare("CREATE TABLE cloud_connections (user_id TEXT,provider TEXT)"),
    env.DB.prepare(`CREATE TABLE event_backups (
      id TEXT PRIMARY KEY,event_id TEXT,user_id TEXT,provider TEXT,status TEXT,
      workflow_instance_id TEXT,provider_folder_id TEXT,total_items INTEGER,
      completed_items INTEGER DEFAULT 0,failed_items INTEGER DEFAULT 0,total_bytes INTEGER,
      completed_bytes INTEGER DEFAULT 0,error_message TEXT,created_at INTEGER,
      started_at INTEGER,completed_at INTEGER,updated_at INTEGER
    )`),
    env.DB.prepare(`CREATE TABLE event_backup_items (
      backup_id TEXT,media_id TEXT,sequence_no INTEGER,object_key TEXT,content_type TEXT,
      size_bytes INTEGER,filename TEXT,status TEXT,provider_file_id TEXT,error_message TEXT,
      completed_at INTEGER,updated_at INTEGER,PRIMARY KEY(backup_id,media_id)
    )`),
    env.DB.prepare(`CREATE UNIQUE INDEX one_active_dropbox_backup
      ON event_backups(event_id,user_id,provider) WHERE status IN ('queued','running')`),
  ]);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO events VALUES (?,NULL)").bind("event-1"),
    env.DB.prepare("INSERT INTO event_members VALUES (?,?,?)").bind("event-1", "viewer-1", "viewer"),
    env.DB.prepare("INSERT INTO cloud_connections VALUES (?,?)").bind("viewer-1", "dropbox"),
    env.DB.prepare("INSERT INTO media VALUES (?,?,?,?,?,?,?,?,?)")
      .bind("media-1", "event-1", "event-1/one.jpg", "image/jpeg", 10, 1, 2, null, null),
  ]);
});

describe("Dropbox accepted-album backup preparation", () => {
  it("queues a private backup for a viewer and remains incremental", async () => {
    const first = await prepareDropboxBackup(env.DB, "event-1", "viewer-1");
    expect(first.status).toBe("queued");
    if (first.status !== "queued") throw new Error("Expected queued backup");
    const item = await env.DB.prepare(
      "SELECT media_id,filename FROM event_backup_items WHERE backup_id=?",
    ).bind(first.backupId).first<{ media_id: string; filename: string }>();
    expect(item).toEqual({ media_id: "media-1", filename: "0001.jpg" });
    expect((await prepareDropboxBackup(env.DB, "event-1", "viewer-1")).status).toBe("active");
  });
});
