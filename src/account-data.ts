export async function countActiveOwnedEvents(db: D1Database, userId: string) {
  const row = await db.prepare(`SELECT COUNT(*) AS total
    FROM event_members em
    JOIN events e ON e.id=em.event_id
    WHERE em.user_id=? AND em.role='owner' AND e.deleted_at IS NULL`)
    .bind(userId).first<{ total: number }>();
  return Number(row?.total ?? 0);
}

export async function buildAccountExport(db: D1Database, userId: string) {
  const [
    user,
    sessions,
    providers,
    memberships,
    invitations,
    professionalProfile,
    professionalAssignments,
    officialUploads,
    officialAlbumContributions,
  ] = await Promise.all([
    db.prepare(`SELECT id,name,email,emailVerified,image,createdAt,updatedAt FROM "user" WHERE id=?`).bind(userId).first(),
    db.prepare(`SELECT id,createdAt,updatedAt,expiresAt,ipAddress,userAgent FROM session WHERE userId=? ORDER BY createdAt DESC`).bind(userId).all(),
    db.prepare(`SELECT providerId,createdAt,updatedAt FROM account WHERE userId=? ORDER BY createdAt`).bind(userId).all(),
    db.prepare(`SELECT e.id,e.code,e.eventName,e.created_at,e.updated_at,e.expires_at,e.status,e.default_locale,e.event_start_date,e.event_end_date,e.deleted_at,e.purge_at,em.role,em.created_at AS membership_created_at
      FROM event_members em JOIN events e ON e.id=em.event_id WHERE em.user_id=? ORDER BY em.created_at DESC`).bind(userId).all(),
    db.prepare(`SELECT id,event_id,email,role,created_at,expires_at,accepted_at FROM event_invitations WHERE invited_by=? ORDER BY created_at DESC`).bind(userId).all(),
    db.prepare(`SELECT business_name,slug,bio,website,status,created_at,updated_at
      FROM professional_profiles WHERE user_id=?`).bind(userId).first(),
    db.prepare(`SELECT a.event_id,e.code,e.eventName,a.status,a.created_at,a.accepted_at,a.updated_at
      FROM event_professional_assignments a
      JOIN events e ON e.id=a.event_id
      WHERE a.professional_user_id=? ORDER BY a.created_at DESC`).bind(userId).all(),
    db.prepare(`SELECT m.id,m.event_id,e.code,e.eventName,m.media_type,m.content_type,m.uploaded_at,
      m.captured_at,m.size_bytes,m.deleted_at,m.purge_at
      FROM media m JOIN events e ON e.id=m.event_id
      WHERE m.uploaded_by_user_id=? ORDER BY m.uploaded_at DESC`).bind(userId).all(),
    db.prepare(`SELECT o.event_id,e.code,e.eventName,o.media_id,o.position,o.created_at
      FROM official_album_items o JOIN events e ON e.id=o.event_id
      WHERE o.added_by=? ORDER BY o.created_at DESC`).bind(userId).all(),
  ]);
  if (!user) throw new Error("Account not found");
  return {
    exportVersion: "memboux-account-export-2",
    generatedAt: new Date().toISOString(),
    account: user,
    sessions: sessions.results,
    signInProviders: providers.results,
    eventMemberships: memberships.results,
    invitationsSent: invitations.results,
    professionalProfile,
    professionalAssignments: professionalAssignments.results,
    officialUploads: officialUploads.results,
    officialAlbumContributions: officialAlbumContributions.results,
  };
}
