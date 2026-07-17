import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { prepareGoogleDriveBackup } from "../src/google-drive";

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
    env.DB.prepare(`CREATE UNIQUE INDEX one_active_backup
      ON event_backups(event_id,user_id,provider) WHERE status IN ('queued','running')`),
  ]);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO events VALUES (?,NULL)").bind("event-1"),
    env.DB.prepare("INSERT INTO event_members VALUES (?,?,?)").bind("event-1", "owner-1", "owner"),
    env.DB.prepare("INSERT INTO cloud_connections VALUES (?,?)").bind("owner-1", "google_drive"),
    env.DB.prepare("INSERT INTO media VALUES (?,?,?,?,?,?,?,?,?)").bind("media-1", "event-1", "event-1/one.jpg", "image/jpeg", 10, 1, 2, null, null),
    env.DB.prepare("INSERT INTO media VALUES (?,?,?,?,?,?,?,?,?)").bind("media-2", "event-1", "event-1/two.mp4", "video/mp4", 20, null, 3, null, null),
  ]);
});

describe("automatic Google Drive backup preparation", () => {
  it("creates an incremental snapshot and never queues the same media twice", async () => {
    const first = await prepareGoogleDriveBackup(env.DB, "event-1", "owner-1");
    expect(first.status).toBe("queued");
    if (first.status !== "queued") throw new Error("Expected queued backup");

    const items = await env.DB.prepare(
      "SELECT media_id,sequence_no,filename FROM event_backup_items WHERE backup_id=? ORDER BY sequence_no",
    ).bind(first.backupId).all<{ media_id: string; sequence_no: number; filename: string }>();
    expect(items.results).toEqual([
      { media_id: "media-1", sequence_no: 1, filename: "0001.jpg" },
      { media_id: "media-2", sequence_no: 2, filename: "0002.mp4" },
    ]);
    expect((await prepareGoogleDriveBackup(env.DB, "event-1", "owner-1")).status).toBe("active");

    await env.DB.prepare("UPDATE event_backup_items SET status='completed' WHERE backup_id=?").bind(first.backupId).run();
    await env.DB.prepare("UPDATE event_backups SET status='completed' WHERE id=?").bind(first.backupId).run();
    await env.DB.prepare("INSERT INTO media VALUES (?,?,?,?,?,?,?,?,?)").bind("media-3", "event-1", "event-1/three.jpg", "image/jpeg", 30, 4, 5, null, null).run();

    const second = await prepareGoogleDriveBackup(env.DB, "event-1", "owner-1");
    expect(second.status).toBe("queued");
    if (second.status !== "queued") throw new Error("Expected incremental backup");
    const secondItems = await env.DB.prepare(
      "SELECT media_id,sequence_no,filename FROM event_backup_items WHERE backup_id=?",
    ).bind(second.backupId).all<{ media_id: string; sequence_no: number; filename: string }>();
    expect(secondItems.results).toEqual([{ media_id: "media-3", sequence_no: 3, filename: "0003.jpg" }]);
  });

  it("requires both an owner membership and a connected Drive", async () => {
    expect((await prepareGoogleDriveBackup(env.DB, "event-1", "someone-else")).status).toBe("not_connected");
    await env.DB.prepare("DELETE FROM cloud_connections").run();
    expect((await prepareGoogleDriveBackup(env.DB, "event-1", "owner-1")).status).toBe("not_connected");
  });
});
