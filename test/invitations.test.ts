import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { acceptPendingInvitations, createOrReplaceInvitation, normalizeInviteRole } from "../src/invitations";

const now = 1_800_000_000_000;

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DROP TABLE IF EXISTS event_invitations"),
    env.DB.prepare("DROP TABLE IF EXISTS event_members"),
    env.DB.prepare("DROP TABLE IF EXISTS events"),
    env.DB.prepare('DROP TABLE IF EXISTS "user"'),
    env.DB.prepare('CREATE TABLE "user" (id TEXT PRIMARY KEY,email TEXT NOT NULL)'),
    env.DB.prepare("CREATE TABLE events (id TEXT PRIMARY KEY)"),
    env.DB.prepare(`CREATE TABLE event_members (
      event_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (event_id,user_id)
    )`),
    env.DB.prepare(`CREATE TABLE event_invitations (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('editor','viewer')),
      invited_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      accepted_at INTEGER,
      UNIQUE (event_id,email)
    )`),
    env.DB.prepare('INSERT INTO "user" (id,email) VALUES (?,?)').bind("owner-1", "owner@memboux.test"),
    env.DB.prepare("INSERT INTO events (id) VALUES (?)").bind("event-1"),
  ]);
});

describe("invitation roles", () => {
  it("accepts only the supported viewer role and defaults everything else to editor", () => {
    expect(normalizeInviteRole("viewer")).toBe("viewer");
    expect(normalizeInviteRole("editor")).toBe("editor");
    expect(normalizeInviteRole("owner")).toBe("editor");
    expect(normalizeInviteRole(undefined)).toBe("editor");
  });
});

describe("invitation persistence", () => {
  it("normalizes email and safely replaces a pending invitation role", async () => {
    await createOrReplaceInvitation(env.DB, {
      id: "invite-1", eventId: "event-1", email: "Guest@Example.COM", role: "viewer",
      invitedBy: "owner-1", createdAt: now, expiresAt: now + 1_000,
    });
    await createOrReplaceInvitation(env.DB, {
      id: "invite-2", eventId: "event-1", email: "guest@example.com", role: "editor",
      invitedBy: "owner-1", createdAt: now + 10, expiresAt: now + 2_000,
    });

    const invitations = await env.DB.prepare("SELECT id,email,role,created_at FROM event_invitations").all<{
      id: string; email: string; role: string; created_at: number;
    }>();
    expect(invitations.results).toEqual([{
      id: "invite-2", email: "guest@example.com", role: "editor", created_at: now + 10,
    }]);
  });

  it("accepts an active invitation case-insensitively with its exact role", async () => {
    await createOrReplaceInvitation(env.DB, {
      id: "invite-1", eventId: "event-1", email: "guest@example.com", role: "viewer",
      invitedBy: "owner-1", createdAt: now, expiresAt: now + 1_000,
    });

    await acceptPendingInvitations(env.DB, { id: "guest-1", email: "Guest@Example.com" }, now + 100);

    const member = await env.DB.prepare("SELECT role FROM event_members WHERE event_id=? AND user_id=?")
      .bind("event-1", "guest-1")
      .first<{ role: string }>();
    const invitation = await env.DB.prepare("SELECT accepted_at FROM event_invitations WHERE id=?")
      .bind("invite-1")
      .first<{ accepted_at: number }>();
    expect(member?.role).toBe("viewer");
    expect(invitation?.accepted_at).toBe(now + 100);
  });

  it("ignores expired invitations", async () => {
    await createOrReplaceInvitation(env.DB, {
      id: "expired", eventId: "event-1", email: "guest@example.com", role: "editor",
      invitedBy: "owner-1", createdAt: now - 2_000, expiresAt: now - 1,
    });

    await acceptPendingInvitations(env.DB, { id: "guest-1", email: "guest@example.com" }, now);

    expect(await env.DB.prepare("SELECT role FROM event_members WHERE user_id=?").bind("guest-1").first()).toBeNull();
    const invitation = await env.DB.prepare("SELECT accepted_at FROM event_invitations WHERE id='expired'").first<{ accepted_at: number | null }>();
    expect(invitation?.accepted_at).toBeNull();
  });

  it("updates an existing collaborator but never downgrades an owner", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO event_members (event_id,user_id,role,created_at) VALUES (?,?,?,?)").bind("event-1", "member-1", "viewer", now),
      env.DB.prepare("INSERT INTO event_members (event_id,user_id,role,created_at) VALUES (?,?,?,?)").bind("event-1", "owner-1", "owner", now),
    ]);
    await createOrReplaceInvitation(env.DB, {
      id: "upgrade", eventId: "event-1", email: "member@example.com", role: "editor",
      invitedBy: "owner-1", createdAt: now, expiresAt: now + 1_000,
    });
    await createOrReplaceInvitation(env.DB, {
      id: "owner-invite", eventId: "event-1", email: "owner@memboux.test", role: "viewer",
      invitedBy: "owner-1", createdAt: now, expiresAt: now + 1_000,
    });

    await acceptPendingInvitations(env.DB, { id: "member-1", email: "member@example.com" }, now + 10);
    await acceptPendingInvitations(env.DB, { id: "owner-1", email: "owner@memboux.test" }, now + 10);

    const roles = await env.DB.prepare("SELECT user_id,role FROM event_members ORDER BY user_id").all<{ user_id: string; role: string }>();
    expect(roles.results).toEqual([
      { user_id: "member-1", role: "editor" },
      { user_id: "owner-1", role: "owner" },
    ]);
  });
});
