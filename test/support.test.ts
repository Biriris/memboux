import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { addAiReply, markSupportConversationHumanOwned, normalizeSupportMessage, validSupportEmail } from "../src/routes/support";
import { privacySupportWidgets } from "../src/views/privacy-support";
import { classifySupportRequest } from "../src/support-routing";
import { SupportRepository } from "../src/support-repository";
import { SupportService } from "../src/support-service";

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DROP TABLE IF EXISTS support_attachments"),
    env.DB.prepare("DROP TABLE IF EXISTS support_messages"),
    env.DB.prepare("DROP TABLE IF EXISTS support_conversations"),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS request_rate_limits (
      rate_key TEXT PRIMARY KEY,window_started_at INTEGER NOT NULL,request_count INTEGER NOT NULL,expires_at INTEGER NOT NULL
    )`),
    env.DB.prepare("DELETE FROM request_rate_limits"),
    env.DB.prepare(`CREATE TABLE support_conversations (
      id TEXT PRIMARY KEY,user_id TEXT,visitor_token_hash TEXT,visitor_name TEXT NOT NULL DEFAULT '',visitor_email TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'open',admin_read_at INTEGER,user_read_at INTEGER,
      last_message_at INTEGER NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',required_role TEXT,assigned_admin_member_id TEXT,
      escalated_at INTEGER,notification_sent_at INTEGER,notification_delivery_status TEXT,
      notification_last_attempt_at INTEGER,notification_last_error TEXT,source TEXT NOT NULL DEFAULT 'chat',
      priority TEXT NOT NULL DEFAULT 'normal',first_response_due_at INTEGER,first_admin_response_at INTEGER,resolved_at INTEGER
    )`),
    env.DB.prepare(`CREATE TABLE support_messages (
      id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,sender_type TEXT NOT NULL,sender_user_id TEXT,body TEXT NOT NULL,created_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE support_attachments (
      id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,message_id TEXT NOT NULL,object_key TEXT NOT NULL UNIQUE,
      filename TEXT NOT NULL,content_type TEXT NOT NULL,size_bytes INTEGER NOT NULL,created_at INTEGER NOT NULL
    )`),
  ]);
});

describe("support validation and widgets", () => {
  it("normalizes messages and validates email", () => {
    expect(normalizeSupportMessage("  hello\r\nworld  ")).toBe("hello\nworld");
    expect(validSupportEmail("TEST@Example.COM")).toBe("test@example.com");
    expect(validSupportEmail("not-an-email")).toBeNull();
  });

  it("renders consent and support controls in every supported locale", () => {
    for (const locale of ["en", "el", "fr", "de", "es", "it"] as const) {
      const html = privacySupportWidgets(locale);
      expect(html).toContain("data-consent-banner");
      expect(html).toContain("data-cookie-analytics");
      expect(html).toContain("data-support-open");
      expect(html).toContain("/api/support/conversation");
      expect(html).toContain('className=\'m-typing\'');
      expect(html).toContain("@keyframes m-typing-bounce");
      expect(html).toContain('<select name="category">');
      expect(html).toContain('<option value="technical">');
      expect(html).toContain('<option value="events">');
      expect(html).toContain("data.subject=form.querySelector('select').selectedOptions[0].textContent");
      expect(html).toContain("__membouxSupportDraftProtection");
      expect(html).toContain("memboux-support-start-draft-v1");
      expect(html).toContain("memboux-support-reply-draft-v1");
      expect(html).toContain("new MutationObserver(scan).observe(panel");
    }
  });

  it("routes common support topics to the correct department", () => {
    expect(classifySupportRequest("Plan & billing", "I need a refund")).toBe("billing");
    expect(classifySupportRequest("Account", "Δεν μπορώ να συνδεθώ")).toBe("account");
    expect(classifySupportRequest("Gallery", "Το upload φωτογραφιών αποτυγχάνει")).toBe("events");
    expect(classifySupportRequest("Privacy", "Θέλω διαγραφή προσωπικών δεδομένων")).toBe("privacy");
  });

  it("keeps follow-ups human-owned without duplicate handoff acknowledgements or notifications", async () => {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO support_conversations
        (id,visitor_name,visitor_email,subject,status,last_message_at,created_at,updated_at,
         category,required_role,escalated_at,notification_delivery_status,notification_last_attempt_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind("handoff-conversation", "Guest", "", "Event ή gallery", "open", now, now, now, "events", "operations", now, "failed", now - 100),
      env.DB.prepare(`INSERT INTO support_messages
        (id,conversation_id,sender_type,body,created_at)
        VALUES (?,?,?,?,?)`)
        .bind("handoff-user-message", "handoff-conversation", "user", "Υπάρχει νέο πρόβλημα στο event μου", now),
      env.DB.prepare(`INSERT INTO support_messages
        (id,conversation_id,sender_type,body,created_at)
        VALUES (?,?,?,?,?)`)
        .bind("handoff-ack", "handoff-conversation", "system", "Το μήνυμά σου παραδόθηκε στην ομάδα υποστήριξης.", now - 50),
    ]);

    await addAiReply(env, "handoff-conversation");
    await addAiReply(env, "handoff-conversation");

    const acknowledgements = await env.DB.prepare(
      "SELECT COUNT(*) total FROM support_messages WHERE conversation_id=? AND sender_type='system'",
    ).bind("handoff-conversation").first<{ total: number }>();
    const conversation = await env.DB.prepare(
      "SELECT category,required_role,status,notification_delivery_status,notification_last_attempt_at FROM support_conversations WHERE id=?",
    ).bind("handoff-conversation").first<{
      category: string;
      required_role: string;
      status: string;
      notification_delivery_status: string;
      notification_last_attempt_at: number;
    }>();

    expect(acknowledgements?.total).toBe(1);
    expect(conversation).toMatchObject({
      category: "events",
      required_role: "operations",
      status: "open",
      notification_delivery_status: "failed",
      notification_last_attempt_at: now - 100,
    });
  });

  it("keeps a conversation in human ownership after the first staff reply", async () => {
    const createdAt = Date.now() - 1_000;
    const repliedAt = Date.now();
    await env.DB.prepare(`INSERT INTO support_conversations
      (id,visitor_name,visitor_email,subject,status,last_message_at,created_at,updated_at,category)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind("staff-owned", "Guest", "", "Account access", "open", createdAt, createdAt, createdAt, "account").run();

    await markSupportConversationHumanOwned(env.DB, "staff-owned", "admin-member", repliedAt);

    const conversation = await env.DB.prepare(`SELECT status,assigned_admin_member_id,
      escalated_at,first_admin_response_at,last_message_at FROM support_conversations WHERE id=?`)
      .bind("staff-owned").first<{
        status: string;
        assigned_admin_member_id: string;
        escalated_at: number;
        first_admin_response_at: number;
        last_message_at: number;
      }>();
    expect(conversation).toEqual({
      status: "pending",
      assigned_admin_member_id: "admin-member",
      escalated_at: repliedAt,
      first_admin_response_at: repliedAt,
      last_message_at: repliedAt,
    });
  });

  it("resolves customer conversations through the service boundary without crossing actors", async () => {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO support_conversations
        (id,user_id,visitor_token_hash,visitor_name,visitor_email,subject,status,last_message_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .bind("user-ticket", "user-1", null, "Member", "member@example.com", "Member ticket", "open", now, now, now),
      env.DB.prepare(`INSERT INTO support_conversations
        (id,user_id,visitor_token_hash,visitor_name,visitor_email,subject,status,last_message_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .bind("visitor-ticket", null, "visitor-hash", "Guest", "guest@example.com", "Guest ticket", "open", now, now, now),
    ]);
    const service = new SupportService(new SupportRepository(env.DB));

    await expect(service.findConversationForActor({ userId: "user-1", visitorTokenHash: "visitor-hash" }))
      .resolves.toMatchObject({ id: "user-ticket" });
    await expect(service.findConversationForActor({ userId: null, visitorTokenHash: "visitor-hash" }))
      .resolves.toMatchObject({ id: "visitor-ticket" });
    await expect(service.findConversationForActor({ userId: null, visitorTokenHash: "unknown" }))
      .resolves.toBeNull();
  });

  it("enforces assignment access before a service status transition", async () => {
    const now = Date.now();
    await env.DB.prepare(`INSERT INTO support_conversations
      (id,visitor_name,visitor_email,subject,status,last_message_at,created_at,updated_at,required_role,assigned_admin_member_id)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .bind("assigned-ticket", "Guest", "", "Assigned", "open", now, now, now, "support", "member-a").run();
    const service = new SupportService(new SupportRepository(env.DB));
    const baseAdmin = { userId: "admin-user", name: "Agent", email: "agent@example.com", role: "support" as const };

    await expect(service.changeStatus({ ...baseAdmin, memberId: "member-b" }, "assigned-ticket", "closed"))
      .resolves.toMatchObject({ kind: "forbidden" });
    await expect(service.changeStatus({ ...baseAdmin, memberId: "member-a" }, "assigned-ticket", "closed", now + 1))
      .resolves.toMatchObject({ kind: "ok" });
    await expect(env.DB.prepare("SELECT status,resolved_at FROM support_conversations WHERE id=?")
      .bind("assigned-ticket").first()).resolves.toMatchObject({ status: "closed", resolved_at: now + 1 });
  });
});

