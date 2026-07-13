import { Hono } from "hono";
import { parse as parseMetadata } from "exifr";
import { getEventRole, roleCan } from "../access";
import type { Bindings, EventRow, MediaRow } from "../domain";
import { normalizeLocale } from "../i18n";
import { GUEST_UPLOAD_POLICY_VERSION } from "../privacy";
import { releaseStorage, reserveStorageForEvent } from "../quotas";
import { consumeRateLimit, tooManyRequests } from "../rate-limit";
import { getEvent, getMedia } from "../repositories";
import { currentUser } from "../session";
import {
  safeFileExtension,
  uploadValidationDetails,
  validateUploadFiles,
} from "../upload-policy";
import {
  bulkSelectionScript,
  cards,
  galleryFilterControls,
  galleryFilterScript,
  lightboxMarkup,
} from "../views/media";
import { shareIconButtons } from "../views/share";
import { brandMark, page } from "../views/shared";
import {
  constantTimeEqual,
  cookieValue,
  esc,
  formatEventDates,
  sha256,
  sha256Bytes,
} from "../utils";

export const galleryRoutes = new Hono<{ Bindings: Bindings }>();

const galleryCookieName = (code: string) => `memboux_gallery_${code.toLowerCase()}`;
const galleryAccessToken = (event: EventRow) =>
  sha256(`gallery-access:${event.id}:${event.gallery_pin_hash}`);

async function hasGalleryAccess(request: Request, event: EventRow) {
  if (!event.gallery_pin_hash) return true;
  const cookie = cookieValue(request, galleryCookieName(event.code)) ?? "";
  return constantTimeEqual(cookie, await galleryAccessToken(event));
}

galleryRoutes.post("/gallery/:code/unlock", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);

  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));

  if (Date.now() > event.expires_at)
    return c.text(locale === "el" ? "Το event έχει λήξει." : "This event has expired.", 410);
  if (!event.gallery_pin_hash)
    return c.redirect(`/gallery/${event.code}?lang=${locale}`, 303);

  const pinLimit = await consumeRateLimit(c.env.DB, c.req.raw, c.env.BETTER_AUTH_SECRET, {
    scope: `gallery-pin:${event.code}`,
    limit: 10,
    windowMs: 15 * 60_000,
  });
  if (!pinLimit.allowed)
    return tooManyRequests(
      pinLimit,
      locale === "el"
        ? "Πολλές προσπάθειες PIN. Δοκίμασε ξανά αργότερα."
        : "Too many PIN attempts. Please try again later.",
    );

  if (!constantTimeEqual(await sha256(String(body.pin ?? "")), event.gallery_pin_hash))
    return c.text(locale === "el" ? "Λάθος PIN" : "Incorrect PIN", 401);

  const token = await galleryAccessToken(event);
  const maxAge = Math.max(
    0,
    Math.min(2592000, Math.floor((event.expires_at - Date.now()) / 1000)),
  );
  return new Response(null, {
    status: 303,
    headers: {
      Location: `/gallery/${event.code}?lang=${locale}`,
      "Set-Cookie": `${galleryCookieName(event.code)}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`,
    },
  });
});

