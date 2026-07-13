export async function countActiveOwnedEvents(db: D1Database, userId: string) {
  const row = await db.prepare(`SELECT COUNT(*) AS total
    FROM event_members em
    JOIN events e ON e.id=em.event_id
    WHERE em.user_id=? AND em.role='owner' AND e.deleted_at IS NULL`)
    .bind(userId).first<{ total: number }>();
  return Number(row?.total ?? 0);
}

export async function buildAccountExport(db: D1Database, userId: string) {
  const [user, sessions, providers, memberships, invitations] = await Promise.all([
    db.prepare(`SELECT id,name,email,emailVerified,image,createdAt,updatedAt FROM "user" WHERE id=?`).bind(userId).first(),
    db.prepare(`SELECT id,createdAt,updatedAt,expiresAt,ipAddress,userAgent FROM session WHERE userId=? ORDER BY createdAt DESC`).bind(userId).all(),
    db.prepare(`SELECT providerId,createdAt,updatedAt FROM account WHERE userId=? ORDER BY createdAt`).bind(userId).all(),
    db.prepare(`SELECT e.id,e.code,e.eventName,e.created_at,e.updated_at,e.expires_at,e.status,e.default_locale,e.event_start_date,e.event_end_date,e.deleted_at,e.purge_at,em.role,em.created_at AS membership_created_at
      FROM event_members em JOIN events e ON e.id=em.event_id WHERE em.user_id=? ORDER BY em.created_at DESC`).bind(userId).all(),
    db.prepare(`SELECT id,event_id,email,role,created_at,expires_at,accepted_at FROM event_invitations WHERE invited_by=? ORDER BY created_at DESC`).bind(userId).all(),
  ]);
  if (!user) throw new Error("Account not found");
  return {
    exportVersion: "memboux-account-export-1",
    generatedAt: new Date().toISOString(),
    account: user,
    sessions: sessions.results,
    signInProviders: providers.results,
    eventMemberships: memberships.results,
    invitationsSent: invitations.results,
  };
}
