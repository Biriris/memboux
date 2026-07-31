import { Hono } from "hono";
import { parse as parseMetadata } from "exifr";
import { TRASH_RETENTION_MS } from "../config";
import type { Bindings, EventRow } from "../domain";
import { normalizeLocale, type Locale } from "../i18n";
import { getLaunchReadiness } from "../launch-readiness";
import {
  commerceLaunchChecks,
  commerceLaunchReady,
  getCommerceLaunchSettings,
} from "../commerce";
import {
  checkEmailDnsHealth,
  recommendedDmarcRecord,
} from "../email-dns-health";
import { permanentlyDeleteMedia, restoreDeletedMedia } from "../media-trash";
import { formatBytes, releaseStorage, reserveStorageForEvent } from "../quotas";
import { getEvent, getMedia } from "../repositories";
import { safeFileExtension, validateUploadFiles } from "../upload-policy";
import { validProfessionalSlug } from "../studio";
import {
  dateInput,
  esc,
  formatDate,
  formatDateTime,
  formatEventDates,
  sha256Bytes,
  sha256,
  validEventDate,
} from "../utils";
import { adminShell } from "../views/admin";
import { bulkSelectionScript, cards, lightboxMarkup } from "../views/media";
import { page } from "../views/shared";
import {
  adminLocaleOrRedirect,
  isAdmin,
} from "./admin-auth";
import { adminRoleProfiles, adminRoles, currentAdmin, isAdminRole, recordAdminAudit, rolePermissions, type AdminRole } from "../admin-rbac";
import { currentUser } from "../session";
import { sendEmail } from "../auth";
import { escalateSupportConversation } from "../support-routing";
import { staffEmailReplyCopy } from "../support-email-threading";
import { supportNotificationEmailInUse } from "../support-staff-email";

export const adminRoutes = new Hono<{ Bindings: Bindings }>();

function safeAdminReturn(value: unknown, fallback: string) {
  const target = String(value ?? "");
  return target.startsWith("/admin/") && !target.startsWith("//")
    ? target
    : fallback;
}

function selected(value: string, current: string) {
  return value === current ? " selected" : "";
}

function validTeamNotificationEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase().slice(0, 254);
  return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

adminRoutes.get("/admin/login", async (c) => {
  const admin = await currentAdmin(c);
  if (admin) return c.redirect("/admin");
  const user = await currentUser(c);
  const redirect = c.req.query("redirect")?.startsWith("/admin/") ? c.req.query("redirect")! : "/admin";
  return c.html(
    page(
      "Admin Login – Memboux",
      `<main class="flex min-h-screen items-center justify-center bg-[#f8f5ff] p-5"><section class="w-full max-w-md rounded-3xl border border-[#e6dff0] bg-white p-8 shadow-[0_24px_70px_rgba(47,107,91,.12)]"><p class="text-sm font-semibold uppercase tracking-[.2em] text-[#6d28d9]">Memboux Admin Centre</p><h1 class="mt-2 text-3xl font-bold">Προσωπική πρόσβαση ομάδας</h1><p class="mt-3 leading-7 text-[#6f657c]">${user ? `Ο λογαριασμός <strong>${esc(user.email)}</strong> δεν έχει ενεργό admin ρόλο.` : "Ο Platform Owner και κάθε εργαζόμενος συνδέονται από την ίδια ασφαλή σελίδα με τον προσωπικό, επαληθευμένο λογαριασμό τους. Οι άδειες εφαρμόζονται αυτόματα μετά τη σύνδεση."}</p>${user ? `<a href="/el/account" class="mt-7 block rounded-xl border px-4 py-3 text-center font-semibold text-[#6d28d9]">Επιστροφή στον λογαριασμό</a>` : `<a href="/el/login?redirect=${encodeURIComponent(redirect)}" class="mt-7 block rounded-xl bg-[#2b174d] px-4 py-3 text-center font-semibold text-white">Σύνδεση στην ομάδα</a>`}<p class="mt-5 text-xs leading-5 text-[#84958f]">Δεν χρησιμοποιούμε κοινόχρηστους κωδικούς ή κρυφή superadmin διεύθυνση. Η πρόσβαση δίνεται μόνο από τον Platform Owner και καταγράφεται.</p></section></main>`,
    ),
  );
});

adminRoutes.post("/admin/login", async (c) => {
  return c.redirect("/admin/login", 303);
});

adminRoutes.post("/admin/logout", (c) => {
  return c.redirect("/el/account", 303);
});

adminRoutes.get("/admin/language/:locale{el|en}", (c) => {
  const locale = normalizeLocale(c.req.param("locale"));
  c.header(
    "Set-Cookie",
    `memboux_admin_locale=${locale}; Path=/admin; Max-Age=31536000; Secure; SameSite=Lax`,
  );
  const referer = c.req.header("Referer");
  if (referer) {
    const url = new URL(referer);
    if (
      url.origin === new URL(c.req.url).origin &&
      url.pathname.startsWith("/admin")
    )
      return c.redirect(url.pathname, 303);
  }
  return c.redirect("/admin/users", 303);
});

type TeamMemberRow = {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: AdminRole;
  status: "active" | "suspended";
  granted_at: number;
  updated_at: number;
  last_admin_access_at: number | null;
  notification_email: string | null;
  support_notifications_enabled: number;
};

adminRoutes.get("/admin/profile", async (c) => {
  const locale = await adminLocaleOrRedirect(c);
  if (!locale) return c.redirect("/admin/login");
  const actor = await currentAdmin(c);
  if (!actor) return c.redirect("/admin/login");
  const member = await c.env.DB.prepare(
    `SELECT m.notification_email,m.support_notifications_enabled,u.email
     FROM admin_members m JOIN "user" u ON u.id=m.user_id WHERE m.id=?`,
  ).bind(actor.memberId).first<{
    notification_email: string | null;
    support_notifications_enabled: number;
    email: string;
  }>();
  if (!member) return c.text("Admin profile not found", 404);
  const el = locale === "el";
  const replyCopy = staffEmailReplyCopy(locale);
  const notice = c.req.query("notice") === "saved"
    ? (el ? "Οι ρυθμίσεις ειδοποιήσεων αποθηκεύτηκαν." : "Notification settings saved.")
    : c.req.query("notice") === "test-sent"
      ? (el ? "Το δοκιμαστικό email έγινε δεκτό. Έλεγξε Inbox και Spam." : "The test email was accepted. Check Inbox and Spam.")
      : c.req.query("notice") === "test-failed"
        ? (el ? "Η δοκιμαστική αποστολή απέτυχε και καταγράφηκε." : "The test delivery failed and was logged.")
        : "";
  const noticeTone = c.req.query("notice") === "test-failed"
    ? "border-red-200 bg-red-50 text-red-800"
    : "border-emerald-200 bg-emerald-50 text-emerald-800";
  const body = `<main class="mx-auto max-w-3xl p-5 md:p-10"><p class="text-xs font-bold uppercase tracking-[.18em] text-[#7c3aed]">Memboux Helpdesk</p><h1 class="mt-2 text-4xl">${el ? "Οι ειδοποιήσεις μου" : "My notifications"}</h1><p class="mt-3 max-w-2xl text-sm leading-6 text-[#6f657c]">${esc(replyCopy.description)}</p>${notice ? `<p class="mt-5 rounded-xl border px-4 py-3 text-sm ${noticeTone}">${esc(notice)}</p>` : ""}<section class="mt-7 rounded-[2rem] border border-[#e7e0f0] bg-white p-6 shadow-sm sm:p-8"><form action="/admin/profile" method="post"><label class="block text-sm font-semibold text-[#443653]">${el ? "Email ειδοποιήσεων" : "Notification email"}<input name="notificationEmail" type="email" required maxlength="254" value="${esc(member.notification_email ?? member.email)}" class="mt-2 w-full rounded-xl border border-[#e2dcef] px-4 py-3 font-normal"></label><label class="mt-5 flex items-start gap-3 rounded-2xl bg-[#f8f5ff] p-4 text-sm"><input name="supportNotifications" type="checkbox"${member.support_notifications_enabled ? " checked" : ""} class="mt-1"><span><strong class="block">${esc(replyCopy.alertTitle)}</strong><span class="mt-1 block text-[#6f657c]">${esc(replyCopy.alertDetail)}</span></span></label><button class="mt-5 w-full rounded-xl bg-[#2b174d] px-5 py-3 font-semibold text-white">${el ? "Αποθήκευση ρυθμίσεων" : "Save settings"}</button></form><form action="/admin/profile/test-notification" method="post" class="mt-3"><button class="w-full rounded-xl border border-[#d9cfee] bg-white px-5 py-3 text-sm font-semibold text-[#6d28d9]">${el ? "Αποστολή δοκιμαστικού email" : "Send test email"}</button></form></section><p class="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-900">${esc(replyCopy.security)}</p></main>`;
  return c.html(adminShell(el ? "Οι ειδοποιήσεις μου" : "My notifications", body, locale, actor));
});

