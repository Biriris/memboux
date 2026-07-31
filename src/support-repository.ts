import type { SupportAttachmentRow } from "./support-attachments";
import type { SupportPriority } from "./support-sla";
import type { AdminRole } from "./admin-rbac";

export type SupportConversation = {
  id: string;
  user_id: string | null;
  visitor_name: string;
  visitor_email: string;
  subject: string;
  status: "open" | "pending" | "closed";
  admin_read_at: number | null;
  user_read_at: number | null;
  last_message_at: number;
  created_at: number;
  category?: string;
  required_role?: string | null;
  assigned_admin_member_id?: string | null;
  notification_delivery_status?: "pending" | "sent" | "failed" | "disabled" | "invalid_recipient" | "unassigned" | null;
  notification_last_attempt_at?: number | null;
  notification_delivery_outcome?: string | null;
  priority?: SupportPriority;
  first_response_due_at?: number | null;
  first_admin_response_at?: number | null;
  resolved_at?: number | null;
  sla_reminder_status?: string | null;
  sla_reminder_last_attempt_at?: number | null;
  sla_escalation_status?: string | null;
  sla_escalation_last_attempt_at?: number | null;
  sla_notification_last_error?: string | null;
  assigned_name?: string | null;
  assigned_role?: string | null;
  source?: "chat" | "email";
};

export type SupportMessage = {
  id: string;
  sender_type: "user" | "admin" | "system";
  body: string;
  created_at: number;
  email_delivery_status?: "pending" | "sent" | "failed" | null;
  email_delivery_outcome?: string | null;
  email_provider_message_id?: string | null;
};

export type StoredSupportAttachment = SupportAttachmentRow & {
  conversation_id: string;
  object_key: string;
};

export type NewSupportConversation = {
  id: string;
  messageId: string;
  userId: string | null;
  visitorTokenHash: string | null;
  visitorName: string;
  visitorEmail: string;
  subject: string;
  category: string;
  message: string;
  now: number;
};

export type SupportInboxFilters = {
  status: "all" | SupportConversation["status"];
  category: string;
  sla: "all" | "overdue" | "at_risk";
  assignee: "all" | "mine" | "unassigned";
};

export type SupportInboxRow = SupportConversation & {
  account_name: string | null;
  account_email: string | null;
  assigned_name: string | null;
  assigned_role: string | null;
  last_message: string | null;
  last_sender: string | null;
};

export type SupportInboxMetrics = {
  total: number;
  open_count: number;
  overdue_count: number;
  unassigned_count: number;
};

export type SupportAdminMember = {
  id: string;
  role: AdminRole;
  name: string;
};

export type ReassignableSupportConversation = SupportConversation & {
  latest_message: string | null;
};

export type AdminSupportConversation = SupportConversation & {
  assigned_name: string | null;
  assigned_role: string | null;
};

export class SupportRepository {
  constructor(private readonly db: D1Database) {}

  findLatestForUser(userId: string) {
    return this.db.prepare(
      "SELECT * FROM support_conversations WHERE user_id=? ORDER BY last_message_at DESC LIMIT 1",
    ).bind(userId).first<SupportConversation>();
  }

  findForVisitorTokenHash(tokenHash: string) {
    return this.db.prepare(
      "SELECT * FROM support_conversations WHERE visitor_token_hash=? LIMIT 1",
    ).bind(tokenHash).first<SupportConversation>();
  }

  findById(conversationId: string) {
    return this.db.prepare("SELECT * FROM support_conversations WHERE id=?")
      .bind(conversationId).first<SupportConversation>();
  }

  findAdminConversation(conversationId: string) {
    return this.db.prepare(`SELECT c.*,u.name assigned_name,m.role assigned_role
      FROM support_conversations c
      LEFT JOIN admin_members m ON m.id=c.assigned_admin_member_id
      LEFT JOIN "user" u ON u.id=m.user_id
      WHERE c.id=?`).bind(conversationId).first<AdminSupportConversation>();
  }

