export type ManagedEventRole = "viewer" | "editor" | "professional";

type PersonRoleChange = {
  eventId: string;
  userId: string;
  assignedBy: string;
  role: ManagedEventRole;
  now: number;
};

export function normalizeManagedEventRole(value: unknown): ManagedEventRole | null {
  return value === "viewer" || value === "editor" || value === "professional" ? value : null;
}

export async function changeEventPersonRole(db: D1Database, input: PersonRoleChange): Promise<boolean> {
  const person = await db.prepare(`SELECT u.name,u.email,em.role member_role,
      CASE WHEN a.status!='revoked' THEN a.status ELSE NULL END professional_status
    FROM "user" u
    LEFT JOIN event_members em ON em.user_id=u.id AND em.event_id=?
    LEFT JOIN event_professional_assignments a ON a.professional_user_id=u.id AND a.event_id=?
    WHERE u.id=? AND (em.user_id IS NOT NULL OR (a.professional_user_id IS NOT NULL AND a.status!='revoked'))`)
    .bind(input.eventId, input.eventId, input.userId)
    .first<{ name: string; email: string; member_role: string | null; professional_status: string | null }>();
  if (!person || person.member_role === "owner") return false;

  if (input.role === "professional") {
    const slug = `professional-${input.userId.replace(/[^a-z0-9]/gi, "").slice(0, 20).toLowerCase()}`;
    await db.batch([
      db.prepare(`INSERT INTO professional_profiles
        (user_id,business_name,slug,bio,website,status,created_at,updated_at)
        VALUES (?,?,?,'',NULL,'active',?,?)
        ON CONFLICT(user_id) DO UPDATE SET updated_at=excluded.updated_at`)
        .bind(input.userId, (person.name || person.email.split("@")[0]).slice(0, 100), slug, input.now, input.now),
      db.prepare(`INSERT INTO event_professional_assignments
        (event_id,professional_user_id,assigned_by,status,created_at,accepted_at,updated_at)
        VALUES (?,?,?,'accepted',?,?,?)
        ON CONFLICT(event_id,professional_user_id) DO UPDATE SET
          assigned_by=excluded.assigned_by,status='accepted',accepted_at=excluded.accepted_at,updated_at=excluded.updated_at`)
        .bind(input.eventId, input.userId, input.assignedBy, input.now, input.now, input.now),
      db.prepare("DELETE FROM event_members WHERE event_id=? AND user_id=? AND role!='owner'")
        .bind(input.eventId, input.userId),
    ]);
    return true;
  }

  await db.batch([
    db.prepare(`INSERT INTO event_members (event_id,user_id,role,created_at)
      VALUES (?,?,?,?)
      ON CONFLICT(event_id,user_id) DO UPDATE SET role=excluded.role
      WHERE event_members.role!='owner'`)
      .bind(input.eventId, input.userId, input.role, input.now),
    db.prepare(`UPDATE event_professional_assignments SET status='revoked',updated_at=?
      WHERE event_id=? AND professional_user_id=? AND status!='revoked'`)
      .bind(input.now, input.eventId, input.userId),
  ]);
  return true;
}

export async function changePendingInvitationRole(
  db: D1Database,
  eventId: string,
  invitationId: string,
  role: ManagedEventRole,
): Promise<boolean> {
  const result = await db.prepare(`UPDATE event_invitations
    SET role=?,invitation_kind=?
    WHERE id=? AND event_id=? AND accepted_at IS NULL AND declined_at IS NULL AND expires_at>?`)
    .bind(role === "professional" ? "viewer" : role, role === "professional" ? "professional" : "member", invitationId, eventId, Date.now())
    .run();
  return Boolean(result.meta.changes);
}

export async function removeEventPersonAccess(db: D1Database, eventId: string, userId: string, now: number): Promise<boolean> {
  const target = await db.prepare("SELECT role FROM event_members WHERE event_id=? AND user_id=?")
    .bind(eventId, userId)
    .first<{ role: string }>();
  if (target?.role === "owner") return false;
  const results = await db.batch([
    db.prepare("DELETE FROM event_members WHERE event_id=? AND user_id=? AND role!='owner'").bind(eventId, userId),
    db.prepare(`UPDATE event_professional_assignments SET status='revoked',updated_at=?
      WHERE event_id=? AND professional_user_id=? AND status!='revoked'`).bind(now, eventId, userId),
  ]);
  return results.some((result) => Boolean(result.meta.changes));
}
