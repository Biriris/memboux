import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { listCloudBackupAssets } from "../src/cloud-backup-manifest";

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DROP TABLE IF EXISTS event_wedding_menus"),
    env.DB.prepare("DROP TABLE IF EXISTS event_covers"),
    env.DB.prepare("DROP TABLE IF EXISTS event_wedding_media"),
    env.DB.prepare("DROP TABLE IF EXISTS media"),
    env.DB.prepare(`CREATE TABLE media (
      id TEXT PRIMARY KEY,event_id TEXT,object_key TEXT,content_type TEXT,size_bytes INTEGER,
      captured_at INTEGER,uploaded_at INTEGER,deleted_at INTEGER,reported_at INTEGER
    )`),
    env.DB.prepare(`CREATE TABLE event_wedding_media (
      id TEXT PRIMARY KEY,event_id TEXT,object_key TEXT,media_type TEXT,content_type TEXT,size_bytes INTEGER,uploaded_at INTEGER
    )`),
    env.DB.prepare("CREATE TABLE event_covers (event_id TEXT PRIMARY KEY,object_key TEXT,content_type TEXT,source_media_id TEXT,updated_at INTEGER)"),
    env.DB.prepare("CREATE TABLE event_wedding_menus (event_id TEXT PRIMARY KEY,object_key TEXT,content_type TEXT,size_bytes INTEGER,original_filename TEXT,updated_at INTEGER)"),
  ]);
});

describe("cloud backup asset snapshot", () => {
  it("keeps gallery, wedding, cover, and menu assets in one provider package", async () => {
    await env.MEDIA.put("covers/event-1/cover.jpg", new Uint8Array([1, 2, 3]), {
      httpMetadata: { contentType: "image/jpeg" },
    });
    await env.DB.batch([
      env.DB.prepare("INSERT INTO media VALUES (?,?,?,?,?,?,?,?,?)")
        .bind("media-1", "event-1", "events/one.jpg", "image/jpeg", 10, 1, 2, null, null),
      env.DB.prepare("INSERT INTO event_wedding_media VALUES (?,?,?,?,?,?,?)")
        .bind("wedding-1", "event-1", "wedding/one.webp", "image", "image/webp", 20, 3),
      env.DB.prepare("INSERT INTO event_covers VALUES (?,?,?,?,?)")
        .bind("event-1", "covers/event-1/cover.jpg", "image/jpeg", "media-1", 4),
      env.DB.prepare("INSERT INTO event_wedding_menus VALUES (?,?,?,?,?,?)")
        .bind("event-1", "menus/event-1/menu.pdf", "application/pdf", 30, "menu.pdf", 5),
    ]);

    const assets = await listCloudBackupAssets(env.DB, env.MEDIA, "event-1");
    expect(assets.map((asset) => asset.kind)).toEqual([
      "gallery_media", "wedding_media", "event_cover", "wedding_menu",
    ]);
    expect(assets.find((asset) => asset.kind === "event_cover")?.sizeBytes).toBe(3);
    expect(assets.find((asset) => asset.kind === "wedding_menu")?.filename).toBe("wedding-menu.pdf");
  });
});
