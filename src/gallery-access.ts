import type { EventRow } from "./domain";
import { constantTimeEqual, cookieValue, sha256 } from "./utils";

export const galleryCookieName = (code: string) => `memboux_gallery_${code.toLowerCase()}`;
export const galleryAccessToken = (event: EventRow) =>
  sha256(`gallery-access:${event.id}:${event.gallery_pin_hash}`);

export async function hasGalleryAccess(request: Request, event: EventRow) {
  if (!event.gallery_pin_hash) return true;
  const cookie = cookieValue(request, galleryCookieName(event.code)) ?? "";
  return constantTimeEqual(cookie, await galleryAccessToken(event));
}