adminRoutes.post("/admin/profile", async (c) => {
  const actor = await currentAdmin(c);
  if (!actor) return c.redirect("/admin/login");
  const body = await c.req.parseBody();
  const notificationEmail = validTeamNotificationEmail(body.notificationEmail);
  if (!notificationEmail) return c.text("A valid notification email is required", 400);
  if (await supportNotificationEmailInUse(c.env.DB, notificationEmail, actor.memberId))
    return c.text("This notification email is already assigned to another team member", 409);
  const enabled = body.supportNotifications === "on" ? 1 : 0;
  await c.env.DB.prepare(
    "UPDATE admin_members SET notification_email=?,support_notifications_enabled=?,updated_at=? WHERE id=?",
  ).bind(notificationEmail, enabled, Date.now(), actor.memberId).run();
  await recordAdminAudit(c, actor, "support.notification_settings_updated", "admin_member", actor.memberId, {
    supportNotifications: Boolean(enabled),
  });
  return c.redirect("/admin/profile?notice=saved", 303);
});

adminRoutes.post("/admin/profile/test-notification", async (c) => {
  const actor = await currentAdmin(c);
  if (!actor) return c.redirect("/admin/login");
  const member = await c.env.DB.prepare(
    `SELECT u.name,COALESCE(NULLIF(m.notification_email,''),u.email) notification_email
     FROM admin_members m JOIN "user" u ON u.id=m.user_id WHERE m.id=? AND m.status='active'`,
  ).bind(actor.memberId).first<{ name: string; notification_email: string }>();
  if (!member || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.notification_email))
    return c.text("A valid notification email is required", 409);
  try {
    await sendEmail(c.env, {
      to: member.notification_email,
      purpose: "support_staff_test",
      from: "Memboux Helpdesk <support@mail.memboux.com>",
      replyTo: "support@memboux.com",
      subject: "Memboux Helpdesk · Test notification",
      text: `Hello ${member.name},\n\nYour personal Helpdesk alerts are connected.\n\nhttps://memboux.com/admin/support`,
      html: `<div style="font-family:Arial,sans-serif;color:#251547;max-width:620px"><p style="text-transform:uppercase;letter-spacing:.12em;color:#6c4cf1">Memboux Helpdesk</p><h1>Email alerts are connected</h1><p>Hello ${esc(member.name)},</p><p>Your personal Helpdesk notification address is configured correctly.</p><p><a href="https://memboux.com/admin/support">Open Support Inbox</a></p></div>`,
    });
    await recordAdminAudit(c, actor, "support.notification_test_sent", "admin_member", actor.memberId, {});
    return c.redirect("/admin/profile?notice=test-sent", 303);
  } catch (error) {
    console.error(JSON.stringify({
      event: "support_notification_test_failed",
      memberId: actor.memberId,
      error: error instanceof Error ? error.message : String(error),
    }));
    await recordAdminAudit(c, actor, "support.notification_test_failed", "admin_member", actor.memberId, {});
    return c.redirect("/admin/profile?notice=test-failed", 303);
  }
});

const roleLabels: Record<AdminRole, { el: string; en: string; description: string }> = {
  ...Object.fromEntries(adminRoles.map((role) => [role, {
    el: adminRoleProfiles[role].label.el,
    en: adminRoleProfiles[role].label.en,
    description: adminRoleProfiles[role].description.el,
  }])) as Record<AdminRole, { el: string; en: string; description: string }>,
};

adminRoutes.get("/admin/team", async (c) => {
  const locale = await adminLocaleOrRedirect(c);
  if (!locale) return c.redirect("/admin/login");
  const members = await c.env.DB.prepare(
    `SELECT m.id,m.user_id,u.name,u.email,m.role,m.status,m.granted_at,m.updated_at,m.last_admin_access_at,
      m.notification_email,m.support_notifications_enabled
     FROM admin_members m JOIN "user" u ON u.id=m.user_id
     ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'administrator' THEN 1 ELSE 2 END,u.name`,
  ).all<TeamMemberRow>();
  const audit = await c.env.DB.prepare(
    `SELECT a.action,a.target_type,a.target_id,a.metadata_json,a.created_at,u.name actor_name,u.email actor_email
     FROM admin_audit_log a LEFT JOIN "user" u ON u.id=a.actor_user_id
     ORDER BY a.created_at DESC LIMIT 50`,
  ).all<{ action: string; target_type: string; target_id: string | null; metadata_json: string; created_at: number; actor_name: string | null; actor_email: string | null }>();
  const adminLanguage = locale === "el" ? "el" : "en";
  const roleOptions = adminRoles.map((role) => `<option value="${role}">${esc(roleLabels[role][adminLanguage])}</option>`).join("");
  const cards = members.results.map((member) => `<article class="rounded-2xl border bg-white p-5 shadow-sm"><div class="flex flex-wrap items-start justify-between gap-3"><div><h2 class="font-semibold">${esc(member.name)}</h2><p class="text-sm text-[#6f657c]">${esc(member.email)}</p></div><span class="rounded-full ${member.status === "active" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"} px-3 py-1 text-xs font-semibold">${member.status}</span></div><form action="/admin/team/${encodeURIComponent(member.id)}" method="post" class="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_auto]"><select name="role" class="rounded-xl border px-3 py-2">${adminRoles.map((role) => `<option value="${role}"${member.role === role ? " selected" : ""}>${esc(roleLabels[role][adminLanguage])}</option>`).join("")}</select><select name="status" class="rounded-xl border px-3 py-2"><option value="active"${member.status === "active" ? " selected" : ""}>Active</option><option value="suspended"${member.status === "suspended" ? " selected" : ""}>Suspended</option></select><input name="notificationEmail" type="email" value="${esc(member.notification_email ?? member.email)}" aria-label="Notification email" class="rounded-xl border px-3 py-2 sm:col-span-2" placeholder="Notification email"><label class="flex items-center gap-2 rounded-xl bg-[#f8f5ff] px-3 py-2 text-xs"><input name="supportNotifications" type="checkbox"${member.support_notifications_enabled ? " checked" : ""}> Email alerts</label><button class="rounded-xl bg-[#2b174d] px-4 py-2 font-semibold text-white">Save</button></form><p class="mt-3 text-xs text-[#84958f]">${esc(roleLabels[member.role].description)}</p></article>`).join("");
  const auditRows = audit.results.map((entry) => `<tr class="border-t"><td class="px-4 py-3 text-sm">${esc(entry.actor_name || entry.actor_email || "System")}</td><td class="px-4 py-3 font-mono text-xs">${esc(entry.action)}</td><td class="px-4 py-3 text-sm">${esc(entry.target_type)}${entry.target_id ? ` · ${esc(entry.target_id)}` : ""}</td><td class="whitespace-nowrap px-4 py-3 text-xs text-[#6f657c]">${formatDateTime(entry.created_at, locale)}</td></tr>`).join("");
  return c.html(adminShell("Team & Roles", `<main class="mx-auto max-w-7xl p-5 md:p-10"><p class="text-xs font-bold uppercase tracking-[.18em] text-[#7c3aed]">Identity & Access</p><h1 class="mt-2 text-4xl">Team & Roles</h1><p class="mt-3 max-w-3xl text-[#6f657c]">Κάθε συνεργάτης χρησιμοποιεί προσωπικό, επαληθευμένο Memboux account. Δώσε μόνο τον ελάχιστο ρόλο που χρειάζεται.</p><section class="mt-8 rounded-3xl border bg-white p-6 shadow-sm"><h2 class="text-2xl">Προσθήκη μέλους</h2><form action="/admin/team" method="post" class="mt-5 grid gap-3 md:grid-cols-[minmax(240px,1fr)_220px_auto]"><input name="email" type="email" required placeholder="Verified Memboux account email" class="rounded-xl border px-4 py-3"><select name="role" class="rounded-xl border px-4 py-3">${roleOptions}</select><button class="rounded-xl bg-[#2b174d] px-5 py-3 font-semibold text-white">Grant access</button></form></section><section class="mt-8 grid gap-4 lg:grid-cols-2">${cards}</section><section class="mt-10 overflow-hidden rounded-3xl border bg-white shadow-sm"><div class="p-6"><h2 class="text-2xl">Security audit log</h2><p class="mt-2 text-sm text-[#6f657c]">Οι τελευταίες αλλαγές πρόσβασης και ρόλων.</p></div><div class="overflow-x-auto"><table class="w-full text-left"><thead class="bg-[#f8f5ff] text-xs uppercase text-[#6f657c]"><tr><th class="px-4 py-3">Actor</th><th class="px-4 py-3">Action</th><th class="px-4 py-3">Target</th><th class="px-4 py-3">Time</th></tr></thead><tbody>${auditRows || `<tr><td colspan="4" class="p-8 text-center text-[#6f657c]">No audit entries yet.</td></tr>`}</tbody></table></div></section></main>`, locale));
});

