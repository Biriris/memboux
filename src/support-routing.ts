import { sendEmail } from "./auth";
import type { AdminRole } from "./admin-rbac";
import type { Bindings } from "./domain";
import { supportFirstResponseDueAt } from "./support-sla";
import { supportTicketSubject } from "./support-email-threading";

export type SupportCategory =
  | "technical"
  | "account"
  | "events"
  | "billing"
  | "privacy"
  | "moderation"
  | "general";

type SupportAssignment = {
  memberId: string;
  name: string;
  email: string;
  role: AdminRole;
  notificationsEnabled: boolean;
};

const categoryRoles: Record<SupportCategory, readonly AdminRole[]> = {
  billing: ["finance", "administrator", "owner"],
  privacy: ["owner", "administrator"],
  moderation: ["moderator", "administrator", "owner"],
  technical: ["operations", "administrator", "owner"],
  account: ["support", "operations", "administrator", "owner"],
  events: ["operations", "support", "administrator", "owner"],
  general: ["support", "operations", "administrator", "owner"],
};

export function roleCanHandleSupportCategory(category: SupportCategory, role: AdminRole) {
  return categoryRoles[category].includes(role);
}

const htmlEsc = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]!));

export function classifySupportRequest(subject: string, message: string): SupportCategory {
  const text = `${subject} ${message}`.toLocaleLowerCase("el");
  if (/(bill|payment|invoice|refund|charge|plan|subscription|πληρω|χρέω|τιμολ|συνδρομ)/.test(text)) return "billing";
  if (/(privacy|gdpr|personal data|delete my data|απόρρη|προσωπικ.*δεδομ|διαγραφ.*δεδομ)/.test(text)) return "privacy";
  if (/(report|abuse|harass|offensive|copyright|reported|παρενόχλ|αναφορ|προσβλητ|πνευματικ)/.test(text)) return "moderation";
  if (/(login|account|password|verification|hacked|security|λογαριασ|σύνδεσ|κωδικ|παραβιασ)/.test(text)) return "account";
  if (/(event|gallery|album|invite|invitation|wedding|γάμ|εκδήλωσ|πρόσκλησ)/.test(text)) return "events";
  if (/(upload|download|error|bug|broken|slow|photo|video|ανέβ|κατέβ|σφάλμ|φωτογραφ|βίντεο)/.test(text)) return "technical";
  return "general";
}

function categoryLabel(category: SupportCategory) {
  return {
    technical: "Technical",
    account: "Account & access",
    events: "Events & galleries",
    billing: "Billing",
    privacy: "Privacy & GDPR",
    moderation: "Trust & safety",
    general: "General support",
  }[category];
}

async function chooseAssignee(env: Bindings, category: SupportCategory): Promise<SupportAssignment | null> {
  const roles = categoryRoles[category];
  const placeholders = roles.map(() => "?").join(",");
  const ordering = roles.map((role, index) => `WHEN '${role}' THEN ${index}`).join(" ");
  const member = await env.DB.prepare(
    `SELECT m.id member_id,m.role,u.name,
       COALESCE(NULLIF(m.notification_email,''),u.email) notification_email,
       m.support_notifications_enabled,
       (SELECT count(*) FROM support_conversations c
        WHERE c.assigned_admin_member_id=m.id AND c.status!='closed') open_count
     FROM admin_members m JOIN "user" u ON u.id=m.user_id
     WHERE m.status='active' AND m.role IN (${placeholders})
     ORDER BY CASE m.role ${ordering} ELSE 99 END,open_count ASC,m.granted_at ASC
     LIMIT 1`,
  ).bind(...roles).first<{
    member_id: string;
    role: AdminRole;
    name: string;
    notification_email: string;
    support_notifications_enabled: number;
  }>().catch(() => null);
  if (!member) return null;
  return {
    memberId: member.member_id,
    role: member.role,
    name: member.name,
    email: member.notification_email,
    notificationsEnabled: member.support_notifications_enabled === 1,
  };
}

