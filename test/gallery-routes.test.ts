import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { sha256, sha256Bytes } from "../src/utils";

const now = Date.now();
const publicCode = "GAL901";
const publicEventId = "gallery-public-event";
const pinnedCode = "PIN901";
const pinnedEventId = "gallery-pinned-event";
const expiredCode = "OLD901";
const weddingCode = "WED901";
const trialCode = "TRY901";
const trialEventId = "gallery-trial-event";
const previewCode = "PRE901";
const previewEventId = "gallery-preview-event";
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
      website_pin_hash TEXT, guest_gallery_pin_hash TEXT, official_album_pin_hash TEXT,
      event_type TEXT NOT NULL DEFAULT 'other',
      deleted_at INTEGER, purge_at INTEGER
    )`),
    env.DB.prepare(`CREATE TABLE media (
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE,
      media_type TEXT NOT NULL, content_type TEXT NOT NULL, uploaded_by TEXT NOT NULL,
      uploaded_at INTEGER NOT NULL, captured_at INTEGER, content_hash TEXT, canonical_hash TEXT,
      reported_at INTEGER, size_bytes INTEGER NOT NULL DEFAULT 0, title TEXT,
      deleted_at INTEGER, purge_at INTEGER, upload_consent_at INTEGER,
      upload_policy_version TEXT, origin TEXT NOT NULL DEFAULT 'guest',
      uploaded_by_user_id TEXT
    )`),
    env.DB.prepare(`CREATE TABLE official_album_items (
      event_id TEXT NOT NULL, media_id TEXT NOT NULL, added_by TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
      PRIMARY KEY (event_id,media_id)
    )`),
    env.DB.prepare(`CREATE TABLE media_likes (
      media_id TEXT NOT NULL, actor_key TEXT NOT NULL, created_at INTEGER NOT NULL,
      PRIMARY KEY (media_id,actor_key)
    )`),
    env.DB.prepare(`CREATE TABLE event_covers (
      event_id TEXT PRIMARY KEY, source_media_id TEXT, object_key TEXT NOT NULL,
      content_type TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE media_removal_requests (
      id TEXT PRIMARY KEY, media_id TEXT NOT NULL, event_id TEXT NOT NULL,
      requester_email TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL,
      created_at INTEGER NOT NULL, resolved_at INTEGER
    )`),
    env.DB.prepare(`CREATE TABLE request_rate_limits (
      rate_key TEXT PRIMARY KEY, window_started_at INTEGER NOT NULL,
      request_count INTEGER NOT NULL, expires_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE event_members (event_id TEXT,user_id TEXT,role TEXT,created_at INTEGER)`),
    env.DB.prepare(`CREATE TABLE event_access (
      event_id TEXT PRIMARY KEY,access_state TEXT NOT NULL,enforcement_state TEXT NOT NULL,
      media_limit INTEGER NOT NULL,guest_access_enabled INTEGER NOT NULL,
      guest_uploads_enabled INTEGER NOT NULL,original_downloads_enabled INTEGER NOT NULL,
      trial_started_at INTEGER,trial_ends_at INTEGER,unlocked_at INTEGER,expires_at INTEGER,
      created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE account_notifications (id TEXT PRIMARY KEY,user_id TEXT,event_id TEXT,invitation_id TEXT,actor_user_id TEXT,actor_name TEXT,type TEXT,item_count INTEGER,created_at INTEGER,read_at INTEGER)`),
    env.DB.prepare(`CREATE TABLE account_entitlements (user_id TEXT PRIMARY KEY,plan_key TEXT,storage_limit_bytes INTEGER,event_limit INTEGER,member_limit INTEGER,updated_at INTEGER)`),
    env.DB.prepare(`CREATE TABLE account_storage_usage (user_id TEXT PRIMARY KEY,used_bytes INTEGER,updated_at INTEGER)`),
    env.DB.prepare(`CREATE TABLE account_event_usage (user_id TEXT PRIMARY KEY,active_events INTEGER,updated_at INTEGER)`),
    env.DB.prepare(`CREATE TABLE multipart_upload_sessions (
      id TEXT PRIMARY KEY,event_id TEXT,upload_id TEXT,object_key TEXT UNIQUE,media_id TEXT UNIQUE,
      file_name TEXT,content_type TEXT,media_type TEXT,size_bytes INTEGER,part_size INTEGER,
      total_parts INTEGER,client_fingerprint TEXT,uploaded_by TEXT,uploaded_by_user_id TEXT,
      origin TEXT,reservation_owner_id TEXT,upload_consent_at INTEGER,upload_policy_version TEXT,
      captured_at INTEGER,status TEXT,created_at INTEGER,updated_at INTEGER,expires_at INTEGER,
      completed_at INTEGER,notified_at INTEGER
    )`),
    env.DB.prepare(`CREATE TABLE multipart_upload_parts (
      session_id TEXT,part_number INTEGER,etag TEXT,size_bytes INTEGER,client_hash TEXT,
      created_at INTEGER,PRIMARY KEY(session_id,part_number)
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
    env.DB.prepare("UPDATE events SET website_pin_hash=?,guest_gallery_pin_hash=?,official_album_pin_hash=? WHERE id=?").bind(pinHash, pinHash, pinHash, pinnedEventId),
    insertEvent.bind("gallery-expired-event", expiredCode, "Expired gallery", "Expired gallery", "", now - 172_800_000, now - 86_400_000, now, null),
    insertEvent.bind("gallery-wedding-event", weddingCode, "Wedding gallery", "Wedding gallery", "", now, now + 86_400_000, now, null),
    insertEvent.bind(trialEventId, trialCode, "Trial gallery", "Trial gallery", "", now, now + 86_400_000, now, null),
    insertEvent.bind(previewEventId, previewCode, "Preview gallery", "Preview gallery", "", now, now + 86_400_000, now, null),
    env.DB.prepare("UPDATE events SET event_type='wedding' WHERE id='gallery-wedding-event'"),
    env.DB.prepare(`INSERT INTO event_access VALUES (
      ?,'trial','enforced',20,1,1,0,?,?,NULL,NULL,?,?
    )`).bind(trialEventId, now, now + 86_400_000, now, now),
    env.DB.prepare(`INSERT INTO event_access VALUES (
      ?,'preview','enforced',20,0,0,0,NULL,NULL,NULL,NULL,?,?
    )`).bind(previewEventId, now, now),
  ]);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO event_members VALUES (?,?,?,?)").bind(publicEventId,"gallery-owner","owner",now),
    env.DB.prepare("INSERT INTO event_members VALUES (?,?,?,?)").bind(pinnedEventId,"gallery-owner","owner",now),
    env.DB.prepare("INSERT INTO account_entitlements VALUES (?,?,?,?,?,?)").bind("gallery-owner","beta",20*1024*1024*1024,25,25,now),
    env.DB.prepare("INSERT INTO account_storage_usage VALUES (?,?,?)").bind("gallery-owner",36,now),
    env.DB.prepare("INSERT INTO account_event_usage VALUES (?,?,?)").bind("gallery-owner",2,now),
    env.DB.prepare("INSERT INTO event_covers VALUES (?,?,?,?,?,?)").bind(
      publicEventId, "public-stream-media", "covers/public/selected.jpg", "image/jpeg", "gallery-owner", now,
    ),
  ]);

  const insertMedia = env.DB.prepare(`INSERT INTO media (
    id,event_id,object_key,media_type,content_type,uploaded_by,uploaded_at,
    captured_at,content_hash,reported_at,size_bytes,title,deleted_at,purge_at
  ) VALUES (?,?,?,?,?,?,?,NULL,?,NULL,?,NULL,NULL,NULL)`);
  await env.DB.batch([
    insertMedia.bind("public-stream-media", publicEventId, "test/public-stream.jpg", "image", "image/jpeg", "Guest", now, "public-stream-hash", 12),
    insertMedia.bind("public-report-media", publicEventId, "test/public-report.jpg", "image", "image/jpeg", "Guest", now, "public-report-hash", 12),
    insertMedia.bind("public-legacy-video", publicEventId, "test/public-legacy.mp4", "video", "video/mp4", "Guest", now, "public-legacy-video-hash", 12),
    insertMedia.bind("pinned-stream-media", pinnedEventId, "test/pinned-stream.jpg", "image", "image/jpeg", "Guest", now, "pinned-stream-hash", 12),
    insertMedia.bind("trial-stream-media", trialEventId, "test/trial-stream.jpg", "image", "image/jpeg", "Guest", now, "trial-stream-hash", 12),
    insertMedia.bind("expired-stream-media", "gallery-expired-event", "test/expired-stream.jpg", "image", "image/jpeg", "Guest", now, "expired-stream-hash", 12),
    insertMedia.bind("preview-stream-media", previewEventId, "test/preview-stream.jpg", "image", "image/jpeg", "Guest", now, "preview-stream-hash", 12),
    env.DB.prepare(`INSERT INTO media (
      id,event_id,object_key,media_type,content_type,uploaded_by,uploaded_at,
      captured_at,content_hash,reported_at,size_bytes,title,deleted_at,purge_at,origin
    ) VALUES (?,?,?,?,?,?,?,NULL,?,NULL,?,NULL,NULL,NULL,'official')`).bind(
      "official-stream-media", publicEventId, "test/official-stream.jpg", "image",
      "image/jpeg", "Memboux Studio", now, "official-stream-hash", 12,
    ),
    env.DB.prepare("INSERT INTO official_album_items VALUES (?,?,?,?,?)").bind(
      publicEventId, "official-stream-media", "studio-user", 0, now,
    ),
    env.DB.prepare("INSERT INTO official_album_items VALUES (?,?,?,?,?)").bind(
      publicEventId, "public-legacy-video", "studio-user", 1, now,
    ),
  ]);
  await Promise.all([
    env.MEDIA.put("test/public-stream.jpg", new TextEncoder().encode("public-image"), { httpMetadata: { contentType: "image/jpeg" } }),
    env.MEDIA.put("test/public-report.jpg", new TextEncoder().encode("report-image"), { httpMetadata: { contentType: "image/jpeg" } }),
    env.MEDIA.put("test/public-legacy.mp4", new TextEncoder().encode("legacy-video"), { httpMetadata: { contentType: "video/mp4" } }),
    env.MEDIA.put("test/pinned-stream.jpg", new TextEncoder().encode("pinned-image"), { httpMetadata: { contentType: "image/jpeg" } }),
    env.MEDIA.put("test/trial-stream.jpg", new TextEncoder().encode("trial-image"), { httpMetadata: { contentType: "image/jpeg" } }),
    env.MEDIA.put("test/expired-stream.jpg", new TextEncoder().encode("expired-image"), { httpMetadata: { contentType: "image/jpeg" } }),
    env.MEDIA.put("test/preview-stream.jpg", new TextEncoder().encode("preview-image"), { httpMetadata: { contentType: "image/jpeg" } }),
    env.MEDIA.put("test/official-stream.jpg", new TextEncoder().encode("official-image"), { httpMetadata: { contentType: "image/jpeg" } }),
    env.MEDIA.put("covers/public/selected.jpg", new TextEncoder().encode("selected-cover"), { httpMetadata: { contentType: "image/jpeg" } }),
  ]);
});

