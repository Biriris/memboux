import { Hono } from "hono";
import { parse as parseMetadata } from "exifr";
import { ADMIN_COOKIE, TRASH_RETENTION_MS } from "../config";
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
  constantTimeEqual,
  dateInput,
  esc,
  formatDate,
  formatDateTime,
  formatEventDates,
  secureSecretEqual,
  sha256,
  sha256Bytes,
  validEventDate,
} from "../utils";
import { adminLocale, adminShell } from "../views/admin";
import { cards, lightboxMarkup } from "../views/media";
import { page } from "../views/shared";

export const adminRoutes = new Hono<{ Bindings: Bindings }>();

async function adminSession(password: string) {
  return sha256(`memboux-admin-session:${password}`);
}

async function isAdmin(c: {
  env: Bindings;
  req: { header(name: string): string | undefined };
}) {
  const password = c.env.ADMIN_PASSWORD;
  if (!password) return false;
  const cookie = c.req.header("Cookie") ?? "";
  const value = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_COOKIE}=`))
    ?.slice(ADMIN_COOKIE.length + 1);
  return Boolean(
    value && constantTimeEqual(value, await adminSession(password)),
  );
}

adminRoutes.get("/admin/login", async (c) => {
  if (await isAdmin(c)) return c.redirect("/admin");
  const configured = Boolean(c.env.ADMIN_PASSWORD);
  return c.html(
    page(
      "Admin Login – Memboux",
      `<main class="flex min-h-screen items-center justify-center p-5"><section class="w-full max-w-md rounded-3xl border border-[#ddd0c6] bg-white/95 p-8 shadow-[0_24px_70px_rgba(71,50,40,.12)]"><p class="text-sm font-semibold uppercase tracking-[.2em] text-[#6e4f3e]">Memboux Admin</p><h1 class="mt-2 text-3xl font-bold">Ιδιωτική διαχείριση</h1><p class="mt-2 text-[#625750]">Πρόσβαση μόνο για τον διαχειριστή.</p>${configured ? `<form action="/admin/login" method="post" class="mt-7 space-y-3"><input name="password" type="password" required autocomplete="current-password" placeholder="Admin password" class="w-full rounded-xl border px-4 py-3"><button class="w-full rounded-xl bg-[#33251f] py-3 font-semibold text-white">Σύνδεση</button></form>` : `<div class="mt-7 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Το ADMIN_PASSWORD δεν έχει ρυθμιστεί ακόμη στη Cloudflare.</div>`}</section></main>`,
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
        `<main class="flex min-h-screen items-center justify-center p-5"><section class="rounded-3xl bg-white p-8 text-center shadow-xl"><h1 class="text-2xl font-bold">Λάθος password</h1><a href="/admin/login" class="mt-5 inline-block text-[#6e4f3e]">Δοκίμασε ξανά</a></section></main>`,
      ),
      401,
    );
  c.header(
    "Set-Cookie",
    `${ADMIN_COOKIE}=${await adminSession(configured)}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`,
  );
  return c.redirect("/admin", 303);
});

adminRoutes.post("/admin/logout", (c) => {
  c.header(
    "Set-Cookie",
    `${ADMIN_COOKIE}=; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
  );
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

