import { Hono } from "hono";
import { parse as parseMetadata } from "exifr";
import { TRASH_RETENTION_MS } from "../config";
import type { Bindings, EventRow } from "../domain";
import { normalizeLocale } from "../i18n";
import { getLaunchReadiness } from "../launch-readiness";
import { permanentlyDeleteMedia, restoreDeletedMedia } from "../media-trash";
import { consumeRateLimit, tooManyRequests } from "../rate-limit";
import { formatBytes, releaseStorage, reserveStorageForEvent } from "../quotas";
import { getEvent, getMedia } from "../repositories";
import { safeFileExtension, validateUploadFiles } from "../upload-policy";
import { validProfessionalSlug } from "../studio";
import {
  dateInput,
  esc,
  formatDate,
  formatDateTime,
  formatEventDates,
  secureSecretEqual,
  sha256Bytes,
  sha256,
  validEventDate,
} from "../utils";
import { adminShell } from "../views/admin";
import { bulkSelectionScript, cards, lightboxMarkup } from "../views/media";
import { page } from "../views/shared";
import {
  adminLocaleOrRedirect,
  clearAdminSessionCookie,
  createAdminSessionCookie,
  isAdmin,
} from "./admin-auth";

export const adminRoutes = new Hono<{ Bindings: Bindings }>();

function safeAdminReturn(value: unknown, fallback: string) {
  const target = String(value ?? "");
  return target.startsWith("/admin/") && !target.startsWith("//")
    ? target
    : fallback;
}

function selected(value: string, current: string) {
  return value === current ? " selected" : "";
}

adminRoutes.get("/admin/login", async (c) => {
  if (await isAdmin(c)) return c.redirect("/admin/users");
  const configured = Boolean(c.env.ADMIN_PASSWORD);
  return c.html(
    page(
      "Admin Login – Memboux",
      `<main class="flex min-h-screen items-center justify-center p-5"><section class="w-full max-w-md rounded-3xl border border-[#dbe2f0] bg-white/95 p-8 shadow-[0_24px_70px_rgba(79,70,229,.12)]"><p class="text-sm font-semibold uppercase tracking-[.2em] text-[#4338ca]">Memboux Admin</p><h1 class="mt-2 text-3xl font-bold">Ιδιωτική διαχείριση</h1><p class="mt-2 text-[#64748b]">Πρόσβαση μόνο για τον διαχειριστή.</p>${configured ? `<form action="/admin/login" method="post" class="mt-7 space-y-3"><input name="password" type="password" required autocomplete="current-password" placeholder="Admin password" class="w-full rounded-xl border px-4 py-3"><button class="w-full rounded-xl bg-[#172033] py-3 font-semibold text-white">Σύνδεση</button></form>` : `<div class="mt-7 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Το ADMIN_PASSWORD δεν έχει ρυθμιστεί ακόμη στη Cloudflare.</div>`}</section></main>`,
    ),
  );
});

adminRoutes.post("/admin/login", async (c) => {
  const configured = c.env.ADMIN_PASSWORD;
  if (!configured) return c.text("Το admin password δεν έχει ρυθμιστεί.", 503);
  const rateLimit = await consumeRateLimit(
    c.env.DB,
    c.req.raw,
    c.env.BETTER_AUTH_SECRET,
    {
      scope: "admin-login",
      limit: 10,
      windowMs: 15 * 60_000,
    },
  );
  if (!rateLimit.allowed)
    return tooManyRequests(
      rateLimit,
      "Πολλές προσπάθειες σύνδεσης. Δοκίμασε ξανά αργότερα.",
    );
  const body = await c.req.parseBody();
  if (!(await secureSecretEqual(String(body.password ?? ""), configured)))
    return c.html(
      page(
        "Λάθος password",
        `<main class="flex min-h-screen items-center justify-center p-5"><section class="rounded-3xl bg-white p-8 text-center shadow-xl"><h1 class="text-2xl font-bold">Λάθος password</h1><a href="/admin/login" class="mt-5 inline-block text-[#4338ca]">Δοκίμασε ξανά</a></section></main>`,
      ),
      401,
    );
  c.header("Set-Cookie", await createAdminSessionCookie(configured));
  return c.redirect("/admin/users", 303);
});

adminRoutes.post("/admin/logout", (c) => {
  c.header("Set-Cookie", clearAdminSessionCookie());
  return c.redirect("/admin/login", 303);
});

