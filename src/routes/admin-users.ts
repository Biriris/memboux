import { Hono } from "hono";
import type { Bindings, EventRole, EventRow } from "../domain";
import { formatBytes } from "../quotas";
import { adminShell } from "../views/admin";
import { dateInput, esc, formatDate, formatDateTime, formatEventDates } from "../utils";
import { adminLocaleOrRedirect, isAdmin } from "./admin-auth";

export const adminUserRoutes = new Hono<{ Bindings: Bindings }>();

type SubscriptionStatus = "none" | "trialing" | "active" | "past_due" | "canceled" | "complimentary";
type PlanKey = "beta" | "pro" | "studio" | "custom";

type AdminUserListRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: number;
  image: string | null;
  createdAt: number;
  plan_key: PlanKey;
  storage_limit_bytes: number;
  used_bytes: number;
  event_limit: number;
  owned_events: number;
  shared_events: number;
  professional_status: string | null;
  subscription_status: SubscriptionStatus;
  billing_provider: string;
  billing_interval: string;
  amount_minor: number;
  currency: string;
  last_payment_at: number | null;
};

type SubscriptionRow = {
  user_id: string;
  plan_key: PlanKey;
  status: SubscriptionStatus;
  billing_provider: "none" | "manual" | "stripe";
  billing_interval: "none" | "month" | "year" | "one_time";
  amount_minor: number;
  currency: string;
  external_customer_id: string | null;
  external_subscription_id: string | null;
  started_at: number | null;
  current_period_end: number | null;
  canceled_at: number | null;
  last_payment_at: number | null;
  created_at: number;
  updated_at: number;
};

type PaymentRow = {
  id: string;
  provider: "manual" | "stripe";
  status: "paid" | "refunded" | "failed";
  amount_minor: number;
  currency: string;
  provider_payment_id: string | null;
  note: string | null;
  paid_at: number | null;
  created_at: number;
};

const subscriptionLabels: Record<SubscriptionStatus, { en: string; el: string; className: string }> = {
  none: { en: "No subscription", el: "Χωρίς συνδρομή", className: "bg-slate-100 text-slate-700" },
  trialing: { en: "Trial", el: "Δοκιμαστική", className: "bg-sky-100 text-sky-800" },
  active: { en: "Active", el: "Ενεργή", className: "bg-emerald-100 text-emerald-800" },
  past_due: { en: "Past due", el: "Εκκρεμεί πληρωμή", className: "bg-amber-100 text-amber-900" },
  canceled: { en: "Canceled", el: "Ακυρωμένη", className: "bg-red-100 text-red-800" },
  complimentary: { en: "Complimentary", el: "Δωρεάν παραχώρηση", className: "bg-violet-100 text-violet-800" },
};

