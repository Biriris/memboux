import { Hono } from "hono";
import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import QRCode from "qrcode";
import { getEventRole, roleCan } from "../access";
import type { Bindings } from "../domain";
import { eventOriginalExportsAllowed } from "../event-access";
import { eventBrandingStyle, getEventBranding, validBrandColor } from "../event-branding";
import { albumAccessCookieName, albumAccessToken, eventAnalyticsSummary, findEventAlbum, hasAlbumAccess, listEventAlbums, normalizeAlbumSlug, uniqueAlbumSlug, type AlbumPrivacy } from "../event-media-hub";
import { normalizeLocale } from "../i18n";
import { getEvent } from "../repositories";
import { consumeRateLimit, tooManyRequests } from "../rate-limit";
import { currentUser } from "../session";
import { constantTimeEqual, esc, sha256 } from "../utils";
import { eventHeader, page } from "../views/shared";
import { createStoredZip, safeZipName } from "../zip-stream";

export const eventAlbumRoutes = new Hono<{ Bindings: Bindings }>();

async function manager(c: Context<{ Bindings: Bindings }>) {
  const event = await getEvent(c.env.DB, c.req.param("code") ?? "");
  if (!event) return { response: c.text("Event not found", 404) };
  const user = await currentUser(c);
  if (!user) return { response: c.text("Unauthorized", 401) };
  const role = await getEventRole(c.env.DB, event.id, user.id);
  if (!role || !roleCan(role, "manage_media")) return { response: c.text("Forbidden", 403) };
  return { event, user, role };
}

const privacy = (value: unknown): AlbumPrivacy => value === "private" ? "private" : value === "protected" ? "protected" : "public";
const ids = (value: unknown) => String(value ?? "").split(",").map((id) => id.trim()).filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 500);

eventAlbumRoutes.get("/gallery/:code/albums/:slug", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  const locale = normalizeLocale(c.req.query("lang") ?? event.default_locale);
  const source = c.req.query("source") === "qr" ? "&source=qr" : "";
  const album = await findEventAlbum(c.env.DB, event.id, c.req.param("slug"));
  if (!album) return c.text("Album not found", 404);
  if (!(await hasAlbumAccess(c.req.raw, c.env.BETTER_AUTH_SECRET, album))) {
    return c.html(page(album.name, `<main class="flex min-h-screen items-center justify-center p-5"><section class="w-full max-w-md rounded-3xl border bg-white p-8 text-center shadow-xl"><p class="text-xs font-bold uppercase tracking-[.18em] text-violet-700">Protected album</p><h1 class="mt-3 text-4xl">${esc(album.name)}</h1><p class="mt-2 text-slate-600">${locale === "el" ? "Βάλε το PIN αυτού του album." : "Enter this album’s PIN."}</p><form action="/gallery/${event.code}/albums/${album.slug}/unlock" method="post" class="mt-6 space-y-3"><input type="hidden" name="locale" value="${locale}"><input name="pin" type="password" inputmode="numeric" required autofocus class="w-full rounded-xl border px-4 py-3 text-center text-xl tracking-[.3em]" placeholder="PIN"><button class="w-full rounded-xl bg-violet-700 px-5 py-3 font-bold text-white">${locale === "el" ? "Άνοιγμα album" : "Open album"}</button></form></section></main>`, { locale }), 401);
  }
  return c.redirect(`/gallery/${event.code}?lang=${locale}&album=${encodeURIComponent(album.slug)}${source}`, 302);
});

