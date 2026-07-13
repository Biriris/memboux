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

adminRoutes.get("/admin/login", async (c) => {
  if (await isAdmin(c)) return c.redirect("/admin");
  const configured = Boolean(c.env.ADMIN_PASSWORD);
  return c.html(
    page(
      "Admin Login β€“ Memboux",
      `<main class="flex min-h-screen items-center justify-center p-5"><section class="w-full max-w-md rounded-3xl border border-[#ddd0c6] bg-white/95 p-8 shadow-[0_24px_70px_rgba(71,50,40,.12)]"><p class="text-sm font-semibold uppercase tracking-[.2em] text-[#6e4f3e]">Memboux Admin</p><h1 class="mt-2 text-3xl font-bold">Ξ™Ξ΄ΞΉΟ‰Ο„ΞΉΞΊΞ® Ξ΄ΞΉΞ±Ο‡ΞµΞ―ΟΞΉΟƒΞ·</h1><p class="mt-2 text-[#625750]">Ξ ΟΟΟƒΞ²Ξ±ΟƒΞ· ΞΌΟΞ½ΞΏ Ξ³ΞΉΞ± Ο„ΞΏΞ½ Ξ΄ΞΉΞ±Ο‡ΞµΞΉΟΞΉΟƒΟ„Ξ®.</p>${configured ? `<form action="/admin/login" method="post" class="mt-7 space-y-3"><input name="password" type="password" required autocomplete="current-password" placeholder="Admin password" class="w-full rounded-xl border px-4 py-3"><button class="w-full rounded-xl bg-[#33251f] py-3 font-semibold text-white">Ξ£ΟΞ½Ξ΄ΞµΟƒΞ·</button></form>` : `<div class="mt-7 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Ξ¤ΞΏ ADMIN_PASSWORD Ξ΄ΞµΞ½ Ξ­Ο‡ΞµΞΉ ΟΟ…ΞΈΞΌΞΉΟƒΟ„ΞµΞ― Ξ±ΞΊΟΞΌΞ· ΟƒΟ„Ξ· Cloudflare.</div>`}</section></main>`,
    ),
  );
});

adminRoutes.post("/admin/login", async (c) => {
  const configured = c.env.ADMIN_PASSWORD;
  if (!configured) return c.text("Ξ¤ΞΏ admin password Ξ΄ΞµΞ½ Ξ­Ο‡ΞµΞΉ ΟΟ…ΞΈΞΌΞΉΟƒΟ„ΞµΞ―.", 503);
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
      "Ξ ΞΏΞ»Ξ»Ξ­Ο‚ Ο€ΟΞΏΟƒΟ€Ξ¬ΞΈΞµΞΉΞµΟ‚ ΟƒΟΞ½Ξ΄ΞµΟƒΞ·Ο‚. Ξ”ΞΏΞΊΞ―ΞΌΞ±ΟƒΞµ ΞΎΞ±Ξ½Ξ¬ Ξ±ΟΞ³ΟΟ„ΞµΟΞ±.",
    );
  const body = await c.req.parseBody();
  if (!(await secureSecretEqual(String(body.password ?? ""), configured)))
    return c.html(
      page(
        "Ξ›Ξ¬ΞΈΞΏΟ‚ password",
        `<main class="flex min-h-screen items-center justify-center p-5"><section class="rounded-3xl bg-white p-8 text-center shadow-xl"><h1 class="text-2xl font-bold">Ξ›Ξ¬ΞΈΞΏΟ‚ password</h1><a href="/admin/login" class="mt-5 inline-block text-[#6e4f3e]">Ξ”ΞΏΞΊΞ―ΞΌΞ±ΟƒΞµ ΞΎΞ±Ξ½Ξ¬</a></section></main>`,
      ),
      401,
    );
  c.header("Set-Cookie", await createAdminSessionCookie(configured));
  return c.redirect("/admin", 303);
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
  return c.redirect("/admin", 303);
});

