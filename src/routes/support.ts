import { Hono } from "hono";
import type { Bindings } from "../domain";
import { consumeRateLimit, tooManyRequests } from "../rate-limit";
import { currentUser } from "../session";
import { cookieValue, esc, formatDateTime, sha256 } from "../utils";
import { adminShell } from "../views/admin";
import { adminLocaleOrRedirect, isAdmin } from "./admin-auth";

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
};

type SupportMessage = {
  id: string;
  sender_type: "user" | "admin" | "system";
  body: string;
  created_at: number;
};

export function normalizeSupportMessage(value: unknown) {
  return String(value ?? "").trim().replace(/\r\n/g, "\n").slice(0, 2000);
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
    messages: messages.results,
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
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO support_conversations
      (id,user_id,visitor_token_hash,visitor_name,visitor_email,subject,status,last_message_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,'open',?,?,?)`)
      .bind(id, existing.user?.id ?? null, tokenHash, name, resolvedEmail, subject, now, now, now),
    c.env.DB.prepare("INSERT INTO support_messages (id,conversation_id,sender_type,sender_user_id,body,created_at) VALUES (?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), id, "user", existing.user?.id ?? null, message, now),
  ]);
  const conversation = await c.env.DB.prepare("SELECT * FROM support_conversations WHERE id=?").bind(id).first<SupportConversation>();
  if (!conversation) return c.json({ message: "Could not start support conversation." }, 500);
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
    c.env.DB.prepare("UPDATE support_conversations SET status='open',admin_read_at=NULL,last_message_at=?,updated_at=? WHERE id=?")
      .bind(now, now, conversation.id),
  ]);
  const updated = await c.env.DB.prepare("SELECT * FROM support_conversations WHERE id=?").bind(conversation.id).first<SupportConversation>();
  return c.json(await conversationPayload(c.env.DB, updated!));
});

supportRoutes.get("/admin/support", async (c) => {
  const locale = await adminLocaleOrRedirect(c);
  if (!locale) return c.redirect("/admin/login");
  const status = ["open", "pending", "closed"].includes(c.req.query("status") ?? "") ? String(c.req.query("status")) : "all";
  const rows = await c.env.DB.prepare(`SELECT c.*,u.name account_name,u.email account_email,
      (SELECT body FROM support_messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) last_message,
      (SELECT sender_type FROM support_messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) last_sender
    FROM support_conversations c LEFT JOIN "user" u ON u.id=c.user_id
    WHERE (?='all' OR c.status=?) ORDER BY CASE c.status WHEN 'open' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,c.last_message_at DESC LIMIT 200`)
    .bind(status, status).all<SupportConversation & { account_name: string | null; account_email: string | null; last_message: string; last_sender: string }>();
  const cards = rows.results.map((row) => {
    const unread = row.last_sender === "user" && (!row.admin_read_at || row.last_message_at > row.admin_read_at);
    const statusLabel = row.status === "open" ? (locale === "el" ? "Χρειάζεται απάντηση" : "Needs reply") : row.status === "pending" ? (locale === "el" ? "Αναμονή χρήστη" : "Waiting for user") : (locale === "el" ? "Κλειστό" : "Closed");
    return `<a href="/admin/support/${row.id}" class="group grid gap-3 rounded-2xl border ${unread ? "border-[#75a895] bg-[#f3f8f6]" : "border-[#dee7e3] bg-white"} p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:grid-cols-[minmax(0,1fr)_auto]"><div class="min-w-0"><div class="flex items-center gap-2"><h2 class="truncate text-lg font-semibold">${esc(row.subject)}</h2>${unread ? `<span class="h-2.5 w-2.5 rounded-full bg-red-500"></span>` : ""}</div><p class="mt-1 truncate text-sm text-[#65756f]">${esc(row.account_name || row.visitor_name || row.account_email || row.visitor_email || "Guest")}</p><p class="mt-2 truncate text-sm text-[#344941]">${esc(row.last_message || "")}</p></div><div class="flex items-center gap-2 sm:flex-col sm:items-end"><span class="rounded-full ${row.status === "open" ? "bg-amber-100 text-amber-900" : row.status === "pending" ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-700"} px-3 py-1 text-xs font-semibold">${statusLabel}</span><time class="text-xs text-[#7a8984]">${formatDateTime(row.last_message_at, locale)}</time></div></a>`;
  }).join("");
  const selected = (value: string) => status === value ? " selected" : "";
  return c.html(adminShell(locale === "el" ? "Υποστήριξη" : "Support inbox", `<main class="mx-auto max-w-6xl p-5 md:p-10"><p class="text-xs font-bold uppercase tracking-[.18em] text-[#2f6b5b]">Memboux Support</p><div class="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 class="text-4xl">${locale === "el" ? "Live συνομιλίες" : "Live conversations"}</h1><p class="mt-2 text-sm text-[#65756f]">${locale === "el" ? "Απαντήσεις σε χρήστες και επισκέπτες από ένα inbox." : "Reply to members and visitors from one inbox."}</p></div><form><select name="status" onchange="this.form.submit()" class="rounded-xl border bg-white px-4 py-3"><option value="all">${locale === "el" ? "Όλες" : "All"}</option><option value="open"${selected("open")}>Open</option><option value="pending"${selected("pending")}>Pending</option><option value="closed"${selected("closed")}>Closed</option></select></form></div><section class="mt-7 grid gap-3">${cards || `<p class="rounded-2xl bg-white p-10 text-center text-[#65756f]">${locale === "el" ? "Δεν υπάρχουν συνομιλίες." : "No conversations yet."}</p>`}</section></main>`, locale));
});

