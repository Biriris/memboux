import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { getEvent, getMedia, permanentlyDeleteEvent } from "../src/repositories";

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DROP TABLE IF EXISTS event_wedding_menus"),
    env.DB.prepare("DROP TABLE IF EXISTS event_covers"),
    env.DB.prepare("DROP TABLE IF EXISTS media"),
    env.DB.prepare("DROP TABLE IF EXISTS event_members"),
    env.DB.prepare("DROP TABLE IF EXISTS account_storage_usage"),
    env.DB.prepare("DROP TABLE IF EXISTS events"),
    env.DB.prepare(`CREATE TABLE events (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      eventName TEXT NOT NULL,
      admin_token_hash TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT NOT NULL DEFAULT '',
      updated_at INTEGER,
      default_locale TEXT NOT NULL DEFAULT 'en',
      event_start_date TEXT,
      event_end_date TEXT,
      gallery_pin_hash TEXT,
      deleted_at INTEGER,
      purge_at INTEGER
    )`),
    env.DB.prepare(`CREATE TABLE media (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      object_key TEXT NOT NULL,
      media_type TEXT NOT NULL,
      content_type TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      uploaded_at INTEGER NOT NULL,
      captured_at INTEGER,
      content_hash TEXT,
      reported_at INTEGER,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      title TEXT,
      deleted_at INTEGER,
      purge_at INTEGER
    )`),
    env.DB.prepare("CREATE TABLE event_members (event_id TEXT,user_id TEXT,role TEXT)"),
    env.DB.prepare("CREATE TABLE account_storage_usage (user_id TEXT PRIMARY KEY,used_bytes INTEGER,updated_at INTEGER)"),
    env.DB.prepare("CREATE TABLE event_covers (event_id TEXT PRIMARY KEY,object_key TEXT NOT NULL)"),
    env.DB.prepare("CREATE TABLE event_wedding_menus (event_id TEXT PRIMARY KEY,object_key TEXT NOT NULL)"),
  ]);
});

describe("event repository", () => {
  it("normalizes event codes and hides trashed events", async () => {
    await env.DB.prepare("INSERT INTO events (id,code,eventName,created_at,expires_at,deleted_at) VALUES (?,?,?,?,?,?)")
      .bind("event-1", "ABC123", "Visible", 1, 2, null)
      .run();
    await env.DB.prepare("INSERT INTO events (id,code,eventName,created_at,expires_at,deleted_at) VALUES (?,?,?,?,?,?)")
      .bind("event-2", "DEL123", "Deleted", 1, 2, Date.now())
      .run();

    expect((await getEvent(env.DB, "abc123"))?.eventName).toBe("Visible");
    expect(await getEvent(env.DB, "del123")).toBeNull();
    expect((await getEvent(env.DB, "del123", true))?.eventName).toBe("Deleted");
  });

  it("permanently removes a deleted event, its R2 objects, and storage usage", async () => {
    await env.DB.prepare("INSERT INTO events (id,code,eventName,created_at,expires_at,deleted_at,purge_at) VALUES (?,?,?,?,?,?,?)")
      .bind("event-delete", "DEL999", "Owner deleted", 1, 2, 10, 20)
      .run();
    await env.DB.prepare("INSERT INTO event_members (event_id,user_id,role) VALUES (?,?,?)")
      .bind("event-delete", "owner-1", "owner")
      .run();
    await env.DB.prepare("INSERT INTO account_storage_usage (user_id,used_bytes,updated_at) VALUES (?,?,?)")
      .bind("owner-1", 500, 1)
      .run();
    await env.DB.prepare("INSERT INTO media (id,event_id,object_key,media_type,content_type,uploaded_by,uploaded_at,size_bytes) VALUES (?,?,?,?,?,?,?,?)")
      .bind("media-delete", "event-delete", "event-delete/photo.jpg", "image", "image/jpeg", "Guest", 1, 120)
      .run();
    await env.MEDIA.put("event-delete/photo.jpg", new Uint8Array([1, 2, 3]));
    await env.DB.prepare("INSERT INTO event_covers (event_id,object_key) VALUES (?,?)")
      .bind("event-delete", "event-covers/event-delete.webp").run();
    await env.DB.prepare("INSERT INTO event_wedding_menus (event_id,object_key) VALUES (?,?)")
      .bind("event-delete", "wedding-menus/event-delete/menu.pdf").run();
    await env.MEDIA.put("event-covers/event-delete.webp", new Uint8Array([4, 5, 6]));
    await env.MEDIA.put("wedding-menus/event-delete/menu.pdf", new Uint8Array([7, 8, 9]));

    const result = await permanentlyDeleteEvent(env, "event-delete");

    expect(result.meta.changes).toBe(1);
    expect(await getEvent(env.DB, "DEL999", true)).toBeNull();
    expect(await env.DB.prepare("SELECT id FROM media WHERE event_id=?").bind("event-delete").first()).toBeNull();
    expect(await env.MEDIA.get("event-delete/photo.jpg")).toBeNull();
    expect(await env.MEDIA.get("event-covers/event-delete.webp")).toBeNull();
    expect(await env.MEDIA.get("wedding-menus/event-delete/menu.pdf")).toBeNull();
    expect((await env.DB.prepare("SELECT used_bytes FROM account_storage_usage WHERE user_id=?").bind("owner-1").first<{ used_bytes: number }>())?.used_bytes).toBe(380);
  });
});

describe("media repository", () => {
  it("hides deleted and reported media and orders by capture time", async () => {
    await env.DB.prepare("INSERT INTO events (id,code,eventName,created_at,expires_at) VALUES (?,?,?,?,?)")
      .bind("event-1", "ABC123", "Event", 1, 2)
      .run();

    const insert = (id: string, uploadedAt: number, capturedAt: number | null, reportedAt: number | null, deletedAt: number | null) => env.DB.prepare(
      "INSERT INTO media (id,event_id,object_key,media_type,content_type,uploaded_by,uploaded_at,captured_at,reported_at,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ).bind(id, "event-1", `event-1/${id}.jpg`, "image", "image/jpeg", "Guest", uploadedAt, capturedAt, reportedAt, deletedAt).run();

    await insert("late-upload-early-capture", 300, 100, null, null);
    await insert("early-upload", 200, null, null, null);
    await insert("reported", 50, 50, Date.now(), null);
    await insert("deleted", 60, 60, null, Date.now());

    expect((await getMedia(env.DB, "event-1")).map((item) => item.id)).toEqual([
      "late-upload-early-capture",
      "early-upload",
    ]);
  });
});
