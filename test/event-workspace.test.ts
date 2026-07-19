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
  event_type: "trip",
  location: "Zanzibar, Tanzania",
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
  coverSourceMediaId: null,
  coverUpdatedAt: null,
};

describe("event workspace", () => {
  it("orders the owner workspace without a duplicate event details section", () => {
    const html = renderEventWorkspace({ ...baseInput, membership: "owner" });

    expect(html).toContain('id="gallery"');
    expect(html).toContain('id="share"');
    expect(html).not.toContain('id="settings"');
    expect(html).not.toContain("Event details");
    expect(html).toContain('id="people"');
    expect(html).toContain('id="danger"');
    expect(html).toContain('data-test="guest-qr"');
    expect(html).toContain('data-test="official-qr"');
    expect(html).toContain("data.invitationQrSvg");
    expect(html).toContain("dataset.invitationQr");
    expect(html).toContain(`/api/account/events/${event.code}/trash`);
    expect(html).toContain(`/gallery/${event.code}/official`);
    expect(html).toContain("data-inline-editor");
    expect(html).toContain('data-field="name"');
    expect(html).toContain('data-field="dates"');
    expect(html).toContain('data-field="location"');
    expect(html).toContain('data-event-type-locked');
    expect(html).not.toContain('data-event-type-form');
    expect(html).not.toContain('name="eventType"');
    expect(html).toContain("Trip &amp; vacation");
    expect(html).toContain("cannot be changed");
    expect(html).toContain('id="template"');
    expect(html).toContain('data-event-template="generic"');
    expect(html).toContain("Set up your event");
    expect(html).toContain('data-event-metadata');
    expect(html).toContain("Zanzibar, Tanzania");
    expect(html).toContain('data-gallery-sort="owner-gallery"');
    expect(html).toContain('data-gallery-grid="owner-gallery"');
    expect(html).toContain("0 photos");
    expect(html).toContain('data-gallery-photo-count="0"');
    expect(html).not.toContain("data-gallery-filter");
    expect(html).not.toContain('id="owner-set-cover"');
    expect(html).not.toContain('id="owner-cover-form"');
    expect(html).toContain('data-event-pin-toggle');
    expect(html).toContain('right-5 top-5');
    expect(html).toContain('data-location-picker');
    expect(html).toContain('name="locationPlaceId"');
    expect(html).toContain('name="locationLat"');
    expect(html).toContain('data-location-map-open');
    expect(html).toContain("actions.before(editor)");
    expect(html).not.toContain("Privacy and PIN");
    expect(html.indexOf('id="engagement"')).toBeLessThan(html.indexOf('id="share"'));
    expect(html.indexOf('id="share"')).toBeLessThan(html.indexOf('id="gallery"'));
    expect(html.indexOf('id="gallery"')).toBeLessThan(html.indexOf('id="people"'));
    expect(html.indexOf('id="people"')).toBeLessThan(html.indexOf('id="danger"'));
    const header = html.slice(0, html.indexOf("</header>"));
    expect(header).not.toContain("Preview album");
    expect(header).not.toContain("data-event-pin-toggle");
    expect(html).toContain('id="lightbox-like"');
    expect(html).toContain('id=\'lightbox-comments-button\'');
    expect(html).toContain(`/api/gallery/${event.code}/media/`);
  });

  it("keeps retained videos out of the event dashboard gallery", () => {
    const html = renderEventWorkspace({
      ...baseInput,
      membership: "owner",
      items: [
        {
          id: "dashboard-photo",
          event_id: event.id,
          object_key: "events/event-1/photo.jpg",
          media_type: "image",
          content_type: "image/jpeg",
          uploaded_by: "Guest",
          uploaded_at: 10,
          captured_at: null,
          content_hash: "photo-hash",
          origin: "guest",
          uploaded_by_user_id: null,
          reported_at: null,
          size_bytes: 100,
          title: null,
          deleted_at: null,
          purge_at: null,
        },
        {
          id: "dashboard-video",
          event_id: event.id,
          object_key: "events/event-1/video.mp4",
          media_type: "video",
          content_type: "video/mp4",
          uploaded_by: "Guest",
          uploaded_at: 11,
          captured_at: null,
          content_hash: "video-hash",
          origin: "guest",
          uploaded_by_user_id: null,
          reported_at: null,
          size_bytes: 100,
          title: null,
          deleted_at: null,
          purge_at: null,
        },
      ],
    });

    expect(html).toContain("dashboard-photo");
    expect(html).not.toContain("dashboard-video");
    expect(html).not.toContain("Videos");
    expect(html).toContain("1 photo");
    expect(html).toContain('data-gallery-photo-count="1"');
    expect(html).toContain("data-media-cover");
    expect(html).toContain("Set as cover");
    expect(html).toContain('name="mediaId" value="dashboard-photo"');
    expect(html).not.toContain('id="owner-set-cover"');
  });

  it("keeps owner-only controls hidden from viewers", () => {
    const html = renderEventWorkspace({ ...baseInput, membership: "viewer", members: [] });

    expect(html).toContain('id="gallery"');
    expect(html).toContain("Download selected");
    expect(html).toContain("Trip &amp; vacation");
    expect(html).toContain('data-event-type-locked');
    expect(html).not.toContain('data-event-type-form');
    expect(html).not.toContain('id="settings"');
    expect(html).not.toContain('id="people"');
    expect(html).not.toContain('id="danger"');
    expect(html).not.toContain("Delete selected");
    expect(html).not.toContain("data-media-cover");
  });

  it("uses the specialized wedding checklist without changing the existing gallery workspace", () => {
    const html = renderEventWorkspace({
      ...baseInput,
      event: { ...event, event_type: "wedding", eventName: "Our wedding" },
      membership: "owner",
      weddingUrl: "https://memboux.com/wedding/ABC123",
      weddingQrSvg: '<svg data-test="wedding-qr"></svg>',
    });

    expect(html).toContain('data-event-template="wedding"');
    expect(html).toContain("Build your wedding experience");
    expect(html).toContain("Couple &amp; story");
    expect(html).toContain("Ceremony &amp; reception");
    expect(html).toContain("Features &amp; estimate");
    expect(html).toContain(`/dashboard/${event.code}/wedding/setup?lang=en&amp;step=1`);
    expect(html).toContain(`/dashboard/${event.code}/wedding/setup?lang=en&amp;step=2`);
    expect(html).toContain(`/dashboard/${event.code}/wedding/setup?lang=en&amp;step=4`);
    expect(html).toContain('id="gallery"');
    expect(html).toContain('id="share"');
    expect(html).toContain('data-test="wedding-qr"');
    expect(html).toContain("lg:grid-cols-3");
    expect(html).toContain("flex h-full min-w-0 flex-col");
    expect(html).not.toContain('name="eventType"');
  });

  it("manages members, professionals and pending invitations from People and roles", () => {
    const html = renderEventWorkspace({
      ...baseInput,
      membership: "owner",
      members: [
        ...baseInput.members,
        { user_id: "member-1", name: "Member", email: "member@example.com", role: "editor", created_at: 2 },
        { user_id: "pro-1", name: "Photographer", email: "photo@example.com", role: "professional", access_status: "accepted", created_at: 3 },
      ],
      invitations: [{ id: "invite-1", event_id: event.id, email: "pending@example.com", role: "viewer", invitation_kind: "professional", created_at: 4, expires_at: 5, accepted_at: null, declined_at: null }],
    });

    expect(html).toContain(`/api/account/events/${event.code}/members/role`);
    expect(html).toContain("Professional / official photographer");
    expect(html).toContain('name="userId" value="pro-1"');
    expect(html).toContain('name="invitationId" value="invite-1"');
    expect(html).not.toContain(`/dashboard/${event.code}/professional`);
  });
});
