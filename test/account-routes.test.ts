import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

function cookieHeaderFromResponse(response: Response) {
  const rawCookies = typeof (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === "function"
    ? (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie!()
    : (response.headers.get("set-cookie") ? [response.headers.get("set-cookie")!] : []);
  return rawCookies
    .map((cookie) => cookie.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

describe("account route boundaries", () => {
  it.each([
    "/en/profile",
    "/en/security",
    "/en/privacy",
    "/en/plan",
    "/en/settings",
    "/en/backups",
    "/en/account",
    "/en/account-legacy",
    "/en/trash",
  ])("redirects anonymous page requests from %s to login", async (path) => {
    const response = await SELF.fetch(`https://memboux.com${path}`, {
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/en/login");
  });

  it.each(["/api/account/export", "/api/account/deletion-eligibility"])("rejects anonymous data-rights request %s", async (path) => {
    const response = await SELF.fetch(`https://memboux.com${path}`);
    expect(response.status).toBe(401);
  });

  it.each([
    ["/api/account/security/revoke-other-sessions", {}],
    ["/api/account/events", { eventName: "Test", locale: "en" }],
    ["/api/account/events/ABC123/trash", { locale: "en" }],
    ["/api/account/events/ABC123/restore", { locale: "en" }],
    ["/api/account/trash/media/restore", { ids: "" }],
    ["/api/account/trash/events/restore", { ids: "" }],
    ["/api/account/trash/events/delete", { ids: "" }],
  ])("rejects anonymous mutation %s", async (path, body) => {
    const response = await SELF.fetch(`https://memboux.com${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      redirect: "manual",
    });

    expect(response.status).toBe(401);
  });

  it("protects deleted media previews", async () => {
    const response = await SELF.fetch(
      "https://memboux.com/account/trash/media/11111111-1111-4111-8111-111111111111",
    );

    expect(response.status).toBe(401);
  });

  it("creates a new event for a signed-in owner", async () => {
    const email = `owner-${Date.now()}@example.com`;
    const password = "Password123!";

    await env.DB.batch([
      env.DB.prepare("DROP TABLE IF EXISTS request_rate_limits"),
      env.DB.prepare("DROP TABLE IF EXISTS verification"),
      env.DB.prepare("DROP TABLE IF EXISTS account"),
      env.DB.prepare("DROP TABLE IF EXISTS session"),
      env.DB.prepare("DROP TABLE IF EXISTS user"),
      env.DB.prepare("DROP TABLE IF EXISTS account_entitlements"),
      env.DB.prepare("DROP TABLE IF EXISTS account_storage_usage"),
      env.DB.prepare("DROP TABLE IF EXISTS account_event_usage"),
      env.DB.prepare("DROP TABLE IF EXISTS event_members"),
      env.DB.prepare("DROP TABLE IF EXISTS event_wedding_portrait_assignments"),
      env.DB.prepare("DROP TABLE IF EXISTS event_wedding_media"),
      env.DB.prepare("DROP TABLE IF EXISTS event_wedding_menus"),
      env.DB.prepare("DROP TABLE IF EXISTS event_wedding_features"),
      env.DB.prepare("DROP TABLE IF EXISTS event_wedding_profiles"),
      env.DB.prepare("DROP TABLE IF EXISTS event_experience_settings"),
      env.DB.prepare("DROP TABLE IF EXISTS media"),
      env.DB.prepare("DROP TABLE IF EXISTS events"),
      env.DB.prepare(`CREATE TABLE request_rate_limits (
        rate_key TEXT PRIMARY KEY,
        window_started_at INTEGER NOT NULL,
        request_count INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE "user" (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        emailVerified INTEGER NOT NULL DEFAULT 0,
        image TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE "session" (
        id TEXT PRIMARY KEY,
        expiresAt INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        ipAddress TEXT,
        userAgent TEXT,
        userId TEXT NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE "account" (
        id TEXT PRIMARY KEY,
        accountId TEXT NOT NULL,
        providerId TEXT NOT NULL,
        userId TEXT NOT NULL,
        accessToken TEXT,
        refreshToken TEXT,
        idToken TEXT,
        accessTokenExpiresAt INTEGER,
        refreshTokenExpiresAt INTEGER,
        scope TEXT,
        password TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE verification (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        value TEXT NOT NULL,
        expiresAt INTEGER NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE account_entitlements (
        user_id TEXT PRIMARY KEY,
        plan_key TEXT,
        storage_limit_bytes INTEGER,
        event_limit INTEGER,
        member_limit INTEGER,
        updated_at INTEGER
      )`),
      env.DB.prepare(`CREATE TABLE account_storage_usage (
        user_id TEXT PRIMARY KEY,
        used_bytes INTEGER,
        updated_at INTEGER
      )`),
      env.DB.prepare(`CREATE TABLE account_event_usage (
        user_id TEXT PRIMARY KEY,
        active_events INTEGER,
        updated_at INTEGER
      )`),
      env.DB.prepare(`CREATE TABLE events (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        couple TEXT NOT NULL,
        eventName TEXT,
        admin_token_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        status TEXT NOT NULL,
        notes TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        default_locale TEXT NOT NULL DEFAULT 'el',
        event_start_date TEXT,
        event_end_date TEXT,
        event_type TEXT NOT NULL DEFAULT 'other',
        location TEXT,
        location_place_id TEXT,
        location_lat REAL,
        location_lng REAL,
        location_provider TEXT,
        gallery_pin_hash TEXT,
        deleted_at INTEGER,
        purge_at INTEGER
      )`),
      env.DB.prepare(`CREATE TABLE event_members (
        event_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (event_id, user_id)
      )`),
      env.DB.prepare(`CREATE TABLE media (
        id TEXT PRIMARY KEY,event_id TEXT NOT NULL,object_key TEXT NOT NULL,
        media_type TEXT NOT NULL DEFAULT 'image',content_type TEXT NOT NULL DEFAULT 'image/jpeg',
        size_bytes INTEGER NOT NULL DEFAULT 0,deleted_at INTEGER,purge_at INTEGER
      )`),
      env.DB.prepare(`CREATE TABLE event_wedding_profiles (
        event_id TEXT PRIMARY KEY,partner_one_name TEXT NOT NULL DEFAULT '',partner_two_name TEXT NOT NULL DEFAULT '',
        welcome_message TEXT NOT NULL DEFAULT '',story TEXT NOT NULL DEFAULT '',ceremony_at TEXT,ceremony_location TEXT NOT NULL DEFAULT '',
        ceremony_place_id TEXT,ceremony_lat REAL,ceremony_lng REAL,reception_at TEXT,reception_location TEXT NOT NULL DEFAULT '',
        reception_place_id TEXT,reception_lat REAL,reception_lng REAL,dress_code TEXT NOT NULL DEFAULT '',contact_name TEXT NOT NULL DEFAULT '',
        contact_email TEXT NOT NULL DEFAULT '',contact_phone TEXT NOT NULL DEFAULT '',travel_notes TEXT NOT NULL DEFAULT '',
        accommodation_notes TEXT NOT NULL DEFAULT '',gift_message TEXT NOT NULL DEFAULT '',gift_url TEXT NOT NULL DEFAULT '',
        wizard_step INTEGER NOT NULL DEFAULT 1 CHECK (wizard_step BETWEEN 1 AND 6),wizard_completed_at INTEGER,catalog_version TEXT NOT NULL,
        estimated_total_minor INTEGER NOT NULL DEFAULT 3900,currency TEXT NOT NULL DEFAULT 'EUR',updated_at INTEGER NOT NULL,
        template_key TEXT NOT NULL DEFAULT 'cypress',publish_status TEXT NOT NULL DEFAULT 'draft',accent_color TEXT
      )`),
      env.DB.prepare(`CREATE TABLE event_wedding_features (
        event_id TEXT NOT NULL,feature_key TEXT NOT NULL,enabled INTEGER NOT NULL,price_minor INTEGER NOT NULL,
        catalog_version TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(event_id,feature_key)
      )`),
      env.DB.prepare(`CREATE TABLE event_wedding_menus (
        event_id TEXT PRIMARY KEY,object_key TEXT NOT NULL,content_type TEXT NOT NULL,original_filename TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,updated_by TEXT NOT NULL,updated_at INTEGER NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE event_wedding_media (
        id TEXT PRIMARY KEY,event_id TEXT NOT NULL,object_key TEXT NOT NULL,media_type TEXT NOT NULL,
        content_type TEXT NOT NULL,size_bytes INTEGER NOT NULL,uploaded_at INTEGER NOT NULL,uploaded_by_user_id TEXT
      )`),
      env.DB.prepare(`CREATE TABLE event_wedding_portrait_assignments (
        event_id TEXT NOT NULL,media_id TEXT NOT NULL,slot TEXT NOT NULL,position INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL,PRIMARY KEY(event_id,slot)
      )`),
      env.DB.prepare(`CREATE TABLE event_experience_settings (
        event_id TEXT PRIMARY KEY,rsvp_enabled INTEGER NOT NULL DEFAULT 1,guestbook_enabled INTEGER NOT NULL DEFAULT 1,
        comments_enabled INTEGER NOT NULL DEFAULT 1,slideshow_enabled INTEGER NOT NULL DEFAULT 1,
        guestbook_moderation INTEGER NOT NULL DEFAULT 1,updated_at INTEGER NOT NULL
      )`),
    ]);

    await SELF.fetch("https://memboux.com/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Owner", email, password }),
    });

    await env.DB.prepare('UPDATE "user" SET emailVerified=1 WHERE email=?').bind(email).run();

    const signIn = await SELF.fetch("https://memboux.com/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      redirect: "manual",
    });

    expect(signIn.status).toBe(200);

    const cookieHeader = cookieHeaderFromResponse(signIn);
    expect(cookieHeader).toContain("session_token=");

    const invalidType = await SELF.fetch("https://memboux.com/api/account/events", {
      method: "POST",
      headers: {
        Origin: "https://memboux.com",
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader,
      },
      body: new URLSearchParams({
        locale: "en",
        eventName: "Invalid template",
        eventType: "not-a-real-type",
        eventStartDate: "2026-06-15",
      }),
    });
    expect(invalidType.status).toBe(400);
    expect(await invalidType.json()).toMatchObject({ message: "Choose a valid event type." });

    const create = await SELF.fetch("https://memboux.com/api/account/events", {
      method: "POST",
      headers: {
        Origin: "https://memboux.com",
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader,
      },
      body: new URLSearchParams({
        locale: "en",
        eventName: "Island trip",
        eventType: "trip",
        location: "Zanzibar, Tanzania",
        eventStartDate: "2026-06-15",
        eventEndDate: "2026-06-28",
      }),
      redirect: "manual",
    });

    expect(create.status).toBe(201);
    const createBody = await create.json<{ status: boolean; code: string; redirect: string }>();
    expect(createBody).toMatchObject({
      status: true,
      redirect: `/dashboard/${createBody.code}?lang=en#template`,
    });

    const user = await env.DB.prepare('SELECT id FROM "user" WHERE email=?')
      .bind(email)
      .first<{ id: string }>();
    expect(user?.id).toBeTruthy();

    const event = await env.DB.prepare(
      'SELECT e.id,e.code,e.eventName,e.event_type,e.location,e.default_locale,em.role FROM events e JOIN event_members em ON em.event_id=e.id WHERE em.user_id=? ORDER BY e.created_at DESC LIMIT 1',
    )
      .bind(user!.id)
      .first<{ id: string; code: string; eventName: string; event_type: string; location: string | null; default_locale: string; role: string }>();

    expect(event).toMatchObject({
      eventName: "Island trip",
      event_type: "trip",
      location: "Zanzibar, Tanzania",
      default_locale: "en",
      role: "owner",
    });

    const updateDetails = await SELF.fetch(`https://memboux.com/api/account/events/${event!.code}/details`, {
      method: "POST",
      headers: {
        Origin: "https://memboux.com",
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader,
      },
      body: new URLSearchParams({
        locale: "en",
        eventName: "Island trip",
        eventType: "corporate",
        location: "Nungwi, Zanzibar",
        eventStartDate: "2026-06-15",
        eventEndDate: "2026-06-28",
      }),
    });
    expect(updateDetails.status).toBe(409);
    expect(await updateDetails.json()).toMatchObject({ message: "Event type is chosen at creation and cannot be changed." });
    expect(await env.DB.prepare("SELECT event_type,location FROM events WHERE code=?").bind(event!.code).first())
      .toEqual({ event_type: "trip", location: "Zanzibar, Tanzania" });

    const updateLocation = await SELF.fetch(`https://memboux.com/api/account/events/${event!.code}/details`, {
      method: "POST",
      headers: {
        Origin: "https://memboux.com",
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader,
      },
      body: new URLSearchParams({
        locale: "en",
        eventName: "Island trip",
        location: "Nungwi, Zanzibar",
        eventStartDate: "2026-06-15",
        eventEndDate: "2026-06-28",
      }),
    });
    expect(updateLocation.status).toBe(200);
    expect(await updateLocation.json()).toMatchObject({ eventType: "trip", eventTypeLabel: "Trip & vacation", eventLocation: "Nungwi, Zanzibar" });
    expect(await env.DB.prepare("SELECT event_type,location FROM events WHERE code=?").bind(event!.code).first())
      .toEqual({ event_type: "trip", location: "Nungwi, Zanzibar" });

    const pinHeaders = {
      Origin: "https://memboux.com",
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader,
    };
    const setPin = await SELF.fetch(`https://memboux.com/api/account/events/${event!.code}/privacy`, {
      method: "POST",
      headers: pinHeaders,
      body: new URLSearchParams({ locale: "en", action: "set", pin: "4826" }),
    });
    expect(setPin.status).toBe(200);
    expect(await setPin.json()).toEqual({ enabled: true });
    const stored = await env.DB.prepare("SELECT gallery_pin_hash FROM events WHERE code=?").bind(event!.code).first<{ gallery_pin_hash: string | null }>();
    expect(stored?.gallery_pin_hash).toBeTruthy();
    expect(stored?.gallery_pin_hash).not.toBe("4826");

    const removePin = await SELF.fetch(`https://memboux.com/api/account/events/${event!.code}/privacy`, {
      method: "POST",
      headers: pinHeaders,
      body: new URLSearchParams({ locale: "en", action: "remove" }),
    });
    expect(removePin.status).toBe(200);
    expect(await removePin.json()).toEqual({ enabled: false });
    expect(await env.DB.prepare("SELECT gallery_pin_hash FROM events WHERE code=?").bind(event!.code).first()).toEqual({ gallery_pin_hash: null });

    const trashEvent = await SELF.fetch(`https://memboux.com/api/account/events/${event!.code}/trash`, {
      method: "POST", headers: { ...pinHeaders, Accept: "text/html" }, redirect: "manual",
      body: new URLSearchParams({ locale: "en" }),
    });
    expect(trashEvent.status).toBe(303);
    const trashPage = await SELF.fetch("https://memboux.com/en/trash", { headers: { Cookie: cookieHeader } });
    const trashHtml = await trashPage.text();
    expect(trashHtml).toContain('id="owner-event-trash-toggle"');
    expect(trashHtml).toContain('action="/api/account/trash/events/restore"');
    expect(trashHtml).toContain('action="/api/account/trash/events/delete"');
    expect(trashHtml).toContain("Delete permanently");

    const bulkRestore = await SELF.fetch("https://memboux.com/api/account/trash/events/restore", {
      method: "POST", headers: { ...pinHeaders, Accept: "text/html" }, redirect: "manual",
      body: new URLSearchParams({ locale: "en", ids: event!.id }),
    });
    expect(bulkRestore.status).toBe(303);
    expect(await env.DB.prepare("SELECT deleted_at,purge_at FROM events WHERE id=?").bind(event!.id).first())
      .toEqual({ deleted_at: null, purge_at: null });

    const weddingCreate = await SELF.fetch("https://memboux.com/api/account/events", {
      method: "POST",
      headers: {
        Origin: "https://memboux.com",
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader,
      },
      body: new URLSearchParams({
        locale: "en",
        eventName: "Our wedding",
        eventType: "wedding",
        eventStartDate: "2027-05-22",
      }),
    });
    expect(weddingCreate.status).toBe(201);
    const weddingBody = await weddingCreate.json<{ code: string; redirect: string }>();
    expect(weddingBody.redirect).toBe(`/dashboard/${weddingBody.code}/wedding/setup?lang=en`);

    const wizard = await SELF.fetch(`https://memboux.com${weddingBody.redirect}`, {
      headers: { Cookie: cookieHeader },
    });
    expect(wizard.status).toBe(200);
    const wizardHtml = await wizard.text();
    expect(wizardHtml).toContain("Wedding setup");
    expect(wizardHtml).toContain('name="partnerOneName"');
    expect(wizardHtml.match(/type="radio" name="templateKey"/g)).toHaveLength(15);
    expect(wizardHtml).toContain('value="deco"');
    expect(wizardHtml).toContain(`preview=1&theme=champagne`);
    expect(wizardHtml).toContain('class="w-template-selected"');
    expect(wizardHtml).toContain('data-selected="true"');
    expect(wizardHtml).toContain('id="wedding-save-exit"');
    expect(wizardHtml).toContain("lg:grid-cols-4");
    expect(wizardHtml).toContain("Couple information");
    expect(wizardHtml).toContain("templates.before(heading,...details)");

    const wizardHeaders = {
      Origin: "https://memboux.com",
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader,
    };
    const saveAndExitCouple = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/setup/1`, {
      method: "POST", headers: wizardHeaders, redirect: "manual",
      body: new URLSearchParams({ locale: "en", intent: "exit", templateKey: "champagne", partnerOneName: "Alex", partnerTwoName: "Sam", welcomeMessage: "Celebrate with us", story: "Our story" }),
    });
    expect(saveAndExitCouple.status).toBe(303);
    expect(saveAndExitCouple.headers.get("location")).toBe(`/dashboard/${weddingBody.code}?lang=en#template`);
    const savedWeddingEvent = await env.DB.prepare("SELECT id FROM events WHERE code=?").bind(weddingBody.code).first<{ id: string }>();
    expect(await env.DB.prepare("SELECT template_key FROM event_wedding_profiles WHERE event_id=?").bind(savedWeddingEvent!.id).first())
      .toEqual({ template_key: "champagne" });

    const saveCouple = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/setup/1`, {
      method: "POST", headers: wizardHeaders, redirect: "manual",
      body: new URLSearchParams({ locale: "en", partnerOneName: "Alex", partnerTwoName: "Sam", welcomeMessage: "Celebrate with us", story: "Our story" }),
    });
    expect(saveCouple.status).toBe(303);
    expect(saveCouple.headers.get("location")).toContain("step=2");

    const portraitWizard = await SELF.fetch(`https://memboux.com/dashboard/${weddingBody.code}/wedding/setup?lang=en&step=2`, {
      headers: { Cookie: cookieHeader },
    });
    expect(portraitWizard.status).toBe(200);
    const portraitHtml = await portraitWizard.text();
    expect(portraitHtml).toContain('id="portrait-upload-slot"');
    expect(portraitHtml).toContain('name="slot"');
    expect(portraitHtml).toContain('name="file" type="file" required multiple');
    expect(portraitHtml).toContain('data-slot="hero"');
    expect(portraitHtml).toContain("Hero slideshow");
    expect(portraitHtml).toContain("editorial gallery");

    const portraitUploadForm = new FormData();
    portraitUploadForm.set("locale", "en");
    portraitUploadForm.set("slot", "hero");
    portraitUploadForm.set("file", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "portrait.jpg", { type: "image/jpeg" }));
    const portraitUpload = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/media/upload`, {
      method: "POST",
      headers: { Origin: "https://memboux.com", Cookie: cookieHeader },
      body: portraitUploadForm,
      redirect: "manual",
    });
    expect(portraitUpload.status).toBe(303);
    const weddingMediaEvent = await env.DB.prepare("SELECT id FROM events WHERE code=?").bind(weddingBody.code).first<{ id: string }>();
    expect(await env.DB.prepare("SELECT slot FROM event_wedding_portrait_assignments WHERE event_id=?").bind(weddingMediaEvent!.id).first())
      .toEqual({ slot: "hero" });
    const uploadedWeddingMedia = await env.DB.prepare("SELECT id FROM event_wedding_media WHERE event_id=?").bind(weddingMediaEvent!.id).first<{ id: string }>();
    const anonymousDraftMedia = await SELF.fetch(`https://memboux.com/wedding-media/${uploadedWeddingMedia!.id}`);
    expect(anonymousDraftMedia.status).toBe(404);
    const ownerDraftMedia = await SELF.fetch(`https://memboux.com/wedding-media/${uploadedWeddingMedia!.id}`, {
      headers: { Cookie: cookieHeader },
    });
    expect(ownerDraftMedia.status).toBe(200);
    expect(ownerDraftMedia.headers.get("content-type")).toBe("image/jpeg");
    const populatedPortraitWizard = await SELF.fetch(`https://memboux.com/dashboard/${weddingBody.code}/wedding/setup?lang=en&step=2`, {
      headers: { Cookie: cookieHeader },
    });
    const populatedPortraitHtml = await populatedPortraitWizard.text();
    expect(populatedPortraitHtml).toContain("All your photos in one place");
    expect(populatedPortraitHtml).toContain("data-wedding-library-card");
    expect(populatedPortraitHtml).toContain(`/wedding/media/${uploadedWeddingMedia!.id}/delete`);

    const deleteWeddingMediaForm = new FormData();
    deleteWeddingMediaForm.set("locale", "en");
    const deleteWeddingMediaResponse = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/media/${uploadedWeddingMedia!.id}/delete`, {
      method: "POST",
      headers: { Origin: "https://memboux.com", Cookie: cookieHeader },
      body: deleteWeddingMediaForm,
      redirect: "manual",
    });
    expect(deleteWeddingMediaResponse.status).toBe(303);
    expect(await env.DB.prepare("SELECT id FROM event_wedding_media WHERE id=?").bind(uploadedWeddingMedia!.id).first()).toBeNull();
    expect(await env.DB.prepare("SELECT slot FROM event_wedding_portrait_assignments WHERE event_id=?").bind(weddingMediaEvent!.id).first()).toBeNull();

    const savePortraits = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/setup/2`, {
      method: "POST", headers: wizardHeaders, redirect: "manual",
      body: new URLSearchParams({ locale: "en" }),
    });
    expect(savePortraits.status).toBe(303);
    expect(savePortraits.headers.get("location")).toContain("step=3");

    const scheduleWizard = await SELF.fetch(`https://memboux.com/dashboard/${weddingBody.code}/wedding/setup?lang=en&step=3`, {
      headers: { Cookie: cookieHeader },
    });
    const scheduleHtml = await scheduleWizard.text();
    expect(scheduleHtml).toContain('name="ceremonyPlaceId"');
    expect(scheduleHtml).toContain('name="receptionPlaceId"');
    expect(scheduleHtml).toContain('name="ceremonyLat"');
    expect(scheduleHtml).toContain('name="receptionLng"');
    expect(scheduleHtml).toContain("Choose on map");
    expect(scheduleHtml).toContain("OpenStreetMap");
    expect(scheduleHtml).toContain("Google Maps");
    expect(scheduleHtml).toContain('lang="en-GB" step="60"');

    const saveSchedule = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/setup/3`, {
      method: "POST", headers: wizardHeaders, redirect: "manual",
      body: new URLSearchParams({ locale: "en", ceremonyAt: "2027-05-22T17:00", ceremonyLocation: "Chapel", receptionAt: "2027-05-22T19:00", receptionLocation: "Garden", dressCode: "Summer formal" }),
    });
    expect(saveSchedule.status).toBe(303);

    const saveGuests = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/setup/4`, {
      method: "POST", headers: wizardHeaders, redirect: "manual",
      body: new URLSearchParams({ locale: "en", contactName: "Alex", contactEmail: "alex@example.com", travelNotes: "Shuttle available", accommodationNotes: "Nearby hotels", giftMessage: "Your presence is enough", giftUrl: "https://example.com/registry" }),
    });
    expect(saveGuests.status).toBe(303);

    const menuForm = new FormData();
    menuForm.set("locale", "en");
    menuForm.set("menuFile", new File([new TextEncoder().encode("%PDF-1.7\nmenu")], "Dinner menu.pdf", { type: "application/pdf" }));
    const menuUpload = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/menu`, {
      method: "POST",
      headers: { Origin: "https://memboux.com", Cookie: cookieHeader },
      body: menuForm,
      redirect: "manual",
    });
    expect(menuUpload.status).toBe(303);
    const weddingMenuEvent = await env.DB.prepare("SELECT id FROM events WHERE code=?").bind(weddingBody.code).first<{ id: string }>();
    expect(await env.DB.prepare("SELECT content_type,original_filename FROM event_wedding_menus WHERE event_id=?").bind(weddingMenuEvent!.id).first())
      .toEqual({ content_type: "application/pdf", original_filename: "Dinner menu.pdf" });

    const selected = new URLSearchParams({ locale: "en" });
    selected.append("feature", "rsvp");
    selected.append("feature", "guestbook");
    selected.append("feature", "guest_quiz");
    const saveFeatures = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/setup/5`, {
      method: "POST", headers: wizardHeaders, redirect: "manual", body: selected,
    });
    expect(saveFeatures.status).toBe(303);
    const weddingEvent = await env.DB.prepare("SELECT id FROM events WHERE code=?").bind(weddingBody.code).first<{ id: string }>();
    expect(await env.DB.prepare("SELECT estimated_total_minor,wizard_step FROM event_wedding_profiles WHERE event_id=?").bind(weddingEvent!.id).first())
      .toEqual({ estimated_total_minor: 5700, wizard_step: 6 });
    expect(await env.DB.prepare("SELECT rsvp_enabled,guestbook_enabled,slideshow_enabled FROM event_experience_settings WHERE event_id=?").bind(weddingEvent!.id).first())
      .toEqual({ rsvp_enabled: 1, guestbook_enabled: 1, slideshow_enabled: 0 });

    const finishWizard = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/setup/6`, {
      method: "POST", headers: wizardHeaders, redirect: "manual", body: new URLSearchParams({ locale: "en" }),
    });
    expect(finishWizard.status).toBe(303);
    expect(finishWizard.headers.get("location")).toBe(`/dashboard/${weddingBody.code}?lang=en#template`);
    expect((await env.DB.prepare("SELECT wizard_completed_at FROM event_wedding_profiles WHERE event_id=?").bind(weddingEvent!.id).first<{ wizard_completed_at: number | null }>())?.wizard_completed_at).toBeTypeOf("number");

    const trashAgain = await SELF.fetch(`https://memboux.com/api/account/events/${event!.code}/trash`, {
      method: "POST", headers: pinHeaders, body: new URLSearchParams({ locale: "en" }), redirect: "manual",
    });
    expect(trashAgain.status).toBe(303);
    expect((await env.DB.prepare("SELECT deleted_at FROM events WHERE id=?").bind(event!.id).first<{ deleted_at: number | null }>())?.deleted_at).not.toBeNull();
    const bulkDelete = await SELF.fetch("https://memboux.com/api/account/trash/events/delete", {
      method: "POST", headers: pinHeaders, body: new URLSearchParams({ locale: "en", ids: event!.id }), redirect: "manual",
    });
    expect(bulkDelete.status).toBe(200);
    expect(await bulkDelete.json()).toEqual({ action: "delete", processed: 1 });
    expect(await env.DB.prepare("SELECT id FROM events WHERE id=?").bind(event!.id).first()).toBeNull();

  }, 15_000);
});
