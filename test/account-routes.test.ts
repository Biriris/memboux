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
    "/dashboard/ABC123/wedding/guests?lang=en",
    "/dashboard/ABC123/wedding/guests/guest/edit?lang=en",
    "/dashboard/ABC123/wedding/guests/seating-plan?lang=en",
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

  it("rejects anonymous wedding guest exports", async () => {
    const response = await SELF.fetch("https://memboux.com/api/account/events/ABC123/wedding/guests/export");
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
    ["/api/account/events/ABC123/wedding/publish", { locale: "en" }],
    ["/api/account/events/ABC123/wedding/unpublish", { locale: "en" }],
    ["/api/account/events/ABC123/wedding/guest-groups", { locale: "en", name: "Friends" }],
    ["/api/account/events/ABC123/wedding/guest-groups/group", { locale: "en", name: "Family" }],
    ["/api/account/events/ABC123/wedding/guest-groups/group/delete", { locale: "en" }],
    ["/api/account/events/ABC123/wedding/guests", { locale: "en", firstName: "Guest", email: "guest@example.com" }],
    ["/api/account/events/ABC123/wedding/guests/import", { locale: "en" }],
    ["/api/account/events/ABC123/wedding/guests/guest", { locale: "en", firstName: "Guest", email: "guest@example.com" }],
    ["/api/account/events/ABC123/wedding/guests/guest/quick-update", { locale: "en", field: "rsvp", value: "yes" }],
    ["/api/account/events/ABC123/wedding/guests/guest/invite-link", { locale: "en" }],
    ["/api/account/events/ABC123/wedding/guests/guest/invitations/send", { locale: "en" }],
    ["/api/account/events/ABC123/wedding/guests/guest/delete", { locale: "en" }],
    ["/api/account/events/ABC123/wedding/guests/invitations/send", { locale: "en" }],
    ["/api/account/events/ABC123/wedding/tables", { locale: "en", name: "Table 1" }],
    ["/api/account/events/ABC123/wedding/tables/table", { locale: "en", name: "Table 2" }],
    ["/api/account/events/ABC123/wedding/tables/table/delete", { locale: "en" }],
    ["/api/account/events/ABC123/wedding/seating", { locale: "en", guestId: "guest", tableId: "table" }],
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
      env.DB.prepare("DROP TABLE IF EXISTS commerce_order_items"),
      env.DB.prepare("DROP TABLE IF EXISTS commerce_orders"),
      env.DB.prepare("DROP TABLE IF EXISTS commerce_products"),
      env.DB.prepare("DROP TABLE IF EXISTS event_members"),
      env.DB.prepare("DROP TABLE IF EXISTS event_access"),
      env.DB.prepare("DROP TABLE IF EXISTS event_wedding_seat_assignments"),
      env.DB.prepare("DROP TABLE IF EXISTS event_wedding_tables"),
      env.DB.prepare("DROP TABLE IF EXISTS event_rsvps"),
      env.DB.prepare("DROP TABLE IF EXISTS event_wedding_guests"),
      env.DB.prepare("DROP TABLE IF EXISTS event_wedding_guest_groups"),
      env.DB.prepare("DROP TABLE IF EXISTS event_wedding_price_snapshots"),
      env.DB.prepare("DROP TABLE IF EXISTS event_wedding_portrait_assignments"),
      env.DB.prepare("DROP TABLE IF EXISTS event_wedding_media"),
      env.DB.prepare("DROP TABLE IF EXISTS event_wedding_menu_courses"),
      env.DB.prepare("DROP TABLE IF EXISTS event_wedding_menus"),
      env.DB.prepare("DROP TABLE IF EXISTS event_wedding_features"),
      env.DB.prepare("DROP TABLE IF EXISTS event_wedding_profiles"),
      env.DB.prepare("DROP TABLE IF EXISTS event_vertical_profiles"),
      env.DB.prepare("DROP TABLE IF EXISTS event_experience_settings"),
      env.DB.prepare("DROP TABLE IF EXISTS event_covers"),
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
        website_pin_hash TEXT,
        guest_gallery_pin_hash TEXT,
        official_album_pin_hash TEXT,
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
      env.DB.prepare(`CREATE TABLE event_access (
        event_id TEXT PRIMARY KEY,
        access_state TEXT NOT NULL,
        enforcement_state TEXT NOT NULL,
        media_limit INTEGER NOT NULL,
        guest_access_enabled INTEGER NOT NULL,
        guest_uploads_enabled INTEGER NOT NULL,
        original_downloads_enabled INTEGER NOT NULL,
        trial_started_at INTEGER,
        trial_ends_at INTEGER,
        unlocked_at INTEGER,
        expires_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE commerce_products (
        product_key TEXT PRIMARY KEY,scope TEXT NOT NULL,billing_model TEXT NOT NULL,
        name_en TEXT NOT NULL,name_el TEXT NOT NULL,name_fr TEXT NOT NULL DEFAULT '',name_de TEXT NOT NULL DEFAULT '',name_es TEXT NOT NULL DEFAULT '',name_it TEXT NOT NULL DEFAULT '',
        description_en TEXT NOT NULL,description_el TEXT NOT NULL,description_fr TEXT NOT NULL DEFAULT '',description_de TEXT NOT NULL DEFAULT '',description_es TEXT NOT NULL DEFAULT '',description_it TEXT NOT NULL DEFAULT '',
        amount_minor INTEGER NOT NULL,currency TEXT NOT NULL,media_limit INTEGER,event_duration_days INTEGER,
        guest_access_enabled INTEGER NOT NULL,original_downloads_enabled INTEGER NOT NULL,
        active INTEGER NOT NULL,checkout_enabled INTEGER NOT NULL,sort_order INTEGER NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE commerce_orders (
        id TEXT PRIMARY KEY,user_id TEXT NOT NULL,event_id TEXT,status TEXT NOT NULL,currency TEXT NOT NULL,
        subtotal_minor INTEGER NOT NULL,tax_minor INTEGER NOT NULL,total_minor INTEGER NOT NULL,billing_provider TEXT NOT NULL,
        provider_checkout_id TEXT,provider_payment_id TEXT,paid_at INTEGER,expires_at INTEGER,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE commerce_order_items (
        id TEXT PRIMARY KEY,order_id TEXT NOT NULL,product_key TEXT NOT NULL,product_name TEXT NOT NULL,billing_model TEXT NOT NULL,
        unit_amount_minor INTEGER NOT NULL,quantity INTEGER NOT NULL,line_total_minor INTEGER NOT NULL,currency TEXT NOT NULL,
        entitlement_snapshot TEXT NOT NULL,created_at INTEGER NOT NULL
      )`),
      env.DB.prepare(`INSERT INTO commerce_products (
        product_key,scope,billing_model,name_en,name_el,description_en,description_el,amount_minor,currency,
        media_limit,event_duration_days,guest_access_enabled,original_downloads_enabled,active,checkout_enabled,sort_order,created_at,updated_at
      ) VALUES ('event_pass','event','one_time','Event Pass','Event Pass','Event access','Πρόσβαση event',1900,'EUR',500,365,1,1,1,0,10,1,1)`),
      env.DB.prepare(`CREATE TABLE media (
        id TEXT PRIMARY KEY,event_id TEXT NOT NULL,object_key TEXT NOT NULL,
        media_type TEXT NOT NULL DEFAULT 'image',content_type TEXT NOT NULL DEFAULT 'image/jpeg',
        size_bytes INTEGER NOT NULL DEFAULT 0,uploaded_by TEXT NOT NULL DEFAULT 'Guest',
        uploaded_at INTEGER NOT NULL DEFAULT 0,captured_at INTEGER,origin TEXT NOT NULL DEFAULT 'guest',
        reported_at INTEGER,deleted_at INTEGER,purge_at INTEGER
      )`),
      env.DB.prepare(`CREATE TABLE event_covers (
        event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
        source_media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
        object_key TEXT NOT NULL UNIQUE,
        content_type TEXT NOT NULL,
        updated_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        updated_at INTEGER NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE media_likes (
        media_id TEXT NOT NULL,actor_key TEXT NOT NULL,created_at INTEGER NOT NULL,
        PRIMARY KEY(media_id,actor_key)
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
      env.DB.prepare(`CREATE TABLE event_vertical_profiles (
        event_id TEXT PRIMARY KEY,headline TEXT NOT NULL DEFAULT '',host_name TEXT NOT NULL DEFAULT '',
        introduction TEXT NOT NULL DEFAULT '',story TEXT NOT NULL DEFAULT '',schedule_notes TEXT NOT NULL DEFAULT '',
        guest_notes TEXT NOT NULL DEFAULT '',contact_email TEXT NOT NULL DEFAULT '',theme_key TEXT NOT NULL DEFAULT 'signature',
        custom_fields_json TEXT NOT NULL DEFAULT '{}',
        wizard_step INTEGER NOT NULL DEFAULT 1,wizard_completed_at INTEGER,publish_status TEXT NOT NULL DEFAULT 'draft',
        updated_at INTEGER NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE event_wedding_features (
        event_id TEXT NOT NULL,feature_key TEXT NOT NULL,enabled INTEGER NOT NULL,price_minor INTEGER NOT NULL,
        catalog_version TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(event_id,feature_key)
      )`),
      env.DB.prepare(`CREATE TABLE event_wedding_price_snapshots (
        event_id TEXT NOT NULL,item_key TEXT NOT NULL,item_type TEXT NOT NULL,price_minor INTEGER NOT NULL,
        currency TEXT NOT NULL,catalog_version TEXT NOT NULL,locked_at INTEGER NOT NULL,locked_until INTEGER NOT NULL,
        PRIMARY KEY(event_id,item_key)
      )`),
      env.DB.prepare(`CREATE TABLE event_wedding_guest_groups (
        id TEXT PRIMARY KEY,event_id TEXT NOT NULL,name TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE event_wedding_guests (
        id TEXT PRIMARY KEY,event_id TEXT NOT NULL,group_id TEXT,first_name TEXT NOT NULL,last_name TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',phone TEXT NOT NULL DEFAULT '',plus_one_limit INTEGER NOT NULL DEFAULT 0,
        invited_to_ceremony INTEGER NOT NULL DEFAULT 1,invited_to_reception INTEGER NOT NULL DEFAULT 1,
        rsvp_status TEXT NOT NULL DEFAULT 'pending',party_size INTEGER NOT NULL DEFAULT 1,dietary_notes TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',invitation_token_hash TEXT,invitation_created_at INTEGER,
        invitation_delivery_status TEXT NOT NULL DEFAULT 'not_sent',invitation_delivery_attempted_at INTEGER,invitation_emailed_at INTEGER,
        created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
      )`),
      env.DB.prepare("CREATE UNIQUE INDEX idx_wedding_guests_event_email ON event_wedding_guests(event_id,email) WHERE email != ''"),
      env.DB.prepare(`CREATE TABLE event_wedding_tables (
        id TEXT PRIMARY KEY,event_id TEXT NOT NULL,name TEXT NOT NULL,shape TEXT NOT NULL DEFAULT 'round',capacity INTEGER NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,position_x REAL,position_y REAL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
        UNIQUE(event_id,name)
      )`),
      env.DB.prepare(`CREATE TABLE event_wedding_seat_assignments (
        guest_id TEXT PRIMARY KEY,table_id TEXT NOT NULL,seat_number INTEGER,assigned_at INTEGER NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE event_rsvps (
        id TEXT PRIMARY KEY,event_id TEXT NOT NULL,name TEXT NOT NULL,email TEXT NOT NULL,response TEXT NOT NULL,
        guest_count INTEGER NOT NULL DEFAULT 1,dietary_notes TEXT NOT NULL DEFAULT '',message TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,wedding_guest_id TEXT,UNIQUE(event_id,email),UNIQUE(wedding_guest_id)
      )`),
      env.DB.prepare(`CREATE TABLE event_wedding_menus (
        event_id TEXT PRIMARY KEY,object_key TEXT NOT NULL,content_type TEXT NOT NULL,original_filename TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,updated_by TEXT NOT NULL,updated_at INTEGER NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE event_wedding_menu_courses (
        id TEXT PRIMARY KEY,event_id TEXT NOT NULL,course_type TEXT NOT NULL,title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',sort_order INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
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
      redirect: `/dashboard/${createBody.code}/setup?lang=en`,
    });

    const verticalWizard = await SELF.fetch(`https://memboux.com${createBody.redirect}`, {
      headers: { Cookie: cookieHeader },
    });
    expect(verticalWizard.status).toBe(200);
    const verticalWizardHtml = await verticalWizard.text();
    expect(verticalWizardHtml).toContain('id="event-setup-form"');
    expect(verticalWizardHtml).toContain('name="headline"');
    expect(verticalWizardHtml).toContain('id="event-preview-drawer"');
    expect(verticalWizardHtml).toContain("Changes are saved automatically.");
    expect(verticalWizardHtml).toContain(`/event/${createBody.code}?lang=en&preview=1`);
    expect(verticalWizardHtml).toContain("inFlight=false,pending=null,submitting=false");
    expect(verticalWizardHtml).toContain("if(inFlight||!pending)return");
    expect(verticalWizardHtml).toContain("finally{inFlight=false;if(pending)flush()}");
    expect(verticalWizardHtml).toContain("form.addEventListener('submit',async event=>");
    expect(verticalWizardHtml).toContain("submitting=true;pending=null");
    expect(verticalWizardHtml).toContain("while(inFlight)");
    expect(verticalWizardHtml).toContain("if(!pending&&!submitting)");
    expect(verticalWizardHtml).toContain(
      "if(!response.ok||!response.redirected||target.pathname.includes('/login'))throw new Error()",
    );
    expect(verticalWizardHtml).toContain(
      "localStorage.removeItem(key);location.assign(target.href)",
    );
    expect(verticalWizardHtml).not.toContain("let timer,request=0");
    expect(verticalWizardHtml).not.toContain(
      "form.addEventListener('submit',()=>localStorage.removeItem(key))",
    );

    const autosave = await SELF.fetch(`https://memboux.com/api/account/events/${createBody.code}/setup/1/autosave`, {
      method: "POST",
      headers: {
        Origin: "https://memboux.com",
        "Content-Type": "application/json",
        Cookie: cookieHeader,
      },
      body: JSON.stringify({ headline: "Zanzibar together", hostName: "The travel group", introduction: "One shared journal." }),
    });
    expect(autosave.status).toBe(200);
    expect(await env.DB.prepare("SELECT headline,host_name,wizard_step FROM event_vertical_profiles WHERE event_id=(SELECT id FROM events WHERE code=?)").bind(createBody.code).first())
      .toEqual({ headline: "Zanzibar together", host_name: "The travel group", wizard_step: 1 });

    const continueStep = await SELF.fetch(`https://memboux.com/api/account/events/${createBody.code}/setup/1`, {
      method: "POST",
      headers: {
        Origin: "https://memboux.com",
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader,
      },
      body: new URLSearchParams({ locale: "en", headline: "Zanzibar together", hostName: "The travel group", destination: "Zanzibar", travelGroup: "Old friends", introduction: "One shared journal." }),
      redirect: "manual",
    });
    expect(continueStep.status).toBe(303);
    expect(continueStep.headers.get("location")).toBe(`/dashboard/${createBody.code}/setup?lang=en&step=2`);

    await env.DB.prepare(`INSERT INTO media
      (id,event_id,object_key,media_type,content_type,size_bytes,uploaded_by,uploaded_at,origin)
      SELECT ?,id,?,?,?,?,?,?,? FROM events WHERE code=?`)
      .bind("trip-guest-photo", "trip/guest-photo.jpg", "image", "image/jpeg", 1200, "Maya", Date.now(), "guest", createBody.code).run();

    const ownerPreview = await SELF.fetch(`https://memboux.com/event/${createBody.code}?lang=en&preview=1`, {
      headers: { Cookie: cookieHeader },
    });
    expect(ownerPreview.status).toBe(200);
    const ownerPreviewHtml = await ownerPreview.text();
    expect(ownerPreviewHtml).toContain('data-event-preview="trip"');
    expect(ownerPreviewHtml).toContain("Zanzibar together");
    expect(ownerPreviewHtml).toContain("Start the trial to open guest access and uploads.");
    expect(ownerPreviewHtml).toContain("Zanzibar");
    expect(ownerPreviewHtml).toContain('id="guest-album"');
    expect(ownerPreviewHtml).toContain('data-gallery-grid="event-guest-gallery"');
    expect(ownerPreviewHtml).toContain("trip-guest-photo");

    for (const [step, fields] of [
      [2, { scheduleNotes: "Day one: Stone Town. Day two: Nungwi.", mustSeeStops: "Stone Town, Nungwi" }],
      [3, { themeKey: "editorial", story: "A journey shared by old friends." }],
      [4, { guestNotes: "Bring a hat and comfortable shoes.", contactEmail: "travel@example.com" }],
    ] as const) {
      const response = await SELF.fetch(`https://memboux.com/api/account/events/${createBody.code}/setup/${step}`, {
        method: "POST",
        headers: {
          Origin: "https://memboux.com",
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieHeader,
        },
        body: new URLSearchParams({ locale: "en", ...fields }),
        redirect: "manual",
      });
      expect(response.status).toBe(303);
    }
    const customProfile = await env.DB.prepare("SELECT custom_fields_json FROM event_vertical_profiles WHERE event_id=(SELECT id FROM events WHERE code=?)")
      .bind(createBody.code).first<{ custom_fields_json: string }>();
    expect(JSON.parse(customProfile?.custom_fields_json ?? "{}")).toMatchObject({
      destination: "Zanzibar",
      travelGroup: "Old friends",
      mustSeeStops: "Stone Town, Nungwi",
    });
    expect(await env.DB.prepare("SELECT theme_key,wizard_step,publish_status,wizard_completed_at FROM event_vertical_profiles WHERE event_id=(SELECT id FROM events WHERE code=?)").bind(createBody.code).first())
      .toMatchObject({ theme_key: "editorial", wizard_step: 4, publish_status: "published" });
    const appearanceStep = await SELF.fetch(`https://memboux.com/dashboard/${createBody.code}/setup?lang=en&step=3`, {
      headers: { Cookie: cookieHeader },
    });
    const appearanceHtml = await appearanceStep.text();
    expect(appearanceHtml).toContain('input[name="themeKey"]');
    expect(appearanceHtml).toContain("aria-selected");
    expect(appearanceHtml).toContain("url.searchParams.set('theme',active.value)");

    const temporaryThemePreview = await SELF.fetch(`https://memboux.com/event/${createBody.code}?lang=en&preview=1&theme=minimal`, {
      headers: { Cookie: cookieHeader },
    });
    expect(await temporaryThemePreview.text()).toContain('data-event-theme="minimal"');
    expect((await env.DB.prepare("SELECT theme_key FROM event_vertical_profiles WHERE event_id=(SELECT id FROM events WHERE code=?)")
      .bind(createBody.code).first<{ theme_key: string }>())?.theme_key).toBe("editorial");

    const finishedPreview = await SELF.fetch(`https://memboux.com/event/${createBody.code}?lang=en&preview=1`, {
      headers: { Cookie: cookieHeader },
    });
    const finishedHtml = await finishedPreview.text();
    expect(finishedHtml).toContain('data-event-theme="editorial"');
    expect(finishedHtml).toContain("Bring a hat and comfortable shoes.");
    expect(finishedHtml).toContain(`/dashboard/${createBody.code}?lang=en#package-access-title`);
    expect(finishedHtml).toContain(`/dashboard/${createBody.code}?lang=en`);

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
    const access = await env.DB.prepare(
      "SELECT access_state,enforcement_state,media_limit,guest_access_enabled FROM event_access WHERE event_id=?",
    ).bind(event!.id).first();
    expect(access).toMatchObject({
      access_state: "preview",
      enforcement_state: "enforced",
      media_limit: 20,
      guest_access_enabled: 0,
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
      body: new URLSearchParams({ locale: "en", surface: "guest_gallery", action: "set", pin: "4826" }),
    });
    expect(setPin.status).toBe(200);
    expect(await setPin.json()).toEqual({ enabled: true, surface: "guest_gallery" });
    const stored = await env.DB.prepare("SELECT guest_gallery_pin_hash FROM events WHERE code=?").bind(event!.code).first<{ guest_gallery_pin_hash: string | null }>();
    expect(stored?.guest_gallery_pin_hash).toBeTruthy();
    expect(stored?.guest_gallery_pin_hash).not.toBe("4826");

    const pinRedirect = await SELF.fetch(`https://memboux.com/api/account/events/${event!.code}/privacy`, {
      method: "POST",
      headers: {
        Origin: "https://memboux.com",
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader,
      },
      body: new URLSearchParams({ locale: "en", surface: "guest_gallery", action: "set", pin: "4826" }),
      redirect: "manual",
    });
    expect(pinRedirect.status).toBe(303);
    expect(pinRedirect.headers.get("location")).toBe(`/dashboard/${event!.code}/share?lang=en`);

    const removePin = await SELF.fetch(`https://memboux.com/api/account/events/${event!.code}/privacy`, {
      method: "POST",
      headers: pinHeaders,
      body: new URLSearchParams({ locale: "en", surface: "guest_gallery", action: "remove" }),
    });
    expect(removePin.status).toBe(200);
    expect(await removePin.json()).toEqual({ enabled: false, surface: "guest_gallery" });
    expect(await env.DB.prepare("SELECT guest_gallery_pin_hash FROM events WHERE code=?").bind(event!.code).first()).toEqual({ guest_gallery_pin_hash: null });

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
    expect(wizardHtml).toContain('id="wedding-preview-drawer"');
    expect(wizardHtml).toContain('data-wedding-preview-open');
    expect(wizardHtml).toContain("Event readiness");
    expect(wizardHtml).toContain(`data-src="/wedding/${weddingBody.code}?lang=en&amp;preview=1"`);
    expect(wizardHtml.match(/type="radio" name="templateKey"/g)).toHaveLength(15);
    expect(wizardHtml).toContain('value="deco"');
    expect(wizardHtml).toContain(`preview=1&theme=champagne`);
    expect(wizardHtml.match(/data-wedding-theme-preview/g)).toHaveLength(16);
    expect(wizardHtml).toContain("openPreview(item.href)");
    expect(wizardHtml).toContain("Mobile / Tablet / Desktop");
    expect(wizardHtml.match(/<span data-template-selected-badge/g)).toHaveLength(15);
    expect(wizardHtml.match(/<span data-template-selected-badge hidden/g)).toHaveLength(14);
    expect(wizardHtml.match(/<i data-template-tick aria-hidden="true"/g)).toHaveLength(15);
    expect(wizardHtml.match(/aria-labelledby="wedding-template-/g)).toHaveLength(15);
    expect(wizardHtml.match(/aria-describedby="wedding-template-/g)).toHaveLength(15);
    expect(wizardHtml.match(/name="templateKey"[^>]+ required/g)).toHaveLength(15);
    expect(wizardHtml).toContain("badge.hidden=!isSelected");
    expect(wizardHtml).toContain("const checked=radios.find(input=>input.checked)");
    expect(wizardHtml).toContain(
      "fields.filter(field=>field.type==='radio'&&field.checked).forEach(field=>field.dispatchEvent(new Event('change',{bubbles:true})))",
    );
    const draftScript = [...wizardHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)]
      .map((match) => match[1])
      .find((script) => script.includes("memboux-wedding-draft"));
    expect(draftScript).toBeTruthy();
    expect(() => new Function(draftScript!)).not.toThrow();
    expect(wizardHtml).toContain('data-selected="true"');
    expect(wizardHtml).toContain('id="wedding-save-exit"');
    expect(wizardHtml).toContain('data-wedding-template-rail');
    expect(wizardHtml).toContain('id="wedding-template-live-frame"');
    expect(wizardHtml).toContain("Instant guest preview");
    expect(wizardHtml).toContain("liveFrame.src=");
    expect(wizardHtml).toContain('data-inline-preview-width="390px"');
    expect(wizardHtml).toContain("page.dataset.weddingNameScale");
    expect(wizardHtml).toContain("page.style.setProperty('--w-accent',accent)");
    expect(wizardHtml).toContain("drawerFrame.dataset.src=url.pathname+url.search");
    const livePreviewScript = [...wizardHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)]
      .map((match) => match[1])
      .find((script) => script.includes("data-inline-preview-width"));
    expect(livePreviewScript).toBeTruthy();
    expect(() => new Function(livePreviewScript!)).not.toThrow();
    expect(wizardHtml).toContain("Couple information");
    expect(wizardHtml).toContain("form.addEventListener('submit',async submitEvent=>");
    expect(wizardHtml).toContain("sessionStorage.setItem(key,JSON.stringify(collect()))");
    expect(wizardHtml).toContain(
      "if(!response.ok||!response.redirected||target.pathname.includes('/login'))throw new Error()",
    );
    expect(wizardHtml).toContain(
      "sessionStorage.removeItem(key);location.assign(target.href)",
    );
    expect(wizardHtml).not.toContain(
      "form.addEventListener('submit',()=>sessionStorage.removeItem(key))",
    );
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
    expect(portraitHtml).toContain("open the picker again to add more");
    expect(portraitHtml).toContain("dataset.additiveSelectionHint");
    expect(portraitHtml).toContain('data-slot="hero"');
    expect(portraitHtml).toContain("Hero slideshow");
    expect(portraitHtml).toContain("editorial gallery");

    const portraitUploadForm = new FormData();
    portraitUploadForm.set("locale", "en");
    portraitUploadForm.set("slot", "hero");
    portraitUploadForm.set("file", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "portrait.jpg", { type: "image/jpeg" }));
    portraitUploadForm.append("file", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "portrait-2.jpg", { type: "image/jpeg" }));
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
    expect(await env.DB.prepare("SELECT COUNT(*) count FROM event_wedding_media WHERE event_id=?").bind(weddingMediaEvent!.id).first())
      .toEqual({ count: 2 });
    const uploadedWeddingMedia = await env.DB.prepare(`SELECT wm.id FROM event_wedding_media wm
      JOIN event_wedding_portrait_assignments p ON p.media_id=wm.id WHERE wm.event_id=? AND p.slot='hero'`)
      .bind(weddingMediaEvent!.id).first<{ id: string }>();
    const anonymousDraftMedia = await SELF.fetch(`https://memboux.com/wedding-media/${uploadedWeddingMedia!.id}`);
    expect(anonymousDraftMedia.status).toBe(404);
    const ownerDraftMedia = await SELF.fetch(`https://memboux.com/wedding-media/${uploadedWeddingMedia!.id}`, {
      headers: { Cookie: cookieHeader },
    });
    expect(ownerDraftMedia.status).toBe(200);
    expect(ownerDraftMedia.headers.get("content-type")).toBe("image/webp");
    expect(ownerDraftMedia.headers.get("x-memboux-media-access")).toBe("preview-only");
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
    expect(await env.DB.prepare("SELECT COUNT(*) count FROM event_wedding_media WHERE event_id=?").bind(weddingMediaEvent!.id).first())
      .toEqual({ count: 1 });
    expect(await env.DB.prepare("SELECT slot FROM event_wedding_portrait_assignments WHERE event_id=?").bind(weddingMediaEvent!.id).first()).toBeNull();
    const remainingWeddingMedia = await env.DB.prepare("SELECT id FROM event_wedding_media WHERE event_id=?")
      .bind(weddingMediaEvent!.id).first<{ id: string }>();
    const deleteRemainingWeddingMediaForm = new FormData();
    deleteRemainingWeddingMediaForm.set("locale", "en");
    const deleteRemainingWeddingMedia = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/media/${remainingWeddingMedia!.id}/delete`, {
      method: "POST",
      headers: { Origin: "https://memboux.com", Cookie: cookieHeader },
      body: deleteRemainingWeddingMediaForm,
      redirect: "manual",
    });
    expect(deleteRemainingWeddingMedia.status).toBe(303);
    expect(await env.DB.prepare("SELECT COUNT(*) count FROM event_wedding_media WHERE event_id=?").bind(weddingMediaEvent!.id).first())
      .toEqual({ count: 0 });

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

    for (const item of [
      { courseType: "main", title: "Garden main", description: "Beef or seasonal vegetables" },
      { courseType: "welcome", title: "Arrival drink", description: "Sparkling wine and lemonade" },
    ]) {
      const createdCourse = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/menu-courses`, {
        method: "POST",
        headers: wizardHeaders,
        body: new URLSearchParams({ locale: "en", ...item }),
        redirect: "manual",
      });
      expect(createdCourse.status).toBe(303);
    }
    const menuWizard = await SELF.fetch(`https://memboux.com/dashboard/${weddingBody.code}/wedding/setup?lang=en&step=4`, {
      headers: { Cookie: cookieHeader },
    });
    const menuWizardHtml = await menuWizard.text();
    expect(menuWizardHtml).toContain('data-menu-course-category="welcome"');
    expect(menuWizardHtml).toContain('data-menu-course-category="drinks"');
    expect(menuWizardHtml).toContain("memboux:wedding-menu-autosaved");
    expect(menuWizardHtml).toContain("Titles and descriptions save automatically.");
    expect(menuWizardHtml).not.toContain(">Save</button>");

    const mainCourse = await env.DB.prepare("SELECT id,sort_order FROM event_wedding_menu_courses WHERE event_id=? AND course_type='main'")
      .bind(weddingMenuEvent!.id).first<{ id: string; sort_order: number }>();
    const autosavedCourse = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/menu-courses/${mainCourse!.id}`, {
      method: "POST",
      headers: { ...wizardHeaders, Accept: "application/json" },
      body: new URLSearchParams({ locale: "en", courseType: "main", title: "Dinner choices", description: "Beef, fish or seasonal vegetables", sortOrder: String(mainCourse!.sort_order) }),
    });
    expect(autosavedCourse.status).toBe(200);
    expect(await autosavedCourse.json()).toEqual({ ok: true });
    expect(await env.DB.prepare("SELECT title,description FROM event_wedding_menu_courses WHERE id=?").bind(mainCourse!.id).first())
      .toEqual({ title: "Dinner choices", description: "Beef, fish or seasonal vegetables" });

    const menuPrint = await SELF.fetch(`https://memboux.com/dashboard/${weddingBody.code}/wedding/menu/print?lang=en`, {
      headers: { Cookie: cookieHeader },
    });
    expect(menuPrint.status).toBe(200);
    const menuPrintHtml = await menuPrint.text();
    expect(menuPrintHtml.indexOf("Welcome")).toBeLessThan(menuPrintHtml.indexOf("Main course"));
    expect(menuPrintHtml.indexOf("Dinner choices")).toBeLessThan(menuPrintHtml.indexOf("Beef, fish or seasonal vegetables"));
    expect(menuPrintHtml).not.toContain(">Dessert</h2>");

    const selected = new URLSearchParams({ locale: "en" });
    selected.append("feature", "rsvp");
    selected.append("feature", "guestbook");
    selected.append("feature", "calendar_links");
    selected.append("feature", "guest_quiz");
    const saveFeatures = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/setup/5`, {
      method: "POST", headers: wizardHeaders, redirect: "manual", body: selected,
    });
    expect(saveFeatures.status).toBe(303);
    const weddingEvent = await env.DB.prepare("SELECT id FROM events WHERE code=?").bind(weddingBody.code).first<{ id: string }>();
    expect(await env.DB.prepare("SELECT estimated_total_minor,wizard_step FROM event_wedding_profiles WHERE event_id=?").bind(weddingEvent!.id).first())
      .toEqual({ estimated_total_minor: 6200, wizard_step: 6 });
    expect(await env.DB.prepare("SELECT rsvp_enabled,guestbook_enabled,slideshow_enabled FROM event_experience_settings WHERE event_id=?").bind(weddingEvent!.id).first())
      .toEqual({ rsvp_enabled: 1, guestbook_enabled: 1, slideshow_enabled: 0 });
    const settingsBypassAttempt = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/experience-settings`, {
      method: "POST", headers: wizardHeaders, redirect: "manual",
      body: new URLSearchParams({ locale: "en", rsvp_enabled: "1", guestbook_enabled: "1", comments_enabled: "1", slideshow_enabled: "1", guestbook_moderation: "1" }),
    });
    expect(settingsBypassAttempt.status).toBe(303);
    expect(await env.DB.prepare("SELECT rsvp_enabled,guestbook_enabled,comments_enabled,slideshow_enabled FROM event_experience_settings WHERE event_id=?").bind(weddingEvent!.id).first())
      .toEqual({ rsvp_enabled: 1, guestbook_enabled: 1, comments_enabled: 1, slideshow_enabled: 0 });

    const finishWizard = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/setup/6`, {
      method: "POST", headers: wizardHeaders, redirect: "manual", body: new URLSearchParams({ locale: "en" }),
    });
    expect(finishWizard.status).toBe(303);
    expect(finishWizard.headers.get("location")).toBe(`/dashboard/${weddingBody.code}?lang=en#overview`);
    const completedWedding = await env.DB.prepare("SELECT wizard_completed_at,publish_status FROM event_wedding_profiles WHERE event_id=?")
      .bind(weddingEvent!.id).first<{ wizard_completed_at: number | null; publish_status: string }>();
    expect(completedWedding?.wizard_completed_at).toBeTypeOf("number");
    expect(completedWedding?.publish_status).toBe("draft");

    const publishBeforeTrial = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/publish`, {
      method: "POST", headers: wizardHeaders, redirect: "manual", body: new URLSearchParams({ locale: "en" }),
    });
    expect(publishBeforeTrial.status).toBe(409);

    const ownerCalendar = await SELF.fetch(`https://memboux.com/wedding/${weddingBody.code}/calendar/ceremony.ics?lang=en`, {
      headers: { Cookie: cookieHeader },
    });
    expect(ownerCalendar.status).toBe(200);
    expect(ownerCalendar.headers.get("content-type")).toContain("text/calendar");
    expect(ownerCalendar.headers.get("content-disposition")).toContain(`${weddingBody.code.toLowerCase()}-ceremony.ics`);
    const ownerCalendarText = await ownerCalendar.text();
    expect(ownerCalendarText).toContain("DTSTART:20270522T170000");
    expect(ownerCalendarText).toContain("SUMMARY:Wedding ceremony — Alex & Sam");
    expect(ownerCalendarText).toContain("LOCATION:Chapel");

    const anonymousCalendar = await SELF.fetch(`https://memboux.com/wedding/${weddingBody.code}/calendar/ceremony.ics?lang=en`);
    expect(anonymousCalendar.status).not.toBe(200);

    await env.DB.batch([
      ...Array.from({ length: 49 }, (_, index) =>
        env.DB.prepare("INSERT INTO media (id,event_id,object_key) VALUES (?,?,?)")
          .bind(`trial-cap-${index}`, weddingEvent!.id, `trial/cap-${index}.jpg`)),
      env.DB.prepare(`INSERT INTO event_wedding_media
        (id,event_id,object_key,media_type,content_type,size_bytes,uploaded_at)
        VALUES (?,?,?,?,?,?,?)`)
        .bind("trial-wedding-1", weddingEvent!.id, "trial/wedding-1.jpg", "image", "image/jpeg", 100, Date.now()),
      env.DB.prepare(`INSERT INTO event_wedding_media
        (id,event_id,object_key,media_type,content_type,size_bytes,uploaded_at)
        VALUES (?,?,?,?,?,?,?)`)
        .bind("trial-wedding-2", weddingEvent!.id, "trial/wedding-2.mp4", "video", "video/mp4", 100, Date.now()),
    ]);
    const trialReview = await SELF.fetch(`https://memboux.com/dashboard/${weddingBody.code}/trial?lang=en`, {
      headers: { Cookie: cookieHeader },
      redirect: "manual",
    });
    expect(trialReview.status).toBe(302);
    expect(trialReview.headers.get("location")).toBe(`/dashboard/${weddingBody.code}?lang=en#package-access-title`);

    const overCapacityTrial = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/checkout/start-trial`, {
      method: "POST",
      headers: wizardHeaders,
      body: new URLSearchParams({ locale: "en", productKey: "event_pass" }),
      redirect: "manual",
    });
    expect(overCapacityTrial.status).toBe(409);
    expect(await env.DB.prepare("SELECT access_state FROM event_access WHERE event_id=?").bind(weddingEvent!.id).first())
      .toEqual({ access_state: "preview" });
    await env.DB.prepare("DELETE FROM media WHERE event_id=?").bind(weddingEvent!.id).run();
    await env.DB.prepare("DELETE FROM event_wedding_media WHERE event_id=?").bind(weddingEvent!.id).run();

    const invalidProductTrial = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/checkout/start-trial`, {
      method: "POST",
      headers: wizardHeaders,
      body: new URLSearchParams({ locale: "en", productKey: "missing" }),
      redirect: "manual",
    });
    expect(invalidProductTrial.status).toBe(400);
    expect(await env.DB.prepare("SELECT access_state FROM event_access WHERE event_id=?").bind(weddingEvent!.id).first())
      .toEqual({ access_state: "preview" });

    const confirmedTrial = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/checkout/start-trial`, {
      method: "POST",
      headers: wizardHeaders,
      body: new URLSearchParams({ locale: "en", productKey: "event_pass" }),
      redirect: "manual",
    });
    expect(confirmedTrial.status).toBe(303);
    expect(await env.DB.prepare("SELECT status,total_minor FROM commerce_orders WHERE event_id=?").bind(weddingEvent!.id).first())
      .toEqual({ status: "draft", total_minor: 1900 });
    expect(await env.DB.prepare("SELECT access_state,guest_access_enabled,guest_uploads_enabled,original_downloads_enabled FROM event_access WHERE event_id=?").bind(weddingEvent!.id).first())
      .toEqual({ access_state: "trial", guest_access_enabled: 1, guest_uploads_enabled: 1, original_downloads_enabled: 0 });

    const draftRsvp = await SELF.fetch(`https://memboux.com/api/gallery/${weddingBody.code}/rsvp`, {
      method: "POST", headers: { Origin: "https://memboux.com" },
      body: new URLSearchParams({ locale: "en", name: "Hidden guest", email: "hidden@example.com", response: "yes", guestCount: "1" }),
    });
    expect(draftRsvp.status).toBe(404);

    const publishWedding = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/publish`, {
      method: "POST", headers: wizardHeaders, redirect: "manual", body: new URLSearchParams({ locale: "en" }),
    });
    expect(publishWedding.status).toBe(303);
    expect(await env.DB.prepare("SELECT publish_status FROM event_wedding_profiles WHERE event_id=?").bind(weddingEvent!.id).first())
      .toEqual({ publish_status: "published" });

    const createGroup = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/guest-groups`, {
      method: "POST", headers: wizardHeaders, redirect: "manual", body: new URLSearchParams({ locale: "en", name: "Friends" }),
    });
    expect(createGroup.status).toBe(303);
    const guestGroup = await env.DB.prepare("SELECT id FROM event_wedding_guest_groups WHERE event_id=?").bind(weddingEvent!.id).first<{ id: string }>();
    const createGuest = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/guests`, {
      method: "POST", headers: wizardHeaders, redirect: "manual",
      body: new URLSearchParams({ locale: "en", firstName: "Jamie", lastName: "Guest", email: "jamie@example.com", groupId: guestGroup!.id, plusOneLimit: "1", ceremony: "1", reception: "1" }),
    });
    expect(createGuest.status).toBe(303);
    const weddingGuest = await env.DB.prepare("SELECT id FROM event_wedding_guests WHERE event_id=? AND email=?")
      .bind(weddingEvent!.id, "jamie@example.com").first<{ id: string }>();
    const guestPlanner = await SELF.fetch(`https://memboux.com/dashboard/${weddingBody.code}/wedding/guests?lang=en`, {
      headers: { Cookie: cookieHeader },
    });
    expect(guestPlanner.status).toBe(200);
    const guestPlannerHtml = await guestPlanner.text();
    expect(guestPlannerHtml).toContain("Search and bulk import");
    expect(guestPlannerHtml).toContain('name="guestFile"');
    expect(guestPlannerHtml).toContain("Download CSV / template");
    expect(guestPlannerHtml).toContain("Send invitations (1)");
    expect(guestPlannerHtml).toContain("Print / PDF seating plan");
    expect(guestPlannerHtml).toContain("Edit groups");
    expect(guestPlannerHtml).toContain("data-guest-quick");
    expect(guestPlannerHtml).toContain('data-field="group"');
    expect(guestPlannerHtml).toContain('data-field="rsvp"');
    expect(guestPlannerHtml).toContain('data-field="table"');
    expect(guestPlannerHtml).toContain("data-guest-toast");
    expect(guestPlannerHtml).toContain("/quick-update");

    const renameGroup = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/guest-groups/${guestGroup!.id}`, {
      method: "POST", headers: wizardHeaders, redirect: "manual", body: new URLSearchParams({ locale: "en", name: "Close friends" }),
    });
    expect(renameGroup.status).toBe(303);
    expect(await env.DB.prepare("SELECT name FROM event_wedding_guest_groups WHERE id=?").bind(guestGroup!.id).first())
      .toEqual({ name: "Close friends" });

    const uploadHeaders = { Origin: "https://memboux.com", Cookie: cookieHeader };
    const invalidImportForm = new FormData();
    invalidImportForm.set("locale", "en");
    invalidImportForm.set("guestFile", new File([
      "first_name,last_name,email,phone,group,plus_one_limit,ceremony,reception\nInvalid,,not-an-email,,Friends,0,yes,yes",
    ], "invalid.csv", { type: "text/csv" }));
    const invalidImport = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/guests/import`, {
      method: "POST", headers: uploadHeaders, body: invalidImportForm,
    });
    expect(invalidImport.status).toBe(400);
    expect(await env.DB.prepare("SELECT COUNT(*) count FROM event_wedding_guests WHERE event_id=?").bind(weddingEvent!.id).first())
      .toEqual({ count: 1 });

    const duplicateImportForm = new FormData();
    duplicateImportForm.set("locale", "en");
    duplicateImportForm.set("guestFile", new File([
      "first_name,last_name,email,phone,group,plus_one_limit,ceremony,reception\nJamie,Duplicate,jamie@example.com,,Friends,0,yes,yes\nShould,Rollback,rollback@example.com,,Friends,0,yes,yes",
    ], "duplicate.csv", { type: "text/csv" }));
    const duplicateImport = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/guests/import`, {
      method: "POST", headers: uploadHeaders, body: duplicateImportForm,
    });
    expect(duplicateImport.status).toBe(409);
    expect(await env.DB.prepare("SELECT id FROM event_wedding_guests WHERE event_id=? AND email='rollback@example.com'").bind(weddingEvent!.id).first()).toBeNull();

    const bulkRows = Array.from({ length: 200 }, (_, index) =>
      `Bulk ${String(index).padStart(3, "0")},Guest,bulk-${index}@example.com,,Imported ${index},0,yes,yes`).join("\n");
    const validImportForm = new FormData();
    validImportForm.set("locale", "en");
    validImportForm.set("guestFile", new File([
      `first_name,last_name,email,phone,group,plus_one_limit,ceremony,reception\n${bulkRows}`,
    ], "guests.csv", { type: "text/csv" }));
    const validImport = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/guests/import`, {
      method: "POST", headers: uploadHeaders, body: validImportForm, redirect: "manual",
    });
    expect(validImport.status).toBe(303);
    expect(validImport.headers.get("location")).toContain("imported=200");
    expect(await env.DB.prepare("SELECT COUNT(*) count FROM event_wedding_guests WHERE event_id=?").bind(weddingEvent!.id).first())
      .toEqual({ count: 201 });
    expect(await env.DB.prepare("SELECT COUNT(*) count FROM event_wedding_guest_groups WHERE event_id=? AND name LIKE 'Imported %'").bind(weddingEvent!.id).first())
      .toEqual({ count: 200 });

    const searchedGuests = await SELF.fetch(`https://memboux.com/dashboard/${weddingBody.code}/wedding/guests?lang=en&q=Bulk%20199`, {
      headers: { Cookie: cookieHeader },
    });
    const searchedHtml = await searchedGuests.text();
    expect(searchedGuests.status).toBe(200);
    expect(searchedHtml).toContain("Bulk 199");
    expect(searchedHtml).toContain("1 guests");
    expect(searchedHtml).not.toContain("Bulk 198");

    const secondGuestPage = await SELF.fetch(`https://memboux.com/dashboard/${weddingBody.code}/wedding/guests?lang=en&page=2`, {
      headers: { Cookie: cookieHeader },
    });
    const secondGuestPageHtml = await secondGuestPage.text();
    expect(secondGuestPage.status).toBe(200);
    expect(secondGuestPageHtml).toContain("2 / 5");
    expect(secondGuestPageHtml).toContain("Previous");

    const guestExport = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/guests/export`, {
      headers: { Cookie: cookieHeader },
    });
    expect(guestExport.status).toBe(200);
    expect(guestExport.headers.get("content-type")).toContain("text/csv");
    expect(guestExport.headers.get("content-disposition")).toContain("attachment");
    expect(guestExport.headers.get("cache-control")).toBe("private, no-store");
    const guestExportCsv = await guestExport.text();
    expect(guestExportCsv).toContain("first_name,last_name,email,phone,group,plus_one_limit,ceremony,reception");
    expect(guestExportCsv).toContain("Bulk 199,Guest,bulk-199@example.com,,Imported 199,0,yes,yes");
    const createTable = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/tables`, {
      method: "POST", headers: wizardHeaders, redirect: "manual", body: new URLSearchParams({ locale: "en", name: "Table 1", shape: "round", capacity: "10" }),
    });
    expect(createTable.status).toBe(303);
    const weddingTable = await env.DB.prepare("SELECT id FROM event_wedding_tables WHERE event_id=?").bind(weddingEvent!.id).first<{ id: string }>();
    const assignSeat = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/seating`, {
      method: "POST", headers: wizardHeaders, redirect: "manual", body: new URLSearchParams({ locale: "en", guestId: weddingGuest!.id, tableId: weddingTable!.id }),
    });
    expect(assignSeat.status).toBe(303);
    expect(await env.DB.prepare("SELECT table_id FROM event_wedding_seat_assignments WHERE guest_id=?").bind(weddingGuest!.id).first())
      .toEqual({ table_id: weddingTable!.id });
    const removeGuestGroup = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/guests/${weddingGuest!.id}/quick-update`, {
      method: "POST", headers: wizardHeaders,
      body: new URLSearchParams({ locale: "en", field: "group", value: "" }),
    });
    expect(removeGuestGroup.status).toBe(200);
    expect((await removeGuestGroup.json<{ guest: { group_id: string | null } }>()).guest.group_id).toBeNull();
    const restoreGuestGroup = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/guests/${weddingGuest!.id}/quick-update`, {
      method: "POST", headers: wizardHeaders,
      body: new URLSearchParams({ locale: "en", field: "group", value: guestGroup!.id }),
    });
    expect(restoreGuestGroup.status).toBe(200);
    const updateTable = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/tables/${weddingTable!.id}`, {
      method: "POST", headers: wizardHeaders, redirect: "manual",
      body: new URLSearchParams({ locale: "en", name: "Family table", shape: "oval", capacity: "12" }),
    });
    expect(updateTable.status).toBe(303);
    expect(await env.DB.prepare("SELECT name,shape,capacity FROM event_wedding_tables WHERE id=?").bind(weddingTable!.id).first())
      .toEqual({ name: "Family table", shape: "oval", capacity: 12 });
    const seatingPlan = await SELF.fetch(`https://memboux.com/dashboard/${weddingBody.code}/wedding/guests/seating-plan?lang=en`, {
      headers: { Cookie: cookieHeader },
    });
    const seatingPlanHtml = await seatingPlan.text();
    expect(seatingPlan.status).toBe(200);
    expect(seatingPlanHtml).toContain("Print / Save as PDF");
    expect(seatingPlanHtml).toContain("Family table");
    expect(seatingPlanHtml).toContain("Last name");
    expect(seatingPlanHtml).toContain("First name");
    expect(seatingPlanHtml).toContain(">Guest</strong>");
    expect(seatingPlanHtml).toContain(">Jamie</td>");
    expect(seatingPlanHtml).not.toContain("jamie@example.com");

    const createInviteLink = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/guests/${weddingGuest!.id}/invite-link`, {
      method: "POST", headers: wizardHeaders, redirect: "manual", body: new URLSearchParams({ locale: "en" }),
    });
    expect(createInviteLink.status).toBe(303);
    const inviteLocation = new URL(createInviteLink.headers.get("location")!, "https://memboux.com");
    const invitationToken = inviteLocation.searchParams.get("invite");
    expect(invitationToken).toBeTruthy();
    const invitationPage = await SELF.fetch(`https://memboux.com/wedding/${weddingBody.code}/invite/${encodeURIComponent(invitationToken!)}?lang=en`);
    expect(invitationPage.status).toBe(200);
    expect(await invitationPage.text()).toContain("Personal invitation");
    const invitedRsvp = await SELF.fetch(`https://memboux.com/api/gallery/${weddingBody.code}/rsvp`, {
      method: "POST", headers: { Origin: "https://memboux.com" }, redirect: "manual",
      body: new URLSearchParams({ locale: "en", invitationToken: invitationToken!, response: "yes", guestCount: "2", dietaryNotes: "Vegetarian" }),
    });
    expect(invitedRsvp.status).toBe(303);
    expect(await env.DB.prepare("SELECT rsvp_status,party_size,dietary_notes FROM event_wedding_guests WHERE id=?").bind(weddingGuest!.id).first())
      .toEqual({ rsvp_status: "yes", party_size: 2, dietary_notes: "Vegetarian" });
    const createSmallTable = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/tables`, {
      method: "POST", headers: wizardHeaders, redirect: "manual",
      body: new URLSearchParams({ locale: "en", name: "Small table", shape: "round", capacity: "1" }),
    });
    expect(createSmallTable.status).toBe(303);
    const smallTable = await env.DB.prepare("SELECT id FROM event_wedding_tables WHERE event_id=? AND name='Small table'")
      .bind(weddingEvent!.id).first<{ id: string }>();
    const fullTableUpdate = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/guests/${weddingGuest!.id}/quick-update`, {
      method: "POST", headers: wizardHeaders,
      body: new URLSearchParams({ locale: "en", field: "table", value: smallTable!.id }),
    });
    expect(fullTableUpdate.status).toBe(409);
    expect(await fullTableUpdate.text()).toContain("not enough seats");
    const declineGuest = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/guests/${weddingGuest!.id}/quick-update`, {
      method: "POST", headers: wizardHeaders,
      body: new URLSearchParams({ locale: "en", field: "rsvp", value: "no" }),
    });
    expect(declineGuest.status).toBe(200);
    expect((await declineGuest.json<{ guest: { rsvp_status: string; table_id: string | null }; assignedGuestCount: number }>()))
      .toMatchObject({ guest: { rsvp_status: "no", table_id: null }, assignedGuestCount: 0 });
    expect(await env.DB.prepare("SELECT response FROM event_rsvps WHERE wedding_guest_id=?").bind(weddingGuest!.id).first())
      .toEqual({ response: "no" });
    const attendGuest = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/guests/${weddingGuest!.id}/quick-update`, {
      method: "POST", headers: wizardHeaders,
      body: new URLSearchParams({ locale: "en", field: "rsvp", value: "yes" }),
    });
    expect(attendGuest.status).toBe(200);
    const restoreSeat = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/guests/${weddingGuest!.id}/quick-update`, {
      method: "POST", headers: wizardHeaders,
      body: new URLSearchParams({ locale: "en", field: "table", value: weddingTable!.id }),
    });
    expect(restoreSeat.status).toBe(200);
    expect(await restoreSeat.json()).toMatchObject({ assignedGuestCount: 1 });
    const undersizedTable = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/tables/${weddingTable!.id}`, {
      method: "POST", headers: wizardHeaders,
      body: new URLSearchParams({ locale: "en", name: "Family table", shape: "oval", capacity: "1" }),
    });
    expect(undersizedTable.status).toBe(409);
    expect(await undersizedTable.text()).toContain("already has 2 assigned seats");
    const editGuest = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/guests/${weddingGuest!.id}`, {
      method: "POST", headers: wizardHeaders, redirect: "manual",
      body: new URLSearchParams({ locale: "en", firstName: "Jamie", lastName: "Updated", email: "jamie-updated@example.com", groupId: guestGroup!.id, plusOneLimit: "1", rsvpStatus: "maybe", partySize: "1", dietaryNotes: "Owner assisted", ceremony: "1", reception: "1" }),
    });
    expect(editGuest.status).toBe(303);
    expect(await env.DB.prepare("SELECT response,guest_count,dietary_notes,email FROM event_rsvps WHERE wedding_guest_id=?").bind(weddingGuest!.id).first())
      .toEqual({ response: "maybe", guest_count: 1, dietary_notes: "Owner assisted", email: "jamie-updated@example.com" });
    const repeatedInvitedRsvp = await SELF.fetch(`https://memboux.com/api/gallery/${weddingBody.code}/rsvp`, {
      method: "POST", headers: { Origin: "https://memboux.com" }, redirect: "manual",
      body: new URLSearchParams({ locale: "en", invitationToken: invitationToken!, response: "no", guestCount: "1" }),
    });
    expect(repeatedInvitedRsvp.status).toBe(303);
    expect(await env.DB.prepare("SELECT COUNT(*) count FROM event_rsvps WHERE wedding_guest_id=?").bind(weddingGuest!.id).first())
      .toEqual({ count: 1 });
    expect(await env.DB.prepare("SELECT first_name,last_name,email,rsvp_status,party_size FROM event_wedding_guests WHERE id=?").bind(weddingGuest!.id).first())
      .toEqual({ first_name: "Jamie", last_name: "Updated", email: "jamie-updated@example.com", rsvp_status: "no", party_size: 1 });
    expect(await env.DB.prepare("SELECT table_id FROM event_wedding_seat_assignments WHERE guest_id=?").bind(weddingGuest!.id).first()).toBeNull();
    const deleteGuest = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/guests/${weddingGuest!.id}/delete`, {
      method: "POST", headers: wizardHeaders, redirect: "manual", body: new URLSearchParams({ locale: "en" }),
    });
    expect(deleteGuest.status).toBe(303);
    expect(await env.DB.prepare("SELECT id FROM event_wedding_guests WHERE id=?").bind(weddingGuest!.id).first()).toBeNull();
    expect(await env.DB.prepare("SELECT id FROM event_rsvps WHERE wedding_guest_id=?").bind(weddingGuest!.id).first()).toBeNull();
    const deleteTable = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/tables/${weddingTable!.id}/delete`, {
      method: "POST", headers: wizardHeaders, redirect: "manual", body: new URLSearchParams({ locale: "en" }),
    });
    expect(deleteTable.status).toBe(303);
    expect(await env.DB.prepare("SELECT id FROM event_wedding_tables WHERE id=?").bind(weddingTable!.id).first()).toBeNull();
    const deleteGroup = await SELF.fetch(`https://memboux.com/api/account/events/${weddingBody.code}/wedding/guest-groups/${guestGroup!.id}/delete`, {
      method: "POST", headers: wizardHeaders, redirect: "manual", body: new URLSearchParams({ locale: "en" }),
    });
    expect(deleteGroup.status).toBe(303);
    expect(await env.DB.prepare("SELECT id FROM event_wedding_guest_groups WHERE id=?").bind(guestGroup!.id).first()).toBeNull();
    const repeatedTrial = await SELF.fetch(`https://memboux.com/dashboard/${weddingBody.code}/trial?lang=en`, {
      headers: { Cookie: cookieHeader },
      redirect: "manual",
    });
    expect(repeatedTrial.status).toBe(302);

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

  }, 25_000);
});
