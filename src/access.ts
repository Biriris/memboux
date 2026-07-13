import type { EventRole } from "./domain";

export type EventCapability = "view" | "manage_media" | "manage_event" | "manage_members";

const capabilities: Record<EventRole, ReadonlySet<EventCapability>> = {
  owner: new Set(["view", "manage_media", "manage_event", "manage_members"]),
  editor: new Set(["view", "manage_media"]),
  viewer: new Set(["view"]),
};

export const roleCan = (role: EventRole | null, capability: EventCapability) => Boolean(role && capabilities[role].has(capability));

export async function getEventRole(db: D1Database, eventId: string, userId: string): Promise<EventRole | null> {
  const membership = await db.prepare("SELECT role FROM event_members WHERE event_id=? AND user_id=?")
    .bind(eventId, userId)
    .first<{ role: EventRole }>();
  return membership?.role ?? null;
}