export function formatSubscriptionMoney(amountMinor: number, currency: string, locale: "el" | "en") {
  try {
    return new Intl.NumberFormat(locale === "el" ? "el-GR" : "en-GB", {
      style: "currency",
      currency,
    }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}

export function subscriptionBadge(status: SubscriptionStatus, locale: "el" | "en") {
  const meta = subscriptionLabels[status];
  return `<span class="rounded-full px-3 py-1 text-xs font-semibold ${meta.className}">${locale === "el" ? meta.el : meta.en}</span>`;
}

function roleSummary(user: AdminUserListRow, locale: "el" | "en") {
  const roles = [
    user.professional_status ? (locale === "el" ? "Professional" : "Professional") : null,
    user.owned_events ? (locale === "el" ? `Owner (${user.owned_events})` : `Owner (${user.owned_events})`) : null,
    user.shared_events ? (locale === "el" ? `Συνεργάτης (${user.shared_events})` : `Collaborator (${user.shared_events})`) : null,
  ].filter(Boolean);
  return roles.length ? roles.join(" · ") : (locale === "el" ? "Μέλος" : "Member");
}

function roleBadge(role: EventRole, locale: "el" | "en") {
  const label = role === "owner"
    ? "Owner"
    : role === "editor"
      ? (locale === "el" ? "Διαχειριστής" : "Manager")
      : (locale === "el" ? "Θεατής" : "Viewer");
  const color = role === "owner" ? "bg-indigo-100 text-indigo-800" : role === "editor" ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-700";
  return `<span class="rounded-full px-2.5 py-1 text-xs font-semibold ${color}">${label}</span>`;
}

adminUserRoutes.get("/admin/users", async (c) => {
  const locale = await adminLocaleOrRedirect(c);
  if (!locale) return c.redirect("/admin/login");
  const query = (c.req.query("q") ?? "").trim().slice(0, 100);
  const role = ["all", "member", "owner", "collaborator", "professional"].includes(c.req.query("role") ?? "") ? c.req.query("role")! : "all";
  const plan = ["all", "beta", "pro", "studio", "custom"].includes(c.req.query("plan") ?? "") ? c.req.query("plan")! : "all";
  const subscription = ["all", "none", "trialing", "active", "past_due", "canceled", "complimentary"].includes(c.req.query("subscription") ?? "") ? c.req.query("subscription")! : "all";
  const sort = ["joined_desc", "joined_asc", "name_asc", "albums_desc", "storage_desc"].includes(c.req.query("sort") ?? "") ? c.req.query("sort")! : "joined_desc";

  const where: string[] = ["1=1"];
  const bindings: unknown[] = [];
  if (query) {
    where.push("(u.name LIKE ? OR u.email LIKE ?)");
    bindings.push(`%${query}%`, `%${query}%`);
  }
  if (role === "professional") where.push("p.user_id IS NOT NULL");
  if (role === "owner") where.push("EXISTS (SELECT 1 FROM event_members erm WHERE erm.user_id=u.id AND erm.role='owner')");
  if (role === "collaborator") where.push("EXISTS (SELECT 1 FROM event_members erm WHERE erm.user_id=u.id AND erm.role!='owner')");
  if (role === "member") where.push("p.user_id IS NULL");
  if (plan !== "all") {
    where.push("COALESCE(ae.plan_key,'beta')=?");
    bindings.push(plan);
  }
  if (subscription !== "all") {
    where.push("COALESCE(s.status,'none')=?");
    bindings.push(subscription);
  }
  const orderBy = sort === "joined_asc" ? "u.createdAt ASC"
    : sort === "name_asc" ? "u.name COLLATE NOCASE ASC"
      : sort === "albums_desc" ? "owned_events DESC,u.createdAt DESC"
        : sort === "storage_desc" ? "used_bytes DESC,u.createdAt DESC"
          : "u.createdAt DESC";
  const users = await c.env.DB.prepare(
    `SELECT u.id,u.name,u.email,u.emailVerified,u.image,u.createdAt,
      COALESCE(ae.plan_key,'beta') plan_key,
      COALESCE(ae.storage_limit_bytes,21474836480) storage_limit_bytes,
      COALESCE(ae.event_limit,25) event_limit,
      COALESCE(su.used_bytes,0) used_bytes,
      p.status professional_status,
      COALESCE(s.status,'none') subscription_status,
      COALESCE(s.billing_provider,'none') billing_provider,
      COALESCE(s.billing_interval,'none') billing_interval,
      COALESCE(s.amount_minor,0) amount_minor,
      COALESCE(s.currency,'EUR') currency,
      s.last_payment_at,
      (SELECT COUNT(*) FROM event_members em JOIN events e ON e.id=em.event_id WHERE em.user_id=u.id AND em.role='owner' AND e.deleted_at IS NULL) owned_events,
      (SELECT COUNT(*) FROM event_members em JOIN events e ON e.id=em.event_id WHERE em.user_id=u.id AND em.role!='owner' AND e.deleted_at IS NULL) shared_events
     FROM "user" u
     LEFT JOIN account_entitlements ae ON ae.user_id=u.id
     LEFT JOIN account_storage_usage su ON su.user_id=u.id
     LEFT JOIN professional_profiles p ON p.user_id=u.id
     LEFT JOIN account_subscriptions s ON s.user_id=u.id
     WHERE ${where.join(" AND ")}
     ORDER BY ${orderBy} LIMIT 250`,
  ).bind(...bindings).all<AdminUserListRow>();
  const stats = await c.env.DB.prepare(
    `SELECT COUNT(*) total,
      SUM(CASE WHEN emailVerified=1 THEN 1 ELSE 0 END) verified,
      (SELECT COUNT(*) FROM professional_profiles) professionals,
      (SELECT COUNT(*) FROM account_subscriptions WHERE status IN ('active','trialing','complimentary')) subscriptions,
      (SELECT COUNT(*) FROM account_subscriptions WHERE status='active' AND amount_minor>0) paying
     FROM "user"`,
  ).first<{ total: number; verified: number; professionals: number; subscriptions: number; paying: number }>();

  const cards = users.results.map((user) => `<article class="rounded-3xl border border-[#dfe5f1] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
    <a href="/admin/users/${encodeURIComponent(user.id)}" class="block">
      <div class="flex items-start justify-between gap-4"><div class="min-w-0"><h2 class="truncate text-xl">${esc(user.name)}</h2><p class="truncate text-sm text-[#64748b]">${esc(user.email)}</p></div>${subscriptionBadge(user.subscription_status, locale)}</div>
      <div class="mt-4 flex flex-wrap gap-2"><span class="rounded-full bg-[#eef2ff] px-3 py-1 text-xs font-semibold uppercase text-[#4338ca]">${esc(user.plan_key)}</span><span class="rounded-full bg-[#f1f5f9] px-3 py-1 text-xs">${esc(roleSummary(user, locale))}</span>${user.emailVerified ? '<span class="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-800">Email verified</span>' : '<span class="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-900">Email pending</span>'}</div>
      <div class="mt-5 grid grid-cols-3 gap-3 border-t pt-4 text-sm"><div><strong class="block text-lg">${user.owned_events}</strong><span class="text-[#64748b]">${locale === "el" ? "Albums" : "Albums"}</span></div><div><strong class="block text-lg">${formatBytes(user.used_bytes)}</strong><span class="text-[#64748b]">Storage</span></div><div><strong class="block text-lg">${user.amount_minor ? esc(formatSubscriptionMoney(user.amount_minor, user.currency, locale)) : "—"}</strong><span class="text-[#64748b]">${user.billing_interval === "month" ? "/ month" : user.billing_interval === "year" ? "/ year" : "Billing"}</span></div></div>
      <p class="mt-4 text-xs text-[#94a3b8]">${locale === "el" ? "Εγγραφή" : "Joined"}: ${formatDate(user.createdAt)}</p>
    </a>
  </article>`).join("");
  return c.html(adminShell(
    locale === "el" ? "Εγγεγραμμένοι χρήστες" : "Registered users",
    `<main class="mx-auto max-w-7xl p-5 md:p-10"><div class="flex flex-wrap items-end justify-between gap-5"><div><p class="text-xs uppercase tracking-[.2em] text-[#4338ca]">Accounts</p><h1 class="mt-2 text-4xl">${locale === "el" ? "Εγγεγραμμένοι χρήστες" : "Registered users"}</h1><p class="mt-2 text-[#64748b]">${stats?.total ?? 0} total · ${stats?.verified ?? 0} verified · ${stats?.professionals ?? 0} professionals · ${stats?.paying ?? 0} paying</p></div><a href="/admin/accounts" class="rounded-xl border bg-white px-4 py-3 text-sm">${locale === "el" ? "Μαζικά plan overrides" : "Bulk plan overrides"}</a></div>
    <form method="get" class="mt-7 grid gap-3 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-[minmax(200px,1fr)_auto_auto_auto_auto]"><input name="q" value="${esc(query)}" placeholder="${locale === "el" ? "Όνομα ή email" : "Name or email"}" class="rounded-xl border px-4 py-3"><select name="role" class="rounded-xl border px-3 py-3"><option value="all">${locale === "el" ? "Όλοι οι ρόλοι" : "All roles"}</option><option value="member"${role === "member" ? " selected" : ""}>Member</option><option value="owner"${role === "owner" ? " selected" : ""}>Owner</option><option value="collaborator"${role === "collaborator" ? " selected" : ""}>Collaborator</option><option value="professional"${role === "professional" ? " selected" : ""}>Professional</option></select><select name="plan" class="rounded-xl border px-3 py-3"><option value="all">${locale === "el" ? "Όλα τα plans" : "All plans"}</option>${["beta", "pro", "studio", "custom"].map((value) => `<option value="${value}"${plan === value ? " selected" : ""}>${value.toUpperCase()}</option>`).join("")}</select><select name="subscription" class="rounded-xl border px-3 py-3"><option value="all">${locale === "el" ? "Όλες οι συνδρομές" : "All subscriptions"}</option>${Object.entries(subscriptionLabels).map(([value, meta]) => `<option value="${value}"${subscription === value ? " selected" : ""}>${locale === "el" ? meta.el : meta.en}</option>`).join("")}</select><select name="sort" class="rounded-xl border px-3 py-3"><option value="joined_desc"${sort === "joined_desc" ? " selected" : ""}>${locale === "el" ? "Νεότερες εγγραφές" : "Newest accounts"}</option><option value="joined_asc"${sort === "joined_asc" ? " selected" : ""}>${locale === "el" ? "Παλαιότερες εγγραφές" : "Oldest accounts"}</option><option value="name_asc"${sort === "name_asc" ? " selected" : ""}>A → Z</option><option value="albums_desc"${sort === "albums_desc" ? " selected" : ""}>${locale === "el" ? "Περισσότερα albums" : "Most albums"}</option><option value="storage_desc"${sort === "storage_desc" ? " selected" : ""}>${locale === "el" ? "Μεγαλύτερη χρήση" : "Highest storage"}</option></select><button class="rounded-xl bg-[#172033] px-5 py-3 text-white md:col-span-5">${locale === "el" ? "Εφαρμογή φίλτρων" : "Apply filters"}</button></form>
    <div class="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">${cards || `<p class="rounded-3xl bg-white p-10 text-center text-[#64748b] md:col-span-2 xl:col-span-3">${locale === "el" ? "Δεν βρέθηκαν χρήστες." : "No users found."}</p>`}</div></main>`,
    locale,
  ));
});

adminUserRoutes.get("/admin/users/:id", async (c) => {
  const locale = await adminLocaleOrRedirect(c);
  if (!locale) return c.redirect("/admin/login");
  const user = await c.env.DB.prepare(
    `SELECT u.id,u.name,u.email,u.emailVerified,u.image,u.createdAt,u.updatedAt,
      COALESCE(ae.plan_key,'beta') plan_key,COALESCE(ae.storage_limit_bytes,21474836480) storage_limit_bytes,
      COALESCE(ae.event_limit,25) event_limit,COALESCE(ae.member_limit,25) member_limit,
      COALESCE(su.used_bytes,0) used_bytes,p.business_name,p.slug,p.status professional_status,
      (SELECT COUNT(*) FROM session se WHERE se.userId=u.id AND se.expiresAt>?) active_sessions,
      (SELECT COUNT(*) FROM media m WHERE m.uploaded_by_user_id=u.id) uploaded_media,
      EXISTS(SELECT 1 FROM cloud_connections cc WHERE cc.user_id=u.id AND cc.provider='google_drive') drive_connected
     FROM "user" u LEFT JOIN account_entitlements ae ON ae.user_id=u.id
     LEFT JOIN account_storage_usage su ON su.user_id=u.id
     LEFT JOIN professional_profiles p ON p.user_id=u.id WHERE u.id=?`,
  ).bind(Date.now(), c.req.param("id")).first<{
    id: string; name: string; email: string; emailVerified: number; image: string | null; createdAt: number; updatedAt: number;
    plan_key: PlanKey; storage_limit_bytes: number; event_limit: number; member_limit: number; used_bytes: number;
    business_name: string | null; slug: string | null; professional_status: string | null; active_sessions: number; uploaded_media: number; drive_connected: number;
  }>();
  if (!user) return c.text("User not found", 404);
  const [subscription, payments, events, providers] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM account_subscriptions WHERE user_id=?").bind(user.id).first<SubscriptionRow>(),
    c.env.DB.prepare("SELECT * FROM account_payments WHERE user_id=? ORDER BY COALESCE(paid_at,created_at) DESC LIMIT 100").bind(user.id).all<PaymentRow>(),
    c.env.DB.prepare(
      `SELECT e.*,em.role,COUNT(m.id) media_count,COALESCE(SUM(m.size_bytes),0) media_bytes
       FROM event_members em JOIN events e ON e.id=em.event_id
       LEFT JOIN media m ON m.event_id=e.id AND m.deleted_at IS NULL
       WHERE em.user_id=? GROUP BY e.id,em.role
       ORDER BY CASE em.role WHEN 'owner' THEN 0 ELSE 1 END,COALESCE(e.event_start_date,'0000') DESC`,
    ).bind(user.id).all<EventRow & { role: EventRole; media_count: number; media_bytes: number }>(),
    c.env.DB.prepare("SELECT providerId,createdAt FROM account WHERE userId=? ORDER BY createdAt").bind(user.id).all<{ providerId: string; createdAt: number }>(),
  ]);
  const subStatus = subscription?.status ?? "none";
  const paymentRows = payments.results.map((payment) => `<tr class="border-t"><td class="px-3 py-3">${payment.paid_at ? formatDateTime(payment.paid_at, locale) : "—"}</td><td class="px-3 py-3">${esc(formatSubscriptionMoney(payment.amount_minor, payment.currency, locale))}</td><td class="px-3 py-3 capitalize">${esc(payment.status)}</td><td class="px-3 py-3">${esc(payment.provider)}</td><td class="px-3 py-3 text-[#64748b]">${esc(payment.note ?? "")}</td></tr>`).join("");
  const eventCards = events.results.map((event) => `<article class="rounded-2xl border bg-white p-5 shadow-sm"><div class="flex flex-wrap items-start justify-between gap-3"><div><h3 class="text-xl">${esc(event.eventName)}</h3><p class="mt-1 text-sm text-[#64748b]">${esc(formatEventDates(event, locale))}</p></div>${roleBadge(event.role, locale)}</div><div class="mt-4 flex flex-wrap gap-4 text-sm text-[#64748b]"><span>${event.media_count} files</span><span>${formatBytes(event.media_bytes)}</span><span>${event.deleted_at ? (locale === "el" ? "Στον κάδο" : "In trash") : event.status}</span></div><a href="/admin/events/${encodeURIComponent(event.code)}" class="mt-4 inline-flex rounded-xl bg-[#172033] px-4 py-2 text-sm text-white">${locale === "el" ? "Διαχείριση album" : "Manage album"}</a></article>`).join("");
  const providerLabels = providers.results.map((provider) => `<span class="rounded-full bg-[#f1f5f9] px-3 py-1 text-xs capitalize">${esc(provider.providerId)}</span>`).join("");
  const currentAmount = subscription ? (subscription.amount_minor / 100).toFixed(2) : "0.00";
  return c.html(adminShell(
    user.name,
    `<main class="mx-auto max-w-7xl p-5 md:p-10"><a href="/admin/users" class="text-sm text-[#4338ca]">← ${locale === "el" ? "Πίσω στους χρήστες" : "Back to users"}</a>
    <section class="mt-5 overflow-hidden rounded-[2rem] bg-[#172033] p-6 text-white shadow-xl sm:p-8"><div class="flex flex-wrap items-start justify-between gap-5"><div class="flex min-w-0 items-center gap-4">${user.image ? `<img src="${esc(user.image)}" alt="" class="h-16 w-16 rounded-full object-cover">` : `<span class="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 text-2xl">${esc(user.name.slice(0, 1).toUpperCase())}</span>`}<div class="min-w-0"><p class="text-xs uppercase tracking-[.2em] text-white/55">Registered user</p><h1 class="mt-1 truncate text-4xl">${esc(user.name)}</h1><p class="mt-1 break-all text-white/65">${esc(user.email)}</p></div></div><div class="flex flex-wrap gap-2">${subscriptionBadge(subStatus, locale)}<span class="rounded-full bg-white/10 px-3 py-1 text-xs uppercase">${esc(user.plan_key)}</span>${user.professional_status ? '<span class="rounded-full bg-violet-400/20 px-3 py-1 text-xs">Professional</span>' : ""}</div></div></section>
    <div class="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]"><div class="space-y-6"><section class="rounded-3xl bg-white p-6 shadow-sm"><h2 class="text-3xl">${locale === "el" ? "Λογαριασμός" : "Account"}</h2><div class="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div class="rounded-2xl bg-[#f8faff] p-4"><span class="text-xs text-[#64748b]">Email</span><strong class="mt-1 block">${user.emailVerified ? "Verified" : "Pending"}</strong></div><div class="rounded-2xl bg-[#f8faff] p-4"><span class="text-xs text-[#64748b]">Active sessions</span><strong class="mt-1 block text-2xl">${user.active_sessions}</strong></div><div class="rounded-2xl bg-[#f8faff] p-4"><span class="text-xs text-[#64748b]">User uploads</span><strong class="mt-1 block text-2xl">${user.uploaded_media}</strong></div><div class="rounded-2xl bg-[#f8faff] p-4"><span class="text-xs text-[#64748b]">Google Drive</span><strong class="mt-1 block">${user.drive_connected ? "Connected" : "Not connected"}</strong></div></div><div class="mt-5 flex flex-wrap gap-2">${providerLabels || '<span class="text-sm text-[#64748b]">No sign-in provider record</span>'}</div><p class="mt-4 text-sm text-[#64748b]">${locale === "el" ? "Εγγραφή" : "Joined"}: ${formatDateTime(user.createdAt, locale)} · ID: <span class="font-mono">${esc(user.id)}</span></p></section>
    <section><div class="flex items-end justify-between"><div><p class="text-xs uppercase tracking-[.2em] text-[#4338ca]">Albums & roles</p><h2 class="mt-1 text-3xl">${locale === "el" ? "Albums χρήστη" : "User albums"}</h2></div><span class="text-sm text-[#64748b]">${events.results.length}</span></div><div class="mt-4 grid gap-4 md:grid-cols-2">${eventCards || `<p class="rounded-2xl bg-white p-8 text-center text-[#64748b] md:col-span-2">${locale === "el" ? "Δεν συμμετέχει σε album." : "No album memberships."}</p>`}</div></section>
    <section class="rounded-3xl bg-white p-6 shadow-sm"><div class="flex items-center justify-between"><h2 class="text-3xl">${locale === "el" ? "Ιστορικό πληρωμών" : "Payment history"}</h2><span class="text-sm text-[#64748b]">${payments.results.length}</span></div><div class="mt-4 overflow-x-auto"><table class="w-full min-w-[650px] text-left text-sm"><thead class="bg-[#f8faff]"><tr><th class="px-3 py-3">Date</th><th class="px-3 py-3">Amount</th><th class="px-3 py-3">Status</th><th class="px-3 py-3">Provider</th><th class="px-3 py-3">Note</th></tr></thead><tbody>${paymentRows || '<tr><td colspan="5" class="px-3 py-8 text-center text-[#64748b]">No payment has been recorded.</td></tr>'}</tbody></table></div><form action="/admin/users/${encodeURIComponent(user.id)}/payments" method="post" class="mt-6 grid gap-3 rounded-2xl bg-[#f8faff] p-4 md:grid-cols-2"><h3 class="text-xl md:col-span-2">${locale === "el" ? "Καταχώρηση χειροκίνητης πληρωμής" : "Record manual payment"}</h3><label class="text-xs">Amount<input name="amount" inputmode="decimal" required placeholder="29.00" class="mt-1 w-full rounded-xl border bg-white px-3 py-2"></label><label class="text-xs">Currency<input name="currency" value="EUR" required maxlength="3" class="mt-1 w-full rounded-xl border bg-white px-3 py-2 uppercase"></label><label class="text-xs">Status<select name="status" class="mt-1 w-full rounded-xl border bg-white px-3 py-2"><option value="paid">Paid</option><option value="refunded">Refunded</option><option value="failed">Failed</option></select></label><label class="text-xs">Date<input name="paidAt" type="date" value="${dateInput(Date.now())}" required class="mt-1 w-full rounded-xl border bg-white px-3 py-2"></label><label class="text-xs md:col-span-2">Internal note<input name="note" maxlength="300" class="mt-1 w-full rounded-xl border bg-white px-3 py-2"></label><button class="rounded-xl bg-[#172033] px-4 py-3 text-white md:col-span-2">${locale === "el" ? "Καταχώρηση" : "Record payment"}</button></form></section></div>
    <aside class="space-y-6"><section class="rounded-3xl bg-white p-6 shadow-sm"><p class="text-xs uppercase tracking-[.2em] text-[#4338ca]">Access plan</p><h2 class="mt-1 text-2xl">${locale === "el" ? "Όρια λογαριασμού" : "Account limits"}</h2><p class="mt-3 text-sm text-[#64748b]">${formatBytes(user.used_bytes)} / ${formatBytes(user.storage_limit_bytes)} storage</p><form action="/admin/users/${encodeURIComponent(user.id)}/entitlement" method="post" class="mt-5 space-y-3"><label class="block text-xs">Plan<select name="planKey" class="mt-1 w-full rounded-xl border px-3 py-2">${["beta", "pro", "studio", "custom"].map((value) => `<option value="${value}"${user.plan_key === value ? " selected" : ""}>${value.toUpperCase()}</option>`).join("")}</select></label><label class="block text-xs">Storage GB<input name="storageGb" type="number" min="1" max="10240" required value="${Math.round(user.storage_limit_bytes / 1073741824)}" class="mt-1 w-full rounded-xl border px-3 py-2"></label><label class="block text-xs">Events<input name="eventLimit" type="number" min="1" max="10000" required value="${user.event_limit}" class="mt-1 w-full rounded-xl border px-3 py-2"></label><label class="block text-xs">Members / event<input name="memberLimit" type="number" min="1" max="1000" required value="${user.member_limit}" class="mt-1 w-full rounded-xl border px-3 py-2"></label><button class="w-full rounded-xl bg-[#4f46e5] px-4 py-3 text-white">${locale === "el" ? "Αποθήκευση ορίων" : "Save limits"}</button></form></section>
    <section class="rounded-3xl bg-white p-6 shadow-sm"><p class="text-xs uppercase tracking-[.2em] text-[#4338ca]">Billing</p><h2 class="mt-1 text-2xl">${locale === "el" ? "Συνδρομή" : "Subscription"}</h2><p class="mt-3 text-sm text-[#64748b]">${locale === "el" ? "Η billing κατάσταση δεν αλλάζει αυτόματα τα access limits." : "Billing status does not automatically change access limits."}</p><form action="/admin/users/${encodeURIComponent(user.id)}/subscription" method="post" class="mt-5 space-y-3"><label class="block text-xs">Subscription plan<select name="planKey" class="mt-1 w-full rounded-xl border px-3 py-2">${["beta", "pro", "studio", "custom"].map((value) => `<option value="${value}"${(subscription?.plan_key ?? user.plan_key) === value ? " selected" : ""}>${value.toUpperCase()}</option>`).join("")}</select></label><label class="block text-xs">Status<select name="status" class="mt-1 w-full rounded-xl border px-3 py-2">${Object.entries(subscriptionLabels).map(([value, meta]) => `<option value="${value}"${subStatus === value ? " selected" : ""}>${locale === "el" ? meta.el : meta.en}</option>`).join("")}</select></label><label class="block text-xs">Provider<select name="provider" class="mt-1 w-full rounded-xl border px-3 py-2"><option value="none"${!subscription || subscription.billing_provider === "none" ? " selected" : ""}>None</option><option value="manual"${subscription?.billing_provider === "manual" ? " selected" : ""}>Manual</option><option value="stripe"${subscription?.billing_provider === "stripe" ? " selected" : ""}>Stripe</option></select></label><label class="block text-xs">Interval<select name="interval" class="mt-1 w-full rounded-xl border px-3 py-2"><option value="none"${!subscription || subscription.billing_interval === "none" ? " selected" : ""}>None</option><option value="month"${subscription?.billing_interval === "month" ? " selected" : ""}>Monthly</option><option value="year"${subscription?.billing_interval === "year" ? " selected" : ""}>Yearly</option><option value="one_time"${subscription?.billing_interval === "one_time" ? " selected" : ""}>One time</option></select></label><div class="grid grid-cols-[1fr_90px] gap-2"><label class="text-xs">Amount<input name="amount" inputmode="decimal" value="${currentAmount}" class="mt-1 w-full rounded-xl border px-3 py-2"></label><label class="text-xs">Currency<input name="currency" value="${esc(subscription?.currency ?? "EUR")}" maxlength="3" class="mt-1 w-full rounded-xl border px-3 py-2 uppercase"></label></div><label class="block text-xs">Started<input name="startedAt" type="date" value="${subscription?.started_at ? dateInput(subscription.started_at) : ""}" class="mt-1 w-full rounded-xl border px-3 py-2"></label><label class="block text-xs">Current period end<input name="currentPeriodEnd" type="date" value="${subscription?.current_period_end ? dateInput(subscription.current_period_end) : ""}" class="mt-1 w-full rounded-xl border px-3 py-2"></label><button class="w-full rounded-xl bg-[#172033] px-4 py-3 text-white">${locale === "el" ? "Αποθήκευση συνδρομής" : "Save subscription"}</button></form></section></aside></div></main>`,
    locale,
  ));
});

