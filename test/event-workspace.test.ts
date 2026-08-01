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
  it("organizes the owner workspace with role-aware navigation and settings", () => {
    const html = renderEventWorkspace({ ...baseInput, membership: "owner" });

    expect(html).toContain("data-event-workspace-shell");
    expect(html).toContain('data-event-role="owner"');
    expect(html).toContain('data-workspace-section-link="overview"');
    expect(html).toContain('href="#template"');
    expect(html).toContain('href="#gallery"');
    expect(html).toContain('href="#engagement"');
    expect(html).toContain('href="#share"');
    expect(html).toContain('href="#people"');
    expect(html).toContain('href="#event-access"');
    expect(html).toContain('href="#settings"');
    expect(html).toContain('id="gallery"');
    expect(html).toContain('id="share"');
    expect(html).toContain('id="settings"');
    expect(html).toContain("Event details");
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
    expect(html).toContain('data-event-template="trip"');
    expect(html).toContain("Build the complete event page");
    expect(html).toContain(`/dashboard/${event.code}/setup?lang=en`);
    expect(html).toContain(`/event/${event.code}?lang=en&amp;preview=1`);
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
    expect(html).toContain("Guest gallery protection");
    expect(html).toContain(`/api/account/events/${event.code}/privacy`);
    expect(html.indexOf('id="gallery"')).toBeLessThan(html.indexOf('id="engagement"'));
    expect(html.indexOf('id="engagement"')).toBeLessThan(html.indexOf('id="share"'));
    expect(html.indexOf('id="share"')).toBeLessThan(html.indexOf('id="people"'));
    expect(html.indexOf('id="people"')).toBeLessThan(html.indexOf('id="event-access"'));
    expect(html.indexOf('id="event-access"')).toBeLessThan(html.indexOf('id="settings"'));
    expect(html.indexOf('id="settings"')).toBeLessThan(html.indexOf('id="danger"'));
    const header = html.slice(0, html.indexOf("</header>"));
    expect(header).not.toContain("Preview album");
    expect(header).not.toContain("data-event-pin-toggle");
    expect(html).toContain('id="lightbox-like"');
    expect(html).toContain('id=\'lightbox-comments-button\'');
    expect(html).toContain(`/api/gallery/${event.code}/media/`);
  });

  it("shows photos and videos in the event dashboard gallery", () => {
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
    expect(html).toContain("dashboard-video");
    expect(html).toContain("1 video");
    expect(html).toContain("1 photo");
    expect(html).toContain("Perspectives collected");
    expect(html).toContain("people who contributed");
    expect(html).toContain('data-gallery-photo-count="1"');
    expect(html).toContain("data-media-cover");
    expect(html).toContain("Set as cover");
    expect(html).toContain('name="mediaId" value="dashboard-photo"');
    expect(html).not.toContain('id="owner-set-cover"');
  });

  it("keeps owner-only controls hidden from viewers", () => {
    const html = renderEventWorkspace({ ...baseInput, membership: "viewer", members: [] });

    expect(html).toContain("data-event-workspace-shell");
    expect(html).toContain('data-event-role="viewer"');
    expect(html).toContain('data-workspace-section-link="overview"');
    expect(html).toContain('data-workspace-section-link="gallery"');
    expect(html).toContain('data-workspace-section-link="share"');
    expect(html).not.toContain('data-workspace-section-link="template"');
    expect(html).not.toContain('data-workspace-section-link="engagement"');
    expect(html).not.toContain('data-workspace-section-link="people"');
    expect(html).not.toContain('data-workspace-section-link="event-access"');
    expect(html).not.toContain('data-workspace-section-link="settings"');
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

  it("gives baptism events the shared guest invitation and seating workflow", () => {
    const html = renderEventWorkspace({
      ...baseInput,
      membership: "owner",
      event: { ...event, event_type: "baptism", eventName: "Anna's baptism" },
    });

    expect(html).toContain(`/dashboard/${event.code}/wedding/guests?lang=en`);
    expect(html).toContain("Directory & invitations");
    expect(html).toContain("Contacts, groups, delivery and seating.");
    expect(html).toContain("directory → invitations → responses → live experience");
  });

  it("keeps editor navigation focused on viewing, sharing and media management", () => {
    const html = renderEventWorkspace({ ...baseInput, membership: "editor", members: [] });

    expect(html).toContain('data-event-role="editor"');
    expect(html).toContain('data-workspace-section-link="overview"');
    expect(html).toContain('data-workspace-section-link="gallery"');
    expect(html).toContain('data-workspace-section-link="share"');
    expect(html).not.toContain('data-workspace-section-link="template"');
    expect(html).not.toContain('data-workspace-section-link="people"');
    expect(html).not.toContain('data-workspace-section-link="settings"');
    expect(html).toContain('id="owner-delete-selected"');
  });

  it("replaces original-download actions with an upgrade path during an enforced trial", () => {
    const html = renderEventWorkspace({
      ...baseInput,
      membership: "owner",
      eventAccess: {
        event_id: event.id,
        access_state: "trial",
        enforcement_state: "enforced",
        media_limit: 20,
        guest_access_enabled: 1,
        guest_uploads_enabled: 1,
        original_downloads_enabled: 0,
        trial_started_at: 1,
        trial_ends_at: Date.now() + 86_400_000,
        unlocked_at: null,
        expires_at: null,
        created_at: 1,
        updated_at: 1,
      },
    });

    expect(html).toContain("Originals unlock with upgrade");
    expect(html).toContain(`/dashboard/${event.code}/checkout?lang=en`);
    expect(html).not.toContain('id="owner-download-selected"');
    expect(html).not.toContain('id="lightbox-download"');
    expect(html).toContain('id="owner-delete-selected"');
  });

  it("routes private previews through an explicit trial review instead of starting the clock immediately", () => {
    const html = renderEventWorkspace({
      ...baseInput,
      membership: "owner",
      eventAccess: {
        event_id: event.id,
        access_state: "preview",
        enforcement_state: "enforced",
        media_limit: 20,
        guest_access_enabled: 0,
        guest_uploads_enabled: 0,
        original_downloads_enabled: 0,
        trial_started_at: null,
        trial_ends_at: null,
        unlocked_at: null,
        expires_at: null,
        created_at: 1,
        updated_at: 1,
      },
    });
    expect(html).toContain(`/dashboard/${event.code}/trial?lang=en`);
    expect(html).toContain("complete private preview with no timer");
    expect(html).not.toContain(`/api/account/events/${event.code}/access/start-trial`);
  });

  it("uses the specialized wedding management workspace without changing the gallery", () => {
    const html = renderEventWorkspace({
      ...baseInput,
      event: { ...event, event_type: "wedding", eventName: "Our wedding" },
      membership: "owner",
      weddingUrl: "https://memboux.com/wedding/ABC123",
      weddingQrSvg: '<svg data-test="wedding-qr"></svg>',
    });

    expect(html).toContain('data-event-template="wedding"');
    expect(html).toContain("Build your wedding experience");
    expect(html).toContain("Event management");
    expect(html).toContain("Publish & plan");
    expect(html).toContain("Gallery & photos");
    expect(html).toContain("Team & access");
    expect(html).toContain(`/dashboard/${event.code}/wedding/setup?lang=en`);
    expect(html).not.toContain("Wedding basics");
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
