import PostalMime from "postal-mime";
import { sendEmail } from "./auth";
import type { AdminIdentity } from "./admin-rbac";
import type { Bindings } from "./domain";
import { adminCanAccessSupportConversation } from "./support-access";
import {
  classifySupportRequest,
  escalateSupportConversation,
  type SupportCategory,
} from "./support-routing";
import { esc } from "./utils";
import { supportTicketIdFromSubject, supportTicketSubject } from "./support-email-threading";
import { supportStaffForSender } from "./support-staff-email";
import {
  deleteStoredSupportAttachments,
  inboundAttachmentSummary,
  prepareSupportAttachments,
  storeSupportAttachments,
  supportAttachmentInsertStatements,
  type PreparedSupportAttachment,
  type SupportAttachmentInput,
} from "./support-attachments";

const SUPPORT_RECIPIENTS = new Set(["support@memboux.com", "info@memboux.com"]);
const MAX_INBOUND_BYTES = 15 * 1024 * 1024;

type Conversation = {
  id: string;
  visitor_email: string;
  visitor_name: string;
  subject: string;
  category: SupportCategory;
  assigned_admin_member_id: string | null;
  required_role: string | null;
};

export type InboundSupportEmail = {
  envelopeFrom: string;
  envelopeTo: string;
  subject: string;
  text: string;
  messageId: string;
  attachments?: SupportAttachmentInput[];
};

function normalizeAddress(value: string) {
  return value.trim().toLowerCase().slice(0, 254);
}

function plainTextFromHtml(value: string) {
  return value
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|blockquote)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function cleanInboundReply(value: string, attachmentSummary = "") {
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  const withoutQuotedThread = normalized
    .split(/\n(?:On .+wrote:|Στις .+έγραψε:|Le .+a écrit\s*:|Am .+schrieb .+:|El .+escribió:|Il .+ha scritto:)\s*\n/i, 1)[0]
    .split(/\n-{2,}\s*(?:Original Message|Forwarded message)\s*-{2,}/i, 1)[0]
    .split("\n")
    .filter((line) => !line.trimStart().startsWith(">"))
    .join("\n")
    .trim();
  const body = (withoutQuotedThread || normalized).slice(0, 8_000);
  return [body, attachmentSummary].filter(Boolean).join("\n\n");
}

async function conversationFromSubject(db: D1Database, subject: string) {
  const id = supportTicketIdFromSubject(subject);
  if (!id) return null;
  return db.prepare(
    `SELECT id,visitor_email,visitor_name,subject,category,
      assigned_admin_member_id,required_role
     FROM support_conversations WHERE id=?`,
  ).bind(id).first<Conversation>();
}

