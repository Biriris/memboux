import { Hono } from "hono";
import type { Bindings } from "../domain";
import { consumeRateLimit, tooManyRequests } from "../rate-limit";
import { currentUser } from "../session";
import { answerSupportMessage } from "../support-ai";
import {
  classifySupportRequest,
  escalateSupportConversation,
  roleCanHandleSupportCategory,
  type SupportCategory,
} from "../support-routing";
import { sendEmail } from "../auth";
import { currentAdmin, recordAdminAudit, type AdminRole } from "../admin-rbac";
import { cookieValue, esc, formatDateTime, sha256 } from "../utils";
import { adminShell } from "../views/admin";
import { adminCanAccessSupportConversation } from "../support-access";
import { adminLocaleOrRedirect } from "./admin-auth";
import { supportSlaState, type SupportPriority } from "../support-sla";
import { supportTicketSubject } from "../support-email-threading";

const SUPPORT_COOKIE = "memboux_support";

type SupportConversation = {
  id: string;
  user_id: string | null;
  visitor_name: string;
  visitor_email: string;
  subject: string;
  status: "open" | "pending" | "closed";
  admin_read_at: number | null;
  user_read_at: number | null;
  last_message_at: number;
  created_at: number;
  category?: string;
  required_role?: string | null;
  assigned_admin_member_id?: string | null;
  notification_delivery_status?: "pending" | "sent" | "failed" | "disabled" | "invalid_recipient" | "unassigned" | null;
  notification_last_attempt_at?: number | null;
  notification_delivery_outcome?: string | null;
  priority?: SupportPriority;
  first_response_due_at?: number | null;
  first_admin_response_at?: number | null;
  resolved_at?: number | null;
  sla_reminder_status?: string | null;
  sla_reminder_last_attempt_at?: number | null;
  sla_escalation_status?: string | null;
  sla_escalation_last_attempt_at?: number | null;
  sla_notification_last_error?: string | null;
  assigned_name?: string | null;
  assigned_role?: string | null;
  source?: "chat" | "email";
};

const supportCategories: SupportCategory[] = ["technical", "account", "events", "billing", "privacy", "moderation", "general"];

type SupportMessage = {
  id: string;
  sender_type: "user" | "admin" | "system";
  body: string;
  created_at: number;
  email_delivery_status?: "pending" | "sent" | "failed" | null;
  email_delivery_outcome?: string | null;
  email_provider_message_id?: string | null;
};

async function sendCustomerSupportEmail(
  env: Bindings,
  conversation: Pick<SupportConversation, "id" | "visitor_email" | "subject">,
  message: string,
) {
  return sendEmail(env, {
    to: conversation.visitor_email,
    purpose: "support_customer_reply",
    from: "Memboux Support <support@mail.memboux.com>",
    replyTo: "support@memboux.com",
    subject: `Re: ${supportTicketSubject(conversation.id, conversation.subject)}`,
    text: `${message}\n\nYou can continue this conversation securely at https://memboux.com/`,
    html: `<div style="font-family:Arial,sans-serif;color:#251547;max-width:620px"><p style="text-transform:uppercase;letter-spacing:.12em;color:#6c4cf1">Memboux Support</p><div style="white-space:pre-wrap;line-height:1.7">${esc(message)}</div><hr style="margin:28px 0;border:0;border-top:1px solid #e4ddf5"><p style="font-size:12px;color:#746b88">This reply was sent from the secure Memboux Helpdesk. You can continue in the support chat at <a href="https://memboux.com/">memboux.com</a>.</p></div>`,
  });
}