adminRoutes.get("/admin/media/:id", async (c) => {
  if (!(await isAdmin(c))) return c.text("Unauthorized", 401);
  const row = await c.env.DB.prepare(
    "SELECT object_key,content_type FROM media WHERE id=?",
  )
    .bind(c.req.param("id"))
    .first<{ object_key: string; content_type: string }>();
  if (!row) return c.text("Media not found", 404);
  const object = await c.env.MEDIA.get(row.object_key);
  if (!object) return c.text("Media not found", 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": row.content_type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

adminRoutes.get("/admin/reported", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin/login");
  const locale = adminLocale(c.req.raw);
  const media = await c.env.DB.prepare(
    `SELECT m.id,m.media_type,m.reported_at,e.eventName,e.code,(SELECT requester_email FROM media_removal_requests r WHERE r.media_id=m.id AND r.status='pending' ORDER BY r.created_at DESC LIMIT 1) requester_email,(SELECT reason FROM media_removal_requests r WHERE r.media_id=m.id AND r.status='pending' ORDER BY r.created_at DESC LIMIT 1) reason FROM media m JOIN events e ON e.id=m.event_id WHERE m.reported_at IS NOT NULL AND m.deleted_at IS NULL ORDER BY m.reported_at DESC`,
  ).all<{
    id: string;
    media_type: string;
    reported_at: number;
    eventName: string;
    code: string;
    requester_email: string | null;
    reason: string | null;
  }>();
  const cards = media.results
    .map(
      (item) =>
        `<article class="selectable-media relative overflow-hidden rounded-2xl border bg-white shadow-sm transition"><label class="media-selector absolute inset-0 z-20 hidden cursor-pointer"><input type="checkbox" class="media-select sr-only" value="${esc(item.id)}"><span class="selection-tick absolute left-3 top-3 hidden h-8 w-8 items-center justify-center rounded-full bg-[#654534] text-white shadow">✓</span></label><button type="button" class="lightbox-item block aspect-square w-full bg-[#e8ddd3]" data-src="/admin/media/${encodeURIComponent(item.id)}" data-type="${item.media_type}">${item.media_type === "image" ? `<img src="/admin/media/${encodeURIComponent(item.id)}" alt="" loading="lazy" class="h-full w-full object-cover">` : `<video src="/admin/media/${encodeURIComponent(item.id)}" muted preload="metadata" class="h-full w-full object-cover"></video>`}</button><div class="p-4"><h2 class="truncate text-xl">${esc(item.eventName)}</h2><p class="mt-1 truncate text-xs text-[#625750]">${esc(item.requester_email ?? "")}</p><p class="mt-2 line-clamp-3 text-sm">${esc(item.reason ?? "")}</p><p class="mt-2 text-xs text-red-700">Reported ${formatDateTime(item.reported_at, "el")}</p></div></article>`,
    )
    .join("");
  const script = `<script>const select=document.getElementById('reported-select'),restore=document.getElementById('reported-restore'),remove=document.getElementById('reported-delete'),selectors=[...document.querySelectorAll('.media-selector')],selected=()=>[...document.querySelectorAll('.media-select:checked')];let mode=false;const refresh=()=>{document.querySelectorAll('.selectable-media').forEach(card=>{const checked=card.querySelector('.media-select')?.checked;card.classList.toggle('ring-4',!!checked);card.classList.toggle('ring-[#8b6250]',!!checked);card.classList.toggle('brightness-75',!!checked);const tick=card.querySelector('.selection-tick');if(tick){tick.classList.toggle('hidden',!checked);tick.classList.toggle('flex',!!checked)}});const count=selected().length;restore.textContent='Restore selected ('+count+')';remove.textContent='Delete selected ('+count+')'};select.onclick=()=>{mode=!mode;selectors.forEach(x=>x.classList.toggle('hidden',!mode));restore.classList.toggle('hidden',!mode);remove.classList.toggle('hidden',!mode);select.textContent=mode?'Cancel':'Select';if(!mode){document.querySelectorAll('.media-select').forEach(x=>x.checked=false);refresh()}};document.querySelectorAll('.media-select').forEach(x=>x.onchange=refresh);const submit=(formId,inputId)=>{const ids=selected().map(x=>x.value);if(ids.length){document.getElementById(inputId).value=ids.join(',');document.getElementById(formId).submit()}};restore.onclick=()=>submit('reported-restore-form','reported-restore-ids');remove.onclick=()=>{if(confirm('Move selected reported media to trash?'))submit('reported-delete-form','reported-delete-ids')}<\/script>`;
  return c.html(
    adminShell(
      "Reported",
      `<main class="mx-auto max-w-7xl p-5 md:p-10"><a href="/admin" class="text-sm text-[#6e4f3e]">← ${locale === "el" ? "Πίσω στη βιβλιοθήκη" : "Back to library"}</a><div class="mt-4 flex flex-wrap items-end justify-between gap-3"><div><h1 class="text-4xl">${locale === "el" ? "Reported φωτογραφίες" : "Reported media"}</h1><p class="mt-2 text-[#625750]">${locale === "el" ? "Απομονωμένες από guest και owner galleries μέχρι να αποφασίσει ο admin." : "Hidden from guest and owner galleries until reviewed by the admin."}</p></div><div class="flex flex-wrap gap-2"><button id="reported-select" class="rounded-xl border px-4 py-2">${locale === "el" ? "Επιλογή" : "Select"}</button><button id="reported-restore" class="hidden rounded-xl bg-[#654534] px-4 py-2 text-white">${locale === "el" ? "Επαναφορά επιλεγμένων" : "Restore selected"}</button><button id="reported-delete" class="hidden rounded-xl border border-red-200 px-4 py-2 text-red-700">${locale === "el" ? "Διαγραφή επιλεγμένων" : "Delete selected"}</button></div></div><form id="reported-restore-form" action="/admin/reported/restore" method="post"><input id="reported-restore-ids" type="hidden" name="ids"></form><form id="reported-delete-form" action="/admin/reported/trash" method="post"><input id="reported-delete-ids" type="hidden" name="ids"></form><div class="mt-7 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">${cards || `<p class="col-span-full rounded-2xl bg-white p-10 text-center text-[#625750]">${locale === "el" ? "Δεν υπάρχουν reported φωτογραφίες." : "No reported media."}</p>`}</div></main>${lightboxMarkup(locale)}${script}`,
      locale,
    ),
  );
});

adminRoutes.get("/admin/privacy-requests", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin/login");
  const locale = adminLocale(c.req.raw);
  const status = ["pending", "resolved", "dismissed"].includes(
    c.req.query("status") ?? "",
  )
    ? c.req.query("status")!
    : "pending";
  const requests = await c.env.DB.prepare(
    "SELECT id,email,request_type,details,status,created_at,resolved_at FROM privacy_requests WHERE status=? ORDER BY created_at ASC LIMIT 250",
  )
    .bind(status)
    .all<{
      id: string;
      email: string;
      request_type: string;
      details: string;
      status: string;
      created_at: number;
      resolved_at: number | null;
    }>();
  const rows = requests.results
    .map(
      (item) =>
        `<article class="rounded-2xl border bg-white p-5 shadow-sm"><div class="flex flex-wrap items-start justify-between gap-3"><div><span class="rounded-full bg-[#eee4dc] px-3 py-1 text-xs uppercase">${esc(item.request_type)}</span><h2 class="mt-3 break-all text-xl">${esc(item.email)}</h2><p class="mt-1 text-xs text-[#625750]">${formatDateTime(item.created_at, locale)} · ${esc(item.id)}</p></div><span class="rounded-full px-3 py-1 text-xs ${item.status === "pending" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}">${esc(item.status)}</span></div><p class="mt-4 whitespace-pre-wrap rounded-xl bg-[#f8f3ee] p-4 text-sm">${esc(item.details)}</p>${item.status === "pending" ? `<div class="mt-4 flex gap-2"><form action="/admin/privacy-requests/${encodeURIComponent(item.id)}/resolve" method="post"><button class="rounded-xl bg-[#654534] px-4 py-2 text-sm text-white">${locale === "el" ? "Επίλυση" : "Resolve"}</button></form><form action="/admin/privacy-requests/${encodeURIComponent(item.id)}/dismiss" method="post"><button class="rounded-xl border px-4 py-2 text-sm">${locale === "el" ? "Απόρριψη" : "Dismiss"}</button></form></div>` : ""}</article>`,
    )
    .join("");
  return c.html(
    adminShell(
      locale === "el" ? "Αιτήματα απορρήτου" : "Privacy requests",
      `<main class="mx-auto max-w-5xl p-5 md:p-10"><div class="flex flex-wrap items-end justify-between gap-4"><div><p class="text-xs uppercase tracking-[.2em] text-[#6e4f3e]">Data rights</p><h1 class="mt-2 text-4xl">${locale === "el" ? "Αιτήματα απορρήτου" : "Privacy requests"}</h1></div><form><select name="status" onchange="this.form.submit()" class="rounded-xl border bg-white px-4 py-3"><option value="pending"${status === "pending" ? " selected" : ""}>Pending</option><option value="resolved"${status === "resolved" ? " selected" : ""}>Resolved</option><option value="dismissed"${status === "dismissed" ? " selected" : ""}>Dismissed</option></select></form></div><div class="mt-7 grid gap-4">${rows || `<p class="rounded-2xl bg-white p-10 text-center text-[#625750]">${locale === "el" ? "Δεν υπάρχουν αιτήματα." : "No requests."}</p>`}</div></main>`,
      locale,
    ),
  );
});

adminRoutes.post(
  "/admin/privacy-requests/:id/:action{resolve|dismiss}",
  async (c) => {
    if (!(await isAdmin(c))) return c.redirect("/admin/login");
    const status =
      c.req.param("action") === "resolve" ? "resolved" : "dismissed";
    await c.env.DB.prepare(
      "UPDATE privacy_requests SET status=?,resolved_at=? WHERE id=? AND status='pending'",
    )
      .bind(status, Date.now(), c.req.param("id"))
      .run();
    return c.redirect(`/admin/privacy-requests?status=${status}`, 303);
  },
);

adminRoutes.post("/admin/reported/:action{restore|trash}", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin/login");
  const body = await c.req.parseBody();
  const ids = String(body.ids ?? "")
    .split(",")
    .filter((id) => /^[a-f0-9-]{36}$/i.test(id))
    .slice(0, 200);
  if (ids.length) {
    const now = Date.now();
    const statements = ids.flatMap((id) =>
      c.req.param("action") === "restore"
        ? [
            c.env.DB.prepare(
              "UPDATE media SET reported_at=NULL WHERE id=? AND reported_at IS NOT NULL AND deleted_at IS NULL",
            ).bind(id),
            c.env.DB.prepare(
              "UPDATE media_removal_requests SET status='resolved',resolved_at=? WHERE media_id=? AND status='pending'",
            ).bind(now, id),
          ]
        : [
            c.env.DB.prepare(
              "UPDATE media SET deleted_at=?,purge_at=? WHERE id=? AND reported_at IS NOT NULL AND deleted_at IS NULL",
            ).bind(now, now + TRASH_RETENTION_MS, id),
            c.env.DB.prepare(
              "UPDATE media_removal_requests SET status='resolved',resolved_at=? WHERE media_id=? AND status='pending'",
            ).bind(now, id),
          ],
    );
    await c.env.DB.batch(statements);
  }
  return c.redirect("/admin/reported", 303);
});

