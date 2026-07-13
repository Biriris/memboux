export type ProfessionalProfile = { user_id:string;business_name:string;slug:string;bio:string;website:string|null;status:"active"|"suspended" };
export type ProfessionalAssignmentStatus = "invited"|"accepted"|"revoked";

export async function getProfessionalProfile(db:D1Database,userId:string) {
  return db.prepare("SELECT user_id,business_name,slug,bio,website,status FROM professional_profiles WHERE user_id=?").bind(userId).first<ProfessionalProfile>();
}

export async function getProfessionalAssignment(db:D1Database,eventId:string,userId:string,status?:ProfessionalAssignmentStatus) {
  return db.prepare(`SELECT status FROM event_professional_assignments WHERE event_id=? AND professional_user_id=?${status?" AND status=?":""}`)
    .bind(...(status?[eventId,userId,status]:[eventId,userId])).first<{status:ProfessionalAssignmentStatus}>();
}

export async function canManageOfficialAlbum(db:D1Database,eventId:string,userId:string) {
  return Boolean(await getProfessionalAssignment(db,eventId,userId,"accepted"));
}

export async function trashProfessionalMedia(
  db: D1Database,
  eventId: string,
  userId: string,
  mediaIds: string[],
  now: number,
  purgeAt: number,
) {
  if (!mediaIds.length) return 0;
  const results = await db.batch(
    mediaIds.map((mediaId) =>
      db
        .prepare(
          `UPDATE media SET deleted_at=?,purge_at=?
           WHERE id=? AND event_id=? AND origin='official'
             AND uploaded_by_user_id=? AND deleted_at IS NULL
             AND EXISTS (
               SELECT 1 FROM event_professional_assignments a
               WHERE a.event_id=media.event_id
                 AND a.professional_user_id=? AND a.status='accepted'
             )`,
        )
        .bind(now, purgeAt, mediaId, eventId, userId, userId),
    ),
  );
  return results.reduce(
    (total, result) => total + Number(result.meta.changes ?? 0),
    0,
  );
}

export const validProfessionalSlug = (value: string) =>
  /^(?=.{3,50}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(value);
