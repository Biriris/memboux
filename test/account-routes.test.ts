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
    ["/api/account/trash/restore", { ids: "" }],
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
        eventStartDate: "2026-06-15",
        eventEndDate: "2026-06-28",
      }),
      redirect: "manual",
    });

    expect(create.status).toBe(201);
    expect(await create.json()).toMatchObject({
      status: true,
      redirect: "/en/account",
    });

    const user = await env.DB.prepare('SELECT id FROM "user" WHERE email=?')
      .bind(email)
      .first<{ id: string }>();
    expect(user?.id).toBeTruthy();

    const event = await env.DB.prepare(
      'SELECT e.eventName,e.default_locale,em.role FROM events e JOIN event_members em ON em.event_id=e.id WHERE em.user_id=? ORDER BY e.created_at DESC LIMIT 1',
    )
      .bind(user!.id)
      .first<{ eventName: string; default_locale: string; role: string }>();

    expect(event).toEqual({
      eventName: "Island trip",
      default_locale: "en",
      role: "owner",
    });
  });
});
