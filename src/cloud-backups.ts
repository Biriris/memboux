import type { Bindings } from "./domain";
import { queueDropboxBackupForEvent } from "./dropbox";
import { queueGoogleDriveBackupForEvent } from "./google-drive";

export async function queueAutomaticCloudBackupsForEvent(env: Bindings, eventId: string) {
  const destinations = await env.DB.prepare(
    `SELECT em.user_id,cc.provider FROM event_members em
     JOIN events e ON e.id=em.event_id
     JOIN cloud_connections cc ON cc.user_id=em.user_id
     WHERE em.event_id=? AND e.deleted_at IS NULL`,
  ).bind(eventId).all<{ user_id: string; provider: "google_drive" | "dropbox" }>();
  for (const destination of destinations.results) {
    if (destination.provider === "google_drive") {
      await queueGoogleDriveBackupForEvent(env, eventId, destination.user_id);
    } else if (destination.provider === "dropbox") {
      await queueDropboxBackupForEvent(env, eventId, destination.user_id);
    }
  }
}

export async function queueConnectedCloudBackupsForAcceptedEvent(
  env: Bindings,
  eventId: string,
  userId: string,
) {
  const providers = await env.DB.prepare(
    "SELECT provider FROM cloud_connections WHERE user_id=?",
  ).bind(userId).all<{ provider: "google_drive" | "dropbox" }>();
  for (const connection of providers.results) {
    if (connection.provider === "google_drive") await queueGoogleDriveBackupForEvent(env, eventId, userId);
    if (connection.provider === "dropbox") await queueDropboxBackupForEvent(env, eventId, userId);
  }
}

export async function reconcileAutomaticCloudBackups(env: Bindings) {
  const eventIds = await env.DB.prepare(
    `SELECT DISTINCT em.event_id FROM event_members em
     JOIN events e ON e.id=em.event_id
     JOIN cloud_connections cc ON cc.user_id=em.user_id
     WHERE e.deleted_at IS NULL`,
  ).all<{ event_id: string }>();
  for (const event of eventIds.results) await queueAutomaticCloudBackupsForEvent(env, event.event_id);
}
