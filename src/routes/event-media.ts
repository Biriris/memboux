import { Hono } from "hono";
import QRCode from "qrcode";
import { TRASH_RETENTION_MS } from "../config";
import type { Bindings, MediaRow } from "../domain";
import { normalizeLocale } from "../i18n";
import { getEvent, getMedia } from "../repositories";
import { currentUser } from "../session";
import { accountMenu, brandMark, logoutScript, page } from "../views/shared";
import { cards, lightboxMarkup } from "../views/media";
import { constantTimeEqual, esc, formatDateTime, formatEventDates, sha256 } from "../utils";
import { getEventRole, roleCan } from "../access";

export const eventMediaRoutes = new Hono<{ Bindings: Bindings }>();

eventMediaRoutes.get("/dashboard/:code/media/:id", async(c)=>{
  const locale=normalizeLocale(c.req.query("lang")??"en"); const user=await currentUser(c); if(!user) return c.redirect(`/${locale}/login`);
  const event=await getEvent(c.env.DB,c.req.param("code")); if(!event) return c.text("Event not found",404);
  if(!roleCan(await getEventRole(c.env.DB,event.id,user.id),"view"))return c.text("Forbidden",403);
  const media=await c.env.DB.prepare("SELECT * FROM media WHERE id=? AND event_id=? AND deleted_at IS NULL").bind(c.req.param("id"),event.id).first<MediaRow>(); if(!media) return c.text("Media not found",404);
  const preview=media.media_type==="image"?`<img src="/media/${media.id}" class="max-h-[70vh] w-full rounded-2xl object-contain bg-black">`:`<video src="/media/${media.id}" controls class="max-h-[70vh] w-full rounded-2xl bg-black"></video>`;
  const chronologicalDate=media.captured_at??media.uploaded_at;
  return c.html(page(event.eventName,`<header class="border-b bg-white"><div class="mx-auto flex max-w-5xl items-center justify-between p-5">${brandMark(`/${locale}`,true)}${accountMenu(locale,user)}</div></header><main class="mx-auto max-w-5xl p-5 md:p-10"><a href="/dashboard/${event.code}?lang=${locale}" class="text-sm text-[#4f46e5]">← ${locale==="el"?"Πίσω στο event":"Back to event"}</a><div class="mt-5 grid gap-6 lg:grid-cols-[1fr_320px]"><div>${preview}</div><aside class="rounded-2xl bg-white p-5 shadow"><p class="text-sm text-[#64748b]">${locale==="el"?"Ημερομηνία":"Date"}: ${formatDateTime(chronologicalDate,locale)}</p><a href="/media/${media.id}?download=1" class="mt-5 block rounded-xl bg-[#4f46e5] px-4 py-3 text-center text-white">↓ ${locale==="el"?"Λήψη":"Download"}</a><form action="/api/account/events/${event.code}/media/${media.id}/trash" method="post" class="mt-3" onsubmit="return confirm('Move this media to trash?')"><input type="hidden" name="locale" value="${locale}"><button class="w-full rounded-xl border border-red-200 px-4 py-3 text-red-700">${locale==="el"?"Μεταφορά στον κάδο":"Move to trash"}</button></form></aside></div></main>${lightboxMarkup(locale)}${logoutScript(locale)}`));
});

eventMediaRoutes.post("/api/account/events/:code/media/:id/rename", async(c)=>{
  const user=await currentUser(c);if(!user)return c.text("Unauthorized",401);const event=await getEvent(c.env.DB,c.req.param("code"));if(!event)return c.text("Event not found",404);
  if(!roleCan(await getEventRole(c.env.DB,event.id,user.id),"manage_media"))return c.text("Forbidden",403);
  const body=await c.req.parseBody();const locale=normalizeLocale(String(body.locale??event.default_locale));const title=String(body.title??"").trim().slice(0,120);if(!title)return c.text("Missing title",400);
  await c.env.DB.prepare("UPDATE media SET title=? WHERE id=? AND event_id=? AND deleted_at IS NULL").bind(title,c.req.param("id"),event.id).run();return c.redirect(`/dashboard/${event.code}/media/${c.req.param("id")}?lang=${locale}`,303);
});

eventMediaRoutes.post("/api/account/events/:code/media/:id/trash", async(c)=>{
  const user=await currentUser(c);if(!user)return c.text("Unauthorized",401);const event=await getEvent(c.env.DB,c.req.param("code"));if(!event)return c.text("Event not found",404);
  if(!roleCan(await getEventRole(c.env.DB,event.id,user.id),"manage_media"))return c.text("Forbidden",403);
  const body=await c.req.parseBody();const locale=normalizeLocale(String(body.locale??event.default_locale));const now=Date.now();await c.env.DB.prepare("UPDATE media SET deleted_at=?,purge_at=? WHERE id=? AND event_id=?").bind(now,now+TRASH_RETENTION_MS,c.req.param("id"),event.id).run();return c.redirect(`/dashboard/${event.code}?lang=${locale}`,303);
});

