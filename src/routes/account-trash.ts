import { Hono } from "hono";
import type { Bindings, EventRow, MediaRow } from "../domain";
import { normalizeLocale, type Locale } from "../i18n";
import { permanentlyDeleteMedia, restoreDeletedMedia } from "../media-trash";
import { reserveOwnedEvent, releaseOwnedEvent } from "../quotas";
import { permanentlyDeleteEvent } from "../repositories";
import { currentUser } from "../session";
import { esc, formatDateTime } from "../utils";
import { lightboxMarkup } from "../views/media";
import { accountMenu, brandMark, logoutScript, page } from "../views/shared";

export const accountTrashRoutes = new Hono<{ Bindings: Bindings }>();

function selectedIds(value: unknown, limit = 200) {
  return [...new Set(String(value ?? "").split(","))]
    .filter((id) => /^[a-f0-9-]{36}$/i.test(id))
    .slice(0, limit);
}

function label(locale: Locale, en: string, el: string) {
  return locale === "el" ? el : en;
}

accountTrashRoutes.get("/account/trash/media/:id", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const media = await c.env.DB.prepare(`SELECT m.object_key,m.content_type FROM media m
    JOIN event_members em ON em.event_id=m.event_id
    WHERE m.id=? AND m.deleted_at IS NOT NULL AND em.user_id=? AND em.role='owner'`)
    .bind(c.req.param("id"), user.id)
    .first<{ object_key: string; content_type: string }>();
  if (!media) return c.text("Media not found", 404);
  const object = await c.env.MEDIA.get(media.object_key);
  if (!object) return c.text("Media not found", 404);
  return new Response(object.body, { headers: { "Content-Type": media.content_type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
});

accountTrashRoutes.post("/api/account/trash/media/:action{restore|delete}", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? "en"));
  for (const id of selectedIds(body.ids)) {
    const media = await c.env.DB.prepare(`SELECT m.id FROM media m
      JOIN event_members em ON em.event_id=m.event_id
      WHERE m.id=? AND m.deleted_at IS NOT NULL AND em.user_id=? AND em.role='owner'`)
      .bind(id, user.id)
      .first<{ id: string }>();
    if (!media) continue;
    if (c.req.param("action") === "delete") await permanentlyDeleteMedia(c.env, media.id);
    else await restoreDeletedMedia(c.env.DB, media.id);
  }
  return c.redirect(`/${locale}/trash`, 303);
});

accountTrashRoutes.post("/api/account/trash/events/:action{restore|delete}", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? "en"));
  const action = c.req.param("action");
  let processed = 0;

  for (const id of selectedIds(body.ids, 100)) {
    const event = await c.env.DB.prepare(`SELECT e.id FROM events e
      JOIN event_members em ON em.event_id=e.id
      WHERE e.id=? AND e.deleted_at IS NOT NULL AND em.user_id=? AND em.role='owner'`)
      .bind(id, user.id)
      .first<{ id: string }>();
    if (!event) continue;

    if (action === "delete") {
      await permanentlyDeleteEvent(c.env, event.id);
      processed += 1;
      continue;
    }

    if (!(await reserveOwnedEvent(c.env.DB, user.id))) break;
    const restored = await c.env.DB.prepare(
      "UPDATE events SET deleted_at=NULL,purge_at=NULL,updated_at=? WHERE id=? AND deleted_at IS NOT NULL",
    ).bind(Date.now(), event.id).run();
    if (!restored.meta.changes) await releaseOwnedEvent(c.env.DB, user.id);
    else processed += 1;
  }

  if (c.req.header("Accept")?.includes("application/json")) return c.json({ action, processed });
  return c.redirect(`/${locale}/trash`, 303);
});