supportRoutes.get("/admin/support/:id", async (c) => {
  const locale = await adminLocaleOrRedirect(c);
  if (!locale) return c.redirect("/admin/login");
  const conversation = await c.env.DB.prepare("SELECT * FROM support_conversations WHERE id=?").bind(c.req.param("id")).first<SupportConversation>();
  if (!conversation) return c.text("Conversation not found", 404);
  const messages = await c.env.DB.prepare("SELECT id,sender_type,body,created_at FROM support_messages WHERE conversation_id=? ORDER BY created_at ASC").bind(conversation.id).all<SupportMessage>();
  await c.env.DB.prepare("UPDATE support_conversations SET admin_read_at=? WHERE id=?").bind(Date.now(), conversation.id).run();
  const thread = messages.results.map((message) => `<article class="flex ${message.sender_type === "admin" ? "justify-end" : "justify-start"}"><div class="max-w-[85%] rounded-2xl ${message.sender_type === "admin" ? "bg-[#183c33] text-white" : "border border-[#dfe8e4] bg-white text-[#183c33]"} px-4 py-3"><p class="whitespace-pre-wrap text-sm leading-6">${esc(message.body)}</p><time class="mt-1 block text-[10px] opacity-60">${formatDateTime(message.created_at, locale)}</time></div></article>`).join("");
  return c.html(adminShell(conversation.subject, `<main class="mx-auto max-w-4xl p-5 md:p-10"><a href="/admin/support" class="text-sm font-semibold text-[#2f6b5b]">← ${locale === "el" ? "Support inbox" : "Support inbox"}</a><section class="mt-5 overflow-hidden rounded-[2rem] border border-[#dfe8e4] bg-[#f5f8f6] shadow-sm"><header class="border-b border-[#dfe8e4] bg-white p-5 sm:p-6"><div class="flex flex-col justify-between gap-3 sm:flex-row"><div><p class="text-xs uppercase tracking-[.16em] text-[#2f6b5b]">${esc(conversation.visitor_name || "Guest")} · ${esc(conversation.visitor_email || "No email")}</p><h1 class="mt-2 text-3xl">${esc(conversation.subject)}</h1></div><span class="h-fit rounded-full bg-[#edf4f1] px-3 py-1 text-xs font-bold uppercase">${conversation.status}</span></div></header><div class="max-h-[55vh] space-y-3 overflow-y-auto p-5 sm:p-6">${thread}</div><footer class="border-t border-[#dfe8e4] bg-white p-5"><form action="/admin/support/${conversation.id}/reply" method="post" class="space-y-3"><textarea name="message" required maxlength="2000" rows="4" placeholder="${locale === "el" ? "Γράψε απάντηση…" : "Write a reply…"}" class="w-full rounded-xl border px-4 py-3"></textarea><div class="flex flex-wrap justify-end gap-2"><button class="rounded-xl bg-[#183c33] px-5 py-3 font-semibold text-white">${locale === "el" ? "Αποστολή" : "Send reply"}</button></div></form><form action="/admin/support/${conversation.id}/status" method="post" class="mt-3 text-right"><input type="hidden" name="status" value="${conversation.status === "closed" ? "open" : "closed"}"><button class="text-sm font-semibold ${conversation.status === "closed" ? "text-[#2f6b5b]" : "text-red-700"}">${conversation.status === "closed" ? (locale === "el" ? "Επαναφορά συνομιλίας" : "Reopen conversation") : (locale === "el" ? "Κλείσιμο συνομιλίας" : "Close conversation")}</button></form></footer></section></main>`, locale));
});

supportRoutes.post("/admin/support/:id/reply", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin/login");
  const body = await c.req.parseBody();
  const message = normalizeSupportMessage(body.message);
  if (!message) return c.text("Message is required", 400);
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO support_messages (id,conversation_id,sender_type,body,created_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), c.req.param("id"), "admin", message, now),
    c.env.DB.prepare("UPDATE support_conversations SET status='pending',user_read_at=NULL,last_message_at=?,updated_at=? WHERE id=?").bind(now, now, c.req.param("id")),
  ]);
  return c.redirect(`/admin/support/${c.req.param("id")}`, 303);
});

supportRoutes.post("/admin/support/:id/status", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin/login");
  const body = await c.req.parseBody();
  const status = body.status === "closed" ? "closed" : "open";
  await c.env.DB.prepare("UPDATE support_conversations SET status=?,updated_at=? WHERE id=?").bind(status, Date.now(), c.req.param("id")).run();
  return c.redirect(`/admin/support/${c.req.param("id")}`, 303);
});