galleryRoutes.get("/gallery/:code", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Η εκδήλωση δεν βρέθηκε.", 404);

  const locale = normalizeLocale(c.req.query("lang") ?? event.default_locale);
  const otherLocale = locale === "el" ? "en" : "el";
  const guestUrl = `${new URL(c.req.url).origin}/gallery/${event.code}`;

  if (Date.now() > event.expires_at) return c.text("Η εκδήλωση έχει λήξει.", 410);

  if (!(await hasGalleryAccess(c.req.raw, event))) {
    return c.html(
      page(
        event.eventName,
        `<main class="flex min-h-screen items-center justify-center p-5"><section class="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl"><div class="flex items-center justify-between">${brandMark("/", true)}<a href="/gallery/${event.code}?lang=${otherLocale}" class="rounded-xl border px-3 py-2 text-sm">${otherLocale.toUpperCase()}</a></div><h1 class="mt-7 text-4xl">${locale === "el" ? "Ιδιωτική gallery" : "Private gallery"}</h1><p class="mt-2 text-[#625750]">${locale === "el" ? "Βάλε το PIN του event για να δεις τη gallery και να ανεβάσεις φωτογραφίες ή βίντεο." : "Enter the event PIN to view the gallery and upload photos or videos."}</p><form action="/gallery/${encodeURIComponent(event.code)}/unlock" method="post" class="mt-6 space-y-3"><input type="hidden" name="locale" value="${locale}"><input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" required autofocus placeholder="PIN" class="w-full rounded-xl border px-4 py-3 text-center text-xl tracking-[.3em]"><button class="w-full rounded-xl bg-[#654534] px-5 py-3 text-white">${locale === "el" ? "Άνοιγμα gallery" : "Open gallery"}</button></form></section></main>`,
      ),
      401,
    );
  }

  const items = (await getMedia(c.env.DB, event.id)).filter((item) => item.origin !== "official");
  const selectionScript = bulkSelectionScript({
    selectButtonId: "select-media",
    cardSelector: ".selectable-media",
    selectorSelector: ".media-selector",
    checkboxSelector: ".media-select",
    tickSelector: ".selection-tick",
    selectText: locale === "el" ? "Επιλογή" : "Select",
    cancelText: locale === "el" ? "Ακύρωση" : "Cancel",
    actions: [
      {
        buttonId: "download-selected",
        label: locale === "el" ? "Λήψη επιλεγμένων" : "Download selected",
        kind: "download",
      },
    ],
  });

  return c.html(
    page(
      `${event.eventName} – Gallery`,
      `<main class="mx-auto max-w-6xl p-5 md:p-10"><section class="mb-6 rounded-3xl bg-white p-7 text-center shadow-lg"><div class="mb-4 flex items-center justify-between">${brandMark("/", true)}<a href="/gallery/${event.code}?lang=${otherLocale}" class="rounded-xl border px-3 py-2 text-sm">${otherLocale.toUpperCase()}</a></div><h1 class="mt-2 text-4xl font-bold">${esc(event.eventName)}</h1><p class="mt-2 font-medium text-[#654534]">${esc(formatEventDates(event, locale))}</p><p class="mt-2 text-[#625750]">${locale === "el" ? "Μοιράσου τις αγαπημένες σου στιγμές" : "Share your favorite moments"}</p>${shareIconButtons(guestUrl, event.eventName, locale)}<form action="/api/upload/${event.code}" method="post" enctype="multipart/form-data" class="gallery-upload mx-auto mt-7 max-w-xl space-y-3 text-left"><input type="hidden" name="locale" value="${locale}"><input name="name" maxlength="60" placeholder="${locale === "el" ? "Το όνομά σου" : "Your name"}" class="w-full rounded-xl border px-4 py-3"><input name="file" required multiple type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" class="w-full rounded-xl border p-3"><p class="text-xs text-[#625750]">${locale === "el" ? "Επίλεξε έως 20 φωτογραφίες ή βίντεο μαζί · έως 50 MB ανά αρχείο και 95 MB συνολικά." : "Select up to 20 photos or videos · 50 MB per file and 95 MB total."}</p><div class="rounded-2xl bg-[#f6f1eb] p-4 text-sm text-[#51453f]"><p>${locale === "el" ? "Το περιεχόμενο θα αποθηκευτεί στην ιδιωτική συλλογή αυτού του event. Μπορείς να ζητήσεις αφαίρεση οποιαδήποτε στιγμή." : "Your content will be stored in this event’s private gallery. You can request removal at any time."}</p><label class="mt-3 flex items-start gap-3"><input name="upload_confirmation" value="accepted" required type="checkbox" class="mt-1 h-4 w-4 shrink-0"><span>${locale === "el" ? "Επιβεβαιώνω ότι έχω δικαίωμα να ανεβάσω αυτό το περιεχόμενο και ότι δεν παραβιάζει παράνομα την ιδιωτικότητα ή τα δικαιώματα άλλων." : "I confirm that I am entitled to upload this content and that it does not unlawfully infringe the privacy or rights of others."}</span></label></div><button class="w-full rounded-xl bg-gradient-to-r from-[#8b6250] to-[#654534] py-3 font-semibold text-white">${locale === "el" ? "Ανέβασμα" : "Upload"}</button></form></section><section class="rounded-3xl bg-white p-7 shadow-lg"><div class="mb-5 flex items-center justify-between gap-3"><div><h2 class="text-2xl font-bold">Gallery (${items.length})</h2>${galleryFilterControls(items, "guest-gallery", locale)}</div><div class="flex gap-2"><button id="select-media" class="rounded-xl border px-4 py-2 text-sm">${locale === "el" ? "Επιλογή" : "Select"}</button><button id="download-selected" class="hidden rounded-xl bg-[#654534] px-4 py-2 text-sm text-white">${locale === "el" ? "Λήψη επιλεγμένων" : "Download selected"}</button></div></div>${items.length ? `<div class="grid grid-cols-2 gap-4 md:grid-cols-3">${cards(items, { selectable: true, deferredSelection: true, lightbox: true, reportCode: event.code, locale })}</div>` : `<p class="py-12 text-center text-[#625750]">${locale === "el" ? "Γίνε ο πρώτος που θα ανεβάσει μια στιγμή!" : "Be the first to upload a moment!"}</p>`}</section></main>${galleryFilterScript(items, "guest-gallery")}${lightboxMarkup(locale)}${selectionScript}`,
    ),
  );
});

