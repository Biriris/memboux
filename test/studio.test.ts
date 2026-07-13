import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import {
  canManageOfficialAlbum,
  getProfessionalAssignment,
  getProfessionalProfile,
  trashProfessionalMedia,
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
    env.DB.prepare(`CREATE TABLE media (
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL, origin TEXT NOT NULL,
      uploaded_by_user_id TEXT, deleted_at INTEGER, purge_at INTEGER
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
    env.DB.prepare("INSERT INTO media VALUES (?,?,?,?,NULL,NULL)").bind(
      "11111111-1111-4111-8111-111111111111", "event-accepted", "official", "pro-1",
    ),
    env.DB.prepare("INSERT INTO media VALUES (?,?,?,?,NULL,NULL)").bind(
      "22222222-2222-4222-8222-222222222222", "event-accepted", "official", "different-pro",
    ),
    env.DB.prepare("INSERT INTO media VALUES (?,?,?,?,NULL,NULL)").bind(
      "33333333-3333-4333-8333-333333333333", "event-accepted", "guest", "pro-1",
    ),
    env.DB.prepare("INSERT INTO media VALUES (?,?,?,?,NULL,NULL)").bind(
      "44444444-4444-4444-8444-444444444444", "event-invited", "official", "pro-1",
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

    const trash = await SELF.fetch("https://memboux.com/studio/trash?lang=en", {
      redirect: "manual",
    });
    expect(trash.status).toBe(302);
    expect(trash.headers.get("location")).toBe("/en/login");

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

  it("trashes only the professional's own official uploads in accepted events", async () => {
    const ids = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ];
    const changed = await trashProfessionalMedia(env.DB, "event-accepted", "pro-1", ids, 100, 200);
    expect(changed).toBe(1);

    const rows = await env.DB.prepare(
      "SELECT id,deleted_at,purge_at FROM media WHERE event_id='event-accepted' ORDER BY id",
    ).all<{ id: string; deleted_at: number | null; purge_at: number | null }>();
    expect(rows.results).toEqual([
      { id: ids[0], deleted_at: 100, purge_at: 200 },
      { id: ids[1], deleted_at: null, purge_at: null },
      { id: ids[2], deleted_at: null, purge_at: null },
    ]);

    const invited = await trashProfessionalMedia(
      env.DB,
      "event-invited",
      "pro-1",
      ["44444444-4444-4444-8444-444444444444"],
      100,
      200,
    );
    expect(invited).toBe(0);
  });

  it("accepts URL-safe slugs and rejects ambiguous ones", () => {
    expect(validProfessionalSlug("northlight-studio")).toBe(true);
    expect(validProfessionalSlug("Northlight Studio")).toBe(false);
    expect(validProfessionalSlug("-studio-")).toBe(false);
    expect(validProfessionalSlug("x")).toBe(false);
  });
});