function validPlan(value: unknown): PlanKey {
  return ["beta", "pro", "studio", "custom"].includes(String(value)) ? String(value) as PlanKey : "custom";
}

function parseAmountMinor(value: unknown) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(amount) ? amount : null;
}

function parseAdminDate(value: unknown) {
  const raw = String(value ?? "");
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return NaN;
  return Date.parse(`${raw}T23:59:59.999Z`);
}

adminUserRoutes.post("/admin/users/:id/entitlement", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin/login");
  const body = await c.req.parseBody();
  const storageGb = Math.trunc(Number(body.storageGb));
  const eventLimit = Math.trunc(Number(body.eventLimit));
  const memberLimit = Math.trunc(Number(body.memberLimit));
  if (!Number.isFinite(storageGb) || storageGb < 1 || storageGb > 10240 || !Number.isFinite(eventLimit) || eventLimit < 1 || eventLimit > 10000 || !Number.isFinite(memberLimit) || memberLimit < 1 || memberLimit > 1000) return c.text("Invalid entitlement limits", 400);
  await c.env.DB.prepare(
    `INSERT INTO account_entitlements (user_id,plan_key,storage_limit_bytes,event_limit,member_limit,updated_at)
     VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET plan_key=excluded.plan_key,
     storage_limit_bytes=excluded.storage_limit_bytes,event_limit=excluded.event_limit,
     member_limit=excluded.member_limit,updated_at=excluded.updated_at`,
  ).bind(c.req.param("id"), validPlan(body.planKey), storageGb * 1073741824, eventLimit, memberLimit, Date.now()).run();
  return c.redirect(`/admin/users/${encodeURIComponent(c.req.param("id"))}`, 303);
});

