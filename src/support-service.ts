import type { AdminIdentity } from "./admin-rbac";
import { adminCanAccessSupportConversation } from "./support-access";
import type { SupportAttachmentRow } from "./support-attachments";
import {
  SupportRepository,
  type NewSupportConversation,
  type SupportConversation,
  type SupportInboxFilters,
} from "./support-repository";
import { roleCanHandleSupportCategory, type SupportCategory } from "./support-routing";

const supportCategories: readonly SupportCategory[] = [
  "technical", "account", "events", "billing", "privacy", "moderation", "general",
];

function supportCategory(value: string | undefined): SupportCategory {
  return supportCategories.includes(value as SupportCategory) ? value as SupportCategory : "general";
}

export type SupportActor = {
  userId: string | null;
  visitorTokenHash: string | null;
};

export class SupportService {
  constructor(private readonly repository: SupportRepository) {}

  findConversationForActor(actor: SupportActor) {
    if (actor.userId) return this.repository.findLatestForUser(actor.userId);
    if (actor.visitorTokenHash) return this.repository.findForVisitorTokenHash(actor.visitorTokenHash);
    return Promise.resolve(null);
  }

  createConversation(input: NewSupportConversation) {
    return this.repository.createWithInitialMessage(input);
  }

  async loadAdminInbox(admin: AdminIdentity, filters: SupportInboxFilters, now = Date.now()) {
    const [rows, metrics] = await Promise.all([
      this.repository.listAdminInbox(filters, admin, now),
      this.repository.adminInboxMetrics(admin, now),
    ]);
    return { rows: rows.results, metrics };
  }

  async eligibleAdminMembers(categoryValue: string | undefined) {
    const category = supportCategory(categoryValue);
    const members = await this.repository.listActiveAdminMembers();
    return members.results.filter((member) => roleCanHandleSupportCategory(category, member.role));
  }

  appendCustomerMessage(conversationId: string, userId: string | null, message: string, now = Date.now()) {
    return this.repository.appendCustomerMessage(conversationId, crypto.randomUUID(), userId, message, now);
  }

  async conversationPayload(conversation: SupportConversation, markRead = true) {
    const { messages, attachments } = await this.repository.messagesAndAttachments(conversation.id);
    const attachmentsByMessage = new Map<string, SupportAttachmentRow[]>();
    for (const attachment of attachments) {
      const list = attachmentsByMessage.get(attachment.message_id) ?? [];
      list.push(attachment);
      attachmentsByMessage.set(attachment.message_id, list);
    }
    if (markRead && (!conversation.user_read_at || conversation.last_message_at > conversation.user_read_at)) {
      await this.repository.markUserRead(conversation.id, Date.now());
    }
    return {
      conversation: {
        id: conversation.id,
        name: conversation.visitor_name,
        email: conversation.visitor_email,
        subject: conversation.subject,
        status: conversation.status,
      },
      messages: messages.map((message) => ({
        ...message,
        sender_type: message.sender_type === "system" ? "admin" : message.sender_type,
        attachments: (attachmentsByMessage.get(message.id) ?? []).map((attachment) => ({
          id: attachment.id,
          filename: attachment.filename,
          contentType: attachment.content_type,
          sizeBytes: attachment.size_bytes,
          href: `/api/support/attachments/${attachment.id}`,
        })),
      })),
    };
  }

  async findAccessibleAdminConversation(admin: AdminIdentity, conversationId: string) {
    const conversation = await this.repository.findById(conversationId);
    if (!conversation) return { kind: "not_found" as const };
    if (!adminCanAccessSupportConversation(admin, conversation)) return { kind: "forbidden" as const };
    return { kind: "ok" as const, conversation };
  }

  async loadAdminThread(admin: AdminIdentity, conversationId: string, now = Date.now()) {
    const conversation = await this.repository.findAdminConversation(conversationId);
    if (!conversation) return { kind: "not_found" as const };
    if (!adminCanAccessSupportConversation(admin, conversation)) return { kind: "forbidden" as const };
    const [{ messages, attachments }] = await Promise.all([
      this.repository.adminMessagesAndAttachments(conversation.id),
      this.repository.markAdminRead(conversation.id, now),
    ]);
    return { kind: "ok" as const, conversation, messages, attachments };
  }

