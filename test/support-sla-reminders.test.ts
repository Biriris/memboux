import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reconcileSupportSlaReminders, supportSlaReminderKind } from "../src/support-sla-reminders";
import { supportTicketIdFromSubject } from "../src/support-email-threading";

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DROP TABLE IF EXISTS support_conversations"),
    env.DB.prepare("DROP TABLE IF EXISTS admin_members"),
    env.DB.prepare('DROP TABLE IF EXISTS "user"'),
    env.DB.prepare('CREATE TABLE "user" (id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL)'),
    env.DB.prepare(`CREATE TABLE admin_members (
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL,role TEXT NOT NULL,status TEXT NOT NULL,
      notification_email TEXT,support_notifications_enabled INTEGER NOT NULL DEFAULT 1,granted_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE support_conversations (
      id TEXT PRIMARY KEY,subject TEXT NOT NULL,category TEXT NOT NULL,priority TEXT NOT NULL,status TEXT NOT NULL,
      first_response_due_at INTEGER,first_admin_response_at INTEGER,assigned_admin_member_id TEXT,
      sla_reminder_status TEXT,sla_reminder_last_attempt_at INTEGER,sla_reminder_sent_at INTEGER,
      sla_escalation_status TEXT,sla_escalation_last_attempt_at INTEGER,sla_escalation_sent_at INTEGER,
      sla_notification_last_error TEXT
    )`),
  ]);
});

describe("support SLA reminders", () => {
  it("chooses one deduplicated action from the SLA state", () => {
    const now = 1_000_000;
    expect(supportSlaReminderKind(now + 30 * 60_000, null, null, null, now)).toBe("at_risk");
    expect(supportSlaReminderKind(now - 1, null, null, null, now)).toBe("overdue");
    expect(supportSlaReminderKind(now - 1, now - 2, null, null, now)).toBeNull();
    expect(supportSlaReminderKind(now - 1, null, null, now - 3, now)).toBeNull();
  });

  it("marks a disabled assignee once without attempting email", async () => {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO "user" VALUES (?,?,?)').bind("u1", "Support teammate", "staff@example.com"),
      env.DB.prepare("INSERT INTO admin_members VALUES (?,?,?,?,?,?,?)")
        .bind("m1", "u1", "support", "active", "staff@example.com", 0, 1),
      env.DB.prepare(`INSERT INTO support_conversations
        (id,subject,category,priority,status,first_response_due_at,first_admin_response_at,assigned_admin_member_id)
        VALUES (?,?,?,?,?,?,NULL,?)`)
        .bind("c1", "Gallery issue", "technical", "normal", "open", now + 30 * 60_000, "m1"),
    ]);
    const result = await reconcileSupportSlaReminders(env, now);
    expect(result).toEqual({ processed: 1, reminders: 0, escalations: 0 });
    expect(await env.DB.prepare("SELECT sla_reminder_status,sla_reminder_sent_at FROM support_conversations WHERE id='c1'").first())
      .toEqual({ sla_reminder_status: "disabled", sla_reminder_sent_at: null });
  });

  it("sends a replyable, ticket-threaded reminder to the assigned personal address", async () => {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO "user" VALUES (?,?,?)').bind("u2", "Support Agent", "login@example.com"),
      env.DB.prepare("INSERT INTO admin_members VALUES (?,?,?,?,?,?,?)")
        .bind("m2", "u2", "support", "active", "agent.personal@example.com", 1, 2),
      env.DB.prepare(`INSERT INTO support_conversations
        (id,subject,category,priority,status,first_response_due_at,first_admin_response_at,assigned_admin_member_id)
        VALUES (?,?,?,?,?,?,NULL,?)`)
        .bind("11111111-2222-4333-8444-555555555555", "Gallery issue", "technical", "normal", "open", now + 30 * 60_000, "m2"),
    ]);
    let sent: Record<string, unknown> | null = null;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      sent = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(JSON.stringify({ id: "resend-sla-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    try {
      expect(await reconcileSupportSlaReminders(env, now))
        .toEqual({ processed: 1, reminders: 1, escalations: 0 });
    } finally {
      fetchSpy.mockRestore();
    }

    expect(sent?.to).toEqual(["agent.personal@example.com"]);
    expect(sent?.reply_to).toBe("support@memboux.com");
    expect(supportTicketIdFromSubject(String(sent?.subject ?? "")))
      .toBe("11111111-2222-4333-8444-555555555555");
    expect(String(sent?.text ?? "")).toContain("Reply directly from your registered address");
  });
});
