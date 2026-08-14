import { Hono } from "hono";
import QRCode from "qrcode";
import type { Context } from "hono";
import { getEventRole, roleCan } from "../access";
import { sendEmail } from "../auth";
import { TRASH_RETENTION_MS } from "../config";
import type { Bindings, EventInvitationRow, EventMemberRow } from "../domain";
import { changeEventPersonRole, changePendingInvitationRole, normalizeManagedEventRole, normalizePendingManagedEventRole, removeEventPersonAccess } from "../event-people";
import { resolveEventCover } from "../event-cover";
import { eventTypeLabel, isEventType, normalizeEventType } from "../event-types";
import { changeEventType } from "../event-type-transitions";
import { eventAccessAllows, eventMediaUsage, eventOfficialAlbumEnabled, getEventAccess } from "../event-access";
import { normalizeLocale, type Locale } from "../i18n";
import { createInvitationToken, createOrReplaceInvitation, hashInvitationToken, normalizeInviteRole } from "../invitations";
import { countGalleryMedia, existingMediaLikeVisitor, getGalleryMediaWithLikes, mediaLikeActorKey } from "../media-likes";
import { listEventAlbums } from "../event-media-hub";
import { PlaceInputError, resolveEventPlaceInput } from "../places";
import { canInviteToEvent } from "../quotas";
import { commerceLaunchReady, eventProducts, getCommerceLaunchSettings, type CommerceOrder } from "../commerce";
import { getEvent } from "../repositories";
import { currentUser } from "../session";
import { canManageOfficialAlbum } from "../studio";
import { esc, formatEventDates, sha256, validEventDate } from "../utils";
import { renderEventWorkspace } from "../views/event-workspace";
import { cards } from "../views/media";
import { accountHeader, eventHeader, logoutScript, page } from "../views/shared";
import type { EventWorkspaceSection } from "../views/event-workspace-shell";
import { buildEventArchive, EVENT_ARCHIVE_MAX_BYTES, parseEventArchive, restoreEventArchiveStatements } from "../event-archive";
import { releaseOwnedEvent, reserveOwnedEvent } from "../quotas";

export const eventRoutes = new Hono<{ Bindings: Bindings }>();

const EVENT_MEDIA_PAGE_SIZE = 24;

const archiveEventCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (value) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[value % 32]).join("");

export function eventInvitationInstruction(existingUser: boolean, locale: Locale) {
  return existingUser
    ? (locale === "el" ? "Συνδέσου και αποδέξου την πρόσκληση." : "Sign in and accept the invitation.")
    : (locale === "el" ? "Δημιούργησε λογαριασμό με αυτό το email και αποδέξου την πρόσκληση." : "Create an account with this email and accept the invitation.");
}

