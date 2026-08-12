import { sendEmail } from "./auth";
import type { Bindings } from "./domain";
import { supportTicketSubject } from "./support-email-threading";
import { DMARC_AGGREGATE_REPORT_SUBJECT_SQL } from "./support-email-filter";

type ReminderConversation = {
  id: string;
  subject: string;
  category: string;
  priority: string;
  first_response_due_at: number;
  assigned_admin_member_id: string | null;
  assignee_name: string | null;
  assignee_email: string | null;
  assignee_notifications: number | null;
  sla_reminder_sent_at: number | null;
  sla_reminder_last_attempt_at: number | null;
  sla_escalation_sent_at: number | null;
  sla_escalation_last_attempt_at: number | null;
};

const validEmail = (value: string | null) => Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
const htmlEsc = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]!));
const RETRY_AFTER_MS = 30 * 60_000;

export function supportSlaReminderKind(
  dueAt: number,
  firstResponseAt: number | null,
  reminderSentAt: number | null,
  escalationSentAt: number | null,
  now = Date.now(),
) {
  if (firstResponseAt) return null;
  if (dueAt <= now && !escalationSentAt) return "overdue" as const;
  if (dueAt > now && dueAt <= now + 60 * 60_000 && !reminderSentAt) return "at_risk" as const;
  return null;
}

async function sendSlaEmail(
  env: Bindings,
  conversation: ReminderConversation,
  recipient: { name: string; email: string },
  kind: "at_risk" | "overdue",
) {
  const link = `https://memboux.com/admin/support/${encodeURIComponent(conversation.id)}`;
  const due = new Date(conversation.first_response_due_at).toISOString();
  const heading = kind === "overdue" ? "Support SLA overdue" : "Support SLA approaching";
  return sendEmail(env, {
    to: recipient.email,
    purpose: "support_staff_notification",
    from: "Memboux Helpdesk <support@mail.memboux.com>",
    replyTo: "support@memboux.com",
    subject: supportTicketSubject(conversation.id, `[Memboux ${conversation.priority}] ${heading}: ${conversation.subject}`),
    text: `${heading}\nConversation: ${conversation.subject}\nCategory: ${conversation.category}\nFirst-response deadline: ${due}\n\nReply directly from your registered address to answer the customer, or open securely: ${link}\n\nAttachments are recorded but are not imported yet.`,
    html: `<div style="font-family:Arial,sans-serif;color:#2b174d;max-width:600px"><p style="text-transform:uppercase;letter-spacing:.12em;color:#8b5cf6">Memboux Helpdesk</p><h1>${heading}</h1><p>Hello ${htmlEsc(recipient.name)},</p><p><strong>Conversation:</strong> ${htmlEsc(conversation.subject)}</p><p><strong>Category:</strong> ${htmlEsc(conversation.category)}</p><p><strong>First-response deadline:</strong> ${due}</p><p style="line-height:1.6"><strong>Reply directly to this email</strong> from your registered address to answer the customer, or open the complete conversation in Admin Centre.</p><p style="margin-top:24px"><a href="${link}" style="background:#2b174d;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px">Open conversation</a></p><p style="font-size:12px;color:#7f7489">Memboux verifies your address and ticket assignment before accepting the reply. Attachments are recorded but are not imported yet.</p></div>`,
  });
}

