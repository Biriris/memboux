import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

const now = Date.now();
const code = "LIVE27";
const eventId = "experience-event";

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE events (
      id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, couple TEXT NOT NULL,
      eventName TEXT NOT NULL, admin_token_hash TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', notes TEXT NOT NULL DEFAULT '',
      updated_at INTEGER, default_locale TEXT NOT NULL DEFAULT 'en',
      event_start_date TEXT, event_end_date TEXT, gallery_pin_hash TEXT,
      deleted_at INTEGER, purge_at INTEGER
    )`),
    env.DB.prepare(`CREATE TABLE media (
      id TEXT PRIMARY KEY,event_id TEXT NOT NULL,object_key TEXT NOT NULL UNIQUE,
      media_type TEXT NOT NULL,content_type TEXT NOT NULL,uploaded_by TEXT NOT NULL,
      uploaded_at INTEGER NOT NULL,captured_at INTEGER,content_hash TEXT,reported_at INTEGER,
      size_bytes INTEGER NOT NULL DEFAULT 0,title TEXT,deleted_at INTEGER,purge_at INTEGER,
      upload_consent_at INTEGER,upload_policy_version TEXT,origin TEXT NOT NULL DEFAULT 'guest',
      uploaded_by_user_id TEXT
    )`),
    env.DB.prepare(`CREATE TABLE event_experience_settings (
      event_id TEXT PRIMARY KEY,rsvp_enabled INTEGER NOT NULL DEFAULT 1,
      guestbook_enabled INTEGER NOT NULL DEFAULT 1,comments_enabled INTEGER NOT NULL DEFAULT 1,
      slideshow_enabled INTEGER NOT NULL DEFAULT 1,guestbook_moderation INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE event_rsvps (
      id TEXT PRIMARY KEY,event_id TEXT NOT NULL,name TEXT NOT NULL,email TEXT NOT NULL,
      response TEXT NOT NULL,guest_count INTEGER NOT NULL,dietary_notes TEXT NOT NULL,
      message TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
      UNIQUE(event_id,email)
    )`),
    env.DB.prepare(`CREATE TABLE event_guestbook_entries (
      id TEXT PRIMARY KEY,event_id TEXT NOT NULL,author_name TEXT NOT NULL,message TEXT NOT NULL,
      status TEXT NOT NULL,created_at INTEGER NOT NULL,moderated_at INTEGER
    )`),
    env.DB.prepare(`CREATE TABLE media_comments (
      id TEXT PRIMARY KEY,event_id TEXT NOT NULL,media_id TEXT NOT NULL,author_name TEXT NOT NULL,
      message TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE request_rate_limits (
      rate_key TEXT PRIMARY KEY,window_started_at INTEGER NOT NULL,request_count INTEGER NOT NULL,expires_at INTEGER NOT NULL
    )`),
  ]);
  await env.DB.prepare(`INSERT INTO events
    (id,code,couple,eventName,created_at,expires_at,updated_at,default_locale,event_start_date,event_end_date)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .bind(eventId, code, "Live event", "Live event", now, now + 86_400_000, now, "en", "2026-07-17", "2026-07-18").run();
  await env.DB.prepare(`INSERT INTO media
    (id,event_id,object_key,media_type,content_type,uploaded_by,uploaded_at,size_bytes)
    VALUES (?,?,?,?,?,?,?,?)`)
    .bind("experience-media", eventId, "experience/photo.jpg", "image", "image/jpeg", "Guest", now, 20).run();
  await env.DB.prepare(`INSERT INTO media
    (id,event_id,object_key,media_type,content_type,uploaded_by,uploaded_at,size_bytes)
    VALUES (?,?,?,?,?,?,?,?)`)
    .bind("experience-legacy-video", eventId, "experience/legacy.mp4", "video", "video/mp4", "Guest", now + 1, 20).run();
});

const postHeaders = { Origin: "https://memboux.com", "Content-Type": "application/x-www-form-urlencoded" };

describe("event engagement experience", () => {
  it("creates and updates an RSVP by email", async () => {
    const first = await SELF.fetch(`https://memboux.com/api/gallery/${code}/rsvp`, {
      method: "POST", headers: postHeaders,
      body: "locale=en&name=Alex&email=alex%40example.com&response=yes&guestCount=2",
      redirect: "manual",
    });
    expect(first.status).toBe(303);
    const second = await SELF.fetch(`https://memboux.com/api/gallery/${code}/rsvp`, {
      method: "POST", headers: postHeaders,
      body: "locale=en&name=Alex&email=alex%40example.com&response=maybe&guestCount=1",
      redirect: "manual",
    });
    expect(second.status).toBe(303);
    const row = await env.DB.prepare("SELECT response,guest_count FROM event_rsvps WHERE event_id=?").bind(eventId).first<{ response: string; guest_count: number }>();
    expect(row).toEqual({ response: "maybe", guest_count: 1 });
  });

  it("queues guestbook messages for owner approval", async () => {
    const response = await SELF.fetch(`https://memboux.com/api/gallery/${code}/guestbook`, {
      method: "POST", headers: postHeaders,
      body: "locale=en&name=Maria&message=Wonderful+memories",
      redirect: "manual",
    });
    expect(response.status).toBe(303);
    const row = await env.DB.prepare("SELECT status,message FROM event_guestbook_entries WHERE event_id=?").bind(eventId).first<{ status: string; message: string }>();
    expect(row).toEqual({ status: "pending", message: "Wonderful memories" });
  });

  it("adds comments and returns them with the slideshow feed", async () => {
    const comment = await SELF.fetch(`https://memboux.com/api/gallery/${code}/media/experience-media/comments`, {
      method: "POST",
      headers: { Origin: "https://memboux.com", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Nina", message: "Love this!" }),
    });
    expect(comment.status).toBe(201);
    const comments = await SELF.fetch(`https://memboux.com/api/gallery/${code}/media/experience-media/comments`);
    expect(await comments.json()).toMatchObject({ comments: [{ author_name: "Nina", message: "Love this!" }] });
    const feed = await SELF.fetch(`https://memboux.com/api/gallery/${code}/slideshow-feed`);
    const feedJson = await feed.json<{ event: { name: string }; items: Array<{ id: string; media_type: string; uploaded_by: string }> }>();
    expect(feedJson).toMatchObject({ event: { name: "Live event" }, items: [{ id: "experience-media", media_type: "image", uploaded_by: "Guest" }] });
    expect(feedJson.items).toHaveLength(1);
    expect(feedJson.items.some((item) => item.media_type === "video")).toBe(false);
    const slideshow = await SELF.fetch(`https://memboux.com/gallery/${code}/slideshow?lang=en`);
    const html = await slideshow.text();
    expect(html).toContain('id="slide-uploader"');
    expect(html).toContain("Uploaded by");
  });
});
