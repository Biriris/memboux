import { Hono } from "hono";
import { parse as parseMetadata } from "exifr";
import { queueAutomaticGoogleDriveBackupsForEvent } from "../google-drive";
import { TRASH_RETENTION_MS } from "../config";
import type { Bindings, EventRow, MediaRow } from "../domain";
import { normalizeLocale } from "../i18n";
import { restoreDeletedMedia } from "../media-trash";
import { releaseStorage, reserveStorageForEvent } from "../quotas";
import { getEvent } from "../repositories";
import { currentUser } from "../session";
import {
  canManageOfficialAlbum,
  getProfessionalAssignment,
  getProfessionalProfile,
  trashProfessionalMedia,
} from "../studio";
import {
  safeFileExtension,
  uploadValidationDetails,
  validateUploadFiles,
} from "../upload-policy";
import { esc, formatDateTime, formatEventDates, sha256Bytes } from "../utils";
import { accountMenuDark, brandMark, logoutScript, page } from "../views/shared";

export const studioRoutes = new Hono<{ Bindings: Bindings }>();

const mediaIdsFromBody = (value: unknown | unknown[]) =>
  (Array.isArray(value) ? value : [value])
    .map(String)
    .filter((id) => /^[a-f0-9-]{36}$/i.test(id))
    .slice(0, 200);

studioRoutes.get("/studio", async (c) => {
  const locale = normalizeLocale(c.req.query("lang") ?? "en");
  const user = await currentUser(c);
  if (!user) return c.redirect(`/${locale}/login`);
  const profile = await getProfessionalProfile(c.env.DB, user.id);
  if (!profile)
    return c.html(
      page(
        "Memboux Studio",
        `<header class="border-b bg-[#172033] text-white"><div class="mx-auto flex max-w-5xl items-center justify-between p-5">${brandMark(`/${locale}`, true, true)}${accountMenuDark(locale, user)}</div></header><main class="mx-auto max-w-3xl p-5 md:p-10"><section class="rounded-3xl bg-white p-8 text-center shadow"><h1 class="text-4xl">Memboux Studio</h1><p class="mt-3 text-[#64748b]">${locale === "el" ? "Ο λογαριασμός σου δεν έχει ακόμη εγκεκριμένο professional profile." : "Your account does not have an approved professional profile yet."}</p></section></main>${logoutScript(locale)}`,
      ),
    );
  const assignments = await c.env.DB.prepare(
    `SELECT a.event_id,a.status AS assignment_status,a.created_at,e.code,e.eventName,e.event_start_date,e.event_end_date,e.created_at AS event_created_at,e.expires_at,e.default_locale,e.admin_token_hash,e.status AS event_status,e.notes,e.updated_at,e.gallery_pin_hash,e.deleted_at,e.purge_at FROM event_professional_assignments a JOIN events e ON e.id=a.event_id WHERE a.professional_user_id=? AND a.status!='revoked' AND e.deleted_at IS NULL ORDER BY e.event_start_date DESC`,
  )
    .bind(user.id)
    .all<
      EventRow & {
        event_id: string;
        assignment_status: "invited" | "accepted";
        event_status: "active" | "archived";
      }
    >();
  const cards = assignments.results
    .map(
      (event) =>
        `<article class="rounded-2xl border bg-white p-5 shadow-sm"><span class="rounded-full bg-[#eef2ff] px-3 py-1 text-xs uppercase">${esc(event.assignment_status)}</span><h2 class="mt-3 text-2xl">${esc(event.eventName)}</h2><p class="mt-1 text-sm text-[#4f46e5]">${esc(formatEventDates(event, locale))}</p>${event.assignment_status === "invited" ? `<form action="/studio/assignments/${encodeURIComponent(event.event_id)}/accept" method="post" class="mt-4"><input type="hidden" name="locale" value="${locale}"><button class="w-full rounded-xl bg-[#4f46e5] px-4 py-3 text-white">${locale === "el" ? "Αποδοχή ανάθεσης" : "Accept assignment"}</button></form>` : `<a href="/studio/events/${event.code}?lang=${locale}" class="mt-4 block rounded-xl bg-[#172033] px-4 py-3 text-center text-white">${locale === "el" ? "Άνοιγμα workspace" : "Open workspace"}</a>`}</article>`,
    )
    .join("");
  return c.html(
    page(
      "Memboux Studio",
      `<header class="border-b bg-[#172033] text-white"><div class="mx-auto flex max-w-6xl items-center justify-between p-5">${brandMark("/studio", true, true)}${accountMenuDark(locale, user)}</div></header><main class="mx-auto max-w-6xl p-5 md:p-10"><div class="flex flex-wrap items-end justify-between gap-4"><div><p class="text-xs uppercase tracking-[.2em] text-[#4338ca]">Professional workspace</p><h1 class="mt-2 text-4xl">${esc(profile.business_name)}</h1></div><a href="/studio/trash?lang=${locale}" class="rounded-xl border bg-white px-4 py-2 text-sm">${locale === "el" ? "Κάδος Studio" : "Studio trash"}</a></div><div class="mt-7 grid gap-4 md:grid-cols-2">${cards || `<p class="rounded-2xl bg-white p-8 text-[#64748b]">${locale === "el" ? "Δεν υπάρχουν αναθέσεις." : "No assignments yet."}</p>`}</div></main>${logoutScript(locale)}`,
    ),
  );
});