adminRoutes.post("/admin/team", async (c) => {
  const actor = await currentAdmin(c);
  if (!actor || actor.role !== "owner") return c.text("Forbidden", 403);
  const body = await c.req.parseBody();
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 254);
  const role = body.role;
  if (!isAdminRole(role)) return c.text("Invalid role", 400);
  const user = await c.env.DB.prepare('SELECT id,emailVerified FROM "user" WHERE lower(email)=?').bind(email).first<{ id: string; emailVerified: number }>();
  if (!user || !user.emailVerified) return c.text("A verified Memboux account with this email is required.", 404);
  const now = Date.now();
  const existing = await c.env.DB.prepare("SELECT id FROM admin_members WHERE user_id=?").bind(user.id).first<{ id: string }>();
  const memberId = existing?.id ?? crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO admin_members (id,user_id,role,status,granted_by_user_id,granted_at,updated_at)
     VALUES (?,?,?,'active',?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,status='active',granted_by_user_id=excluded.granted_by_user_id,updated_at=excluded.updated_at`,
  ).bind(memberId, user.id, role, actor.userId, now, now).run();
  await recordAdminAudit(c, actor, existing ? "admin.access_updated" : "admin.access_granted", "admin_member", memberId, { email, role });
  return c.redirect("/admin/team", 303);
});

adminRoutes.post("/admin/team/:id", async (c) => {
  const actor = await currentAdmin(c);
  if (!actor || actor.role !== "owner") return c.text("Forbidden", 403);
  const body = await c.req.parseBody();
  const role = body.role;
  const status = body.status === "suspended" ? "suspended" : "active";
  const notificationEmail = validTeamNotificationEmail(body.notificationEmail);
  if (notificationEmail === null) return c.text("Invalid notification email", 400);
  const supportNotifications = body.supportNotifications === "on" ? 1 : 0;
  if (!isAdminRole(role)) return c.text("Invalid role", 400);
  const target = await c.env.DB.prepare("SELECT id,user_id,role,status FROM admin_members WHERE id=?").bind(c.req.param("id")).first<{ id: string; user_id: string; role: AdminRole; status: string }>();
  if (!target) return c.text("Team member not found", 404);
  if (notificationEmail && await supportNotificationEmailInUse(c.env.DB, notificationEmail, target.id))
    return c.text("This notification email is already assigned to another team member", 409);
  if (target.user_id === actor.userId && (role !== "owner" || status !== "active")) return c.text("You cannot remove or demote your own Owner access.", 409);
  if (target.role === "owner" && target.status === "active" && (role !== "owner" || status !== "active")) {
    const owners = await c.env.DB.prepare("SELECT count(*) total FROM admin_members WHERE role='owner' AND status='active'").first<{ total: number }>();
    if ((owners?.total ?? 0) <= 1) return c.text("At least one active Owner is required.", 409);
  }
  await c.env.DB.prepare(
    "UPDATE admin_members SET role=?,status=?,notification_email=?,support_notifications_enabled=?,updated_at=? WHERE id=?",
  ).bind(role, status, notificationEmail || null, supportNotifications, Date.now(), target.id).run();
  if (target.role !== role || target.status !== status) {
    const affected = await c.env.DB.prepare(
      `SELECT c.id,c.subject,
        (SELECT body FROM support_messages m
         WHERE m.conversation_id=c.id AND m.sender_type='user'
         ORDER BY m.created_at DESC LIMIT 1) latest_message
       FROM support_conversations c
       WHERE c.assigned_admin_member_id=? AND c.status!='closed'`,
    ).bind(target.id).all<{ id: string; subject: string; latest_message: string | null }>();
    if (affected.results.length) {
      await c.env.DB.prepare(
        `UPDATE support_conversations SET assigned_admin_member_id=NULL,
         notification_sent_at=NULL,notification_delivery_status=NULL,
         notification_delivery_outcome=NULL,notification_provider_message_id=NULL,
         notification_last_error=NULL,updated_at=?
         WHERE assigned_admin_member_id=? AND status!='closed'`,
      ).bind(Date.now(), target.id).run();
      for (const conversation of affected.results) {
        await escalateSupportConversation(
          c.env,
          conversation.id,
          conversation.subject,
          conversation.latest_message ?? "",
          "Automatic reassignment after a team role or status change",
        );
      }
    }
  }
  await recordAdminAudit(c, actor, "admin.access_updated", "admin_member", target.id, {
    role,
    status,
    supportNotifications: Boolean(supportNotifications),
  });
  return c.redirect("/admin/team", 303);
});

adminRoutes.post("/admin/team/:id/test-notification", async (c) => {
  const actor = await currentAdmin(c);
  if (!actor || actor.role !== "owner") return c.text("Forbidden", 403);
  const member = await c.env.DB.prepare(
    `SELECT m.id,m.status,u.name,
      COALESCE(NULLIF(m.notification_email,''),u.email) notification_email
     FROM admin_members m JOIN "user" u ON u.id=m.user_id WHERE m.id=?`,
  ).bind(c.req.param("id")).first<{
    id: string;
    status: string;
    name: string;
    notification_email: string;
  }>();
  if (!member || member.status !== "active") return c.text("Active team member not found", 404);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.notification_email))
    return c.text("A valid notification email is required", 409);
  try {
    await sendEmail(c.env, {
      to: member.notification_email,
      purpose: "support_staff_test",
      from: "Memboux Helpdesk <support@mail.memboux.com>",
      replyTo: "support@memboux.com",
      subject: "Memboux Helpdesk · Test notification",
      text: `Hello ${member.name},\n\nYour Memboux Helpdesk email alerts are configured correctly. Future escalated conversations assigned to you will link back to the secure Admin Centre.\n\nhttps://memboux.com/admin/support`,
      html: `<div style="font-family:Arial,sans-serif;color:#251547;max-width:620px"><p style="text-transform:uppercase;letter-spacing:.12em;color:#6c4cf1">Memboux Helpdesk</p><h1>Email alerts are connected</h1><p>Hello ${esc(member.name)},</p><p style="line-height:1.7">This test confirms that your helpdesk notification address is accepted by the email provider. Future escalated conversations assigned to you will link back to the secure Admin Centre.</p><p style="margin-top:24px"><a href="https://memboux.com/admin/support" style="background:#251547;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px">Open Support Inbox</a></p></div>`,
    });
    await recordAdminAudit(c, actor, "support.notification_test_sent", "admin_member", member.id, {});
    return c.redirect("/admin/team?notice=test-sent", 303);
  } catch (error) {
    console.error(JSON.stringify({
      event: "support_notification_test_failed",
      memberId: member.id,
      error: error instanceof Error ? error.message : String(error),
    }));
    await recordAdminAudit(c, actor, "support.notification_test_failed", "admin_member", member.id, {});
    return c.redirect("/admin/team?notice=test-failed", 303);
  }
});

adminRoutes.post("/admin/readiness/test-email", async (c) => {
  const actor = await currentAdmin(c);
  if (!actor || !["owner", "administrator"].includes(actor.role)) return c.text("Forbidden", 403);
  const member = await c.env.DB.prepare(
    `SELECT m.id,m.status,u.name,
      COALESCE(NULLIF(m.notification_email,''),u.email) notification_email
     FROM admin_members m JOIN "user" u ON u.id=m.user_id WHERE m.id=?`,
  ).bind(actor.memberId).first<{ id: string; status: string; name: string; notification_email: string }>();
  if (!member || member.status !== "active") return c.text("Active team member not found", 404);
  try {
    await sendEmail(c.env, {
      to: member.notification_email,
      purpose: "support_staff_test",
      from: "Memboux Helpdesk <support@mail.memboux.com>",
      replyTo: "support@memboux.com",
      subject: "Memboux Helpdesk · Test notification",
      text: `Hello ${member.name},\n\nYour Memboux Helpdesk email alerts are connected.\n\nhttps://memboux.com/admin/support`,
      html: `<div style="font-family:Arial,sans-serif;color:#251547;max-width:620px"><p style="text-transform:uppercase;letter-spacing:.12em;color:#6c4cf1">Memboux Helpdesk</p><h1>Email alerts are connected</h1><p>Hello ${esc(member.name)},</p><p>This confirms that your helpdesk notification address is accepted by the provider.</p><p><a href="https://memboux.com/admin/support">Open Support Inbox</a></p></div>`,
    });
    await recordAdminAudit(c, actor, "support.notification_test_sent", "admin_member", member.id, {});
    return c.redirect("/admin/readiness?notice=email-sent", 303);
  } catch (error) {
    console.error(JSON.stringify({
      event: "support_notification_test_failed",
      memberId: member.id,
      error: error instanceof Error ? error.message : String(error),
    }));
    await recordAdminAudit(c, actor, "support.notification_test_failed", "admin_member", member.id, {});
    return c.redirect("/admin/readiness?notice=email-failed", 303);
  }
});

export function supportAliasTestAddress(value: unknown) {
  if (value === "support") return "support@memboux.com";
  if (value === "info") return "info@memboux.com";
  return null;
}

