import { isAdminRole, type AdminIdentity } from "./admin-rbac";

export function normalizeSupportStaffEmail(value: string) {
  return value.trim().toLowerCase().slice(0, 254);
}

export async function supportNotificationEmailInUse(
  db: D1Database,
  email: string,
  excludedMemberId: string,
) {
  const row = await db.prepare(
    `SELECT m.id
     FROM admin_members m JOIN "user" u ON u.id=m.user_id
     WHERE m.id!=?
       AND LOWER(COALESCE(NULLIF(m.notification_email,''),u.email))=?
     LIMIT 1`,
  ).bind(excludedMemberId, normalizeSupportStaffEmail(email)).first<{ id: string }>();
  return Boolean(row);
}

export async function supportStaffForSender(
  db: D1Database,
  email: string,
): Promise<AdminIdentity | null> {
  const rows = await db.prepare(
    `SELECT m.id member_id,m.role,u.id user_id,u.name,u.email
     FROM admin_members m JOIN "user" u ON u.id=m.user_id
     WHERE m.status='active'
       AND LOWER(COALESCE(NULLIF(m.notification_email,''),u.email))=?
     LIMIT 2`,
  ).bind(normalizeSupportStaffEmail(email)).all<{
    member_id: string;
    role: string;
    user_id: string;
    name: string;
    email: string;
  }>();
  if (rows.results.length !== 1) return null;
  const row = rows.results[0];
  if (!isAdminRole(row.role)) return null;
  return {
    memberId: row.member_id,
    role: row.role,
    userId: row.user_id,
    name: row.name,
    email: row.email,
  };
}