eventAlbumRoutes.post("/gallery/:code/albums/:slug/unlock", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code")); if (!event) return c.text("Event not found", 404);
  const album = await findEventAlbum(c.env.DB, event.id, c.req.param("slug")); if (!album || album.privacy !== "protected" || !album.pin_hash) return c.text("Album not found", 404);
  const limit = await consumeRateLimit(c.env.DB, c.req.raw, c.env.BETTER_AUTH_SECRET, {
    scope: `album-pin:${album.id}`, limit: 8, windowMs: 15 * 60_000,
  });
  if (!limit.allowed) return tooManyRequests(limit, "Too many PIN attempts. Try again later.");
  const body = await c.req.parseBody(); const locale = normalizeLocale(String(body.locale ?? event.default_locale)); const hash = await sha256(String(body.pin ?? ""));
  if (!constantTimeEqual(hash, album.pin_hash)) return c.text(locale === "el" ? "Λάθος PIN" : "Incorrect PIN", 401);
  setCookie(c, albumAccessCookieName(album.id), await albumAccessToken(c.env.BETTER_AUTH_SECRET, album), { path: `/gallery/${event.code}`, httpOnly: true, secure: true, sameSite: "Lax", maxAge: 30 * 86400 });
  return c.redirect(`/gallery/${event.code}/albums/${album.slug}?lang=${locale}`, 303);
});

eventAlbumRoutes.get("/dashboard/:code/albums", async (c) => {
  const locale = normalizeLocale(c.req.query("lang") ?? "en");
  const access = await manager(c);
  if ("response" in access) return access.response;
  const albums = await listEventAlbums(c.env.DB, access.event.id);
  const rows = albums.map((album) => `<article class="rounded-2xl border bg-white p-5 shadow-sm"><div class="flex items-start justify-between gap-3"><div><span class="text-xs font-bold uppercase tracking-wide text-violet-700">${esc(album.privacy)}</span><h2 class="mt-2 text-2xl">${esc(album.name)}</h2><p class="mt-1 text-sm text-slate-600">${esc(album.description || (locale === "el" ? "Χωρίς περιγραφή" : "No description"))}</p><p class="mt-3 text-xs font-bold text-slate-500">${album.media_count ?? 0} media · /gallery/${esc(access.event.code)}/albums/${esc(album.slug)}</p></div><span class="rounded-lg bg-violet-50 px-3 py-1 text-xs font-bold text-violet-800">${album.allow_uploads ? "Uploads on" : "View only"}</span></div><form action="/api/account/events/${access.event.code}/albums/${album.id}" method="post" class="mt-5 grid gap-3 sm:grid-cols-2"><input type="hidden" name="locale" value="${locale}"><label class="text-sm font-semibold">${locale === "el" ? "Όνομα" : "Name"}<input class="mt-1 w-full rounded-xl border px-3 py-2.5" name="name" value="${esc(album.name)}" required maxlength="80"></label><label class="text-sm font-semibold">Privacy<select class="mt-1 w-full rounded-xl border px-3 py-2.5" name="privacy"><option value="public" ${album.privacy === "public" ? "selected" : ""}>Public</option><option value="protected" ${album.privacy === "protected" ? "selected" : ""}>Protected</option><option value="private" ${album.privacy === "private" ? "selected" : ""}>Private link</option></select></label><input class="rounded-xl border px-3 py-2.5 sm:col-span-2" name="description" value="${esc(album.description)}" maxlength="240" placeholder="Description"><label class="flex items-center gap-2 text-sm"><input type="checkbox" name="allowUploads" value="1" ${album.allow_uploads ? "checked" : ""}>${locale === "el" ? "Να δέχεται uploads" : "Allow uploads"}</label><label class="flex items-center gap-2 text-sm"><input type="checkbox" name="allowDownloads" value="1" ${album.allow_downloads ? "checked" : ""}>${locale === "el" ? "Να επιτρέπονται λήψεις" : "Allow downloads"}</label><input class="rounded-xl border px-3 py-2.5 sm:col-span-2" name="pin" inputmode="numeric" autocomplete="new-password" placeholder="${locale === "el" ? "Νέο PIN (κενό = χωρίς αλλαγή)" : "New PIN (blank = unchanged)"}"><div class="flex gap-2 sm:col-span-2"><button class="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-bold text-white">${locale === "el" ? "Αποθήκευση" : "Save"}</button><a href="/gallery/${access.event.code}/albums/${album.slug}?lang=${locale}" target="_blank" class="rounded-xl border px-4 py-2.5 text-sm font-bold">Preview</a><a href="/api/account/events/${access.event.code}/exports/download?album=${album.id}" class="rounded-xl border px-4 py-2.5 text-sm font-bold">ZIP</a></div></form></article>`).join("");
  const body = `${eventHeader(locale, { name: access.user.name ?? access.user.email, email: access.user.email })}<main class="mx-auto max-w-7xl p-4 sm:p-8"><a href="/dashboard/${access.event.code}/media?lang=${locale}" class="text-sm font-bold text-violet-700">← ${locale === "el" ? "Πίσω στο Media Center" : "Back to Media Center"}</a><div class="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p class="text-xs font-bold uppercase tracking-[.18em] text-violet-700">Albums</p><h1 class="mt-2 text-4xl">${locale === "el" ? "Οργάνωσε κάθε στιγμή" : "Organize every moment"}</h1><p class="mt-2 max-w-2xl text-slate-600">${locale === "el" ? "Κάθε album έχει δικό του link, QR και κανόνες πρόσβασης." : "Each album has its own link, QR code, and access rules."}</p></div></div><form action="/api/account/events/${access.event.code}/albums" method="post" class="mt-6 grid gap-3 rounded-2xl border bg-violet-50 p-5 sm:grid-cols-[1fr_1fr_auto]"><input type="hidden" name="locale" value="${locale}"><input class="rounded-xl border bg-white px-4 py-3" name="name" required maxlength="80" placeholder="${locale === "el" ? "π.χ. Photobooth" : "e.g. Photo booth"}"><select class="rounded-xl border bg-white px-4 py-3" name="privacy"><option value="public">Public</option><option value="protected">Protected</option><option value="private">Private link</option></select><button class="rounded-xl bg-violet-700 px-5 py-3 font-bold text-white">${locale === "el" ? "Νέο album" : "New album"}</button></form><section class="mt-6 grid gap-4 lg:grid-cols-2">${rows || `<p class="rounded-2xl border border-dashed p-10 text-center text-slate-600">${locale === "el" ? "Δεν υπάρχουν albums ακόμη." : "No albums yet."}</p>`}</section></main>`;
  const qrTools = albums.length ? `<aside class="mt-4 flex flex-wrap gap-2">${albums.map((album) => `<a href="/api/account/events/${access.event.code}/albums/${album.id}/qr" target="_blank" class="rounded-xl border bg-white px-4 py-2.5 text-sm font-bold">QR · ${esc(album.name)}</a>`).join("")}</aside>` : "";
  return c.html(page(`${access.event.eventName} · Albums`, body.replace('<section class="mt-6 grid', `${qrTools}<section class="mt-6 grid`), { locale }));
});

