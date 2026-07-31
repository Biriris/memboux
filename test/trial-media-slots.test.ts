import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

const eventId = "lifetime-trial-slots";

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DROP TABLE IF EXISTS multipart_upload_sessions"),
    env.DB.prepare("DROP TABLE IF EXISTS event_wedding_media"),
    env.DB.prepare("DROP TABLE IF EXISTS media"),
    env.DB.prepare("DROP TABLE IF EXISTS event_access"),
    env.DB.prepare("DROP TABLE IF EXISTS events"),
  ]);
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE events (id TEXT PRIMARY KEY,code TEXT,eventName TEXT,created_at INTEGER,expires_at INTEGER)"),
    env.DB.prepare(`CREATE TABLE event_access (
      event_id TEXT PRIMARY KEY,access_state TEXT,enforcement_state TEXT,media_limit INTEGER,
      media_uploads_consumed INTEGER NOT NULL DEFAULT 0,guest_access_enabled INTEGER,
      guest_uploads_enabled INTEGER,original_downloads_enabled INTEGER,trial_started_at INTEGER,
      trial_ends_at INTEGER,created_at INTEGER,updated_at INTEGER)`),
    env.DB.prepare(`CREATE TABLE media (
      id TEXT PRIMARY KEY,event_id TEXT,object_key TEXT,media_type TEXT,content_type TEXT,
      uploaded_by TEXT,uploaded_at INTEGER,size_bytes INTEGER,deleted_at INTEGER)`),
    env.DB.prepare(`CREATE TABLE event_wedding_media (
      id TEXT PRIMARY KEY,event_id TEXT,object_key TEXT,media_type TEXT,content_type TEXT,
      size_bytes INTEGER,uploaded_at INTEGER)`),
    env.DB.prepare(`CREATE TABLE multipart_upload_sessions (
      id TEXT PRIMARY KEY,event_id TEXT,status TEXT,expires_at INTEGER)`),
    env.DB.prepare(`CREATE TRIGGER media_trial_limit_before_insert BEFORE INSERT ON media
      WHEN EXISTS (SELECT 1 FROM event_access access WHERE access.event_id=NEW.event_id
        AND access.enforcement_state='enforced'
        AND (access.access_state='expired' OR access.media_uploads_consumed>=access.media_limit))
      BEGIN SELECT RAISE(ABORT,'trial_media_limit_reached'); END`),
    env.DB.prepare(`CREATE TRIGGER media_trial_usage_after_insert AFTER INSERT ON media
      WHEN EXISTS (SELECT 1 FROM event_access access WHERE access.event_id=NEW.event_id
        AND access.enforcement_state='enforced' AND access.access_state IN ('preview','trial'))
      BEGIN UPDATE event_access SET media_uploads_consumed=media_uploads_consumed+1
        WHERE event_id=NEW.event_id; END`),
    env.DB.prepare(`CREATE TRIGGER wedding_media_trial_limit_before_insert BEFORE INSERT ON event_wedding_media
      WHEN EXISTS (SELECT 1 FROM event_access access WHERE access.event_id=NEW.event_id
        AND access.enforcement_state='enforced'
        AND (access.access_state='expired' OR access.media_uploads_consumed>=access.media_limit))
      BEGIN SELECT RAISE(ABORT,'trial_media_limit_reached'); END`),
    env.DB.prepare(`CREATE TRIGGER wedding_media_trial_usage_after_insert AFTER INSERT ON event_wedding_media
      WHEN EXISTS (SELECT 1 FROM event_access access WHERE access.event_id=NEW.event_id
        AND access.enforcement_state='enforced' AND access.access_state IN ('preview','trial'))
      BEGIN UPDATE event_access SET media_uploads_consumed=media_uploads_consumed+1
        WHERE event_id=NEW.event_id; END`),
    env.DB.prepare(`CREATE TRIGGER media_trial_limit_before_restore BEFORE UPDATE OF deleted_at ON media
      WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM event_access access WHERE access.event_id=NEW.event_id
          AND access.enforcement_state='enforced' AND access.access_state='expired')
      BEGIN SELECT RAISE(ABORT,'trial_media_limit_reached'); END`),
  ]);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO events (id,code,eventName,created_at,expires_at) VALUES (?,?,?,?,?)",
    ).bind(eventId, "LIFETIME20", "Lifetime slot trial", now, now + 86_400_000),
    env.DB.prepare(`INSERT INTO event_access
      (event_id,access_state,enforcement_state,media_limit,media_uploads_consumed,
       guest_access_enabled,guest_uploads_enabled,original_downloads_enabled,
       trial_started_at,trial_ends_at,created_at,updated_at)
      VALUES (?,'trial','enforced',20,0,1,1,0,?,?,?,?)`)
      .bind(eventId, now, now + 86_400_000, now, now),
  ]);
});

describe("lifetime trial media slots", () => {
  it("does not return a consumed slot when gallery media is deleted", async () => {
    const now = Date.now();
    for (let index = 0; index < 20; index += 1) {
      await env.DB.prepare(`INSERT INTO media
        (id,event_id,object_key,media_type,content_type,uploaded_by,uploaded_at,size_bytes)
        VALUES (?,?,?,'image','image/jpeg','Guest',?,100)`)
        .bind(`slot-${index}`, eventId, `trial-slots/${index}.jpg`, now + index).run();
    }
    await env.DB.prepare("UPDATE media SET deleted_at=? WHERE event_id=?")
      .bind(now + 100, eventId).run();

    const access = await env.DB.prepare(
      "SELECT media_uploads_consumed FROM event_access WHERE event_id=?",
    ).bind(eventId).first<{ media_uploads_consumed: number }>();
    expect(access?.media_uploads_consumed).toBe(20);

    await expect(env.DB.prepare(`INSERT INTO media
      (id,event_id,object_key,media_type,content_type,uploaded_by,uploaded_at,size_bytes)
      VALUES (?,?,?,'image','image/jpeg','Guest',?,100)`)
      .bind("slot-21", eventId, "trial-slots/21.jpg", now + 200).run())
      .rejects.toThrow("trial_media_limit_reached");

    await env.DB.prepare("UPDATE media SET deleted_at=NULL WHERE id='slot-0'").run();
    expect((await env.DB.prepare(
      "SELECT COUNT(*) total FROM media WHERE event_id=? AND deleted_at IS NULL",
    ).bind(eventId).first<{ total: number }>())?.total).toBe(1);
  });

  it("shares the same lifetime counter with Wedding media", async () => {
    await env.DB.prepare(
      "UPDATE event_access SET media_uploads_consumed=19 WHERE event_id=?",
    ).bind(eventId).run();
    await env.DB.prepare(`INSERT INTO event_wedding_media
      (id,event_id,object_key,media_type,content_type,size_bytes,uploaded_at)
      VALUES (?,?,?,'image','image/jpeg',100,?)`)
      .bind("wedding-slot-20", eventId, "trial-slots/wedding-20.jpg", Date.now()).run();
    await expect(env.DB.prepare(`INSERT INTO event_wedding_media
      (id,event_id,object_key,media_type,content_type,size_bytes,uploaded_at)
      VALUES (?,?,?,'image','image/jpeg',100,?)`)
      .bind("wedding-slot-21", eventId, "trial-slots/wedding-21.jpg", Date.now()).run())
      .rejects.toThrow("trial_media_limit_reached");
  });
});
