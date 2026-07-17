import { describe, expect, it } from "vitest";
import type { EventRow } from "../src/domain";
import { renderEventWorkspace } from "../src/views/event-workspace";

const event: EventRow = {
  id: "event-1",
  code: "ABC123",
  eventName: "Summer in Zanzibar",
  admin_token_hash: "",
  created_at: 1,
  expires_at: 2,
  status: "active",
  notes: "",
  updated_at: 1,
  default_locale: "en",
  event_start_date: "2026-06-15",
  event_end_date: "2026-06-28",
  gallery_pin_hash: "pin-hash",
  deleted_at: null,
  purge_at: null,
};

const baseInput = {
  locale: "en" as const,
  event,
  user: { name: "Owner User", email: "owner@example.com" },
  items: [],
  members: [{ user_id: "owner-1", name: "Owner User", email: "owner@example.com", role: "owner" as const, created_at: 1 }],
  invitations: [],
  removalRequests: [],
  guestUrl: "https://memboux.com/gallery/ABC123",
  officialUrl: "https://memboux.com/gallery/ABC123/official",
  guestQrSvg: '<svg data-test="guest-qr"></svg>',
  officialQrSvg: '<svg data-test="official-qr"></svg>',
};

describe("event workspace", () => {
  it("merges gallery, sharing, settings, access and deletion for owners", () => {
    const html = renderEventWorkspace({ ...baseInput, membership: "owner" });

    expect(html).toContain('id="gallery"');
    expect(html).toContain('id="share"');
    expect(html).toContain('id="settings"');
    expect(html).toContain('id="people"');
    expect(html).toContain('id="danger"');
    expect(html).toContain('data-test="guest-qr"');
    expect(html).toContain('data-test="official-qr"');
    expect(html).toContain("data.invitationQrSvg");
    expect(html).toContain("dataset.invitationQr");
    expect(html).toContain(`/api/account/events/${event.code}/trash`);
    expect(html).toContain(`/gallery/${event.code}/official`);
  });

  it("keeps owner-only controls hidden from viewers", () => {
    const html = renderEventWorkspace({ ...baseInput, membership: "viewer", members: [] });

    expect(html).toContain('id="gallery"');
    expect(html).toContain("Download selected");
    expect(html).not.toContain('id="settings"');
    expect(html).not.toContain('id="people"');
    expect(html).not.toContain('id="danger"');
    expect(html).not.toContain("Delete selected");
  });
});
