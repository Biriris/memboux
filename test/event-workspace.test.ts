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
  commerceProducts: [{
    product_key: "event_pass",
    scope: "event" as const,
    billing_model: "one_time" as const,
    name_en: "Event Pass", name_el: "Event Pass", name_fr: "Event Pass", name_de: "Event Pass", name_es: "Event Pass", name_it: "Event Pass",
    description_en: "Keep every memory together.", description_el: "Όλες οι αναμνήσεις μαζί.", description_fr: "Tous les souvenirs.", description_de: "Alle Erinnerungen.", description_es: "Todos los recuerdos.", description_it: "Tutti i ricordi.",
    amount_minor: 3900,
    currency: "EUR",
    media_limit: 1_000,
    event_duration_days: 365,
    guest_access_enabled: 1 as const,
    original_downloads_enabled: 1 as const,
    active: 1 as const,
    checkout_enabled: 0 as const,
    sort_order: 1,
  }],
  selectedProductKey: "event_pass",
  commerceLaunchReady: false,
};

describe("event workspace", () => {
  it("organizes the owner workspace with role-aware navigation and settings", () => {
    const html = renderEventWorkspace({ ...baseInput, membership: "owner" });

    expect(html).toContain("data-event-workspace-shell");
    expect(html).toContain('data-event-role="owner"');
    expect(html).toContain('data-workspace-section-link="overview"');
    expect(html).toContain('data-workspace-section-link="website"');
    expect(html).toContain(`/dashboard/${event.code}/website?lang=en`);
    expect(html).toContain('data-workspace-section-link="guests"');
    expect(html).toContain(`/dashboard/${event.code}/media?lang=en`);
    expect(html).toContain('data-workspace-section-link="experience"');
    expect(html).toContain('data-workspace-section-link="share"');
    expect(html).toContain('data-workspace-section-link="archive"');
    expect(html).toContain('data-workspace-section-link="team"');
    expect(html).not.toContain('data-workspace-section-link="manage"');
    expect(html).not.toContain('href="#gallery"');
    expect(html).not.toContain('href="#share"');
    expect(html).toContain('id="gallery"');
    expect(html).toContain("data-clear-event-end-date");
    expect(html).toContain("input.value=''");
    expect(html).toContain("15/06/2026 – 28/06/2026");
    const clearScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
      .map((match) => match[1])
      .find((source) => source.includes("data-clear-event-end-date"));
    expect(clearScript).toBeTruthy();
    expect(() => new Function(clearScript!)).not.toThrow();
    expect(html).toContain('id="share"');
    expect(html).not.toContain('id="settings"');
    expect(html).not.toContain("Event details");
    expect(html).toContain('id="people"');
    expect(html).toContain("Co-owner — full control");
    expect(html).toContain("A co-owner gets full control");
    expect(html).not.toContain('id="danger"');
    expect(html).toContain('data-test="guest-qr"');
    expect(html).toContain('data-test="official-qr"');
    expect(html).toContain("data.invitationQrSvg");
    expect(html).toContain("dataset.invitationQr");
    expect(html).not.toContain(`/api/account/events/${event.code}/trash`);
    expect(html).toContain(`/gallery/${event.code}/official`);
    expect(html).toContain("data-inline-editor");
    expect(html).toContain('data-field="name"');
    expect(html).toContain('data-field="dates"');
    expect(html).toContain('data-field="location"');
    expect(html).toContain('data-event-type-form');
    expect(html).toContain('name="eventType"');
    expect(html).toContain(`/api/account/events/${event.code}/event-type`);
    expect(html).toContain("Trip &amp; vacation");
    expect(html).toContain("Shared media is preserved");
    expect(html).toContain('id="template"');
    expect(html).toContain('data-event-template="trip"');
    expect(html).toContain("Build the complete event page");
    expect(html).toContain(`/dashboard/${event.code}/setup?lang=en`);
    expect(html).toContain(`/event/${event.code}?lang=en&amp;preview=1`);
    expect(html).toContain('data-event-type-editor');
    expect(html).toContain("Zanzibar, Tanzania");
    expect(html).toContain('data-gallery-sort="owner-gallery"');
    expect(html).toContain('data-gallery-grid="owner-gallery"');
    expect(html).toContain("0 photos");
    expect(html).toContain('data-gallery-photo-count="0"');
    expect(html).not.toContain("data-gallery-filter");
    expect(html).not.toContain('id="owner-set-cover"');
    expect(html).not.toContain('id="owner-cover-form"');
    expect(html).not.toContain('data-event-pin-toggle');
    expect(html).toContain('data-surface-pin-control="guest_gallery"');
    expect(html).toContain('data-surface-pin-control="official_album"');
    expect(html).toContain('data-location-picker');
    expect(html).toContain('name="locationPlaceId"');
    expect(html).toContain('name="locationLat"');
    expect(html).toContain('data-location-map-open');
    expect(html).toContain('data-event-location-editor');
    expect(html).toContain('h-[22rem] sm:h-[30rem]');
    expect(html).toContain("Save location");
    expect(html).toContain("min-h-11");
    expect(html).not.toContain('inline-location-template');
    expect(html).not.toContain("actions.before(editor)");
    expect(html).not.toContain("Guest gallery protection");
    expect(html).toContain(`/api/account/events/${event.code}/privacy`);
    expect(html).toContain('data-workspace-journey');
    expect(html).toContain('data-workspace-journey-step="1"');
    expect(html).toContain('data-workspace-journey-step="6"');
    expect(html).toContain("recommended_action");
    expect(html).toContain("journey_step");
    expect(html.indexOf('id="gallery"')).toBeLessThan(html.indexOf('id="guest-workspace"'));
    expect(html.indexOf('id="guest-workspace"')).toBeLessThan(html.indexOf('id="share"'));
    expect(html.indexOf('id="share"')).toBeLessThan(html.indexOf('id="people"'));
    expect(html.indexOf('id="overview"')).toBeLessThan(html.indexOf('id="gallery"'));
    expect(html).not.toContain("Current package");
    expect(html).not.toContain("2147483647");
    expect(html).not.toContain("Fully unlocked");
    expect(html).not.toContain("Next step");
    expect(html).not.toContain("Manage event media");
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
    expect(html).toContain("Perspectives");
    expect(html).toContain("contributors");
    expect(html).toContain('data-gallery-photo-count="1"');
    expect(html).toContain("<details data-media-actions");
    expect(html).toContain("<form data-media-cover");
    expect(html).toContain("<form data-media-trash");
    expect(html).toContain("__membouxMediaTrash");
    expect(html).toContain(`/api/account/events/${event.code}/media/dashboard-photo/trash`);
    expect(html).toContain("Set as cover");
    expect(html).toContain('name="mediaId" value="dashboard-photo"');
    expect(html).not.toContain('id="owner-set-cover"');
  });

  it("renders semantic section navigation with only the selected panel visible", () => {
    const html = renderEventWorkspace({ ...baseInput, membership: "owner", activeSection: "media" });

    expect(html).toContain('data-workspace-section-link="media"');
    expect(html).toContain('href="/dashboard/ABC123/media?lang=en" aria-current="page"');
    expect(html).toContain('data-active-section="media"');
    expect(html).toContain("data-workspace-mobile-navigation");
    expect(html).toContain("data-workspace-mobile-nav");
    expect(html).toContain("snap-mandatory");
    expect(html).toContain("activeMobileLink?.scrollIntoView");
    expect(html).not.toContain('<div class="mb-4 xl:hidden"><details');
    expect(html).toContain('[data-workspace-panel]:not([data-workspace-panel="media"])');
    expect(html).toContain('id="gallery" data-workspace-panel="media"');
    expect(html).toContain('id="overview" data-workspace-panel="overview"');
    expect(html).toContain("location.replace('/dashboard/'");
  });

  it("keeps owner-only controls hidden from viewers", () => {
    const html = renderEventWorkspace({ ...baseInput, membership: "viewer", members: [] });

    expect(html).toContain("data-event-workspace-shell");
    expect(html).toContain('data-event-role="viewer"');
    expect(html).toContain('data-workspace-section-link="overview"');
    expect(html).toContain('data-workspace-section-link="media"');
    expect(html).toContain('data-workspace-section-link="share"');
    expect(html).not.toContain('data-workspace-section-link="website"');
    expect(html).not.toContain('data-workspace-section-link="guests"');
    expect(html).not.toContain('data-workspace-section-link="experience"');
    expect(html).not.toContain('data-workspace-section-link="archive"');
    expect(html).not.toContain('data-workspace-section-link="team"');
    expect(html).not.toContain('data-workspace-section-link="manage"');
    expect(html).toContain('id="gallery"');
    expect(html).toContain("Download selected");
    expect(html).toContain("Trip &amp; vacation");
    expect(html).not.toContain('data-event-type-form');
    expect(html).not.toContain('name="eventType"');
    expect(html).not.toContain('id="settings"');
    expect(html).not.toContain('id="people"');
    expect(html).not.toContain('id="danger"');
    expect(html).not.toContain("Delete selected");
    expect(html).not.toContain("<form data-media-cover");
    expect(html).not.toContain("<form data-media-trash");
  });

  it("gives baptism events the shared guest invitation and seating workflow", () => {
    const html = renderEventWorkspace({
      ...baseInput,
      membership: "owner",
      event: { ...event, event_type: "baptism", eventName: "Anna's baptism" },
    });

    expect(html).toContain(`/dashboard/${event.code}/wedding/guests?lang=en`);
    expect(html).toContain("Guests without the busywork");
    expect(html).toContain("Directory & invitations");
    expect(html).toContain("Build the directory first");
    expect(html).not.toContain('data-workspace-section-link="menu"');
  });

  it("keeps editor navigation focused on viewing, sharing and media management", () => {
    const html = renderEventWorkspace({ ...baseInput, membership: "editor", members: [] });

    expect(html).toContain('data-event-role="editor"');
    expect(html).toContain('data-workspace-section-link="overview"');
    expect(html).toContain('data-workspace-section-link="media"');
    expect(html).toContain('data-workspace-section-link="share"');
    expect(html).not.toContain('data-workspace-section-link="website"');
    expect(html).not.toContain('data-workspace-section-link="experience"');
    expect(html).not.toContain('data-workspace-section-link="archive"');
    expect(html).not.toContain('data-workspace-section-link="team"');
    expect(html).not.toContain('data-workspace-section-link="manage"');
    expect(html).toContain('id="owner-delete-selected"');
  });

  it("keeps original-download actions available on Free", () => {
    const html = renderEventWorkspace({
      ...baseInput,
      membership: "owner",
      eventAccess: {
        event_id: event.id,
        access_state: "free",
        enforcement_state: "enforced",
        plan_key: "event_free",
        media_limit: 20,
        guest_access_enabled: 1,
        guest_uploads_enabled: 1,
        original_downloads_enabled: 1,
        unlocked_at: null,
        expires_at: null,
        created_at: 1,
        updated_at: 1,
      },
    });

    expect(html).toContain('id="owner-download-selected"');
    expect(html).toContain('id="owner-delete-selected"');
    expect(html).not.toContain('data-test="official-qr"');
    expect(html).not.toContain('data-surface-pin-control="official_album"');
    expect(html).not.toContain(`/gallery/${event.code}/official`);
  });

  it("separates live experience and lifecycle tools into focused owner panels", () => {
    const experienceHtml = renderEventWorkspace({ ...baseInput, membership: "owner", activeSection: "experience" });
    expect(experienceHtml).toContain('data-active-section="experience"');
    expect(experienceHtml).toContain('[data-workspace-panel]:not([data-workspace-panel="experience"])');
    expect(experienceHtml).toContain('id="experience-workspace" data-workspace-panel="experience"');
    expect(experienceHtml).toContain("The live event experience");
    expect(experienceHtml).toContain(`/gallery/${event.code}/slideshow?lang=en`);

    const archiveHtml = renderEventWorkspace({ ...baseInput, membership: "owner", activeSection: "archive" });
    expect(archiveHtml).toContain('data-active-section="archive"');
    expect(archiveHtml).toContain('[data-workspace-panel]:not([data-workspace-panel="archive"])');
    expect(archiveHtml).toContain('id="archive-workspace" data-workspace-panel="archive"');
    expect(archiveHtml).toContain("Package, backups, and recovery");
    expect(archiveHtml).toContain('id="package-access-title"');
  });

  it("combines three-package selection and Free activation in the event overview", () => {
    const html = renderEventWorkspace({
      ...baseInput,
      membership: "owner",
      eventAccess: {
        event_id: event.id,
        access_state: "preview",
        enforcement_state: "enforced",
        plan_key: null,
        media_limit: 50,
        guest_access_enabled: 0,
        guest_uploads_enabled: 0,
        original_downloads_enabled: 0,
        unlocked_at: null,
        expires_at: null,
        created_at: 1,
        updated_at: 1,
      },
    });
    expect(html).toContain('id="package-access-title"');
    expect(html).toContain(`/api/account/events/${event.code}/checkout/select`);
    expect(html).toContain("Continue with selected package");
    expect(html).toContain('data-workspace-product');
    expect(html).toContain('background:#6d28d9!important');
    expect(html).not.toContain(`/api/account/events/${event.code}/access/start-trial`);
  });

  it("shows event archives to owners and Google Drive backup only for a paid event", () => {
    const html = renderEventWorkspace({
      ...baseInput,
      membership: "owner",
      googleDriveConnected: true,
      eventAccess: {
        event_id: event.id,
        access_state: "unlocked",
        enforcement_state: "enforced",
        plan_key: "event_pass",
        media_limit: 1000,
        guest_access_enabled: 1,
        guest_uploads_enabled: 1,
        original_downloads_enabled: 1,
        unlocked_at: 1,
        expires_at: null,
        created_at: 1,
        updated_at: 1,
      },
    });
    expect(html).toContain(`/dashboard/${event.code}/archive?lang=en`);
    expect(html).toContain(`/api/account/events/${event.code}/backups/google`);
    expect(html).toContain('name="returnTo" value="event"');
  });

  it("uses the unified selector during an active Free event", () => {
    const paidProduct = baseInput.commerceProducts[0];
    const html = renderEventWorkspace({
      ...baseInput,
      membership: "owner",
      commerceProducts: [
        { ...paidProduct, product_key: "event_free", amount_minor: 0, media_limit: 50, event_duration_days: null, sort_order: 0 },
        paidProduct,
        { ...paidProduct, product_key: "event_celebration", amount_minor: 7900, media_limit: 20_000, event_duration_days: 730, sort_order: 2 },
      ],
      eventAccess: {
        event_id: event.id,
        access_state: "free",
        enforcement_state: "enforced",
        plan_key: "event_free",
        media_limit: 50,
        guest_access_enabled: 1,
        guest_uploads_enabled: 1,
        original_downloads_enabled: 1,
        unlocked_at: null,
        expires_at: null,
        created_at: 1,
        updated_at: 1,
      },
    });

    expect(html).toContain(`/api/account/events/${event.code}/checkout/select`);
    expect(html).toContain("Activate beta package");
    expect(html).not.toContain(`/api/account/events/${event.code}/checkout/draft`);
    expect(html.match(/<label data-workspace-product/g)).toHaveLength(3);
    expect(html.match(/data-selected="true"/g)).toHaveLength(1);
    expect(html.match(/data-selected="false"/g)).toHaveLength(2);
    expect(html).toContain('value="event_free" checked');
    expect(html).toContain("radio===active&&radio.checked");
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
    expect(html).toContain('href="/dashboard/ABC123/share?lang=en#website-pin"');
    expect(html).toContain('data-surface-pin-control="website"');
    expect(html).toContain('id="guest_gallery-pin"');
    expect(html).toContain('id="official_album-pin"');
    expect(html).toContain('data-workspace-section-link="menu"');
    expect(html).toContain(`/dashboard/${event.code}/menu?lang=en`);
    expect(html).toContain("Menu & print files");
    expect(html).toContain(`/dashboard/${event.code}/wedding/menu/print?lang=en`);
    expect(html).toContain("lg:grid-cols-3");
    expect(html).toContain("flex h-full min-w-0 flex-col");
    expect(html).toContain('name="eventType"');
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
