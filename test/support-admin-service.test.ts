import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SupportRepository } from "../src/support-repository";
import { SupportService } from "../src/support-service";
import type { AdminIdentity } from "../src/admin-rbac";

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare("DROP TABLE IF EXISTS support_attachments"),
    env.DB.prepare("DROP TABLE IF EXISTS support_messages"),
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
      granted_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE support_conversations (
      id TEXT PRIMARY KEY,user_id TEXT,visitor_name TEXT NOT NULL DEFAULT '',visitor_email TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'open',category TEXT NOT NULL DEFAULT 'general',
      required_role TEXT,assigned_admin_member_id TEXT,admin_read_at INTEGER,user_read_at INTEGER,
      first_response_due_at INTEGER,first_admin_response_at INTEGER,resolved_at INTEGER,
      notification_sent_at INTEGER,notification_delivery_status TEXT,notification_delivery_outcome TEXT,
      notification_provider_message_id TEXT,notification_delivery_event_at INTEGER,
      notification_last_attempt_at INTEGER,notification_last_error TEXT,
      last_message_at INTEGER NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE support_messages (
      id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,sender_type TEXT NOT NULL,body TEXT NOT NULL,created_at INTEGER NOT NULL,
      email_delivery_status TEXT,email_delivery_outcome TEXT,email_provider_message_id TEXT,email_delivery_event_at INTEGER
    )`),
    env.DB.prepare(`CREATE TABLE support_attachments (
      id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,message_id TEXT NOT NULL,
      filename TEXT NOT NULL,content_type TEXT NOT NULL,size_bytes INTEGER NOT NULL,created_at INTEGER NOT NULL
    )`),
  ]);
});

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM support_attachments"),
    env.DB.prepare("DELETE FROM support_messages"),
    env.DB.prepare("DELETE FROM support_conversations"),
    env.DB.prepare("DELETE FROM admin_members"),
    env.DB.prepare('DELETE FROM "user"'),
  ]);
});

const admin = (memberId: string, role: AdminIdentity["role"]): AdminIdentity => ({
  memberId,
  role,
  userId: `${memberId}-user`,
  name: memberId,
  email: `${memberId}@example.com`,
});

async function insertConversation(
  id: string,
  options: { requiredRole?: string; assignedTo?: string | null; status?: string; category?: string } = {},
) {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO support_conversations
      (id,subject,status,category,required_role,assigned_admin_member_id,last_message_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(
        id,
        id,
        options.status ?? "open",
        options.category ?? "general",
        options.requiredRole ?? "support",
        options.assignedTo ?? null,
        now,
        now,
        now,
      ),
    env.DB.prepare(
      "INSERT INTO support_messages (id,conversation_id,sender_type,body,created_at) VALUES (?,?,?,?,?)",
    ).bind(`${id}-message`, id, "user", `${id} body`, now),
  ]);
}

describe("SupportService admin work distribution", () => {
  it("keeps inbox rows and metrics inside the admin assignment scope", async () => {
    await Promise.all([
      insertConversation("support-unassigned", { requiredRole: "support" }),
      insertConversation("finance-unassigned", { requiredRole: "finance" }),
      insertConversation("mine", { requiredRole: "finance", assignedTo: "support-member" }),
    ]);
    const service = new SupportService(new SupportRepository(env.DB));
    const result = await service.loadAdminInbox(admin("support-member", "support"), {
      status: "all",
      category: "all",
      sla: "all",
      assignee: "all",
    });

    expect(result.rows.map((row) => row.id).sort()).toEqual(["mine", "support-unassigned"]);
    expect(Number(result.metrics?.total)).toBe(2);
    expect(Number(result.metrics?.unassigned_count)).toBe(1);
  });

  it("claims an eligible unassigned conversation only once", async () => {
    await insertConversation("claimable", { requiredRole: "support" });
    const repository = new SupportRepository(env.DB);
    const service = new SupportService(repository);

    await expect(service.claimConversation(admin("support-member", "support"), "claimable"))
      .resolves.toMatchObject({ kind: "ok", requiredRole: "support" });
    await expect(service.claimConversation(admin("other-member", "support"), "claimable"))
      .resolves.toMatchObject({ kind: "forbidden" });
    await expect(repository.findById("claimable"))
      .resolves.toMatchObject({ assigned_admin_member_id: "support-member" });
  });

  it("validates reassignment role and resets stale notification state", async () => {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO "user" (id,name,email) VALUES (?,?,?)')
        .bind("support-user", "Support teammate", "support@example.com"),
      env.DB.prepare('INSERT INTO "user" (id,name,email) VALUES (?,?,?)')
        .bind("finance-user", "Finance teammate", "finance@example.com"),
      env.DB.prepare("INSERT INTO admin_members (id,user_id,role,status,granted_at) VALUES (?,?,?,?,?)")
        .bind("support-target", "support-user", "support", "active", now),
      env.DB.prepare("INSERT INTO admin_members (id,user_id,role,status,granted_at) VALUES (?,?,?,?,?)")
        .bind("finance-target", "finance-user", "finance", "active", now),
    ]);
    await insertConversation("general-ticket", { category: "general", requiredRole: "support" });
    await env.DB.prepare(`UPDATE support_conversations SET
      notification_sent_at=?,notification_delivery_status='failed',notification_delivery_outcome='failed',
      notification_provider_message_id='provider-id',notification_last_error='bounce' WHERE id=?`)
      .bind(now, "general-ticket").run();
    const service = new SupportService(new SupportRepository(env.DB));
    const owner = admin("owner-member", "owner");

    await expect(service.reassignConversation(owner, "general-ticket", "finance-target"))
      .resolves.toMatchObject({ kind: "ineligible" });
    await expect(service.reassignConversation(owner, "general-ticket", "support-target", now + 1))
      .resolves.toMatchObject({ kind: "ok", target: { id: "support-target", role: "support" } });
    await expect(env.DB.prepare(`SELECT assigned_admin_member_id,required_role,notification_sent_at,
      notification_delivery_status,notification_delivery_outcome,notification_provider_message_id,
      notification_last_error FROM support_conversations WHERE id=?`)
      .bind("general-ticket").first()).resolves.toEqual({
        assigned_admin_member_id: "support-target",
        required_role: "support",
        notification_sent_at: null,
        notification_delivery_status: null,
        notification_delivery_outcome: null,
        notification_provider_message_id: null,
        notification_last_error: null,
      });
  });

  it("loads an authorized thread with attachments and marks it read", async () => {
    await insertConversation("thread-ticket", { assignedTo: "support-member" });
    await env.DB.prepare(`INSERT INTO support_attachments
      (id,conversation_id,message_id,filename,content_type,size_bytes,created_at)
      VALUES (?,?,?,?,?,?,?)`)
      .bind("attachment-1", "thread-ticket", "thread-ticket-message", "screen.png", "image/png", 42, 1).run();
    const service = new SupportService(new SupportRepository(env.DB));
    const readAt = Date.now() + 10;

    const result = await service.loadAdminThread(admin("support-member", "support"), "thread-ticket", readAt);

    expect(result).toMatchObject({
      kind: "ok",
      conversation: { id: "thread-ticket" },
      messages: [{ id: "thread-ticket-message", body: "thread-ticket body" }],
      attachments: [{ id: "attachment-1", message_id: "thread-ticket-message" }],
    });
    await expect(env.DB.prepare("SELECT admin_read_at FROM support_conversations WHERE id=?")
      .bind("thread-ticket").first()).resolves.toEqual({ admin_read_at: readAt });
  });

  it("does not expose or mark a thread read for a different assignee", async () => {
    await insertConversation("private-thread", { assignedTo: "support-member" });
    const service = new SupportService(new SupportRepository(env.DB));

    await expect(service.loadAdminThread(admin("other-member", "support"), "private-thread", 123))
      .resolves.toMatchObject({ kind: "forbidden" });
    await expect(env.DB.prepare("SELECT admin_read_at FROM support_conversations WHERE id=?")
      .bind("private-thread").first()).resolves.toEqual({ admin_read_at: null });
  });

  it("prepares each failed customer email retry only once and clears stale provider state", async () => {
    await insertConversation("email-ticket", { assignedTo: "support-member" });
    await env.DB.prepare("UPDATE support_conversations SET visitor_email=? WHERE id=?")
      .bind("guest@example.com", "email-ticket").run();
    await env.DB.prepare(`UPDATE support_messages SET
      sender_type='admin',email_delivery_status='failed',email_delivery_outcome='bounced',
      email_provider_message_id='old-provider',email_delivery_event_at=123 WHERE id=?`)
      .bind("email-ticket-message").run();
    const service = new SupportService(new SupportRepository(env.DB));
    const supportAdmin = admin("support-member", "support");

    await expect(service.prepareCustomerEmailRetry(supportAdmin, "email-ticket", "email-ticket-message"))
      .resolves.toMatchObject({ kind: "ok", message: { id: "email-ticket-message" } });
    await expect(service.prepareCustomerEmailRetry(supportAdmin, "email-ticket", "email-ticket-message"))
      .resolves.toMatchObject({ kind: "not_retryable" });
    await expect(env.DB.prepare(`SELECT email_delivery_status,email_delivery_outcome,
      email_provider_message_id,email_delivery_event_at FROM support_messages WHERE id=?`)
      .bind("email-ticket-message").first()).resolves.toEqual({
        email_delivery_status: "pending",
        email_delivery_outcome: null,
        email_provider_message_id: null,
        email_delivery_event_at: null,
      });
  });

  it("prepares each failed staff notification retry only once", async () => {
    await insertConversation("staff-retry", { assignedTo: "support-member" });
    await env.DB.prepare(`UPDATE support_conversations SET
      notification_sent_at=1,notification_delivery_status='failed',notification_delivery_outcome='failed',
      notification_provider_message_id='old-provider',notification_delivery_event_at=2,
      notification_last_error='network' WHERE id=?`).bind("staff-retry").run();
    const service = new SupportService(new SupportRepository(env.DB));
    const supportAdmin = admin("support-member", "support");

    await expect(service.prepareStaffNotificationRetry(supportAdmin, "staff-retry", 99))
      .resolves.toMatchObject({ kind: "ok", latestMessage: "staff-retry body" });
    await expect(service.prepareStaffNotificationRetry(supportAdmin, "staff-retry", 100))
      .resolves.toMatchObject({ kind: "not_retryable" });
    await expect(env.DB.prepare(`SELECT notification_sent_at,notification_delivery_status,
      notification_delivery_outcome,notification_provider_message_id,notification_delivery_event_at,
      notification_last_attempt_at,notification_last_error FROM support_conversations WHERE id=?`)
      .bind("staff-retry").first()).resolves.toEqual({
        notification_sent_at: null,
        notification_delivery_status: null,
        notification_delivery_outcome: null,
        notification_provider_message_id: null,
        notification_delivery_event_at: null,
        notification_last_attempt_at: 99,
        notification_last_error: null,
      });
  });
});