async function recordAdminEmailReply(
  env: Bindings,
  conversation: Conversation,
  admin: AdminIdentity,
  input: InboundSupportEmail,
  body: string,
  attachments: PreparedSupportAttachment[],
) {
  if (!adminCanAccessSupportConversation(admin, conversation))
    throw new Error("support_email_staff_not_authorized");
  const now = Date.now();
  const messageId = crypto.randomUUID();
  const shouldEmail = Boolean(conversation.visitor_email);
  const stored = await storeSupportAttachments(env, conversation.id, messageId, attachments, now);
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO support_messages
         (id,conversation_id,sender_type,body,created_at,actor_admin_member_id,
          email_delivery_status,inbound_email_message_id,inbound_email_from,inbound_email_to)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        messageId,
        conversation.id,
        "admin",
        body,
        now,
        admin.memberId,
        shouldEmail ? "pending" : null,
        input.messageId,
        input.envelopeFrom,
        input.envelopeTo,
      ),
      env.DB.prepare(
        `UPDATE support_conversations SET status='pending',user_read_at=NULL,
         assigned_admin_member_id=COALESCE(assigned_admin_member_id,?),
         escalated_at=COALESCE(escalated_at,?),
         first_admin_response_at=COALESCE(first_admin_response_at,?),
         last_message_at=?,updated_at=? WHERE id=?`,
      ).bind(admin.memberId, now, now, now, now, conversation.id),
      ...supportAttachmentInsertStatements(env.DB, stored),
    ]);
  } catch (error) {
    await deleteStoredSupportAttachments(env, stored).catch(() => undefined);
    throw error;
  }
  await env.DB.prepare(
    `INSERT INTO admin_audit_log
     (id,actor_user_id,action,target_type,target_id,metadata_json,ip_hash,created_at)
     VALUES (?,?,?,?,?,?,NULL,?)`,
  ).bind(
    crypto.randomUUID(),
    admin.userId,
    "support.email_reply_ingested",
    "support_conversation",
    conversation.id,
    JSON.stringify({ messageId, sender: input.envelopeFrom }),
    now,
  ).run().catch(() => undefined);
  if (!shouldEmail) return;
  try {
    const providerMessageId = await sendEmail(env, {
      to: conversation.visitor_email,
      purpose: "support_customer_reply",
      from: "Memboux Support <support@mail.memboux.com>",
      replyTo: "support@memboux.com",
      subject: `Re: ${supportTicketSubject(conversation.id, conversation.subject)}`,
      text: `${body}\n\nReply to this email to continue ticket ${conversation.id}.`,
      html: `<div style="font-family:Arial,sans-serif;color:#251547;max-width:620px"><p style="text-transform:uppercase;letter-spacing:.12em;color:#6c4cf1">Memboux Support</p><div style="white-space:pre-wrap;line-height:1.7">${esc(body)}</div><hr style="margin:28px 0;border:0;border-top:1px solid #e4ddf5"><p style="font-size:12px;color:#746b88">Reply to this email to continue the same helpdesk ticket.</p></div>`,
    });
    await env.DB.prepare(
      `UPDATE support_messages SET email_delivery_status='sent',
       email_delivery_outcome='accepted',email_provider_message_id=?,
       email_delivery_event_at=? WHERE id=?`,
    ).bind(providerMessageId, Date.now(), messageId).run();
  } catch (error) {
    await env.DB.prepare(
      "UPDATE support_messages SET email_delivery_status='failed',email_delivery_outcome='failed',email_delivery_event_at=? WHERE id=?",
    ).bind(Date.now(), messageId).run();
    console.error(JSON.stringify({
      event: "inbound_staff_reply_delivery_failed",
      conversationId: conversation.id,
      messageId,
      error: error instanceof Error ? error.message.slice(0, 180) : "unknown",
    }));
  }
}

async function recordCustomerEmail(
  env: Bindings,
  conversation: Conversation,
  input: InboundSupportEmail,
  body: string,
  attachments: PreparedSupportAttachment[],
) {
  if (normalizeAddress(conversation.visitor_email) !== input.envelopeFrom)
    throw new Error("support_email_sender_mismatch");
  const now = Date.now();
  const messageId = crypto.randomUUID();
  const stored = await storeSupportAttachments(env, conversation.id, messageId, attachments, now);
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO support_messages
         (id,conversation_id,sender_type,body,created_at,
          inbound_email_message_id,inbound_email_from,inbound_email_to)
         VALUES (?,?,?,?,?,?,?,?)`,
      ).bind(
        messageId,
        conversation.id,
        "user",
        body,
        now,
        input.messageId,
        input.envelopeFrom,
        input.envelopeTo,
      ),
      env.DB.prepare(
        `UPDATE support_conversations SET status='open',admin_read_at=NULL,
         notification_sent_at=NULL,notification_delivery_status=NULL,
         notification_last_error=NULL,last_message_at=?,updated_at=? WHERE id=?`,
      ).bind(now, now, conversation.id),
      ...supportAttachmentInsertStatements(env.DB, stored),
    ]);
  } catch (error) {
    await deleteStoredSupportAttachments(env, stored).catch(() => undefined);
    throw error;
  }
  await escalateSupportConversation(
    env,
    conversation.id,
    conversation.subject,
    body,
    "Customer replied by email",
    conversation.category,
  );
}

async function createEmailConversation(
  env: Bindings,
  input: InboundSupportEmail,
  body: string,
  attachments: PreparedSupportAttachment[],
) {
  const now = Date.now();
  const conversationId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  const subject = input.subject.replace(/^\s*(re|fwd?)\s*:\s*/i, "").trim().slice(0, 120) || "Email support request";
  const category = classifySupportRequest(subject, body);
  const stored = await storeSupportAttachments(env, conversationId, messageId, attachments, now);
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO support_conversations
         (id,user_id,visitor_token_hash,visitor_name,visitor_email,subject,status,
          category,source,last_message_at,created_at,updated_at)
         VALUES (?,NULL,NULL,?,?,?,'open',?,'email',?,?,?)`,
      ).bind(conversationId, input.envelopeFrom.split("@", 1)[0].slice(0, 80), input.envelopeFrom, subject, category, now, now, now),
      env.DB.prepare(
        `INSERT INTO support_messages
         (id,conversation_id,sender_type,body,created_at,
          inbound_email_message_id,inbound_email_from,inbound_email_to)
         VALUES (?,?,?,?,?,?,?,?)`,
      ).bind(messageId, conversationId, "user", body, now, input.messageId, input.envelopeFrom, input.envelopeTo),
      ...supportAttachmentInsertStatements(env.DB, stored),
    ]);
  } catch (error) {
    await deleteStoredSupportAttachments(env, stored).catch(() => undefined);
    throw error;
  }
  await escalateSupportConversation(
    env,
    conversationId,
    subject,
    body,
    input.envelopeTo === "info@memboux.com" ? "New email to info@memboux.com" : "New support email",
    category,
  );
}

