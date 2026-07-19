import { Hono } from "hono";
import QRCode from "qrcode";
import { getEventRole, roleCan } from "../access";
import { sendEmail } from "../auth";
import { TRASH_RETENTION_MS } from "../config";
import type { Bindings, EventInvitationRow, EventMemberRow } from "../domain";
import { changeEventPersonRole, changePendingInvitationRole, normalizeManagedEventRole, removeEventPersonAccess } from "../event-people";
import { eventTypeLabel, isEventType, normalizeEventType } from "../event-types";
import { normalizeLocale, type Locale } from "../i18n";
import { createInvitationToken, createOrReplaceInvitation, hashInvitationToken, normalizeInviteRole } from "../invitations";
import { existingMediaLikeVisitor, getGalleryMediaWithLikes, mediaLikeActorKey } from "../media-likes";
import { PlaceInputError, resolveEventPlaceInput } from "../places";
import { canInviteToEvent } from "../quotas";
import { getEvent } from "../repositories";
import { currentUser } from "../session";
import { canManageOfficialAlbum } from "../studio";
import { esc, formatEventDates, sha256, validEventDate } from "../utils";
import { renderEventWorkspace } from "../views/event-workspace";

export const eventRoutes = new Hono<{ Bindings: Bindings }>();

export function eventInvitationInstruction(existingUser: boolean, locale: Locale) {
  return existingUser
    ? (locale === "el" ? "Συνδέσου και αποδέξου την πρόσκληση." : "Sign in and accept the invitation.")
    : (locale === "el" ? "Δημιούργησε λογαριασμό με αυτό το email και αποδέξου την πρόσκληση." : "Create an account with this email and accept the invitation.");
}