export async function addAiReply(env: Bindings, conversationId: string) {
  const history = await env.DB.prepare(
    "SELECT sender_type,body FROM support_messages WHERE conversation_id=? ORDER BY created_at DESC LIMIT 12",
  ).bind(conversationId).all<Pick<SupportMessage, "sender_type" | "body">>();
  const orderedHistory = history.results.reverse();
  const conversation = await env.DB.prepare(
    "SELECT subject,category,escalated_at FROM support_conversations WHERE id=?",
  ).bind(conversationId).first<{ subject: string; category: string; escalated_at: number | null }>();
  const latestUserMessage = [...orderedHistory].reverse().find((message) => message.sender_type === "user")?.body ?? "";
  const preferredCategory = conversation && supportCategories.includes(conversation.category as SupportCategory)
    ? conversation.category as SupportCategory
    : undefined;
  const handoffMessage = /[\u0370-\u03ff]/i.test(latestUserMessage)
    ? "Το μήνυμά σου παραδόθηκε στην ομάδα υποστήριξης. Ένας εκπρόσωπος θα συνεχίσει τη συνομιλία εδώ."
    : "Your message has been handed to the support team. A specialist will continue the conversation here.";
  const acknowledgeHandoff = async () => {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO support_messages (id,conversation_id,sender_type,body,created_at) VALUES (?,?,?,?,?)")
        .bind(crypto.randomUUID(), conversationId, "system", handoffMessage, now),
      env.DB.prepare("UPDATE support_conversations SET status='open',user_read_at=NULL,last_message_at=?,updated_at=? WHERE id=?")
        .bind(now, now, conversationId),
    ]);
  };
  if (conversation?.escalated_at) {
    // Human ownership is permanent for this ticket. The message endpoint has
    // already reopened the conversation and marked it unread for staff; running
    // escalation again would duplicate handoff acknowledgements and retry staff
    // email notifications on every customer follow-up.
    return;
  }
  const answer = await answerSupportMessage(env, orderedHistory);
  if (!answer) {
    if (conversation) {
      await acknowledgeHandoff();
      await escalateSupportConversation(
        env,
        conversationId,
        conversation.subject,
        latestUserMessage,
        "AI unavailable or could not answer",
        preferredCategory,
      );
    }
    return;
  }
  const now = Date.now();
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO support_messages (id,conversation_id,sender_type,body,created_at)
      SELECT ?,id,'system',?,? FROM support_conversations
      WHERE id=? AND escalated_at IS NULL AND first_admin_response_at IS NULL`)
      .bind(crypto.randomUUID(), answer.body, now, conversationId),
    env.DB.prepare(`UPDATE support_conversations SET status=?,user_read_at=NULL,last_message_at=?,updated_at=?
      WHERE id=? AND escalated_at IS NULL AND first_admin_response_at IS NULL`)
      .bind(answer.escalate ? "open" : "pending", now, now, conversationId),
  ]);
  if (!results[0]?.meta.changes) return;
  if (answer.escalate && conversation) {
    await escalateSupportConversation(
      env,
      conversationId,
      conversation.subject,
      latestUserMessage,
      "AI requested human review",
      preferredCategory,
    );
  }
}

export function normalizeSupportMessage(value: unknown) {
  return String(value ?? "").trim().replace(/\r\n/g, "\n").slice(0, 2000);
}

function humanOwnedConversationStatement(
  db: D1Database,
  conversationId: string,
  adminMemberId: string,
  now: number,
) {
  return db.prepare(`UPDATE support_conversations SET
    status='pending',user_read_at=NULL,
    assigned_admin_member_id=COALESCE(assigned_admin_member_id,?),
    escalated_at=COALESCE(escalated_at,?),
    first_admin_response_at=COALESCE(first_admin_response_at,?),
    last_message_at=?,updated_at=? WHERE id=?`)
    .bind(adminMemberId, now, now, now, now, conversationId);
}

export async function markSupportConversationHumanOwned(
  db: D1Database,
  conversationId: string,
  adminMemberId: string,
  now = Date.now(),
) {
  return humanOwnedConversationStatement(db, conversationId, adminMemberId, now).run();
}

export function validSupportEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase().slice(0, 254);
  return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function supportCookie(token: string) {
  return `${SUPPORT_COOKIE}=${token}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`;
}

async function visitorHash(request: Request) {
  const token = cookieValue(request, SUPPORT_COOKIE);
  return token ? sha256(token) : null;
}

async function conversationForRequest(c: { env: Bindings; req: { raw: Request } }) {
  const [user, tokenHash] = await Promise.all([currentUser(c), visitorHash(c.req.raw)]);
  if (!user && !tokenHash) return { user: null, conversation: null };
  const conversation = user
    ? await c.env.DB.prepare("SELECT * FROM support_conversations WHERE user_id=? ORDER BY last_message_at DESC LIMIT 1").bind(user.id).first<SupportConversation>()
    : await c.env.DB.prepare("SELECT * FROM support_conversations WHERE visitor_token_hash=? LIMIT 1").bind(tokenHash).first<SupportConversation>();
  return { user, conversation };
}

async function conversationPayload(db: D1Database, conversation: SupportConversation, markRead = true) {
  const messages = await db.prepare("SELECT id,sender_type,body,created_at FROM support_messages WHERE conversation_id=? ORDER BY created_at ASC LIMIT 150")
    .bind(conversation.id).all<SupportMessage>();
  if (markRead && (!conversation.user_read_at || conversation.last_message_at > conversation.user_read_at))
    await db.prepare("UPDATE support_conversations SET user_read_at=? WHERE id=?").bind(Date.now(), conversation.id).run();
  return {
    conversation: {
      id: conversation.id,
      name: conversation.visitor_name,
      email: conversation.visitor_email,
      subject: conversation.subject,
      status: conversation.status,
    },
    messages: messages.results.map((message) => ({
      ...message,
      sender_type: message.sender_type === "system" ? "admin" : message.sender_type,
    })),
  };
}

export const supportRoutes = new Hono<{ Bindings: Bindings }>();

supportRoutes.get("/api/support/conversation", async (c) => {
  const { conversation } = await conversationForRequest(c);
  if (!conversation) return c.json({ conversation: null, messages: [] });
  return c.json(await conversationPayload(c.env.DB, conversation));
});

supportRoutes.post("/api/support/conversation", async (c) => {
  const rate = await consumeRateLimit(c.env.DB, c.req.raw, c.env.BETTER_AUTH_SECRET, { scope: "support-start", limit: 5, windowMs: 60 * 60_000 });
  if (!rate.allowed) return tooManyRequests(rate);
  const input: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}));
  const message = normalizeSupportMessage(input.message);
  if (message.length < 5) return c.json({ message: "Please describe the issue in at least 5 characters." }, 400);
  const email = validSupportEmail(input.email);
  if (email === null) return c.json({ message: "Enter a valid email address." }, 400);
  const existing = await conversationForRequest(c);
  if (existing.conversation && existing.conversation.status !== "closed") return c.json(await conversationPayload(c.env.DB, existing.conversation));

  const token = existing.user ? null : crypto.randomUUID() + crypto.randomUUID();
  const tokenHash = token ? await sha256(token) : null;
  const id = crypto.randomUUID();
  const now = Date.now();
  const name = existing.user?.name?.trim().slice(0, 80) || String(input.visitorName ?? input.name ?? "").trim().slice(0, 80);
  const resolvedEmail = existing.user?.email?.toLowerCase().slice(0, 254) || email || "";
  const subject = String(input.subject ?? "").trim().slice(0, 120) || "Support request";
  const category = supportCategories.includes(input.category as SupportCategory)
    ? input.category as SupportCategory
    : classifySupportRequest(subject, message);
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO support_conversations
      (id,user_id,visitor_token_hash,visitor_name,visitor_email,subject,status,category,last_message_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,'open',?,?,?,?)`)
      .bind(id, existing.user?.id ?? null, tokenHash, name, resolvedEmail, subject, category, now, now, now),
    c.env.DB.prepare("INSERT INTO support_messages (id,conversation_id,sender_type,sender_user_id,body,created_at) VALUES (?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), id, "user", existing.user?.id ?? null, message, now),
  ]);
  const conversation = await c.env.DB.prepare("SELECT * FROM support_conversations WHERE id=?").bind(id).first<SupportConversation>();
  if (!conversation) return c.json({ message: "Could not start support conversation." }, 500);
  c.executionCtx.waitUntil(addAiReply(c.env, conversation.id));
  if (token) c.header("Set-Cookie", supportCookie(token));
  return c.json(await conversationPayload(c.env.DB, conversation), 201);
});