adminRoutes.post("/admin/readiness/test-alias", async (c) => {
  const actor = await currentAdmin(c);
  if (!actor || !["owner", "administrator"].includes(actor.role))
    return c.text("Forbidden", 403);
  const body = await c.req.parseBody();
  const recipient = supportAliasTestAddress(body.alias);
  if (!recipient) return c.text("Invalid Memboux alias", 400);
  const proof = crypto.randomUUID().slice(0, 8).toUpperCase();
  try {
    await sendEmail(c.env, {
      to: recipient,
      purpose: "support_staff_test",
      from: "Memboux Delivery Check <support@mail.memboux.com>",
      replyTo: "support@memboux.com",
      subject: `Memboux alias test · ${proof}`,
      text: `This is a routing test for ${recipient}.\n\nProof code: ${proof}\n\nIf a new Email ticket with this proof code appears in Admin Support, inbound routing is working end to end.`,
      html: `<div style="font-family:Arial,sans-serif;color:#251547;max-width:620px"><p style="text-transform:uppercase;letter-spacing:.12em;color:#6c4cf1">Memboux Delivery Check</p><h1>Alias routing test</h1><p>This message was addressed to <strong>${esc(recipient)}</strong>.</p><p>Proof code: <strong>${proof}</strong></p><p style="line-height:1.7">If a new <strong>Email</strong> ticket with this proof code appears in Admin Support, Cloudflare inbound routing is working end to end.</p></div>`,
    });
    await recordAdminAudit(c, actor, "email.alias_test_sent", "email_alias", recipient, {
      proof,
    });
    return c.redirect(`/admin/readiness?notice=alias-sent&alias=${encodeURIComponent(recipient)}&proof=${proof}`, 303);
  } catch (error) {
    console.error(JSON.stringify({
      event: "support_alias_test_failed",
      recipient,
      error: error instanceof Error ? error.message : String(error),
    }));
    await recordAdminAudit(c, actor, "email.alias_test_failed", "email_alias", recipient, {
      proof,
    });
    return c.redirect(`/admin/readiness?notice=alias-failed&alias=${encodeURIComponent(recipient)}`, 303);
  }
});

adminRoutes.get("/admin/readiness", async (c) => {
  const locale = await adminLocaleOrRedirect(c);
  if (!locale) return c.redirect("/admin/login");
  const readiness = getLaunchReadiness(c.env);
  const [emailDns, commerceSettings, deliveryMetrics] = await Promise.all([
    checkEmailDnsHealth(),
    getCommerceLaunchSettings(c.env.DB),
    c.env.DB.prepare(
      `SELECT
         COUNT(*) total,
         SUM(CASE WHEN COALESCE(delivery_outcome,status) IN ('accepted','sent') THEN 1 ELSE 0 END) accepted,
         SUM(CASE WHEN delivery_outcome='delivered' THEN 1 ELSE 0 END) delivered,
         SUM(CASE WHEN COALESCE(delivery_outcome,status) IN ('failed','bounced','complained') THEN 1 ELSE 0 END) failed
       FROM email_delivery_attempts WHERE created_at>=?`,
    ).bind(Date.now() - 30 * 86_400_000).first<{
      total: number;
      accepted: number;
      delivered: number;
      failed: number;
    }>(),
  ]);
  const paymentReady = commerceLaunchReady(commerceSettings);
  const commerceRows = commerceLaunchChecks.map(([key, label]) =>
    `<li class="flex items-center justify-between gap-3 border-t border-[#eee8f5] py-3 first:border-0"><span>${esc(label)}</span><strong class="${commerceSettings[key] ? "text-emerald-700" : "text-amber-800"}">${commerceSettings[key] ? "READY" : "PENDING"}</strong></li>`,
  ).join("");
  let commerceGate = `<section class="mt-8 rounded-3xl border border-[#e5dff0] bg-white p-6 shadow-sm"><div class="flex flex-wrap items-start justify-between gap-3"><div><p class="text-xs font-bold uppercase tracking-[.16em] text-[#7c3aed]">Payment launch guard</p><h2 class="mt-2 text-2xl">${locale === "el" ? "Δικλείδα πραγματικών πληρωμών" : "Real-payment safety gate"}</h2></div><span class="rounded-full px-3 py-1 text-sm font-bold ${paymentReady ? "bg-emerald-100 text-emerald-800" : "bg-red-50 text-red-800"}">${paymentReady ? "ENABLED" : "HARD BLOCKED"}</span></div><p class="mt-3 text-sm leading-6 text-[#6f657c]">${locale === "el" ? "Η βάση απορρίπτει κάθε μετάβαση παραγγελίας προς πληρωμή όσο λείπει έστω και ένα gate. Η ενεργοποίηση δεν παρέχεται από δημόσια ή admin σελίδα." : "The database rejects every order transition into payment while any gate is missing. No public or admin page can enable it."}</p><ul class="mt-4 text-sm">${commerceRows}<li class="flex items-center justify-between gap-3 border-t border-[#eee8f5] py-3"><span>${locale === "el" ? "Ρητή τελική ενεργοποίηση" : "Explicit final enablement"}</span><strong class="${commerceSettings.payments_enabled ? "text-emerald-700" : "text-red-700"}">${commerceSettings.payments_enabled ? "ON" : "OFF"}</strong></li></ul></section>`;
  const emailNotice = c.req.query("notice") === "email-sent"
    ? (locale === "el" ? "Το δοκιμαστικό email έγινε δεκτό από τον provider. Έλεγξε και το Inbox/Spam." : "The test email was accepted by the provider. Check Inbox and Spam.")
    : c.req.query("notice") === "email-failed"
      ? (locale === "el" ? "Η δοκιμαστική αποστολή απέτυχε. Το αποτέλεσμα καταγράφηκε στο audit." : "The test delivery failed. The result was recorded in the audit.")
      : c.req.query("notice") === "alias-sent"
        ? (locale === "el"
          ? `Το test προς ${c.req.query("alias") ?? "Memboux alias"} έγινε δεκτό. Αναζήτησε στο Inbox/Spam τον κωδικό ${c.req.query("proof") ?? "—"}.`
          : `The test to ${c.req.query("alias") ?? "the Memboux alias"} was accepted. Find proof code ${c.req.query("proof") ?? "—"} in Inbox/Spam.`)
        : c.req.query("notice") === "alias-failed"
          ? (locale === "el" ? "Το alias routing test απέτυχε και καταγράφηκε." : "The alias routing test failed and was audited.")
      : "";
  const emailMetrics = `<section class="mt-8 rounded-3xl border border-[#e5dff0] bg-white p-6 shadow-sm"><div class="flex flex-wrap items-end justify-between gap-3"><div><p class="text-xs font-bold uppercase tracking-[.16em] text-[#7c3aed]">Last 30 days</p><h2 class="mt-2 text-2xl">Email delivery audit</h2></div><span class="text-sm text-[#6f657c]">${Number(deliveryMetrics?.total ?? 0)} total</span></div><div class="mt-5 grid grid-cols-3 gap-3 text-center"><div class="rounded-2xl bg-violet-50 p-4"><strong class="block text-2xl text-violet-800">${Number(deliveryMetrics?.accepted ?? 0)}</strong><span class="text-xs text-violet-700">Accepted</span></div><div class="rounded-2xl bg-emerald-50 p-4"><strong class="block text-2xl text-emerald-800">${Number(deliveryMetrics?.delivered ?? 0)}</strong><span class="text-xs text-emerald-700">Delivered</span></div><div class="rounded-2xl bg-red-50 p-4"><strong class="block text-2xl text-red-800">${Number(deliveryMetrics?.failed ?? 0)}</strong><span class="text-xs text-red-700">Failed</span></div></div><p class="mt-4 text-xs leading-5 text-[#6f657c]">${locale === "el" ? "Το Accepted επιβεβαιώνει παραλαβή από τον provider. Το Delivered ενημερώνεται μόνο όταν συνδεθεί το υπογεγραμμένο Resend webhook." : "Accepted confirms provider receipt. Delivered updates only after the signed Resend webhook is connected."}</p><div class="mt-5 grid gap-3 sm:grid-cols-2"><form action="/admin/readiness/test-alias" method="post"><input type="hidden" name="alias" value="support"><button class="w-full rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-900">Test support@memboux.com</button></form><form action="/admin/readiness/test-alias" method="post"><input type="hidden" name="alias" value="info"><button class="w-full rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-900">Test info@memboux.com</button></form></div></section>`;
  commerceGate += emailMetrics;
  const rows = readiness.checks
    .map(
      (check) =>
        `<article class="flex items-center justify-between gap-4 rounded-2xl border bg-white p-5 shadow-sm"><div><p class="text-xs uppercase tracking-[.15em] text-[#6d28d9]">${esc(check.category)}</p><h2 class="mt-1 text-xl">${esc(check.label)}</h2></div><span class="rounded-full px-3 py-1 text-sm ${check.ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}">${check.ready ? (locale === "el" ? "Έτοιμο" : "Ready") : locale === "el" ? "Εκκρεμεί" : "Pending"}</span></article>`,
    )
    .join("");
  const webhookReady = readiness.checks.find(
    (check) => check.key === "transactional_email_webhooks",
  )?.ready;
  const webhookGuide = webhookReady
    ? ""
    : `<aside class="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950"><strong>${locale === "el" ? "Ενεργοποίηση πραγματικού delivery tracking" : "Enable real delivery tracking"}</strong><ol class="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6"><li>${locale === "el" ? "Στο Resend άνοιξε Webhooks και πρόσθεσε endpoint" : "In Resend, open Webhooks and add the endpoint"} <code class="rounded bg-white px-1.5 py-1">https://memboux.com/api/webhooks/resend</code>.</li><li>${locale === "el" ? "Επίλεξε" : "Select"} <code>email.sent</code>, <code>email.delivered</code>, <code>email.delivery_delayed</code>, <code>email.bounced</code>, <code>email.complained</code> ${locale === "el" ? "και" : "and"} <code>email.failed</code>.</li><li>${locale === "el" ? "Αποθήκευσε το signing secret ως Cloudflare Worker secret με όνομα" : "Store the signing secret as a Cloudflare Worker secret named"} <code>RESEND_WEBHOOK_SECRET</code>.</li></ol><p class="mt-3 text-xs">${locale === "el" ? "Το endpoint παραμένει κλειστό μέχρι να υπάρχει το secret και απορρίπτει μη έγκυρες ή επαναλαμβανόμενες υπογραφές." : "The endpoint stays closed until the secret exists and rejects invalid or replayed signatures."}</p></aside>`;
  const dnsRows = emailDns.checks
    .map((check) => {
      const badge =
        check.status === "ready"
          ? ["bg-emerald-100 text-emerald-800", locale === "el" ? "Έτοιμο" : "Ready"]
          : check.status === "unavailable"
            ? ["bg-slate-100 text-slate-700", locale === "el" ? "Μη διαθέσιμο" : "Unavailable"]
            : ["bg-amber-100 text-amber-900", locale === "el" ? "Χρειάζεται ενέργεια" : "Action needed"];
      return `<article class="rounded-2xl border bg-white p-5 shadow-sm"><div class="flex flex-wrap items-start justify-between gap-3"><div><p class="text-xs uppercase tracking-[.15em] text-[#6d28d9]">DNS · ${esc(check.key.toUpperCase())}</p><h2 class="mt-1 text-xl">${esc(check.label)}</h2></div><span class="rounded-full px-3 py-1 text-sm ${badge[0]}">${badge[1]}</span></div><p class="mt-3 text-sm leading-6 text-[#6f657c]">${esc(check.detail)}</p></article>`;
    })
    .join("");
  const dmarc = emailDns.checks.find((check) => check.key === "dmarc");
  const dmarcGuide =
    dmarc && ["missing", "misconfigured"].includes(dmarc.status)
      ? `<aside class="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950"><strong>${locale === "el" ? "Απαιτείται μία ασφαλής αρχική πολιτική DMARC" : "A safe initial DMARC policy is required"}</strong><p class="mt-2 text-sm leading-6">${locale === "el" ? "Στο Cloudflare άνοιξε DNS → Records και πρόσθεσε ακριβώς μία εγγραφή. Η πολιτική p=none ξεκινά παρακολούθηση χωρίς να απορρίπτει νόμιμα emails." : "In Cloudflare, open DNS → Records and add exactly one record. The p=none policy starts monitoring without rejecting legitimate email."}</p><dl class="mt-4 grid gap-2 text-sm"><div><dt class="font-semibold">Type</dt><dd><code>${recommendedDmarcRecord.type}</code></dd></div><div><dt class="font-semibold">Name</dt><dd><code>${recommendedDmarcRecord.name}</code></dd></div><div><dt class="font-semibold">Content</dt><dd class="mt-1 overflow-x-auto rounded-xl bg-white p-3"><code>${esc(recommendedDmarcRecord.value)}</code></dd></div><div><dt class="font-semibold">TTL</dt><dd><code>Auto</code></dd></div></dl></aside>`
      : "";
  return c.html(
    adminShell(
      locale === "el" ? "Ετοιμότητα launch" : "Launch readiness",
      `<main class="mx-auto max-w-5xl p-5 md:p-10"><p class="text-xs uppercase tracking-[.2em] text-[#6d28d9]">Production gates</p><h1 class="mt-2 text-4xl">${locale === "el" ? "Ετοιμότητα launch" : "Launch readiness"}</h1><div class="mt-6 grid gap-3 sm:grid-cols-2"><div class="rounded-2xl p-5 ${readiness.technicalReady ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}"><p class="text-sm">Technical production</p><strong class="mt-1 block text-2xl">${readiness.technicalReady ? "READY" : "PENDING"}</strong></div><div class="rounded-2xl p-5 ${readiness.commercialReady ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}"><p class="text-sm">Commercial launch</p><strong class="mt-1 block text-2xl">${readiness.commercialReady ? "READY" : "BLOCKED"}</strong></div></div><p class="mt-5 rounded-2xl bg-white p-4 text-sm text-[#6f657c]">${locale === "el" ? "Δεν εμφανίζονται ποτέ τιμές secrets. Το commercial launch παραμένει κλειδωμένο μέχρι να ολοκληρωθούν όλα τα νομικά και billing gates." : "Secret values are never displayed. Commercial launch stays locked until every legal and billing gate is complete."}</p>${commerceGate}${emailNotice ? `<p class="mt-4 rounded-xl border px-4 py-3 text-sm ${c.req.query("notice") === "email-sent" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}">${esc(emailNotice)}</p>` : ""}<form action="/admin/readiness/test-email" method="post" class="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4"><div class="flex flex-wrap items-center justify-between gap-3"><div><strong class="text-violet-950">${locale === "el" ? "Έλεγχος helpdesk email" : "Helpdesk email check"}</strong><p class="mt-1 text-xs text-violet-700">${locale === "el" ? "Στέλνει πραγματικό alert στο email ειδοποιήσεων του λογαριασμού σου." : "Sends a real alert to your account notification email."}</p></div><button class="rounded-xl bg-violet-700 px-4 py-3 text-sm font-bold text-white">${locale === "el" ? "Αποστολή test email" : "Send test email"}</button></div></form><section class="mt-8"><div class="flex flex-wrap items-end justify-between gap-3"><div><p class="text-xs uppercase tracking-[.2em] text-[#6d28d9]">Email authentication</p><h2 class="mt-1 text-2xl">${locale === "el" ? "Email DNS Health" : "Email DNS health"}</h2></div><span class="rounded-full px-3 py-1 text-sm ${emailDns.ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}">${emailDns.ready ? (locale === "el" ? "Όλα έτοιμα" : "All ready") : (locale === "el" ? "Έλεγχος απαιτείται" : "Review needed")}</span></div><p class="mt-2 text-sm text-[#6f657c]">${locale === "el" ? "Ζωντανός δημόσιος έλεγχος των εγγραφών που επηρεάζουν την παραλαβή, την αποστολή και την αξιοπιστία των email." : "Live public verification of the records that affect email reception, sending and trust."}</p><div class="mt-4 grid gap-3 sm:grid-cols-2">${dnsRows}</div>${dmarcGuide}</section><div class="mt-8 grid gap-3">${rows}</div>${webhookGuide}</main>`,
      locale,
      (c as any).get("admin"),
    ),
  );
});