export async function ingestInboundSupportEmail(env: Bindings, raw: InboundSupportEmail) {
  const input = {
    ...raw,
    envelopeFrom: normalizeAddress(raw.envelopeFrom),
    envelopeTo: normalizeAddress(raw.envelopeTo),
    subject: raw.subject.trim().slice(0, 500),
    messageId: raw.messageId.trim().slice(0, 500),
  };
  if (!SUPPORT_RECIPIENTS.has(input.envelopeTo)) throw new Error("support_email_recipient_not_allowed");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.envelopeFrom)) throw new Error("support_email_sender_invalid");
  if (!input.messageId) throw new Error("support_email_message_id_missing");
  const duplicate = await env.DB.prepare(
    "SELECT id FROM support_messages WHERE inbound_email_message_id=?",
  ).bind(input.messageId).first<{ id: string }>();
  if (duplicate) return { status: "duplicate" as const };
  const prepared = prepareSupportAttachments(input.attachments);
  const body = cleanInboundReply(
    input.text,
    inboundAttachmentSummary(prepared.accepted.length, prepared.skipped),
  );
  if (!body) throw new Error("support_email_body_empty");
  const conversation = await conversationFromSubject(env.DB, input.subject);
  const staff = await supportStaffForSender(env.DB, input.envelopeFrom);
  if (staff) {
    if (!conversation) throw new Error("support_email_ticket_required_for_staff");
    await recordAdminEmailReply(env, conversation, staff, input, body, prepared.accepted);
    return { status: "admin_reply" as const, conversationId: conversation.id };
  }
  if (conversation) {
    await recordCustomerEmail(env, conversation, input, body, prepared.accepted);
    return { status: "customer_reply" as const, conversationId: conversation.id };
  }
  await createEmailConversation(env, input, body, prepared.accepted);
  return { status: "created" as const };
}

export async function handleSupportEmailMessage(
  message: ForwardableEmailMessage,
  env: Bindings,
) {
  const recipient = normalizeAddress(message.to);
  if (!SUPPORT_RECIPIENTS.has(recipient)) {
    message.setReject("This mailbox is not available.");
    return;
  }
  if (message.rawSize > MAX_INBOUND_BYTES) {
    message.setReject("Message exceeds the 15 MB support-email limit.");
    return;
  }
  const raw = await new Response(message.raw).arrayBuffer();
  const parsed = await PostalMime.parse(raw);
  const text = parsed.text?.trim() || plainTextFromHtml(parsed.html || "").trim();
  try {
    await ingestInboundSupportEmail(env, {
      envelopeFrom: message.from,
      envelopeTo: recipient,
      subject: parsed.subject || message.headers.get("subject") || "",
      text,
      messageId: message.headers.get("message-id") || `cloudflare:${crypto.randomUUID()}`,
      attachments: parsed.attachments,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    if (reason.startsWith("support_email_")) {
      message.setReject("This message could not be accepted by the support mailbox.");
      return;
    }
    throw error;
  }
}