adminUserRoutes.post("/admin/users/:id/subscription", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin/login");
  const user = await c.env.DB.prepare('SELECT 1 FROM "user" WHERE id=?').bind(c.req.param("id")).first();
  if (!user) return c.text("User not found", 404);
  const body = await c.req.parseBody();
  const status = ["none", "trialing", "active", "past_due", "canceled", "complimentary"].includes(String(body.status)) ? String(body.status) as SubscriptionStatus : null;
  let provider = ["none", "manual", "stripe"].includes(String(body.provider)) ? String(body.provider) as SubscriptionRow["billing_provider"] : null;
  let interval = ["none", "month", "year", "one_time"].includes(String(body.interval)) ? String(body.interval) as SubscriptionRow["billing_interval"] : null;
  let amountMinor = parseAmountMinor(body.amount);
  const currency = String(body.currency ?? "EUR").trim().toUpperCase();
  const startedAt = parseAdminDate(body.startedAt);
  const currentPeriodEnd = parseAdminDate(body.currentPeriodEnd);
  if (!status || !provider || !interval || amountMinor === null || !/^[A-Z]{3}$/.test(currency) || Number.isNaN(startedAt) || Number.isNaN(currentPeriodEnd)) return c.text("Invalid subscription details", 400);
  if (status === "none" || status === "complimentary") {
    provider = "none";
    interval = "none";
    amountMinor = 0;
  }
  if (status !== "none" && status !== "complimentary" && (provider === "none" || interval === "none")) {
    return c.text("A billed subscription needs a provider and billing interval", 400);
  }
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO account_subscriptions (user_id,plan_key,status,billing_provider,billing_interval,amount_minor,currency,started_at,current_period_end,canceled_at,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET plan_key=excluded.plan_key,
     status=excluded.status,billing_provider=excluded.billing_provider,billing_interval=excluded.billing_interval,
     amount_minor=excluded.amount_minor,currency=excluded.currency,started_at=excluded.started_at,
     current_period_end=excluded.current_period_end,canceled_at=excluded.canceled_at,updated_at=excluded.updated_at`,
  ).bind(c.req.param("id"), validPlan(body.planKey), status, provider, interval, amountMinor, currency, startedAt, currentPeriodEnd, status === "canceled" ? now : null, now, now).run();
  return c.redirect(`/admin/users/${encodeURIComponent(c.req.param("id"))}`, 303);
});

adminUserRoutes.post("/admin/users/:id/payments", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin/login");
  const user = await c.env.DB.prepare('SELECT 1 FROM "user" WHERE id=?').bind(c.req.param("id")).first();
  if (!user) return c.text("User not found", 404);
  const body = await c.req.parseBody();
  const amountMinor = parseAmountMinor(body.amount);
  const currency = String(body.currency ?? "EUR").trim().toUpperCase();
  const status = ["paid", "refunded", "failed"].includes(String(body.status)) ? String(body.status) as PaymentRow["status"] : null;
  const paidAt = parseAdminDate(body.paidAt);
  const note = String(body.note ?? "").trim().slice(0, 300) || null;
  if (amountMinor === null || !/^[A-Z]{3}$/.test(currency) || !status || paidAt === null || Number.isNaN(paidAt)) return c.text("Invalid payment details", 400);
  const now = Date.now();
  const statements = [c.env.DB.prepare(
    "INSERT INTO account_payments (id,user_id,provider,status,amount_minor,currency,note,paid_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
  ).bind(crypto.randomUUID(), c.req.param("id"), "manual", status, amountMinor, currency, note, paidAt, now)];
  if (status === "paid") statements.push(c.env.DB.prepare(
    "UPDATE account_subscriptions SET last_payment_at=?,updated_at=? WHERE user_id=?",
  ).bind(paidAt, now, c.req.param("id")));
  await c.env.DB.batch(statements);
  return c.redirect(`/admin/users/${encodeURIComponent(c.req.param("id"))}`, 303);
});
