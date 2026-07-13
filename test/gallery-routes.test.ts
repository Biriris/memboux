import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { sha256 } from "../src/utils";

const now = Date.now();
const publicCode = "GAL901";
const publicEventId = "gallery-public-event";
const pinnedCode = "PIN901";
const pinnedEventId = "gallery-pinned-event";
const expiredCode = "OLD901";
const pin = "2468";
let pinHash = "";
let galleryCookie = "";

beforeAll(async () => {
  pinHash = await sha256(pin);
  galleryCookie = `memboux_gallery_${pinnedCode.toLowerCase()}=${await sha256(`gallery-access:${pinnedEventId}:${pinHash}`)}`;
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
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE,
      media_type TEXT NOT NULL, content_type TEXT NOT NULL, uploaded_by TEXT NOT NULL,
      uploaded_at INTEGER NOT NULL, captured_at INTEGER, content_hash TEXT,
      reported_at INTEGER, size_bytes INTEGER NOT NULL DEFAULT 0, title TEXT,
      deleted_at INTEGER, purge_at INTEGER
    )`),
    env.DB.prepare(`CREATE TABLE media_removal_requests (
      id TEXT PRIMARY KEY, media_id TEXT NOT NULL, event_id TEXT NOT NULL,
      requester_email TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL,
      created_at INTEGER NOT NULL, resolved_at INTEGER
    )`),
  ]);

  const insertEvent = env.DB.prepare(`INSERT INTO events (
    id,code,couple,eventName,admin_token_hash,created_at,expires_at,status,notes,
    updated_at,default_locale,event_start_date,event_end_date,gallery_pin_hash,
    deleted_at,purge_at
  ) VALUES (?,?,?,?,?,?,?,'active','',?,'en','2026-07-13','2026-07-13',?,NULL,NULL)`);
  await env.DB.batch([
    insertEvent.bind(publicEventId, publicCode, "Public gallery", "Public gallery", "", now, now + 86_400_000, now, null),
    insertEvent.bind(pinnedEventId, pinnedCode, "Pinned gallery", "Pinned gallery", "", now, now + 86_400_000, now, pinHash),
    insertEvent.bind("gallery-expired-event", expiredCode, "Expired gallery", "Expired gallery", "", now - 172_800_000, now - 86_400_000, now, null),
  ]);

  const insertMedia = env.DB.prepare(`INSERT INTO media (
    id,event_id,object_key,media_type,content_type,uploaded_by,uploaded_at,
    captured_at,content_hash,reported_at,size_bytes,title,deleted_at,purge_at
  ) VALUES (?,?,?,?,?,?,?,NULL,?,NULL,?,NULL,NULL,NULL)`);
  await env.DB.batch([
    insertMedia.bind("public-stream-media", publicEventId, "test/public-stream.jpg", "image", "image/jpeg", "Guest", now, "public-stream-hash", 12),
    insertMedia.bind("public-report-media", publicEventId, "test/public-report.jpg", "image", "image/jpeg", "Guest", now, "public-report-hash", 12),
    insertMedia.bind("pinned-stream-media", pinnedEventId, "test/pinned-stream.jpg", "image", "image/jpeg", "Guest", now, "pinned-stream-hash", 12),
  ]);
  await Promise.all([
    env.MEDIA.put("test/public-stream.jpg", new TextEncoder().encode("public-image"), { httpMetadata: { contentType: "image/jpeg" } }),
    env.MEDIA.put("test/public-report.jpg", new TextEncoder().encode("report-image"), { httpMetadata: { contentType: "image/jpeg" } }),
    env.MEDIA.put("test/pinned-stream.jpg", new TextEncoder().encode("pinned-image"), { httpMetadata: { contentType: "image/jpeg" } }),
  ]);
});

describe("gallery, upload, and media routes", () => {
  it("renders an active public gallery", async () => {
    const response = await SELF.fetch(`https://memboux.com/gallery/${publicCode}?lang=en`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Public gallery");
    expect(html).toContain("Upload");
    expect(html).toContain("Images (2)");
  });

  it("expires galleries according to the event expiration", async () => {
    const response = await SELF.fetch(`https://memboux.com/gallery/${expiredCode}?lang=en`);
    expect(response.status).toBe(410);
  });

  it("requires and validates the configured gallery PIN", async () => {
    const locked = await SELF.fetch(`https://memboux.com/gallery/${pinnedCode}?lang=en`);
    expect(locked.status).toBe(401);
    expect(await locked.text()).toContain("Private gallery");

    const wrong = await SELF.fetch(`https://memboux.com/gallery/${pinnedCode}/unlock`, {
      method: "POST",
      headers: { Origin: "https://memboux.com" },
      body: new URLSearchParams({ locale: "en", pin: "0000" }),
      redirect: "manual",
    });
    expect(wrong.status).toBe(401);

    const unlocked = await SELF.fetch(`https://memboux.com/gallery/${pinnedCode}/unlock`, {
      method: "POST",
      headers: { Origin: "https://memboux.com" },
      body: new URLSearchParams({ locale: "en", pin }),
      redirect: "manual",
    });
    expect(unlocked.status).toBe(303);
    expect(unlocked.headers.get("location")).toBe(`/gallery/${pinnedCode}?lang=en`);
    galleryCookie = unlocked.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
    expect(galleryCookie).toContain(`memboux_gallery_${pinnedCode.toLowerCase()}=`);
  });

  it("accepts the timing-safe gallery cookie after unlock", async () => {
    const response = await SELF.fetch(`https://memboux.com/gallery/${pinnedCode}?lang=en`, {
      headers: { Cookie: galleryCookie },
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Pinned gallery");
  });

  it("requires consent and at least one valid file for upload", async () => {
    const withoutConsent = new FormData();
    withoutConsent.set("locale", "en");
    const consentResponse = await SELF.fetch(`https://memboux.com/api/upload/${publicCode}`, {
      method: "POST",
      headers: { Origin: "https://memboux.com" },
      body: withoutConsent,
    });
    expect(consentResponse.status).toBe(400);

    const withoutFile = new FormData();
    withoutFile.set("locale", "en");
    withoutFile.set("upload_confirmation", "accepted");
    const fileResponse = await SELF.fetch(`https://memboux.com/api/upload/${publicCode}`, {
      method: "POST",
      headers: { Origin: "https://memboux.com" },
      body: withoutFile,
    });
    expect(fileResponse.status).toBe(400);
  });

  it("blocks uploads to a PIN gallery without its cookie", async () => {
    const response = await SELF.fetch(`https://memboux.com/api/upload/${pinnedCode}`, {
      method: "POST",
      headers: { Origin: "https://memboux.com" },
      body: new FormData(),
    });
    expect(response.status).toBe(401);
  });

  it("streams public media and supplies a safe download filename", async () => {
    const inline = await SELF.fetch("https://memboux.com/media/public-stream-media");
    expect(inline.status).toBe(200);
    expect(inline.headers.get("content-type")).toBe("image/jpeg");
    expect(inline.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new TextDecoder().decode(await inline.arrayBuffer())).toBe("public-image");

    const download = await SELF.fetch("https://memboux.com/media/public-stream-media?download=1");
    expect(download.headers.get("content-disposition")).toMatch(/^attachment; filename="memboux-\d{4}-\d{2}-\d{2}\.jpg"$/);
  });

  it("protects PIN media with the same gallery cookie", async () => {
    const locked = await SELF.fetch("https://memboux.com/media/pinned-stream-media");
    expect(locked.status).toBe(401);

    const unlocked = await SELF.fetch("https://memboux.com/media/pinned-stream-media", {
      headers: { Cookie: galleryCookie },
    });
    expect(unlocked.status).toBe(200);
    expect(new TextDecoder().decode(await unlocked.arrayBuffer())).toBe("pinned-image");
  });

  it("validates removal requests before quarantining media", async () => {
    const form = await SELF.fetch(`https://memboux.com/gallery/${publicCode}/removal/public-report-media`);
    expect(form.status).toBe(200);
    expect(await form.text()).toContain("Request photo removal");

    const invalid = await SELF.fetch(`https://memboux.com/gallery/${publicCode}/removal/public-report-media`, {
      method: "POST",
      headers: { Origin: "https://memboux.com" },
      body: new URLSearchParams({ email: "invalid", reason: "short" }),
    });
    expect(invalid.status).toBe(400);

    const valid = await SELF.fetch(`https://memboux.com/gallery/${publicCode}/removal/public-report-media`, {
      method: "POST",
      headers: { Origin: "https://memboux.com" },
      body: new URLSearchParams({ email: "guest@example.com", reason: "I appear in this private photograph." }),
    });
    expect(valid.status).toBe(200);
    expect(await valid.text()).toContain("Request received");

    const hidden = await SELF.fetch("https://memboux.com/media/public-report-media");
    expect(hidden.status).toBe(404);
  });
});
