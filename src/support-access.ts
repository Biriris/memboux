import type { AdminIdentity, AdminRole } from "./admin-rbac";

export type SupportConversationAccess = {
  assigned_admin_member_id?: string | null;
  required_role?: string | null;
};

export function adminCanAccessSupportConversation(
  admin: Pick<AdminIdentity, "memberId" | "role">,
  conversation: SupportConversationAccess,
) {
  if (admin.role === "owner" || admin.role === "administrator") return true;
  if (conversation.assigned_admin_member_id)
    return conversation.assigned_admin_member_id === admin.memberId;
  return conversation.required_role === admin.role;
}

export function roleCanReceiveSupportWork(role: AdminRole) {
  return ["owner", "administrator", "operations", "support", "finance", "moderator"].includes(role);
}
