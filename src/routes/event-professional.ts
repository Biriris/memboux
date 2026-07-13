import { Hono } from "hono";
import { sendEmail } from "../auth";
import type { Bindings } from "../domain";
import { normalizeLocale } from "../i18n";
import { getEvent } from "../repositories";
import { currentUser } from "../session";
import { esc } from "../utils";
import { accountMenu, brandMark, logoutScript, page } from "../views/shared";
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
  const profiles = await c.env.DB.prepare(
    `SELECT p.user_id,p.business_name,p.slug,p.bio,p.website,u.email FROM professional_profiles p JOIN "user" u ON u.id=p.user_id WHERE p.status='active' ORDER BY p.business_name`,
  ).all<{
    user_id: string;
    business_name: string;
    slug: string;
    bio: string;
    website: string | null;
    email: string;
  }>();
  const assignment = await c.env.DB.prepare(
    `SELECT a.professional_user_id,a.status,p.business_name,u.email FROM event_professional_assignments a JOIN professional_profiles p ON p.user_id=a.professional_user_id JOIN "user" u ON u.id=a.professional_user_id WHERE a.event_id=? AND a.status!='revoked' ORDER BY a.updated_at DESC LIMIT 1`,
  )
    .bind(event.id)
    .first<{
      professional_user_id: string;
      status: string;
      business_name: string;
      email: string;
    }>();
  const el = locale === "el";
  const options = profiles.results
    .map(
      (p) =>
        `<option value="${esc(p.user_id)}"${assignment?.professional_user_id === p.user_id ? " selected" : ""}>${esc(p.business_name)} · ${esc(p.email)}</option>`,
    )
    .join("");
  return c.html(
    page(
      el ? "Official photographer" : "Official photographer",
      `<header class="border-b bg-white"><div class="mx-auto flex max-w-4xl items-center justify-between p-5">${brandMark(`/${locale}`, true)}${accountMenu(locale, user)}</div></header><main class="mx-auto max-w-4xl p-5 md:p-10"><a href="/dashboard/${event.code}/edit?lang=${locale}" class="text-sm text-[#654534]">← ${el ? "Επεξεργασία event" : "Back to event settings"}</a><h1 class="mt-4 text-4xl">${el ? "Official photographer" : "Official photographer"}</h1><p class="mt-2 text-[#625750]">${el ? "Ο επαγγελματίας αποκτά πρόσβαση μόνο στο Studio workspace και στο official album." : "The professional receives access only to the Studio workspace and official album."}</p>${assignment ? `<section class="mt-6 rounded-2xl bg-white p-5 shadow"><h2 class="text-2xl">${esc(assignment.business_name)}</h2><p class="text-sm text-[#625750]">${esc(assignment.email)} · ${esc(assignment.status)}</p><form action="/api/account/events/${event.code}/professional/revoke" method="post" class="mt-4"><input type="hidden" name="locale" value="${locale}"><button class="rounded-xl border border-red-200 px-4 py-2 text-red-700">${el ? "Ανάκληση πρόσβασης" : "Revoke access"}</button></form></section>` : ""}<section class="mt-6 rounded-2xl bg-white p-5 shadow"><h2 class="text-2xl">${el ? "Επιλογή επαγγελματία" : "Choose a professional"}</h2>${options ? `<form action="/api/account/events/${event.code}/professional/assign" method="post" class="mt-4 space-y-3"><input type="hidden" name="locale" value="${locale}"><select name="professionalUserId" required class="w-full rounded-xl border px-4 py-3">${options}</select><button class="w-full rounded-xl bg-[#654534] px-5 py-3 text-white">${el ? "Αποστολή ανάθεσης" : "Send assignment"}</button></form>` : `<p class="mt-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">${el ? "Δεν υπάρχουν ακόμη active professional profiles." : "No active professional profiles are available yet."}</p>`}</section></main>${logoutScript(locale)}`,
    ),
  );
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
    subject: `Memboux Studio – ${event.eventName}`,
    text: `${user.name} assigned ${professional.business_name} to ${event.eventName}. Sign in to accept: ${url}`,
    html: `<h1>Memboux Studio</h1><p>${esc(user.name)} assigned <strong>${esc(professional.business_name)}</strong> to <strong>${esc(event.eventName)}</strong>.</p><p><a href="${url}">Open Studio</a></p>`,
  });
  return c.redirect(`/dashboard/${event.code}/professional?lang=${locale}`, 303);
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
  return c.redirect(`/dashboard/${event.code}/professional?lang=${locale}`, 303);
});
