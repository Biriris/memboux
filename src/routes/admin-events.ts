import { Hono } from "hono";
import QRCode from "qrcode";
import { TRASH_RETENTION_MS } from "../config";
import type { Bindings } from "../domain";
import { normalizeLocale } from "../i18n";
import { getEvent, getMedia, permanentlyDeleteEvent } from "../repositories";
import { currentUser } from "../session";
import { adminLocaleOrRedirect, isAdmin } from "./admin-auth";
import { parse as parseMetadata } from "exifr";
import { releaseOwnedEvent, releaseStorage, reserveStorageForEvent } from "../quotas";
import { safeFileExtension, validateUploadFiles } from "../upload-policy";
import { adminShell } from "../views/admin";
import { bulkSelectionScript, cards, lightboxMarkup } from "../views/media";
import { accountMenu, brandMark, logoutScript, page } from "../views/shared";
import { constantTimeEqual, dateInput, esc, formatDate, formatDateTime, formatEventDates, sha256, sha256Bytes, validEventDate } from "../utils";
import { getEventRole, roleCan } from "../access";

export const adminEventRoutes = new Hono<{ Bindings: Bindings }>();

adminEventRoutes.get("/admin/events/:code", async (c) => {
  const locale = await adminLocaleOrRedirect(c);
  if (!locale) return c.redirect("/admin/login");
  const event = await getEvent(c.env.DB, c.req.param("code"), true);
  if (!event) return c.text("Το event δεν βρέθηκε.", 404);
  const items = await getMedia(c.env.DB, event.id);
  const guestUrl = `${new URL(c.req.url).origin}/gallery/${event.code}`;
  const adminMediaScript = bulkSelectionScript({
    selectButtonId: "admin-select-media",
    cardSelector: ".selectable-media",
    selectorSelector: ".media-selector",
    checkboxSelector: ".media-select",
    tickSelector: ".selection-tick",
    selectText: locale === "el" ? "Επιλογή" : "Select",
    cancelText: locale === "el" ? "Ακύρωση" : "Cancel",
    actions: [
      {
        buttonId: "admin-download-selected",
        label: locale === "el" ? "Λήψη επιλεγμένων" : "Download selected",
        kind: "download",
      },
      {
        buttonId: "admin-delete-selected",
        label: locale === "el" ? "Διαγραφή επιλεγμένων" : "Delete selected",
        kind: "submit",
        formId: "admin-bulk-media",
        inputId: "admin-media-ids",
        confirmMessage: locale === "el" ? "Μεταφορά των επιλεγμένων media στον κάδο;" : "Move selected media to trash?",
      },
    ],
  });
  return c.html(
    adminShell(
      event.eventName,
      `<main class="mx-auto max-w-7xl p-5 md:p-10"><a href="/admin" class="text-sm font-medium text-[#4338ca]">← ${locale === "el" ? "Πίσω στη βιβλιοθήκη" : "Back to library"}</a><div class="mt-5 grid gap-6 lg:grid-cols-[420px_1fr]"><section class="rounded-3xl bg-white p-6 shadow-lg"><div class="flex items-start justify-between gap-3"><div><h1 class="mt-1 text-3xl font-bold">${esc(event.eventName)}</h1></div><span class="rounded-full px-3 py-1 text-xs font-semibold ${event.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-[#475569]"}">${event.status === "active" ? (locale === "el" ? "Ενεργό" : "Active") : locale === "el" ? "Αρχειοθετημένο" : "Archived"}</span></div><form action="/admin/events/${encodeURIComponent(event.code)}/update" method="post" class="mt-7 space-y-4"><label class="block text-sm font-semibold">${locale === "el" ? "Όνομα event" : "Event name"}<input name="eventName" required maxlength="100" value="${esc(event.eventName)}" class="mt-1 w-full rounded-xl border px-4 py-3 font-normal"></label><label class="block text-sm font-semibold">${locale === "el" ? "Κατάσταση" : "Status"}<select name="status" class="mt-1 w-full rounded-xl border px-4 py-3 font-normal"><option value="active"${event.status === "active" ? " selected" : ""}>${locale === "el" ? "Ενεργό" : "Active"}</option><option value="archived"${event.status === "archived" ? " selected" : ""}>${locale === "el" ? "Αρχειοθετημένο" : "Archived"}</option></select></label><div class="grid grid-cols-2 gap-3"><label class="block text-sm font-semibold">${locale === "el" ? "Έναρξη event" : "Event start"}<input name="eventStartDate" type="date" required value="${esc(event.event_start_date ?? "")}" class="mt-1 w-full rounded-xl border px-4 py-3 font-normal"></label><label class="block text-sm font-semibold">${locale === "el" ? "Λήξη event" : "Event end"}<input name="eventEndDate" type="date" value="${esc(event.event_end_date ?? "")}" class="mt-1 w-full rounded-xl border px-4 py-3 font-normal"></label></div><label class="block text-sm font-semibold">${locale === "el" ? "Ημερομηνία λήξης πρόσβασης" : "Access expiration"}<input name="expires_at" type="date" required value="${dateInput(event.expires_at)}" class="mt-1 w-full rounded-xl border px-4 py-3 font-normal"></label><div class="rounded-2xl bg-[#f5f7ff] p-4"><p class="text-sm font-semibold">PIN gallery</p><p class="mt-1 text-xs text-[#64748b]">${event.gallery_pin_hash ? "Υπάρχει ενεργό PIN. Για λόγους ασφαλείας δεν εμφανίζεται. Μπορείς να το αντικαταστήσεις χωρίς το παλιό." : "Δεν υπάρχει ενεργό PIN."}</p><input name="galleryPin" inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" placeholder="${event.gallery_pin_hash ? "Νέο PIN (προαιρετικά)" : "Νέο PIN 4–8 ψηφίων"}" class="mt-3 w-full rounded-xl border bg-white px-4 py-3 font-normal">${event.gallery_pin_hash ? '<label class="mt-3 flex items-center gap-2 text-sm font-normal"><input name="removeGalleryPin" type="checkbox"> Αφαίρεση υπάρχοντος PIN</label>' : ""}</div><label class="block text-sm font-semibold">${locale === "el" ? "Εσωτερικές σημειώσεις" : "Internal notes"}<textarea name="notes" maxlength="2000" rows="6" class="mt-1 w-full rounded-xl border px-4 py-3 font-normal" placeholder="Πληροφορίες, συμφωνίες, εκκρεμότητες…">${esc(event.notes)}</textarea></label><button class="w-full rounded-xl bg-[#172033] py-3 font-semibold text-white">${locale === "el" ? "Αποθήκευση αλλαγών" : "Save changes"}</button></form><div class="mt-5"><a href="${esc(guestUrl)}" target="_blank" class="block rounded-xl border px-4 py-3 text-center text-sm font-semibold">${locale === "el" ? "Άνοιγμα guest gallery" : "Open guest gallery"}</a></div><form action="/admin/events/${encodeURIComponent(event.code)}/upload" method="post" enctype="multipart/form-data" class="mt-5 rounded-2xl bg-[#f5f7ff] p-4"><label class="text-sm font-semibold">${locale === "el" ? "Upload φωτογραφιών / βίντεο" : "Upload photos / videos"}<input name="file" type="file" multiple required accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" class="mt-2 w-full rounded-xl border bg-white p-3 font-normal"></label><p class="mt-2 text-xs text-[#64748b]">${locale === "el" ? "Έως 20 αρχεία, 100 MB ανά αρχείο και 100 MB συνολικά." : "Up to 20 files, 100 MB each and 100 MB total."}</p><button class="mt-3 w-full rounded-xl bg-[#4f46e5] px-4 py-3 text-white">${locale === "el" ? "Ανέβασμα" : "Upload"}</button></form></section><section class="rounded-3xl bg-white p-6 shadow-lg"><div class="mb-5 flex items-center justify-between"><div><p class="text-sm text-[#64748b]">${locale === "el" ? "Δημιουργήθηκε" : "Created"} ${formatDate(event.created_at)}</p><h2 class="text-2xl font-bold">${locale === "el" ? "Αρχεία" : "Files"} (${items.length})</h2></div><div class="flex flex-wrap gap-2"><button type="button" id="admin-select-media" class="rounded-xl border px-3 py-2 text-sm">Select</button><button type="button" id="admin-download-selected" class="hidden rounded-xl bg-[#4f46e5] px-3 py-2 text-sm text-white">Download selected</button><button type="button" id="admin-delete-selected" class="hidden rounded-xl border border-red-200 px-3 py-2 text-sm text-red-700">Delete selected</button></div></div>${items.length ? `<form id="admin-bulk-media" action="/admin/events/${encodeURIComponent(event.code)}/media/bulk-trash" method="post"><input id="admin-media-ids" type="hidden" name="ids"><div class="grid grid-cols-2 gap-4 md:grid-cols-3">${cards(items, { selectable: true, deferredSelection: true })}</div></form>` : `<p class="py-16 text-center text-[#64748b]">${locale === "el" ? "Δεν υπάρχουν uploads." : "No uploads."}</p>`}</section></div></main>${adminMediaScript}`,
      locale,
    ),
  );
});