export async function reconcileSupportSlaReminders(env: Bindings, now = Date.now()) {
  const retryBefore = now - RETRY_AFTER_MS;
  const rows = await env.DB.prepare(`SELECT c.id,c.subject,c.category,c.priority,c.first_response_due_at,
      c.assigned_admin_member_id,c.sla_reminder_sent_at,c.sla_reminder_last_attempt_at,
      c.sla_escalation_sent_at,c.sla_escalation_last_attempt_at,
      u.name assignee_name,COALESCE(NULLIF(m.notification_email,''),u.email) assignee_email,
      m.support_notifications_enabled assignee_notifications
    FROM support_conversations c
    LEFT JOIN admin_members m ON m.id=c.assigned_admin_member_id
    LEFT JOIN "user" u ON u.id=m.user_id
    WHERE c.status!='closed' AND c.first_admin_response_at IS NULL AND c.first_response_due_at IS NOT NULL
      AND c.subject NOT LIKE ?
      AND c.first_response_due_at<=?
      AND ((c.first_response_due_at>? AND c.sla_reminder_sent_at IS NULL
            AND (c.sla_reminder_status IS NULL OR c.sla_reminder_status='failed')
            AND (c.sla_reminder_last_attempt_at IS NULL OR c.sla_reminder_last_attempt_at<=?))
        OR (c.first_response_due_at<=? AND c.sla_escalation_sent_at IS NULL
            AND (c.sla_escalation_status IS NULL OR c.sla_escalation_status='failed')
            AND (c.sla_escalation_last_attempt_at IS NULL OR c.sla_escalation_last_attempt_at<=?)))
    ORDER BY c.first_response_due_at ASC LIMIT 50`)
    .bind(DMARC_AGGREGATE_REPORT_SUBJECT_SQL, now + 60 * 60_000, now, retryBefore, now, retryBefore)
    .all<ReminderConversation>();

  let reminders = 0;
  let escalations = 0;
  for (const conversation of rows.results) {
    const kind = supportSlaReminderKind(
      conversation.first_response_due_at,
      null,
      conversation.sla_reminder_sent_at,
      conversation.sla_escalation_sent_at,
      now,
    );
    if (!kind) continue;
    const prefix = kind === "at_risk" ? "sla_reminder" : "sla_escalation";
    let recipient = conversation.assignee_name && conversation.assignee_email
      ? { name: conversation.assignee_name, email: conversation.assignee_email, enabled: conversation.assignee_notifications === 1 }
      : null;
    if (kind === "overdue") {
      const supervisor = await env.DB.prepare(`SELECT u.name,
          COALESCE(NULLIF(m.notification_email,''),u.email) email,m.support_notifications_enabled enabled
        FROM admin_members m JOIN "user" u ON u.id=m.user_id
        WHERE m.status='active' AND m.role IN ('owner','administrator')
        ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END,m.granted_at LIMIT 1`)
        .first<{ name: string; email: string; enabled: number }>();
      if (supervisor) recipient = { name: supervisor.name, email: supervisor.email, enabled: supervisor.enabled === 1 };
    }
    await env.DB.prepare(`UPDATE support_conversations SET ${prefix}_status='pending',
      ${prefix}_last_attempt_at=?,sla_notification_last_error=NULL WHERE id=?`).bind(now, conversation.id).run();
    if (!recipient) {
      await env.DB.prepare(`UPDATE support_conversations SET ${prefix}_status='unassigned' WHERE id=?`)
        .bind(conversation.id).run();
      continue;
    }
    if (!recipient.enabled) {
      await env.DB.prepare(`UPDATE support_conversations SET ${prefix}_status='disabled' WHERE id=?`)
        .bind(conversation.id).run();
      continue;
    }
    if (!validEmail(recipient.email)) {
      await env.DB.prepare(`UPDATE support_conversations SET ${prefix}_status='invalid_recipient' WHERE id=?`)
        .bind(conversation.id).run();
      continue;
    }
    try {
      await sendSlaEmail(env, conversation, recipient, kind);
      await env.DB.prepare(`UPDATE support_conversations SET ${prefix}_status='sent',
        ${prefix}_sent_at=?,sla_notification_last_error=NULL WHERE id=?`).bind(now, conversation.id).run();
      if (kind === "at_risk") reminders++;
      else escalations++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await env.DB.prepare(`UPDATE support_conversations SET ${prefix}_status='failed',
        sla_notification_last_error=? WHERE id=?`).bind(message.slice(0, 180), conversation.id).run();
    }
  }
  return { processed: rows.results.length, reminders, escalations };
}
