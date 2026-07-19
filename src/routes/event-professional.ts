import { Hono } from "hono";
import { sendEmail } from "../auth";
import type { Bindings } from "../domain";
import { normalizeLocale } from "../i18n";
import { getEvent } from "../repositories";
import { currentUser } from "../session";
import { esc } from "../utils";
import { getEventRole as getRole, roleCan } from "../access";

export const eventProfessionalRoutes = new Hono<{ Bindings: Bindings }>();

eventProfessionalRoutes.get("/dashboard/:code/professional", async (c) => {
  const locale = normalizeLocale(c.req.query("lang") ?? "en");
  const user = await currentUser(c);
  if (!user) return c.redirect(`/${locale}/login`);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if (!roleCan(await getRole(c.env.DB, event.id, user.id), "manage_members"))
    return c.text("Only the event owner can assign a professional", 403);
  return c.redirect(`/dashboard/${event.code}?lang=${locale}#people`, 302);
});

eventProfessionalRoutes.post("/api/account/events/:code/professional/assign", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if (!roleCan(await getRole(c.env.DB, event.id, user.id), "manage_members"))
    return c.text("Forbidden", 403);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  const professionalUserId = String(body.professionalUserId ?? "");
  const professional = await c.env.DB.prepare(
    `SELECT p.business_name,u.email FROM professional_profiles p JOIN "user" u ON u.id=p.user_id WHERE p.user_id=? AND p.status='active'`,
  )
    .bind(professionalUserId)
    .first<{ business_name: string; email: string }>();
  if (!professional) return c.text("Professional not found", 404);
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE event_professional_assignments SET status='revoked',updated_at=? WHERE event_id=? AND professional_user_id<>? AND status!='revoked'",
    ).bind(now, event.id, professionalUserId),
    c.env.DB.prepare(
      `INSERT INTO event_professional_assignments (event_id,professional_user_id,assigned_by,status,created_at,accepted_at,updated_at) VALUES (?,?,?,'invited',?,NULL,?) ON CONFLICT(event_id,professional_user_id) DO UPDATE SET assigned_by=excluded.assigned_by,status='invited',accepted_at=NULL,updated_at=excluded.updated_at`,
    ).bind(event.id, professionalUserId, user.id, now, now),
  ]);
  const url = `https://memboux.com/studio`;
  await sendEmail(c.env, {
    to: professional.email,
    purpose: "professional_assignment",
    subject: `Memboux Studio – ${event.eventName}`,
    text: `${user.name} assigned ${professional.business_name} to ${event.eventName}. Sign in to accept: ${url}`,
    html: `<h1>Memboux Studio</h1><p>${esc(user.name)} assigned <strong>${esc(professional.business_name)}</strong> to <strong>${esc(event.eventName)}</strong>.</p><p><a href="${url}">Open Studio</a></p>`,
  });
  return c.redirect(`/dashboard/${event.code}?lang=${locale}#people`, 303);
});

eventProfessionalRoutes.post("/api/account/events/:code/professional/revoke", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if (!roleCan(await getRole(c.env.DB, event.id, user.id), "manage_members"))
    return c.text("Forbidden", 403);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  await c.env.DB.prepare(
    "UPDATE event_professional_assignments SET status='revoked',updated_at=? WHERE event_id=? AND status!='revoked'",
  )
    .bind(Date.now(), event.id)
    .run();
  return c.redirect(`/dashboard/${event.code}?lang=${locale}#people`, 303);
});