studioRoutes.post("/studio/assignments/:eventId/accept", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const profile = await getProfessionalProfile(c.env.DB, user.id);
  if (!profile || profile.status !== "active")
    return c.text("Professional profile unavailable", 403);
  const assignment = await getProfessionalAssignment(
    c.env.DB,
    c.req.param("eventId"),
    user.id,
    "invited",
  );
  if (!assignment) return c.text("Assignment not found", 404);
  await c.env.DB.prepare(
    "UPDATE event_professional_assignments SET status='accepted',accepted_at=?,updated_at=? WHERE event_id=? AND professional_user_id=? AND status='invited'",
  )
    .bind(Date.now(), Date.now(), c.req.param("eventId"), user.id)
    .run();
  const body = await c.req.parseBody();
  return c.redirect(
    `/studio?lang=${normalizeLocale(String(body.locale ?? "en"))}`,
    303,
  );
});

studioRoutes.get("/studio/media/:id", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const media = await c.env.DB.prepare(
    "SELECT object_key,content_type,event_id FROM media WHERE id=? AND deleted_at IS NULL AND reported_at IS NULL",
  )
    .bind(c.req.param("id"))
    .first<{ object_key: string; content_type: string; event_id: string }>();
  if (!media) return c.text("Media not found", 404);
  if (!(await canManageOfficialAlbum(c.env.DB, media.event_id, user.id)))
    return c.text("Forbidden", 403);
  const object = await c.env.MEDIA.get(media.object_key);
  if (!object) return c.text("Media not found", 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": media.content_type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

studioRoutes.get("/studio/events/:code", async (c) => {
  const locale = normalizeLocale(c.req.query("lang") ?? "en");
  const user = await currentUser(c);
  if (!user) return c.redirect(`/${locale}/login`);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if (!(await canManageOfficialAlbum(c.env.DB, event.id, user.id)))
    return c.text("Forbidden", 403);
  const guest = await c.env.DB.prepare(
    "SELECT * FROM media WHERE event_id=? AND origin='guest' AND deleted_at IS NULL AND reported_at IS NULL ORDER BY COALESCE(captured_at,uploaded_at)",
  )
    .bind(event.id)
    .all<MediaRow>();
  const official = await c.env.DB.prepare(
    `SELECT m.* FROM official_album_items o JOIN media m ON m.id=o.media_id WHERE o.event_id=? AND m.deleted_at IS NULL AND m.reported_at IS NULL ORDER BY o.position,o.created_at`,
  )
    .bind(event.id)
    .all<MediaRow>();
  const tile = (m: MediaRow, check = false) =>
    `<article class="relative overflow-hidden rounded-2xl border bg-white"><label class="block aspect-square cursor-pointer">${check ? `<input type="checkbox" name="ids" value="${esc(m.id)}" class="absolute left-3 top-3 z-10 h-5 w-5">` : ""}${m.media_type === "image" ? `<img src="/studio/media/${m.id}" alt="" loading="lazy" class="h-full w-full object-cover">` : `<video src="/studio/media/${m.id}" muted preload="metadata" class="h-full w-full object-cover"></video>`}</label></article>`;
  return c.html(
    page(
      `${event.eventName} – Studio`,
      `<header class="border-b bg-[#172033] text-white"><div class="mx-auto flex max-w-7xl items-center justify-between p-5">${brandMark("/studio", true, true)}${accountMenuDark(locale, user)}</div></header><main class="mx-auto max-w-7xl p-5 md:p-10"><a href="/studio?lang=${locale}" class="text-sm text-[#4f46e5]">← Studio</a><h1 class="mt-3 text-4xl">${esc(event.eventName)}</h1><p class="mt-2 text-[#64748b]">${esc(formatEventDates(event, locale))}</p><section class="mt-7 rounded-3xl bg-white p-6 shadow"><h2 class="text-2xl">${locale === "el" ? "Upload official υλικού" : "Upload official media"}</h2><form action="/studio/events/${event.code}/upload" method="post" enctype="multipart/form-data" class="mt-4 flex flex-col gap-3 sm:flex-row"><input type="hidden" name="locale" value="${locale}"><input name="file" type="file" multiple required accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" class="min-w-0 flex-1 rounded-xl border p-3"><button class="rounded-xl bg-[#4f46e5] px-5 py-3 text-white">Upload</button></form></section><section class="mt-6 rounded-3xl bg-white p-6 shadow"><h2 class="text-2xl">Official album (${official.results.length})</h2><form action="/studio/events/${event.code}/official/remove" method="post"><input type="hidden" name="locale" value="${locale}"><div class="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">${official.results.map((m) => tile(m, true)).join("") || "<p>No official selections yet.</p>"}</div>${official.results.length ? `<div class="mt-4 flex flex-wrap gap-2"><button class="rounded-xl border px-4 py-2">${locale === "el" ? "Αφαίρεση από album" : "Remove from album"}</button><button formaction="/studio/events/${event.code}/media/trash" class="rounded-xl border border-red-200 px-4 py-2 text-red-700">${locale === "el" ? "Στον κάδο (μόνο δικά μου uploads)" : "Move my uploads to trash"}</button></div>` : ""}</form></section><section class="mt-6 rounded-3xl bg-white p-6 shadow"><h2 class="text-2xl">${locale === "el" ? "Επιλογή από guest gallery" : "Curate from guest gallery"}</h2><form action="/studio/events/${event.code}/official/add" method="post"><input type="hidden" name="locale" value="${locale}"><div class="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">${guest.results.map((m) => tile(m, true)).join("") || "<p>No guest media.</p>"}</div>${guest.results.length ? `<button class="mt-4 rounded-xl bg-[#4f46e5] px-5 py-3 text-white">${locale === "el" ? "Προσθήκη επιλεγμένων" : "Add selected"}</button>` : ""}</form></section></main>${logoutScript(locale)}`,
    ),
  );
});

studioRoutes.post(
  "/studio/events/:code/official/:action{add|remove}",
  async (c) => {
    const user = await currentUser(c);
    if (!user) return c.text("Unauthorized", 401);
    const event = await getEvent(c.env.DB, c.req.param("code"));
    if (!event) return c.text("Event not found", 404);
    if (!(await canManageOfficialAlbum(c.env.DB, event.id, user.id)))
      return c.text("Forbidden", 403);
    const body = await c.req.parseBody({ all: true });
    const ids = mediaIdsFromBody(body.ids);
    if (ids.length) {
      if (c.req.param("action") === "remove")
        await c.env.DB.batch(
          ids.map((id) =>
            c.env.DB.prepare(
              "DELETE FROM official_album_items WHERE event_id=? AND media_id=?",
            ).bind(event.id, id),
          ),
        );
      else {
        const now = Date.now();
        await c.env.DB.batch(
          ids.map((id, index) =>
            c.env.DB.prepare(
              `INSERT OR IGNORE INTO official_album_items (event_id,media_id,added_by,position,created_at) SELECT ?,m.id,?,?,? FROM media m WHERE m.id=? AND m.event_id=? AND m.origin='guest' AND m.deleted_at IS NULL AND m.reported_at IS NULL`,
            ).bind(event.id, user.id, index, now, id, event.id),
          ),
        );
      }
    }
    const locale = normalizeLocale(String(body.locale ?? "en"));
    return c.redirect(`/studio/events/${event.code}?lang=${locale}`, 303);
  },
);

studioRoutes.post("/studio/events/:code/media/trash", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if (!(await canManageOfficialAlbum(c.env.DB, event.id, user.id)))
    return c.text("Forbidden", 403);
  const body = await c.req.parseBody({ all: true });
  const ids = mediaIdsFromBody(body.ids);
  const now = Date.now();
  await trashProfessionalMedia(
    c.env.DB,
    event.id,
    user.id,
    ids,
    now,
    now + TRASH_RETENTION_MS,
  );
  const locale = normalizeLocale(String(body.locale ?? "en"));
  return c.redirect(`/studio/events/${event.code}?lang=${locale}`, 303);
});

studioRoutes.get("/studio/trash/media/:id", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const media = await c.env.DB.prepare(
    `SELECT m.object_key,m.content_type
     FROM media m
     JOIN event_professional_assignments a ON a.event_id=m.event_id
     WHERE m.id=? AND m.origin='official' AND m.uploaded_by_user_id=?
       AND m.deleted_at IS NOT NULL
       AND a.professional_user_id=? AND a.status='accepted'`,
  )
    .bind(c.req.param("id"), user.id, user.id)
    .first<{ object_key: string; content_type: string }>();
  if (!media) return c.text("Media not found", 404);
  const object = await c.env.MEDIA.get(media.object_key);
  if (!object) return c.text("Media not found", 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": media.content_type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

studioRoutes.get("/studio/trash", async (c) => {
  const locale = normalizeLocale(c.req.query("lang") ?? "en");
  const user = await currentUser(c);
  if (!user) return c.redirect(`/${locale}/login`);
  const profile = await getProfessionalProfile(c.env.DB, user.id);
  if (!profile || profile.status !== "active") return c.text("Forbidden", 403);
  const media = await c.env.DB.prepare(
    `SELECT m.*,e.eventName,e.code
     FROM media m
     JOIN events e ON e.id=m.event_id
     JOIN event_professional_assignments a ON a.event_id=m.event_id
     WHERE m.origin='official' AND m.uploaded_by_user_id=?
       AND m.deleted_at IS NOT NULL
       AND a.professional_user_id=? AND a.status='accepted'
     ORDER BY m.purge_at`,
  )
    .bind(user.id, user.id)
    .all<MediaRow & { eventName: string; code: string }>();
  const tiles = media.results
    .map(
      (item) =>
        `<article class="overflow-hidden rounded-2xl border bg-white shadow-sm"><label class="relative block aspect-square cursor-pointer"><input type="checkbox" name="ids" value="${esc(item.id)}" class="absolute left-3 top-3 z-10 h-6 w-6"><span class="absolute right-3 top-3 z-10 rounded-full bg-black/70 px-3 py-1 text-xs text-white">${item.media_type === "image" ? "Image" : "Video"}</span>${item.media_type === "image" ? `<img src="/studio/trash/media/${item.id}" alt="" loading="lazy" class="h-full w-full object-cover">` : `<video src="/studio/trash/media/${item.id}" muted preload="metadata" class="h-full w-full object-cover"></video>`}</label><div class="p-4"><h2 class="truncate text-lg">${esc(item.eventName)}</h2><p class="mt-1 text-xs text-red-700">${locale === "el" ? "Οριστική διαγραφή" : "Permanent deletion"}: ${formatDateTime(item.purge_at!, locale)}</p></div></article>`,
    )
    .join("");
  return c.html(
    page(
      locale === "el" ? "Κάδος Studio" : "Studio trash",
      `<header class="border-b bg-[#172033] text-white"><div class="mx-auto flex max-w-6xl items-center justify-between p-5">${brandMark("/studio", true, true)}${accountMenuDark(locale, user)}</div></header><main class="mx-auto max-w-6xl p-5 md:p-10"><a href="/studio?lang=${locale}" class="text-sm text-[#4f46e5]">← Studio</a><h1 class="mt-3 text-4xl">${locale === "el" ? "Κάδος Studio" : "Studio trash"}</h1><p class="mt-2 text-[#64748b]">${locale === "el" ? "Τα δικά σου official uploads διατηρούνται για 30 ημέρες." : "Your official uploads are retained for 30 days."}</p><form action="/studio/trash/restore" method="post" class="mt-7"><input type="hidden" name="locale" value="${locale}"><div class="grid grid-cols-2 gap-4 md:grid-cols-4">${tiles || `<p class="col-span-full rounded-2xl bg-white p-10 text-center text-[#64748b]">${locale === "el" ? "Ο κάδος είναι άδειος." : "Trash is empty."}</p>`}</div>${media.results.length ? `<button class="mt-5 rounded-xl bg-[#4f46e5] px-5 py-3 text-white">${locale === "el" ? "Επαναφορά επιλεγμένων" : "Restore selected"}</button>` : ""}</form></main>${logoutScript(locale)}`,
    ),
  );
});

studioRoutes.post("/studio/trash/restore", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const body = await c.req.parseBody({ all: true });
  const ids = mediaIdsFromBody(body.ids);
  for (const id of ids) {
    const allowed = await c.env.DB.prepare(
      `SELECT 1 FROM media m
       JOIN event_professional_assignments a ON a.event_id=m.event_id
       WHERE m.id=? AND m.origin='official' AND m.uploaded_by_user_id=?
         AND m.deleted_at IS NOT NULL
         AND a.professional_user_id=? AND a.status='accepted'`,
    )
      .bind(id, user.id, user.id)
      .first();
    if (allowed) await restoreDeletedMedia(c.env.DB, id);
  }
  const locale = normalizeLocale(String(body.locale ?? "en"));
  return c.redirect(`/studio/trash?lang=${locale}`, 303);
});

studioRoutes.post("/studio/events/:code/upload", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if (!(await canManageOfficialAlbum(c.env.DB, event.id, user.id)))
    return c.text("Forbidden", 403);
  const form = await c.req.formData();
  const locale = normalizeLocale(String(form.get("locale") ?? "en"));
  const files = form
    .getAll("file")
    .filter((value): value is File => value instanceof File && value.size > 0);
  const validation = validateUploadFiles(files);
  if (validation) {
    const detail = uploadValidationDetails(validation, locale);
    return new Response(detail.message, { status: detail.status });
  }
  const uploadedKeys: string[] = [];
  let reservedBytes = 0;
  let reservationOwner: string | null = null;
  try {
    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const hash = await sha256Bytes(bytes);
      const existing = await c.env.DB.prepare(
        "SELECT id FROM media WHERE event_id=? AND content_hash=? AND deleted_at IS NULL AND reported_at IS NULL",
      )
        .bind(event.id, hash)
        .first<{ id: string }>();
      if (existing) {
        await c.env.DB.prepare(
          "INSERT OR IGNORE INTO official_album_items (event_id,media_id,added_by,position,created_at) VALUES (?,?,?,?,?)",
        )
          .bind(event.id, existing.id, user.id, 0, Date.now())
          .run();
        continue;
      }
      const reservation = await reserveStorageForEvent(
        c.env.DB,
        event.id,
        file.size,
      );
      if (!reservation.allowed) throw new Error("storage_quota_exceeded");
      reservationOwner = reservation.ownerId;
      reservedBytes += file.size;
      const id = crypto.randomUUID();
      const objectKey = `${event.id}/${id}.${safeFileExtension(file.name)}`;
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
      const now = Date.now();
      await c.env.DB.batch([
        c.env.DB.prepare(
          "INSERT INTO media (id,event_id,object_key,media_type,content_type,uploaded_by,uploaded_at,captured_at,content_hash,size_bytes,title,origin,uploaded_by_user_id) VALUES (?,?,?,?,?,?,?,?,?,?,NULL,'official',?)",
        ).bind(
          id,
          event.id,
          objectKey,
          file.type.startsWith("image/") ? "image" : "video",
          file.type,
          user.name,
          now,
          capturedAt,
          hash,
          file.size,
          user.id,
        ),
        c.env.DB.prepare(
          "INSERT INTO official_album_items (event_id,media_id,added_by,position,created_at) VALUES (?,?,?,?,?)",
        ).bind(event.id, id, user.id, 0, now),
      ]);
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
  if (uploadedKeys.length) {
    c.executionCtx.waitUntil(
      queueAutomaticGoogleDriveBackupsForEvent(c.env, event.id).catch((error) => {
        console.error(JSON.stringify({
          event: "drive_studio_upload_sync_failed",
          eventId: event.id,
          error: error instanceof Error ? error.message.slice(0, 300) : "unknown",
        }));
      }),
    );
  }
  return c.redirect(`/studio/events/${event.code}?lang=${locale}`, 303);
});