describe("guest support conversation API", () => {
  it("creates and restores a persistent guest conversation", async () => {
    const created = await SELF.fetch("https://memboux.com/api/support/conversation", {
      method: "POST",
      headers: { Origin: "https://memboux.com", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Guest", email: "guest@example.com", category: "events", subject: "Event or gallery", message: "The gallery does not open." }),
    });
    expect(created.status).toBe(201);
    const cookie = created.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("memboux_support=");
    expect(cookie).toContain("HttpOnly");
    const payload = await created.json<{ conversation: { id: string; status: string }; messages: Array<{ body: string }> }>();
    expect(payload.conversation.status).toBe("open");
    expect(payload.messages[0].body).toBe("The gallery does not open.");
    expect((await env.DB.prepare("SELECT category FROM support_conversations WHERE id=?").bind(payload.conversation.id).first<{ category: string }>())?.category).toBe("events");

    const response = await SELF.fetch("https://memboux.com/api/support/conversation", { headers: { Cookie: cookie.split(";")[0] } });
    expect(response.status).toBe(200);
    const restored = await response.json<{ conversation: { id: string }; messages: Array<{ body: string }> }>();
    expect(restored.conversation.id).toBe(payload.conversation.id);
    expect(restored.messages).toHaveLength(1);
  });

  it("serves ticket attachments only to the visitor who owns the conversation", async () => {
    const created = await SELF.fetch("https://memboux.com/api/support/conversation", {
      method: "POST",
      headers: { Origin: "https://memboux.com", "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Attachment guest",
        email: "attachment@example.com",
        category: "technical",
        subject: "Screenshot",
        message: "Please inspect this screenshot.",
      }),
    });
    const cookie = (created.headers.get("set-cookie") ?? "").split(";")[0];
    const payload = await created.json<{
      conversation: { id: string };
      messages: Array<{ id: string }>;
    }>();
    const objectKey = `support-attachments/${payload.conversation.id}/${payload.messages[0].id}/attachment-id`;
    await env.MEDIA.put(objectKey, new Uint8Array([137, 80, 78, 71]), {
      httpMetadata: { contentType: "image/png" },
    });
    await env.DB.prepare(
      `INSERT INTO support_attachments
       (id,conversation_id,message_id,object_key,filename,content_type,size_bytes,created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).bind(
      "attachment-id",
      payload.conversation.id,
      payload.messages[0].id,
      objectKey,
      "error screenshot.png",
      "image/png",
      4,
      Date.now(),
    ).run();

    const restored = await SELF.fetch("https://memboux.com/api/support/conversation", {
      headers: { Cookie: cookie },
    });
    const restoredPayload = await restored.json<{
      messages: Array<{ attachments: Array<{ href: string; filename: string }> }>;
    }>();
    expect(restoredPayload.messages[0].attachments[0]).toMatchObject({
      href: "/api/support/attachments/attachment-id",
      filename: "error screenshot.png",
    });

    const authorized = await SELF.fetch("https://memboux.com/api/support/attachments/attachment-id", {
      headers: { Cookie: cookie },
    });
    expect(authorized.status).toBe(200);
    expect(authorized.headers.get("content-type")).toBe("image/png");
    expect(authorized.headers.get("content-disposition")).toContain("attachment");
    expect(authorized.headers.get("x-content-type-options")).toBe("nosniff");
    expect([...new Uint8Array(await authorized.arrayBuffer())]).toEqual([137, 80, 78, 71]);

    const anonymous = await SELF.fetch("https://memboux.com/api/support/attachments/attachment-id");
    expect(anonymous.status).toBe(404);
  });
});
