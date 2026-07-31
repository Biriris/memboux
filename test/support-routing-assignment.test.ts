import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { escalateSupportConversation } from "../src/support-routing";
import { supportTicketIdFromSubject } from "../src/support-email-threading";

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare("DROP TABLE IF EXISTS support_conversations"),
    env.DB.prepare("DROP TABLE IF EXISTS admin_members"),
    env.DB.prepare('DROP TABLE IF EXISTS "user"'),
  ]);
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE "user" (
      id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE admin_members (
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL,role TEXT NOT NULL,status TEXT NOT NULL,
      notification_email TEXT,support_notifications_enabled INTEGER NOT NULL DEFAULT 1,
      granted_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE support_conversations (
      id TEXT PRIMARY KEY,assigned_admin_member_id TEXT,notification_sent_at INTEGER,
      notification_delivery_status TEXT,notification_last_attempt_at INTEGER,notification_last_error TEXT,
      notification_delivery_outcome TEXT,notification_provider_message_id TEXT,notification_delivery_event_at INTEGER,
      category TEXT NOT NULL DEFAULT 'general',required_role TEXT,escalated_at INTEGER,
      priority TEXT NOT NULL DEFAULT 'normal',first_response_due_at INTEGER,first_admin_response_at INTEGER,resolved_at INTEGER,
      updated_at INTEGER NOT NULL,status TEXT NOT NULL
    )`),
  ]);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO "user" (id,name,email) VALUES (?,?,?)')
      .bind("staff-user", "Support teammate", "staff@example.com"),
    env.DB.prepare(`INSERT INTO admin_members
      (id,user_id,role,status,notification_email,support_notifications_enabled,granted_at)
      VALUES (?,?,?,?,?,?,?)`)
      .bind("staff-member", "staff-user", "support", "active", "personal@example.com", 0, 1),
    env.DB.prepare(`INSERT INTO support_conversations
      (id,assigned_admin_member_id,notification_sent_at,notification_delivery_status,notification_last_attempt_at,notification_last_error,category,required_role,escalated_at,updated_at,status)
      VALUES (?,NULL,NULL,NULL,NULL,NULL,'general',NULL,NULL,?,'open')`)
      .bind("conversation-1", 1),
  ]);
});

describe("support assignment", () => {
  it("assigns work by role even when the employee disables personal email alerts", async () => {
    const assignee = await escalateSupportConversation(
      env,
      "conversation-1",
      "Account access",
      "I cannot sign in to my account",
      "AI requested human review",
    );

    expect(assignee).toMatchObject({
      memberId: "staff-member",
      role: "support",
      notificationsEnabled: false,
    });
    const stored = await env.DB.prepare(
      "SELECT assigned_admin_member_id,required_role,escalated_at,notification_sent_at,notification_delivery_status,priority,first_response_due_at FROM support_conversations WHERE id=?",
    ).bind("conversation-1").first<{
      assigned_admin_member_id: string;
      required_role: string;
      escalated_at: number;
      notification_sent_at: number | null;
      notification_delivery_status: string | null;
      priority: string;
      first_response_due_at: number;
    }>();
    expect(stored?.assigned_admin_member_id).toBe("staff-member");
    expect(stored?.required_role).toBe("support");
    expect(stored?.escalated_at).toBeGreaterThan(1);
    expect(stored?.notification_sent_at).toBeNull();
    expect(stored?.notification_delivery_status).toBe("disabled");
    expect(stored?.priority).toBe("high");
    expect(stored?.first_response_due_at).toBeGreaterThan(stored?.escalated_at ?? 0);
  });

  it("sends a ticket-threaded assignment that can be answered from the registered address", async () => {
    const conversationId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    await env.DB.batch([
      env.DB.prepare("UPDATE admin_members SET support_notifications_enabled=1 WHERE id='staff-member'"),
      env.DB.prepare(`INSERT INTO support_conversations
        (id,assigned_admin_member_id,notification_sent_at,notification_delivery_status,
         notification_last_attempt_at,notification_last_error,category,required_role,
         escalated_at,updated_at,status)
        VALUES (?,NULL,NULL,NULL,NULL,NULL,'general',NULL,NULL,?,'open')`)
        .bind(conversationId, Date.now()),
    ]);
    let sent: Record<string, unknown> | null = null;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      sent = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(JSON.stringify({ id: "resend-assignment-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    try {
      await escalateSupportConversation(
        env,
        conversationId,
        "Account access",
        "I cannot sign in to my account",
        "AI requested human review",
      );
    } finally {
      fetchSpy.mockRestore();
    }

    expect(sent?.to).toEqual(["personal@example.com"]);
    expect(sent?.reply_to).toBe("support@memboux.com");
    expect(supportTicketIdFromSubject(String(sent?.subject ?? ""))).toBe(conversationId);
    expect(String(sent?.text ?? "")).toContain("Reply directly from this registered address");
    expect(await env.DB.prepare(
      "SELECT notification_delivery_status,notification_delivery_outcome FROM support_conversations WHERE id=?",
    ).bind(conversationId).first()).toEqual({
      notification_delivery_status: "sent",
      notification_delivery_outcome: "accepted",
    });
  });
});