  listAdminInbox(
    filters: SupportInboxFilters,
    admin: { memberId: string; role: AdminRole },
    now: number,
  ) {
    return this.db.prepare(`SELECT c.*,u.name account_name,u.email account_email,
        assigned_user.name assigned_name,assigned_member.role assigned_role,
        (SELECT body FROM support_messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) last_message,
        (SELECT sender_type FROM support_messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) last_sender
      FROM support_conversations c LEFT JOIN "user" u ON u.id=c.user_id
      LEFT JOIN admin_members assigned_member ON assigned_member.id=c.assigned_admin_member_id
      LEFT JOIN "user" assigned_user ON assigned_user.id=assigned_member.user_id
      WHERE (?='all' OR c.status=?)
        AND (?='all' OR c.category=?)
        AND (?='all'
          OR (?='overdue' AND c.first_admin_response_at IS NULL AND c.first_response_due_at<=?)
          OR (?='at_risk' AND c.first_admin_response_at IS NULL AND c.first_response_due_at>? AND c.first_response_due_at<=?))
        AND (?='all'
          OR (?='mine' AND c.assigned_admin_member_id=?)
          OR (?='unassigned' AND c.assigned_admin_member_id IS NULL))
        AND (? IN ('owner','administrator') OR c.assigned_admin_member_id=? OR (c.assigned_admin_member_id IS NULL AND c.required_role=?))
      ORDER BY CASE c.status WHEN 'open' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,c.last_message_at DESC LIMIT 200`)
      .bind(
        filters.status, filters.status, filters.category, filters.category,
        filters.sla, filters.sla, now, filters.sla, now, now + 60 * 60_000,
        filters.assignee, filters.assignee, admin.memberId, filters.assignee,
        admin.role, admin.memberId, admin.role,
      ).all<SupportInboxRow>();
  }

  adminInboxMetrics(admin: { memberId: string; role: AdminRole }, now: number) {
    return this.db.prepare(`SELECT
        COUNT(*) total,
        SUM(CASE WHEN c.status='open' THEN 1 ELSE 0 END) open_count,
        SUM(CASE WHEN c.first_admin_response_at IS NULL AND c.first_response_due_at<=? THEN 1 ELSE 0 END) overdue_count,
        SUM(CASE WHEN c.assigned_admin_member_id IS NULL AND c.status!='closed' THEN 1 ELSE 0 END) unassigned_count
      FROM support_conversations c
      WHERE (? IN ('owner','administrator') OR c.assigned_admin_member_id=? OR (c.assigned_admin_member_id IS NULL AND c.required_role=?))`)
      .bind(now, admin.role, admin.memberId, admin.role)
      .first<SupportInboxMetrics>();
  }

  listActiveAdminMembers() {
    return this.db.prepare(
      `SELECT m.id,m.role,u.name FROM admin_members m JOIN "user" u ON u.id=m.user_id
       WHERE m.status='active' ORDER BY u.name`,
    ).all<SupportAdminMember>();
  }

  findForReassignment(conversationId: string) {
    return this.db.prepare(
      `SELECT c.*,(SELECT body FROM support_messages m WHERE m.conversation_id=c.id
        AND m.sender_type='user' ORDER BY m.created_at DESC LIMIT 1) latest_message
       FROM support_conversations c WHERE c.id=?`,
    ).bind(conversationId).first<ReassignableSupportConversation>();
  }

  findActiveAdminMember(memberId: string) {
    return this.db.prepare(
      `SELECT m.id,m.role,u.name FROM admin_members m JOIN "user" u ON u.id=m.user_id
       WHERE m.id=? AND m.status='active'`,
    ).bind(memberId).first<SupportAdminMember>();
  }

  claimConversation(conversationId: string, adminMemberId: string, now: number) {
    return this.db.prepare(
      "UPDATE support_conversations SET assigned_admin_member_id=?,updated_at=? WHERE id=? AND assigned_admin_member_id IS NULL",
    ).bind(adminMemberId, now, conversationId).run();
  }

