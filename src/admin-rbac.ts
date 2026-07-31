import type { Bindings } from "./domain";
import { currentUser } from "./session";
import { sha256 } from "./utils";

export const adminRoles = [
  "owner",
  "administrator",
  "operations",
  "support",
  "finance",
  "moderator",
  "analyst",
] as const;

export type AdminRole = typeof adminRoles[number];

export type AdminPermission =
  | "team.manage"
  | "users.read"
  | "users.write"
  | "users.delete"
  | "events.read"
  | "events.write"
  | "events.delete"
  | "support.read"
  | "support.write"
  | "billing.read"
  | "billing.write"
  | "moderation.read"
  | "moderation.write"
  | "privacy.read"
  | "privacy.write"
  | "system.read";

export type AdminIdentity = {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  role: AdminRole;
};

export const adminRoleProfiles: Record<AdminRole, {
  level: number;
  label: { el: string; en: string };
  description: { el: string; en: string };
}> = {
  owner: { level: 100, label: { el: "Platform Owner / Superadmin", en: "Platform Owner / Superadmin" }, description: { el: "Ανώτατη πρόσβαση, ασφάλεια και διαχείριση της admin ομάδας.", en: "Root access, security and admin-team management." } },
  administrator: { level: 80, label: { el: "Operations Administrator", en: "Operations Administrator" }, description: { el: "Ευρεία λειτουργική πρόσβαση χωρίς αλλαγές στους admin ρόλους.", en: "Broad operational access without admin-role management." } },
  operations: { level: 60, label: { el: "Event Operations", en: "Event Operations" }, description: { el: "Χρήστες, εκδηλώσεις και καθημερινή λειτουργία.", en: "Users, events and day-to-day operations." } },
  support: { level: 50, label: { el: "Member Support", en: "Member Support" }, description: { el: "Αιτήματα υποστήριξης και απαραίτητη προβολή λογαριασμών.", en: "Support cases and the account context required to resolve them." } },
  finance: { level: 50, label: { el: "Billing & Finance", en: "Billing & Finance" }, description: { el: "Πακέτα, πληρωμές και οικονομικά αιτήματα.", en: "Plans, payments and billing cases." } },
  moderator: { level: 50, label: { el: "Trust & Safety", en: "Trust & Safety" }, description: { el: "Αναφορές περιεχομένου, moderation και ασφάλεια κοινότητας.", en: "Content reports, moderation and community safety." } },
  analyst: { level: 20, label: { el: "Analyst · μόνο ανάγνωση", en: "Analyst · read only" }, description: { el: "Στοιχεία λειτουργίας χωρίς δικαίωμα αλλαγών.", en: "Operational insights without mutation rights." } },
};

const allPermissions: AdminPermission[] = [
  "team.manage", "users.read", "users.write", "users.delete",
  "events.read", "events.write", "events.delete", "support.read",
  "support.write", "billing.read", "billing.write", "moderation.read",
  "moderation.write", "privacy.read", "privacy.write", "system.read",
];

export const rolePermissions: Record<AdminRole, readonly AdminPermission[]> = {
  owner: allPermissions,
  administrator: allPermissions.filter((permission) => permission !== "team.manage"),
  operations: ["users.read", "users.write", "events.read", "events.write", "support.read", "support.write", "system.read"],
  support: ["users.read", "events.read", "support.read", "support.write"],
  finance: ["users.read", "support.read", "support.write", "billing.read", "billing.write"],
  moderator: ["users.read", "events.read", "support.read", "support.write", "moderation.read", "moderation.write"],
  analyst: ["users.read", "events.read", "support.read", "billing.read", "moderation.read", "system.read"],
};

type AdminContext = {
  env: Bindings;
  req: { raw: Request; path: string; method: string };
};

export function isAdminRole(value: unknown): value is AdminRole {
  return adminRoles.includes(value as AdminRole);
}

export function adminCan(role: AdminRole, permission: AdminPermission) {
  return rolePermissions[role].includes(permission);
}

export function adminHomeForRole(role: AdminRole) {
  if (role === "support") return "/admin/support";
  if (role === "finance") return "/admin/accounts";
  if (role === "moderator") return "/admin/reported";
  return "/admin/users";
}

export async function currentAdmin(context: AdminContext): Promise<AdminIdentity | null> {
  const user = await currentUser(context);
  if (!user) return null;
  const member = await context.env.DB.prepare(
    `SELECT m.id member_id,m.role,u.id user_id,u.name,u.email
     FROM admin_members m JOIN "user" u ON u.id=m.user_id
     WHERE m.user_id=? AND m.status='active'`,
  ).bind(user.id).first<{
    member_id: string;
    role: AdminRole;
    user_id: string;
    name: string;
    email: string;
  }>();
  if (!member || !isAdminRole(member.role)) return null;
  return {
    memberId: member.member_id,
    userId: member.user_id,
    name: member.name,
    email: member.email,
    role: member.role,
  };
}

export function permissionForAdminRequest(path: string, method: string): AdminPermission | null {
  const write = method !== "GET" && method !== "HEAD";
  if (path.startsWith("/admin/profile")) return "support.read";
  if (path.startsWith("/admin/team")) return "team.manage";
  if (path.startsWith("/admin/support")) return write ? "support.write" : "support.read";
  if (path.startsWith("/admin/accounts")) return write ? "billing.write" : "billing.read";
  if (path.startsWith("/admin/reported") || path.startsWith("/admin/trash")) return write ? "moderation.write" : "moderation.read";
  if (path.startsWith("/admin/privacy-requests")) return write ? "privacy.write" : "privacy.read";
  if (path.startsWith("/admin/readiness")) return "system.read";
  if (path.startsWith("/admin/users")) {
    if (/\/(entitlement|payments|subscription|quick-plan|quick-subscription)$/.test(path)) {
      return write ? "billing.write" : "billing.read";
    }
    if (/\/delete$/.test(path)) return "users.delete";
    return write ? "users.write" : "users.read";
  }
  if (path.startsWith("/admin/events") || path.startsWith("/admin/media") || path.startsWith("/admin/professionals")) {
    if (/\/delete$/.test(path)) return "events.delete";
    return write ? "events.write" : "events.read";
  }
  if (path === "/admin" || path.startsWith("/admin/language/")) return "users.read";
  return null;
}

export async function recordAdminAudit(
  context: AdminContext,
  actor: AdminIdentity,
  action: string,
  targetType: string,
  targetId: string | null,
  metadata: Record<string, string | number | boolean | null> = {},
) {
  const ip = context.req.raw.headers.get("CF-Connecting-IP") ?? "";
  const ipHash = ip ? await sha256(`memboux-admin-audit:${context.env.BETTER_AUTH_SECRET}:${ip}`) : null;
  await context.env.DB.prepare(
    `INSERT INTO admin_audit_log
     (id,actor_user_id,action,target_type,target_id,metadata_json,ip_hash,created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).bind(
    crypto.randomUUID(),
    actor.userId,
    action.slice(0, 100),
    targetType.slice(0, 60),
    targetId,
    JSON.stringify(metadata).slice(0, 4000),
    ipHash,
    Date.now(),
  ).run();
}
