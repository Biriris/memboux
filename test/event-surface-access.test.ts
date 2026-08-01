import { describe, expect, it } from "vitest";
import type { EventRow } from "../src/domain";
import {
  eventSurfaceAccessToken,
  eventSurfaceCookieName,
  hasEventSurfaceAccess,
  type EventSurface,
} from "../src/gallery-access";

const event: EventRow = {
  id: "surface-event",
  code: "PIN123",
  eventName: "Protected wedding",
  admin_token_hash: "",
  created_at: 1,
  expires_at: Date.now() + 86_400_000,
  status: "active",
  notes: "",
  updated_at: 1,
  default_locale: "en",
  event_start_date: "2026-08-08",
  event_end_date: "2026-08-08",
  gallery_pin_hash: "legacy-hash",
  website_pin_hash: "website-hash",
  guest_gallery_pin_hash: "guest-hash",
  official_album_pin_hash: "official-hash",
  deleted_at: null,
  purge_at: null,
};

describe("event surface access", () => {
  it("uses independent cookies and tokens for every shared surface", async () => {
    const surfaces: EventSurface[] = ["website", "guest_gallery", "official_album"];
    const cookies = await Promise.all(surfaces.map(async (surface) =>
      `${eventSurfaceCookieName(event.code, surface)}=${await eventSurfaceAccessToken(event, surface)}`
    ));

    expect(new Set(cookies.map((cookie) => cookie.split("=", 1)[0])).size).toBe(3);
    for (let index = 0; index < surfaces.length; index += 1) {
      const request = new Request("https://memboux.com", { headers: { Cookie: cookies[index] } });
      for (let candidate = 0; candidate < surfaces.length; candidate += 1)
        expect(await hasEventSurfaceAccess(request, event, surfaces[candidate])).toBe(candidate === index);
    }
  });

  it("keeps an unprotected surface open independently of protected ones", async () => {
    const openWebsite = { ...event, website_pin_hash: null };
    expect(await hasEventSurfaceAccess(new Request("https://memboux.com"), openWebsite, "website")).toBe(true);
    expect(await hasEventSurfaceAccess(new Request("https://memboux.com"), openWebsite, "guest_gallery")).toBe(false);
  });
});