async function eventDashboard(
  c: Context<{ Bindings: Bindings }>,
  activeSection: EventWorkspaceSection = "overview",
) {
  const locale = normalizeLocale(c.req.query("lang") ?? "en");
  const event = await getEvent(c.env.DB, c.req.param("code") ?? "");
  if (!event) return c.text(locale === "el" ? "Το event δεν βρέθηκε." : "Event not found.", 404);
  const user = await currentUser(c);
  if (!user) return c.redirect(`/${locale}/login`);
  const membership = await getEventRole(c.env.DB, event.id, user.id);
  if (!membership) return c.text("Forbidden", 403);
  const ownerOnlySections = new Set<EventWorkspaceSection>(["website", "guests", "menu", "team"]);
  if (ownerOnlySections.has(activeSection) && membership !== "owner") return c.text("Forbidden", 403);
  if (activeSection === "menu" && event.event_type !== "wedding")
    return c.text(locale === "el" ? "Το μενού δεν είναι διαθέσιμο για αυτό το event." : "Menu tools are not available for this event.", 404);

  const canManageEvent = roleCan(membership, "manage_event");
  const likeVisitor = existingMediaLikeVisitor(c.req.raw);
  const likeActorKey = likeVisitor
    ? await mediaLikeActorKey(c.env.BETTER_AUTH_SECRET, likeVisitor)
    : "";
  const [items, galleryCount, membersResult, invitationsResult, removalResult, cover, eventAccess, mediaUsage, weddingState, commerceProducts, draftOrder, commerceSettings, albums, googleDriveConnection] = await Promise.all([
    getGalleryMediaWithLikes(c.env.DB, event.id, likeActorKey, { limit: EVENT_MEDIA_PAGE_SIZE }),
    countGalleryMedia(c.env.DB, event.id),
    canManageEvent
      ? c.env.DB.prepare(`SELECT * FROM (
          SELECT em.user_id,u.name,u.email,em.role,em.created_at,NULL access_status
          FROM event_members em JOIN "user" u ON u.id=em.user_id
          WHERE em.event_id=? AND NOT EXISTS (
            SELECT 1 FROM event_professional_assignments a
            WHERE a.event_id=em.event_id AND a.professional_user_id=em.user_id AND a.status!='revoked'
          )
          UNION ALL
          SELECT a.professional_user_id user_id,u.name,u.email,'professional' role,a.created_at,a.status access_status
          FROM event_professional_assignments a JOIN "user" u ON u.id=a.professional_user_id
          WHERE a.event_id=? AND a.status!='revoked'
        ) ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'professional' THEN 1 ELSE 2 END,created_at`)
        .bind(event.id, event.id).all<EventMemberRow>()
      : Promise.resolve({ results: [] as EventMemberRow[] }),
    canManageEvent
      ? c.env.DB.prepare("SELECT id,event_id,email,role,invitation_kind,created_at,expires_at,accepted_at,declined_at FROM event_invitations WHERE event_id=? AND accepted_at IS NULL AND declined_at IS NULL AND expires_at>? ORDER BY created_at DESC").bind(event.id, Date.now()).all<EventInvitationRow>()
      : Promise.resolve({ results: [] as EventInvitationRow[] }),
    canManageEvent
      ? c.env.DB.prepare("SELECT rr.id,rr.media_id,rr.requester_email,rr.reason,rr.created_at FROM media_removal_requests rr WHERE rr.event_id=? AND rr.status='pending' ORDER BY rr.created_at DESC").bind(event.id).all<{ id: string; media_id: string; requester_email: string; reason: string; created_at: number }>()
      : Promise.resolve({ results: [] as { id: string; media_id: string; requester_email: string; reason: string; created_at: number }[] }),
    resolveEventCover(c.env.DB, event.id),
    getEventAccess(c.env.DB, event.id),
    eventMediaUsage(c.env.DB, event.id),
    event.event_type === "wedding"
      ? c.env.DB.prepare("SELECT wizard_completed_at,publish_status,estimated_total_minor,currency FROM event_wedding_profiles WHERE event_id=?")
        .bind(event.id).first<{ wizard_completed_at: number | null; publish_status: "draft" | "published"; estimated_total_minor: number; currency: string }>()
      : Promise.resolve(null),
    canManageEvent ? eventProducts(c.env.DB) : Promise.resolve([]),
    canManageEvent
      ? c.env.DB.prepare(`SELECT o.*,i.product_key FROM commerce_orders o
          LEFT JOIN commerce_order_items i ON i.order_id=o.id
          WHERE o.user_id=? AND o.event_id=? AND o.status='draft' LIMIT 1`)
        .bind(user.id, event.id).first<CommerceOrder & { product_key: string | null }>()
      : Promise.resolve(null),
    canManageEvent ? getCommerceLaunchSettings(c.env.DB) : Promise.resolve(null),
    canManageEvent ? listEventAlbums(c.env.DB, event.id) : Promise.resolve([]),
    canManageEvent
      ? c.env.DB.prepare("SELECT 1 connected FROM cloud_connections WHERE user_id=? AND provider='google_drive'").bind(user.id).first<{ connected: number }>()
      : Promise.resolve(null),
  ]);
  const origin = new URL(c.req.url).origin;
  const guestUrl = `${origin}/gallery/${event.code}`;
  const officialUrl = `${origin}/gallery/${event.code}/official`;
  const weddingUrl = event.event_type === "wedding" ? `${origin}/wedding/${event.code}` : null;
  const qrOptions = { type: "svg" as const, width: 220, margin: 1, errorCorrectionLevel: "M" as const };
  const [guestQrSvg, officialQrSvg, weddingQrSvg] = await Promise.all([
    QRCode.toString(guestUrl, qrOptions),
    QRCode.toString(`${officialUrl}?lang=${locale}`, qrOptions),
    weddingUrl ? QRCode.toString(`${weddingUrl}?lang=${locale}`, qrOptions) : Promise.resolve(null),
  ]);
  const responsiveQr = (svg: string) => svg.replace("<svg", '<svg class="block h-auto w-full max-w-full"');
  const albumShares = await Promise.all(albums.map(async (album) => {
    const url = `${origin}/gallery/${encodeURIComponent(event.code)}/albums/${encodeURIComponent(album.slug)}?source=qr`;
    return { id: album.id, name: album.name, url, qrSvg: responsiveQr(await QRCode.toString(url, qrOptions)) };
  }));

  return c.html(renderEventWorkspace({
    locale,
    event,
    user,
    membership,
    items,
    members: membersResult.results,
    invitations: invitationsResult.results,
    removalRequests: removalResult.results,
    guestUrl,
    officialUrl,
    weddingUrl,
    guestQrSvg: responsiveQr(guestQrSvg),
    officialQrSvg: responsiveQr(officialQrSvg),
    weddingQrSvg: weddingQrSvg ? responsiveQr(weddingQrSvg) : null,
    officialAlbumEnabled: eventOfficialAlbumEnabled(eventAccess),
    albumShares,
    coverSourceMediaId: cover?.automatic ? null : cover?.source_media_id ?? null,
    coverUpdatedAt: cover?.updated_at ?? null,
    activeSection,
    eventAccess,
    mediaUsageTotal: mediaUsage.total,
    mediaGalleryCount: galleryCount,
    weddingState,
    commerceProducts,
    selectedProductKey: eventAccess.plan_key ?? draftOrder?.product_key ?? null,
    commerceLaunchReady: commerceSettings ? commerceLaunchReady(commerceSettings) : false,
    googleDriveConnected: Boolean(googleDriveConnection),
  }));
}

eventRoutes.get("/dashboard/:code", (c) => eventDashboard(c));
eventRoutes.get("/dashboard/:code/website", (c) => eventDashboard(c, "website"));
eventRoutes.get("/dashboard/:code/guests", (c) => eventDashboard(c, "guests"));
eventRoutes.get("/dashboard/:code/media", (c) => eventDashboard(c, "media"));
eventRoutes.get("/dashboard/:code/menu", (c) => eventDashboard(c, "menu"));
eventRoutes.get("/dashboard/:code/share", (c) => eventDashboard(c, "share"));
eventRoutes.get("/dashboard/:code/team", (c) => eventDashboard(c, "team"));
eventRoutes.get("/dashboard/:code/manage", (c) => eventDashboard(c));

