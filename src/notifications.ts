export type AccountNotificationType = "invitation_accepted" | "media_uploaded";

type DirectNotificationInput = {
  userId: string;
  eventId: string;
  invitationId?: string | null;
  actorUserId?: string | null;
  actorName?: string | null;
  type: AccountNotificationType;
  itemCount?: number;
  createdAt?: number;
};

export async function createAccountNotification(db: D1Database, input: DirectNotificationInput) {
  return db.prepare(`INSERT INTO account_notifications
    (id,user_id,event_id,invitation_id,actor_user_id,actor_name,type,item_count,created_at,read_at)
    VALUES (?,?,?,?,?,?,?,?,?,NULL)`)
    .bind(
      crypto.randomUUID(),
      input.userId,
      input.eventId,
      input.invitationId ?? null,
      input.actorUserId ?? null,
      input.actorName?.slice(0, 100) ?? null,
      input.type,
      Math.max(1, input.itemCount ?? 1),
      input.createdAt ?? Date.now(),
    )
    .run();
}

type EventUploadNotificationInput = {
  eventId: string;
  actorUserId?: string | null;
  actorName: string;
  itemCount: number;
  createdAt?: number;
};

export async function notifyEventMembersAboutUpload(db: D1Database, input: EventUploadNotificationInput) {
  if (input.itemCount <= 0) return;
  const now = input.createdAt ?? Date.now();
  return db.prepare(`INSERT INTO account_notifications
    (id,user_id,event_id,invitation_id,actor_user_id,actor_name,type,item_count,created_at,read_at)
    SELECT lower(hex(randomblob(16))),em.user_id,em.event_id,NULL,?,?, 'media_uploaded',?,?,NULL
    FROM event_members em
    WHERE em.event_id=?`)
    .bind(
      input.actorUserId ?? null,
      input.actorName.slice(0, 100),
      input.itemCount,
      now,
      input.eventId,
    )
    .run();
}