adminRoutes.get("/admin/readiness", async (c) => {
  const locale = await adminLocaleOrRedirect(c);
  if (!locale) return c.redirect("/admin/login");
  const readiness = getLaunchReadiness(c.env);
  const rows = readiness.checks
    .map(
      (check) =>
        `<article class="flex items-center justify-between gap-4 rounded-2xl border bg-white p-5 shadow-sm"><div><p class="text-xs uppercase tracking-[.15em] text-[#6e4f3e]">${esc(check.category)}</p><h2 class="mt-1 text-xl">${esc(check.label)}</h2></div><span class="rounded-full px-3 py-1 text-sm ${check.ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}">${check.ready ? (locale === "el" ? "ΞΟ„ΞΏΞΉΞΌΞΏ" : "Ready") : locale === "el" ? "Ξ•ΞΊΞΊΟΞµΞΌΞµΞ―" : "Pending"}</span></article>`,
    )
    .join("");
  return c.html(
    adminShell(
      locale === "el" ? "Ξ•Ο„ΞΏΞΉΞΌΟΟ„Ξ·Ο„Ξ± launch" : "Launch readiness",
      `<main class="mx-auto max-w-5xl p-5 md:p-10"><p class="text-xs uppercase tracking-[.2em] text-[#6e4f3e]">Production gates</p><h1 class="mt-2 text-4xl">${locale === "el" ? "Ξ•Ο„ΞΏΞΉΞΌΟΟ„Ξ·Ο„Ξ± launch" : "Launch readiness"}</h1><div class="mt-6 grid gap-3 sm:grid-cols-2"><div class="rounded-2xl p-5 ${readiness.technicalReady ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}"><p class="text-sm">Technical production</p><strong class="mt-1 block text-2xl">${readiness.technicalReady ? "READY" : "PENDING"}</strong></div><div class="rounded-2xl p-5 ${readiness.commercialReady ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}"><p class="text-sm">Commercial launch</p><strong class="mt-1 block text-2xl">${readiness.commercialReady ? "READY" : "BLOCKED"}</strong></div></div><p class="mt-5 rounded-2xl bg-white p-4 text-sm text-[#625750]">${locale === "el" ? "Ξ”ΞµΞ½ ΞµΞΌΟ†Ξ±Ξ½Ξ―Ξ¶ΞΏΞ½Ο„Ξ±ΞΉ Ο€ΞΏΟ„Ξ­ Ο„ΞΉΞΌΞ­Ο‚ secrets. Ξ¤ΞΏ commercial launch Ο€Ξ±ΟΞ±ΞΌΞ­Ξ½ΞµΞΉ ΞΊΞ»ΞµΞΉΞ΄Ο‰ΞΌΞ­Ξ½ΞΏ ΞΌΞ­Ο‡ΟΞΉ Ξ½Ξ± ΞΏΞ»ΞΏΞΊΞ»Ξ·ΟΟ‰ΞΈΞΏΟΞ½ ΟΞ»Ξ± Ο„Ξ± Ξ½ΞΏΞΌΞΉΞΊΞ¬ ΞΊΞ±ΞΉ billing gates." : "Secret values are never displayed. Commercial launch stays locked until every legal and billing gate is complete."}</p><div class="mt-6 grid gap-3">${rows}</div></main>`,
      locale,
    ),
  );
});