eventRoutes.get("/dashboard/:code/archive", async (c) => {
  const locale = normalizeLocale(c.req.query("lang") ?? "en");
  const user = await currentUser(c);
  if (!user) return c.redirect(`/${locale}/login`);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if ((await getEventRole(c.env.DB, event.id, user.id)) !== "owner") return c.text("Forbidden", 403);
  const el = locale === "el";
  return c.html(page(el ? "Event Archive" : "Event Archive", `${eventHeader(locale, user, "")}<main class="mx-auto max-w-4xl p-5 md:p-10"><a href="/dashboard/${event.code}?lang=${locale}#event-protection-title" class="text-sm font-bold text-violet-700">← ${el ? "Πίσω στο event" : "Back to event"}</a><section class="mt-6 rounded-[2rem] border border-[#e5dff0] bg-white p-6 shadow-sm sm:p-9"><p class="text-xs font-bold uppercase tracking-[.18em] text-violet-700">Memboux Event Archive</p><h1 class="mt-3 text-4xl text-[#2b174d]">${esc(event.eventName)}</h1><p class="mt-4 max-w-2xl text-sm leading-7 text-[#6f657c]">${el ? "Κατέβασε ένα φορητό, versioned αρχείο με τη δομή, τα albums, το design, τις ρυθμίσεις, το μενού και τον προγραμματισμό καλεσμένων. Μπορείς να το εισαγάγεις αργότερα ως νέο ιδιωτικό event." : "Download a portable, versioned archive containing structure, albums, design, settings, menu, and guest planning. You can import it later as a new private event."}</p><div class="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>${el ? "Σημαντικό:" : "Important:"}</strong> ${el ? "Τα μεγάλα πρωτότυπα αρχεία δεν ενσωματώνονται στο JSON. Για πλήρη προστασία χρησιμοποίησε παράλληλα Google Drive backup ή ZIP originals. Πακέτα, δικαιώματα χρηστών, PIN και μυστικά δεν αντιγράφονται για λόγους ασφαλείας." : "Large original files are not embedded in the JSON. For complete protection, also use Google Drive backup or an originals ZIP. Packages, user permissions, PINs, and secrets are never copied for security."}</div><div class="mt-6 flex flex-wrap gap-3"><a href="/api/account/events/${event.code}/archive" download class="rounded-xl bg-[#2b174d] px-5 py-3 font-bold text-white">${el ? "Λήψη .memboux.json" : "Download .memboux.json"}</a><a href="/${locale}/event-archive" class="rounded-xl border border-[#d9caeb] px-5 py-3 font-bold text-violet-700">${el ? "Εισαγωγή archive" : "Import archive"}</a></div></section></main>${logoutScript(locale)}`, { locale }));
});

