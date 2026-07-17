import { Hono } from "hono";
import QRCode from "qrcode";
import { getEventRole, roleCan } from "../access";
import { sendEmail } from "../auth";
import { TRASH_RETENTION_MS } from "../config";
import type { Bindings, EventInvitationRow, EventMemberRow } from "../domain";
import { normalizeLocale } from "../i18n";
import { createInvitationToken, createOrReplaceInvitation, hashInvitationToken, normalizeInviteRole } from "../invitations";
import { canInviteToEvent } from "../quotas";
import { getEvent, getMedia } from "../repositories";
import { currentUser } from "../session";
import { esc, sha256, validEventDate } from "../utils";
import { renderEventWorkspace } from "../views/event-workspace";

export const eventRoutes = new Hono<{ Bindings: Bindings }>();

eventRoutes.get("/dashboard/:code", async (c) => {
  const locale = normalizeLocale(c.req.query("lang") ?? "en");
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text(locale === "el" ? "Το event δεν βρέθηκε." : "Event not found.", 404);
  const user = await currentUser(c);
  if (!user) return c.redirect(`/${locale}/login`);
  const membership = await getEventRole(c.env.DB, event.id, user.id);
  if (!membership) return c.text("Forbidden", 403);

  const canManageEvent = roleCan(membership, "manage_event");
  const [items, membersResult, invitationsResult, removalResult] = await Promise.all([
    getMedia(c.env.DB, event.id),
    canManageEvent
      ? c.env.DB.prepare(`SELECT em.user_id,u.name,u.email,em.role,em.created_at FROM event_members em JOIN "user" u ON u.id=em.user_id WHERE em.event_id=? ORDER BY CASE em.role WHEN 'owner' THEN 0 ELSE 1 END,em.created_at`).bind(event.id).all<EventMemberRow>()
      : Promise.resolve({ results: [] as EventMemberRow[] }),
    canManageEvent
      ? c.env.DB.prepare("SELECT id,event_id,email,role,created_at,expires_at,accepted_at,declined_at FROM event_invitations WHERE event_id=? AND accepted_at IS NULL AND declined_at IS NULL AND expires_at>? ORDER BY created_at DESC").bind(event.id, Date.now()).all<EventInvitationRow>()
      : Promise.resolve({ results: [] as EventInvitationRow[] }),
    canManageEvent
      ? c.env.DB.prepare("SELECT rr.id,rr.media_id,rr.requester_email,rr.reason,rr.created_at FROM media_removal_requests rr WHERE rr.event_id=? AND rr.status='pending' ORDER BY rr.created_at DESC").bind(event.id).all<{ id: string; media_id: string; requester_email: string; reason: string; created_at: number }>()
      : Promise.resolve({ results: [] as { id: string; media_id: string; requester_email: string; reason: string; created_at: number }[] }),
  ]);
  const origin = new URL(c.req.url).origin;
  const guestUrl = `${origin}/gallery/${event.code}`;
  const officialUrl = `${origin}/gallery/${event.code}/official`;
  const qrOptions = { type: "svg" as const, width: 220, margin: 1, errorCorrectionLevel: "M" as const };
  const [guestQrSvg, officialQrSvg] = await Promise.all([
    QRCode.toString(guestUrl, qrOptions),
    QRCode.toString(`${officialUrl}?lang=${locale}`, qrOptions),
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
    guestQrSvg: responsiveQr(guestQrSvg),
    officialQrSvg: responsiveQr(officialQrSvg),
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

eventRoutes.post("/api/account/events/:code/privacy", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if (!roleCan(await getEventRole(c.env.DB, event.id, user.id), "manage_event")) return c.text("Forbidden", 403);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  const action = String(body.action ?? "set");
  if (action === "remove") {
    await c.env.DB.prepare("UPDATE events SET gallery_pin_hash=NULL,updated_at=? WHERE id=?").bind(Date.now(), event.id).run();
  } else {
    const pin = String(body.pin ?? "");
    if (!/^\d{4,8}$/.test(pin)) return c.text("PIN must contain 4–8 digits", 400);
    await c.env.DB.prepare("UPDATE events SET gallery_pin_hash=?,updated_at=? WHERE id=?").bind(await sha256(pin), Date.now(), event.id).run();
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
  const eventName = String(body.eventName ?? "").trim().slice(0, 100);
  const eventStartDate = validEventDate(body.eventStartDate);
  const eventEndDate = body.eventEndDate ? validEventDate(body.eventEndDate) : eventStartDate;
  if (!eventName || !eventStartDate || !eventEndDate || eventEndDate < eventStartDate) return c.text(locale === "el" ? "Έλεγξε το όνομα και τις ημερομηνίες του event." : "Check the event name and dates.", 400);
  await c.env.DB.prepare("UPDATE events SET eventName=?,event_start_date=?,event_end_date=?,updated_at=? WHERE id=?").bind(eventName, eventStartDate, eventEndDate, Date.now(), event.id).run();
  return c.redirect(`/dashboard/${event.code}?lang=${locale}#settings`, 303);
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
  const role = normalizeInviteRole(body.role);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.text("Invalid email", 400);
  if (email === user.email.toLowerCase()) return c.text(locale === "el" ? "Είσαι ήδη ο ιδιοκτήτης αυτού του event." : "You already own this event.", 400);
  if (!(await canInviteToEvent(c.env.DB, event.id)).allowed) return c.text(locale === "el" ? "Έφτασες το όριο συνεργατών του plan σου." : "You reached your plan collaborator limit.", 409);
  const existingUser = await c.env.DB.prepare(`SELECT id FROM "user" WHERE lower(email)=lower(?)`).bind(email).first<{ id: string }>();
  if (existingUser) {
    const existingMember = await c.env.DB.prepare("SELECT 1 FROM event_members WHERE event_id=? AND user_id=?").bind(event.id, existingUser.id).first();
    if (existingMember) return wantsJson
      ? c.json({ message: locale === "el" ? "Ο χρήστης έχει ήδη πρόσβαση σε αυτό το album." : "This user already has access to the album." }, 409)
      : c.redirect(`/dashboard/${event.code}?lang=${locale}#people`, 303);
  }
  const invitationId = crypto.randomUUID();
  const invitationToken = createInvitationToken();
  const now = Date.now();
  await createOrReplaceInvitation(c.env.DB, { id: invitationId, eventId: event.id, email, role, invitedBy: user.id, createdAt: now, expiresAt: now + 14 * 86_400_000, tokenHash: await hashInvitationToken(invitationToken) });
  const invitationUrl = `${new URL(c.req.url).origin}/invite/${encodeURIComponent(invitationToken)}?lang=${locale}`;
  const subject = locale === "el" ? `Πρόσκληση στο event ${event.eventName}` : `Invitation to ${event.eventName}`;
  const roleLabel = locale === "el" ? (role === "editor" ? "διαχειριστής" : "θεατής") : (role === "editor" ? "manager" : "viewer");
  const text = locale === "el"
    ? `${user.name} σε προσκάλεσε ως ${roleLabel} στο ιδιωτικό album «${event.eventName}» στο Memboux. Δημιούργησε λογαριασμό με αυτό το email και αποδέξου την πρόσκληση: ${invitationUrl}`
    : `${user.name} invited you as a ${roleLabel} to the private album “${event.eventName}” on Memboux. Create an account with this email and accept the invitation: ${invitationUrl}`;
  if (!existingUser) {
    await sendEmail(c.env, {
      to: email,
      purpose: "event_invitation",
      subject,
      text,
      html: `<div style="font-family:Manrope,Arial,sans-serif;max-width:560px;margin:auto;color:#111827"><h1 style="font-family:Manrope,Arial,sans-serif;font-weight:500">Memboux</h1><p>${esc(text)}</p><p><a href="${invitationUrl}" style="display:inline-block;background:#4f46e5;color:white;padding:12px 20px;border-radius:10px;text-decoration:none">${locale === "el" ? "Προβολή πρόσκλησης" : "View invitation"}</a></p><p style="color:#64748b;font-size:13px">${locale === "el" ? "Η πρόσκληση λήγει σε 14 ημέρες, αφορά μόνο αυτό το album και απαιτεί λογαριασμό με το ίδιο email." : "This invitation expires in 14 days, only grants access to this album, and requires an account with the same email."}</p></div>`,
    });
  }
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
      delivery: existingUser ? "notification" : "email",
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
  if (userId) await c.env.DB.prepare("DELETE FROM event_members WHERE event_id=? AND user_id=? AND role!='owner'").bind(event.id, userId).run();
  if (invitationId) await c.env.DB.prepare("DELETE FROM event_invitations WHERE id=? AND event_id=?").bind(invitationId, event.id).run();
  return c.redirect(`/dashboard/${event.code}?lang=${locale}#people`, 303);
});