adminRoutes.get("/admin/professionals", async (c) => {
  const locale = await adminLocaleOrRedirect(c);
  if (!locale) return c.redirect("/admin/login");
  const query = (c.req.query("q") ?? "").trim().slice(0, 100);
  const status = ["active", "suspended", "missing"].includes(
    c.req.query("status") ?? "",
  )
    ? String(c.req.query("status"))
    : "all";
  const sort = [
    "updated_desc",
    "name_asc",
    "name_desc",
    "assignments_desc",
    "status_asc",
  ].includes(c.req.query("sort") ?? "")
    ? String(c.req.query("sort"))
    : "updated_desc";
  const where = ["(?='' OR u.name LIKE ? OR u.email LIKE ? OR p.business_name LIKE ? OR p.slug LIKE ?)"];
  const bindings: unknown[] = [
    query,
    `%${query}%`,
    `%${query}%`,
    `%${query}%`,
    `%${query}%`,
  ];
  if (status === "missing") where.push("p.user_id IS NULL");
  else if (status !== "all") {
    where.push("p.status=?");
    bindings.push(status);
  }
  const orderBy: Record<string, string> = {
    updated_desc: "COALESCE(p.updated_at,0) DESC,u.createdAt DESC",
    name_asc: "COALESCE(p.business_name,u.name) COLLATE NOCASE ASC",
    name_desc: "COALESCE(p.business_name,u.name) COLLATE NOCASE DESC",
    assignments_desc: "accepted_assignments DESC,total_assignments DESC",
    status_asc: "CASE WHEN p.user_id IS NULL THEN 2 WHEN p.status='active' THEN 0 ELSE 1 END,COALESCE(p.business_name,u.name) COLLATE NOCASE",
  };
  const users = await c.env.DB.prepare(
    `SELECT u.id,u.name,u.email,u.createdAt,p.business_name,p.slug,p.bio,p.website,p.status,p.updated_at,
      (SELECT COUNT(*) FROM event_professional_assignments a WHERE a.professional_user_id=u.id AND a.status='accepted') accepted_assignments,
      (SELECT COUNT(*) FROM event_professional_assignments a WHERE a.professional_user_id=u.id) total_assignments
     FROM "user" u LEFT JOIN professional_profiles p ON p.user_id=u.id
     WHERE ${where.join(" AND ")} ORDER BY ${orderBy[sort]} LIMIT 250`,
  )
    .bind(...bindings)
    .all<{
    id: string;
    name: string;
    email: string;
    createdAt: number;
    business_name: string | null;
    slug: string | null;
    bio: string | null;
    website: string | null;
    status: string | null;
    updated_at: number | null;
    accepted_assignments: number;
    total_assignments: number;
  }>();
  const currentUrl = new URL(c.req.url);
  const returnTo = `${currentUrl.pathname}${currentUrl.search}`;
  const rows = users.results
    .map((user) => {
      const profileStatus = user.status ?? "missing";
      const statusClass =
        profileStatus === "active"
          ? "bg-emerald-50 text-emerald-700"
          : profileStatus === "suspended"
            ? "bg-amber-50 text-amber-700"
            : "bg-slate-100 text-slate-600";
      const slug =
        user.slug ??
        (user.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 50) || `studio-${user.id.slice(0, 8)}`);
      return `<details class="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><summary class="grid cursor-pointer list-none gap-3 p-4 transition hover:bg-slate-50 md:grid-cols-[minmax(220px,1.5fr)_minmax(150px,1fr)_120px_110px_150px_24px] md:items-center"><div class="min-w-0"><p class="truncate font-medium text-slate-950">${esc(user.business_name ?? user.name)}</p><p class="truncate text-xs text-slate-500">${esc(user.email)}</p></div><div class="min-w-0 text-sm"><p class="truncate text-slate-700">${esc(user.name)}</p><p class="truncate text-xs text-slate-400">/${esc(slug)}</p></div><span class="w-fit rounded-full px-2.5 py-1 text-xs font-medium ${statusClass}">${esc(profileStatus)}</span><p class="text-sm text-slate-700"><strong>${user.accepted_assignments}</strong> / ${user.total_assignments}</p><p class="text-xs text-slate-500">${formatDateTime(user.updated_at ?? user.createdAt, locale)}</p><span class="text-xl text-slate-400 transition group-open:rotate-180">⌄</span></summary><div class="border-t border-slate-100 bg-slate-50/60 p-4 md:p-6"><form action="/admin/professionals/${encodeURIComponent(user.id)}" method="post" class="grid gap-4 md:grid-cols-2"><input type="hidden" name="returnTo" value="${esc(returnTo)}"><label class="text-xs font-medium text-slate-600">${locale === "el" ? "Επωνυμία" : "Business name"}<input name="businessName" required maxlength="100" value="${esc(user.business_name ?? user.name)}" class="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"></label><label class="text-xs font-medium text-slate-600">${locale === "el" ? "Δημόσιο slug" : "Public slug"}<input name="slug" required maxlength="50" value="${esc(slug)}" class="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"></label><label class="text-xs font-medium text-slate-600 md:col-span-2">Bio<textarea name="bio" maxlength="1000" rows="3" class="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">${esc(user.bio ?? "")}</textarea></label><label class="text-xs font-medium text-slate-600">Website<input name="website" type="url" maxlength="300" value="${esc(user.website ?? "")}" class="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"></label><label class="text-xs font-medium text-slate-600">Status<select name="status" class="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"><option value="active"${selected("active", user.status ?? "active")}>Active</option><option value="suspended"${selected("suspended", user.status ?? "active")}>Suspended</option></select></label><button class="rounded-xl bg-[#7c3aed] px-4 py-2.5 font-medium text-white md:col-span-2">${locale === "el" ? "Αποθήκευση profile" : "Save profile"}</button></form></div></details>`;
    })
    .join("");
  return c.html(
    adminShell(
      locale === "el" ? "Επαγγελματίες" : "Professionals",
      `<main class="mx-auto max-w-7xl p-5 md:p-10"><div class="flex flex-wrap items-end justify-between gap-4"><div><p class="text-xs font-semibold uppercase tracking-[.2em] text-[#7c3aed]">Studio directory</p><h1 class="mt-2 text-4xl">${locale === "el" ? "Professional profiles" : "Professional profiles"}</h1><p class="mt-2 text-slate-500">${locale === "el" ? "Αναζήτηση, ταξινόμηση και επεξεργασία όλων των επαγγελματικών profiles." : "Search, sort and edit every professional profile."}</p></div><span class="rounded-full bg-white px-4 py-2 text-sm text-slate-600 shadow-sm">${users.results.length} ${locale === "el" ? "αποτελέσματα" : "results"}</span></div><form class="mt-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_180px_210px_auto]"><input name="q" value="${esc(query)}" placeholder="${locale === "el" ? "Όνομα, email, studio ή slug" : "Name, email, studio or slug"}" class="rounded-xl border border-slate-200 px-4 py-2.5"><select name="status" class="rounded-xl border border-slate-200 px-3 py-2.5"><option value="all"${selected("all", status)}>${locale === "el" ? "Όλα τα profiles" : "All profiles"}</option><option value="active"${selected("active", status)}>Active</option><option value="suspended"${selected("suspended", status)}>Suspended</option><option value="missing"${selected("missing", status)}>${locale === "el" ? "Χωρίς profile" : "No profile"}</option></select><select name="sort" class="rounded-xl border border-slate-200 px-3 py-2.5"><option value="updated_desc"${selected("updated_desc", sort)}>${locale === "el" ? "Πρόσφατη ενημέρωση" : "Recently updated"}</option><option value="name_asc"${selected("name_asc", sort)}>Name A–Z</option><option value="name_desc"${selected("name_desc", sort)}>Name Z–A</option><option value="assignments_desc"${selected("assignments_desc", sort)}>${locale === "el" ? "Περισσότερα events" : "Most assignments"}</option><option value="status_asc"${selected("status_asc", sort)}>Status</option></select><button class="rounded-xl bg-slate-950 px-5 py-2.5 font-medium text-white">${locale === "el" ? "Εφαρμογή" : "Apply"}</button></form><div class="mt-5 hidden grid-cols-[minmax(220px,1.5fr)_minmax(150px,1fr)_120px_110px_150px_24px] gap-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400 md:grid"><span>Studio / email</span><span>User / slug</span><span>Status</span><span>Accepted / all</span><span>Updated</span><span></span></div><div class="mt-2 grid gap-2">${rows || `<p class="rounded-2xl bg-white p-8 text-center text-slate-500">${locale === "el" ? "Δεν βρέθηκαν profiles." : "No profiles found."}</p>`}</div></main>`,
      locale,
      (c as any).get("admin"),
    ),
  );
});