supportRoutes.post("/api/support/messages", async (c) => {
  const rate = await consumeRateLimit(c.env.DB, c.req.raw, c.env.BETTER_AUTH_SECRET, { scope: "support-message", limit: 30, windowMs: 15 * 60_000 });
  if (!rate.allowed) return tooManyRequests(rate);
  const input: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}));
  const message = normalizeSupportMessage(input.message);
  if (message.length < 1) return c.json({ message: "Message is required." }, 400);
  const { user, conversation } = await conversationForRequest(c);
  if (!conversation || conversation.id !== String(input.conversationId ?? "")) return c.json({ message: "Conversation not found." }, 404);
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO support_messages (id,conversation_id,sender_type,sender_user_id,body,created_at) VALUES (?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), conversation.id, "user", user?.id ?? null, message, now),
    c.env.DB.prepare("UPDATE support_conversations SET status='open',admin_read_at=NULL,notification_sent_at=NULL,notification_delivery_status=NULL,notification_last_error=NULL,last_message_at=?,updated_at=? WHERE id=?")
      .bind(now, now, conversation.id),
  ]);
  c.executionCtx.waitUntil(addAiReply(c.env, conversation.id));
  const updated = await c.env.DB.prepare("SELECT * FROM support_conversations WHERE id=?").bind(conversation.id).first<SupportConversation>();
  return c.json(await conversationPayload(c.env.DB, updated!));
});