eventRoutes.get("/api/account/events/:code/archive", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if ((await getEventRole(c.env.DB, event.id, user.id)) !== "owner") return c.text("Forbidden", 403);
  const archive = await buildEventArchive(c.env.DB, event);
  const safeName = event.eventName.normalize("NFKD").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "event";
  return new Response(JSON.stringify(archive, null, 2), { headers: {
    "Content-Type": "application/vnd.memboux.event+json; charset=utf-8",
    "Content-Disposition": `attachment; filename="${safeName}.memboux.json"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  }});
});

eventRoutes.get("/:locale{el|en|fr|de|es|it}/event-archive", async (c) => {
  const locale = normalizeLocale(c.req.param("locale"));
  const user = await currentUser(c);
  if (!user) return c.redirect(`/${locale}/login`);
  const el = locale === "el";
  return c.html(page("Event Archive", `${accountHeader(locale, user)}<main class="mx-auto max-w-3xl p-5 md:p-10"><a href="/${locale}/account" class="text-sm font-bold text-violet-700">← ${el ? "Τα events μου" : "My events"}</a><section class="mt-6 rounded-[2rem] border border-[#e5dff0] bg-white p-6 shadow-sm sm:p-9"><p class="text-xs font-bold uppercase tracking-[.18em] text-violet-700">Memboux Event Archive</p><h1 class="mt-3 text-4xl text-[#2b174d]">${el ? "Επαναφορά event" : "Restore an event"}</h1><p class="mt-3 text-sm leading-7 text-[#6f657c]">${el ? "Επίλεξε το .memboux.json που είχες κατεβάσει. Θα δημιουργηθεί νέο ιδιωτικό event με νέο κωδικό. Δεν επαναφέρονται πληρωμές, ρόλοι, PIN ή μυστικά." : "Choose a previously downloaded .memboux.json file. A new private event with a new code will be created. Payments, roles, PINs, and secrets are not restored."}</p><form action="/api/account/event-archives/import" method="post" enctype="multipart/form-data" class="mt-6 space-y-4"><input type="hidden" name="locale" value="${locale}"><input name="archive" type="file" required accept=".json,.memboux.json,application/json,application/vnd.memboux.event+json" class="w-full rounded-xl border border-[#ddd4eb] bg-white p-3"><button class="w-full rounded-xl bg-[#2b174d] px-5 py-3.5 font-bold text-white">${el ? "Δημιουργία από archive" : "Create from archive"}</button></form></section></main>${logoutScript(locale)}`, { locale }));
});

eventRoutes.post("/api/account/event-archives/import", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? "en"));
  const file = body.archive;
  if (!(file instanceof File) || file.size <= 0 || file.size > EVENT_ARCHIVE_MAX_BYTES)
    return c.text(locale === "el" ? "Το archive δεν είναι έγκυρο ή είναι πολύ μεγάλο." : "The archive is invalid or too large.", 400);
  let archive;
  try { archive = parseEventArchive(JSON.parse(await file.text())); } catch { archive = null; }
  if (!archive) return c.text(locale === "el" ? "Μη υποστηριζόμενο Event Archive." : "Unsupported Event Archive.", 400);
  if (archive.data.albums.length > 5) return c.text(locale === "el"
    ? "Το archive περιέχει περισσότερα από 5 custom albums και δεν αντιστοιχεί σε διαθέσιμο πακέτο."
    : "The archive contains more than 5 custom albums and does not fit an available package.", 409);
  if (!await reserveOwnedEvent(c.env.DB, user.id)) return c.text(locale === "el" ? "Έφτασες το όριο events του λογαριασμού." : "Your account event limit has been reached.", 409);
  const now = Date.now();
  const eventId = crypto.randomUUID();
  let code = "";
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      code = archiveEventCode();
      if (!await getEvent(c.env.DB, code, true)) break;
      code = "";
    }
    if (!code) throw new Error("archive_event_code_exhausted");
    const restoredLocale = normalizeLocale(String(archive.event.default_locale ?? locale));
    const restoredType = isEventType(archive.event.event_type) ? archive.event.event_type : "other";
    const name = String(archive.event.eventName).trim().slice(0, 100);
    const start = validEventDate(archive.event.event_start_date) ?? new Date(now).toISOString().slice(0, 10);
    const end = validEventDate(archive.event.event_end_date) ?? start;
    const tokenHash = await sha256(crypto.randomUUID() + crypto.randomUUID());
    const statements = [
      c.env.DB.prepare(`INSERT INTO events (id,code,couple,eventName,admin_token_hash,created_at,expires_at,status,notes,updated_at,default_locale,event_start_date,event_end_date,event_type,location,location_place_id,location_lat,location_lng,location_provider) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(eventId, code, name, name, tokenHash, now, now + 365 * 86400000, "active", String(archive.event.notes ?? "").slice(0, 2000), now, restoredLocale, start, end, restoredType, archive.event.location ?? null, archive.event.location_place_id ?? null, archive.event.location_lat ?? null, archive.event.location_lng ?? null, archive.event.location_provider ?? null),
      c.env.DB.prepare("INSERT INTO event_members (event_id,user_id,role,created_at) VALUES (?,?,?,?)").bind(eventId, user.id, "owner", now),
      c.env.DB.prepare(`INSERT INTO event_access (event_id,access_state,enforcement_state,plan_key,media_limit,media_uploads_consumed,guest_access_enabled,guest_uploads_enabled,original_downloads_enabled,created_at,updated_at,album_limit,upload_window_days) VALUES (?,'preview','enforced',NULL,50,0,0,0,0,?,?,?,14)`).bind(eventId, now, now, Math.max(1, Math.min(5, archive.data.albums.length))),
      ...restoreEventArchiveStatements(c.env.DB, archive, eventId, user.id, now),
    ];
    await c.env.DB.batch(statements);
    console.log(JSON.stringify({ event: "event_archive_imported", eventId, userId: user.id, version: archive.version }));
    return c.redirect(`/dashboard/${code}?lang=${locale}&archive=restored#overview`, 303);
  } catch (error) {
    await releaseOwnedEvent(c.env.DB, user.id).catch(() => undefined);
    console.error(JSON.stringify({ event: "event_archive_import_failed", userId: user.id, error: error instanceof Error ? error.message.slice(0, 300) : "unknown" }));
    return c.text(locale === "el" ? "Η επαναφορά απέτυχε. Το archive δεν άλλαξε." : "Restore failed. The archive was not changed.", 500);
  }
});

eventRoutes.get("/api/account/events/:code/media-page", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.json({ message: "Event not found" }, 404);
  const user = await currentUser(c);
  if (!user) return c.json({ message: "Authentication required" }, 401);
  const membership = await getEventRole(c.env.DB, event.id, user.id);
  if (!membership || !roleCan(membership, "view")) return c.json({ message: "Forbidden" }, 403);

  const offset = Math.max(0, Math.min(100_000, Number.parseInt(c.req.query("offset") ?? "0", 10) || 0));
  const limit = Math.max(1, Math.min(EVENT_MEDIA_PAGE_SIZE, Number.parseInt(c.req.query("limit") ?? String(EVENT_MEDIA_PAGE_SIZE), 10) || EVENT_MEDIA_PAGE_SIZE));
  const requestedSort = c.req.query("sort");
  const sort = requestedSort === "latest" || requestedSort === "oldest" || requestedSort === "rating"
    ? requestedSort
    : "chronology";
  const locale = normalizeLocale(c.req.query("lang") ?? event.default_locale);
  const likeVisitor = existingMediaLikeVisitor(c.req.raw);
  const likeActorKey = likeVisitor ? await mediaLikeActorKey(c.env.BETTER_AUTH_SECRET, likeVisitor) : "";
  const [items, count, cover, access] = await Promise.all([
    getGalleryMediaWithLikes(c.env.DB, event.id, likeActorKey, { limit, offset, sort }),
    countGalleryMedia(c.env.DB, event.id),
    resolveEventCover(c.env.DB, event.id),
    getEventAccess(c.env.DB, event.id),
  ]);
  const nextOffset = Math.min(count.total, offset + items.length);
  c.header("Cache-Control", "private, no-store");
  return c.json({
    html: cards(items, {
      lightbox: true,
      selectable: true,
      deferredSelection: true,
      downloads: eventAccessAllows(access, "original_downloads"),
      coverControl: roleCan(membership, "manage_event")
        ? { eventCode: event.code, locale, activeMediaId: cover?.automatic ? null : cover?.source_media_id ?? null }
        : undefined,
      trashControl: roleCan(membership, "manage_event") ? { eventCode: event.code, locale } : undefined,
    }),
    nextOffset,
    remaining: Math.max(0, count.total - nextOffset),
    total: count.total,
  });
});

