import type { EventRow } from "./domain";
import { constantTimeEqual, cookieValue, sha256 } from "./utils";

export type EventSurface = "website" | "guest_gallery" | "official_album";
type SurfaceAccessEvent = Pick<EventRow, "id" | "code" | "gallery_pin_hash"> &
  Partial<Pick<EventRow, "website_pin_hash" | "guest_gallery_pin_hash" | "official_album_pin_hash">>;

export const eventSurfacePinHash = (event: SurfaceAccessEvent, surface: EventSurface) => {
  const current = surface === "website"
    ? event.website_pin_hash
    : surface === "official_album"
      ? event.official_album_pin_hash
      : event.guest_gallery_pin_hash;
  // The fallback keeps repositories and pre-0064 test schemas compatible while
  // production migrations copy the former shared PIN into all three surfaces.
  return current === undefined ? event.gallery_pin_hash : current;
};

export const eventSurfaceCookieName = (code: string, surface: EventSurface) =>
  surface === "guest_gallery"
    ? `memboux_gallery_${code.toLowerCase()}`
    : `memboux_${surface}_${code.toLowerCase()}`;

export const eventSurfaceAccessToken = (event: SurfaceAccessEvent, surface: EventSurface) =>
  surface === "guest_gallery"
    ? sha256(`gallery-access:${event.id}:${eventSurfacePinHash(event, surface)}`)
    : sha256(`event-surface-access:${surface}:${event.id}:${eventSurfacePinHash(event, surface)}`);

export async function hasEventSurfaceAccess(request: Request, event: SurfaceAccessEvent, surface: EventSurface) {
  if (!eventSurfacePinHash(event, surface)) return true;
  const cookie = cookieValue(request, eventSurfaceCookieName(event.code, surface)) ?? "";
  return constantTimeEqual(cookie, await eventSurfaceAccessToken(event, surface));
}

export const galleryCookieName = (code: string) => eventSurfaceCookieName(code, "guest_gallery");
export const galleryAccessToken = (event: SurfaceAccessEvent) => eventSurfaceAccessToken(event, "guest_gallery");

export async function hasGalleryAccess(request: Request, event: SurfaceAccessEvent) {
  return hasEventSurfaceAccess(request, event, "guest_gallery");
}
