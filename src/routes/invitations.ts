import { Hono } from "hono";
import type { Bindings } from "../domain";
import { normalizeLocale } from "../i18n";
import { getInvitationByToken, respondToInvitation } from "../invitations";
import { currentUser } from "../session";
import { esc, formatDateTime } from "../utils";
import { brandMark, logoutScript, page } from "../views/shared";

export const invitationRoutes = new Hono<{ Bindings: Bindings }>();

const maskEmail = (email: string) => {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "••••";
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
};

invitationRoutes.get("/invite/:token", async (c) => {
  const token = c.req.param("token");
  const invitation = await getInvitationByToken(c.env.DB, token);
  const requestedLocale = c.req.query("lang");
  const locale = normalizeLocale(requestedLocale ?? "en");
  const el = locale === "el";
  const user = await currentUser(c);
  const homeHref = user ? `/${locale}/account` : `/${locale}`;
  const header = `<header class="border-b border-[#e2e8f0] bg-white"><div class="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-4">${brandMark(homeHref, true)}<a href="/invite/${encodeURIComponent(token)}?lang=${el ? "en" : "el"}" class="rounded-full border px-3 py-2 text-xs font-semibold text-[#4338ca]">${el ? "EN" : "EL"}</a></div></header>`;

  if (!invitation) {
    return c.html(page(
      el ? "Η πρόσκληση δεν βρέθηκε" : "Invitation not found",
      `${header}<main class="mx-auto flex min-h-[70vh] max-w-3xl items-center p-5"><section class="w-full rounded-[2rem] bg-white p-8 text-center shadow-xl sm:p-12"><span class="text-4xl">◇</span><h1 class="mt-5 text-4xl">${el ? "Αυτή η πρόσκληση δεν είναι διαθέσιμη" : "This invitation is unavailable"}</h1><p class="mx-auto mt-3 max-w-xl text-[#64748b]">${el ? "Το link μπορεί να έχει λήξει ή να έχει αντικατασταθεί. Ζήτησε νέα πρόσκληση από τον ιδιοκτήτη." : "The link may have expired or been replaced. Ask the owner for a new invitation."}</p><a href="${homeHref}" class="mt-7 inline-flex rounded-xl bg-[#172033] px-6 py-3 text-white">${el ? "Συνέχεια στο Memboux" : "Continue to Memboux"}</a></section></main>`,
      { locale },
    ), 404);
  }

  const roleLabel = invitation.role === "viewer"
    ? (el ? "Θεατής · προβολή και λήψη" : "Viewer · view and download")
    : (el ? "Διαχειριστής · διαχείριση περιεχομένου" : "Manager · manage content");
  const now = Date.now();
  const expired = invitation.expires_at <= now;
  const resolved = invitation.accepted_at !== null || invitation.declined_at !== null;
  const matchingUser = Boolean(user && user.email.toLowerCase() === invitation.email.toLowerCase());
  let actions = "";

  if (invitation.accepted_at !== null) {
    actions = matchingUser
      ? `<a href="/dashboard/${encodeURIComponent(invitation.event_code)}?lang=${locale}" class="inline-flex rounded-xl bg-[#4f46e5] px-6 py-3 font-semibold text-white">${el ? "Άνοιγμα album" : "Open album"}</a>`
      : `<p class="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">${el ? "Η πρόσκληση έχει ήδη γίνει αποδεκτή." : "This invitation has already been accepted."}</p>`;
  } else if (invitation.declined_at !== null) {
    actions = `<p class="rounded-2xl bg-[#f8faff] p-4 text-sm text-[#475569]">${el ? "Η πρόσκληση έχει απορριφθεί." : "This invitation has been declined."}</p>`;
  } else if (expired) {
    actions = `<p class="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">${el ? "Η πρόσκληση έχει λήξει. Ζήτησε από τον ιδιοκτήτη να στείλει νέα." : "This invitation has expired. Ask the owner to send a new one."}</p>`;
  } else if (!user) {
    const returnPath = `/invite/${token}?lang=${locale}`;
    actions = `<div class="grid gap-3 sm:grid-cols-2"><a href="/${locale}/login?redirect=${encodeURIComponent(returnPath)}" class="rounded-xl bg-[#172033] px-6 py-3 text-center font-semibold text-white">${el ? "Σύνδεση για αποδοχή" : "Sign in to accept"}</a><a href="/${locale}/register?redirect=${encodeURIComponent(returnPath)}" class="rounded-xl border border-[#cbd5e1] px-6 py-3 text-center font-semibold text-[#172033]">${el ? "Δημιουργία λογαριασμού" : "Create account"}</a></div><p class="mt-3 text-xs leading-5 text-[#64748b]">${el ? "Χρησιμοποίησε το email στο οποίο στάλθηκε η πρόσκληση. Μετά τη σύνδεση θα επιστρέψεις εδώ." : "Use the email address that received the invitation. You will return here after signing in."}</p>`;
  } else if (!matchingUser) {
    actions = `<div class="rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900"><strong>${el ? "Διαφορετικός λογαριασμός" : "Different account"}</strong><p>${el ? `Η πρόσκληση προορίζεται για ${esc(maskEmail(invitation.email))}. Συνδέσου με εκείνο το email.` : `This invitation is for ${esc(maskEmail(invitation.email))}. Sign in with that email.`}</p></div><button type="button" data-logout class="mt-3 rounded-xl border border-[#cbd5e1] px-6 py-3 font-semibold">${el ? "Αποσύνδεση" : "Sign out"}</button>`;
  } else {
    actions = `<div class="flex flex-col gap-3 sm:flex-row"><form action="/api/account/invitations/${encodeURIComponent(invitation.id)}/accept" method="post" class="flex-1"><input type="hidden" name="locale" value="${locale}"><button class="w-full rounded-xl bg-[#4f46e5] px-6 py-3 font-semibold text-white">${el ? "Αποδοχή και άνοιγμα" : "Accept and open"}</button></form><form action="/api/account/invitations/${encodeURIComponent(invitation.id)}/decline" method="post"><input type="hidden" name="locale" value="${locale}"><button class="w-full rounded-xl border border-[#cbd5e1] px-6 py-3 font-semibold text-[#475569]">${el ? "Απόρριψη" : "Decline"}</button></form></div>`;
  }

  return c.html(page(
    `${invitation.event_name} – ${el ? "Πρόσκληση" : "Invitation"}`,
    `${header}<main class="mx-auto flex min-h-[75vh] max-w-4xl items-center p-5"><section class="grid w-full overflow-hidden rounded-[2rem] border border-[#dbe2f0] bg-white shadow-[0_30px_100px_rgba(30,41,59,.13)] lg:grid-cols-[.82fr_1.18fr]"><aside class="bg-[#172033] p-8 text-white sm:p-10"><p class="text-xs uppercase tracking-[.22em] text-[#a5b4fc]">Album invitation</p><h1 class="mt-4 break-words text-4xl leading-tight">${esc(invitation.event_name)}</h1><p class="mt-5 text-sm leading-6 text-white/65">${el ? `${esc(invitation.inviter_name)} σε προσκαλεί σε ένα ιδιωτικό album στο Memboux.` : `${esc(invitation.inviter_name)} invited you to a private album on Memboux.`}</p><div class="mt-8 rounded-2xl bg-white/10 p-4"><p class="text-xs uppercase tracking-[.15em] text-white/50">${el ? "Ρόλος" : "Role"}</p><strong class="mt-1 block text-sm">${roleLabel}</strong></div></aside><div class="p-8 sm:p-10"><p class="text-xs uppercase tracking-[.2em] text-[#4f46e5]">${resolved ? (el ? "Κατάσταση πρόσκλησης" : "Invitation status") : (el ? "Μοιρασμένο μαζί σου" : "Shared with you")}</p><h2 class="mt-3 text-3xl">${el ? "Αποδέχεσαι την πρόσκληση;" : "Accept this invitation?"}</h2><p class="mt-4 text-sm leading-6 text-[#64748b]">${el ? "Η πρόσβαση αφορά μόνο αυτό το album και μπορεί να αφαιρεθεί οποιαδήποτε στιγμή από τον ιδιοκτήτη." : "Access is limited to this album and can be removed by the owner at any time."}</p><dl class="my-7 space-y-3 rounded-2xl bg-[#f8faff] p-5 text-sm"><div class="flex justify-between gap-4"><dt class="text-[#64748b]">Email</dt><dd class="break-all text-right font-medium">${esc(maskEmail(invitation.email))}</dd></div><div class="flex justify-between gap-4"><dt class="text-[#64748b]">${el ? "Λήξη" : "Expires"}</dt><dd class="text-right font-medium">${esc(formatDateTime(invitation.expires_at, locale))}</dd></div></dl>${actions}</div></section></main>${user ? logoutScript(locale) : ""}`,
    { locale },
  ));
});

invitationRoutes.post("/api/account/invitations/:id/:action{accept|decline}", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? "en"));
  const action = c.req.param("action") as "accept" | "decline";
  const result = await respondToInvitation(c.env.DB, c.req.param("id"), user, action);
  if (result.status === "forbidden") return c.text("This invitation belongs to another account", 403);
  if (result.status === "not_found") return c.text("Invitation not found", 404);
  if (result.status === "expired") return c.text("Invitation expired", 410);
  if (result.status === "already_resolved") return c.redirect(`/${locale}/account`, 303);
  if (result.status === "accepted") return c.redirect(`/dashboard/${result.eventCode}?lang=${locale}`, 303);
  return c.redirect(`/${locale}/account`, 303);
});