  async changeStatus(admin: AdminIdentity, conversationId: string, status: "open" | "closed", now = Date.now()) {
    const access = await this.findAccessibleAdminConversation(admin, conversationId);
    if (access.kind !== "ok") return access;
    await this.repository.setStatus(conversationId, status, now);
    return { kind: "ok" as const, conversation: access.conversation };
  }

  async claimConversation(admin: AdminIdentity, conversationId: string, now = Date.now()) {
    const access = await this.findAccessibleAdminConversation(admin, conversationId);
    if (access.kind !== "ok") return access;
    const result = await this.repository.claimConversation(conversationId, admin.memberId, now);
    if (!result.meta.changes) return { kind: "conflict" as const };
    return {
      kind: "ok" as const,
      conversation: access.conversation,
      requiredRole: access.conversation.required_role ?? "unassigned",
    };
  }

  async reassignConversation(
    admin: AdminIdentity,
    conversationId: string,
    targetMemberId: string,
    now = Date.now(),
  ) {
    if (admin.role !== "owner" && admin.role !== "administrator") return { kind: "forbidden" as const };
    const conversation = await this.repository.findForReassignment(conversationId);
    if (!conversation) return { kind: "not_found" as const, target: "conversation" as const };
    if (conversation.status === "closed") return { kind: "closed" as const };
    const target = await this.repository.findActiveAdminMember(targetMemberId);
    if (!target) return { kind: "not_found" as const, target: "member" as const };
    const category = supportCategory(conversation.category);
    if (!roleCanHandleSupportCategory(category, target.role)) return { kind: "ineligible" as const };
    await this.repository.reassignConversation(conversation.id, target, now);
    return {
      kind: "ok" as const,
      conversation,
      target,
      previousAssignee: conversation.assigned_admin_member_id ?? null,
    };
  }

  async prepareStaffNotificationRetry(
    admin: AdminIdentity,
    conversationId: string,
    now = Date.now(),
  ) {
    const access = await this.findAccessibleAdminConversation(admin, conversationId);
    if (access.kind !== "ok") return access;
    if (access.conversation.notification_delivery_status !== "failed") {
      return { kind: "not_retryable" as const, conversation: access.conversation };
    }
    const prepared = await this.repository.prepareStaffNotificationRetry(conversationId, now);
    if (!prepared.meta.changes) return { kind: "not_retryable" as const, conversation: access.conversation };
    const latest = await this.repository.latestCustomerMessage(conversationId);
    return { kind: "ok" as const, conversation: access.conversation, latestMessage: latest?.body ?? "" };
  }

  async prepareCustomerEmailRetry(
    admin: AdminIdentity,
    conversationId: string,
    messageId: string,
  ) {
    const access = await this.findAccessibleAdminConversation(admin, conversationId);
    if (access.kind !== "ok") return access;
    if (!access.conversation.visitor_email) {
      return { kind: "no_recipient" as const, conversation: access.conversation };
    }
    const message = await this.repository.findAdminMessage(conversationId, messageId);
    if (!message) return { kind: "message_not_found" as const, conversation: access.conversation };
    if (message.email_delivery_status === "sent") {
      return { kind: "already_sent" as const, conversation: access.conversation };
    }
    if (message.email_delivery_status !== "failed") {
      return { kind: "not_retryable" as const, conversation: access.conversation };
    }
    const prepared = await this.repository.prepareMessageEmailRetry(message.id);
    if (!prepared.meta.changes) return { kind: "not_retryable" as const, conversation: access.conversation };
    return { kind: "ok" as const, conversation: access.conversation, message };
  }

  markMessageEmailSent(messageId: string, providerMessageId: string | null, now = Date.now()) {
    return this.repository.markMessageEmailSent(messageId, providerMessageId, now);
  }

  markMessageEmailFailed(messageId: string) {
    return this.repository.markMessageEmailFailed(messageId);
  }

  markHumanOwned(conversationId: string, adminMemberId: string, now = Date.now()) {
    return this.repository.markHumanOwned(conversationId, adminMemberId, now);
  }

  createAdminReply(
    conversationId: string,
    messageId: string,
    adminMemberId: string,
    message: string,
    shouldEmail: boolean,
    now = Date.now(),
  ) {
    return this.repository.createAdminReply(
      conversationId,
      messageId,
      adminMemberId,
      message,
      shouldEmail,
      now,
    );
  }
}