supportRoutes.get("/admin/support", async (c) => {
  const locale = await adminLocaleOrRedirect(c);
  if (!locale) return c.redirect("/admin/login");
  const admin = await currentAdmin(c);
  if (!admin) return c.redirect("/admin/login");
  const status = ["open", "pending", "closed"].includes(c.req.query("status") ?? "") ? String(c.req.query("status")) : "all";
  const category = supportCategories.includes(c.req.query("category") as SupportCategory) ? String(c.req.query("category")) : "all";
  const slaFilter = ["overdue", "at_risk"].includes(c.req.query("sla") ?? "") ? String(c.req.query("sla")) : "all";
  const assignee = ["mine", "unassigned"].includes(c.req.query("assignee") ?? "") ? String(c.req.query("assignee")) : "all";
  const now = Date.now();
  const rows = await c.env.DB.prepare(`SELECT c.*,u.name account_name,u.email account_email,
      assigned_user.name assigned_name,assigned_member.role assigned_role,
      (SELECT body FROM support_messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) last_message,
      (SELECT sender_type FROM support_messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) last_sender
    FROM support_conversations c LEFT JOIN "user" u ON u.id=c.user_id
    LEFT JOIN admin_members assigned_member ON assigned_member.id=c.assigned_admin_member_id
    LEFT JOIN "user" assigned_user ON assigned_user.id=assigned_member.user_id
    WHERE (?='all' OR c.status=?)
      AND (?='all' OR c.category=?)
      AND (?='all'
        OR (?='overdue' AND c.first_admin_response_at IS NULL AND c.first_response_due_at<=?)
        OR (?='at_risk' AND c.first_admin_response_at IS NULL AND c.first_response_due_at>? AND c.first_response_due_at<=?))
      AND (?='all'
        OR (?='mine' AND c.assigned_admin_member_id=?)
        OR (?='unassigned' AND c.assigned_admin_member_id IS NULL))
      AND (? IN ('owner','administrator') OR c.assigned_admin_member_id=? OR (c.assigned_admin_member_id IS NULL AND c.required_role=?))
    ORDER BY CASE c.status WHEN 'open' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,c.last_message_at DESC LIMIT 200`)
    .bind(
      status, status, category, category,
      slaFilter, slaFilter, now, slaFilter, now, now + 60 * 60_000,
      assignee, assignee, admin.memberId, assignee,
      admin.role, admin.memberId, admin.role,
    ).all<SupportConversation & { account_name: string | null; account_email: string | null; assigned_name: string | null; assigned_role: string | null; last_message: string; last_sender: string }>();
  const metrics = await c.env.DB.prepare(`SELECT
      COUNT(*) total,
      SUM(CASE WHEN c.status='open' THEN 1 ELSE 0 END) open_count,
      SUM(CASE WHEN c.first_admin_response_at IS NULL AND c.first_response_due_at<=? THEN 1 ELSE 0 END) overdue_count,
      SUM(CASE WHEN c.assigned_admin_member_id IS NULL AND c.status!='closed' THEN 1 ELSE 0 END) unassigned_count
    FROM support_conversations c
    WHERE (? IN ('owner','administrator') OR c.assigned_admin_member_id=? OR (c.assigned_admin_member_id IS NULL AND c.required_role=?))`)
    .bind(now, admin.role, admin.memberId, admin.role)
    .first<{ total: number; open_count: number; overdue_count: number; unassigned_count: number }>();
  const cards = rows.results.map((row) => {
    const unread = row.last_sender === "user" && (!row.admin_read_at || row.last_message_at > row.admin_read_at);
    const sla = supportSlaState(row.first_response_due_at, row.first_admin_response_at);
    const slaLabel = sla === "overdue" ? (locale === "el" ? "Εκπρόθεσμο SLA" : "SLA overdue") : sla === "at_risk" ? (locale === "el" ? "SLA < 1 ώρα" : "SLA < 1 hour") : "";
    const slaBadge = slaLabel ? `<span class="rounded-full ${sla === "overdue" ? "bg-red-100 text-red-800" : "bg-orange-100 text-orange-900"} px-3 py-1 text-xs font-bold">${esc(slaLabel)}</span>` : "";
    const statusLabel = row.status === "open" ? (locale === "el" ? "Χρειάζεται απάντηση" : "Needs reply") : row.status === "pending" ? (locale === "el" ? "Αναμονή χρήστη" : "Waiting for user") : (locale === "el" ? "Κλειστό" : "Closed");
    return `<a href="/admin/support/${row.id}" class="group grid gap-3 rounded-2xl border ${unread ? "border-[#a78bfa] bg-[#f6f2ff]" : "border-[#e9e3f2] bg-white"} p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:grid-cols-[minmax(0,1fr)_auto]"><div class="min-w-0"><div class="flex items-center gap-2"><h2 class="truncate text-lg font-semibold">${esc(row.subject)}</h2>${row.source === "email" ? `<span class="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-800">Email</span>` : ""}${unread ? `<span class="h-2.5 w-2.5 rounded-full bg-red-500"></span>` : ""}</div><p class="mt-1 truncate text-sm text-[#6f657c]">${esc(row.account_name || row.visitor_name || row.account_email || row.visitor_email || "Guest")}</p><p class="mt-2 truncate text-sm text-[#443653]">${esc(row.last_message || "")}</p><p class="mt-2 text-[11px] font-semibold uppercase tracking-wide text-[#7c3aed]">${esc(row.category ?? "general")} · ${esc(row.assigned_name || row.required_role || "Unassigned")}</p></div><div class="flex items-center gap-2 sm:flex-col sm:items-end">${slaBadge}<span class="rounded-full ${row.status === "open" ? "bg-amber-100 text-amber-900" : row.status === "pending" ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-700"} px-3 py-1 text-xs font-semibold">${statusLabel}</span><time class="text-xs text-[#887d92]">${formatDateTime(row.last_message_at, locale)}</time></div></a>`;
  }).join("");
  const metric = (label: string, value: number, tone = "") => `<div class="rounded-2xl border bg-white p-4"><p class="text-xs font-bold uppercase tracking-[.14em] ${tone || "text-[#7c3aed]"}">${esc(label)}</p><strong class="mt-2 block text-3xl">${value}</strong></div>`;
  const option = (value: string, label: string, current: string) => `<option value="${value}"${value === current ? " selected" : ""}>${esc(label)}</option>`;
  return c.html(adminShell(locale === "el" ? "Υποστήριξη" : "Support inbox", `<main class="mx-auto max-w-6xl p-5 md:p-10"><p class="text-xs font-bold uppercase tracking-[.18em] text-[#7c3aed]">Memboux Support</p><div class="mt-2"><h1 class="text-4xl">${locale === "el" ? "Live συνομιλίες" : "Live conversations"}</h1><p class="mt-2 text-sm text-[#6f657c]">${locale === "el" ? "Απαντήσεις, ανάθεση και έλεγχος SLA από ένα inbox." : "Replies, ownership and SLA control from one inbox."}</p></div><section class="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">${metric(locale === "el" ? "Σύνολο" : "Total", Number(metrics?.total ?? 0))}${metric(locale === "el" ? "Ανοιχτά" : "Open", Number(metrics?.open_count ?? 0))}${metric(locale === "el" ? "Εκπρόθεσμα" : "Overdue", Number(metrics?.overdue_count ?? 0), "text-red-700")}${metric(locale === "el" ? "Χωρίς υπεύθυνο" : "Unassigned", Number(metrics?.unassigned_count ?? 0), "text-orange-700")}</section><form class="mt-5 grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"><select name="status" class="rounded-xl border px-3 py-2.5">${option("all", locale === "el" ? "Όλες οι καταστάσεις" : "All statuses", status)}${option("open", "Open", status)}${option("pending", "Pending", status)}${option("closed", "Closed", status)}</select><select name="category" class="rounded-xl border px-3 py-2.5">${option("all", locale === "el" ? "Όλα τα τμήματα" : "All departments", category)}${supportCategories.map((value) => option(value, value, category)).join("")}</select><select name="sla" class="rounded-xl border px-3 py-2.5">${option("all", "All SLA", slaFilter)}${option("at_risk", locale === "el" ? "SLA < 1 ώρα" : "SLA < 1 hour", slaFilter)}${option("overdue", locale === "el" ? "Εκπρόθεσμα SLA" : "Overdue SLA", slaFilter)}</select><div class="flex gap-2"><select name="assignee" class="min-w-0 flex-1 rounded-xl border px-3 py-2.5">${option("all", locale === "el" ? "Όλοι οι υπεύθυνοι" : "All assignees", assignee)}${option("mine", locale === "el" ? "Δικά μου" : "Mine", assignee)}${option("unassigned", locale === "el" ? "Χωρίς υπεύθυνο" : "Unassigned", assignee)}</select><button class="rounded-xl bg-[#2b174d] px-4 py-2.5 text-sm font-bold text-white">${locale === "el" ? "Φίλτρο" : "Filter"}</button></div></form><section class="mt-7 grid gap-3">${cards || `<p class="rounded-2xl bg-white p-10 text-center text-[#6f657c]">${locale === "el" ? "Δεν υπάρχουν συνομιλίες για αυτά τα φίλτρα." : "No conversations match these filters."}</p>`}</section></main>`, locale, admin));
});