adminRoutes.get("/admin/language/:locale{el|en}", (c) => {
  const locale = normalizeLocale(c.req.param("locale"));
  c.header(
    "Set-Cookie",
    `memboux_admin_locale=${locale}; Path=/admin; Max-Age=31536000; Secure; SameSite=Lax`,
  );
  const referer = c.req.header("Referer");
  if (referer) {
    const url = new URL(referer);
    if (
      url.origin === new URL(c.req.url).origin &&
      url.pathname.startsWith("/admin")
    )
      return c.redirect(url.pathname, 303);
  }
  return c.redirect("/admin/users", 303);
});

adminRoutes.get("/admin/readiness", async (c) => {
  const locale = await adminLocaleOrRedirect(c);
  if (!locale) return c.redirect("/admin/login");
  const readiness = getLaunchReadiness(c.env);
  const rows = readiness.checks
    .map(
      (check) =>
        `<article class="flex items-center justify-between gap-4 rounded-2xl border bg-white p-5 shadow-sm"><div><p class="text-xs uppercase tracking-[.15em] text-[#4338ca]">${esc(check.category)}</p><h2 class="mt-1 text-xl">${esc(check.label)}</h2></div><span class="rounded-full px-3 py-1 text-sm ${check.ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}">${check.ready ? (locale === "el" ? "Έτοιμο" : "Ready") : locale === "el" ? "Εκκρεμεί" : "Pending"}</span></article>`,
    )
    .join("");
  return c.html(
    adminShell(
      locale === "el" ? "Ετοιμότητα launch" : "Launch readiness",
      `<main class="mx-auto max-w-5xl p-5 md:p-10"><p class="text-xs uppercase tracking-[.2em] text-[#4338ca]">Production gates</p><h1 class="mt-2 text-4xl">${locale === "el" ? "Ετοιμότητα launch" : "Launch readiness"}</h1><div class="mt-6 grid gap-3 sm:grid-cols-2"><div class="rounded-2xl p-5 ${readiness.technicalReady ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}"><p class="text-sm">Technical production</p><strong class="mt-1 block text-2xl">${readiness.technicalReady ? "READY" : "PENDING"}</strong></div><div class="rounded-2xl p-5 ${readiness.commercialReady ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}"><p class="text-sm">Commercial launch</p><strong class="mt-1 block text-2xl">${readiness.commercialReady ? "READY" : "BLOCKED"}</strong></div></div><p class="mt-5 rounded-2xl bg-white p-4 text-sm text-[#64748b]">${locale === "el" ? "Δεν εμφανίζονται ποτέ τιμές secrets. Το commercial launch παραμένει κλειδωμένο μέχρι να ολοκληρωθούν όλα τα νομικά και billing gates." : "Secret values are never displayed. Commercial launch stays locked until every legal and billing gate is complete."}</p><div class="mt-6 grid gap-3">${rows}</div></main>`,
      locale,
    ),
  );
});