eventAlbumRoutes.post("/api/account/events/:code/albums", async (c) => {
  const access = await manager(c); if ("response" in access) return access.response;
  if (access.role !== "owner") return c.text("Only owners can create albums", 403);
  const body = await c.req.parseBody(); const locale = normalizeLocale(String(body.locale ?? access.event.default_locale));
  const name = String(body.name ?? "").trim().slice(0, 80); if (!name) return c.text("Album name is required", 400);
  const now = Date.now(); const albumId = crypto.randomUUID(); const mode = privacy(body.privacy);
  const token = mode === "private" ? crypto.randomUUID() : "";
  const slugSeed = mode === "private" ? `${name}-${crypto.randomUUID().slice(0, 12)}` : name;
  await c.env.DB.prepare(`INSERT INTO event_albums (id,event_id,slug,name,description,privacy,share_token_hash,allow_uploads,allow_downloads,sort_order,created_by,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(albumId, access.event.id, await uniqueAlbumSlug(c.env.DB, access.event.id, slugSeed), name, "", mode, token ? await sha256(token) : null, 1, 1, 0, access.user.id, now, now).run();
  console.log(JSON.stringify({ event: "event_album_created", eventId: access.event.id, albumId, privacy: mode }));
  return c.redirect(`/dashboard/${access.event.code}/albums?lang=${locale}`, 303);
});

eventAlbumRoutes.post("/api/account/events/:code/albums/:albumId", async (c) => {
  const access = await manager(c); if ("response" in access) return access.response;
  if (access.role !== "owner") return c.text("Only owners can update albums", 403);
  const body = await c.req.parseBody(); const locale = normalizeLocale(String(body.locale ?? access.event.default_locale));
  const album = await c.env.DB.prepare("SELECT id,slug,pin_hash FROM event_albums WHERE id=? AND event_id=? AND deleted_at IS NULL").bind(c.req.param("albumId"), access.event.id).first<{ id: string; slug: string; pin_hash: string | null }>();
  if (!album) return c.text("Album not found", 404);
  const name = String(body.name ?? "").trim().slice(0, 80); if (!name) return c.text("Album name is required", 400);
  const mode = privacy(body.privacy); const pin = String(body.pin ?? "").trim();
  await c.env.DB.prepare(`UPDATE event_albums SET name=?,description=?,privacy=?,pin_hash=?,allow_uploads=?,allow_downloads=?,updated_at=? WHERE id=? AND event_id=?`)
    .bind(name, String(body.description ?? "").trim().slice(0, 240), mode, pin ? await sha256(pin) : album.pin_hash, body.allowUploads === "1" ? 1 : 0, body.allowDownloads === "1" ? 1 : 0, Date.now(), album.id, access.event.id).run();
  return c.redirect(`/dashboard/${access.event.code}/albums?lang=${locale}`, 303);
});

eventAlbumRoutes.post("/api/account/events/:code/media/bulk-organize", async (c) => {
  const access = await manager(c); if ("response" in access) return access.response;
  const body = await c.req.parseBody(); const mediaIds = ids(body.ids); if (!mediaIds.length) return c.json({ message: "Select media" }, 400);
  const action = String(body.action ?? ""); const albumId = String(body.albumId ?? "");
  const placeholders = mediaIds.map(() => "?").join(",");
  if (action === "move") {
    if (albumId && !await c.env.DB.prepare("SELECT 1 FROM event_albums WHERE id=? AND event_id=? AND deleted_at IS NULL").bind(albumId, access.event.id).first()) return c.json({ message: "Album not found" }, 404);
    await c.env.DB.prepare(`UPDATE media SET album_id=? WHERE event_id=? AND id IN (${placeholders})`).bind(albumId || null, access.event.id, ...mediaIds).run();
  } else if (["approved", "hidden"].includes(action)) {
    await c.env.DB.prepare(`UPDATE media SET moderation_status=? WHERE event_id=? AND id IN (${placeholders})`).bind(action, access.event.id, ...mediaIds).run();
  } else return c.json({ message: "Invalid action" }, 400);
  return c.json({ ok: true, updated: mediaIds.length });
});

eventAlbumRoutes.get("/dashboard/:code/analytics", async (c) => {
  const locale = normalizeLocale(c.req.query("lang") ?? "en"); const access = await manager(c); if ("response" in access) return access.response;
  const [summary, guests, daily, albumStats, operations] = await Promise.all([
    eventAnalyticsSummary(c.env.DB, access.event.id),
    c.env.DB.prepare("SELECT display_name,upload_count,last_seen_at FROM event_guest_sessions WHERE event_id=? ORDER BY last_seen_at DESC LIMIT 100").bind(access.event.id).all<{ display_name: string; upload_count: number; last_seen_at: number }>(),
    c.env.DB.prepare(`SELECT date(occurred_at/1000,'unixepoch') day,COUNT(*) total FROM event_activity_events
      WHERE event_id=? AND occurred_at>=? GROUP BY day ORDER BY day`).bind(access.event.id, Date.now() - 30 * 86400_000).all<{ day: string; total: number }>(),
    c.env.DB.prepare(`SELECT a.name,COUNT(m.id) media_count,COALESCE(SUM(m.size_bytes),0) bytes,
      COUNT(DISTINCT m.guest_session_id) contributors FROM event_albums a LEFT JOIN media m ON m.album_id=a.id AND m.deleted_at IS NULL
      WHERE a.event_id=? AND a.deleted_at IS NULL GROUP BY a.id,a.name ORDER BY a.sort_order,a.created_at`).bind(access.event.id)
      .all<{ name: string; media_count: number; bytes: number; contributors: number }>(),
    c.env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM media WHERE event_id=? AND deleted_at IS NULL AND moderation_status='pending') pending,
      (SELECT COUNT(*) FROM event_guestbook_entries g JOIN media m ON m.id=g.media_id WHERE g.event_id=? AND m.media_type='video' AND g.status!='hidden') video_guestbook,
      (SELECT COUNT(*) FROM event_export_jobs WHERE event_id=?) exports`).bind(access.event.id, access.event.id, access.event.id)
      .first<{ pending: number; video_guestbook: number; exports: number }>(),
  ]); const views = summary.byType.gallery_view?.total ?? 0;
  const cards = [[locale === "el" ? "Προβολές gallery" : "Gallery views", views], [locale === "el" ? "Μοναδικοί contributors" : "Unique contributors", summary.contributors], [locale === "el" ? "Αρχεία" : "Media", summary.media], ["Albums", summary.albums], ["Videos", summary.videos], [locale === "el" ? "Χώρος" : "Storage", `${(summary.bytes / 1048576).toFixed(1)} MB`]];
  const maxDaily = Math.max(1, ...daily.results.map((row) => Number(row.total)));
  const timeline = `<section class="mt-8 rounded-2xl border bg-white p-5"><div class="flex items-end justify-between gap-4"><div><h2 class="text-2xl">${locale === "el" ? "Δραστηριότητα 30 ημερών" : "30-day activity"}</h2><p class="mt-1 text-sm text-slate-600">${locale === "el" ? "Προβολές, uploads, αλληλεπιδράσεις και exports." : "Views, uploads, interactions, and exports."}</p></div><span class="text-sm font-bold text-violet-700">${daily.results.reduce((sum, row) => sum + Number(row.total), 0)} actions</span></div><div class="mt-6 flex h-40 items-end gap-1" aria-label="30 day activity chart">${daily.results.map((row) => `<div class="group relative min-w-0 flex-1 rounded-t bg-violet-300 hover:bg-violet-600" style="height:${Math.max(4, Number(row.total) / maxDaily * 100)}%" title="${esc(row.day)} · ${row.total}"><span class="sr-only">${esc(row.day)}: ${row.total}</span></div>`).join("") || `<p class="m-auto text-sm text-slate-500">No activity yet.</p>`}</div></section>`;
  const operationsPanel = `<section class="mt-8 grid gap-4 sm:grid-cols-3"><article class="rounded-2xl border bg-white p-5"><p class="text-sm text-slate-600">${locale === "el" ? "Αναμονή moderation" : "Pending moderation"}</p><p class="mt-2 text-3xl">${Number(operations?.pending ?? 0)}</p></article><article class="rounded-2xl border bg-white p-5"><p class="text-sm text-slate-600">Video guestbook</p><p class="mt-2 text-3xl">${Number(operations?.video_guestbook ?? 0)}</p></article><article class="rounded-2xl border bg-white p-5"><p class="text-sm text-slate-600">ZIP exports</p><p class="mt-2 text-3xl">${Number(operations?.exports ?? 0)}</p></article></section>`;
  const albumPanel = albumStats.results.length ? `<section class="mt-8 overflow-hidden rounded-2xl border bg-white"><div class="p-5"><h2 class="text-2xl">Album performance</h2></div><div class="overflow-x-auto"><table class="w-full min-w-[620px] text-left"><thead class="bg-violet-50 text-xs uppercase"><tr><th class="px-5 py-3">Album</th><th class="px-5 py-3">Media</th><th class="px-5 py-3">Contributors</th><th class="px-5 py-3">Storage</th></tr></thead><tbody>${albumStats.results.map((album) => `<tr class="border-t"><td class="px-5 py-3 font-semibold">${esc(album.name)}</td><td class="px-5 py-3">${Number(album.media_count)}</td><td class="px-5 py-3">${Number(album.contributors)}</td><td class="px-5 py-3">${(Number(album.bytes) / 1048576).toFixed(1)} MB</td></tr>`).join("")}</tbody></table></div></section>` : "";
  const guestLog = `<section class="mt-8 overflow-hidden rounded-2xl border bg-white"><div class="p-5"><h2 class="text-2xl">Guest log</h2><p class="mt-1 text-sm text-slate-600">${locale === "el" ? "Μόνο εμφανιζόμενο όνομα, uploads και τελευταία δραστηριότητα." : "Display name, upload count, and last activity only."}</p></div><div class="overflow-x-auto"><table class="w-full min-w-[560px] text-left"><thead class="bg-violet-50 text-xs uppercase"><tr><th class="px-5 py-3">Guest</th><th class="px-5 py-3">Uploads</th><th class="px-5 py-3">Last active</th></tr></thead><tbody>${guests.results.map((guest) => `<tr class="border-t"><td class="px-5 py-3 font-semibold">${esc(guest.display_name)}</td><td class="px-5 py-3">${guest.upload_count}</td><td class="px-5 py-3 text-sm text-slate-600">${new Date(guest.last_seen_at).toLocaleString(locale)}</td></tr>`).join("") || `<tr><td colspan="3" class="p-8 text-center text-slate-500">No guest activity yet.</td></tr>`}</tbody></table></div></section>`;
  const body = `${eventHeader(locale, { name: access.user.name ?? access.user.email, email: access.user.email })}<main class="mx-auto max-w-7xl p-4 sm:p-8"><a href="/dashboard/${access.event.code}?lang=${locale}" class="text-sm font-bold text-violet-700">← Event</a><h1 class="mt-6 text-4xl">${locale === "el" ? "Απόδοση event" : "Event performance"}</h1><p class="mt-2 text-slate-600">${locale === "el" ? "Συγκεντρωτικά στοιχεία χωρίς ιδιωτικό περιεχόμενο ή στοιχεία επικοινωνίας." : "Aggregate insights without private content or contact details."}</p><section class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">${cards.map(([label, value]) => `<article class="rounded-2xl border bg-white p-5 shadow-sm"><p class="text-sm font-semibold text-slate-600">${esc(label)}</p><p class="mt-2 text-3xl">${esc(value)}</p></article>`).join("")}</section>${operationsPanel}${timeline}${albumPanel}${guestLog}</main>`;
  return c.html(page(`${access.event.eventName} · Analytics`, body, { locale }));
});