galleryRoutes.get("/gallery/:code/official", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  const locale = normalizeLocale(c.req.query("lang") ?? event.default_locale);
  if (Date.now() > event.expires_at) return c.text("Event expired", 410);
  if (!(await hasGalleryAccess(c.req.raw, event)))
    return c.redirect(`/gallery/${event.code}?lang=${locale}`);
  const items = await c.env.DB.prepare(
    `SELECT m.* FROM official_album_items o JOIN media m ON m.id=o.media_id WHERE o.event_id=? AND m.deleted_at IS NULL AND m.reported_at IS NULL ORDER BY o.position,o.created_at`,
  )
    .bind(event.id)
    .all<MediaRow>();
  return c.html(
    page(
      `${event.eventName} – Official album`,
      `<main class="mx-auto max-w-6xl p-5 md:p-10"><header class="flex items-center justify-between">${brandMark("/", true)}<a href="/gallery/${event.code}?lang=${locale}" class="rounded-xl border px-4 py-2">← Gallery</a></header><section class="mt-6 rounded-3xl bg-white p-7 shadow-lg"><p class="text-xs uppercase tracking-[.2em] text-[#6e4f3e]">Memboux Studio</p><h1 class="mt-2 text-4xl">${locale === "el" ? "Official album" : "Official album"}</h1><p class="mt-2 text-[#625750]">${esc(event.eventName)}</p><div class="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">${items.results.length ? cards(items.results, { lightbox: true, locale }) : `<p class="col-span-full py-12 text-center text-[#625750]">${locale === "el" ? "Το official album ετοιμάζεται." : "The official album is being prepared."}</p>`}</div></section></main>${lightboxMarkup(locale)}`,
    ),
  );
});

galleryRoutes.get("/gallery/:code/removal/:mediaId", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if (!(await hasGalleryAccess(c.req.raw, event)))
    return c.text("Gallery PIN required", 401);
  const media = await c.env.DB.prepare(
    "SELECT id FROM media WHERE id=? AND event_id=? AND deleted_at IS NULL",
  )
    .bind(c.req.param("mediaId"), event.id)
    .first();
  if (!media) return c.text("Media not found", 404);

  return c.html(
    page(
      "Request removal",
      `<main class="mx-auto flex min-h-screen max-w-xl items-center p-5"><section class="w-full rounded-3xl bg-white p-7 shadow-xl">${brandMark("/", true)}<p class="mt-7 text-xs uppercase tracking-[.2em] text-[#6e4f3e]">Privacy request</p><h1 class="mt-2 text-4xl">Request photo removal</h1><p class="mt-3 text-[#625750]">Use this form if you appear in this content or believe it infringes your privacy or rights. The event owner will receive the request for review.</p><form action="/gallery/${encodeURIComponent(event.code)}/removal/${encodeURIComponent(c.req.param("mediaId"))}" method="post" class="mt-6 space-y-4"><label class="block">Email<input name="email" type="email" required maxlength="254" class="mt-1 w-full rounded-xl border px-4 py-3"></label><label class="block">Reason<textarea name="reason" required minlength="10" maxlength="1000" rows="5" class="mt-1 w-full rounded-xl border px-4 py-3"></textarea></label><button class="w-full rounded-xl bg-[#654534] px-5 py-3 text-white">Submit removal request</button></form></section></main>`,
    ),
  );
});