adminRoutes.get("/admin/professionals", async (c) => {
  const locale = await adminLocaleOrRedirect(c);
  if (!locale) return c.redirect("/admin/login");
  const query = (c.req.query("q") ?? "").trim().slice(0, 100);
  const status = ["active", "suspended", "missing"].includes(
    c.req.query("status") ?? "",
  )
    ? String(c.req.query("status"))
    : "all";
  const sort = [
    "updated_desc",
    "name_asc",
    "name_desc",
    "assignments_desc",
    "status_asc",
  ].includes(c.req.query("sort") ?? "")
    ? String(c.req.query("sort"))
    : "updated_desc";
  const where = ["(?='' OR u.name LIKE ? OR u.email LIKE ? OR p.business_name LIKE ? OR p.slug LIKE ?)"];
  const bindings: unknown[] = [
    query,
    `%${query}%`,
    `%${query}%`,
    `%${query}%`,
    `%${query}%`,
  ];
  if (status === "missing") where.push("p.user_id IS NULL");
  else if (status !== "all") {
    where.push("p.status=?");
    bindings.push(status);
  }
  const orderBy: Record<string, string> = {
    updated_desc: "COALESCE(p.updated_at,0) DESC,u.createdAt DESC",
    name_asc: "COALESCE(p.business_name,u.name) COLLATE NOCASE ASC",
    name_desc: "COALESCE(p.business_name,u.name) COLLATE NOCASE DESC",
    assignments_desc: "accepted_assignments DESC,total_assignments DESC",
    status_asc: "CASE WHEN p.user_id IS NULL THEN 2 WHEN p.status='active' THEN 0 ELSE 1 END,COALESCE(p.business_name,u.name) COLLATE NOCASE",
  };
  const users = await c.env.DB.prepare(
    `SELECT u.id,u.name,u.email,u.createdAt,p.business_name,p.slug,p.bio,p.website,p.status,p.updated_at,
      (SELECT COUNT(*) FROM event_professional_assignments a WHERE a.professional_user_id=u.id AND a.status='accepted') accepted_assignments,
      (SELECT COUNT(*) FROM event_professional_assignments a WHERE a.professional_user_id=u.id) total_assignments
     FROM "user" u LEFT JOIN professional_profiles p ON p.user_id=u.id
     WHERE ${where.join(" AND ")} ORDER BY ${orderBy[sort]} LIMIT 250`,
  )
    .bind(...bindings)
    .all<{
    id: string;
    name: string;
    email: string;
    createdAt: number;
    business_name: string | null;
    slug: string | null;
    bio: string | null;
    website: string | null;
    status: string | null;
    updated_at: number | null;
    accepted_assignments: number;
    total_assignments: number;
  }>();
  const currentUrl = new URL(c.req.url);
  const returnTo = `${currentUrl.pathname}${currentUrl.search}`;
  const rows = users.results
    .map((user) => {
      const profileStatus = user.status ?? "missing";
      const statusClass =
        profileStatus === "active"
          ? "bg-emerald-50 text-emerald-700"
          : profileStatus === "suspended"
            ? "bg-amber-50 text-amber-700"
            : "bg-slate-100 text-slate-600";
      const slug =
        user.slug ??
        (user.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 50) || `studio-${user.id.slice(0, 8)}`);
      return `<details class="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><summary class="grid cursor-pointer list-none gap-3 p-4 transition hover:bg-slate-50 md:grid-cols-[minmax(220px,1.5fr)_minmax(150px,1fr)_120px_110px_150px_24px] md:items-center"><div class="min-w-0"><p class="truncate font-medium text-slate-950">${esc(user.business_name ?? user.name)}</p><p class="truncate text-xs text-slate-500">${esc(user.email)}</p></div><div class="min-w-0 text-sm"><p class="truncate text-slate-700">${esc(user.name)}</p><p class="truncate text-xs text-slate-400">/${esc(slug)}</p></div><span class="w-fit rounded-full px-2.5 py-1 text-xs font-medium ${statusClass}">${esc(profileStatus)}</span><p class="text-sm text-slate-700"><strong>${user.accepted_assignments}</strong> / ${user.total_assignments}</p><p class="text-xs text-slate-500">${formatDateTime(user.updated_at ?? user.createdAt, locale)}</p><span class="text-xl text-slate-400 transition group-open:rotate-180">⌄</span></summary><div class="border-t border-slate-100 bg-slate-50/60 p-4 md:p-6"><form action="/admin/professionals/${encodeURIComponent(user.id)}" method="post" class="grid gap-4 md:grid-cols-2"><input type="hidden" name="returnTo" value="${esc(returnTo)}"><label class="text-xs font-medium text-slate-600">${locale === "el" ? "Επωνυμία" : "Business name"}<input name="businessName" required maxlength="100" value="${esc(user.business_name ?? user.name)}" class="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"></label><label class="text-xs font-medium text-slate-600">${locale === "el" ? "Δημόσιο slug" : "Public slug"}<input name="slug" required maxlength="50" value="${esc(slug)}" class="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"></label><label class="text-xs font-medium text-slate-600 md:col-span-2">Bio<textarea name="bio" maxlength="1000" rows="3" class="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">${esc(user.bio ?? "")}</textarea></label><label class="text-xs font-medium text-slate-600">Website<input name="website" type="url" maxlength="300" value="${esc(user.website ?? "")}" class="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"></label><label class="text-xs font-medium text-slate-600">Status<select name="status" class="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"><option value="active"${selected("active", user.status ?? "active")}>Active</option><option value="suspended"${selected("suspended", user.status ?? "active")}>Suspended</option></select></label><button class="rounded-xl bg-[#4f46e5] px-4 py-2.5 font-medium text-white md:col-span-2">${locale === "el" ? "Αποθήκευση profile" : "Save profile"}</button></form></div></details>`;
    })
    .join("");
  return c.html(
    adminShell(
      locale === "el" ? "Επαγγελματίες" : "Professionals",
      `<main class="mx-auto max-w-7xl p-5 md:p-10"><div class="flex flex-wrap items-end justify-between gap-4"><div><p class="text-xs font-semibold uppercase tracking-[.2em] text-[#4f46e5]">Studio directory</p><h1 class="mt-2 text-4xl">${locale === "el" ? "Professional profiles" : "Professional profiles"}</h1><p class="mt-2 text-slate-500">${locale === "el" ? "Αναζήτηση, ταξινόμηση και επεξεργασία όλων των επαγγελματικών profiles." : "Search, sort and edit every professional profile."}</p></div><span class="rounded-full bg-white px-4 py-2 text-sm text-slate-600 shadow-sm">${users.results.length} ${locale === "el" ? "αποτελέσματα" : "results"}</span></div><form class="mt-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_180px_210px_auto]"><input name="q" value="${esc(query)}" placeholder="${locale === "el" ? "Όνομα, email, studio ή slug" : "Name, email, studio or slug"}" class="rounded-xl border border-slate-200 px-4 py-2.5"><select name="status" class="rounded-xl border border-slate-200 px-3 py-2.5"><option value="all"${selected("all", status)}>${locale === "el" ? "Όλα τα profiles" : "All profiles"}</option><option value="active"${selected("active", status)}>Active</option><option value="suspended"${selected("suspended", status)}>Suspended</option><option value="missing"${selected("missing", status)}>${locale === "el" ? "Χωρίς profile" : "No profile"}</option></select><select name="sort" class="rounded-xl border border-slate-200 px-3 py-2.5"><option value="updated_desc"${selected("updated_desc", sort)}>${locale === "el" ? "Πρόσφατη ενημέρωση" : "Recently updated"}</option><option value="name_asc"${selected("name_asc", sort)}>Name A–Z</option><option value="name_desc"${selected("name_desc", sort)}>Name Z–A</option><option value="assignments_desc"${selected("assignments_desc", sort)}>${locale === "el" ? "Περισσότερα events" : "Most assignments"}</option><option value="status_asc"${selected("status_asc", sort)}>Status</option></select><button class="rounded-xl bg-slate-950 px-5 py-2.5 font-medium text-white">${locale === "el" ? "Εφαρμογή" : "Apply"}</button></form><div class="mt-5 hidden grid-cols-[minmax(220px,1.5fr)_minmax(150px,1fr)_120px_110px_150px_24px] gap-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400 md:grid"><span>Studio / email</span><span>User / slug</span><span>Status</span><span>Accepted / all</span><span>Updated</span><span></span></div><div class="mt-2 grid gap-2">${rows || `<p class="rounded-2xl bg-white p-8 text-center text-slate-500">${locale === "el" ? "Δεν βρέθηκαν profiles." : "No profiles found."}</p>`}</div></main>`,
      locale,
    ),
  );
});