adminEventRoutes.post("/admin/events/:code/upload", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin/login");
  const event = await getEvent(c.env.DB, c.req.param("code"), true);
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

adminEventRoutes.post("/admin/events/:code/media/bulk-trash", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin/login");
  const event = await getEvent(c.env.DB, c.req.param("code"), true);
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

adminEventRoutes.post("/admin/events/:code/update", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin/login");
  const event = await getEvent(c.env.DB, c.req.param("code"), true);
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

adminEventRoutes.post("/admin/events/:code/delete", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin/login");
  const event = await getEvent(c.env.DB, c.req.param("code"), true);
  if (!event) return c.text("Event not found", 404);

  if (event.deleted_at) {
    await permanentlyDeleteEvent(c.env, event.id);
  } else {
    const owner = await c.env.DB.prepare(
      "SELECT user_id FROM event_members WHERE event_id=? AND role='owner' LIMIT 1",
    ).bind(event.id).first<{ user_id: string }>();
    const now = Date.now();
    const result = await c.env.DB.prepare(
      "UPDATE events SET deleted_at=?,purge_at=?,updated_at=? WHERE id=? AND deleted_at IS NULL",
    ).bind(now, now + TRASH_RETENTION_MS, now, event.id).run();
    if (result.meta.changes && owner)
      await releaseOwnedEvent(c.env.DB, owner.user_id);
  }

  return c.redirect("/admin", 303);
});