eventRoutes.get("/dashboard/:code", async (c) => {
  const locale = normalizeLocale(c.req.query("lang") ?? "en");
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text(locale === "el" ? "Το event δεν βρέθηκε." : "Event not found.", 404);
  const user = await currentUser(c);
  if (!user) return c.redirect(`/${locale}/login`);
  const membership = await getEventRole(c.env.DB, event.id, user.id);
  if (!membership) return c.text("Forbidden", 403);

  const canManageEvent = roleCan(membership, "manage_event");
  const likeVisitor = existingMediaLikeVisitor(c.req.raw);
  const likeActorKey = likeVisitor
    ? await mediaLikeActorKey(c.env.BETTER_AUTH_SECRET, likeVisitor)
    : "";
  const [items, membersResult, invitationsResult, removalResult, cover] = await Promise.all([
    getGalleryMediaWithLikes(c.env.DB, event.id, likeActorKey),
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
    c.env.DB.prepare("SELECT source_media_id,updated_at FROM event_covers WHERE event_id=?")
      .bind(event.id)
      .first<{ source_media_id: string | null; updated_at: number }>(),
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
    coverSourceMediaId: cover?.source_media_id ?? null,
    coverUpdatedAt: cover?.updated_at ?? null,
  }));
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

eventRoutes.get("/event-cover/:code", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  const membership = await getEventRole(c.env.DB, event.id, user.id);
  if (!membership && !(await canManageOfficialAlbum(c.env.DB, event.id, user.id))) return c.text("Forbidden", 403);
  const cover = await c.env.DB.prepare("SELECT object_key,content_type FROM event_covers WHERE event_id=?")
    .bind(event.id)
    .first<{ object_key: string; content_type: string }>();
  if (!cover) return c.text("Cover not found", 404);
  const object = await c.env.MEDIA.get(cover.object_key);
  if (!object) return c.text("Cover not found", 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": cover.content_type,
      "Cache-Control": "private, max-age=3600",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
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
  return c.redirect(`/dashboard/${event.code}?lang=${locale}#gallery`, 303);
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
  if (action === "remove") {
    await c.env.DB.prepare("UPDATE events SET gallery_pin_hash=NULL,updated_at=? WHERE id=?").bind(Date.now(), event.id).run();
  } else {
    const pin = String(body.pin ?? "");
    if (!/^\d{4,8}$/.test(pin)) {
      const message = locale === "el" ? "Το PIN πρέπει να περιέχει 4–8 ψηφία." : "PIN must contain 4–8 digits.";
      return wantsJson ? c.json({ message }, 400) : c.text(message, 400);
    }
    await c.env.DB.prepare("UPDATE events SET gallery_pin_hash=?,updated_at=? WHERE id=?").bind(await sha256(pin), Date.now(), event.id).run();
  }
  if (wantsJson) {
    c.header("Cache-Control", "private, no-store");
    return c.json({ enabled: action !== "remove" });
  }
  return c.redirect(`/dashboard/${event.code}?lang=${locale}#settings`, 303);
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
  return c.redirect(`/dashboard/${event.code}?lang=${locale}#requests`, 303);
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
  const eventEndDate = body.eventEndDate ? validEventDate(body.eventEndDate) : eventStartDate;
  if (!eventName || !eventStartDate || !eventEndDate || eventEndDate < eventStartDate) {
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
  if (!(await canInviteToEvent(c.env.DB, event.id)).allowed) return c.text(locale === "el" ? "Έφτασες το όριο συνεργατών του plan σου." : "You reached your plan collaborator limit.", 409);
  const existingUser = await c.env.DB.prepare(`SELECT id FROM "user" WHERE lower(email)=lower(?)`).bind(email).first<{ id: string }>();
  if (existingUser && invitationKind === "member") {
    const existingMember = await c.env.DB.prepare("SELECT 1 FROM event_members WHERE event_id=? AND user_id=?").bind(event.id, existingUser.id).first();
    if (existingMember) return wantsJson
      ? c.json({ message: locale === "el" ? "Ο χρήστης έχει ήδη πρόσβαση σε αυτό το album." : "This user already has access to the album." }, 409)
      : c.redirect(`/dashboard/${event.code}?lang=${locale}#people`, 303);
  }
  const invitationId = crypto.randomUUID();
  const invitationToken = createInvitationToken();
  const now = Date.now();
  await createOrReplaceInvitation(c.env.DB, { id: invitationId, eventId: event.id, email, role, invitationKind, invitedBy: user.id, createdAt: now, expiresAt: now + 14 * 86_400_000, tokenHash: await hashInvitationToken(invitationToken) });
  const invitationUrl = `${new URL(c.req.url).origin}/invite/${encodeURIComponent(invitationToken)}?lang=${locale}`;
  const subject = locale === "el" ? `Πρόσκληση στο event ${event.eventName}` : `Invitation to ${event.eventName}`;
  const roleLabel = invitationKind === "professional"
    ? (locale === "el" ? "επίσημος φωτογράφος" : "professional photographer")
    : locale === "el" ? (role === "editor" ? "διαχειριστής" : "θεατής") : (role === "editor" ? "manager" : "viewer");
  const invitationInstruction = eventInvitationInstruction(Boolean(existingUser), locale);
  const invitationIntro = locale === "el"
    ? `${user.name} σε προσκάλεσε ως ${roleLabel} στο ιδιωτικό album «${event.eventName}» στο Memboux. ${invitationInstruction}`
    : `${user.name} invited you as a ${roleLabel} to the private album “${event.eventName}” on Memboux. ${invitationInstruction}`;
  const text = `${invitationIntro}\n\n${invitationUrl}`;
  await sendEmail(c.env, {
    to: email,
    purpose: "event_invitation",
    subject,
    text,
    html: `<div style="font-family:Manrope,Arial,sans-serif;max-width:560px;margin:auto;color:#172d27"><h1 style="font-family:Manrope,Arial,sans-serif;font-weight:500">Memboux</h1><p>${esc(invitationIntro)}</p><p><a href="${invitationUrl}" style="display:inline-block;background:#2f6b5b;color:white;padding:12px 20px;border-radius:10px;text-decoration:none">${locale === "el" ? "Προβολή πρόσκλησης" : "View invitation"}</a></p><p style="color:#65756f;font-size:13px">${locale === "el" ? "Η πρόσκληση λήγει σε 14 ημέρες, αφορά μόνο αυτό το album και απαιτεί λογαριασμό με το ίδιο email." : "This invitation expires in 14 days, only grants access to this album, and requires an account with the same email."}</p></div>`,
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
  return c.redirect(`/dashboard/${event.code}?lang=${locale}#people`, 303);
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
  return c.redirect(`/dashboard/${event.code}?lang=${locale}#people`, 303);
});

eventRoutes.post("/api/account/events/:code/members/role", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if (!roleCan(await getEventRole(c.env.DB, event.id, user.id), "manage_members")) return c.text("Only the event owner can change roles", 403);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  const role = normalizeManagedEventRole(body.role);
  if (!role) return c.text(locale === "el" ? "Μη έγκυρος ρόλος." : "Invalid role.", 400);
  const userId = String(body.userId ?? "");
  const invitationId = String(body.invitationId ?? "");
  const changed = userId
    ? await changeEventPersonRole(c.env.DB, { eventId: event.id, userId, assignedBy: user.id, role, now: Date.now() })
    : invitationId
      ? await changePendingInvitationRole(c.env.DB, event.id, invitationId, role)
      : false;
  if (!changed) return c.text(locale === "el" ? "Το άτομο ή η πρόσκληση δεν βρέθηκε." : "Person or invitation not found.", 404);
  return c.redirect(`/dashboard/${event.code}?lang=${locale}#people`, 303);
});