adminRoutes.get("/admin/trash", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin/login");
  const locale = adminLocale(c.req.raw);
  const media = await c.env.DB.prepare(
    "SELECT m.id,m.media_type,m.deleted_at,m.purge_at,e.eventName,e.code FROM media m JOIN events e ON e.id=m.event_id WHERE m.deleted_at IS NOT NULL ORDER BY m.purge_at ASC",
  ).all<{
    id: string;
    media_type: string;
    deleted_at: number;
    purge_at: number;
    eventName: string;
    code: string;
  }>();
  const rows = media.results
    .map(
      (item) =>
        `<article class="trash-selectable group relative overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"><label class="trash-selector absolute inset-0 z-20 hidden cursor-pointer"><input type="checkbox" class="trash-select sr-only" value="${esc(item.id)}"><span class="trash-tick absolute left-3 top-3 hidden h-9 w-9 items-center justify-center rounded-full bg-[#654534] text-white shadow-lg">✓</span></label><button type="button" class="lightbox-item relative block aspect-square w-full overflow-hidden bg-[#e8ddd3]" data-src="/admin/media/${encodeURIComponent(item.id)}" data-type="${item.media_type}" aria-label="${locale === "el" ? "Προεπισκόπηση διαγραμμένου αρχείου" : "Preview deleted media"}">${item.media_type === "image" ? `<img src="/admin/media/${encodeURIComponent(item.id)}" alt="" loading="lazy" class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]">` : `<video src="/admin/media/${encodeURIComponent(item.id)}" muted preload="metadata" class="h-full w-full object-cover"></video>`}<span class="absolute right-3 top-3 rounded-full bg-black/65 px-3 py-1 text-xs text-white">${item.media_type === "image" ? "Image" : "Video"}</span><span class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-4 pb-3 pt-10 text-left text-sm text-white">${locale === "el" ? "Πάτησε για preview" : "Open preview"}</span></button><div class="p-4"><h2 class="truncate text-lg">${esc(item.eventName)}</h2><p class="mt-1 text-xs text-[#625750]">${locale === "el" ? "Διαγράφηκε" : "Deleted"} ${formatDateTime(item.deleted_at, locale)}</p><p class="mt-1 text-xs text-red-700">${locale === "el" ? "Οριστική διαγραφή" : "Permanent deletion"} ${formatDateTime(item.purge_at, locale)}</p></div></article>`,
    )
    .join("");
  const trashScript = `<script>const select=document.getElementById('trash-select'),restore=document.getElementById('trash-restore'),remove=document.getElementById('trash-delete'),selectors=[...document.querySelectorAll('.trash-selector')],selected=()=>[...document.querySelectorAll('.trash-select:checked')];let mode=false;const refresh=()=>{document.querySelectorAll('.trash-selectable').forEach(card=>{const checked=card.querySelector('.trash-select')?.checked;card.classList.toggle('ring-4',!!checked);card.classList.toggle('ring-[#8b6250]',!!checked);card.classList.toggle('brightness-75',!!checked);const tick=card.querySelector('.trash-tick');if(tick){tick.classList.toggle('hidden',!checked);tick.classList.toggle('flex',!!checked)}});const count=selected().length;restore.textContent=${JSON.stringify(locale === "el" ? "Επαναφορά επιλεγμένων" : "Restore selected")}+' ('+count+')';remove.textContent=${JSON.stringify(locale === "el" ? "Οριστική διαγραφή" : "Delete permanently")}+' ('+count+')'};select.onclick=()=>{mode=!mode;selectors.forEach(x=>x.classList.toggle('hidden',!mode));restore.classList.toggle('hidden',!mode);remove.classList.toggle('hidden',!mode);select.textContent=mode?${JSON.stringify(locale === "el" ? "Ακύρωση" : "Cancel")}:${JSON.stringify(locale === "el" ? "Επιλογή" : "Select")};if(!mode){document.querySelectorAll('.trash-select').forEach(x=>x.checked=false);refresh()}};document.querySelectorAll('.trash-select').forEach(x=>x.onchange=refresh);const submit=(formId,inputId)=>{const ids=selected().map(x=>x.value);if(ids.length){document.getElementById(inputId).value=ids.join(',');document.getElementById(formId).submit()}};restore.onclick=()=>submit('trash-restore-form','trash-restore-ids');remove.onclick=()=>{if(confirm(${JSON.stringify(locale === "el" ? "Οριστική διαγραφή των επιλεγμένων αρχείων;" : "Permanently delete selected files?")}))submit('trash-delete-form','trash-delete-ids')}<\/script>`;
  return c.html(
    adminShell(
      locale === "el" ? "Κάδος" : "Trash",
      `<main class="mx-auto max-w-7xl p-5 md:p-10"><a href="/admin" class="text-sm text-[#6e4f3e]">← ${locale === "el" ? "Πίσω στη βιβλιοθήκη" : "Back to library"}</a><div class="mt-4 flex flex-wrap items-end justify-between gap-3"><div><h1 class="text-4xl">${locale === "el" ? "Κάδος φωτογραφιών" : "Media trash"}</h1><p class="mt-2 text-[#625750]">${locale === "el" ? "Οι φωτογραφίες διαγράφονται οριστικά 30 ημέρες μετά τη μεταφορά τους στον κάδο. Πάτησε το preview για μεγέθυνση." : "Media is permanently deleted 30 days after being moved to trash. Select a preview to enlarge it."}</p></div><div class="flex flex-wrap gap-2"><button id="trash-select" class="rounded-xl border px-4 py-2">${locale === "el" ? "Επιλογή" : "Select"}</button><button id="trash-restore" class="hidden rounded-xl bg-[#654534] px-4 py-2 text-white">${locale === "el" ? "Επαναφορά επιλεγμένων" : "Restore selected"}</button><button id="trash-delete" class="hidden rounded-xl border border-red-200 px-4 py-2 text-red-700">${locale === "el" ? "Οριστική διαγραφή" : "Delete permanently"}</button></div></div><form id="trash-restore-form" action="/admin/trash/restore" method="post"><input id="trash-restore-ids" type="hidden" name="ids"></form><form id="trash-delete-form" action="/admin/trash/delete" method="post"><input id="trash-delete-ids" type="hidden" name="ids"></form><div class="mt-7 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">${rows || `<p class="rounded-2xl bg-white p-8 text-center text-[#625750]">${locale === "el" ? "Ο κάδος είναι άδειος." : "Trash is empty."}</p>`}</div></main>${lightboxMarkup(locale)}${trashScript}`,
      locale,
    ),
  );
});

adminRoutes.post("/admin/trash/:action{restore|delete}", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin/login");
  const body = await c.req.parseBody();
  const ids = String(body.ids ?? "")
    .split(",")
    .filter((id) => /^[a-f0-9-]{36}$/i.test(id))
    .slice(0, 200);
  for (const id of ids) {
    if (c.req.param("action") === "delete")
      await permanentlyDeleteMedia(c.env, id);
    else await restoreDeletedMedia(c.env.DB, id);
  }
  return c.redirect("/admin/trash", 303);
});

adminRoutes.post("/admin/events/:code/media/:id/restore", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin/login");
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  const media = await c.env.DB.prepare(
    "SELECT id FROM media WHERE id=? AND event_id=? AND deleted_at IS NOT NULL",
  )
    .bind(c.req.param("id"), event.id)
    .first<{ id: string }>();
  if (!media) return c.text("Media not found", 404);
  const result = await restoreDeletedMedia(c.env.DB, media.id);
  if (result === "duplicate")
    return c.text(
      "Δεν μπορεί να γίνει επαναφορά επειδή υπάρχει ήδη το ίδιο αρχείο στο event.",
      409,
    );
  return c.redirect("/admin/trash", 303);
});

adminRoutes.get("/admin/readiness", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin/login");
  const locale = adminLocale(c.req.raw);
  const readiness = getLaunchReadiness(c.env);
  const rows = readiness.checks
    .map(
      (check) =>
        `<article class="flex items-center justify-between gap-4 rounded-2xl border bg-white p-5 shadow-sm"><div><p class="text-xs uppercase tracking-[.15em] text-[#6e4f3e]">${esc(check.category)}</p><h2 class="mt-1 text-xl">${esc(check.label)}</h2></div><span class="rounded-full px-3 py-1 text-sm ${check.ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}">${check.ready ? (locale === "el" ? "Έτοιμο" : "Ready") : locale === "el" ? "Εκκρεμεί" : "Pending"}</span></article>`,
    )
    .join("");
  return c.html(
    adminShell(
      locale === "el" ? "Ετοιμότητα launch" : "Launch readiness",
      `<main class="mx-auto max-w-5xl p-5 md:p-10"><p class="text-xs uppercase tracking-[.2em] text-[#6e4f3e]">Production gates</p><h1 class="mt-2 text-4xl">${locale === "el" ? "Ετοιμότητα launch" : "Launch readiness"}</h1><div class="mt-6 grid gap-3 sm:grid-cols-2"><div class="rounded-2xl p-5 ${readiness.technicalReady ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}"><p class="text-sm">Technical production</p><strong class="mt-1 block text-2xl">${readiness.technicalReady ? "READY" : "PENDING"}</strong></div><div class="rounded-2xl p-5 ${readiness.commercialReady ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}"><p class="text-sm">Commercial launch</p><strong class="mt-1 block text-2xl">${readiness.commercialReady ? "READY" : "BLOCKED"}</strong></div></div><p class="mt-5 rounded-2xl bg-white p-4 text-sm text-[#625750]">${locale === "el" ? "Δεν εμφανίζονται ποτέ τιμές secrets. Το commercial launch παραμένει κλειδωμένο μέχρι να ολοκληρωθούν όλα τα νομικά και billing gates." : "Secret values are never displayed. Commercial launch stays locked until every legal and billing gate is complete."}</p><div class="mt-6 grid gap-3">${rows}</div></main>`,
      locale,
    ),
  );
});

adminRoutes.get("/admin/professionals", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin/login");
  const locale = adminLocale(c.req.raw);
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
        )}" class="mt-1 w-full rounded-xl border px-3 py-2"></label><label class="text-xs md:col-span-2">Bio<textarea name="bio" maxlength="1000" rows="3" class="mt-1 w-full rounded-xl border px-3 py-2">${esc(user.bio ?? "")}</textarea></label><label class="text-xs">Website<input name="website" type="url" maxlength="300" value="${esc(user.website ?? "")}" class="mt-1 w-full rounded-xl border px-3 py-2"></label><label class="text-xs">Status<select name="status" class="mt-1 w-full rounded-xl border px-3 py-2"><option value="active"${user.status !== "suspended" ? " selected" : ""}>Active</option><option value="suspended"${user.status === "suspended" ? " selected" : ""}>Suspended</option></select></label><button class="rounded-xl bg-[#654534] px-4 py-2 text-white md:col-span-2">${locale === "el" ? "Αποθήκευση professional profile" : "Save professional profile"}</button></form></article>`,
    )
    .join("");
  return c.html(
    adminShell(
      locale === "el" ? "Επαγγελματίες" : "Professionals",
      `<main class="mx-auto max-w-6xl p-5 md:p-10"><h1 class="text-4xl">${locale === "el" ? "Professional profiles" : "Professional profiles"}</h1><p class="mt-2 text-[#625750]">${locale === "el" ? "Μόνο ενεργά profiles μπορούν να επιλεγούν από event owners." : "Only active profiles can be selected by event owners."}</p><div class="mt-7 grid gap-4">${rows || "<p>No users.</p>"}</div></main>`,
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
  if (!(await isAdmin(c))) return c.redirect("/admin/login");
  const locale = adminLocale(c.req.raw);
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
        `<article class="rounded-2xl border bg-white p-5 shadow-sm"><div class="flex flex-wrap items-start justify-between gap-3"><div><h2 class="text-xl">${esc(item.name)}</h2><p class="break-all text-sm text-[#625750]">${esc(item.email)}</p></div><span class="rounded-full bg-[#eee4dc] px-3 py-1 text-xs uppercase">${esc(item.plan_key)}</span></div><p class="mt-4 text-sm">${formatBytes(item.used_bytes)} / ${formatBytes(item.storage_limit_bytes)} · ${item.event_count} / ${item.event_limit} events</p><form action="/admin/accounts/${encodeURIComponent(item.id)}/entitlement" method="post" class="mt-4 grid gap-2 sm:grid-cols-4"><select name="planKey" class="rounded-xl border px-3 py-2"><option value="beta"${item.plan_key === "beta" ? " selected" : ""}>Beta</option><option value="pro"${item.plan_key === "pro" ? " selected" : ""}>Pro</option><option value="studio"${item.plan_key === "studio" ? " selected" : ""}>Studio</option><option value="custom"${item.plan_key === "custom" ? " selected" : ""}>Custom</option></select><label class="text-xs">Storage GB<input name="storageGb" type="number" min="1" max="10240" required value="${Math.round(item.storage_limit_bytes / 1073741824)}" class="mt-1 w-full rounded-xl border px-3 py-2"></label><label class="text-xs">Events<input name="eventLimit" type="number" min="1" max="10000" required value="${item.event_limit}" class="mt-1 w-full rounded-xl border px-3 py-2"></label><label class="text-xs">Members/event<input name="memberLimit" type="number" min="1" max="1000" required value="${item.member_limit}" class="mt-1 w-full rounded-xl border px-3 py-2"></label><button class="rounded-xl bg-[#654534] px-4 py-2 text-white sm:col-span-4">${locale === "el" ? "Αποθήκευση ορίων" : "Save limits"}</button></form></article>`,
    )
    .join("");
  return c.html(
    adminShell(
      locale === "el" ? "Plans χρηστών" : "Account plans",
      `<main class="mx-auto max-w-6xl p-5 md:p-10"><h1 class="text-4xl">${locale === "el" ? "Plans και quotas" : "Plans and quotas"}</h1><p class="mt-2 text-[#625750]">${locale === "el" ? "Τα overrides εφαρμόζονται άμεσα χωρίς πληρωμή." : "Overrides apply immediately without billing."}</p><form class="mt-6"><input name="q" value="${esc(query)}" placeholder="Search name or email" class="w-full rounded-xl border bg-white px-4 py-3"></form><div class="mt-6 grid gap-4">${rows || "<p>No accounts found.</p>"}</div></main>`,
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
  if (!(await isAdmin(c))) return c.redirect("/admin/login");
  const locale = adminLocale(c.req.raw);
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
        `<a href="/admin/events/${encodeURIComponent(event.code)}" class="grid gap-3 rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md md:grid-cols-[1fr_auto_auto_auto] md:items-center"><div><div class="flex flex-wrap items-center gap-2"><h2 class="text-lg font-bold">${esc(event.eventName)}</h2><span class="rounded-full px-2 py-1 text-xs font-semibold ${event.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-[#574c46]"}">${event.status === "active" ? (locale === "el" ? "Ενεργό" : "Active") : locale === "el" ? "Αρχειοθετημένο" : "Archived"}</span></div><p class="mt-1 font-mono text-sm text-[#6e4f3e]">${esc(event.code)}</p>${event.notes ? `<p class="mt-2 line-clamp-1 text-sm text-[#625750]">${esc(event.notes)}</p>` : ""}</div><div class="text-sm text-[#625750]"><strong class="block text-lg text-[#2b211d]">${event.media_count}</strong>${locale === "el" ? "αρχεία" : "files"}</div><div class="text-sm text-[#625750]"><strong class="block text-[#2b211d]">${esc(formatEventDates(event, "el"))}</strong>${locale === "el" ? "ημερομηνία event" : "event date"}</div><div class="text-sm text-[#625750]"><strong class="block text-[#2b211d]">${formatDate(event.expires_at)}</strong>${locale === "el" ? "πρόσβαση έως" : "access until"}</div></a>`,
    )
    .join("");
  return c.html(
    adminShell(
      locale === "el" ? "Βιβλιοθήκη" : "Library",
      `<main class="mx-auto max-w-7xl p-5 md:p-10"><div class="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><p class="text-sm font-semibold uppercase tracking-[.2em] text-[#6e4f3e]">${locale === "el" ? "Βιβλιοθήκη" : "Library"}</p><h1 class="mt-1 text-4xl font-bold">${locale === "el" ? "Όλα τα events" : "All events"}</h1><p class="mt-2 text-[#625750]">${counts?.total ?? 0} ${locale === "el" ? "συνολικά" : "total"} · ${counts?.active ?? 0} ${locale === "el" ? "ενεργά" : "active"} · ${counts?.archived ?? 0} ${locale === "el" ? "αρχειοθετημένα" : "archived"}</p></div><a href="/" class="rounded-xl bg-[#6e4f3e] px-5 py-3 text-center font-semibold text-white">${locale === "el" ? "Νέο event" : "New event"}</a></div><form class="mb-6 grid gap-3 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-[1fr_auto_auto]"><input name="q" value="${esc(query)}" placeholder="${locale === "el" ? "Αναζήτηση ονόματος ή κωδικού" : "Search name or code"}" class="rounded-xl border px-4 py-3"><select name="status" class="rounded-xl border px-4 py-3"><option value="all"${status === "all" ? " selected" : ""}>${locale === "el" ? "Όλα" : "All"}</option><option value="active"${status === "active" ? " selected" : ""}>${locale === "el" ? "Ενεργά" : "Active"}</option><option value="archived"${status === "archived" ? " selected" : ""}>${locale === "el" ? "Αρχειοθετημένα" : "Archived"}</option></select><button class="rounded-xl bg-[#2b211d] px-5 py-3 font-semibold text-white">${locale === "el" ? "Φιλτράρισμα" : "Filter"}</button></form><div class="space-y-3">${rows || `<div class="rounded-2xl bg-white py-16 text-center text-[#625750]">${locale === "el" ? "Δεν βρέθηκαν events." : "No events found."}</div>`}</div></main>`,
      locale,
    ),
  );
});