galleryRoutes.post("/gallery/:code/removal/:mediaId", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if (!(await hasGalleryAccess(c.req.raw, event)))
    return c.text("Gallery PIN required", 401);
  const media = await c.env.DB.prepare(
    "SELECT id FROM media WHERE id=? AND event_id=? AND deleted_at IS NULL",
  )
    .bind(c.req.param("mediaId"), event.id)
    .first();
  if (!media) return c.text("Media not found", 404);

  const reportLimit = await consumeRateLimit(c.env.DB, c.req.raw, c.env.BETTER_AUTH_SECRET, {
    scope: `removal-report:${event.code}`,
    limit: 5,
    windowMs: 60 * 60_000,
  });
  if (!reportLimit.allowed) return tooManyRequests(reportLimit);

  const body = await c.req.parseBody();
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 254);
  const reason = String(body.reason ?? "").trim().slice(0, 1000);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || reason.length < 10)
    return c.text("Check your email and reason.", 400);

  const reportedAt = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO media_removal_requests (id,media_id,event_id,requester_email,reason,status,created_at) VALUES (?,?,?,?,?,'pending',?)",
    ).bind(crypto.randomUUID(), c.req.param("mediaId"), event.id, email, reason, reportedAt),
    c.env.DB.prepare("UPDATE media SET reported_at=? WHERE id=? AND event_id=? AND deleted_at IS NULL").bind(reportedAt, c.req.param("mediaId"), event.id),
  ]);

  return c.html(
    page(
      "Request received",
      `<main class="flex min-h-screen items-center justify-center p-5"><section class="max-w-lg rounded-3xl bg-white p-8 text-center shadow-xl"><h1 class="text-4xl">Request received</h1><p class="mt-3 text-[#625750]">Your removal request was recorded and will be reviewed by the event owner.</p><a href="/gallery/${encodeURIComponent(event.code)}" class="mt-6 inline-block rounded-xl bg-[#654534] px-5 py-3 text-white">Back to gallery</a></section></main>`,
    ),
  );
});

