import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

const code = "EVT901";
const eventId = "event-route-boundary";

beforeAll(async () => {
  const now = Date.now();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    couple TEXT NOT NULL,
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
  )`).run();
  await env.DB.prepare(`
    INSERT OR REPLACE INTO events (
      id, code, couple, eventName, admin_token_hash, created_at, expires_at,
      status, notes, updated_at, default_locale, event_start_date, event_end_date,
      deleted_at, purge_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', '', ?, 'en', ?, ?, NULL, NULL)
  `).bind(
    eventId,
    code,
    "Boundary event",
    "Boundary event",
    "legacy-token-hash",
    now,
    now + 86_400_000,
    now,
    "2026-07-13",
    "2026-07-13",
  ).run();
});

describe("event route boundaries", () => {
  it.each([
    `/dashboard/${code}`,
    `/dashboard/${code}/edit`,
    `/dashboard/${code}/professional`,
    `/dashboard/${code}/media/11111111-1111-4111-8111-111111111111`,
  ])("redirects anonymous owner page %s to login", async (path) => {
    const response = await SELF.fetch(`https://memboux.com${path}?lang=en`, {
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/en/login");
  });

  it.each([
    `/api/account/events/${code}/privacy`,
    `/api/account/events/${code}/details`,
    `/api/account/events/${code}/invite`,
    `/api/account/events/${code}/members/remove`,
    `/api/account/events/${code}/professional/assign`,
    `/api/account/events/${code}/professional/revoke`,
    `/api/account/events/${code}/media/11111111-1111-4111-8111-111111111111/rename`,
    `/api/account/events/${code}/media/11111111-1111-4111-8111-111111111111/trash`,
    `/api/account/events/${code}/media/bulk-trash`,
    `/api/account/events/${code}/media/11111111-1111-4111-8111-111111111111/restore`,
  ])("rejects anonymous event mutation %s", async (path) => {
    const response = await SELF.fetch(`https://memboux.com${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: "en" }),
      redirect: "manual",
    });

    expect(response.status).toBe(401);
  });

  it("removes the obsolete anonymous event-creation endpoint", async () => {
    const response = await SELF.fetch("https://memboux.com/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventName: "Anonymous event" }),
      redirect: "manual",
    });

    expect(response.status).toBe(404);
  });
});