supportRoutes.get("/admin/support/:id", async (c) => {
  const locale = await adminLocaleOrRedirect(c);
  if (!locale) return c.redirect("/admin/login");
  const conversation = await c.env.DB.prepare(`SELECT c.*,u.name assigned_name,m.role assigned_role
    FROM support_conversations c
    LEFT JOIN admin_members m ON m.id=c.assigned_admin_member_id
    LEFT JOIN "user" u ON u.id=m.user_id
    WHERE c.id=?`).bind(c.req.param("id")).first<SupportConversation>();
  if (!conversation) return c.text("Conversation not found", 404);
  const admin = await currentAdmin(c);
  if (!admin) return c.redirect("/admin/login");
  if (!adminCanAccessSupportConversation(admin, conversation)) return c.text("Forbidden", 403);
  const messages = await c.env.DB.prepare("SELECT id,sender_type,body,created_at,email_delivery_status,email_delivery_outcome,email_provider_message_id FROM support_messages WHERE conversation_id=? ORDER BY created_at ASC").bind(conversation.id).all<SupportMessage>();
  await c.env.DB.prepare("UPDATE support_conversations SET admin_read_at=? WHERE id=?").bind(Date.now(), conversation.id).run();
  const thread = messages.results.map((message) => {
    const deliveryLabel = message.email_delivery_outcome ?? message.email_delivery_status;
    const delivery = message.sender_type === "admin" && deliveryLabel
      ? `<div class="mt-2 flex items-center justify-end gap-2 text-[10px] ${message.email_delivery_status === "failed" ? "text-rose-200" : "text-white/60"}"><span>Email: ${esc(deliveryLabel)}</span>${message.email_delivery_status === "failed" ? `<form action="/admin/support/${conversation.id}/messages/${message.id}/retry-email" method="post"><button class="font-bold underline">Retry</button></form>` : ""}</div>`
      : "";
    return `<article data-support-message-id="${message.id}" class="flex ${message.sender_type === "admin" ? "justify-end" : "justify-start"}"><div class="max-w-[85%] rounded-2xl ${message.sender_type === "admin" ? "bg-[#251547] text-white" : "border border-[#e4ddf5] bg-white text-[#251547]"} px-4 py-3"><p class="whitespace-pre-wrap text-sm leading-6">${esc(message.body)}</p><time class="mt-1 block text-[10px] opacity-60">${formatDateTime(message.created_at, locale)}</time>${delivery}</div></article>`;
  }).join("");
  const alertStatus = conversation.notification_delivery_status;
  const alertLabel = conversation.notification_delivery_outcome ?? alertStatus;
  const alertTone = alertStatus === "sent" ? "bg-emerald-50 text-emerald-800" : alertStatus === "failed" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900";
  const alertPanel = alertStatus
    ? `<div class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl ${alertTone} px-4 py-3 text-xs"><span><strong>${locale === "el" ? "Email εργαζομένου" : "Staff email"}:</strong> ${esc(alertLabel ?? alertStatus)}${conversation.notification_last_attempt_at ? ` · ${formatDateTime(conversation.notification_last_attempt_at, locale)}` : ""}</span>${alertStatus === "failed" ? `<form action="/admin/support/${conversation.id}/retry-staff-notification" method="post"><button class="font-bold underline">${locale === "el" ? "Επανάληψη" : "Retry"}</button></form>` : ""}</div>`
    : "";
  const sla = supportSlaState(conversation.first_response_due_at, conversation.first_admin_response_at);
  const slaPanel = conversation.first_response_due_at
    ? `<div class="mt-4 rounded-xl ${sla === "overdue" ? "bg-red-50 text-red-800" : sla === "at_risk" ? "bg-orange-50 text-orange-900" : "bg-violet-50 text-violet-900"} px-4 py-3 text-xs"><strong>First-response SLA:</strong> ${conversation.first_admin_response_at ? (locale === "el" ? "Τηρήθηκε" : "Met") : `${sla === "overdue" ? (locale === "el" ? "Εκπρόθεσμο" : "Overdue") : (locale === "el" ? "Προθεσμία" : "Due")} · ${formatDateTime(conversation.first_response_due_at, locale)}`} · ${esc(conversation.priority ?? "normal")}</div>`
    : "";
  const slaNotificationPanel = conversation.sla_reminder_status || conversation.sla_escalation_status
    ? `<div class="mt-3 grid gap-2 text-xs sm:grid-cols-2">${conversation.sla_reminder_status ? `<div class="rounded-xl border bg-white px-4 py-3"><strong>${locale === "el" ? "Υπενθύμιση SLA" : "SLA reminder"}:</strong> ${esc(conversation.sla_reminder_status)}${conversation.sla_reminder_last_attempt_at ? ` · ${formatDateTime(conversation.sla_reminder_last_attempt_at, locale)}` : ""}</div>` : ""}${conversation.sla_escalation_status ? `<div class="rounded-xl border bg-white px-4 py-3"><strong>${locale === "el" ? "Κλιμάκωση SLA" : "SLA escalation"}:</strong> ${esc(conversation.sla_escalation_status)}${conversation.sla_escalation_last_attempt_at ? ` · ${formatDateTime(conversation.sla_escalation_last_attempt_at, locale)}` : ""}</div>` : ""}</div>`
    : "";
  const claimAction = !conversation.assigned_admin_member_id
    ? `<form action="/admin/support/${conversation.id}/claim" method="post" class="mt-4"><button class="rounded-xl bg-[#7c3aed] px-4 py-2.5 text-sm font-bold text-white">${locale === "el" ? "Ανάληψη αιτήματος" : "Claim conversation"}</button></form>`
    : "";
  const eligibleMembers = ["owner", "administrator"].includes(admin.role)
    ? await c.env.DB.prepare(`SELECT m.id,m.role,u.name FROM admin_members m JOIN "user" u ON u.id=m.user_id
      WHERE m.status='active' ORDER BY u.name`).all<{ id: string; role: string; name: string }>()
    : { results: [] as Array<{ id: string; role: string; name: string }> };
  const conversationCategory = supportCategories.includes(conversation.category as SupportCategory)
    ? conversation.category as SupportCategory
    : "general";
  const eligibleForCategory = eligibleMembers.results.filter((member) =>
    roleCanHandleSupportCategory(conversationCategory, member.role as AdminRole));
  const reassignment = ["owner", "administrator"].includes(admin.role)
    ? `<form action="/admin/support/${conversation.id}/reassign" method="post" class="mt-4 flex flex-col gap-2 rounded-xl border border-[#e5def0] bg-[#faf8ff] p-4 sm:flex-row sm:items-end"><label class="min-w-0 flex-1 text-xs font-bold uppercase tracking-[.12em] text-[#756b82]">${locale === "el" ? "Υπεύθυνος" : "Assignee"}<select name="memberId" required class="mt-2 w-full rounded-xl border bg-white px-3 py-2.5 font-normal normal-case tracking-normal"><option value="">${esc(conversation.assigned_name || (locale === "el" ? "Χωρίς υπεύθυνο" : "Unassigned"))}</option>${eligibleForCategory.map((member) => `<option value="${esc(member.id)}">${esc(member.name)} · ${esc(member.role)}</option>`).join("")}</select></label><button class="rounded-xl bg-[#2b174d] px-4 py-2.5 text-sm font-bold text-white">${locale === "el" ? "Επαναδρομολόγηση" : "Reassign"}</button></form>`
    : conversation.assigned_name ? `<p class="mt-4 text-xs font-semibold text-[#756b82]">${locale === "el" ? "Υπεύθυνος" : "Assignee"}: ${esc(conversation.assigned_name)} · ${esc(conversation.assigned_role ?? "")}</p>` : "";
  const liveThreadScript = `<script>(()=>{const thread=document.querySelector('[data-support-live-thread]'),reply=document.querySelector('[data-support-reply]'),textarea=reply?.querySelector('textarea[name="message"]'),sync=document.querySelector('[data-support-sync-status]'),statusBadge=document.querySelector('[data-support-conversation-status]'),key='memboux-support-reply-${conversation.id}',seen=new Set([...document.querySelectorAll('[data-support-message-id]')].map(node=>node.dataset.supportMessageId));if(!thread)return;try{const draft=sessionStorage.getItem(key);if(draft&&textarea&&!textarea.value)textarea.value=draft}catch{}textarea?.addEventListener('input',()=>{try{sessionStorage.setItem(key,textarea.value)}catch{}});reply?.addEventListener('submit',()=>{try{sessionStorage.removeItem(key)}catch{}});const addMessage=message=>{if(seen.has(message.id))return false;seen.add(message.id);const article=document.createElement('article'),bubble=document.createElement('div'),body=document.createElement('p'),time=document.createElement('time'),admin=message.senderType==='admin';article.dataset.supportMessageId=message.id;article.className='flex '+(admin?'justify-end':'justify-start');bubble.className='max-w-[85%] rounded-2xl '+(admin?'bg-[#251547] text-white':'border border-[#e4ddf5] bg-white text-[#251547]')+' px-4 py-3';body.className='whitespace-pre-wrap text-sm leading-6';body.textContent=message.body;time.className='mt-1 block text-[10px] opacity-60';time.textContent=new Intl.DateTimeFormat(${JSON.stringify(locale)}, {dateStyle:'medium',timeStyle:'short'}).format(new Date(message.createdAt));bubble.append(body,time);if(admin&&message.emailDeliveryLabel){const delivery=document.createElement('div');delivery.className='mt-2 flex items-center justify-end gap-2 text-[10px] '+(message.emailDeliveryStatus==='failed'?'text-rose-200':'text-white/60');const label=document.createElement('span');label.textContent='Email: '+message.emailDeliveryLabel;delivery.append(label);if(message.emailDeliveryStatus==='failed'){const form=document.createElement('form'),button=document.createElement('button');form.method='post';form.action='/admin/support/${conversation.id}/messages/'+encodeURIComponent(message.id)+'/retry-email';button.className='font-bold underline';button.textContent='Retry';form.append(button);delivery.append(form)}bubble.append(delivery)}article.append(bubble);thread.append(article);return true};let busy=false;const poll=async()=>{if(busy||document.hidden)return;busy=true;if(sync)sync.textContent=${JSON.stringify(locale === "el" ? "Συγχρονισμός…" : "Syncing…")};try{const response=await fetch('/admin/support/${conversation.id}/activity',{headers:{Accept:'application/json'},cache:'no-store'});if(!response.ok)throw new Error(String(response.status));const data=await response.json(),nearBottom=thread.scrollHeight-thread.scrollTop-thread.clientHeight<120;let added=false;data.messages.forEach(message=>{added=addMessage(message)||added});if(statusBadge){statusBadge.textContent=data.status;statusBadge.dataset.status=data.status}if(added&&nearBottom)thread.scrollTo({top:thread.scrollHeight,behavior:'smooth'});if(sync)sync.textContent=${JSON.stringify(locale === "el" ? "Live · ενημερώθηκε τώρα" : "Live · updated now")}}catch{if(sync)sync.textContent=${JSON.stringify(locale === "el" ? "Η σύνδεση θα επαναληφθεί…" : "Connection will retry…")}}finally{busy=false}};thread.scrollTop=thread.scrollHeight;poll();setInterval(poll,4000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll()})})()<\/script>`;
  return c.html(adminShell(conversation.subject, `<main class="mx-auto max-w-4xl p-5 md:p-10"><a href="/admin/support" class="text-sm font-semibold text-[#7c3aed]">← ${locale === "el" ? "Support inbox" : "Support inbox"}</a><section class="mt-5 overflow-hidden rounded-[2rem] border border-[#eae4f3] bg-[#f8f5ff] shadow-sm"><header class="border-b border-[#eae4f3] bg-white p-5 sm:p-6"><div class="flex flex-col justify-between gap-3 sm:flex-row"><div><p class="text-xs uppercase tracking-[.16em] text-[#7c3aed]">${esc(conversation.visitor_name || "Guest")} · ${esc(conversation.visitor_email || "No email")}${conversation.source === "email" ? " · EMAIL" : ""}</p><h1 class="mt-2 text-3xl">${esc(conversation.subject)}</h1></div><div class="flex flex-col items-end gap-1"><span data-support-conversation-status class="h-fit rounded-full bg-[#f4effc] px-3 py-1 text-xs font-bold uppercase">${conversation.status}</span><span data-support-sync-status role="status" class="text-[10px] font-semibold text-emerald-700">${locale === "el" ? "Live σύνδεση" : "Live connection"}</span></div></div>${claimAction}${reassignment}${slaPanel}${slaNotificationPanel}${alertPanel}</header><div data-support-live-thread aria-live="polite" aria-relevant="additions" class="max-h-[55vh] space-y-3 overflow-y-auto p-5 sm:p-6">${thread}</div><footer class="border-t border-[#eae4f3] bg-white p-5"><form data-support-reply action="/admin/support/${conversation.id}/reply" method="post" class="space-y-3"><textarea name="message" required maxlength="2000" rows="4" placeholder="${locale === "el" ? "Γράψε απάντηση…" : "Write a reply…"}" class="w-full rounded-xl border px-4 py-3"></textarea><div class="flex flex-wrap justify-end gap-2"><button class="rounded-xl bg-[#2b174d] px-5 py-3 font-semibold text-white">${locale === "el" ? "Αποστολή" : "Send reply"}</button></div></form><form action="/admin/support/${conversation.id}/status" method="post" class="mt-3 text-right"><input type="hidden" name="status" value="${conversation.status === "closed" ? "open" : "closed"}"><button class="text-sm font-semibold ${conversation.status === "closed" ? "text-[#7c3aed]" : "text-red-700"}">${conversation.status === "closed" ? (locale === "el" ? "Επαναφορά συνομιλίας" : "Reopen conversation") : (locale === "el" ? "Κλείσιμο συνομιλίας" : "Close conversation")}</button></form></footer></section></main>${liveThreadScript}`, locale, admin));
});