eventAlbumRoutes.get("/dashboard/:code/branding", async (c) => {
  const locale = normalizeLocale(c.req.query("lang") ?? "en");
  const access = await manager(c); if ("response" in access) return access.response;
  if (access.role !== "owner") return c.text("Only owners can manage event branding", 403);
  const [branding, media] = await Promise.all([
    getEventBranding(c.env.DB, access.event.id),
    c.env.DB.prepare("SELECT id FROM media WHERE event_id=? AND media_type='image' AND deleted_at IS NULL AND reported_at IS NULL ORDER BY uploaded_at DESC LIMIT 48")
      .bind(access.event.id).all<{ id: string }>(),
  ]);
  const logoChoices = media.results.map((item) => `<label class="relative block aspect-square cursor-pointer overflow-hidden rounded-xl border bg-white"><input type="radio" name="logoMediaId" value="${item.id}" ${branding.logo_media_id === item.id ? "checked" : ""} class="absolute left-2 top-2 z-10 h-5 w-5"><img src="/media/${item.id}?variant=thumb" alt="" loading="lazy" class="h-full w-full object-cover"></label>`).join("");
  const body = `${eventHeader(locale, { name: access.user.name ?? access.user.email, email: access.user.email })}${eventBrandingStyle(branding)}<main class="mx-auto max-w-5xl p-4 sm:p-8"><a href="/dashboard/${access.event.code}?lang=${locale}" class="text-sm font-bold text-violet-700">← Event</a><div class="mt-6"><p class="text-xs font-bold uppercase tracking-[.18em] text-violet-700">Branding</p><h1 class="mt-2 text-4xl">${locale === "el" ? "Ταυτότητα παρουσίασης" : "Event presentation identity"}</h1><p class="mt-2 max-w-2xl text-slate-600">${locale === "el" ? "Εφάρμοσε το όνομα, τα χρώματα και το λογότυπο του event στη guest gallery και στο live slideshow." : "Apply an event name, colors, and logo to the guest gallery and live slideshow."}</p></div><form action="/api/account/events/${access.event.code}/branding" method="post" class="mt-7 grid gap-6 lg:grid-cols-[1fr_.8fr]"><input type="hidden" name="locale" value="${locale}"><section class="rounded-2xl border bg-white p-5 shadow-sm"><label class="block text-sm font-semibold">${locale === "el" ? "Όνομα brand" : "Brand name"}<input name="brandName" maxlength="80" value="${esc(branding.brand_name)}" placeholder="${esc(access.event.eventName)}" class="mt-2 w-full rounded-xl border px-4 py-3"></label><div class="mt-5 grid grid-cols-2 gap-4"><label class="text-sm font-semibold">${locale === "el" ? "Κύριο χρώμα" : "Primary color"}<input name="primaryColor" type="color" value="${branding.primary_color}" class="mt-2 h-12 w-full rounded-xl border bg-white p-1"></label><label class="text-sm font-semibold">${locale === "el" ? "Φόντο" : "Background"}<input name="backgroundColor" type="color" value="${branding.background_color}" class="mt-2 h-12 w-full rounded-xl border bg-white p-1"></label></div><label class="mt-5 flex items-center justify-between gap-3 rounded-xl border px-4 py-3"><span class="text-sm font-semibold">${locale === "el" ? "Απόκρυψη της υπογραφής Memboux" : "Hide Memboux signature"}</span><input name="hideMemboux" value="1" type="checkbox" ${branding.hide_memboux ? "checked" : ""} class="h-5 w-5"></label><button class="event-brand-action mt-5 w-full rounded-xl px-5 py-3 font-bold text-white">${locale === "el" ? "Αποθήκευση ταυτότητας" : "Save identity"}</button></section><section class="rounded-2xl border bg-slate-50 p-5"><div class="flex items-center justify-between"><h2 class="text-xl">Logo</h2><label class="text-xs font-bold text-slate-600"><input type="radio" name="logoMediaId" value="" ${branding.logo_media_id ? "" : "checked"}> ${locale === "el" ? "Χωρίς logo" : "No logo"}</label></div><div class="mt-4 grid max-h-[28rem] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4">${logoChoices || `<p class="col-span-full rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">${locale === "el" ? "Ανέβασε πρώτα μία εικόνα στο Media Center." : "Upload an image to the Media Center first."}</p>`}</div></section></form></main>`;
  return c.html(page(`${access.event.eventName} · Branding`, body, { locale }));
});

