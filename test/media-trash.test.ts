import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { permanentlyDeleteMedia, restoreDeletedMedia } from "../src/media-trash";

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DROP TABLE IF EXISTS media"),
    env.DB.prepare("DROP TABLE IF EXISTS event_members"),
    env.DB.prepare("CREATE TABLE event_members (event_id TEXT,user_id TEXT,role TEXT)"),
    env.DB.prepare(`CREATE TABLE media (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      object_key TEXT NOT NULL,
      content_hash TEXT,
      deleted_at INTEGER,
      purge_at INTEGER,
      reported_at INTEGER
      ,size_bytes INTEGER NOT NULL DEFAULT 0
    )`),
  ]);
});

const insertMedia = (values: {
  id: string;
  eventId?: string;
  objectKey?: string;
  hash?: string | null;
  deletedAt?: number | null;
  purgeAt?: number | null;
  reportedAt?: number | null;
}) => env.DB.prepare(
  "INSERT INTO media (id,event_id,object_key,content_hash,deleted_at,purge_at,reported_at) VALUES (?,?,?,?,?,?,?)",
).bind(
  values.id,
  values.eventId ?? "event-1",
  values.objectKey ?? `event-1/${values.id}.jpg`,
  values.hash ?? null,
  values.deletedAt === undefined ? Date.now() : values.deletedAt,
  values.purgeAt === undefined ? Date.now() + 1_000 : values.purgeAt,
  values.reportedAt ?? null,
).run();

describe("restoreDeletedMedia", () => {
  it("restores a deleted item and clears every quarantine flag", async () => {
    await insertMedia({ id: "deleted", hash: "hash-a", reportedAt: Date.now() });

    expect(await restoreDeletedMedia(env.DB, "deleted")).toBe("restored");
    const media = await env.DB.prepare("SELECT deleted_at,purge_at,reported_at FROM media WHERE id='deleted'").first<{
      deleted_at: number | null; purge_at: number | null; reported_at: number | null;
    }>();
    expect(media).toEqual({ deleted_at: null, purge_at: null, reported_at: null });
  });

  it("blocks restoration when the exact content hash is already active in the same event", async () => {
    await insertMedia({ id: "active", hash: "same-hash", deletedAt: null, purgeAt: null });
    await insertMedia({ id: "deleted", hash: "same-hash" });

    expect(await restoreDeletedMedia(env.DB, "deleted")).toBe("duplicate");
    expect((await env.DB.prepare("SELECT deleted_at FROM media WHERE id='deleted'").first<{ deleted_at: number }>())?.deleted_at).not.toBeNull();
  });

  it("allows the same hash in a different event", async () => {
    await insertMedia({ id: "other-event-active", eventId: "event-2", hash: "same-hash", deletedAt: null, purgeAt: null });
    await insertMedia({ id: "deleted", eventId: "event-1", hash: "same-hash" });

    expect(await restoreDeletedMedia(env.DB, "deleted")).toBe("restored");
  });

  it("reports missing for active or unknown media", async () => {
    await insertMedia({ id: "active", deletedAt: null, purgeAt: null });
    expect(await restoreDeletedMedia(env.DB, "active")).toBe("missing");
    expect(await restoreDeletedMedia(env.DB, "unknown")).toBe("missing");
  });
});

describe("permanentlyDeleteMedia", () => {
  it("removes a deleted item from both R2 and D1", async () => {
    const objectKey = "event-1/deleted.jpg";
    await insertMedia({ id: "deleted", objectKey });
    await env.MEDIA.put(objectKey, new TextEncoder().encode("photo bytes"));

    expect(await permanentlyDeleteMedia(env, "deleted")).toBe(true);
    expect(await env.MEDIA.get(objectKey)).toBeNull();
    expect(await env.DB.prepare("SELECT 1 FROM media WHERE id='deleted'").first()).toBeNull();
  });

  it("never deletes active media", async () => {
    const objectKey = "event-1/active.jpg";
    await insertMedia({ id: "active", objectKey, deletedAt: null, purgeAt: null });
    await env.MEDIA.put(objectKey, new TextEncoder().encode("active photo"));

    expect(await permanentlyDeleteMedia(env, "active")).toBe(false);
    expect(await env.MEDIA.get(objectKey)).not.toBeNull();
    expect(await env.DB.prepare("SELECT 1 FROM media WHERE id='active'").first()).not.toBeNull();
  });
});