supportRoutes.get("/admin/support/:id/activity", async (c) => {
  const locale = await adminLocaleOrRedirect(c);
  if (!locale) return c.json({ message: "Unauthorized" }, 401);
  const admin = await currentAdmin(c);
  if (!admin) return c.json({ message: "Unauthorized" }, 401);
  const conversation = await c.env.DB.prepare(
    "SELECT * FROM support_conversations WHERE id=?",
  ).bind(c.req.param("id")).first<SupportConversation>();
  if (!conversation) return c.json({ message: "Conversation not found" }, 404);
  if (!adminCanAccessSupportConversation(admin, conversation))
    return c.json({ message: "Forbidden" }, 403);
  const messages = await c.env.DB.prepare(
    `SELECT id,sender_type,body,created_at,email_delivery_status,email_delivery_outcome
     FROM support_messages WHERE conversation_id=? ORDER BY created_at ASC LIMIT 150`,
  ).bind(conversation.id).all<SupportMessage>();
  await c.env.DB.prepare(
    "UPDATE support_conversations SET admin_read_at=? WHERE id=?",
  ).bind(Date.now(), conversation.id).run();
  return c.json({
    status: conversation.status,
    messages: messages.results.map((message) => ({
      id: message.id,
      senderType: message.sender_type,
      body: message.body,
      createdAt: message.created_at,
      emailDeliveryStatus: message.email_delivery_status ?? null,
      emailDeliveryLabel: message.email_delivery_outcome ?? message.email_delivery_status ?? null,
    })),
  });
});

