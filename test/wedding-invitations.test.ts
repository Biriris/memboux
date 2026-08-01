import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthEnv } from "../src/auth";
import type { EventRow } from "../src/domain";
import { deliverWeddingInvitationBatch, reserveWeddingInvitation, reserveWeddingInvitationBatch } from "../src/wedding-invitations";

describe("wedding invitation batches", () => {
  beforeEach(async () => {
    await env.DB.prepare("DROP TABLE IF EXISTS event_wedding_guests").run();
    await env.DB.prepare(`CREATE TABLE event_wedding_guests (
        id TEXT PRIMARY KEY,event_id TEXT NOT NULL,first_name TEXT NOT NULL,last_name TEXT NOT NULL,email TEXT NOT NULL,
        invitation_token_hash TEXT,invitation_created_at INTEGER,invitation_delivery_status TEXT NOT NULL DEFAULT 'not_sent',
        invitation_delivery_attempted_at INTEGER,invitation_emailed_at INTEGER,updated_at INTEGER NOT NULL
      )`).run();
  });

  it("reserves eligible guests once and retries only stale or failed delivery", async () => {
    const now = 2_000_000;
    await env.DB.batch([
      ["new", "not_sent", null, "new@example.com"],
      ["sent", "sent", now - 1_000, "sent@example.com"],
      ["fresh", "sending", now - 60_000, "fresh@example.com"],
      ["stale", "sending", now - 700_000, "stale@example.com"],
      ["failed", "failed", now - 1_000, "failed@example.com"],
      ["phone", "not_sent", null, ""],
    ].map(([id, status, attemptedAt, email]) => env.DB.prepare(`INSERT INTO event_wedding_guests
      (id,event_id,first_name,last_name,email,invitation_delivery_status,invitation_delivery_attempted_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)`).bind(id, "event-1", String(id), "Guest", email, status, attemptedAt, now)));

    const reserved = await reserveWeddingInvitationBatch(env.DB, "event-1", now);
    expect(reserved.map((item) => item.guestId).sort()).toEqual(["failed", "new", "stale"]);
    expect(await reserveWeddingInvitationBatch(env.DB, "event-1", now + 1_000)).toEqual([]);
    expect(await env.DB.prepare("SELECT COUNT(*) count FROM event_wedding_guests WHERE invitation_delivery_status='sending'").first())
      .toEqual({ count: 4 });
  });

  it("records sent and failed outcomes without logging recipient details", async () => {
    const now = Date.now();
    await env.DB.batch(["ok", "bad"].map((id) => env.DB.prepare(`INSERT INTO event_wedding_guests
      (id,event_id,first_name,last_name,email,invitation_token_hash,invitation_delivery_status,invitation_delivery_attempted_at,updated_at)
      VALUES (?,?,?,?,?,?,'sending',?,?)`).bind(id, "event-1", id, "Guest", `${id}@example.com`, `hash-${id}`, now, now)));
    const invitations = [
      { guestId: "ok", guestName: "Ok Guest", email: "ok@example.com", token: "token-ok", tokenHash: "hash-ok" },
      { guestId: "bad", guestName: "Bad Guest", email: "bad@example.com", token: "token-bad", tokenHash: "hash-bad" },
    ];
    const deliver = vi.fn(async (_env, _event, _locale, _origin, invitation) => {
      if (invitation.guestId === "bad") throw new Error("provider unavailable");
    });
    const event = { id: "event-1", code: "WEDDING", eventName: "Our wedding" } as EventRow;
    await deliverWeddingInvitationBatch(env as unknown as AuthEnv, event, "en", "https://memboux.com", invitations, deliver);
    expect(deliver).toHaveBeenCalledTimes(2);
    expect(await env.DB.prepare("SELECT invitation_delivery_status FROM event_wedding_guests WHERE id='ok'").first()).toEqual({ invitation_delivery_status: "sent" });
    expect(await env.DB.prepare("SELECT invitation_delivery_status FROM event_wedding_guests WHERE id='bad'").first()).toEqual({ invitation_delivery_status: "failed" });
  });

  it("reserves one selected guest for an individual email", async () => {
    const now = 3_000_000;
    await env.DB.prepare(`INSERT INTO event_wedding_guests
      (id,event_id,first_name,last_name,email,invitation_delivery_status,updated_at)
      VALUES (?,?,?,?,?,'sent',?)`).bind("guest-1", "event-1", "Maria", "Guest", "maria@example.com", now).run();

    const invitation = await reserveWeddingInvitation(env.DB, "event-1", "guest-1", now);

    expect(invitation).toMatchObject({ guestId: "guest-1", guestName: "Maria Guest", email: "maria@example.com" });
    expect(invitation?.token.length).toBeGreaterThan(60);
    expect(await env.DB.prepare("SELECT invitation_delivery_status,invitation_delivery_attempted_at FROM event_wedding_guests WHERE id='guest-1'").first())
      .toEqual({ invitation_delivery_status: "sending", invitation_delivery_attempted_at: now });
    expect(await reserveWeddingInvitation(env.DB, "event-1", "missing", now)).toBeNull();
  });
});