eventMediaRoutes.post("/api/account/events/:code/media/bulk-trash", async(c)=>{
  const user=await currentUser(c);if(!user)return c.text("Unauthorized",401);const event=await getEvent(c.env.DB,c.req.param("code"));if(!event)return c.text("Event not found",404);
  if(!roleCan(await getEventRole(c.env.DB,event.id,user.id),"manage_media"))return c.text("Forbidden",403);
  const body=await c.req.parseBody();const locale=normalizeLocale(String(body.locale??event.default_locale));const ids=String(body.ids??"").split(",").filter(id=>/^[a-f0-9-]{36}$/i.test(id)).slice(0,100);const now=Date.now();if(ids.length)await c.env.DB.batch(ids.map(id=>c.env.DB.prepare("UPDATE media SET deleted_at=?,purge_at=? WHERE id=? AND event_id=? AND deleted_at IS NULL").bind(now,now+TRASH_RETENTION_MS,id,event.id)));return c.redirect(`/dashboard/${event.code}?lang=${locale}`,303);
});

eventMediaRoutes.post("/api/account/events/:code/media/:id/restore", async(c)=>{
  const user=await currentUser(c);if(!user)return c.text("Unauthorized",401);const event=await getEvent(c.env.DB,c.req.param("code"),true);if(!event)return c.text("Event not found",404);
  if(!roleCan(await getEventRole(c.env.DB,event.id,user.id),"manage_media"))return c.text("Forbidden",403);
  const body=await c.req.parseBody();const locale=normalizeLocale(String(body.locale??event.default_locale));await c.env.DB.prepare("UPDATE media SET deleted_at=NULL,purge_at=NULL WHERE id=? AND event_id=?").bind(c.req.param("id"),event.id).run();return c.redirect(`/${locale}/trash`,303);
});

eventMediaRoutes.get("/dashboard-legacy/:code", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Η εκδήλωση δεν βρέθηκε.", 404);
  const token = c.req.query("token") ?? "";
  let allowed = Boolean(token && constantTimeEqual(await sha256(token), event.admin_token_hash));
  if (!allowed) {
    const user = await currentUser(c);
    if (user) allowed = roleCan(await getEventRole(c.env.DB,event.id,user.id),"view");
  }
  if (!allowed) return c.text("Δεν έχεις πρόσβαση σε αυτή τη διαχείριση.", 403);
  const items = await getMedia(c.env.DB, event.id);
  const guestUrl = `${new URL(c.req.url).origin}/gallery/${event.code}`;
  const qrSvg = (await QRCode.toString(guestUrl, { type: "svg", width: 256, margin: 1, errorCorrectionLevel: "M" }))
    .replace("<svg", '<svg class="block h-auto w-full max-w-full"');
  return c.html(page(`${event.eventName} – Διαχείριση`, `<main class="mx-auto max-w-6xl p-4 sm:p-5 md:p-10"><section class="mb-6 rounded-3xl bg-white p-5 shadow-lg sm:p-7"><p class="text-sm font-semibold text-[#5b21b6]">ΙΔΙΩΤΙΚΗ ΔΙΑΧΕΙΡΙΣΗ</p><h1 class="mt-2 break-words text-3xl font-bold sm:text-4xl">${esc(event.eventName)}</h1><p class="mt-3">Κωδικός: <strong class="font-mono text-2xl text-[#4338ca]">${esc(event.code)}</strong></p><div class="mt-7 grid items-center gap-7 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]"><div class="mx-auto w-full max-w-[220px] overflow-hidden rounded-2xl border bg-white p-3">${qrSvg}</div><div class="min-w-0"><h2 class="text-xl font-bold">QR Code καλεσμένων</h2><p class="mt-2 text-sm text-[#64748b]">Οι καλεσμένοι σκανάρουν το QR και ανοίγουν απευθείας το gallery του event.</p><a href="${esc(guestUrl)}" target="_blank" class="mt-3 block max-w-full break-all text-sm font-semibold text-[#4338ca]">${esc(guestUrl)}</a><div class="mt-4 flex flex-col gap-2 sm:flex-row"><input id="link" readonly value="${esc(guestUrl)}" class="w-full min-w-0 flex-1 rounded-xl border px-4 py-3"><button id="copy" class="shrink-0 rounded-xl bg-[#1e293b] px-5 py-3 text-white">Αντιγραφή</button></div></div></div></section><section class="rounded-3xl bg-white p-5 shadow-lg sm:p-7"><h2 class="mb-5 text-2xl font-bold">Gallery (${items.length})</h2>${items.length ? `<div class="grid grid-cols-2 gap-4 md:grid-cols-3">${cards(items)}</div>` : `<p class="py-12 text-center text-[#64748b]">Δεν υπάρχουν uploads ακόμη.</p>`}</section></main><script>document.getElementById('copy').onclick=()=>navigator.clipboard.writeText(document.getElementById('link').value)<\/script>`));
});