supportRoutes.post("/admin/support/:id/claim", async (c) => {
  const admin = await currentAdmin(c);
  if (!admin) return c.redirect("/admin/login");
  const conversation = await c.env.DB.prepare(
    "SELECT assigned_admin_member_id,required_role FROM support_conversations WHERE id=?",
  ).bind(c.req.param("id")).first<SupportConversation>();
  if (!conversation) return c.text("Conversation not found", 404);
  if (!adminCanAccessSupportConversation(admin, conversation)) return c.text("Forbidden", 403);
  const result = await c.env.DB.prepare(
    "UPDATE support_conversations SET assigned_admin_member_id=?,updated_at=? WHERE id=? AND assigned_admin_member_id IS NULL",
  ).bind(admin.memberId, Date.now(), c.req.param("id")).run();
  if (!result.meta.changes) return c.text("Conversation was already claimed", 409);
  await recordAdminAudit(c, admin, "support.conversation_claimed", "support_conversation", c.req.param("id"), {
    requiredRole: conversation.required_role ?? "unassigned",
  });
  return c.redirect(`/admin/support/${c.req.param("id")}`, 303);
});

supportRoutes.post("/admin/support/:id/reassign", async (c) => {
  const admin = await currentAdmin(c);
  if (!admin) return c.redirect("/admin/login");
  if (!["owner", "administrator"].includes(admin.role)) return c.text("Forbidden", 403);
  const conversation = await c.env.DB.prepare(
    `SELECT c.*,(SELECT body FROM support_messages m WHERE m.conversation_id=c.id
      AND m.sender_type='user' ORDER BY m.created_at DESC LIMIT 1) latest_message
     FROM support_conversations c WHERE c.id=?`,
  ).bind(c.req.param("id")).first<SupportConversation & { latest_message: string | null }>();
  if (!conversation) return c.text("Conversation not found", 404);
  if (conversation.status === "closed") return c.text("Reopen the conversation before reassigning it", 409);
  const body = await c.req.parseBody();
  const target = await c.env.DB.prepare(
    `SELECT m.id,m.role,u.name FROM admin_members m JOIN "user" u ON u.id=m.user_id
     WHERE m.id=? AND m.status='active'`,
  ).bind(String(body.memberId ?? "")).first<{ id: string; role: AdminRole; name: string }>();
  if (!target) return c.text("Active team member not found", 404);
  const category = supportCategories.includes(conversation.category as SupportCategory)
    ? conversation.category as SupportCategory
    : "general";
  if (!roleCanHandleSupportCategory(category, target.role))
    return c.text("This role is not eligible for the conversation category", 409);
  const previousAssignee = conversation.assigned_admin_member_id;
  await c.env.DB.prepare(`UPDATE support_conversations SET
      assigned_admin_member_id=?,required_role=?,
      notification_sent_at=NULL,notification_delivery_status=NULL,
      notification_delivery_outcome=NULL,notification_provider_message_id=NULL,
      notification_last_error=NULL,updated_at=?
    WHERE id=?`).bind(target.id, target.role, Date.now(), conversation.id).run();
  await recordAdminAudit(c, admin, "support.conversation_reassigned", "support_conversation", conversation.id, {
    from: previousAssignee ?? "unassigned",
    to: target.id,
    role: target.role,
  });
  await escalateSupportConversation(
    c.env,
    conversation.id,
    conversation.subject,
    conversation.latest_message ?? "",
    `Manual reassignment by ${admin.name}`,
  );
  return c.redirect(`/admin/support/${conversation.id}`, 303);
});

