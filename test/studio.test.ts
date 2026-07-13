import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import {
  canManageOfficialAlbum,
  getProfessionalAssignment,
  getProfessionalProfile,
  validProfessionalSlug,
} from "../src/studio";

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE professional_profiles (
      user_id TEXT PRIMARY KEY, business_name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
      bio TEXT NOT NULL DEFAULT '', website TEXT, status TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE event_professional_assignments (
      event_id TEXT NOT NULL, professional_user_id TEXT NOT NULL, assigned_by TEXT NOT NULL,
      status TEXT NOT NULL, created_at INTEGER NOT NULL, accepted_at INTEGER,
      updated_at INTEGER NOT NULL, PRIMARY KEY (event_id,professional_user_id)
    )`),
    env.DB.prepare("INSERT INTO professional_profiles VALUES (?,?,?,?,?,?,?,?)").bind(
      "pro-1", "Northlight Studio", "northlight-studio", "Events", null, "active", 1, 1,
    ),
    env.DB.prepare("INSERT INTO event_professional_assignments VALUES (?,?,?,?,?,?,?)").bind(
      "event-accepted", "pro-1", "owner-1", "accepted", 1, 2, 2,
    ),
    env.DB.prepare("INSERT INTO event_professional_assignments VALUES (?,?,?,?,?,?,?)").bind(
      "event-invited", "pro-1", "owner-2", "invited", 1, null, 1,
    ),
  ]);
});

describe("professional studio permissions", () => {
  it("keeps studio pages and mutations private", async () => {
    const page = await SELF.fetch("https://memboux.com/studio?lang=en", { redirect: "manual" });
    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toBe("/en/login");

    const media = await SELF.fetch("https://memboux.com/studio/media/media-1");
    expect(media.status).toBe(401);

    const mutation = await SELF.fetch("https://memboux.com/studio/assignments/event-1/accept", {
      method: "POST",
      headers: { Origin: "https://memboux.com" },
    });
    expect(mutation.status).toBe(401);
  });

  it("loads an approved professional profile", async () => {
    const profile = await getProfessionalProfile(env.DB, "pro-1");
    expect(profile?.business_name).toBe("Northlight Studio");
    expect(profile?.status).toBe("active");
  });

  it("permits only accepted event assignments", async () => {
    expect(await canManageOfficialAlbum(env.DB, "event-accepted", "pro-1")).toBe(true);
    expect(await canManageOfficialAlbum(env.DB, "event-invited", "pro-1")).toBe(false);
    expect(await canManageOfficialAlbum(env.DB, "event-accepted", "different-pro")).toBe(false);
    expect(await getProfessionalAssignment(env.DB, "event-invited", "pro-1", "invited"))
      .toMatchObject({ status: "invited" });
  });

  it("accepts URL-safe slugs and rejects ambiguous ones", () => {
    expect(validProfessionalSlug("northlight-studio")).toBe(true);
    expect(validProfessionalSlug("Northlight Studio")).toBe(false);
    expect(validProfessionalSlug("-studio-")).toBe(false);
    expect(validProfessionalSlug("x")).toBe(false);
  });
});
