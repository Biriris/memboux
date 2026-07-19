import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { changeEventPersonRole, changePendingInvitationRole, removeEventPersonAccess } from "../src/event-people";

const now = 1_752_700_000_000;

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DROP TABLE IF EXISTS event_professional_assignments"),
    env.DB.prepare("DROP TABLE IF EXISTS professional_profiles"),
    env.DB.prepare("DROP TABLE IF EXISTS event_invitations"),
    env.DB.prepare("DROP TABLE IF EXISTS event_members"),
    env.DB.prepare('DROP TABLE IF EXISTS "user"'),
    env.DB.prepare('CREATE TABLE "user" (id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE)'),
    env.DB.prepare("CREATE TABLE event_members (event_id TEXT,user_id TEXT,role TEXT,created_at INTEGER,PRIMARY KEY(event_id,user_id))"),
    env.DB.prepare("CREATE TABLE professional_profiles (user_id TEXT PRIMARY KEY,business_name TEXT,slug TEXT UNIQUE,bio TEXT,website TEXT,status TEXT,created_at INTEGER,updated_at INTEGER)"),
    env.DB.prepare("CREATE TABLE event_professional_assignments (event_id TEXT,professional_user_id TEXT,assigned_by TEXT,status TEXT,created_at INTEGER,accepted_at INTEGER,updated_at INTEGER,PRIMARY KEY(event_id,professional_user_id))"),
    env.DB.prepare("CREATE TABLE event_invitations (id TEXT PRIMARY KEY,event_id TEXT,email TEXT,role TEXT,invitation_kind TEXT,accepted_at INTEGER,declined_at INTEGER,expires_at INTEGER)"),
    env.DB.prepare('INSERT INTO "user" VALUES (?,?,?)').bind("owner-1", "Owner", "owner@example.com"),
    env.DB.prepare('INSERT INTO "user" VALUES (?,?,?)').bind("person-1", "Person One", "person@example.com"),
  ]);
});

describe("event people role management", () => {
  it("moves a member into the Professional role and Studio access", async () => {
    await env.DB.prepare("INSERT INTO event_members VALUES (?,?,?,?)").bind("event-1", "person-1", "viewer", now).run();

    expect(await changeEventPersonRole(env.DB, {
      eventId: "event-1", userId: "person-1", assignedBy: "owner-1", role: "professional", now: now + 1,
    })).toBe(true);

    expect(await env.DB.prepare("SELECT role FROM event_members WHERE user_id='person-1'").first()).toBeNull();
    expect(await env.DB.prepare("SELECT status FROM professional_profiles WHERE user_id='person-1'").first()).toEqual({ status: "active" });
    expect(await env.DB.prepare("SELECT status FROM event_professional_assignments WHERE professional_user_id='person-1'").first()).toEqual({ status: "accepted" });
  });

  it("moves a Professional back to Manager and revokes Studio access", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO professional_profiles VALUES (?,?,?,?,?,?,?,?)").bind("person-1", "Person Studio", "person-studio", "", null, "active", now, now),
      env.DB.prepare("INSERT INTO event_professional_assignments VALUES (?,?,?,?,?,?,?)").bind("event-1", "person-1", "owner-1", "accepted", now, now, now),
    ]);

    expect(await changeEventPersonRole(env.DB, {
      eventId: "event-1", userId: "person-1", assignedBy: "owner-1", role: "editor", now: now + 1,
    })).toBe(true);

    expect(await env.DB.prepare("SELECT role FROM event_members WHERE user_id='person-1'").first()).toEqual({ role: "editor" });
    expect(await env.DB.prepare("SELECT status FROM event_professional_assignments WHERE professional_user_id='person-1'").first()).toEqual({ status: "revoked" });
  });

  it("removes every kind of event access but never removes the owner", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO event_members VALUES (?,?,?,?)").bind("event-1", "owner-1", "owner", now),
      env.DB.prepare("INSERT INTO event_members VALUES (?,?,?,?)").bind("event-1", "person-1", "viewer", now),
      env.DB.prepare("INSERT INTO professional_profiles VALUES (?,?,?,?,?,?,?,?)").bind("person-1", "Person Studio", "person-studio", "", null, "active", now, now),
      env.DB.prepare("INSERT INTO event_professional_assignments VALUES (?,?,?,?,?,?,?)").bind("event-1", "person-1", "owner-1", "accepted", now, now, now),
    ]);

    expect(await removeEventPersonAccess(env.DB, "event-1", "person-1", now + 1)).toBe(true);
    expect(await env.DB.prepare("SELECT 1 FROM event_members WHERE user_id='person-1'").first()).toBeNull();
    expect(await env.DB.prepare("SELECT status FROM event_professional_assignments WHERE professional_user_id='person-1'").first()).toEqual({ status: "revoked" });
    expect(await removeEventPersonAccess(env.DB, "event-1", "owner-1", now + 2)).toBe(false);
    expect(await env.DB.prepare("SELECT role FROM event_members WHERE user_id='owner-1'").first()).toEqual({ role: "owner" });
  });

  it("changes the role of a pending invitation in place", async () => {
    await env.DB.prepare("INSERT INTO event_invitations VALUES (?,?,?,?,?,?,?,?)")
      .bind("invite-1", "event-1", "new@example.com", "viewer", "member", null, null, Date.now() + 100_000)
      .run();

    expect(await changePendingInvitationRole(env.DB, "event-1", "invite-1", "professional")).toBe(true);
    expect(await env.DB.prepare("SELECT role,invitation_kind FROM event_invitations WHERE id='invite-1'").first())
      .toEqual({ role: "viewer", invitation_kind: "professional" });
  });
});