adminRoutes.post("/admin/professionals/:userId", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin/login");
  const body = await c.req.parseBody();
  const businessName = String(body.businessName ?? "")
    .trim()
    .slice(0, 100);
  const slug = String(body.slug ?? "")
    .trim()
    .toLowerCase();
  const bio = String(body.bio ?? "")
    .trim()
    .slice(0, 1000);
  const website =
    String(body.website ?? "")
      .trim()
      .slice(0, 300) || null;
  const status = body.status === "suspended" ? "suspended" : "active";
  if (!businessName || !validProfessionalSlug(slug))
    return c.text("Invalid professional profile", 400);
  if (website) {
    try {
      const url = new URL(website);
      if (!["http:", "https:"].includes(url.protocol))
        return c.text("Invalid website", 400);
    } catch {
      return c.text("Invalid website", 400);
    }
  }
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO professional_profiles (user_id,business_name,slug,bio,website,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET business_name=excluded.business_name,slug=excluded.slug,bio=excluded.bio,website=excluded.website,status=excluded.status,updated_at=excluded.updated_at`,
  )
    .bind(
      c.req.param("userId"),
      businessName,
      slug,
      bio,
      website,
      status,
      now,
      now,
    )
    .run();
  return c.redirect(
    safeAdminReturn(body.returnTo, "/admin/professionals"),
    303,
  );
});

adminRoutes.get("/admin/accounts", async (c) => {
  const locale = await adminLocaleOrRedirect(c);
  if (!locale) return c.redirect("/admin/login");
  const query = (c.req.query("q") ?? "").trim().slice(0, 100);
  const plan = ["beta", "pro", "studio", "custom"].includes(
    c.req.query("plan") ?? "",
  )
    ? String(c.req.query("plan"))
    : "all";
  const override = ["configured", "default"].includes(
    c.req.query("override") ?? "",
  )
    ? String(c.req.query("override"))
    : "all";
  const sort = [
    "newest",
    "name_asc",
    "name_desc",
    "storage_desc",
    "events_desc",
    "plan_asc",
  ].includes(c.req.query("sort") ?? "")
    ? String(c.req.query("sort"))
    : "newest";
  const where = ["(?='' OR u.name LIKE ? OR u.email LIKE ?)"];
  const bindings: unknown[] = [query, `%${query}%`, `%${query}%`];
  if (plan !== "all") {
    where.push("COALESCE(ae.plan_key,'beta')=?");
    bindings.push(plan);
  }
  const customLimits =
    "ae.user_id IS NOT NULL AND (ae.plan_key<>'beta' OR ae.storage_limit_bytes<>21474836480 OR ae.event_limit<>25 OR ae.member_limit<>25)";
  if (override === "configured") where.push(`(${customLimits})`);
  if (override === "default") where.push(`NOT (${customLimits})`);
  const orderBy: Record<string, string> = {
    newest: "u.createdAt DESC",
    name_asc: "u.name COLLATE NOCASE ASC",
    name_desc: "u.name COLLATE NOCASE DESC",
    storage_desc: "used_bytes DESC",
    events_desc: "event_count DESC",
    plan_asc: "plan_key COLLATE NOCASE ASC,u.name COLLATE NOCASE ASC",
  };
  const accounts = await c.env.DB.prepare(
    `SELECT u.id,u.name,u.email,u.createdAt,ae.updated_at entitlement_updated_at,
      COALESCE(ae.plan_key,'beta') plan_key,COALESCE(ae.storage_limit_bytes,21474836480) storage_limit_bytes,
      COALESCE(ae.event_limit,25) event_limit,COALESCE(ae.member_limit,25) member_limit,COALESCE(su.used_bytes,0) used_bytes,
      (SELECT COUNT(*) FROM event_members em JOIN events e ON e.id=em.event_id WHERE em.user_id=u.id AND em.role='owner' AND e.deleted_at IS NULL) event_count
     FROM "user" u LEFT JOIN account_entitlements ae ON ae.user_id=u.id LEFT JOIN account_storage_usage su ON su.user_id=u.id
     WHERE ${where.join(" AND ")} ORDER BY ${orderBy[sort]} LIMIT 250`,
  )
    .bind(...bindings)
    .all<{
      id: string;
      name: string;
      email: string;
      createdAt: number;
      entitlement_updated_at: number | null;
      plan_key: string;
      storage_limit_bytes: number;
      event_limit: number;
      member_limit: number;
      used_bytes: number;
      event_count: number;
    }>();
  const currentUrl = new URL(c.req.url);
  const returnTo = `${currentUrl.pathname}${currentUrl.search}`;
  const rows = accounts.results
    .map((item) => {
      const storagePercent = Math.min(
        100,
        Math.round((item.used_bytes / item.storage_limit_bytes) * 100),
      );
      const hasOverride =
        item.plan_key !== "beta" ||
        item.storage_limit_bytes !== 21474836480 ||
        item.event_limit !== 25 ||
        item.member_limit !== 25;
      return `<details class="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><summary class="grid cursor-pointer list-none gap-3 p-4 transition hover:bg-slate-50 md:grid-cols-[minmax(220px,1.4fr)_100px_minmax(170px,1fr)_110px_110px_150px_24px] md:items-center"><div class="min-w-0"><p class="truncate font-medium text-slate-950">${esc(item.name)}</p><p class="truncate text-xs text-slate-500">${esc(item.email)}</p></div><span class="w-fit rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold uppercase text-indigo-700">${esc(item.plan_key)}</span><div><p class="text-sm text-slate-700">${formatBytes(item.used_bytes)} / ${formatBytes(item.storage_limit_bytes)}</p><div class="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><span class="block h-full rounded-full bg-[#4f46e5]" style="width:${storagePercent}%"></span></div></div><p class="text-sm text-slate-700"><strong>${item.event_count}</strong> / ${item.event_limit}</p><p class="text-sm text-slate-700">${item.member_limit}</p><div><p class="text-xs text-slate-500">${formatDateTime(item.entitlement_updated_at ?? item.createdAt, locale)}</p><p class="mt-1 text-[11px] text-slate-400">${hasOverride ? "Override" : locale === "el" ? "Προεπιλογή" : "Default"}</p></div><span class="text-xl text-slate-400 transition group-open:rotate-180">⌄</span></summary><div class="border-t border-slate-100 bg-slate-50/60 p-4 md:p-6"><form action="/admin/accounts/${encodeURIComponent(item.id)}/entitlement" method="post" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><input type="hidden" name="returnTo" value="${esc(returnTo)}"><label class="text-xs font-medium text-slate-600">Plan<select name="planKey" class="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"><option value="beta"${selected("beta", item.plan_key)}>Beta</option><option value="pro"${selected("pro", item.plan_key)}>Pro</option><option value="studio"${selected("studio", item.plan_key)}>Studio</option><option value="custom"${selected("custom", item.plan_key)}>Custom</option></select></label><label class="text-xs font-medium text-slate-600">Storage GB<input name="storageGb" type="number" min="1" max="10240" required value="${Math.round(item.storage_limit_bytes / 1073741824)}" class="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"></label><label class="text-xs font-medium text-slate-600">Events<input name="eventLimit" type="number" min="1" max="10000" required value="${item.event_limit}" class="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"></label><label class="text-xs font-medium text-slate-600">${locale === "el" ? "Μέλη ανά event" : "Members per event"}<input name="memberLimit" type="number" min="1" max="1000" required value="${item.member_limit}" class="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"></label><button class="rounded-xl bg-[#4f46e5] px-4 py-2.5 font-medium text-white sm:col-span-2 lg:col-span-4">${locale === "el" ? "Αποθήκευση ορίων" : "Save limits"}</button></form></div></details>`;
    })
    .join("");
  return c.html(
    adminShell(
      locale === "el" ? "Plans χρηστών" : "Account plans",
      `<main class="mx-auto max-w-7xl p-5 md:p-10"><div class="flex flex-wrap items-end justify-between gap-4"><div><p class="text-xs font-semibold uppercase tracking-[.2em] text-[#4f46e5]">Commercial controls</p><h1 class="mt-2 text-4xl">${locale === "el" ? "Plans και overrides" : "Plans and overrides"}</h1><p class="mt-2 text-slate-500">${locale === "el" ? "Λεπτομερής διαχείριση plan, αποθηκευτικού χώρου και ορίων λογαριασμού." : "Detailed plan, storage and account-limit management."}</p></div><span class="rounded-full bg-white px-4 py-2 text-sm text-slate-600 shadow-sm">${accounts.results.length} ${locale === "el" ? "αποτελέσματα" : "results"}</span></div><form class="mt-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_150px_160px_190px_auto]"><input name="q" value="${esc(query)}" placeholder="${locale === "el" ? "Όνομα ή email" : "Name or email"}" class="rounded-xl border border-slate-200 px-4 py-2.5"><select name="plan" class="rounded-xl border border-slate-200 px-3 py-2.5"><option value="all"${selected("all", plan)}>${locale === "el" ? "Όλα τα plans" : "All plans"}</option><option value="beta"${selected("beta", plan)}>Beta</option><option value="pro"${selected("pro", plan)}>Pro</option><option value="studio"${selected("studio", plan)}>Studio</option><option value="custom"${selected("custom", plan)}>Custom</option></select><select name="override" class="rounded-xl border border-slate-200 px-3 py-2.5"><option value="all"${selected("all", override)}>${locale === "el" ? "Όλα τα όρια" : "All limits"}</option><option value="configured"${selected("configured", override)}>Overrides</option><option value="default"${selected("default", override)}>Defaults</option></select><select name="sort" class="rounded-xl border border-slate-200 px-3 py-2.5"><option value="newest"${selected("newest", sort)}>${locale === "el" ? "Νεότεροι χρήστες" : "Newest users"}</option><option value="name_asc"${selected("name_asc", sort)}>Name A–Z</option><option value="name_desc"${selected("name_desc", sort)}>Name Z–A</option><option value="storage_desc"${selected("storage_desc", sort)}>${locale === "el" ? "Χρήση χώρου" : "Storage used"}</option><option value="events_desc"${selected("events_desc", sort)}>${locale === "el" ? "Περισσότερα events" : "Most events"}</option><option value="plan_asc"${selected("plan_asc", sort)}>Plan</option></select><button class="rounded-xl bg-slate-950 px-5 py-2.5 font-medium text-white">${locale === "el" ? "Εφαρμογή" : "Apply"}</button></form><div class="mt-5 hidden grid-cols-[minmax(220px,1.4fr)_100px_minmax(170px,1fr)_110px_110px_150px_24px] gap-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400 md:grid"><span>User</span><span>Plan</span><span>Storage</span><span>Events</span><span>Members</span><span>Updated</span><span></span></div><div class="mt-2 grid gap-2">${rows || `<p class="rounded-2xl bg-white p-8 text-center text-slate-500">${locale === "el" ? "Δεν βρέθηκαν λογαριασμοί." : "No accounts found."}</p>`}</div></main>`,
      locale,
    ),
  );
});

adminRoutes.post("/admin/accounts/:id/entitlement", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin/login");
  const body = await c.req.parseBody();
  const planKey = ["beta", "pro", "studio", "custom"].includes(
    String(body.planKey),
  )
    ? String(body.planKey)
    : "custom";
  const storageGb = Math.trunc(Number(body.storageGb));
  const eventLimit = Math.trunc(Number(body.eventLimit));
  const memberLimit = Math.trunc(Number(body.memberLimit));
  if (
    !Number.isFinite(storageGb) ||
    storageGb < 1 ||
    storageGb > 10240 ||
    !Number.isFinite(eventLimit) ||
    eventLimit < 1 ||
    eventLimit > 10000 ||
    !Number.isFinite(memberLimit) ||
    memberLimit < 1 ||
    memberLimit > 1000
  )
    return c.text("Invalid entitlement limits", 400);
  await c.env.DB.prepare(
    `INSERT INTO account_entitlements (user_id,plan_key,storage_limit_bytes,event_limit,member_limit,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET plan_key=excluded.plan_key,storage_limit_bytes=excluded.storage_limit_bytes,event_limit=excluded.event_limit,member_limit=excluded.member_limit,updated_at=excluded.updated_at`,
  )
    .bind(
      c.req.param("id"),
      planKey,
      storageGb * 1073741824,
      eventLimit,
      memberLimit,
      Date.now(),
    )
    .run();
  return c.redirect(safeAdminReturn(body.returnTo, "/admin/accounts"), 303);
});

export function adminEventCard(
  event: EventRow & { media_count: number },
  locale: "el" | "en",
) {
  const deleted = event.deleted_at !== null;
  const badgeClass = deleted
    ? "bg-red-50 text-red-700"
    : event.status === "active"
      ? "bg-emerald-100 text-emerald-700"
      : "bg-slate-200 text-[#475569]";
  const badge = deleted
    ? locale === "el" ? "Διαγραμμένο" : "Deleted"
    : event.status === "active"
      ? locale === "el" ? "Ενεργό" : "Active"
      : locale === "el" ? "Αρχειοθετημένο" : "Archived";
  const deleteLabel = deleted
    ? locale === "el" ? "Οριστική διαγραφή" : "Delete permanently"
    : locale === "el" ? "Διαγραφή" : "Delete";
  const deleteConfirm = deleted
    ? locale === "el"
      ? "Οριστική διαγραφή του event και όλων των αρχείων του; Αυτή η ενέργεια δεν αναιρείται."
      : "Permanently delete this event and all its files? This cannot be undone."
    : locale === "el"
      ? "Μεταφορά του event στον κάδο για 30 ημέρες;"
      : "Move this event to trash for 30 days?";

  return `<article class="relative rounded-2xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
    <a href="/admin/events/${encodeURIComponent(event.code)}" class="grid gap-3 rounded-2xl p-5 pr-16 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
      <div><div class="flex flex-wrap items-center gap-2"><h2 class="text-lg font-bold">${esc(event.eventName)}</h2><span class="rounded-full px-2 py-1 text-xs font-semibold ${badgeClass}">${badge}</span></div><p class="mt-1 font-mono text-sm text-[#4338ca]">${esc(event.code)}</p>${deleted && event.purge_at ? `<p class="mt-1 text-xs text-red-700">${locale === "el" ? "Οριστική διαγραφή" : "Permanent deletion"}: ${formatDateTime(event.purge_at, locale)}</p>` : ""}${event.notes ? `<p class="mt-2 line-clamp-1 text-sm text-[#64748b]">${esc(event.notes)}</p>` : ""}</div>
      <div class="text-sm text-[#64748b]"><strong class="block text-lg text-[#111827]">${event.media_count}</strong>${locale === "el" ? "αρχεία" : "files"}</div>
      <div class="text-sm text-[#64748b]"><strong class="block text-[#111827]">${esc(formatEventDates(event, locale))}</strong>${locale === "el" ? "ημερομηνία event" : "event date"}</div>
      <div class="text-sm text-[#64748b]"><strong class="block text-[#111827]">${formatDate(event.expires_at)}</strong>${locale === "el" ? "πρόσβαση έως" : "access until"}</div>
    </a>
    <details class="absolute right-3 top-3 z-20">
      <summary class="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border bg-white text-2xl shadow-sm hover:bg-[#f5f7ff]" aria-label="Event actions">⋯</summary>
      <div class="absolute right-0 mt-2 w-48 rounded-2xl border bg-white p-2 shadow-xl">
        <a href="/admin/events/${encodeURIComponent(event.code)}" class="block rounded-xl px-3 py-2 text-sm hover:bg-[#f5f7ff]">${locale === "el" ? "Επεξεργασία" : "Edit"}</a>
        <form action="/admin/events/${encodeURIComponent(event.code)}/delete" method="post" onsubmit="return confirm('${deleteConfirm}')"><button class="w-full rounded-xl px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50">${deleteLabel}</button></form>
      </div>
    </details>
  </article>`;
}

adminRoutes.get("/admin", async (c) => {
  const locale = await adminLocaleOrRedirect(c);
  if (!locale) return c.redirect("/admin/login");
  return c.redirect("/admin/users");
});

adminRoutes.get("/admin/events", async (c) => {
  const locale = await adminLocaleOrRedirect(c);
  if (!locale) return c.redirect("/admin/login");
  const query = (c.req.query("q") ?? "").trim().slice(0, 100);
  const status =
    c.req.query("status") === "deleted"
      ? "deleted"
      : c.req.query("status") === "archived"
        ? "archived"
        : c.req.query("status") === "active"
          ? "active"
          : "all";
  let sql = `SELECT e.*, COUNT(m.id) AS media_count FROM events e LEFT JOIN media m ON m.event_id=e.id WHERE 1=1`;
  const binds: string[] = [];
  if (query) {
    sql += ` AND (e.eventName LIKE ? OR e.code LIKE ?)`;
    binds.push(`%${query}%`, `%${query.toUpperCase()}%`);
  }
  if (status === "deleted") {
    sql += ` AND e.deleted_at IS NOT NULL`;
  } else if (status !== "all") {
    sql += ` AND e.deleted_at IS NULL`;
    sql += ` AND e.status = ?`;
    binds.push(status);
  }
  sql += ` GROUP BY e.id ORDER BY CASE WHEN e.deleted_at IS NOT NULL THEN 2 WHEN e.status='active' THEN 0 ELSE 1 END, COALESCE(e.event_start_date,'0000') DESC, e.created_at DESC`;
  const result = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all<EventRow & { media_count: number }>();
  const counts = await c.env.DB.prepare(
    `SELECT COUNT(*) total, SUM(CASE WHEN deleted_at IS NULL AND status='active' THEN 1 ELSE 0 END) active, SUM(CASE WHEN deleted_at IS NULL AND status='archived' THEN 1 ELSE 0 END) archived, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) deleted FROM events`,
  ).first<{ total: number; active: number; archived: number; deleted: number }>();
  const rows = result.results.map((event) => adminEventCard(event, locale)).join("");
  return c.html(
    adminShell(
      locale === "el" ? "Βιβλιοθήκη" : "Library",
      `<main class="mx-auto max-w-7xl p-5 md:p-10"><div class="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><p class="text-sm font-semibold uppercase tracking-[.2em] text-[#4338ca]">${locale === "el" ? "Βιβλιοθήκη" : "Library"}</p><h1 class="mt-1 text-4xl font-bold">${locale === "el" ? "Όλα τα events" : "All events"}</h1><p class="mt-2 text-[#64748b]">${counts?.total ?? 0} ${locale === "el" ? "συνολικά" : "total"} · ${counts?.active ?? 0} ${locale === "el" ? "ενεργά" : "active"} · ${counts?.archived ?? 0} ${locale === "el" ? "αρχειοθετημένα" : "archived"} · ${counts?.deleted ?? 0} ${locale === "el" ? "διαγραμμένα" : "deleted"}</p></div><a href="/" class="rounded-xl bg-[#4338ca] px-5 py-3 text-center font-semibold text-white">${locale === "el" ? "Νέο event" : "New event"}</a></div><form class="mb-6 grid gap-3 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-[1fr_auto_auto]"><input name="q" value="${esc(query)}" placeholder="${locale === "el" ? "Αναζήτηση ονόματος ή κωδικού" : "Search name or code"}" class="rounded-xl border px-4 py-3"><select name="status" class="rounded-xl border px-4 py-3"><option value="all"${status === "all" ? " selected" : ""}>${locale === "el" ? "Όλα" : "All"}</option><option value="active"${status === "active" ? " selected" : ""}>${locale === "el" ? "Ενεργά" : "Active"}</option><option value="archived"${status === "archived" ? " selected" : ""}>${locale === "el" ? "Αρχειοθετημένα" : "Archived"}</option><option value="deleted"${status === "deleted" ? " selected" : ""}>${locale === "el" ? "Διαγραμμένα" : "Deleted"}</option></select><button class="rounded-xl bg-[#111827] px-5 py-3 font-semibold text-white">${locale === "el" ? "Φιλτράρισμα" : "Filter"}</button></form><div class="space-y-3">${rows || `<div class="rounded-2xl bg-white py-16 text-center text-[#64748b]">${locale === "el" ? "Δεν βρέθηκαν events." : "No events found."}</div>`}</div></main>`,
      locale,
    ),
  );
});