galleryRoutes.post("/api/upload/:code", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Η εκδήλωση δεν βρέθηκε.", 404);
  if (Date.now() > event.expires_at) return c.text("Η εκδήλωση έχει λήξει.", 410);
  if (!(await hasGalleryAccess(c.req.raw, event)))
    return c.text("Gallery PIN required", 401);

  const uploadLimit = await consumeRateLimit(c.env.DB, c.req.raw, c.env.BETTER_AUTH_SECRET, {
    scope: `gallery-upload:${event.code}`,
    limit: 30,
    windowMs: 60 * 60_000,
  });
  if (!uploadLimit.allowed) return tooManyRequests(uploadLimit);

  const form = await c.req.formData();
  const locale = normalizeLocale(String(form.get("locale") ?? event.default_locale));
  if (form.get("upload_confirmation") !== "accepted")
    return c.text("Απαιτείται επιβεβαίωση πριν από το upload.", 400);

  const uploadedBy = String(form.get("name") ?? "Ανώνυμος").trim().slice(0, 60) || "Ανώνυμος";
  const files = form.getAll("file").filter((value): value is File => value instanceof File && value.size > 0);
  const validationError = validateUploadFiles(files);
  if (validationError) {
    const detail = uploadValidationDetails(validationError, locale);
    return new Response(detail.message, { status: detail.status });
  }

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
        await c.env.DB.prepare("SELECT 1 FROM media WHERE event_id=? AND content_hash=? AND deleted_at IS NULL")
          .bind(event.id, contentHash)
          .first()
      ) {
        continue;
      }

      const reservation = await reserveStorageForEvent(c.env.DB, event.id, file.size);
      if (!reservation.allowed) throw new Error("storage_quota_exceeded");
      reservationOwner = reservation.ownerId;
      reservedBytes += file.size;

      let capturedAt: number | null = null;
      if (file.type.startsWith("image/")) {
        try {
          const metadata = await parseMetadata(bytes, ["DateTimeOriginal", "CreateDate", "ModifyDate"]);
          const value = metadata?.DateTimeOriginal ?? metadata?.CreateDate ?? metadata?.ModifyDate;
          const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
          if (Number.isFinite(parsed) && parsed > 0 && parsed <= Date.now() + 86400000) capturedAt = parsed;
        } catch {
          /* No readable metadata. */
        }
      }

      await c.env.MEDIA.put(objectKey, bytes, {
        httpMetadata: { contentType: file.type, cacheControl: "private, no-store" },
      });
      uploadedKeys.push(objectKey);
      const uploadedAt = Date.now();
      await c.env.DB.prepare(
        "INSERT INTO media (id,event_id,object_key,media_type,content_type,uploaded_by,uploaded_at,captured_at,content_hash,size_bytes,title,upload_consent_at,upload_policy_version) VALUES (?,?,?,?,?,?,?,?,?,?,NULL,?,?)",
      ).bind(
        id,
        event.id,
        objectKey,
        file.type.startsWith("image/") ? "image" : "video",
        file.type,
        uploadedBy,
        uploadedAt,
        capturedAt,
        contentHash,
        file.size,
        uploadedAt,
        GUEST_UPLOAD_POLICY_VERSION,
      ).run();
    }
  } catch (error) {
    if (uploadedKeys.length) await c.env.MEDIA.delete(uploadedKeys);
    if (uploadedKeys.length)
      await c.env.DB.batch(uploadedKeys.map((key) => c.env.DB.prepare("DELETE FROM media WHERE object_key=?").bind(key)));
    await releaseStorage(c.env.DB, reservationOwner, reservedBytes);
    if (error instanceof Error && error.message.includes("storage_quota_exceeded"))
      return c.text(locale === "el" ? "Το όριο χώρου του event συμπληρώθηκε." : "The event storage quota was reached.", 413);
    throw error;
  }

  return c.redirect(`/gallery/${event.code}?lang=${locale}`, 303);
});

galleryRoutes.get("/media/:id", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT m.object_key,m.content_type,m.media_type,m.captured_at,m.uploaded_at,m.event_id,e.code,e.gallery_pin_hash FROM media m JOIN events e ON e.id=m.event_id WHERE m.id=? AND m.deleted_at IS NULL AND m.reported_at IS NULL AND e.deleted_at IS NULL",
  )
    .bind(c.req.param("id"))
    .first<{
      object_key: string;
      content_type: string;
      media_type: "image" | "video";
      captured_at: number | null;
      uploaded_at: number;
      event_id: string;
      code: string;
      gallery_pin_hash: string | null;
    }>();
  if (!row) return c.text("Το αρχείο δεν βρέθηκε.", 404);

  if (row.gallery_pin_hash) {
    const expected = await sha256(`gallery-access:${row.event_id}:${row.gallery_pin_hash}`);
    if (!constantTimeEqual(cookieValue(c.req.raw, galleryCookieName(row.code)) ?? "", expected)) {
      const user = await currentUser(c);
      if (!user || !roleCan(await getEventRole(c.env.DB, row.event_id, user.id), "view"))
        return c.text("Private media", 401);
    }
  }

  const object = await c.env.MEDIA.get(row.object_key);
  if (!object) return c.text("Το αρχείο δεν βρέθηκε.", 404);

  const headers = new Headers({
    "Content-Type": row.content_type,
    "Cache-Control": "private, no-store",
    ETag: object.httpEtag,
    "X-Content-Type-Options": "nosniff",
  });

  if (c.req.query("download") === "1") {
    const extension =
      row.content_type.split("/")[1]?.replace("jpeg", "jpg").replace("quicktime", "mov") ||
      (row.media_type === "image" ? "jpg" : "mp4");
    const date = new Date(row.captured_at ?? row.uploaded_at).toISOString().slice(0, 10);
    headers.set("Content-Disposition", `attachment; filename="memboux-${date}.${extension}"`);
  }

  return new Response(object.body, { headers });
});