eventAlbumRoutes.post("/api/account/events/:code/branding", async (c) => {
  const access = await manager(c); if ("response" in access) return access.response;
  if (access.role !== "owner") return c.text("Only owners can manage event branding", 403);
  const body = await c.req.parseBody(); const locale = normalizeLocale(String(body.locale ?? access.event.default_locale));
  const brandName = String(body.brandName ?? "").trim().slice(0, 80);
  const primaryColor = String(body.primaryColor ?? "").toLowerCase();
  const backgroundColor = String(body.backgroundColor ?? "").toLowerCase();
  if (!validBrandColor(primaryColor) || !validBrandColor(backgroundColor)) return c.text("Invalid brand color", 400);
  const logoMediaId = String(body.logoMediaId ?? "");
  if (logoMediaId && !await c.env.DB.prepare("SELECT 1 FROM media WHERE id=? AND event_id=? AND media_type='image' AND deleted_at IS NULL AND reported_at IS NULL").bind(logoMediaId, access.event.id).first()) return c.text("Logo media not found", 400);
  await c.env.DB.prepare(`INSERT INTO event_branding (event_id,brand_name,primary_color,background_color,logo_media_id,hide_memboux,updated_by,updated_at)
    VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET brand_name=excluded.brand_name,primary_color=excluded.primary_color,
    background_color=excluded.background_color,logo_media_id=excluded.logo_media_id,hide_memboux=excluded.hide_memboux,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
    .bind(access.event.id, brandName, primaryColor, backgroundColor, logoMediaId || null, body.hideMemboux === "1" ? 1 : 0, access.user.id, Date.now()).run();
  console.log(JSON.stringify({ event: "event_branding_updated", eventId: access.event.id, actorUserId: access.user.id }));
  return c.redirect(`/dashboard/${access.event.code}/branding?lang=${locale}`, 303);
});

eventAlbumRoutes.get("/api/account/events/:code/exports/download", async (c) => {
  const access = await manager(c); if ("response" in access) return access.response;
  if (!(await eventOriginalExportsAllowed(c.env.DB, access.event.id))) return c.text("Original exports require an active package", 403);
  const albumId = c.req.query("album") ?? "";
  if (albumId && !await c.env.DB.prepare("SELECT 1 FROM event_albums WHERE id=? AND event_id=? AND deleted_at IS NULL").bind(albumId, access.event.id).first()) return c.text("Album not found", 404);
  const rows = await c.env.DB.prepare(`SELECT m.object_key,m.size_bytes,m.content_type,m.uploaded_by,m.uploaded_at,a.name album_name
    FROM media m LEFT JOIN event_albums a ON a.id=m.album_id WHERE m.event_id=? AND m.deleted_at IS NULL AND m.reported_at IS NULL AND (?='' OR m.album_id=?) ORDER BY m.uploaded_at`)
    .bind(access.event.id, albumId, albumId).all<{ object_key: string; size_bytes: number; content_type: string; uploaded_by: string; uploaded_at: number; album_name: string | null }>();
  const guestbook = await c.env.DB.prepare("SELECT author_name,message,created_at FROM event_guestbook_entries WHERE event_id=? AND status!='hidden' ORDER BY created_at").bind(access.event.id).all<{ author_name: string; message: string; created_at: number }>();
  const csv = "name,message,created_at\n" + guestbook.results.map((row) => [row.author_name, row.message, new Date(row.created_at).toISOString()].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
  const csvBytes = new TextEncoder().encode(csv);
  const sources = rows.results.map((row, index) => ({ name: `${safeZipName(row.album_name || "Main gallery")}/${safeZipName(row.uploaded_by || "Guest")}/${String(index + 1).padStart(4, "0")}-${safeZipName(row.object_key.split("/").pop() || "media")}`, size: Number(row.size_bytes), open: async () => (await c.env.MEDIA.get(row.object_key))?.body ?? null }));
  sources.push({ name: "guestbook.csv", size: csvBytes.byteLength, open: async () => new Blob([csvBytes]).stream() as ReadableStream<Uint8Array> });
  const now = Date.now(); await c.env.DB.prepare("INSERT INTO event_export_jobs (id,event_id,requested_by,album_id,status,item_count,total_bytes,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), access.event.id, access.user.id, albumId || null, "ready", rows.results.length, rows.results.reduce((sum, row) => sum + Number(row.size_bytes), 0), now, now + 86400000).run();
  return new Response(createStoredZip(sources), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${normalizeAlbumSlug(access.event.eventName)}.zip"`, "Cache-Control": "private, no-store" } });
});

eventAlbumRoutes.get("/api/account/events/:code/albums/:albumId/qr", async (c) => {
  const access = await manager(c); if ("response" in access) return access.response;
  const album = await c.env.DB.prepare("SELECT slug FROM event_albums WHERE id=? AND event_id=? AND deleted_at IS NULL").bind(c.req.param("albumId"), access.event.id).first<{ slug: string }>();
  if (!album) return c.text("Album not found", 404);
  const url = `${new URL(c.req.url).origin}/gallery/${access.event.code}/albums/${album.slug}?source=qr`;
  return new Response(await QRCode.toString(url, { type: "svg", width: 720, margin: 1, errorCorrectionLevel: "H" }), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, no-store" } });
});