eventRoutes.post("/api/account/events/:code/access/start-trial", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if (!roleCan(await getEventRole(c.env.DB, event.id, user.id), "manage_event")) return c.text("Forbidden", 403);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  return c.redirect(`/dashboard/${event.code}?lang=${locale}#package-access-title`, 303);
});

eventRoutes.get("/dashboard/:code/trial", async (c) => {
  const locale = normalizeLocale(c.req.query("lang") ?? "en");
  return c.redirect(`/dashboard/${encodeURIComponent(c.req.param("code"))}?lang=${locale}#package-access-title`, 302);
});

eventRoutes.get("/dashboard/:code/edit", async (c) => {
  const locale = normalizeLocale(c.req.query("lang") ?? "en");
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  const user = await currentUser(c);
  if (!user) return c.redirect(`/${locale}/login`);
  if (!roleCan(await getEventRole(c.env.DB, event.id, user.id), "manage_event")) return c.text("Only the event owner can edit this event", 403);
  return c.redirect(`/dashboard/${event.code}?lang=${locale}#settings`, 302);
});

eventRoutes.post("/api/account/events/:code/event-type", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if ((await getEventRole(c.env.DB, event.id, user.id)) !== "owner")
    return c.text("Only an event owner can change the event type.", 403);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  const nextType = body.eventType;
  if (!isEventType(nextType))
    return c.text(locale === "el" ? "Μη έγκυρος τύπος event." : "Invalid event type.", 400);
  const currentType = normalizeEventType(event.event_type);
  if (nextType === currentType)
    return c.redirect(`/dashboard/${event.code}?lang=${locale}#overview`, 303);
  if (String(body.confirmation ?? "") !== "change")
    return c.text(locale === "el" ? "Απαιτείται επιβεβαίωση της αλλαγής." : "Confirm the event type change.", 400);

  const result = await changeEventType(c.env.DB, {
    eventId: event.id,
    eventName: event.eventName,
    from: currentType,
    to: nextType,
    changedByUserId: user.id,
  });
  if (!result.changed)
    return c.text(locale === "el" ? "Ο τύπος event άλλαξε ήδη. Ανανέωσε τη σελίδα." : "The event type already changed. Refresh the page.", 409);
  console.log(JSON.stringify({
    event: "event_type_changed",
    eventId: event.id,
    userId: user.id,
    fromEventType: currentType,
    toEventType: nextType,
    restoredPreviousSetup: result.restored,
  }));
  const setupPath = nextType === "wedding"
    ? `/dashboard/${event.code}/wedding/setup`
    : `/dashboard/${event.code}/setup`;
  return c.redirect(`${setupPath}?lang=${locale}&typeChanged=1`, 303);
});

eventRoutes.get("/event-cover/:code", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  const membership = await getEventRole(c.env.DB, event.id, user.id);
  if (!membership && !(await canManageOfficialAlbum(c.env.DB, event.id, user.id))) return c.text("Forbidden", 403);
  const cover = await resolveEventCover(c.env.DB, event.id);
  if (!cover) return c.text("Cover not found", 404);
  const object = await c.env.MEDIA.get(cover.object_key);
  if (!object) return c.text("Cover not found", 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": cover.content_type,
      "Cache-Control": "private, max-age=3600",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "X-Memboux-Cover-Source": cover.automatic ? "automatic" : "owner",
    },
  });
});