export async function escalateSupportConversation(
  env: Bindings,
  conversationId: string,
  subject: string,
  latestMessage: string,
  reason: string,
  preferredCategory?: SupportCategory,
) {
  const category = preferredCategory ?? classifySupportRequest(subject, latestMessage);
  const sla = supportFirstResponseDueAt(category);
  const existing = await env.DB.prepare(
    `SELECT c.assigned_admin_member_id,c.notification_sent_at,m.role,u.name,
      COALESCE(NULLIF(m.notification_email,''),u.email) notification_email,
      m.support_notifications_enabled
     FROM support_conversations c
     LEFT JOIN admin_members m ON m.id=c.assigned_admin_member_id
     LEFT JOIN "user" u ON u.id=m.user_id WHERE c.id=?`,
  ).bind(conversationId).first<{
    assigned_admin_member_id: string | null;
    notification_sent_at: number | null;
    role: AdminRole | null;
    name: string | null;
    notification_email: string | null;
    support_notifications_enabled: number | null;
  }>().catch(() => null);
  const assignee = existing?.assigned_admin_member_id && existing.role && existing.name && existing.notification_email
    ? {
        memberId: existing.assigned_admin_member_id,
        role: existing.role,
        name: existing.name,
        email: existing.notification_email,
        notificationsEnabled: existing.support_notifications_enabled === 1,
      }
    : await chooseAssignee(env, category);
  const now = Date.now();
  await env.DB.prepare(
    `UPDATE support_conversations SET category=?,required_role=?,
     assigned_admin_member_id=?,escalated_at=COALESCE(escalated_at,?),
     priority=?,first_response_due_at=COALESCE(first_response_due_at,?),updated_at=?
     WHERE id=?`,
  ).bind(category, categoryRoles[category][0], assignee?.memberId ?? null, now, sla.priority, sla.dueAt, now, conversationId).run();
  if (existing?.notification_sent_at) return assignee;
  if (!assignee) {
    await env.DB.prepare(
      "UPDATE support_conversations SET notification_delivery_status='unassigned',notification_last_attempt_at=? WHERE id=?",
    ).bind(now, conversationId).run();
    return assignee;
  }
  if (!assignee.notificationsEnabled) {
    await env.DB.prepare(
      "UPDATE support_conversations SET notification_delivery_status='disabled',notification_last_attempt_at=? WHERE id=?",
    ).bind(now, conversationId).run();
    return assignee;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assignee.email)) {
    await env.DB.prepare(
      "UPDATE support_conversations SET notification_delivery_status='invalid_recipient',notification_last_attempt_at=? WHERE id=?",
    ).bind(now, conversationId).run();
    return assignee;
  }

  const link = `https://memboux.com/admin/support/${encodeURIComponent(conversationId)}`;
  const preview = latestMessage.replace(/\s+/g, " ").trim().slice(0, 240);
  await env.DB.prepare(
    "UPDATE support_conversations SET notification_delivery_status='pending',notification_last_attempt_at=?,notification_last_error=NULL WHERE id=?",
  ).bind(now, conversationId).run();
  try {
    const providerMessageId = await sendEmail(env, {
      to: assignee.email,
      purpose: "support_staff_notification",
      from: "Memboux Helpdesk <support@mail.memboux.com>",
      replyTo: "support@memboux.com",
      subject: supportTicketSubject(conversationId, `[Memboux ${categoryLabel(category)}] New conversation`),
      text: `A support conversation was assigned to you.\nCategory: ${categoryLabel(category)}\nReason: ${reason}\nPreview: ${preview}\n\nReply directly from this registered address to answer the customer, or open securely in Admin Centre: ${link}\n\nAttachments are recorded but are not imported yet.`,
      html: `<div style="font-family:Arial,sans-serif;color:#2b174d;max-width:600px"><p style="text-transform:uppercase;letter-spacing:.12em;color:#8b5cf6">Memboux Helpdesk</p><h1>New assigned conversation</h1><p><strong>Category:</strong> ${htmlEsc(categoryLabel(category))}</p><p><strong>Reason:</strong> ${htmlEsc(reason)}</p><div style="background:#f8f5ff;border-radius:12px;padding:16px">${htmlEsc(preview)}</div><p style="margin-top:20px;line-height:1.6"><strong>Reply directly to this email</strong> from your registered address to answer the customer, or use Admin Centre for the complete conversation.</p><p style="margin-top:24px"><a href="${link}" style="background:#2b174d;color:white;text-decoration:none;padding:12px 18px;border-radius:10px">Open in Admin Centre</a></p><p style="font-size:12px;color:#7f7489">Memboux verifies your address and ticket assignment before accepting the reply. Attachments are recorded but are not imported yet.</p></div>`,
    });
    await env.DB.prepare(
      `UPDATE support_conversations
       SET notification_sent_at=?,notification_delivery_status='sent',
           notification_delivery_outcome='accepted',
           notification_provider_message_id=?,notification_delivery_event_at=?,
           notification_last_error=NULL
       WHERE id=?`,
    ).bind(Date.now(), providerMessageId, Date.now(), conversationId).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await env.DB.prepare(
      "UPDATE support_conversations SET notification_delivery_status='failed',notification_last_error=? WHERE id=?",
    ).bind(message.slice(0, 180), conversationId).run();
    console.error(JSON.stringify({
      event: "support_assignment_email_failed",
      conversationId,
      assigneeId: assignee.memberId,
      error: message,
    }));
  }
  return assignee;
}