adminRoutes.get("/admin/professionals", async (c) => {
  const locale = await adminLocaleOrRedirect(c);
  if (!locale) return c.redirect("/admin/login");
  const users = await c.env.DB.prepare(
    `SELECT u.id,u.name,u.email,p.business_name,p.slug,p.bio,p.website,p.status FROM "user" u LEFT JOIN professional_profiles p ON p.user_id=u.id ORDER BY CASE WHEN p.user_id IS NULL THEN 1 ELSE 0 END,p.business_name,u.name`,
  ).all<{
    id: string;
    name: string;
    email: string;
    business_name: string | null;
    slug: string | null;
    bio: string | null;
    website: string | null;
    status: string | null;
  }>();
  const rows = users.results
    .map(
      (user) =>
        `<article class="rounded-2xl border bg-white p-5 shadow-sm"><div><h2 class="text-xl">${esc(user.business_name ?? user.name)}</h2><p class="text-sm text-[#625750]">${esc(user.email)}</p></div><form action="/admin/professionals/${encodeURIComponent(user.id)}" method="post" class="mt-4 grid gap-3 md:grid-cols-2"><label class="text-xs">Business name<input name="businessName" required maxlength="100" value="${esc(user.business_name ?? user.name)}" class="mt-1 w-full rounded-xl border px-3 py-2"></label><label class="text-xs">Public slug<input name="slug" required maxlength="50" value="${esc(
          user.slug ??
            (user.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "")
              .slice(0, 50) || `studio-${user.id.slice(0, 8)}`),
        )}" class="mt-1 w-full rounded-xl border px-3 py-2"></label><label class="text-xs md:col-span-2">Bio<textarea name="bio" maxlength="1000" rows="3" class="mt-1 w-full rounded-xl border px-3 py-2">${esc(user.bio ?? "")}</textarea></label><label class="text-xs">Website<input name="website" type="url" maxlength="300" value="${esc(user.website ?? "")}" class="mt-1 w-full rounded-xl border px-3 py-2"></label><label class="text-xs">Status<select name="status" class="mt-1 w-full rounded-xl border px-3 py-2"><option value="active"${user.status !== "suspended" ? " selected" : ""}>Active</option><option value="suspended"${user.status === "suspended" ? " selected" : ""}>Suspended</option></select></label><button class="rounded-xl bg-[#654534] px-4 py-2 text-white md:col-span-2">${locale === "el" ? "Ξ‘Ο€ΞΏΞΈΞ®ΞΊΞµΟ…ΟƒΞ· professional profile" : "Save professional profile"}</button></form></article>`,
    )
    .join("");
  return c.html(
    adminShell(
      locale === "el" ? "Ξ•Ο€Ξ±Ξ³Ξ³ΞµΞ»ΞΌΞ±Ο„Ξ―ΞµΟ‚" : "Professionals",
      `<main class="mx-auto max-w-6xl p-5 md:p-10"><h1 class="text-4xl">${locale === "el" ? "Professional profiles" : "Professional profiles"}</h1><p class="mt-2 text-[#625750]">${locale === "el" ? "ΞΟΞ½ΞΏ ΞµΞ½ΞµΟΞ³Ξ¬ profiles ΞΌΟ€ΞΏΟΞΏΟΞ½ Ξ½Ξ± ΞµΟ€ΞΉΞ»ΞµΞ³ΞΏΟΞ½ Ξ±Ο€Ο event owners." : "Only active profiles can be selected by event owners."}</p><div class="mt-7 grid gap-4">${rows || "<p>No users.</p>"}</div></main>`,
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
  return c.redirect("/admin/professionals", 303);
});

adminRoutes.get("/admin/accounts", async (c) => {
  const locale = await adminLocaleOrRedirect(c);
  if (!locale) return c.redirect("/admin/login");
  const query = (c.req.query("q") ?? "").trim().slice(0, 100);
  const accounts = await c.env.DB.prepare(
    `SELECT u.id,u.name,u.email,COALESCE(ae.plan_key,'beta') plan_key,COALESCE(ae.storage_limit_bytes,21474836480) storage_limit_bytes,COALESCE(ae.event_limit,25) event_limit,COALESCE(ae.member_limit,25) member_limit,COALESCE(su.used_bytes,0) used_bytes,(SELECT COUNT(*) FROM event_members em JOIN events e ON e.id=em.event_id WHERE em.user_id=u.id AND em.role='owner' AND e.deleted_at IS NULL) event_count FROM "user" u LEFT JOIN account_entitlements ae ON ae.user_id=u.id LEFT JOIN account_storage_usage su ON su.user_id=u.id WHERE (?='' OR u.name LIKE ? OR u.email LIKE ?) ORDER BY u.createdAt DESC LIMIT 250`,
  )
    .bind(query, `%${query}%`, `%${query}%`)
    .all<{
      id: string;
      name: string;
      email: string;
      plan_key: string;
      storage_limit_bytes: number;
      event_limit: number;
      member_limit: number;
      used_bytes: number;
      event_count: number;
    }>();
  const rows = accounts.results
    .map(
      (item) =>
        `<article class="rounded-2xl border bg-white p-5 shadow-sm"><div class="flex flex-wrap items-start justify-between gap-3"><div><h2 class="text-xl">${esc(item.name)}</h2><p class="break-all text-sm text-[#625750]">${esc(item.email)}</p></div><span class="rounded-full bg-[#eee4dc] px-3 py-1 text-xs uppercase">${esc(item.plan_key)}</span></div><p class="mt-4 text-sm">${formatBytes(item.used_bytes)} / ${formatBytes(item.storage_limit_bytes)} Β· ${item.event_count} / ${item.event_limit} events</p><form action="/admin/accounts/${encodeURIComponent(item.id)}/entitlement" method="post" class="mt-4 grid gap-2 sm:grid-cols-4"><select name="planKey" class="rounded-xl border px-3 py-2"><option value="beta"${item.plan_key === "beta" ? " selected" : ""}>Beta</option><option value="pro"${item.plan_key === "pro" ? " selected" : ""}>Pro</option><option value="studio"${item.plan_key === "studio" ? " selected" : ""}>Studio</option><option value="custom"${item.plan_key === "custom" ? " selected" : ""}>Custom</option></select><label class="text-xs">Storage GB<input name="storageGb" type="number" min="1" max="10240" required value="${Math.round(item.storage_limit_bytes / 1073741824)}" class="mt-1 w-full rounded-xl border px-3 py-2"></label><label class="text-xs">Events<input name="eventLimit" type="number" min="1" max="10000" required value="${item.event_limit}" class="mt-1 w-full rounded-xl border px-3 py-2"></label><label class="text-xs">Members/event<input name="memberLimit" type="number" min="1" max="1000" required value="${item.member_limit}" class="mt-1 w-full rounded-xl border px-3 py-2"></label><button class="rounded-xl bg-[#654534] px-4 py-2 text-white sm:col-span-4">${locale === "el" ? "Ξ‘Ο€ΞΏΞΈΞ®ΞΊΞµΟ…ΟƒΞ· ΞΏΟΞ―Ο‰Ξ½" : "Save limits"}</button></form></article>`,
    )
    .join("");
  return c.html(
    adminShell(
      locale === "el" ? "Plans Ο‡ΟΞ·ΟƒΟ„ΟΞ½" : "Account plans",
      `<main class="mx-auto max-w-6xl p-5 md:p-10"><h1 class="text-4xl">${locale === "el" ? "Plans ΞΊΞ±ΞΉ quotas" : "Plans and quotas"}</h1><p class="mt-2 text-[#625750]">${locale === "el" ? "Ξ¤Ξ± overrides ΞµΟ†Ξ±ΟΞΌΟΞ¶ΞΏΞ½Ο„Ξ±ΞΉ Ξ¬ΞΌΞµΟƒΞ± Ο‡Ο‰ΟΞ―Ο‚ Ο€Ξ»Ξ·ΟΟ‰ΞΌΞ®." : "Overrides apply immediately without billing."}</p><form class="mt-6"><input name="q" value="${esc(query)}" placeholder="Search name or email" class="w-full rounded-xl border bg-white px-4 py-3"></form><div class="mt-6 grid gap-4">${rows || "<p>No accounts found.</p>"}</div></main>`,
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
  return c.redirect("/admin/accounts", 303);
});

adminRoutes.get("/admin", async (c) => {
  const locale = await adminLocaleOrRedirect(c);
  if (!locale) return c.redirect("/admin/login");
  const query = (c.req.query("q") ?? "").trim().slice(0, 100);
  const status =
    c.req.query("status") === "archived"
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
  if (status !== "all") {
    sql += ` AND e.status = ?`;
    binds.push(status);
  }
  sql += ` GROUP BY e.id ORDER BY CASE e.status WHEN 'active' THEN 0 ELSE 1 END, COALESCE(e.event_start_date,'0000') DESC, e.created_at DESC`;
  const result = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all<EventRow & { media_count: number }>();
  const counts = await c.env.DB.prepare(
    `SELECT COUNT(*) total, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) active, SUM(CASE WHEN status='archived' THEN 1 ELSE 0 END) archived FROM events`,
  ).first<{ total: number; active: number; archived: number }>();
  const rows = result.results
    .map(
      (event) =>
        `<a href="/admin/events/${encodeURIComponent(event.code)}" class="grid gap-3 rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md md:grid-cols-[1fr_auto_auto_auto] md:items-center"><div><div class="flex flex-wrap items-center gap-2"><h2 class="text-lg font-bold">${esc(event.eventName)}</h2><span class="rounded-full px-2 py-1 text-xs font-semibold ${event.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-[#574c46]"}">${event.status === "active" ? (locale === "el" ? "Ξ•Ξ½ΞµΟΞ³Ο" : "Active") : locale === "el" ? "Ξ‘ΟΟ‡ΞµΞΉΞΏΞΈΞµΟ„Ξ·ΞΌΞ­Ξ½ΞΏ" : "Archived"}</span></div><p class="mt-1 font-mono text-sm text-[#6e4f3e]">${esc(event.code)}</p>${event.notes ? `<p class="mt-2 line-clamp-1 text-sm text-[#625750]">${esc(event.notes)}</p>` : ""}</div><div class="text-sm text-[#625750]"><strong class="block text-lg text-[#2b211d]">${event.media_count}</strong>${locale === "el" ? "Ξ±ΟΟ‡ΞµΞ―Ξ±" : "files"}</div><div class="text-sm text-[#625750]"><strong class="block text-[#2b211d]">${esc(formatEventDates(event, "el"))}</strong>${locale === "el" ? "Ξ·ΞΌΞµΟΞΏΞΌΞ·Ξ½Ξ―Ξ± event" : "event date"}</div><div class="text-sm text-[#625750]"><strong class="block text-[#2b211d]">${formatDate(event.expires_at)}</strong>${locale === "el" ? "Ο€ΟΟΟƒΞ²Ξ±ΟƒΞ· Ξ­Ο‰Ο‚" : "access until"}</div></a>`,
    )
    .join("");
  return c.html(
    adminShell(
      locale === "el" ? "Ξ’ΞΉΞ²Ξ»ΞΉΞΏΞΈΞ®ΞΊΞ·" : "Library",
      `<main class="mx-auto max-w-7xl p-5 md:p-10"><div class="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><p class="text-sm font-semibold uppercase tracking-[.2em] text-[#6e4f3e]">${locale === "el" ? "Ξ’ΞΉΞ²Ξ»ΞΉΞΏΞΈΞ®ΞΊΞ·" : "Library"}</p><h1 class="mt-1 text-4xl font-bold">${locale === "el" ? "ΞΞ»Ξ± Ο„Ξ± events" : "All events"}</h1><p class="mt-2 text-[#625750]">${counts?.total ?? 0} ${locale === "el" ? "ΟƒΟ…Ξ½ΞΏΞ»ΞΉΞΊΞ¬" : "total"} Β· ${counts?.active ?? 0} ${locale === "el" ? "ΞµΞ½ΞµΟΞ³Ξ¬" : "active"} Β· ${counts?.archived ?? 0} ${locale === "el" ? "Ξ±ΟΟ‡ΞµΞΉΞΏΞΈΞµΟ„Ξ·ΞΌΞ­Ξ½Ξ±" : "archived"}</p></div><a href="/" class="rounded-xl bg-[#6e4f3e] px-5 py-3 text-center font-semibold text-white">${locale === "el" ? "ΞΞ­ΞΏ event" : "New event"}</a></div><form class="mb-6 grid gap-3 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-[1fr_auto_auto]"><input name="q" value="${esc(query)}" placeholder="${locale === "el" ? "Ξ‘Ξ½Ξ±Ξ¶Ξ®Ο„Ξ·ΟƒΞ· ΞΏΞ½ΟΞΌΞ±Ο„ΞΏΟ‚ Ξ® ΞΊΟ‰Ξ΄ΞΉΞΊΞΏΟ" : "Search name or code"}" class="rounded-xl border px-4 py-3"><select name="status" class="rounded-xl border px-4 py-3"><option value="all"${status === "all" ? " selected" : ""}>${locale === "el" ? "ΞΞ»Ξ±" : "All"}</option><option value="active"${status === "active" ? " selected" : ""}>${locale === "el" ? "Ξ•Ξ½ΞµΟΞ³Ξ¬" : "Active"}</option><option value="archived"${status === "archived" ? " selected" : ""}>${locale === "el" ? "Ξ‘ΟΟ‡ΞµΞΉΞΏΞΈΞµΟ„Ξ·ΞΌΞ­Ξ½Ξ±" : "Archived"}</option></select><button class="rounded-xl bg-[#2b211d] px-5 py-3 font-semibold text-white">${locale === "el" ? "Ξ¦ΞΉΞ»Ο„ΟΞ¬ΟΞΉΟƒΞΌΞ±" : "Filter"}</button></form><div class="space-y-3">${rows || `<div class="rounded-2xl bg-white py-16 text-center text-[#625750]">${locale === "el" ? "Ξ”ΞµΞ½ Ξ²ΟΞ­ΞΈΞ·ΞΊΞ±Ξ½ events." : "No events found."}</div>`}</div></main>`,
      locale,
    ),
  );
});

adminRoutes.get("/admin/events/:code", async (c) => {
  const locale = await adminLocaleOrRedirect(c);
  if (!locale) return c.redirect("/admin/login");
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Ξ¤ΞΏ event Ξ΄ΞµΞ½ Ξ²ΟΞ­ΞΈΞ·ΞΊΞµ.", 404);
  const items = await getMedia(c.env.DB, event.id);
  const guestUrl = `${new URL(c.req.url).origin}/gallery/${event.code}`;
  const adminMediaScript = bulkSelectionScript({
    selectButtonId: "admin-select-media",
    cardSelector: ".selectable-media",
    selectorSelector: ".media-selector",
    checkboxSelector: ".media-select",
    tickSelector: ".selection-tick",
    selectText: locale === "el" ? "Ξ•Ο€ΞΉΞ»ΞΏΞ³Ξ®" : "Select",
    cancelText: locale === "el" ? "Ξ‘ΞΊΟΟΟ‰ΟƒΞ·" : "Cancel",
    actions: [
      {
        buttonId: "admin-download-selected",
        label: locale === "el" ? "Ξ›Ξ®ΟΞ· ΞµΟ€ΞΉΞ»ΞµΞ³ΞΌΞ­Ξ½Ο‰Ξ½" : "Download selected",
        kind: "download",
      },
      {
        buttonId: "admin-delete-selected",
        label: locale === "el" ? "Ξ”ΞΉΞ±Ξ³ΟΞ±Ο†Ξ® ΞµΟ€ΞΉΞ»ΞµΞ³ΞΌΞ­Ξ½Ο‰Ξ½" : "Delete selected",
        kind: "submit",
        formId: "admin-bulk-media",
        inputId: "admin-media-ids",
        confirmMessage: locale === "el" ? "ΞΞµΟ„Ξ±Ο†ΞΏΟΞ¬ Ο„Ο‰Ξ½ ΞµΟ€ΞΉΞ»ΞµΞ³ΞΌΞ­Ξ½Ο‰Ξ½ media ΟƒΟ„ΞΏΞ½ ΞΊΞ¬Ξ΄ΞΏ;" : "Move selected media to trash?",
      },
    ],
  });
  return c.html(
    adminShell(
      event.eventName,
      `<main class="mx-auto max-w-7xl p-5 md:p-10"><a href="/admin" class="text-sm font-medium text-[#6e4f3e]">β† ${locale === "el" ? "Ξ Ξ―ΟƒΟ‰ ΟƒΟ„Ξ· Ξ²ΞΉΞ²Ξ»ΞΉΞΏΞΈΞ®ΞΊΞ·" : "Back to library"}</a><div class="mt-5 grid gap-6 lg:grid-cols-[420px_1fr]"><section class="rounded-3xl bg-white p-6 shadow-lg"><div class="flex items-start justify-between gap-3"><div><h1 class="mt-1 text-3xl font-bold">${esc(event.eventName)}</h1></div><span class="rounded-full px-3 py-1 text-xs font-semibold ${event.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-[#574c46]"}">${event.status === "active" ? (locale === "el" ? "Ξ•Ξ½ΞµΟΞ³Ο" : "Active") : locale === "el" ? "Ξ‘ΟΟ‡ΞµΞΉΞΏΞΈΞµΟ„Ξ·ΞΌΞ­Ξ½ΞΏ" : "Archived"}</span></div><form action="/admin/events/${encodeURIComponent(event.code)}/update" method="post" class="mt-7 space-y-4"><label class="block text-sm font-semibold">${locale === "el" ? "ΞΞ½ΞΏΞΌΞ± event" : "Event name"}<input name="eventName" required maxlength="100" value="${esc(event.eventName)}" class="mt-1 w-full rounded-xl border px-4 py-3 font-normal"></label><label class="block text-sm font-semibold">${locale === "el" ? "ΞΞ±Ο„Ξ¬ΟƒΟ„Ξ±ΟƒΞ·" : "Status"}<select name="status" class="mt-1 w-full rounded-xl border px-4 py-3 font-normal"><option value="active"${event.status === "active" ? " selected" : ""}>${locale === "el" ? "Ξ•Ξ½ΞµΟΞ³Ο" : "Active"}</option><option value="archived"${event.status === "archived" ? " selected" : ""}>${locale === "el" ? "Ξ‘ΟΟ‡ΞµΞΉΞΏΞΈΞµΟ„Ξ·ΞΌΞ­Ξ½ΞΏ" : "Archived"}</option></select></label><div class="grid grid-cols-2 gap-3"><label class="block text-sm font-semibold">${locale === "el" ? "ΞΞ½Ξ±ΟΞΎΞ· event" : "Event start"}<input name="eventStartDate" type="date" required value="${esc(event.event_start_date ?? "")}" class="mt-1 w-full rounded-xl border px-4 py-3 font-normal"></label><label class="block text-sm font-semibold">${locale === "el" ? "Ξ›Ξ®ΞΎΞ· event" : "Event end"}<input name="eventEndDate" type="date" value="${esc(event.event_end_date ?? "")}" class="mt-1 w-full rounded-xl border px-4 py-3 font-normal"></label></div><label class="block text-sm font-semibold">${locale === "el" ? "Ξ—ΞΌΞµΟΞΏΞΌΞ·Ξ½Ξ―Ξ± Ξ»Ξ®ΞΎΞ·Ο‚ Ο€ΟΟΟƒΞ²Ξ±ΟƒΞ·Ο‚" : "Access expiration"}<input name="expires_at" type="date" required value="${dateInput(event.expires_at)}" class="mt-1 w-full rounded-xl border px-4 py-3 font-normal"></label><div class="rounded-2xl bg-[#f6f1eb] p-4"><p class="text-sm font-semibold">PIN gallery</p><p class="mt-1 text-xs text-[#625750]">${event.gallery_pin_hash ? "Ξ¥Ο€Ξ¬ΟΟ‡ΞµΞΉ ΞµΞ½ΞµΟΞ³Ο PIN. Ξ“ΞΉΞ± Ξ»ΟΞ³ΞΏΟ…Ο‚ Ξ±ΟƒΟ†Ξ±Ξ»ΞµΞ―Ξ±Ο‚ Ξ΄ΞµΞ½ ΞµΞΌΟ†Ξ±Ξ½Ξ―Ξ¶ΞµΟ„Ξ±ΞΉ. ΞΟ€ΞΏΟΞµΞ―Ο‚ Ξ½Ξ± Ο„ΞΏ Ξ±Ξ½Ο„ΞΉΞΊΞ±Ο„Ξ±ΟƒΟ„Ξ®ΟƒΞµΞΉΟ‚ Ο‡Ο‰ΟΞ―Ο‚ Ο„ΞΏ Ο€Ξ±Ξ»ΞΉΟ." : "Ξ”ΞµΞ½ Ο…Ο€Ξ¬ΟΟ‡ΞµΞΉ ΞµΞ½ΞµΟΞ³Ο PIN."}</p><input name="galleryPin" inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" placeholder="${event.gallery_pin_hash ? "ΞΞ­ΞΏ PIN (Ο€ΟΞΏΞ±ΞΉΟΞµΟ„ΞΉΞΊΞ¬)" : "ΞΞ­ΞΏ PIN 4β€“8 ΟΞ·Ο†Ξ―Ο‰Ξ½"}" class="mt-3 w-full rounded-xl border bg-white px-4 py-3 font-normal">${event.gallery_pin_hash ? '<label class="mt-3 flex items-center gap-2 text-sm font-normal"><input name="removeGalleryPin" type="checkbox"> Ξ‘Ο†Ξ±Ξ―ΟΞµΟƒΞ· Ο…Ο€Ξ¬ΟΟ‡ΞΏΞ½Ο„ΞΏΟ‚ PIN</label>' : ""}</div><label class="block text-sm font-semibold">${locale === "el" ? "Ξ•ΟƒΟ‰Ο„ΞµΟΞΉΞΊΞ­Ο‚ ΟƒΞ·ΞΌΞµΞΉΟΟƒΞµΞΉΟ‚" : "Internal notes"}<textarea name="notes" maxlength="2000" rows="6" class="mt-1 w-full rounded-xl border px-4 py-3 font-normal" placeholder="Ξ Ξ»Ξ·ΟΞΏΟ†ΞΏΟΞ―ΞµΟ‚, ΟƒΟ…ΞΌΟ†Ο‰Ξ½Ξ―ΞµΟ‚, ΞµΞΊΞΊΟΞµΞΌΟΟ„Ξ·Ο„ΞµΟ‚β€¦">${esc(event.notes)}</textarea></label><button class="w-full rounded-xl bg-[#33251f] py-3 font-semibold text-white">${locale === "el" ? "Ξ‘Ο€ΞΏΞΈΞ®ΞΊΞµΟ…ΟƒΞ· Ξ±Ξ»Ξ»Ξ±Ξ³ΟΞ½" : "Save changes"}</button></form><div class="mt-5"><a href="${esc(guestUrl)}" target="_blank" class="block rounded-xl border px-4 py-3 text-center text-sm font-semibold">${locale === "el" ? "Ξ†Ξ½ΞΏΞΉΞ³ΞΌΞ± guest gallery" : "Open guest gallery"}</a></div><form action="/admin/events/${encodeURIComponent(event.code)}/upload" method="post" enctype="multipart/form-data" class="mt-5 rounded-2xl bg-[#f6f1eb] p-4"><label class="text-sm font-semibold">${locale === "el" ? "Upload Ο†Ο‰Ο„ΞΏΞ³ΟΞ±Ο†ΞΉΟΞ½ / Ξ²Ξ―Ξ½Ο„ΞµΞΏ" : "Upload photos / videos"}<input name="file" type="file" multiple required accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" class="mt-2 w-full rounded-xl border bg-white p-3 font-normal"></label><p class="mt-2 text-xs text-[#625750]">${locale === "el" ? "ΞΟ‰Ο‚ 20 Ξ±ΟΟ‡ΞµΞ―Ξ±, 100 MB Ξ±Ξ½Ξ¬ Ξ±ΟΟ‡ΞµΞ―ΞΏ ΞΊΞ±ΞΉ 100 MB ΟƒΟ…Ξ½ΞΏΞ»ΞΉΞΊΞ¬." : "Up to 20 files, 100 MB each and 100 MB total."}</p><button class="mt-3 w-full rounded-xl bg-[#654534] px-4 py-3 text-white">${locale === "el" ? "Ξ‘Ξ½Ξ­Ξ²Ξ±ΟƒΞΌΞ±" : "Upload"}</button></form></section><section class="rounded-3xl bg-white p-6 shadow-lg"><div class="mb-5 flex items-center justify-between"><div><p class="text-sm text-[#625750]">${locale === "el" ? "Ξ”Ξ·ΞΌΞΉΞΏΟ…ΟΞ³Ξ®ΞΈΞ·ΞΊΞµ" : "Created"} ${formatDate(event.created_at)}</p><h2 class="text-2xl font-bold">${locale === "el" ? "Ξ‘ΟΟ‡ΞµΞ―Ξ±" : "Files"} (${items.length})</h2></div><div class="flex flex-wrap gap-2"><button type="button" id="admin-select-media" class="rounded-xl border px-3 py-2 text-sm">Select</button><button type="button" id="admin-download-selected" class="hidden rounded-xl bg-[#654534] px-3 py-2 text-sm text-white">Download selected</button><button type="button" id="admin-delete-selected" class="hidden rounded-xl border border-red-200 px-3 py-2 text-sm text-red-700">Delete selected</button></div></div>${items.length ? `<form id="admin-bulk-media" action="/admin/events/${encodeURIComponent(event.code)}/media/bulk-trash" method="post"><input id="admin-media-ids" type="hidden" name="ids"><div class="grid grid-cols-2 gap-4 md:grid-cols-3">${cards(items, { selectable: true, deferredSelection: true })}</div></form>` : `<p class="py-16 text-center text-[#625750]">${locale === "el" ? "Ξ”ΞµΞ½ Ο…Ο€Ξ¬ΟΟ‡ΞΏΟ…Ξ½ uploads." : "No uploads."}</p>`}</section></div></main>${adminMediaScript}`,
      locale,
    ),
  );
});

adminRoutes.post("/admin/events/:code/upload", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin/login");
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  const form = await c.req.formData();
  const files = form
    .getAll("file")
    .filter((value): value is File => value instanceof File && value.size > 0);
  if (validateUploadFiles(files))
    return c.text("ΞΞ· Ξ­Ξ³ΞΊΟ…ΟΞ· ΞµΟ€ΞΉΞ»ΞΏΞ³Ξ® Ξ±ΟΟ‡ΞµΞ―Ο‰Ξ½.", 400);
  const uploadedKeys: string[] = [];
  let reservedBytes = 0;
  let reservationOwner: string | null = null;
  try {
    for (const file of files) {
      const id = crypto.randomUUID();
      const extension = safeFileExtension(file.name);
      const objectKey = `${event.id}/${id}.${extension}`;
      const bytes = await file.arrayBuffer();
      const contentHash = await sha256Bytes(bytes);
      if (
        await c.env.DB.prepare(
          "SELECT 1 FROM media WHERE event_id=? AND content_hash=? AND deleted_at IS NULL",
        )
          .bind(event.id, contentHash)
          .first()
      )
        continue;
      const reservation = await reserveStorageForEvent(
        c.env.DB,
        event.id,
        file.size,
      );
      if (!reservation.allowed) throw new Error("storage_quota_exceeded");
      reservationOwner = reservation.ownerId;
      reservedBytes += file.size;
      let capturedAt: number | null = null;
      if (file.type.startsWith("image/"))
        try {
          const metadata = await parseMetadata(bytes, [
            "DateTimeOriginal",
            "CreateDate",
            "ModifyDate",
          ]);
          const value =
            metadata?.DateTimeOriginal ??
            metadata?.CreateDate ??
            metadata?.ModifyDate;
          const parsed =
            value instanceof Date ? value.getTime() : new Date(value).getTime();
          if (
            Number.isFinite(parsed) &&
            parsed > 0 &&
            parsed <= Date.now() + 86400000
          )
            capturedAt = parsed;
        } catch {}
      await c.env.MEDIA.put(objectKey, bytes, {
        httpMetadata: {
          contentType: file.type,
          cacheControl: "private, no-store",
        },
      });
      uploadedKeys.push(objectKey);
      await c.env.DB.prepare(
        "INSERT INTO media (id,event_id,object_key,media_type,content_type,uploaded_by,uploaded_at,captured_at,content_hash,size_bytes,title) VALUES (?,?,?,?,?,?,?,?,?,?,NULL)",
      )
        .bind(
          id,
          event.id,
          objectKey,
          file.type.startsWith("image/") ? "image" : "video",
          file.type,
          "Memboux Admin",
          Date.now(),
          capturedAt,
          contentHash,
          file.size,
        )
        .run();
    }
  } catch (error) {
    if (uploadedKeys.length) {
      await c.env.MEDIA.delete(uploadedKeys);
      await c.env.DB.batch(
        uploadedKeys.map((key) =>
          c.env.DB.prepare("DELETE FROM media WHERE object_key=?").bind(key),
        ),
      );
    }
    await releaseStorage(c.env.DB, reservationOwner, reservedBytes);
    if (
      error instanceof Error &&
      error.message.includes("storage_quota_exceeded")
    )
      return c.text("Event storage quota exceeded", 413);
    throw error;
  }
  return c.redirect(`/admin/events/${event.code}`, 303);
});

adminRoutes.post("/admin/events/:code/media/bulk-trash", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin/login");
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  const body = await c.req.parseBody();
  const ids = String(body.ids ?? "")
    .split(",")
    .filter((id) => /^[a-f0-9-]{36}$/i.test(id))
    .slice(0, 200);
  const now = Date.now();
  if (ids.length)
    await c.env.DB.batch(
      ids.map((id) =>
        c.env.DB.prepare(
          "UPDATE media SET deleted_at=?,purge_at=? WHERE id=? AND event_id=? AND deleted_at IS NULL",
        ).bind(now, now + TRASH_RETENTION_MS, id, event.id),
      ),
    );
  return c.redirect(`/admin/events/${event.code}`, 303);
});

adminRoutes.post("/admin/events/:code/update", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin/login");
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Ξ¤ΞΏ event Ξ΄ΞµΞ½ Ξ²ΟΞ­ΞΈΞ·ΞΊΞµ.", 404);
  const body = await c.req.parseBody();
  const eventName = String(body.eventName ?? "")
    .trim()
    .slice(0, 100);
  const status = body.status === "archived" ? "archived" : "active";
  const notes = String(body.notes ?? "")
    .trim()
    .slice(0, 2000);
  const eventStartDate = validEventDate(body.eventStartDate);
  const eventEndDate = body.eventEndDate
    ? validEventDate(body.eventEndDate)
    : eventStartDate;
  const newGalleryPin = String(body.galleryPin ?? "").trim();
  let galleryPinHash = event.gallery_pin_hash;
  if (body.removeGalleryPin === "on") galleryPinHash = null;
  else if (newGalleryPin) {
    if (!/^\d{4,8}$/.test(newGalleryPin))
      return c.text("Ξ¤ΞΏ PIN Ο€ΟΞ­Ο€ΞµΞΉ Ξ½Ξ± Ξ­Ο‡ΞµΞΉ 4β€“8 ΟΞ·Ο†Ξ―Ξ±.", 400);
    galleryPinHash = await sha256(newGalleryPin);
  }
  const expiresAt = Date.parse(
    `${String(body.expires_at ?? "")}T23:59:59.999Z`,
  );
  if (
    !eventName ||
    !eventStartDate ||
    !eventEndDate ||
    eventEndDate < eventStartDate ||
    !Number.isFinite(expiresAt)
  )
    return c.text("ΞΞ· Ξ­Ξ³ΞΊΟ…ΟΞ± ΟƒΟ„ΞΏΞΉΟ‡ΞµΞ―Ξ±.", 400);
  await c.env.DB.prepare(
    "UPDATE events SET eventName=?,status=?,notes=?,event_start_date=?,event_end_date=?,gallery_pin_hash=?,expires_at=?,updated_at=? WHERE id=?",
  )
    .bind(
      eventName,
      status,
      notes,
      eventStartDate,
      eventEndDate,
      galleryPinHash,
      expiresAt,
      Date.now(),
      event.id,
    )
    .run();
  return c.redirect(`/admin/events/${event.code}`, 303);
});