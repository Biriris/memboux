import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  cleanInboundReply,
  ingestInboundSupportEmail,
} from "../src/inbound-support-email";
import {
  staffEmailReplyCopy,
  supportTicketIdFromSubject,
  supportTicketSubject,
} from "../src/support-email-threading";

const ticketId = "11111111-2222-4333-8444-555555555555";

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare("DROP TABLE IF EXISTS email_delivery_attempts"),
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
      notification_email TEXT,support_notifications_enabled INTEGER NOT NULL DEFAULT 1
    )`),
    env.DB.prepare(`CREATE TABLE support_conversations (
      id TEXT PRIMARY KEY,user_id TEXT,visitor_token_hash TEXT,visitor_name TEXT NOT NULL DEFAULT '',
      visitor_email TEXT NOT NULL DEFAULT '',subject TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',admin_read_at INTEGER,user_read_at INTEGER,
      last_message_at INTEGER NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',required_role TEXT,assigned_admin_member_id TEXT,
      escalated_at INTEGER,notification_sent_at INTEGER,source TEXT NOT NULL DEFAULT 'chat',
      notification_delivery_status TEXT,notification_last_attempt_at INTEGER,
      notification_last_error TEXT,notification_delivery_outcome TEXT,
      notification_provider_message_id TEXT,notification_delivery_event_at INTEGER,
      priority TEXT NOT NULL DEFAULT 'normal',first_response_due_at INTEGER,
      first_admin_response_at INTEGER,resolved_at INTEGER
    )`),
    env.DB.prepare(`CREATE TABLE support_messages (
      id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,sender_type TEXT NOT NULL,
      sender_user_id TEXT,body TEXT NOT NULL,created_at INTEGER NOT NULL,
      actor_admin_member_id TEXT,email_delivery_status TEXT,email_delivery_outcome TEXT,
      email_provider_message_id TEXT,email_delivery_event_at INTEGER,
      inbound_email_message_id TEXT UNIQUE,inbound_email_from TEXT,inbound_email_to TEXT
    )`),
    env.DB.prepare(`CREATE TABLE support_attachments (
      id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,message_id TEXT NOT NULL,object_key TEXT NOT NULL UNIQUE,
      filename TEXT NOT NULL,content_type TEXT NOT NULL,size_bytes INTEGER NOT NULL,created_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE email_delivery_attempts (
      id TEXT PRIMARY KEY,recipient_hash TEXT,purpose TEXT,status TEXT,
      provider_message_id TEXT,error_code TEXT,created_at INTEGER,
      delivery_outcome TEXT,delivery_event_at INTEGER
    )`),
  ]);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO "user" VALUES (?,?,?)')
      .bind("staff-user", "Support Agent", "agent@memboux.com"),
    env.DB.prepare("INSERT INTO admin_members VALUES (?,?,?,?,?,?)")
      .bind("staff-member", "staff-user", "support", "active", "agent.personal@example.com", 0),
  ]);
});

describe("inbound support email", () => {
  it("keeps a stable ticket marker and removes quoted email history", () => {
    const subject = supportTicketSubject(ticketId, "Re: Login problem");
    expect(subject).toBe(`[MBX:${ticketId}] Login problem`);
    expect(supportTicketIdFromSubject(`Re: ${subject}`)).toBe(ticketId);
    expect(cleanInboundReply(
      "My new answer\n\nOn Monday Alice wrote:\n> old answer",
      "[1 attachment added securely to this ticket.]",
    )).toBe("My new answer\n\n[1 attachment added securely to this ticket.]");
  });

  it("explains secure personal-email replies without contradicting the inbound workflow", () => {
    const greek = staffEmailReplyCopy("el");
    const english = staffEmailReplyCopy("en");

    expect(greek.description).toContain("απαντάς απευθείας");
    expect(greek.security).toContain("καταχωρισμένο email");
    expect(greek.security).toContain("screenshots και PDF");
    expect(english.description).toContain("reply directly");
    expect(english.security).toContain("verifies your identity and assignment");
    expect(english.security).toContain("added securely");
    expect(english.security).not.toContain("Replies remain inside");
  });

  it("creates one routed helpdesk ticket and deduplicates provider retries", async () => {
    const input = {
      envelopeFrom: "customer@example.com",
      envelopeTo: "support@memboux.com",
      subject: "Cannot upload a video",
      text: "The upload stops with an error every time.",
      messageId: "<new-email@example.com>",
    };
    expect(await ingestInboundSupportEmail(env, input)).toMatchObject({ status: "created" });
    expect(await ingestInboundSupportEmail(env, input)).toEqual({ status: "duplicate" });
    const conversation = await env.DB.prepare(
      "SELECT id,source,category,visitor_email,assigned_admin_member_id FROM support_conversations WHERE visitor_email=?",
    ).bind("customer@example.com").first<{
      id: string;
      source: string;
      category: string;
      visitor_email: string;
      assigned_admin_member_id: string;
    }>();
    expect(conversation).toMatchObject({
      source: "email",
      category: "technical",
      visitor_email: "customer@example.com",
      assigned_admin_member_id: null,
    });
  });

  it("imports safe email attachments into private storage and skips unsafe content", async () => {
    const input = {
      envelopeFrom: "files@example.com",
      envelopeTo: "support@memboux.com",
      subject: "Screenshots for upload issue",
      text: "",
      messageId: "<attachments@example.com>",
      attachments: [
        {
          filename: "../upload error.png",
          mimeType: "image/png",
          disposition: "attachment" as const,
          content: new Uint8Array([137, 80, 78, 71]),
        },
        {
          filename: "unsafe.html",
          mimeType: "text/html",
          disposition: "attachment" as const,
          content: new TextEncoder().encode("<script>alert(1)</script>"),
        },
        {
          filename: "fake-screenshot.png",
          mimeType: "image/png",
          disposition: "attachment" as const,
          content: new TextEncoder().encode("<script>alert(1)</script>"),
        },
      ],
    };
    expect(await ingestInboundSupportEmail(env, input)).toMatchObject({ status: "created" });
    expect(await ingestInboundSupportEmail(env, input)).toEqual({ status: "duplicate" });

    const message = await env.DB.prepare(
      "SELECT id,conversation_id,body FROM support_messages WHERE inbound_email_message_id=?",
    ).bind(input.messageId).first<{ id: string; conversation_id: string; body: string }>();
    expect(message?.body).toContain("[1 attachment added securely to this ticket.]");
    expect(message?.body).toContain("[2 unsupported, embedded, or oversized attachments skipped.]");

    const rows = await env.DB.prepare(
      "SELECT object_key,filename,content_type,size_bytes FROM support_attachments WHERE message_id=?",
    ).bind(message?.id).all<{
      object_key: string;
      filename: string;
      content_type: string;
      size_bytes: number;
    }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]).toMatchObject({
      filename: "upload error.png",
      content_type: "image/png",
      size_bytes: 4,
    });
    const object = await env.MEDIA.get(rows.results[0].object_key);
    expect(object).not.toBeNull();
    expect([...new Uint8Array(await object!.arrayBuffer())]).toEqual([137, 80, 78, 71]);
  });

  it("adds customer and authorized personal-email replies to the same audit trail", async () => {
    await env.DB.prepare(
      `INSERT INTO support_conversations
       (id,visitor_name,visitor_email,subject,status,last_message_at,created_at,updated_at,
        category,required_role,assigned_admin_member_id,source)
       VALUES (?,?,?,?,'pending',?,?,?,'general','support','staff-member','email')`,
    ).bind(ticketId, "Customer", "reply@example.com", "Account question", 1, 1, 1).run();
    await ingestInboundSupportEmail(env, {
      envelopeFrom: "reply@example.com",
      envelopeTo: "support@memboux.com",
      subject: `Re: ${supportTicketSubject(ticketId, "Account question")}`,
      text: "Here is the missing detail.",
      messageId: "<customer-reply@example.com>",
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "resend-email-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    try {
      const result = await ingestInboundSupportEmail(env, {
        envelopeFrom: "agent.personal@example.com",
        envelopeTo: "support@memboux.com",
        subject: `Re: ${supportTicketSubject(ticketId, "Account question")}`,
        text: "Thanks, this is now fixed.",
        messageId: "<staff-reply@example.com>",
      });
      expect(result).toMatchObject({ status: "admin_reply", conversationId: ticketId });
    } finally {
      fetchSpy.mockRestore();
    }

    const messages = await env.DB.prepare(
      "SELECT sender_type,body,actor_admin_member_id,email_delivery_status FROM support_messages WHERE conversation_id=? ORDER BY created_at",
    ).bind(ticketId).all<{
      sender_type: string;
      body: string;
      actor_admin_member_id: string | null;
      email_delivery_status: string | null;
    }>();
    expect(messages.results).toHaveLength(2);
    expect(messages.results[0]).toMatchObject({ sender_type: "user", body: "Here is the missing detail." });
    expect(messages.results[1]).toMatchObject({
      sender_type: "admin",
      actor_admin_member_id: "staff-member",
      email_delivery_status: "sent",
    });
  });

  it("rejects cross-ticket injection and unauthorized staff replies", async () => {
    await expect(ingestInboundSupportEmail(env, {
      envelopeFrom: "attacker@example.com",
      envelopeTo: "support@memboux.com",
      subject: supportTicketSubject(ticketId, "Account question"),
      text: "Put this into the ticket.",
      messageId: "<attack@example.com>",
    })).rejects.toThrow("support_email_sender_mismatch");

    await env.DB.batch([
      env.DB.prepare("UPDATE admin_members SET role='finance' WHERE id='staff-member'"),
      env.DB.prepare("UPDATE support_conversations SET assigned_admin_member_id=NULL,required_role='support' WHERE id=?").bind(ticketId),
    ]);
    await expect(ingestInboundSupportEmail(env, {
      envelopeFrom: "agent.personal@example.com",
      envelopeTo: "support@memboux.com",
      subject: supportTicketSubject(ticketId, "Account question"),
      text: "Unauthorized reply",
      messageId: "<unauthorized@example.com>",
    })).rejects.toThrow("support_email_staff_not_authorized");
    await env.DB.prepare("UPDATE admin_members SET role='support' WHERE id='staff-member'").run();
  });
});
