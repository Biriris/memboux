import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createInvitationToken,
  createOrReplaceInvitation,
  getInvitationByToken,
  hashInvitationToken,
  listPendingInvitations,
  normalizeInviteRole,
  respondToInvitation,
} from "../src/invitations";

const now = 1_800_000_000_000;

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DROP TABLE IF EXISTS event_invitations"),
    env.DB.prepare("DROP TABLE IF EXISTS event_members"),
    env.DB.prepare("DROP TABLE IF EXISTS events"),
    env.DB.prepare('DROP TABLE IF EXISTS "user"'),
    env.DB.prepare('CREATE TABLE "user" (id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL)'),
    env.DB.prepare("CREATE TABLE events (id TEXT PRIMARY KEY,code TEXT NOT NULL,eventName TEXT NOT NULL,deleted_at INTEGER)"),
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
      token_hash TEXT UNIQUE,
      declined_at INTEGER,
      UNIQUE (event_id,email)
    )`),
    env.DB.prepare('INSERT INTO "user" (id,name,email) VALUES (?,?,?)').bind("owner-1", "Owner", "owner@memboux.test"),
    env.DB.prepare('INSERT INTO "user" (id,name,email) VALUES (?,?,?)').bind("guest-1", "Guest", "guest@example.com"),
    env.DB.prepare("INSERT INTO events (id,code,eventName,deleted_at) VALUES (?,?,?,NULL)").bind("event-1", "ALBUM1", "Summer trip"),
  ]);
});

async function createInvitation(options: {
  id?: string;
  email?: string;
  role?: "editor" | "viewer";
  expiresAt?: number;
  token?: string;
} = {}) {
  const token = options.token ?? createInvitationToken();
  await createOrReplaceInvitation(env.DB, {
    id: options.id ?? "invite-1",
    eventId: "event-1",
    email: options.email ?? "guest@example.com",
    role: options.role ?? "viewer",
    invitedBy: "owner-1",
    createdAt: now,
    expiresAt: options.expiresAt ?? now + 60_000,
    tokenHash: await hashInvitationToken(token),
  });
  return token;
}

describe("invitation roles and secure links", () => {
  it("accepts supported roles and generates URL-safe high-entropy tokens", () => {
    expect(normalizeInviteRole("viewer")).toBe("viewer");
    expect(normalizeInviteRole("editor")).toBe("editor");
    expect(normalizeInviteRole("owner")).toBe("editor");
    const token = createInvitationToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("stores only a token hash and resolves the invitation from the raw link", async () => {
    const token = await createInvitation({ token: "A".repeat(43) });
    const row = await env.DB.prepare("SELECT token_hash FROM event_invitations WHERE id='invite-1'").first<{ token_hash: string }>();
    expect(row?.token_hash).not.toBe(token);
    expect((await getInvitationByToken(env.DB, token))?.event_name).toBe("Summer trip");
    expect(await getInvitationByToken(env.DB, "invalid" )).toBeNull();
  });

  it("renders a private invitation landing page without exposing the full email", async () => {
    const token = await createInvitation({ token: "C".repeat(43) });
    const response = await SELF.fetch(`https://memboux.com/invite/${token}?lang=en`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Accept this invitation?");
    expect(html).toContain("Summer trip");
    expect(html).toContain("Sign in to accept");
    expect(html).not.toContain("guest@example.com");
  });
});

describe("explicit invitation responses", () => {
  it("lists an active invitation without automatically adding membership", async () => {
    await createInvitation();
    const pending = await listPendingInvitations(env.DB, { email: "Guest@Example.COM" }, now + 1);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ event_name: "Summer trip", inviter_name: "Owner", role: "viewer" });
    expect(await env.DB.prepare("SELECT 1 FROM event_members WHERE user_id='guest-1'").first()).toBeNull();
  });

  it("accepts only for the invited email and grants the exact role", async () => {
    await createInvitation();
    expect((await respondToInvitation(env.DB, "invite-1", { id: "wrong", email: "wrong@example.com" }, "accept", now + 1)).status).toBe("forbidden");

    const response = await respondToInvitation(env.DB, "invite-1", { id: "guest-1", email: "Guest@Example.com" }, "accept", now + 2);
    expect(response).toEqual({ status: "accepted", eventId: "event-1", eventCode: "ALBUM1" });
    expect((await env.DB.prepare("SELECT role FROM event_members WHERE event_id='event-1' AND user_id='guest-1'").first<{ role: string }>())?.role).toBe("viewer");
    expect((await env.DB.prepare("SELECT accepted_at FROM event_invitations WHERE id='invite-1'").first<{ accepted_at: number }>())?.accepted_at).toBe(now + 2);
  });

  it("declines without creating membership and removes the notification", async () => {
    await createInvitation();
    expect(await respondToInvitation(env.DB, "invite-1", { id: "guest-1", email: "guest@example.com" }, "decline", now + 3))
      .toEqual({ status: "declined", eventId: "event-1", eventCode: "ALBUM1" });
    expect(await env.DB.prepare("SELECT 1 FROM event_members WHERE user_id='guest-1'").first()).toBeNull();
    expect(await listPendingInvitations(env.DB, { email: "guest@example.com" }, now + 4)).toEqual([]);
  });

  it("rejects expired and already resolved invitations", async () => {
    await createInvitation({ expiresAt: now - 1 });
    expect((await respondToInvitation(env.DB, "invite-1", { id: "guest-1", email: "guest@example.com" }, "accept", now)).status).toBe("expired");

    await createInvitation({ id: "invite-2", expiresAt: now + 10_000 });
    await respondToInvitation(env.DB, "invite-2", { id: "guest-1", email: "guest@example.com" }, "accept", now + 1);
    expect((await respondToInvitation(env.DB, "invite-2", { id: "guest-1", email: "guest@example.com" }, "accept", now + 2)).status).toBe("already_resolved");
  });

  it("updates a collaborator but never downgrades an owner", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO event_members (event_id,user_id,role,created_at) VALUES (?,?,?,?)").bind("event-1", "guest-1", "viewer", now),
      env.DB.prepare("INSERT INTO event_members (event_id,user_id,role,created_at) VALUES (?,?,?,?)").bind("event-1", "owner-1", "owner", now),
    ]);
    await createInvitation({ role: "editor" });
    await respondToInvitation(env.DB, "invite-1", { id: "guest-1", email: "guest@example.com" }, "accept", now + 1);
    await createInvitation({ id: "owner-invite", email: "owner@memboux.test", role: "viewer", token: "B".repeat(43) });
    await respondToInvitation(env.DB, "owner-invite", { id: "owner-1", email: "owner@memboux.test" }, "accept", now + 2);

    const roles = await env.DB.prepare("SELECT user_id,role FROM event_members ORDER BY user_id").all<{ user_id: string; role: string }>();
    expect(roles.results).toEqual([
      { user_id: "guest-1", role: "editor" },
      { user_id: "owner-1", role: "owner" },
    ]);
  });
});