  reassignConversation(conversationId: string, target: Pick<SupportAdminMember, "id" | "role">, now: number) {
    return this.db.prepare(`UPDATE support_conversations SET
      assigned_admin_member_id=?,required_role=?,
      notification_sent_at=NULL,notification_delivery_status=NULL,
      notification_delivery_outcome=NULL,notification_provider_message_id=NULL,
      notification_last_error=NULL,updated_at=?
      WHERE id=?`).bind(target.id, target.role, now, conversationId).run();
  }

  async adminMessagesAndAttachments(conversationId: string) {
    const [messages, attachments] = await Promise.all([
      this.db.prepare(`SELECT id,sender_type,body,created_at,email_delivery_status,
        email_delivery_outcome,email_provider_message_id
        FROM support_messages WHERE conversation_id=? ORDER BY created_at ASC LIMIT 150`)
        .bind(conversationId).all<SupportMessage>(),
      this.db.prepare(
        `SELECT id,message_id,filename,content_type,size_bytes
         FROM support_attachments WHERE conversation_id=? ORDER BY created_at,id`,
      ).bind(conversationId).all<SupportAttachmentRow>(),
    ]);
    return { messages: messages.results, attachments: attachments.results };
  }

  markAdminRead(conversationId: string, now: number) {
    return this.db.prepare("UPDATE support_conversations SET admin_read_at=? WHERE id=?")
      .bind(now, conversationId).run();
  }

  latestCustomerMessage(conversationId: string) {
    return this.db.prepare(
      "SELECT body FROM support_messages WHERE conversation_id=? AND sender_type='user' ORDER BY created_at DESC LIMIT 1",
    ).bind(conversationId).first<{ body: string }>();
  }

  prepareStaffNotificationRetry(conversationId: string, now: number) {
    return this.db.prepare(`UPDATE support_conversations SET
      notification_sent_at=NULL,notification_delivery_status=NULL,
      notification_delivery_outcome=NULL,notification_provider_message_id=NULL,
      notification_delivery_event_at=NULL,notification_last_error=NULL,
      notification_last_attempt_at=?
      WHERE id=? AND notification_delivery_status='failed'`)
      .bind(now, conversationId).run();
  }

  findAdminMessage(conversationId: string, messageId: string) {
    return this.db.prepare(`SELECT id,body,email_delivery_status FROM support_messages
      WHERE id=? AND conversation_id=? AND sender_type='admin'`)
      .bind(messageId, conversationId)
      .first<Pick<SupportMessage, "id" | "body" | "email_delivery_status">>();
  }

  prepareMessageEmailRetry(messageId: string) {
    return this.db.prepare(`UPDATE support_messages SET
      email_delivery_status='pending',email_delivery_outcome=NULL,
      email_provider_message_id=NULL,email_delivery_event_at=NULL
      WHERE id=? AND email_delivery_status='failed'`)
      .bind(messageId).run();
  }

  markMessageEmailSent(messageId: string, providerMessageId: string | null, now: number) {
    return this.db.prepare(`UPDATE support_messages SET email_delivery_status='sent',
      email_delivery_outcome='accepted',email_provider_message_id=?,email_delivery_event_at=? WHERE id=?`)
      .bind(providerMessageId, now, messageId).run();
  }

  markMessageEmailFailed(messageId: string) {
    return this.db.prepare("UPDATE support_messages SET email_delivery_status='failed' WHERE id=?")
      .bind(messageId).run();
  }

  async messagesAndAttachments(conversationId: string) {
    const [messages, attachments] = await Promise.all([
      this.db.prepare(
        "SELECT id,sender_type,body,created_at FROM support_messages WHERE conversation_id=? ORDER BY created_at ASC LIMIT 150",
      ).bind(conversationId).all<SupportMessage>(),
      this.db.prepare(
        `SELECT id,message_id,filename,content_type,size_bytes
         FROM support_attachments WHERE conversation_id=? ORDER BY created_at,id`,
      ).bind(conversationId).all<SupportAttachmentRow>(),
    ]);
    return { messages: messages.results, attachments: attachments.results };
  }