accountTrashRoutes.get("/:locale{el|en|fr|de|es|it}/trash", async (c) => {
  const locale = normalizeLocale(c.req.param("locale"));
  const user = await currentUser(c);
  if (!user) return c.redirect(`/${locale}/login`);
  const events = await c.env.DB.prepare(`SELECT e.* FROM events e
    JOIN event_members em ON em.event_id=e.id
    WHERE em.user_id=? AND em.role='owner' AND e.deleted_at IS NOT NULL ORDER BY e.purge_at`)
    .bind(user.id).all<EventRow>();
  const media = await c.env.DB.prepare(`SELECT md.*,e.eventName,e.code FROM media md
    JOIN events e ON e.id=md.event_id JOIN event_members em ON em.event_id=e.id
    WHERE em.user_id=? AND em.role='owner' AND md.media_type='image'
      AND md.deleted_at IS NOT NULL AND e.deleted_at IS NULL ORDER BY md.purge_at`)
    .bind(user.id).all<MediaRow & { eventName: string; code: string }>();

  const eventRows = events.results.map((event) => `<article class="owner-event-trash-selectable relative overflow-hidden rounded-2xl border bg-white shadow-sm transition">
    <label class="owner-event-trash-selector absolute inset-0 z-20 hidden cursor-pointer">
      <input type="checkbox" class="owner-event-trash-select sr-only" value="${esc(event.id)}">
      <span class="owner-event-trash-tick absolute left-3 top-3 hidden h-9 w-9 items-center justify-center rounded-full bg-[#2f6b5b] text-white shadow-lg">✓</span>
    </label>
    <div class="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0"><span class="text-xs font-bold uppercase tracking-[.14em] text-[#255848]">Event</span><h3 class="mt-1 truncate text-2xl">${esc(event.eventName)}</h3><p class="mt-1 text-sm text-red-700">${label(locale, "Permanent deletion", "Οριστική διαγραφή")}: ${formatDateTime(event.purge_at!, locale)}</p></div>
      <div class="relative z-10 flex shrink-0 flex-wrap gap-2">
        <form action="/api/account/events/${encodeURIComponent(event.code)}/restore" method="post"><input type="hidden" name="locale" value="${locale}"><button class="rounded-xl border px-4 py-2 text-sm font-semibold">${label(locale, "Restore", "Επαναφορά")}</button></form>
        <form action="/api/account/trash/events/delete" method="post" onsubmit="return confirm(${JSON.stringify(label(locale, "Permanently delete this event and all its photos? This cannot be undone.", "Οριστική διαγραφή αυτού του event και όλων των φωτογραφιών του; Η ενέργεια δεν αναιρείται."))})"><input type="hidden" name="locale" value="${locale}"><input type="hidden" name="ids" value="${esc(event.id)}"><button class="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700">${label(locale, "Delete permanently", "Οριστική διαγραφή")}</button></form>
      </div>
    </div>
  </article>`).join("");

  const mediaRows = media.results.map((item) => `<article class="owner-trash-selectable group relative overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"><label class="owner-trash-selector absolute inset-0 z-20 hidden cursor-pointer"><input type="checkbox" class="owner-trash-select sr-only" value="${esc(item.id)}"><span class="owner-trash-tick absolute left-3 top-3 hidden h-9 w-9 items-center justify-center rounded-full bg-[#2f6b5b] text-white shadow-lg">✓</span></label><button type="button" class="lightbox-item relative block aspect-square w-full overflow-hidden bg-[#e4f0eb]" data-src="/account/trash/media/${encodeURIComponent(item.id)}" data-type="${item.media_type}" aria-label="${label(locale, "Preview deleted media", "Προεπισκόπηση διαγραμμένου αρχείου")}">${item.media_type === "image" ? `<img src="/account/trash/media/${encodeURIComponent(item.id)}" alt="" loading="lazy" class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]">` : `<video src="/account/trash/media/${encodeURIComponent(item.id)}" muted preload="metadata" class="h-full w-full object-cover"></video>`}<span class="absolute right-3 top-3 rounded-full bg-black/65 px-3 py-1 text-xs text-white">${item.media_type === "image" ? "Image" : "Video"}</span><span class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-4 pb-3 pt-10 text-left text-sm text-white">${label(locale, "Open preview", "Πάτησε για preview")}</span></button><div class="p-4"><h3 class="truncate text-lg">${esc(item.eventName)}</h3><p class="mt-1 text-xs text-red-700">${label(locale, "Permanent deletion", "Οριστική διαγραφή")}: ${formatDateTime(item.purge_at!, locale)}</p><form action="/api/account/events/${item.code}/media/${item.id}/restore" method="post" class="mt-3"><input type="hidden" name="locale" value="${locale}"><button class="w-full rounded-xl border px-3 py-2 text-sm">${label(locale, "Restore", "Επαναφορά")}</button></form></div></article>`).join("");

  const eventControls = events.results.length ? `<div class="flex flex-wrap gap-2"><button type="button" id="owner-event-trash-toggle" class="rounded-xl border px-4 py-2">${label(locale, "Select", "Επιλογή")}</button><button type="button" id="owner-event-trash-restore" class="hidden rounded-xl bg-[#2f6b5b] px-4 py-2 text-white">${label(locale, "Restore selected", "Επαναφορά επιλεγμένων")}</button><button type="button" id="owner-event-trash-delete" class="hidden rounded-xl border border-red-200 px-4 py-2 text-red-700">${label(locale, "Delete permanently", "Οριστική διαγραφή")}</button></div>` : "";
  const photoControls = media.results.length ? `<div class="flex flex-wrap gap-2"><button type="button" id="owner-trash-select" class="rounded-xl border px-4 py-2">${label(locale, "Select", "Επιλογή")}</button><button type="button" id="owner-trash-restore" class="hidden rounded-xl bg-[#2f6b5b] px-4 py-2 text-white">${label(locale, "Restore selected", "Επαναφορά επιλεγμένων")}</button><button type="button" id="owner-trash-delete" class="hidden rounded-xl border border-red-200 px-4 py-2 text-red-700">${label(locale, "Delete permanently", "Οριστική διαγραφή")}</button></div>` : "";

  const body = `<header class="border-b bg-white"><div class="mx-auto flex max-w-5xl items-center justify-between p-5">${brandMark(`/${locale}`, true)}${accountMenu(locale, user)}</div></header><main class="mx-auto max-w-5xl p-5 md:p-10"><a href="/${locale}/account" class="text-sm text-[#2f6b5b]">← ${label(locale, "My events", "Τα events μου")}</a><h1 class="mt-4 text-4xl">${label(locale, "Trash", "Κάδος")}</h1><p class="mt-2 text-[#65756f]">${label(locale, "Items are permanently deleted 30 days after being moved here.", "Τα στοιχεία διαγράφονται οριστικά 30 ημέρες μετά τη μεταφορά τους εδώ.")}</p>
    <div class="mt-8 flex flex-wrap items-center justify-between gap-3"><h2 class="text-2xl">Events</h2>${eventControls}</div>
    <form id="owner-event-trash-restore-form" action="/api/account/trash/events/restore" method="post"><input type="hidden" name="locale" value="${locale}"><input id="owner-event-trash-restore-ids" type="hidden" name="ids"></form><form id="owner-event-trash-delete-form" action="/api/account/trash/events/delete" method="post"><input type="hidden" name="locale" value="${locale}"><input id="owner-event-trash-delete-ids" type="hidden" name="ids"></form>
    <div class="mt-3 space-y-3">${eventRows || `<p class="rounded-2xl bg-white p-6 text-[#65756f]">${label(locale, "No deleted events.", "Δεν υπάρχουν διαγραμμένα events.")}</p>`}</div>
    <div class="mt-8 flex flex-wrap items-center justify-between gap-3"><h2 class="text-2xl">${label(locale, "Photos", "Φωτογραφίες")}</h2>${photoControls}</div>
    <form id="owner-trash-restore-form" action="/api/account/trash/media/restore" method="post"><input type="hidden" name="locale" value="${locale}"><input id="owner-trash-restore-ids" type="hidden" name="ids"></form><form id="owner-trash-delete-form" action="/api/account/trash/media/delete" method="post"><input type="hidden" name="locale" value="${locale}"><input id="owner-trash-delete-ids" type="hidden" name="ids"></form>
    <div class="mt-3 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">${mediaRows || `<p class="col-span-full rounded-2xl bg-white p-6 text-[#65756f]">${label(locale, "No deleted photos.", "Δεν υπάρχουν διαγραμμένες φωτογραφίες.")}</p>`}</div></main>`;

  const selectionScript = `<script>(()=>{const setup=(config)=>{const toggle=document.getElementById(config.toggle),restore=document.getElementById(config.restore),remove=document.getElementById(config.remove),selectors=[...document.querySelectorAll(config.selector)],selected=()=>[...document.querySelectorAll(config.input+':checked')];if(!toggle)return;let mode=false;const refresh=()=>{document.querySelectorAll(config.card).forEach(card=>{const checked=card.querySelector(config.input)?.checked;card.classList.toggle('ring-4',!!checked);card.classList.toggle('ring-[#356f5e]',!!checked);card.classList.toggle('brightness-75',!!checked);const tick=card.querySelector(config.tick);if(tick){tick.classList.toggle('hidden',!checked);tick.classList.toggle('flex',!!checked)}});const count=selected().length;restore.textContent=config.restoreText+' ('+count+')';remove.textContent=config.deleteText+' ('+count+')';restore.disabled=remove.disabled=count===0};toggle.onclick=()=>{mode=!mode;selectors.forEach(item=>item.classList.toggle('hidden',!mode));restore.classList.toggle('hidden',!mode);remove.classList.toggle('hidden',!mode);toggle.textContent=mode?config.cancelText:config.selectText;if(!mode){document.querySelectorAll(config.input).forEach(input=>input.checked=false);refresh()}};document.querySelectorAll(config.input).forEach(input=>input.onchange=refresh);const submit=(formId,inputId)=>{const ids=selected().map(input=>input.value);if(!ids.length)return;document.getElementById(inputId).value=ids.join(',');document.getElementById(formId).submit()};restore.onclick=()=>submit(config.restoreForm,config.restoreIds);remove.onclick=()=>{if(confirm(config.confirmText))submit(config.deleteForm,config.deleteIds)};refresh()};setup({toggle:'owner-event-trash-toggle',restore:'owner-event-trash-restore',remove:'owner-event-trash-delete',selector:'.owner-event-trash-selector',input:'.owner-event-trash-select',card:'.owner-event-trash-selectable',tick:'.owner-event-trash-tick',restoreForm:'owner-event-trash-restore-form',restoreIds:'owner-event-trash-restore-ids',deleteForm:'owner-event-trash-delete-form',deleteIds:'owner-event-trash-delete-ids',selectText:${JSON.stringify(label(locale, "Select", "Επιλογή"))},cancelText:${JSON.stringify(label(locale, "Cancel", "Ακύρωση"))},restoreText:${JSON.stringify(label(locale, "Restore selected", "Επαναφορά επιλεγμένων"))},deleteText:${JSON.stringify(label(locale, "Delete permanently", "Οριστική διαγραφή"))},confirmText:${JSON.stringify(label(locale, "Permanently delete the selected events and all their photos? This cannot be undone.", "Οριστική διαγραφή των επιλεγμένων events και όλων των φωτογραφιών τους; Η ενέργεια δεν αναιρείται."))}});setup({toggle:'owner-trash-select',restore:'owner-trash-restore',remove:'owner-trash-delete',selector:'.owner-trash-selector',input:'.owner-trash-select',card:'.owner-trash-selectable',tick:'.owner-trash-tick',restoreForm:'owner-trash-restore-form',restoreIds:'owner-trash-restore-ids',deleteForm:'owner-trash-delete-form',deleteIds:'owner-trash-delete-ids',selectText:${JSON.stringify(label(locale, "Select", "Επιλογή"))},cancelText:${JSON.stringify(label(locale, "Cancel", "Ακύρωση"))},restoreText:${JSON.stringify(label(locale, "Restore selected", "Επαναφορά επιλεγμένων"))},deleteText:${JSON.stringify(label(locale, "Delete permanently", "Οριστική διαγραφή"))},confirmText:${JSON.stringify(label(locale, "Permanently delete selected files? This cannot be undone.", "Οριστική διαγραφή των επιλεγμένων αρχείων; Η ενέργεια δεν αναιρείται."))}})})()<\/script>`;

  return c.html(page(label(locale, "Trash", "Κάδος"), `${body}${selectionScript}${lightboxMarkup(locale)}${logoutScript(locale)}`));
});