supportRoutes.post("/admin/support/:id/retry-staff-notification", async (c) => {
  const admin = await currentAdmin(c);
  if (!admin) return c.redirect("/admin/login");
  const conversation = await c.env.DB.prepare(
    "SELECT * FROM support_conversations WHERE id=?",
  ).bind(c.req.param("id")).first<SupportConversation>();
  if (!conversation) return c.text("Conversation not found", 404);
  if (!adminCanAccessSupportConversation(admin, conversation)) return c.text("Forbidden", 403);
  if (conversation.notification_delivery_status !== "failed")
    return c.redirect(`/admin/support/${conversation.id}`, 303);
  const latest = await c.env.DB.prepare(
    "SELECT body FROM support_messages WHERE conversation_id=? AND sender_type='user' ORDER BY created_at DESC LIMIT 1",
  ).bind(conversation.id).first<{ body: string }>();
  await c.env.DB.prepare(
    "UPDATE support_conversations SET notification_sent_at=NULL,notification_delivery_status=NULL,notification_last_error=NULL WHERE id=?",
  ).bind(conversation.id).run();
  await escalateSupportConversation(
    c.env,
    conversation.id,
    conversation.subject,
    latest?.body ?? "",
    "Manual delivery retry from Admin Centre",
  );
  return c.redirect(`/admin/support/${conversation.id}`, 303);
});

supportRoutes.post("/admin/support/:id/reply", async (c) => {
  const admin = await currentAdmin(c);
  if (!admin) return c.redirect("/admin/login");
  const conversation = await c.env.DB.prepare(
    "SELECT * FROM support_conversations WHERE id=?",
  ).bind(c.req.param("id")).first<SupportConversation>();
  if (!conversation) return c.text("Conversation not found", 404);
  if (!adminCanAccessSupportConversation(admin, conversation)) return c.text("Forbidden", 403);
  const body = await c.req.parseBody();
  const message = normalizeSupportMessage(body.message);
  if (!message) return c.text("Message is required", 400);
  const now = Date.now();
  const messageId = crypto.randomUUID();
  const shouldEmail = Boolean(conversation.visitor_email);
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO support_messages (id,conversation_id,sender_type,body,created_at,actor_admin_member_id,email_delivery_status) VALUES (?,?,?,?,?,?,?)")
      .bind(messageId, c.req.param("id"), "admin", message, now, admin.memberId, shouldEmail ? "pending" : null),
    humanOwnedConversationStatement(c.env.DB, c.req.param("id"), admin.memberId, now),
  ]);
  if (shouldEmail) {
    try {
      const providerMessageId = await sendCustomerSupportEmail(c.env, conversation, message);
      await c.env.DB.prepare(
        `UPDATE support_messages SET email_delivery_status='sent',
         email_delivery_outcome='accepted',email_provider_message_id=?,
         email_delivery_event_at=? WHERE id=?`,
      ).bind(providerMessageId, Date.now(), messageId).run();
    } catch (error) {
      await c.env.DB.prepare("UPDATE support_messages SET email_delivery_status='failed' WHERE id=?").bind(messageId).run();
      console.error(JSON.stringify({
        event: "support_customer_email_failed",
        conversationId: conversation.id,
        messageId,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }
  await recordAdminAudit(c, admin, "support.reply_sent", "support_conversation", conversation.id, {
    messageId,
    emailRequested: shouldEmail,
  });
  return c.redirect(`/admin/support/${c.req.param("id")}`, 303);
});

supportRoutes.post("/admin/support/:id/messages/:messageId/retry-email", async (c) => {
  const admin = await currentAdmin(c);
  if (!admin) return c.redirect("/admin/login");
  const conversation = await c.env.DB.prepare(
    "SELECT * FROM support_conversations WHERE id=?",
  ).bind(c.req.param("id")).first<SupportConversation>();
  if (!conversation) return c.text("Conversation not found", 404);
  if (!adminCanAccessSupportConversation(admin, conversation)) return c.text("Forbidden", 403);
  if (!conversation.visitor_email) return c.text("No customer email is available", 409);
  const message = await c.env.DB.prepare(
    `SELECT id,body,email_delivery_status FROM support_messages
     WHERE id=? AND conversation_id=? AND sender_type='admin'`,
  ).bind(c.req.param("messageId"), conversation.id).first<Pick<SupportMessage, "id" | "body" | "email_delivery_status">>();
  if (!message) return c.text("Message not found", 404);
  if (message.email_delivery_status === "sent") return c.redirect(`/admin/support/${conversation.id}`, 303);
  await c.env.DB.prepare(
    "UPDATE support_messages SET email_delivery_status='pending' WHERE id=?",
  ).bind(message.id).run();
  try {
    const providerMessageId = await sendCustomerSupportEmail(c.env, conversation, message.body);
    await c.env.DB.prepare(
      `UPDATE support_messages SET email_delivery_status='sent',
       email_delivery_outcome='accepted',email_provider_message_id=?,
       email_delivery_event_at=? WHERE id=?`,
    ).bind(providerMessageId, Date.now(), message.id).run();
  } catch (error) {
    await c.env.DB.prepare(
      "UPDATE support_messages SET email_delivery_status='failed' WHERE id=?",
    ).bind(message.id).run();
    console.error(JSON.stringify({
      event: "support_customer_email_retry_failed",
      conversationId: conversation.id,
      messageId: message.id,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
  return c.redirect(`/admin/support/${conversation.id}`, 303);
});

supportRoutes.post("/admin/support/:id/status", async (c) => {
  const admin = await currentAdmin(c);
  if (!admin) return c.redirect("/admin/login");
  const conversation = await c.env.DB.prepare(
    "SELECT assigned_admin_member_id,required_role FROM support_conversations WHERE id=?",
  ).bind(c.req.param("id")).first<Pick<SupportConversation, "assigned_admin_member_id" | "required_role">>();
  if (!conversation) return c.text("Conversation not found", 404);
  if (!adminCanAccessSupportConversation(admin, conversation)) return c.text("Forbidden", 403);
  const body = await c.req.parseBody();
  const status = body.status === "closed" ? "closed" : "open";
  const now = Date.now();
  await c.env.DB.prepare(
    "UPDATE support_conversations SET status=?,resolved_at=?,updated_at=? WHERE id=?",
  ).bind(status, status === "closed" ? now : null, now, c.req.param("id")).run();
  await recordAdminAudit(c, admin, status === "closed" ? "support.conversation_closed" : "support.conversation_reopened", "support_conversation", c.req.param("id"), {});
  return c.redirect(`/admin/support/${c.req.param("id")}`, 303);
});