  markUserRead(conversationId: string, now: number) {
    return this.db.prepare("UPDATE support_conversations SET user_read_at=? WHERE id=?")
      .bind(now, conversationId).run();
  }

  async createWithInitialMessage(input: NewSupportConversation) {
    await this.db.batch([
      this.db.prepare(`INSERT INTO support_conversations
        (id,user_id,visitor_token_hash,visitor_name,visitor_email,subject,status,category,last_message_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,'open',?,?,?,?)`)
        .bind(
          input.id,
          input.userId,
          input.visitorTokenHash,
          input.visitorName,
          input.visitorEmail,
          input.subject,
          input.category,
          input.now,
          input.now,
          input.now,
        ),
      this.db.prepare(
        "INSERT INTO support_messages (id,conversation_id,sender_type,sender_user_id,body,created_at) VALUES (?,?,?,?,?,?)",
      ).bind(input.messageId, input.id, "user", input.userId, input.message, input.now),
    ]);
    return this.findById(input.id);
  }

  async appendCustomerMessage(
    conversationId: string,
    messageId: string,
    userId: string | null,
    message: string,
    now: number,
  ) {
    await this.db.batch([
      this.db.prepare(
        "INSERT INTO support_messages (id,conversation_id,sender_type,sender_user_id,body,created_at) VALUES (?,?,?,?,?,?)",
      ).bind(messageId, conversationId, "user", userId, message, now),
      this.db.prepare(`UPDATE support_conversations SET
        status='open',admin_read_at=NULL,notification_sent_at=NULL,
        notification_delivery_status=NULL,notification_last_error=NULL,
        last_message_at=?,updated_at=? WHERE id=?`)
        .bind(now, now, conversationId),
    ]);
    return this.findById(conversationId);
  }

  markHumanOwned(conversationId: string, adminMemberId: string, now: number) {
    return this.db.prepare(`UPDATE support_conversations SET
      status='pending',user_read_at=NULL,
      assigned_admin_member_id=COALESCE(assigned_admin_member_id,?),
      escalated_at=COALESCE(escalated_at,?),
      first_admin_response_at=COALESCE(first_admin_response_at,?),
      last_message_at=?,updated_at=? WHERE id=?`)
      .bind(adminMemberId, now, now, now, now, conversationId).run();
  }

  createAdminReply(
    conversationId: string,
    messageId: string,
    adminMemberId: string,
    message: string,
    shouldEmail: boolean,
    now: number,
  ) {
    return this.db.batch([
      this.db.prepare(
        "INSERT INTO support_messages (id,conversation_id,sender_type,body,created_at,actor_admin_member_id,email_delivery_status) VALUES (?,?,?,?,?,?,?)",
      ).bind(messageId, conversationId, "admin", message, now, adminMemberId, shouldEmail ? "pending" : null),
      this.db.prepare(`UPDATE support_conversations SET
        status='pending',user_read_at=NULL,
        assigned_admin_member_id=COALESCE(assigned_admin_member_id,?),
        escalated_at=COALESCE(escalated_at,?),
        first_admin_response_at=COALESCE(first_admin_response_at,?),
        last_message_at=?,updated_at=? WHERE id=?`)
        .bind(adminMemberId, now, now, now, now, conversationId),
    ]);
  }

  setStatus(conversationId: string, status: "open" | "closed", now: number) {
    return this.db.prepare(
      "UPDATE support_conversations SET status=?,resolved_at=?,updated_at=? WHERE id=?",
    ).bind(status, status === "closed" ? now : null, now, conversationId).run();
  }

  findAttachment(attachmentId: string, conversationId: string) {
    return this.db.prepare(
      `SELECT id,conversation_id,message_id,object_key,filename,content_type,size_bytes
       FROM support_attachments WHERE id=? AND conversation_id=?`,
    ).bind(attachmentId, conversationId).first<StoredSupportAttachment>();
  }
}