eventRoutes.post("/api/account/events/:code/cover", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if (!roleCan(await getEventRole(c.env.DB, event.id, user.id), "manage_event")) return c.text("Forbidden", 403);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  const mediaIds = String(body.mediaId ?? "").split(",").filter(Boolean);
  if (mediaIds.length !== 1) return c.text(locale === "el" ? "Επίλεξε μία εικόνα για cover." : "Select one image for the cover.", 400);
  const media = await c.env.DB.prepare(`SELECT id,object_key,content_type FROM media
    WHERE id=? AND event_id=? AND media_type='image' AND deleted_at IS NULL AND reported_at IS NULL`)
    .bind(mediaIds[0], event.id)
    .first<{ id: string; object_key: string; content_type: string }>();
  if (!media) return c.text(locale === "el" ? "Η εικόνα δεν είναι διαθέσιμη." : "The image is unavailable.", 404);
  const source = await c.env.MEDIA.get(media.object_key);
  if (!source) return c.text("Media object not found", 404);
  const extension = media.object_key.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  const objectKey = `covers/${event.id}/${crypto.randomUUID()}.${extension}`;
  const previous = await c.env.DB.prepare("SELECT object_key FROM event_covers WHERE event_id=?")
    .bind(event.id)
    .first<{ object_key: string }>();
  await c.env.MEDIA.put(objectKey, await source.arrayBuffer(), {
    httpMetadata: { contentType: media.content_type, cacheControl: "private, max-age=3600" },
  });
  try {
    await c.env.DB.prepare(`INSERT INTO event_covers
      (event_id,source_media_id,object_key,content_type,updated_by,updated_at)
      VALUES (?,?,?,?,?,?)
      ON CONFLICT(event_id) DO UPDATE SET source_media_id=excluded.source_media_id,
        object_key=excluded.object_key,content_type=excluded.content_type,
        updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
      .bind(event.id, media.id, objectKey, media.content_type, user.id, Date.now())
      .run();
  } catch (error) {
    await c.env.MEDIA.delete(objectKey);
    throw error;
  }
  if (previous?.object_key && previous.object_key !== objectKey) {
    c.executionCtx.waitUntil(c.env.MEDIA.delete(previous.object_key));
  }
  return c.redirect(`/dashboard/${event.code}/media?lang=${locale}`, 303);
});

eventRoutes.post("/api/account/events/:code/privacy", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if (!roleCan(await getEventRole(c.env.DB, event.id, user.id), "manage_event")) return c.text("Forbidden", 403);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  const wantsJson = c.req.header("Accept")?.includes("application/json") ?? false;
  const action = String(body.action ?? "set");
  const requestedSurface = String(body.surface ?? "guest_gallery");
  const pinColumn = requestedSurface === "website"
    ? "website_pin_hash"
    : requestedSurface === "official_album"
      ? "official_album_pin_hash"
      : requestedSurface === "guest_gallery"
        ? "guest_gallery_pin_hash"
        : null;
  if (!pinColumn) {
    const message = locale === "el" ? "Μη έγκυρη περιοχή προστασίας." : "Invalid protected area.";
    return wantsJson ? c.json({ message }, 400) : c.text(message, 400);
  }
  if (requestedSurface === "website" && event.event_type !== "wedding") {
    const message = locale === "el" ? "Το PIN website είναι διαθέσιμο μόνο για γάμο." : "Website PIN is available only for weddings.";
    return wantsJson ? c.json({ message }, 400) : c.text(message, 400);
  }
  if (action !== "set" && action !== "remove") {
    const message = locale === "el" ? "Μη έγκυρη ενέργεια PIN." : "Invalid PIN action.";
    return wantsJson ? c.json({ message }, 400) : c.text(message, 400);
  }
  if (action === "remove") {
    if (pinColumn === "website_pin_hash")
      await c.env.DB.prepare("UPDATE events SET website_pin_hash=NULL,updated_at=? WHERE id=?").bind(Date.now(), event.id).run();
    else if (pinColumn === "official_album_pin_hash")
      await c.env.DB.prepare("UPDATE events SET official_album_pin_hash=NULL,updated_at=? WHERE id=?").bind(Date.now(), event.id).run();
    else
      await c.env.DB.prepare("UPDATE events SET guest_gallery_pin_hash=NULL,gallery_pin_hash=NULL,updated_at=? WHERE id=?").bind(Date.now(), event.id).run();
  } else {
    const pin = String(body.pin ?? "");
    if (!/^\d{4,8}$/.test(pin)) {
      const message = locale === "el" ? "Το PIN πρέπει να περιέχει 4–8 ψηφία." : "PIN must contain 4–8 digits.";
      return wantsJson ? c.json({ message }, 400) : c.text(message, 400);
    }
    const pinHash = await sha256(pin);
    if (pinColumn === "website_pin_hash")
      await c.env.DB.prepare("UPDATE events SET website_pin_hash=?,updated_at=? WHERE id=?").bind(pinHash, Date.now(), event.id).run();
    else if (pinColumn === "official_album_pin_hash")
      await c.env.DB.prepare("UPDATE events SET official_album_pin_hash=?,updated_at=? WHERE id=?").bind(pinHash, Date.now(), event.id).run();
    else
      await c.env.DB.prepare("UPDATE events SET guest_gallery_pin_hash=?,gallery_pin_hash=?,updated_at=? WHERE id=?").bind(pinHash, pinHash, Date.now(), event.id).run();
  }
  if (wantsJson) {
    c.header("Cache-Control", "private, no-store");
    return c.json({ enabled: action !== "remove", surface: requestedSurface });
  }
  return c.redirect(`/dashboard/${event.code}/share?lang=${locale}`, 303);
});

eventRoutes.post("/api/account/events/:code/removal/:requestId/:action{approve|dismiss}", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if (!roleCan(await getEventRole(c.env.DB, event.id, user.id), "manage_event")) return c.text("Forbidden", 403);
  const request = await c.env.DB.prepare("SELECT media_id FROM media_removal_requests WHERE id=? AND event_id=? AND status='pending'").bind(c.req.param("requestId"), event.id).first<{ media_id: string }>();
  if (!request) return c.text("Request not found", 404);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  const now = Date.now();
  if (c.req.param("action") === "approve") {
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE media SET deleted_at=?,purge_at=? WHERE id=? AND event_id=? AND deleted_at IS NULL").bind(now, now + TRASH_RETENTION_MS, request.media_id, event.id),
      c.env.DB.prepare("UPDATE media_removal_requests SET status='resolved',resolved_at=? WHERE id=?").bind(now, c.req.param("requestId")),
    ]);
  } else {
    await c.env.DB.prepare("UPDATE media_removal_requests SET status='dismissed',resolved_at=? WHERE id=?").bind(now, c.req.param("requestId")).run();
  }
  return c.redirect(`/dashboard/${event.code}/media?lang=${locale}`, 303);
});

eventRoutes.post("/api/account/events/:code/details", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if (!roleCan(await getEventRole(c.env.DB, event.id, user.id), "manage_event")) return c.text("Only the event owner can update event details", 403);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  const eventType = normalizeEventType(event.event_type);
  if (body.eventType !== undefined && (!isEventType(body.eventType) || body.eventType !== eventType)) {
    const message = locale === "el"
      ? "Το είδος event ορίζεται κατά τη δημιουργία και δεν μπορεί να αλλάξει."
      : "Event type is chosen at creation and cannot be changed.";
    return c.req.header("Accept")?.includes("application/json") ? c.json({ message }, 409) : c.text(message, 409);
  }
  const eventName = String(body.eventName ?? "").trim().slice(0, 100);
  const eventStartDate = validEventDate(body.eventStartDate);
  const eventEndDateInput = String(body.eventEndDate ?? "").trim();
  const eventEndDate = eventEndDateInput ? validEventDate(eventEndDateInput) : null;
  if (!eventName || !eventStartDate || (eventEndDateInput && !eventEndDate) || (eventEndDate && eventEndDate < eventStartDate)) {
    const message = locale === "el" ? "Έλεγξε το όνομα και τις ημερομηνίες του event." : "Check the event name and dates.";
    return c.req.header("Accept")?.includes("application/json") ? c.json({ message }, 400) : c.text(message, 400);
  }
  let eventPlace;
  try {
    eventPlace = body.location === undefined
      ? {
          location: event.location ?? null,
          location_place_id: event.location_place_id ?? null,
          location_lat: event.location_lat ?? null,
          location_lng: event.location_lng ?? null,
          location_provider: event.location_provider ?? null,
        }
      : await resolveEventPlaceInput({
          apiKey: c.env.GOOGLE_MAPS_API_KEY,
          location: body.location,
          placeId: body.locationPlaceId,
          latitude: body.locationLat,
          longitude: body.locationLng,
          clearLocation: body.clearLocation,
          sessionToken: body.locationSessionToken,
          locale,
          current: {
            location: event.location ?? null,
            location_place_id: event.location_place_id ?? null,
            location_lat: event.location_lat ?? null,
            location_lng: event.location_lng ?? null,
            location_provider: event.location_provider ?? null,
          },
        });
  } catch (error) {
    const unavailable = error instanceof PlaceInputError && error.reason === "unavailable";
    const message = unavailable
      ? (locale === "el" ? "Η υπηρεσία τοποθεσίας δεν είναι διαθέσιμη τώρα. Δοκίμασε ξανά." : "Location service is unavailable right now. Please try again.")
      : (locale === "el" ? "Επίλεξε την τοποθεσία από τα αποτελέσματα αναζήτησης." : "Choose the location from the search results.");
    return c.req.header("Accept")?.includes("application/json") ? c.json({ message }, unavailable ? 503 : 400) : c.text(message, unavailable ? 503 : 400);
  }
  await c.env.DB.prepare("UPDATE events SET eventName=?,event_start_date=?,event_end_date=?,location=?,location_place_id=?,location_lat=?,location_lng=?,location_provider=?,updated_at=? WHERE id=?")
    .bind(eventName, eventStartDate, eventEndDate, eventPlace.location, eventPlace.location_place_id, eventPlace.location_lat, eventPlace.location_lng, eventPlace.location_provider, Date.now(), event.id).run();
  if (c.req.header("Accept")?.includes("application/json")) {
    return c.json({
      eventName,
      eventType,
      eventTypeLabel: eventTypeLabel(eventType, locale),
      eventDates: formatEventDates({ event_start_date: eventStartDate, event_end_date: eventEndDate }, locale),
      eventLocation: eventPlace.location ?? "",
      eventPlaceId: eventPlace.location_place_id,
      eventCoordinates: eventPlace.location_lat === null ? null : { lat: eventPlace.location_lat, lng: eventPlace.location_lng },
    });
  }
  return c.redirect(`/dashboard/${event.code}?lang=${locale}#overview`, 303);
});

eventRoutes.post("/api/account/events/:code/invite", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if (!roleCan(await getEventRole(c.env.DB, event.id, user.id), "manage_members")) return c.text("Only the event owner can invite collaborators", 403);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  const wantsJson = c.req.header("Accept")?.includes("application/json") ?? false;
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 254);
  const requestedRole = String(body.role ?? "editor");
  const invitationKind = requestedRole === "professional" ? "professional" : "member";
  const role = invitationKind === "professional" ? "viewer" : normalizeInviteRole(requestedRole);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.text("Invalid email", 400);
  if (email === user.email.toLowerCase()) return c.text(locale === "el" ? "Είσαι ήδη ο ιδιοκτήτης αυτού του event." : "You already own this event.", 400);
  const existingUser = await c.env.DB.prepare(`SELECT id FROM "user" WHERE lower(email)=lower(?)`).bind(email).first<{ id: string }>();
  let existingMember = false;
  if (existingUser && invitationKind === "member") {
    existingMember = Boolean(await c.env.DB.prepare("SELECT 1 FROM event_members WHERE event_id=? AND user_id=?").bind(event.id, existingUser.id).first());
    if (existingMember && role !== "owner") return wantsJson
      ? c.json({ message: locale === "el" ? "Ο χρήστης έχει ήδη πρόσβαση σε αυτό το album." : "This user already has access to the album." }, 409)
      : c.redirect(`/dashboard/${event.code}/team?lang=${locale}`, 303);
  }
  if (!existingMember && !(await canInviteToEvent(c.env.DB, event.id)).allowed) return c.text(locale === "el" ? "Έφτασες το όριο συνεργατών του plan σου." : "You reached your plan collaborator limit.", 409);
  const invitationId = crypto.randomUUID();
  const invitationToken = createInvitationToken();
  const now = Date.now();
  await createOrReplaceInvitation(c.env.DB, { id: invitationId, eventId: event.id, email, role, invitationKind, invitedBy: user.id, createdAt: now, expiresAt: now + 14 * 86_400_000, tokenHash: await hashInvitationToken(invitationToken) });
  if (role === "owner") {
    console.log(JSON.stringify({
      event: "event_co_owner_invitation_created",
      eventId: event.id,
      invitedBy: user.id,
      invitationId,
    }));
  }
  const invitationUrl = `${new URL(c.req.url).origin}/invite/${encodeURIComponent(invitationToken)}?lang=${locale}`;
  const subject = locale === "el" ? `Πρόσκληση στο event ${event.eventName}` : `Invitation to ${event.eventName}`;
  const roleLabel = invitationKind === "professional"
    ? (locale === "el" ? "επίσημος φωτογράφος" : "professional photographer")
    : locale === "el"
      ? (role === "owner" ? "συνιδιοκτήτης" : role === "editor" ? "διαχειριστής" : "θεατής")
      : (role === "owner" ? "co-owner" : role === "editor" ? "manager" : "viewer");
  const invitationInstruction = eventInvitationInstruction(Boolean(existingUser), locale);
  const invitationIntro = locale === "el"
    ? `${user.name} σε προσκάλεσε ως ${roleLabel} στο ιδιωτικό album «${event.eventName}» στο Memboux. ${invitationInstruction}`
    : `${user.name} invited you as a ${roleLabel} to the private album “${event.eventName}” on Memboux. ${invitationInstruction}`;
  const accessDescription = role === "owner"
    ? (locale === "el" ? "Η αποδοχή δίνει πλήρη διαχείριση του event, των μελών και του περιεχομένου του." : "Accepting grants full control of the event, its members, and its content.")
    : (locale === "el" ? "Η πρόσκληση αφορά μόνο αυτό το album." : "This invitation only grants access to this album.");
  const text = `${invitationIntro}\n\n${invitationUrl}`;
  await sendEmail(c.env, {
    to: email,
    purpose: "event_invitation",
    subject,
    text,
    html: `<div style="font-family:Manrope,Arial,sans-serif;max-width:560px;margin:auto;color:#24143b"><h1 style="font-family:Manrope,Arial,sans-serif;font-weight:500">Memboux</h1><p>${esc(invitationIntro)}</p><p><a href="${invitationUrl}" style="display:inline-block;background:#7c3aed;color:white;padding:12px 20px;border-radius:10px;text-decoration:none">${locale === "el" ? "Προβολή πρόσκλησης" : "View invitation"}</a></p><p style="color:#6f657c;font-size:13px">${esc(accessDescription)} ${locale === "el" ? "Η πρόσκληση λήγει σε 14 ημέρες και απαιτεί λογαριασμό με το ίδιο email." : "The invitation expires in 14 days and requires an account with the same email."}</p></div>`,
  });
  if (wantsJson) {
    c.header("Cache-Control", "private, no-store");
    const invitationQrSvg = (await QRCode.toString(invitationUrl, {
      type: "svg",
      width: 240,
      margin: 1,
      errorCorrectionLevel: "M",
    })).replace("<svg", '<svg class="block h-auto w-full max-w-full" aria-label="Invitation QR code"');
    return c.json({
      status: true,
      invitationUrl,
      invitationQrSvg,
      expiresAt: now + 14 * 86_400_000,
      delivery: existingUser ? "email_and_notification" : "email",
    }, 201);
  }
  return c.redirect(`/dashboard/${event.code}/team?lang=${locale}`, 303);
});