describe("gallery, upload, and media routes", () => {
  it("keeps trial previews usable while hiding and enforcing original downloads", async () => {
    const gallery = await SELF.fetch(`https://memboux.com/gallery/${trialCode}?lang=en`);
    const html = await gallery.text();
    expect(gallery.status).toBe(200);
    expect(html).toContain("Originals unlock with upgrade");
    expect(html).not.toContain('id="lightbox-download"');
    expect(html).toContain("#select-media,#download-selected{display:none!important}");

    const preview = await SELF.fetch("https://memboux.com/media/trial-stream-media?variant=preview");
    expect(preview.status).toBe(200);
    expect(preview.headers.get("x-memboux-media-access")).toBe("preview-only");
    expect(new TextDecoder().decode(await preview.arrayBuffer())).not.toBe("trial-image");

    const constructedOriginalUrl = await SELF.fetch("https://memboux.com/media/trial-stream-media");
    expect(constructedOriginalUrl.status).toBe(200);
    expect(constructedOriginalUrl.headers.get("x-memboux-media-access")).toBe("preview-only");
    expect(constructedOriginalUrl.headers.get("content-type")).toBe("image/webp");
    expect(new TextDecoder().decode(await constructedOriginalUrl.arrayBuffer())).not.toBe("trial-image");

    const original = await SELF.fetch("https://memboux.com/media/trial-stream-media?download=1");
    expect(original.status).toBe(403);

    const official = await SELF.fetch(`https://memboux.com/gallery/${trialCode}/official?lang=en`);
    expect(official.status).toBe(200);
    expect(await official.text()).not.toContain('id="lightbox-download"');
  });

  it("does not expose media through a direct URL after guest access expires", async () => {
    const response = await SELF.fetch("https://memboux.com/media/expired-stream-media?variant=preview");
    expect(response.status).toBe(403);
    expect(await response.text()).toContain("not available to guests");
  });

  it("keeps every guest endpoint closed while an event is still a private preview", async () => {
    const [gallery, media, unlock, like, removal] = await Promise.all([
      SELF.fetch(`https://memboux.com/gallery/${previewCode}?lang=en`),
      SELF.fetch("https://memboux.com/media/preview-stream-media?variant=preview"),
      SELF.fetch(`https://memboux.com/gallery/${previewCode}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "https://memboux.com" },
        body: new URLSearchParams({ locale: "en" }),
      }),
      SELF.fetch(`https://memboux.com/api/gallery/${previewCode}/media/preview-stream-media/like`, {
        method: "POST",
        headers: { Origin: "https://memboux.com" },
      }),
      SELF.fetch(`https://memboux.com/gallery/${previewCode}/removal/preview-stream-media`),
    ]);

    expect(gallery.status).toBe(403);
    expect(media.status).toBe(403);
    expect(unlock.status).toBe(403);
    expect(like.status).toBe(403);
    expect(removal.status).toBe(403);
  });

  it("keeps the wedding guest gallery separate from the wedding website", async () => {
    const response = await SELF.fetch(`https://memboux.com/gallery/${weddingCode}?lang=fr`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Wedding gallery");
    expect(html).not.toContain('aria-label="RSVP"');
    expect(html).not.toContain("official-album-teaser");
  });

  it("renders an active public gallery", async () => {
    const response = await SELF.fetch(`https://memboux.com/gallery/${publicCode}?lang=en`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Public gallery");
    expect(html).toContain("Upload");
    expect(html).toContain("Gallery");
    expect(html).toContain("2 photos");
    expect(html).toContain('data-gallery-photo-count="2"');
    expect(html).toContain("public-legacy-video");
    expect(html).toContain("1 video");
    expect(html).not.toContain("data-gallery-filter");
    expect(html).toContain("data-media-like");
    expect(html).toContain(`/gallery/${publicCode}/cover?v=${now}`);
    expect(html).toContain('data-gallery-sort="guest-gallery"');
    expect(html).toContain('data-like-count>0</span>');
    expect(html).toContain('id="guest-upload-confirmation"');
    expect(html).toContain("Privacy and confirmation");
    expect(html).not.toContain('<summary class="cursor-pointer font-semibold">Privacy and confirmation</summary>');
    expect(html).toContain("Up to 100 photos or videos");
    expect(html).toContain('accept="image/jpeg,image/png,image/webp,image/gif,video/mp4');
    expect(html).not.toContain('aria-label="RSVP"');
    expect(html.indexOf('id="guest-upload"')).toBeLessThan(html.indexOf('id="guest-moments"'));
    expect(html.indexOf('id="guest-moments"')).toBeLessThan(html.indexOf('id="participate"'));
    expect(html.indexOf('id="participate"')).toBeLessThan(html.indexOf("official-album-teaser"));
    expect(html.indexOf("official-album-teaser")).toBeLessThan(html.indexOf('id="guest-share"'));
    expect(html.indexOf('id="guest-share"')).toBeGreaterThan(html.indexOf('id="participate"'));
  });

  it("localizes the core guest upload journey in every supported language", async () => {
    for (const [locale, expected] of [
      ["fr", ["Ajoutez vos moments", "Inviter d’autres personnes", "Télécharger la sélection", "Collection officielle", "Galerie", "Aimer la photo"]],
      ["de", ["Füge deine Momente hinzu", "Weitere Gäste einladen", "Auswahl herunterladen", "Offizielle Sammlung", "Galerie", "Foto liken"]],
      ["es", ["Añade tus momentos", "Invitar a más personas", "Descargar selección", "Colección oficial", "Galería", "Dar me gusta"]],
      ["it", ["Aggiungi i tuoi momenti", "Invita altre persone", "Scarica selezione", "Raccolta ufficiale", "Galleria", "Metti Mi piace"]],
    ] as const) {
      const response = await SELF.fetch(`https://memboux.com/gallery/${publicCode}?lang=${locale}`);
      expect(response.status).toBe(200);
      const html = await response.text();
      expected.forEach((text) => expect(html).toContain(text));
      expect(html).not.toContain("No app and no account required.");
      expect(html).not.toContain("Invite more guests");
      expect(html).not.toContain("Download selected");
      expect(html).not.toContain('aria-label="Like photo"');
      expect(html.split(`<option value="/gallery/${publicCode}?lang=`)).toHaveLength(7);
    }
  });

  it("serves the selected cover through the gallery access boundary", async () => {
    const response = await SELF.fetch(`https://memboux.com/gallery/${publicCode}/cover`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe("selected-cover");
  });

  it("toggles one persistent, pseudonymous like per visitor", async () => {
    const first = await SELF.fetch(
      `https://memboux.com/api/gallery/${publicCode}/media/public-stream-media/like`,
      { method: "POST", headers: { Origin: "https://memboux.com", "CF-Connecting-IP": "198.51.100.144" } },
    );
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ liked: true, count: 1 });
    const visitorCookie = first.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
    expect(visitorCookie).toMatch(/^memboux_like_visitor=/);
    expect(first.headers.get("set-cookie")).toContain("HttpOnly");
    expect(first.headers.get("set-cookie")).toContain("Secure");

    const stored = await env.DB.prepare(
      "SELECT actor_key FROM media_likes WHERE media_id=?",
    ).bind("public-stream-media").first<{ actor_key: string }>();
    expect(stored?.actor_key).toMatch(/^[a-f0-9]{64}$/);
    expect(visitorCookie).not.toContain(stored?.actor_key ?? "missing");

    const second = await SELF.fetch(
      `https://memboux.com/api/gallery/${publicCode}/media/public-stream-media/like`,
      {
        method: "POST",
        headers: {
          Origin: "https://memboux.com",
          Cookie: visitorCookie,
          "CF-Connecting-IP": "198.51.100.144",
        },
      },
    );
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ liked: false, count: 0 });
  });

  it("requires PIN gallery access before accepting a like", async () => {
    const response = await SELF.fetch(
      `https://memboux.com/api/gallery/${pinnedCode}/media/pinned-stream-media/like`,
      { method: "POST", headers: { Origin: "https://memboux.com" } },
    );
    expect(response.status).toBe(401);
  });

  it("keeps official uploads separate and renders the curated official album", async () => {
    const guestResponse = await SELF.fetch(`https://memboux.com/gallery/${publicCode}?lang=en`);
    const guestHtml = await guestResponse.text();
    expect(guestHtml).not.toContain("official-stream-media");

    const response = await SELF.fetch(`https://memboux.com/gallery/${publicCode}/official?lang=en`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("The official album");
    expect(html).toContain("official-stream-media");
    expect(html).toContain("public-legacy-video");
  });

  it("localizes the official album and keeps the six-language picker", async () => {
    for (const [locale, expected] of [
      ["fr", ["Collection officielle", "L’histoire officielle", "Moments sélectionnés", "Moments des invités"]],
      ["de", ["Offizielle Sammlung", "Die offizielle Geschichte", "Ausgewählte Momente", "Gästemomente"]],
      ["es", ["Colección oficial", "La historia oficial", "Momentos seleccionados", "Momentos de invitados"]],
      ["it", ["Raccolta ufficiale", "La storia ufficiale", "Momenti selezionati", "Momenti degli invitati"]],
    ] as const) {
      const response = await SELF.fetch(`https://memboux.com/gallery/${publicCode}/official?lang=${locale}`);
      expect(response.status).toBe(200);
      const html = await response.text();
      expected.forEach((text) => expect(html).toContain(text));
      expect(html).not.toContain("The official story");
      expect(html).not.toContain("Curated moments");
      expect(html.split(`<option value="/gallery/${publicCode}/official?lang=`)).toHaveLength(7);
    }
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
    const maxAge = Number(unlocked.headers.get("set-cookie")?.match(/Max-Age=(\d+)/)?.[1]);
    expect(maxAge).toBeGreaterThan(0);
    expect(maxAge).toBeLessThanOrEqual(86_400);
  });

  it("does not unlock an expired event", async () => {
    const response = await SELF.fetch(`https://memboux.com/gallery/${expiredCode}/unlock`, {
      method: "POST",
      headers: { Origin: "https://memboux.com" },
      body: new URLSearchParams({ locale: "en", pin }),
      redirect: "manual",
    });
    expect(response.status).toBe(410);
  });

  it("rate limits repeated PIN guessing without storing a raw IP", async () => {
    const headers = {
      Origin: "https://memboux.com",
      "CF-Connecting-IP": "198.51.100.77",
    };
    for (let attempt = 0; attempt < 10; attempt++) {
      const response = await SELF.fetch(`https://memboux.com/gallery/${pinnedCode}/unlock`, {
        method: "POST",
        headers,
        body: new URLSearchParams({ locale: "en", pin: "0000" }),
        redirect: "manual",
      });
      expect(response.status).toBe(401);
    }

    const blocked = await SELF.fetch(`https://memboux.com/gallery/${pinnedCode}/unlock`, {
      method: "POST",
      headers,
      body: new URLSearchParams({ locale: "en", pin: "0000" }),
      redirect: "manual",
    });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(blocked.headers.get("x-ratelimit-remaining")).toBe("0");

    const stored = await env.DB.prepare("SELECT rate_key FROM request_rate_limits WHERE request_count>10").first<{ rate_key: string }>();
    expect(stored?.rate_key).toMatch(/^[a-f0-9]{64}$/);
    expect(stored?.rate_key).not.toContain("198.51.100.77");
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

  it("accepts video uploads", async () => {
    const form = new FormData();
    form.set("locale", "en");
    form.set("upload_confirmation", "accepted");
    form.append("file", new File([new Uint8Array([1, 2, 3])], "clip.mp4", { type: "video/mp4" }));
    const response = await SELF.fetch(`https://memboux.com/api/upload/${publicCode}`, {
      method: "POST",
      headers: { Origin: "https://memboux.com", "CF-Connecting-IP": "198.51.100.87" },
      body: form,
      redirect: "manual",
    });
    expect(response.status).toBe(303);
    const stored = await env.DB.prepare(
      "SELECT media_type,content_type FROM media WHERE event_id=? AND content_type='video/mp4' ORDER BY uploaded_at DESC LIMIT 1",
    ).bind(publicEventId).first<{ media_type: string; content_type: string }>();
    expect(stored).toEqual({ media_type: "video", content_type: "video/mp4" });
  });

  it("stores common-size files through the single-request fast path", async () => {
    const bytes = new Uint8Array([9, 8, 7, 6, 5, 4]);
    const contentHash = await sha256Bytes(bytes.buffer);
    const headers = {
      Origin: "https://memboux.com",
      "CF-Connecting-IP": "198.51.100.205",
      "Content-Type": "image/jpeg",
      "Upload-Filename": encodeURIComponent("fast moment.jpg"),
      "Upload-Size": String(bytes.byteLength),
      "Upload-Last-Modified": String(now),
      "Upload-Fingerprint": "e".repeat(64),
      "Upload-Content-SHA256": contentHash,
      "Upload-Origin": "guest",
      "Upload-Name": encodeURIComponent("Fast Guest"),
      "Upload-Consent": "accepted",
      "Upload-Locale": "en",
    };
    const response = await SELF.fetch(`https://memboux.com/api/upload/${publicCode}/fast`, {
      method: "PUT",
      headers,
      body: bytes,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("server-timing")).toMatch(/^memboux_upload;dur=\d+$/);
    const result = await response.json<{ sessionId: string; token: string; mediaId: string }>();
    expect(result).toMatchObject({ uploaded: 1, duplicate: false });

    const stored = await env.DB.prepare(
      "SELECT id,object_key,size_bytes,content_hash,uploaded_by FROM media WHERE id=?",
    ).bind(result.mediaId).first<{
      id: string;
      object_key: string;
      size_bytes: number;
      content_hash: string;
      uploaded_by: string;
    }>();
    expect(stored).toMatchObject({
      id: result.mediaId,
      size_bytes: bytes.byteLength,
      content_hash: contentHash,
      uploaded_by: "Fast Guest",
    });
    expect((await env.MEDIA.get(stored!.object_key))?.size).toBe(bytes.byteLength);
    expect(await env.DB.prepare(
      "SELECT status,notified_at FROM multipart_upload_sessions WHERE id=?",
    ).bind(result.sessionId).first()).toEqual({ status: "completed", notified_at: null });

    const finalize = await SELF.fetch(`https://memboux.com/api/upload/${publicCode}/multipart/finalize`, {
      method: "POST",
      headers: { Origin: "https://memboux.com", "Content-Type": "application/json" },
      body: JSON.stringify({ sessions: [{ id: result.sessionId, token: result.token }] }),
    });
    expect(finalize.status).toBe(200);
    expect(await finalize.json()).toMatchObject({ ok: true, uploaded: 1 });

    const duplicate = await SELF.fetch(`https://memboux.com/api/upload/${publicCode}/fast`, {
      method: "PUT",
      headers: { ...headers, "CF-Connecting-IP": "198.51.100.206" },
      body: bytes,
    });
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toMatchObject({ ok: true, uploaded: 0, duplicate: true });

    const videoBytes = new Uint8Array([1, 3, 5, 7, 9]);
    const videoResponse = await SELF.fetch(`https://memboux.com/api/upload/${publicCode}/fast`, {
      method: "PUT",
      headers: {
        ...headers,
        "CF-Connecting-IP": "198.51.100.207",
        "Content-Type": "video/mp4",
        "Upload-Filename": encodeURIComponent("fast-video.mp4"),
        "Upload-Size": String(videoBytes.byteLength),
        "Upload-Fingerprint": "1".repeat(64),
        "Upload-Content-SHA256": await sha256Bytes(videoBytes.buffer),
      },
      body: videoBytes,
    });
    expect(videoResponse.status).toBe(200);
    const video = await videoResponse.json<{ sessionId: string; token: string; mediaId: string }>();
    const posterBytes = new Uint8Array([82, 73, 70, 70, 4, 3, 2, 1]);
    const poster = await SELF.fetch(
      `https://memboux.com/api/upload/${publicCode}/multipart/${video.sessionId}/variants/thumb`,
      {
        method: "PUT",
        headers: {
          Origin: "https://memboux.com",
          "Upload-Token": video.token,
          "Content-Type": "image/webp",
        },
        body: posterBytes,
      },
    );
    expect(poster.status).toBe(200);
    const servedPoster = await SELF.fetch(`https://memboux.com/media/${video.mediaId}?variant=thumb`);
    expect(servedPoster.status).toBe(200);
    expect(servedPoster.headers.get("content-type")).toBe("image/webp");
  });

  it("resumes a multipart video and stores it only after every part completes", async () => {
    const fingerprint = "a".repeat(64);
    const metadata = {
      filename: "long-event-video.mp4",
      contentType: "video/mp4",
      size: 6,
      lastModified: now,
      fingerprint,
      origin: "guest",
      name: "Resumable Guest",
      consent: "accepted",
      locale: "en",
    };
    const start = await SELF.fetch(`https://memboux.com/api/upload/${publicCode}/multipart`, {
      method: "POST",
      headers: {
        Origin: "https://memboux.com",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "198.51.100.201",
      },
      body: JSON.stringify(metadata),
    });
    expect(start.status).toBe(201);
    const session = await start.json<{
      sessionId: string;
      token: string;
      totalParts: number;
      uploadedParts: unknown[];
    }>();
    expect(session.totalParts).toBe(1);
    expect(session.uploadedParts).toEqual([]);

    const resume = await SELF.fetch(`https://memboux.com/api/upload/${publicCode}/multipart`, {
      method: "POST",
      headers: {
        Origin: "https://memboux.com",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "198.51.100.201",
      },
      body: JSON.stringify(metadata),
    });
    expect(resume.status).toBe(200);
    expect((await resume.json<{ sessionId: string }>()).sessionId).toBe(session.sessionId);

    const partBytes = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const missingFingerprint = await SELF.fetch(
      `https://memboux.com/api/upload/${publicCode}/multipart/${session.sessionId}/parts/1`,
      {
        method: "PUT",
        headers: {
          Origin: "https://memboux.com",
          "Upload-Token": session.token,
          "Content-Type": "application/octet-stream",
        },
        body: partBytes,
      },
    );
    expect(missingFingerprint.status).toBe(422);
    const uploadPart = await SELF.fetch(
      `https://memboux.com/api/upload/${publicCode}/multipart/${session.sessionId}/parts/1`,
      {
        method: "PUT",
        headers: {
          Origin: "https://memboux.com",
          "Upload-Token": session.token,
          "Part-Fingerprint": "b".repeat(64),
          "Content-Type": "application/octet-stream",
        },
        body: partBytes,
      },
    );
    expect(uploadPart.status).toBe(200);

    const posterBytes = new Uint8Array([82, 73, 70, 70, 9, 8, 7, 6]);
    const poster = await SELF.fetch(
      `https://memboux.com/api/upload/${publicCode}/multipart/${session.sessionId}/variants/thumb`,
      {
        method: "PUT",
        headers: {
          Origin: "https://memboux.com",
          "Upload-Token": session.token,
          "Content-Type": "image/webp",
        },
        body: posterBytes,
      },
    );
    expect(poster.status).toBe(200);

    const complete = await SELF.fetch(
      `https://memboux.com/api/upload/${publicCode}/multipart/${session.sessionId}/complete`,
      {
        method: "POST",
        headers: { Origin: "https://memboux.com", "Upload-Token": session.token },
      },
    );
    expect(complete.status).toBe(200);
    expect(await complete.json()).toMatchObject({ ok: true, uploaded: 1, duplicate: false });

    const finalize = await SELF.fetch(`https://memboux.com/api/upload/${publicCode}/multipart/finalize`, {
      method: "POST",
      headers: { Origin: "https://memboux.com", "Content-Type": "application/json" },
      body: JSON.stringify({ sessions: [{ id: session.sessionId, token: session.token }] }),
    });
    expect(finalize.status).toBe(200);
    expect(await finalize.json()).toMatchObject({ ok: true, uploaded: 1 });
    const stored = await env.DB.prepare(
      "SELECT id,object_key,media_type,content_type,size_bytes,uploaded_by FROM media WHERE event_id=? AND uploaded_by='Resumable Guest'",
    ).bind(publicEventId).first<{ id: string; object_key: string; media_type: string; content_type: string; size_bytes: number; uploaded_by: string }>();
    expect(stored).toMatchObject({
      media_type: "video",
      content_type: "video/mp4",
      size_bytes: 6,
      uploaded_by: "Resumable Guest",
    });
    expect((await env.MEDIA.get(`${stored!.object_key}.memboux-thumb-v1.webp`))?.size).toBe(posterBytes.byteLength);
    const servedPoster = await SELF.fetch(`https://memboux.com/media/${stored!.id}?variant=thumb`);
    expect(servedPoster.status).toBe(200);
    expect(servedPoster.headers.get("content-type")).toBe("image/webp");
    expect(new Uint8Array(await servedPoster.arrayBuffer())).toEqual(posterBytes);

    const earlyDuplicate = await SELF.fetch(`https://memboux.com/api/upload/${publicCode}/multipart`, {
      method: "POST",
      headers: {
        Origin: "https://memboux.com",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "198.51.100.203",
      },
      body: JSON.stringify(metadata),
    });
    expect(earlyDuplicate.status).toBe(200);
    expect(await earlyDuplicate.json()).toMatchObject({ ok: true, duplicate: true, uploaded: 0 });

    const renamedMetadata = {
      ...metadata,
      filename: "renamed-copy.mp4",
      fingerprint: "d".repeat(64),
      lastModified: now + 1_000,
    };
    const renamedStart = await SELF.fetch(`https://memboux.com/api/upload/${publicCode}/multipart`, {
      method: "POST",
      headers: {
        Origin: "https://memboux.com",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "198.51.100.204",
      },
      body: JSON.stringify(renamedMetadata),
    });
    expect(renamedStart.status).toBe(201);
    const renamedSession = await renamedStart.json<{ sessionId: string; token: string }>();
    const renamedPart = await SELF.fetch(
      `https://memboux.com/api/upload/${publicCode}/multipart/${renamedSession.sessionId}/parts/1`,
      {
        method: "PUT",
        headers: {
          Origin: "https://memboux.com",
          "Upload-Token": renamedSession.token,
          "Part-Fingerprint": "b".repeat(64),
          "Content-Type": "application/octet-stream",
        },
        body: partBytes,
      },
    );
    expect(renamedPart.status).toBe(200);
    const renamedComplete = await SELF.fetch(
      `https://memboux.com/api/upload/${publicCode}/multipart/${renamedSession.sessionId}/complete`,
      {
        method: "POST",
        headers: { Origin: "https://memboux.com", "Upload-Token": renamedSession.token },
      },
    );
    expect(renamedComplete.status).toBe(200);
    expect(await renamedComplete.json()).toMatchObject({ ok: true, uploaded: 0, duplicate: true });
    expect(await env.DB.prepare(
      "SELECT COUNT(*) total FROM media WHERE event_id=? AND uploaded_by='Resumable Guest'",
    ).bind(publicEventId).first<{ total: number }>()).toEqual({ total: 1 });
  });

  it("accepts a streamed client preview without requiring a Content-Length header", async () => {
    const start = await SELF.fetch(`https://memboux.com/api/upload/${publicCode}/multipart`, {
      method: "POST",
      headers: {
        Origin: "https://memboux.com",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "198.51.100.202",
      },
      body: JSON.stringify({
        filename: "preview-source.jpg",
        contentType: "image/jpeg",
        size: 6,
        lastModified: now,
        fingerprint: "c".repeat(64),
        origin: "guest",
        name: "Preview Guest",
        consent: "accepted",
        locale: "en",
      }),
    });
    expect(start.status).toBe(201);
    const session = await start.json<{ sessionId: string; token: string }>();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]));
        controller.close();
      },
    });
    const preview = await SELF.fetch(
      `https://memboux.com/api/upload/${publicCode}/multipart/${session.sessionId}/variants/preview`,
      {
        method: "PUT",
        headers: {
          Origin: "https://memboux.com",
          "Upload-Token": session.token,
          "Content-Type": "image/webp",
        },
        body,
      },
    );
    expect(preview.status).toBe(200);
    const storedSession = await env.DB.prepare(
      "SELECT object_key FROM multipart_upload_sessions WHERE id=?",
    ).bind(session.sessionId).first<{ object_key: string }>();
    expect(storedSession).not.toBeNull();
    const storedPreview = await env.MEDIA.get(`${storedSession!.object_key}.memboux-preview-v1.webp`);
    expect(storedPreview?.size).toBe(8);
  });

  it("serves byte ranges for efficient video playback and seeking", async () => {
    const response = await SELF.fetch("https://memboux.com/media/public-legacy-video", {
      headers: { Range: "bytes=0-5" },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-range")).toBe("bytes 0-5/12");
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe("legacy");
  });

  it("stores versioned consent evidence for a guest upload", async () => {
    const form = new FormData();
    form.set("locale", "en");
    form.set("name", "Consent Guest");
    form.set("upload_confirmation", "accepted");
    form.append("file", new File([new Uint8Array([1, 2, 3, 4])], "moment.jpg", { type: "image/jpeg" }));
    const before = Date.now();
    const response = await SELF.fetch(`https://memboux.com/api/upload/${publicCode}`, {
      method: "POST",
      headers: { Origin: "https://memboux.com", "CF-Connecting-IP": "198.51.100.88" },
      body: form,
      redirect: "manual",
    });
    expect(response.status).toBe(303);
    const row = await env.DB.prepare("SELECT upload_consent_at,upload_policy_version FROM media WHERE event_id=? AND uploaded_by=?").bind(publicEventId, "Consent Guest").first<{ upload_consent_at: number; upload_policy_version: string }>();
    expect(row?.upload_policy_version).toBe("guest-upload-2026-07-13");
    expect(row?.upload_consent_at).toBeGreaterThanOrEqual(before);
    expect(await env.DB.prepare(
      "SELECT user_id,type,item_count,read_at FROM account_notifications WHERE event_id=? ORDER BY created_at DESC LIMIT 1",
    ).bind(publicEventId).first()).toEqual({
      user_id: "gallery-owner",
      type: "media_uploaded",
      item_count: 1,
      read_at: null,
    });
  });

  it("deduplicates JPEG exports whose pixels are identical but metadata differs", async () => {
    const jpeg = (metadata: number[]) => new Uint8Array([
      0xff, 0xd8, 0xff, 0xe1, 0x00, metadata.length + 2, ...metadata,
      0xff, 0xdb, 0x00, 0x04, 0x11, 0x22,
      0xff, 0xda, 0x00, 0x04, 0x33, 0x44, 0x12, 0x34, 0xff, 0xd9,
    ]);
    const upload = async (bytes: Uint8Array, ip: string) => {
      const form = new FormData();
      form.set("locale", "en");
      form.set("name", "Duplicate test");
      form.set("upload_confirmation", "accepted");
      form.append("file", new File([bytes], "moment.jpg", { type: "image/jpeg" }));
      return SELF.fetch(`https://memboux.com/api/upload/${publicCode}`, {
        method: "POST",
        headers: { Origin: "https://memboux.com", "CF-Connecting-IP": ip },
        body: form,
        redirect: "manual",
      });
    };
    expect((await upload(jpeg([1, 2]), "198.51.100.91")).status).toBe(303);
    expect((await upload(jpeg([9, 8, 7, 6]), "198.51.100.92")).status).toBe(303);
    expect(await env.DB.prepare("SELECT COUNT(*) total FROM media WHERE event_id=? AND uploaded_by='Duplicate test'").bind(publicEventId).first())
      .toEqual({ total: 1 });
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
    expect(inline.headers.get("cache-control")).toBe("private, no-store");
    expect(new TextDecoder().decode(await inline.arrayBuffer())).toBe("public-image");

    const download = await SELF.fetch("https://memboux.com/media/public-stream-media?download=1");
    expect(download.headers.get("content-disposition")).toMatch(/^attachment; filename="memboux-\d{4}-\d{2}-\d{2}\.jpg"$/);
    expect(download.headers.get("content-type")).toBe("image/jpeg");
    expect(new TextDecoder().decode(await download.arrayBuffer())).toBe("public-image");
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

  it("requires gallery access before opening a PIN-protected removal flow", async () => {
    const locked = await SELF.fetch(`https://memboux.com/gallery/${pinnedCode}/removal/pinned-stream-media`);
    expect(locked.status).toBe(401);

    const unlocked = await SELF.fetch(`https://memboux.com/gallery/${pinnedCode}/removal/pinned-stream-media`, {
      headers: { Cookie: galleryCookie },
    });
    expect(unlocked.status).toBe(200);
    expect(await unlocked.text()).toContain("Request photo removal");
  });
});