adminRoutes.get("/admin/events/:code", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin/login");
  const locale = adminLocale(c.req.raw);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Το event δεν βρέθηκε.", 404);
  const items = await getMedia(c.env.DB, event.id);
  const guestUrl = `${new URL(c.req.url).origin}/gallery/${event.code}`;
  const adminMediaScript = `<script>const adminSelectButton=document.getElementById('admin-select-media'),adminDownloadButton=document.getElementById('admin-download-selected'),adminDeleteButton=document.getElementById('admin-delete-selected'),adminSelectors=[...document.querySelectorAll('.media-selector')],adminSelected=()=>[...document.querySelectorAll('.media-select:checked')];let adminSelectionMode=false;const adminRefresh=()=>{document.querySelectorAll('.selectable-media').forEach(card=>{const checked=card.querySelector('.media-select')?.checked;card.classList.toggle('ring-4',!!checked);card.classList.toggle('ring-[#8b6250]',!!checked);card.classList.toggle('brightness-75',!!checked);const tick=card.querySelector('.selection-tick');if(tick){tick.classList.toggle('hidden',!checked);tick.classList.toggle('flex',!!checked)}});const count=adminSelected().length;adminDownloadButton.textContent='Download selected ('+count+')';adminDeleteButton.textContent='Delete selected ('+count+')'};adminSelectButton.onclick=()=>{adminSelectionMode=!adminSelectionMode;adminSelectors.forEach(selector=>selector.classList.toggle('hidden',!adminSelectionMode));adminDownloadButton.classList.toggle('hidden',!adminSelectionMode);adminDeleteButton.classList.toggle('hidden',!adminSelectionMode);adminSelectButton.textContent=adminSelectionMode?'Cancel':'Select';if(!adminSelectionMode){document.querySelectorAll('.media-select').forEach(box=>box.checked=false);adminRefresh()}};document.querySelectorAll('.media-select').forEach(box=>box.onchange=adminRefresh);adminDownloadButton.onclick=()=>adminSelected().forEach((box,i)=>setTimeout(()=>{const a=document.createElement('a');a.href=box.dataset.download;a.download='';a.click()},i*250));adminDeleteButton.onclick=()=>{const ids=adminSelected().map(box=>box.value);if(ids.length&&confirm('Move selected media to trash?')){document.getElementById('admin-media-ids').value=ids.join(',');document.getElementById('admin-bulk-media').submit()}}<\/script>`;
  return c.html(
    adminShell(
      event.eventName,
      `<main class="mx-auto max-w-7xl p-5 md:p-10"><a href="/admin" class="text-sm font-medium text-[#6e4f3e]">← ${locale === "el" ? "Πίσω στη βιβλιοθήκη" : "Back to library"}</a><div class="mt-5 grid gap-6 lg:grid-cols-[420px_1fr]"><section class="rounded-3xl bg-white p-6 shadow-lg"><div class="flex items-start justify-between gap-3"><div><h1 class="mt-1 text-3xl font-bold">${esc(event.eventName)}</h1></div><span class="rounded-full px-3 py-1 text-xs font-semibold ${event.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-[#574c46]"}">${event.status === "active" ? (locale === "el" ? "Ενεργό" : "Active") : locale === "el" ? "Αρχειοθετημένο" : "Archived"}</span></div><form action="/admin/events/${encodeURIComponent(event.code)}/update" method="post" class="mt-7 space-y-4"><label class="block text-sm font-semibold">${locale === "el" ? "Όνομα event" : "Event name"}<input name="eventName" required maxlength="100" value="${esc(event.eventName)}" class="mt-1 w-full rounded-xl border px-4 py-3 font-normal"></label><label class="block text-sm font-semibold">${locale === "el" ? "Κατάσταση" : "Status"}<select name="status" class="mt-1 w-full rounded-xl border px-4 py-3 font-normal"><option value="active"${event.status === "active" ? " selected" : ""}>${locale === "el" ? "Ενεργό" : "Active"}</option><option value="archived"${event.status === "archived" ? " selected" : ""}>${locale === "el" ? "Αρχειοθετημένο" : "Archived"}</option></select></label><div class="grid grid-cols-2 gap-3"><label class="block text-sm font-semibold">${locale === "el" ? "Έναρξη event" : "Event start"}<input name="eventStartDate" type="date" required value="${esc(event.event_start_date ?? "")}" class="mt-1 w-full rounded-xl border px-4 py-3 font-normal"></label><label class="block text-sm font-semibold">${locale === "el" ? "Λήξη event" : "Event end"}<input name="eventEndDate" type="date" value="${esc(event.event_end_date ?? "")}" class="mt-1 w-full rounded-xl border px-4 py-3 font-normal"></label></div><label class="block text-sm font-semibold">${locale === "el" ? "Ημερομηνία λήξης πρόσβασης" : "Access expiration"}<input name="expires_at" type="date" required value="${dateInput(event.expires_at)}" class="mt-1 w-full rounded-xl border px-4 py-3 font-normal"></label><div class="rounded-2xl bg-[#f6f1eb] p-4"><p class="text-sm font-semibold">PIN gallery</p><p class="mt-1 text-xs text-[#625750]">${event.gallery_pin_hash ? "Υπάρχει ενεργό PIN. Για λόγους ασφαλείας δεν εμφανίζεται. Μπορείς να το αντικαταστήσεις χωρίς το παλιό." : "Δεν υπάρχει ενεργό PIN."}</p><input name="galleryPin" inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" placeholder="${event.gallery_pin_hash ? "Νέο PIN (προαιρετικά)" : "Νέο PIN 4–8 ψηφίων"}" class="mt-3 w-full rounded-xl border bg-white px-4 py-3 font-normal">${event.gallery_pin_hash ? '<label class="mt-3 flex items-center gap-2 text-sm font-normal"><input name="removeGalleryPin" type="checkbox"> Αφαίρεση υπάρχοντος PIN</label>' : ""}</div><label class="block text-sm font-semibold">${locale === "el" ? "Εσωτερικές σημειώσεις" : "Internal notes"}<textarea name="notes" maxlength="2000" rows="6" class="mt-1 w-full rounded-xl border px-4 py-3 font-normal" placeholder="Πληροφορίες, συμφωνίες, εκκρεμότητες…">${esc(event.notes)}</textarea></label><button class="w-full rounded-xl bg-[#33251f] py-3 font-semibold text-white">${locale === "el" ? "Αποθήκευση αλλαγών" : "Save changes"}</button></form><div class="mt-5"><a href="${esc(guestUrl)}" target="_blank" class="block rounded-xl border px-4 py-3 text-center text-sm font-semibold">${locale === "el" ? "Άνοιγμα guest gallery" : "Open guest gallery"}</a></div><form action="/admin/events/${encodeURIComponent(event.code)}/upload" method="post" enctype="multipart/form-data" class="mt-5 rounded-2xl bg-[#f6f1eb] p-4"><label class="text-sm font-semibold">${locale === "el" ? "Upload φωτογραφιών / βίντεο" : "Upload photos / videos"}<input name="file" type="file" multiple required accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" class="mt-2 w-full rounded-xl border bg-white p-3 font-normal"></label><p class="mt-2 text-xs text-[#625750]">${locale === "el" ? "Έως 20 αρχεία, 20 MB ανά αρχείο και 80 MB συνολικά." : "Up to 20 files, 20 MB each and 80 MB total."}</p><button class="mt-3 w-full rounded-xl bg-[#654534] px-4 py-3 text-white">${locale === "el" ? "Ανέβασμα" : "Upload"}</button></form></section><section class="rounded-3xl bg-white p-6 shadow-lg"><div class="mb-5 flex items-center justify-between"><div><p class="text-sm text-[#625750]">${locale === "el" ? "Δημιουργήθηκε" : "Created"} ${formatDate(event.created_at)}</p><h2 class="text-2xl font-bold">${locale === "el" ? "Αρχεία" : "Files"} (${items.length})</h2></div><div class="flex flex-wrap gap-2"><button type="button" id="admin-select-media" class="rounded-xl border px-3 py-2 text-sm">Select</button><button type="button" id="admin-download-selected" class="hidden rounded-xl bg-[#654534] px-3 py-2 text-sm text-white">Download selected</button><button type="button" id="admin-delete-selected" class="hidden rounded-xl border border-red-200 px-3 py-2 text-sm text-red-700">Delete selected</button></div></div>${items.length ? `<form id="admin-bulk-media" action="/admin/events/${encodeURIComponent(event.code)}/media/bulk-trash" method="post"><input id="admin-media-ids" type="hidden" name="ids"><div class="grid grid-cols-2 gap-4 md:grid-cols-3">${cards(items, { selectable: true, deferredSelection: true })}</div></form>` : `<p class="py-16 text-center text-[#625750]">${locale === "el" ? "Δεν υπάρχουν uploads." : "No uploads."}</p>`}</section></div></main>${adminMediaScript}`,
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
    return c.text("Μη έγκυρη επιλογή αρχείων.", 400);
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
  if (!event) return c.text("Το event δεν βρέθηκε.", 404);
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
      return c.text("Το PIN πρέπει να έχει 4–8 ψηφία.", 400);
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
    return c.text("Μη έγκυρα στοιχεία.", 400);
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
