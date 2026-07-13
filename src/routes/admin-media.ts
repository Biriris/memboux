import { Hono } from "hono";
import { TRASH_RETENTION_MS } from "../config";
import type { Bindings } from "../domain";
import { normalizeLocale } from "../i18n";
import { permanentlyDeleteMedia, restoreDeletedMedia } from "../media-trash";
import { formatDateTime } from "../utils";
import { adminShell } from "../views/admin";
import { bulkSelectionScript, lightboxMarkup } from "../views/media";
import { page } from "../views/shared";
import { adminLocaleOrRedirect, isAdmin } from "./admin-auth";
import { getEvent } from "../repositories";
import { cards } from "../views/media";

export const adminMediaRoutes = new Hono<{ Bindings: Bindings }>();

adminMediaRoutes.get("/admin/media/:id", async (c) => {
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

adminMediaRoutes.get("/admin/reported", async (c) => {
  const locale = await adminLocaleOrRedirect(c);
  if (!locale) return c.redirect("/admin/login");
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
        `<article class="selectable-media relative overflow-hidden rounded-2xl border bg-white shadow-sm transition"><label class="media-selector absolute inset-0 z-20 hidden cursor-pointer"><input type="checkbox" class="media-select sr-only" value="${item.id}"><span class="selection-tick absolute left-3 top-3 hidden h-8 w-8 items-center justify-center rounded-full bg-[#654534] text-white shadow">✓</span></label><button type="button" class="lightbox-item block aspect-square w-full bg-[#e8ddd3]" data-src="/admin/media/${encodeURIComponent(item.id)}" data-type="${item.media_type}">${item.media_type === "image" ? `<img src="/admin/media/${encodeURIComponent(item.id)}" alt="" loading="lazy" class="h-full w-full object-cover">` : `<video src="/admin/media/${encodeURIComponent(item.id)}" muted preload="metadata" class="h-full w-full object-cover"></video>`}</button><div class="p-4"><h2 class="truncate text-xl">${item.eventName}</h2><p class="mt-1 truncate text-xs text-[#625750]">${item.requester_email ?? ""}</p><p class="mt-2 line-clamp-3 text-sm">${item.reason ?? ""}</p><p class="mt-2 text-xs text-red-700">Reported ${formatDateTime(item.reported_at, "el")}</p></div></article>`,
    )
    .join("");
  const script = bulkSelectionScript({
    selectButtonId: "reported-select",
    cardSelector: ".selectable-media",
    selectorSelector: ".media-selector",
    checkboxSelector: ".media-select",
    tickSelector: ".selection-tick",
    selectText: locale === "el" ? "Επιλογή" : "Select",
    cancelText: locale === "el" ? "Ακύρωση" : "Cancel",
    actions: [
      {
        buttonId: "reported-restore",
        label: locale === "el" ? "Επαναφορά επιλεγμένων" : "Restore selected",
        kind: "submit",
        formId: "reported-restore-form",
        inputId: "reported-restore-ids",
      },
      {
        buttonId: "reported-delete",
        label: locale === "el" ? "Διαγραφή επιλεγμένων" : "Delete selected",
        kind: "submit",
        formId: "reported-delete-form",
        inputId: "reported-delete-ids",
        confirmMessage: locale === "el" ? "Μεταφορά των επιλεγμένων reported media στον κάδο;" : "Move selected reported media to trash?",
      },
    ],
  });
  return c.html(
    adminShell(
      "Reported",
      `<main class="mx-auto max-w-7xl p-5 md:p-10"><a href="/admin" class="text-sm text-[#6e4f3e]">← ${locale === "el" ? "Πίσω στη βιβλιοθήκη" : "Back to library"}</a><div class="mt-4 flex flex-wrap items-end justify-between gap-3"><div><h1 class="text-4xl">${locale === "el" ? "Reported φωτογραφίες" : "Reported media"}</h1><p class="mt-2 text-[#625750]">${locale === "el" ? "Κρυμμένες από guest και owner galleries μέχρι να τις ελέγξει ο admin." : "Hidden from guest and owner galleries until reviewed by the admin."}</p></div><div class="flex flex-wrap gap-2"><button id="reported-select" class="rounded-xl border px-4 py-2">${locale === "el" ? "Επιλογή" : "Select"}</button><button id="reported-restore" class="hidden rounded-xl bg-[#654534] px-4 py-2 text-white">${locale === "el" ? "Επαναφορά επιλεγμένων" : "Restore selected"}</button><button id="reported-delete" class="hidden rounded-xl border border-red-200 px-4 py-2 text-red-700">${locale === "el" ? "Διαγραφή επιλεγμένων" : "Delete selected"}</button></div></div><form id="reported-restore-form" action="/admin/reported/restore" method="post"><input id="reported-restore-ids" type="hidden" name="ids"></form><form id="reported-delete-form" action="/admin/reported/trash" method="post"><input id="reported-delete-ids" type="hidden" name="ids"></form><div class="mt-7 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">${cards || `<p class="col-span-full rounded-2xl bg-white p-10 text-center text-[#625750]">${locale === "el" ? "Δεν υπάρχουν reported φωτογραφίες." : "No reported media."}</p>`}</div></main>${lightboxMarkup(locale)}${script}`,
      locale,
    ),
  );
});

adminMediaRoutes.get("/admin/privacy-requests", async (c) => {
  const locale = await adminLocaleOrRedirect(c);
  if (!locale) return c.redirect("/admin/login");
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
        `<article class="rounded-2xl border bg-white p-5 shadow-sm"><div class="flex flex-wrap items-start justify-between gap-3"><div><span class="rounded-full bg-[#eee4dc] px-3 py-1 text-xs uppercase">${item.request_type}</span><h2 class="mt-3 break-all text-xl">${item.email}</h2><p class="mt-1 text-xs text-[#625750]">${formatDateTime(item.created_at, locale)} · ${item.id}</p></div><span class="rounded-full px-3 py-1 text-xs ${item.status === "pending" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}">${item.status}</span></div><p class="mt-4 whitespace-pre-wrap rounded-xl bg-[#f8f3ee] p-4 text-sm">${item.details}</p>${item.status === "pending" ? `<div class="mt-4 flex gap-2"><form action="/admin/privacy-requests/${encodeURIComponent(item.id)}/resolve" method="post"><button class="rounded-xl bg-[#654534] px-4 py-2 text-sm text-white">${locale === "el" ? "Επίλυση" : "Resolve"}</button></form><form action="/admin/privacy-requests/${encodeURIComponent(item.id)}/dismiss" method="post"><button class="rounded-xl border px-4 py-2 text-sm">${locale === "el" ? "Απόρριψη" : "Dismiss"}</button></form></div>` : ""}</article>`,
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

adminMediaRoutes.post(
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

adminMediaRoutes.post("/admin/reported/:action{restore|trash}", async (c) => {
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

adminMediaRoutes.get("/admin/trash", async (c) => {
  const locale = await adminLocaleOrRedirect(c);
  if (!locale) return c.redirect("/admin/login");
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
        `<article class="trash-selectable group relative overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"><label class="trash-selector absolute inset-0 z-20 hidden cursor-pointer"><input type="checkbox" class="trash-select sr-only" value="${item.id}"><span class="trash-tick absolute left-3 top-3 hidden h-9 w-9 items-center justify-center rounded-full bg-[#654534] text-white shadow-lg">✓</span></label><button type="button" class="lightbox-item relative block aspect-square w-full overflow-hidden bg-[#e8ddd3]" data-src="/admin/media/${encodeURIComponent(item.id)}" data-type="${item.media_type}" aria-label="${locale === "el" ? "Προεπισκόπηση διαγραμμένου αρχείου" : "Preview deleted media"}">${item.media_type === "image" ? `<img src="/admin/media/${encodeURIComponent(item.id)}" alt="" loading="lazy" class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]">` : `<video src="/admin/media/${encodeURIComponent(item.id)}" muted preload="metadata" class="h-full w-full object-cover"></video>`}<span class="absolute right-3 top-3 rounded-full bg-black/65 px-3 py-1 text-xs text-white">${item.media_type === "image" ? "Image" : "Video"}</span><span class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-4 pb-3 pt-10 text-left text-sm text-white">${locale === "el" ? "Πατήσε για preview" : "Open preview"}</span></button><div class="p-4"><h2 class="truncate text-lg">${item.eventName}</h2><p class="mt-1 text-xs text-[#625750]">${locale === "el" ? "Διαγράφηκε" : "Deleted"} ${formatDateTime(item.deleted_at, locale)}</p><p class="mt-1 text-xs text-red-700">${locale === "el" ? "Οριστική διαγραφή" : "Permanent deletion"} ${formatDateTime(item.purge_at, locale)}</p></div></article>`,
    )
    .join("");
  const trashScript = bulkSelectionScript({
    selectButtonId: "trash-select",
    cardSelector: ".trash-selectable",
    selectorSelector: ".trash-selector",
    checkboxSelector: ".trash-select",
    tickSelector: ".trash-tick",
    selectText: locale === "el" ? "Επιλογή" : "Select",
    cancelText: locale === "el" ? "Ακύρωση" : "Cancel",
    actions: [
      {
        buttonId: "trash-restore",
        label: locale === "el" ? "Επαναφορά επιλεγμένων" : "Restore selected",
        kind: "submit",
        formId: "trash-restore-form",
        inputId: "trash-restore-ids",
      },
      {
        buttonId: "trash-delete",
        label: locale === "el" ? "Οριστική διαγραφή" : "Delete permanently",
        kind: "submit",
        formId: "trash-delete-form",
        inputId: "trash-delete-ids",
        confirmMessage: locale === "el" ? "Οριστική διαγραφή των επιλεγμένων αρχείων;" : "Permanently delete selected files?",
      },
    ],
  });
  return c.html(
    adminShell(
      locale === "el" ? "Κάδος" : "Trash",
      `<main class="mx-auto max-w-7xl p-5 md:p-10"><a href="/admin" class="text-sm text-[#6e4f3e]">← ${locale === "el" ? "Πίσω στη βιβλιοθήκη" : "Back to library"}</a><div class="mt-4 flex flex-wrap items-end justify-between gap-3"><div><h1 class="text-4xl">${locale === "el" ? "Κάδος φωτογραφιών" : "Media trash"}</h1><p class="mt-2 text-[#625750]">${locale === "el" ? "Οι φωτογραφίες διαγράφονται οριστικά 30 ημέρες μετά τη μεταφορά τους στον κάδο. Πάτησε το preview για μεγέθυνση." : "Media is permanently deleted 30 days after being moved to trash. Select a preview to enlarge it."}</p></div><div class="flex flex-wrap gap-2"><button id="trash-select" class="rounded-xl border px-4 py-2">${locale === "el" ? "Επιλογή" : "Select"}</button><button id="trash-restore" class="hidden rounded-xl bg-[#654534] px-4 py-2 text-white">${locale === "el" ? "Επαναφορά επιλεγμένων" : "Restore selected"}</button><button id="trash-delete" class="hidden rounded-xl border border-red-200 px-4 py-2 text-red-700">${locale === "el" ? "Οριστική διαγραφή" : "Delete permanently"}</button></div></div><form id="trash-restore-form" action="/admin/trash/restore" method="post"><input id="trash-restore-ids" type="hidden" name="ids"></form><form id="trash-delete-form" action="/admin/trash/delete" method="post"><input id="trash-delete-ids" type="hidden" name="ids"></form><div class="mt-7 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">${rows || `<p class="rounded-2xl bg-white p-8 text-center text-[#625750]">${locale === "el" ? "Ο κάδος είναι άδειος." : "Trash is empty."}</p>`}</div></main>${lightboxMarkup(locale)}${trashScript}`,
      locale,
    ),
  );
});

adminMediaRoutes.post("/admin/trash/:action{restore|delete}", async (c) => {
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

adminMediaRoutes.post("/admin/events/:code/media/:id/restore", async (c) => {
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
