import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import migration from "../migrations/0066_event_co_owner_invitations.sql?raw";

const sqlForD1Exec = (sql: string) => sql.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DROP TABLE IF EXISTS account_notifications"),
    env.DB.prepare("DROP TABLE IF EXISTS event_invitations"),
    env.DB.prepare("DROP TABLE IF EXISTS events"),
    env.DB.prepare('DROP TABLE IF EXISTS "user"'),
    env.DB.prepare('CREATE TABLE "user" (id TEXT PRIMARY KEY,email TEXT NOT NULL)'),
    env.DB.prepare("CREATE TABLE events (id TEXT PRIMARY KEY)"),
    env.DB.prepare(`CREATE TABLE event_invitations (
      id TEXT NOT NULL PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('editor','viewer')),
      invited_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      accepted_at INTEGER,
      token_hash TEXT,
      declined_at INTEGER,
      invitation_kind TEXT NOT NULL DEFAULT 'member' CHECK (invitation_kind IN ('member','professional')),
      UNIQUE (event_id,email)
    )`),
    env.DB.prepare(`CREATE TABLE account_notifications (
      id TEXT PRIMARY KEY,
      invitation_id TEXT REFERENCES event_invitations(id) ON DELETE SET NULL
    )`),
    env.DB.prepare('INSERT INTO "user" (id,email) VALUES (?,?)').bind("owner-1", "owner@example.com"),
    env.DB.prepare("INSERT INTO events (id) VALUES (?)").bind("event-1"),
    env.DB.prepare(`INSERT INTO event_invitations
      (id,event_id,email,role,invited_by,created_at,expires_at,token_hash,invitation_kind)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind("viewer-invite", "event-1", "viewer@example.com", "viewer", "owner-1", 1, 2, "viewer-token", "member"),
    env.DB.prepare("INSERT INTO account_notifications (id,invitation_id) VALUES (?,?)")
      .bind("notification-1", "viewer-invite"),
  ]);
});

describe("0066 event co-owner invitations migration", () => {
  it("preserves existing invitations and permits owner invitations", async () => {
    await env.DB.exec(sqlForD1Exec(migration));

    expect(await env.DB.prepare("SELECT role FROM event_invitations WHERE id='viewer-invite'").first())
      .toEqual({ role: "viewer" });
    expect(await env.DB.prepare("SELECT invitation_id FROM account_notifications WHERE id='notification-1'").first())
      .toEqual({ invitation_id: "viewer-invite" });

    await expect(env.DB.prepare(`INSERT INTO event_invitations
      (id,event_id,email,role,invited_by,created_at,expires_at,token_hash,invitation_kind)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind("owner-invite", "event-1", "co-owner@example.com", "owner", "owner-1", 1, 2, "owner-token", "member")
      .run()).resolves.toMatchObject({ success: true });
    await expect(env.DB.prepare("UPDATE event_invitations SET role='administrator' WHERE id='owner-invite'").run())
      .rejects.toThrow();
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });
});
