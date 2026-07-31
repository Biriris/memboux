import type { CloudProvider } from "./domain";
import { eventOriginalExportsAllowed } from "./event-access";

export type CloudBackupAuthorization =
  | { allowed: true }
  | { allowed: false; reason: "not_connected" | "not_member" | "originals_locked" };

export async function authorizeCloudBackup(
  db: D1Database,
  eventId: string,
  userId: string,
  provider: CloudProvider,
): Promise<CloudBackupAuthorization> {
  const connection = await db.prepare(
    "SELECT 1 FROM cloud_connections WHERE user_id=? AND provider=?",
  ).bind(userId, provider).first();
  if (!connection) return { allowed: false, reason: "not_connected" };

  const membership = await db.prepare(
    `SELECT 1 FROM event_members em JOIN events e ON e.id=em.event_id
     WHERE em.event_id=? AND em.user_id=? AND e.deleted_at IS NULL`,
  ).bind(eventId, userId).first();
  if (!membership) return { allowed: false, reason: "not_member" };

  if (!(await eventOriginalExportsAllowed(db, eventId))) {
    return { allowed: false, reason: "originals_locked" };
  }

  return { allowed: true };
}