adminRoutes.post("/admin/professionals/:userId", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin/login");
  const body = await c.req.parseBody();
  const businessName = String(body.businessName ?? "")
    .trim()
    .slice(0, 100);
  const slug = String(body.slug ?? "")
    .trim()
    .toLowerCase();
  const bio = String(body.bio ?? "")
    .trim()
    .slice(0, 1000);
  const website =
    String(body.website ?? "")
      .trim()
      .slice(0, 300) || null;
  const status = body.status === "suspended" ? "suspended" : "active";
  if (!businessName || !validProfessionalSlug(slug))
    return c.text("Invalid professional profile", 400);
  if (website) {
    try {
      const url = new URL(website);
      if (!["http:", "https:"].includes(url.protocol))
        return c.text("Invalid website", 400);
    } catch {
      return c.text("Invalid website", 400);
    }
  }
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO professional_profiles (user_id,business_name,slug,bio,website,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET business_name=excluded.business_name,slug=excluded.slug,bio=excluded.bio,website=excluded.website,status=excluded.status,updated_at=excluded.updated_at`,
  )
    .bind(
      c.req.param("userId"),
      businessName,
      slug,
      bio,
      website,
      status,
      now,
      now,
    )
    .run();
  return c.redirect(
    safeAdminReturn(body.returnTo, "/admin/professionals"),
    303,
  );
});

adminRoutes.get("/admin/accounts", async (c) => {
  const locale = await adminLocaleOrRedirect(c);
  if (!locale) return c.redirect("/admin/login");
  const query = (c.req.query("q") ?? "").trim().slice(0, 100);
  const plan = ["beta", "pro", "studio", "custom"].includes(
    c.req.query("plan") ?? "",
  )
    ? String(c.req.query("plan"))
    : "all";
  const override = ["configured", "default"].includes(
    c.req.query("override") ?? "",
  )
    ? String(c.req.query("override"))
    : "all";
  const sort = [
    "newest",
    "name_asc",
    "name_desc",
    "storage_desc",
    "events_desc",
    "plan_asc",
  ].includes(c.req.query("sort") ?? "")
    ? String(c.req.query("sort"))
    : "newest";
  const where = ["(?='' OR u.name LIKE ? OR u.email LIKE ?)"];
  const bindings: unknown[] = [query, `%${query}%`, `%${query}%`];
  if (plan !== "all") {
    where.push("COALESCE(ae.plan_key,'beta')=?");
    bindings.push(plan);
  }
  const customLimits =
    "ae.user_id IS NOT NULL AND (ae.plan_key<>'beta' OR ae.storage_limit_bytes<>21474836480 OR ae.event_limit<>25 OR ae.member_limit<>25)";
  if (override === "configured") where.push(`(${customLimits})`);
  if (override === "default") where.push(`NOT (${customLimits})`);
  const orderBy: Record<string, string> = {
    newest: "u.createdAt DESC",
    name_asc: "u.name COLLATE NOCASE ASC",
    name_desc: "u.name COLLATE NOCASE DESC",
    storage_desc: "used_bytes DESC",
    events_desc: "event_count DESC",
    plan_asc: "plan_key COLLATE NOCASE ASC,u.name COLLATE NOCASE ASC",
  };
  const accounts = await c.env.DB.prepare(
    `SELECT u.id,u.name,u.email,u.createdAt,ae.updated_at entitlement_updated_at,
      COALESCE(ae.plan_key,'beta') plan_key,COALESCE(ae.storage_limit_bytes,21474836480) storage_limit_bytes,
      COALESCE(ae.event_limit,25) event_limit,COALESCE(ae.member_limit,25) member_limit,COALESCE(su.used_bytes,0) used_bytes,
      (SELECT COUNT(*) FROM event_members em JOIN events e ON e.id=em.event_id WHERE em.user_id=u.id AND em.role='owner' AND e.deleted_at IS NULL) event_count
     FROM "user" u LEFT JOIN account_entitlements ae ON ae.user_id=u.id LEFT JOIN account_storage_usage su ON su.user_id=u.id
     WHERE ${where.join(" AND ")} ORDER BY ${orderBy[sort]} LIMIT 250`,
  )
    .bind(...bindings)
    .all<{
      id: string;
      name: string;
      email: string;
      createdAt: number;
      entitlement_updated_at: number | null;
      plan_key: string;
      storage_limit_bytes: number;
      event_limit: number;
      member_limit: number;
      used_bytes: number;
      event_count: number;
    }>();
  const currentUrl = new URL(c.req.url);
  const returnTo = `${currentUrl.pathname}${currentUrl.search}`;
  const rows = accounts.results
    .map((item) => {
      const storagePercent = Math.min(
        100,
        Math.round((item.used_bytes / item.storage_limit_bytes) * 100),
      );
      const hasOverride =
        item.plan_key !== "beta" ||
        item.storage_limit_bytes !== 21474836480 ||
        item.event_limit !== 25 ||
        item.member_limit !== 25;
      return `<details class="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><summary class="grid cursor-pointer list-none gap-3 p-4 transition hover:bg-slate-50 md:grid-cols-[minmax(220px,1.4fr)_100px_minmax(170px,1fr)_110px_110px_150px_24px] md:items-center"><div class="min-w-0"><p class="truncate font-medium text-slate-950">${esc(item.name)}</p><p class="truncate text-xs text-slate-500">${esc(item.email)}</p></div><span class="w-fit rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold uppercase text-indigo-700">${esc(item.plan_key)}</span><div><p class="text-sm text-slate-700">${formatBytes(item.used_bytes)} / ${formatBytes(item.storage_limit_bytes)}</p><div class="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><span class="block h-full rounded-full bg-[#7c3aed]" style="width:${storagePercent}%"></span></div></div><p class="text-sm text-slate-700"><strong>${item.event_count}</strong> / ${item.event_limit}</p><p class="text-sm text-slate-700">${item.member_limit}</p><div><p class="text-xs text-slate-500">${formatDateTime(item.entitlement_updated_at ?? item.createdAt, locale)}</p><p class="mt-1 text-[11px] text-slate-400">${hasOverride ? "Override" : locale === "el" ? "Προεπιλογή" : "Default"}</p></div><span class="text-xl text-slate-400 transition group-open:rotate-180">⌄</span></summary><div class="border-t border-slate-100 bg-slate-50/60 p-4 md:p-6"><form action="/admin/accounts/${encodeURIComponent(item.id)}/entitlement" method="post" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><input type="hidden" name="returnTo" value="${esc(returnTo)}"><label class="text-xs font-medium text-slate-600">Plan<select name="planKey" class="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"><option value="beta"${selected("beta", item.plan_key)}>Beta</option><option value="pro"${selected("pro", item.plan_key)}>Pro</option><option value="studio"${selected("studio", item.plan_key)}>Studio</option><option value="custom"${selected("custom", item.plan_key)}>Custom</option></select></label><label class="text-xs font-medium text-slate-600">Storage GB<input name="storageGb" type="number" min="1" max="10240" required value="${Math.round(item.storage_limit_bytes / 1073741824)}" class="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"></label><label class="text-xs font-medium text-slate-600">Events<input name="eventLimit" type="number" min="1" max="10000" required value="${item.event_limit}" class="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"></label><label class="text-xs font-medium text-slate-600">${locale === "el" ? "Μέλη ανά event" : "Members per event"}<input name="memberLimit" type="number" min="1" max="1000" required value="${item.member_limit}" class="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"></label><button class="rounded-xl bg-[#7c3aed] px-4 py-2.5 font-medium text-white sm:col-span-2 lg:col-span-4">${locale === "el" ? "Αποθήκευση ορίων" : "Save limits"}</button></form></div></details>`;
    })
    .join("");
  return c.html(
    adminShell(
      locale === "el" ? "Plans χρηστών" : "Account plans",
      `<main class="mx-auto max-w-7xl p-5 md:p-10"><div class="flex flex-wrap items-end justify-between gap-4"><div><p class="text-xs font-semibold uppercase tracking-[.2em] text-[#7c3aed]">Commercial controls</p><h1 class="mt-2 text-4xl">${locale === "el" ? "Plans και overrides" : "Plans and overrides"}</h1><p class="mt-2 text-slate-500">${locale === "el" ? "Λεπτομερής διαχείριση plan, αποθηκευτικού χώρου και ορίων λογαριασμού." : "Detailed plan, storage and account-limit management."}</p></div><span class="rounded-full bg-white px-4 py-2 text-sm text-slate-600 shadow-sm">${accounts.results.length} ${locale === "el" ? "αποτελέσματα" : "results"}</span></div><form class="mt-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_150px_160px_190px_auto]"><input name="q" value="${esc(query)}" placeholder="${locale === "el" ? "Όνομα ή email" : "Name or email"}" class="rounded-xl border border-slate-200 px-4 py-2.5"><select name="plan" class="rounded-xl border border-slate-200 px-3 py-2.5"><option value="all"${selected("all", plan)}>${locale === "el" ? "Όλα τα plans" : "All plans"}</option><option value="beta"${selected("beta", plan)}>Beta</option><option value="pro"${selected("pro", plan)}>Pro</option><option value="studio"${selected("studio", plan)}>Studio</option><option value="custom"${selected("custom", plan)}>Custom</option></select><select name="override" class="rounded-xl border border-slate-200 px-3 py-2.5"><option value="all"${selected("all", override)}>${locale === "el" ? "Όλα τα όρια" : "All limits"}</option><option value="configured"${selected("configured", override)}>Overrides</option><option value="default"${selected("default", override)}>Defaults</option></select><select name="sort" class="rounded-xl border border-slate-200 px-3 py-2.5"><option value="newest"${selected("newest", sort)}>${locale === "el" ? "Νεότεροι χρήστες" : "Newest users"}</option><option value="name_asc"${selected("name_asc", sort)}>Name A–Z</option><option value="name_desc"${selected("name_desc", sort)}>Name Z–A</option><option value="storage_desc"${selected("storage_desc", sort)}>${locale === "el" ? "Χρήση χώρου" : "Storage used"}</option><option value="events_desc"${selected("events_desc", sort)}>${locale === "el" ? "Περισσότερα events" : "Most events"}</option><option value="plan_asc"${selected("plan_asc", sort)}>Plan</option></select><button class="rounded-xl bg-slate-950 px-5 py-2.5 font-medium text-white">${locale === "el" ? "Εφαρμογή" : "Apply"}</button></form><div class="mt-5 hidden grid-cols-[minmax(220px,1.4fr)_100px_minmax(170px,1fr)_110px_110px_150px_24px] gap-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400 md:grid"><span>User</span><span>Plan</span><span>Storage</span><span>Events</span><span>Members</span><span>Updated</span><span></span></div><div class="mt-2 grid gap-2">${rows || `<p class="rounded-2xl bg-white p-8 text-center text-slate-500">${locale === "el" ? "Δεν βρέθηκαν λογαριασμοί." : "No accounts found."}</p>`}</div></main>`,
      locale,
      (c as any).get("admin"),
    ),
  );
});

adminRoutes.post("/admin/accounts/:id/entitlement", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin/login");
  const body = await c.req.parseBody();
  const planKey = ["beta", "pro", "studio", "custom"].includes(
    String(body.planKey),
  )
    ? String(body.planKey)
    : "custom";
  const storageGb = Math.trunc(Number(body.storageGb));
  const eventLimit = Math.trunc(Number(body.eventLimit));
  const memberLimit = Math.trunc(Number(body.memberLimit));
  if (
    !Number.isFinite(storageGb) ||
    storageGb < 1 ||
    storageGb > 10240 ||
    !Number.isFinite(eventLimit) ||
    eventLimit < 1 ||
    eventLimit > 10000 ||
    !Number.isFinite(memberLimit) ||
    memberLimit < 1 ||
    memberLimit > 1000
  )
    return c.text("Invalid entitlement limits", 400);
  await c.env.DB.prepare(
    `INSERT INTO account_entitlements (user_id,plan_key,storage_limit_bytes,event_limit,member_limit,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET plan_key=excluded.plan_key,storage_limit_bytes=excluded.storage_limit_bytes,event_limit=excluded.event_limit,member_limit=excluded.member_limit,updated_at=excluded.updated_at`,
  )
    .bind(
      c.req.param("id"),
      planKey,
      storageGb * 1073741824,
      eventLimit,
      memberLimit,
      Date.now(),
    )
    .run();
  return c.redirect(safeAdminReturn(body.returnTo, "/admin/accounts"), 303);
});

export function adminEventCard(
  event: EventRow & { media_count: number },
  locale: Locale,
) {
  const deleted = event.deleted_at !== null;
  const badgeClass = deleted
    ? "bg-red-50 text-red-700"
    : event.status === "active"
      ? "bg-emerald-100 text-emerald-700"
      : "bg-slate-200 text-[#675a72]";
  const badge = deleted
    ? locale === "el" ? "Διαγραμμένο" : "Deleted"
    : event.status === "active"
      ? locale === "el" ? "Ενεργό" : "Active"
      : locale === "el" ? "Αρχειοθετημένο" : "Archived";
  const deleteLabel = deleted
    ? locale === "el" ? "Οριστική διαγραφή" : "Delete permanently"
    : locale === "el" ? "Διαγραφή" : "Delete";
  const deleteConfirm = deleted
    ? locale === "el"
      ? "Οριστική διαγραφή του event και όλων των αρχείων του; Αυτή η ενέργεια δεν αναιρείται."
      : "Permanently delete this event and all its files? This cannot be undone."
    : locale === "el"
      ? "Μεταφορά του event στον κάδο για 30 ημέρες;"
      : "Move this event to trash for 30 days?";

  return `<article class="relative rounded-2xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
    <a href="/admin/events/${encodeURIComponent(event.code)}" class="grid gap-3 rounded-2xl p-5 pr-16 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
      <div><div class="flex flex-wrap items-center gap-2"><h2 class="text-lg font-bold">${esc(event.eventName)}</h2><span class="rounded-full px-2 py-1 text-xs font-semibold ${badgeClass}">${badge}</span></div><p class="mt-1 font-mono text-sm text-[#6d28d9]">${esc(event.code)}</p>${deleted && event.purge_at ? `<p class="mt-1 text-xs text-red-700">${locale === "el" ? "Οριστική διαγραφή" : "Permanent deletion"}: ${formatDateTime(event.purge_at, locale)}</p>` : ""}${event.notes ? `<p class="mt-2 line-clamp-1 text-sm text-[#6f657c]">${esc(event.notes)}</p>` : ""}</div>
      <div class="text-sm text-[#6f657c]"><strong class="block text-lg text-[#24143b]">${event.media_count}</strong>${locale === "el" ? "αρχεία" : "files"}</div>
      <div class="text-sm text-[#6f657c]"><strong class="block text-[#24143b]">${esc(formatEventDates(event, locale))}</strong>${locale === "el" ? "ημερομηνία event" : "event date"}</div>
      <div class="text-sm text-[#6f657c]"><strong class="block text-[#24143b]">${formatDate(event.expires_at)}</strong>${locale === "el" ? "πρόσβαση έως" : "access until"}</div>
    </a>
    <details class="absolute right-3 top-3 z-20">
      <summary class="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border bg-white text-2xl shadow-sm hover:bg-[#f7f3ff]" aria-label="Event actions">⋯</summary>
      <div class="absolute right-0 mt-2 w-48 rounded-2xl border bg-white p-2 shadow-xl">
        <a href="/admin/events/${encodeURIComponent(event.code)}" class="block rounded-xl px-3 py-2 text-sm hover:bg-[#f7f3ff]">${locale === "el" ? "Επεξεργασία" : "Edit"}</a>
        <form action="/admin/events/${encodeURIComponent(event.code)}/delete" method="post" onsubmit="return confirm('${deleteConfirm}')"><button class="w-full rounded-xl px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50">${deleteLabel}</button></form>
      </div>
    </details>
  </article>`;
}

adminRoutes.get("/admin", async (c) => {
  const locale = await adminLocaleOrRedirect(c);
  if (!locale) return c.redirect("/admin/login");
  return c.redirect("/admin/users");
});

adminRoutes.get("/admin/events", async (c) => {
  const locale = await adminLocaleOrRedirect(c);
  if (!locale) return c.redirect("/admin/login");
  const query = (c.req.query("q") ?? "").trim().slice(0, 100);
  const status =
    c.req.query("status") === "deleted"
      ? "deleted"
      : c.req.query("status") === "archived"
        ? "archived"
        : c.req.query("status") === "active"
          ? "active"
          : "all";
  let sql = `SELECT e.*, COUNT(m.id) AS media_count FROM events e LEFT JOIN media m ON m.event_id=e.id WHERE 1=1`;
  const binds: string[] = [];
  if (query) {
    sql += ` AND (e.eventName LIKE ? OR e.code LIKE ?)`;
    binds.push(`%${query}%`, `%${query.toUpperCase()}%`);
  }
  if (status === "deleted") {
    sql += ` AND e.deleted_at IS NOT NULL`;
  } else if (status !== "all") {
    sql += ` AND e.deleted_at IS NULL`;
    sql += ` AND e.status = ?`;
    binds.push(status);
  }
  sql += ` GROUP BY e.id ORDER BY CASE WHEN e.deleted_at IS NOT NULL THEN 2 WHEN e.status='active' THEN 0 ELSE 1 END, COALESCE(e.event_start_date,'0000') DESC, e.created_at DESC`;
  const result = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all<EventRow & { media_count: number }>();
  const counts = await c.env.DB.prepare(
    `SELECT COUNT(*) total, SUM(CASE WHEN deleted_at IS NULL AND status='active' THEN 1 ELSE 0 END) active, SUM(CASE WHEN deleted_at IS NULL AND status='archived' THEN 1 ELSE 0 END) archived, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) deleted FROM events`,
  ).first<{ total: number; active: number; archived: number; deleted: number }>();
  const rows = result.results.map((event) => adminEventCard(event, locale)).join("");
  return c.html(
    adminShell(
      locale === "el" ? "Βιβλιοθήκη" : "Library",
      `<main class="mx-auto max-w-7xl p-5 md:p-10"><div class="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><p class="text-sm font-semibold uppercase tracking-[.2em] text-[#6d28d9]">${locale === "el" ? "Βιβλιοθήκη" : "Library"}</p><h1 class="mt-1 text-4xl font-bold">${locale === "el" ? "Όλα τα events" : "All events"}</h1><p class="mt-2 text-[#6f657c]">${counts?.total ?? 0} ${locale === "el" ? "συνολικά" : "total"} · ${counts?.active ?? 0} ${locale === "el" ? "ενεργά" : "active"} · ${counts?.archived ?? 0} ${locale === "el" ? "αρχειοθετημένα" : "archived"} · ${counts?.deleted ?? 0} ${locale === "el" ? "διαγραμμένα" : "deleted"}</p></div><a href="/" class="rounded-xl bg-[#6d28d9] px-5 py-3 text-center font-semibold text-white">${locale === "el" ? "Νέο event" : "New event"}</a></div><form class="mb-6 grid gap-3 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-[1fr_auto_auto]"><input name="q" value="${esc(query)}" placeholder="${locale === "el" ? "Αναζήτηση ονόματος ή κωδικού" : "Search name or code"}" class="rounded-xl border px-4 py-3"><select name="status" class="rounded-xl border px-4 py-3"><option value="all"${status === "all" ? " selected" : ""}>${locale === "el" ? "Όλα" : "All"}</option><option value="active"${status === "active" ? " selected" : ""}>${locale === "el" ? "Ενεργά" : "Active"}</option><option value="archived"${status === "archived" ? " selected" : ""}>${locale === "el" ? "Αρχειοθετημένα" : "Archived"}</option><option value="deleted"${status === "deleted" ? " selected" : ""}>${locale === "el" ? "Διαγραμμένα" : "Deleted"}</option></select><button class="rounded-xl bg-[#24143b] px-5 py-3 font-semibold text-white">${locale === "el" ? "Φιλτράρισμα" : "Filter"}</button></form><div class="space-y-3">${rows || `<div class="rounded-2xl bg-white py-16 text-center text-[#6f657c]">${locale === "el" ? "Δεν βρέθηκαν events." : "No events found."}</div>`}</div></main>`,
      locale,
      (c as any).get("admin"),
    ),
  );
});