eventRoutes.post("/api/account/events/:code/members/remove", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if (!roleCan(await getEventRole(c.env.DB, event.id, user.id), "manage_members")) return c.text("Only the event owner can remove collaborators", 403);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  const userId = String(body.userId ?? "");
  const invitationId = String(body.invitationId ?? "");
  if (userId) await removeEventPersonAccess(c.env.DB, event.id, userId, Date.now());
  if (invitationId) await c.env.DB.prepare("DELETE FROM event_invitations WHERE id=? AND event_id=?").bind(invitationId, event.id).run();
  return c.redirect(`/dashboard/${event.code}/team?lang=${locale}`, 303);
});

eventRoutes.post("/api/account/events/:code/members/role", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if (!roleCan(await getEventRole(c.env.DB, event.id, user.id), "manage_members")) return c.text("Only the event owner can change roles", 403);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  const userId = String(body.userId ?? "");
  const invitationId = String(body.invitationId ?? "");
  const role = invitationId
    ? normalizePendingManagedEventRole(body.role)
    : normalizeManagedEventRole(body.role);
  if (!role) return c.text(locale === "el" ? "Μη έγκυρος ρόλος." : "Invalid role.", 400);
  const changed = userId
    ? await changeEventPersonRole(c.env.DB, { eventId: event.id, userId, assignedBy: user.id, role: role === "owner" ? "editor" : role, now: Date.now() })
    : invitationId
      ? await changePendingInvitationRole(c.env.DB, event.id, invitationId, role)
      : false;
  if (!changed) return c.text(locale === "el" ? "Το άτομο ή η πρόσκληση δεν βρέθηκε." : "Person or invitation not found.", 404);
  return c.redirect(`/dashboard/${event.code}/team?lang=${locale}`, 303);
});
