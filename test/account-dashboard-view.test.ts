import { describe, expect, it } from "vitest";
import {
  eventAlbumPreviewHref,
  professionalAssignmentHref,
  renderCreateEventTile,
  renderDashboardSection,
  renderDashboardSubmenu,
  renderEventPinControl,
  renderNewEventTypeField,
  selectedEventCoverUrl,
  shouldShowProfessionalDashboardSection,
} from "../src/routes/account";

describe("new event controls", () => {
  it("requires a localized event type from the shared category list", () => {
    const english = renderNewEventTypeField("en");
    const greek = renderNewEventTypeField("el");

    expect(english).toContain('name="eventType" required');
    expect(english).toContain('<option value="" selected disabled>Event type</option>');
    expect(english).toContain('<option value="trip">Trip & vacation</option>');
    expect(greek).toContain("Είδος event");
    expect(greek).toContain('<option value="wedding">Γάμος</option>');
  });

  it("keeps the plus white when its circle turns green", () => {
    const html = renderCreateEventTile("New event", "en");

    expect(html).toContain("data-new-event-plus");
    expect(html).toContain("group-hover:bg-[#2f6b5b]");
    expect(html).toContain("group-hover:text-white");
    expect(html).toContain("group-hover:stroke-white");
  });
});

describe("account dashboard covers", () => {
  it("uses only a cover explicitly saved by the user", () => {
    expect(selectedEventCoverUrl({
      code: "ABC123",
      cover_object_key: null,
      cover_updated_at: null,
    })).toBeNull();

    expect(selectedEventCoverUrl({
      code: "ABC 123",
      cover_object_key: "covers/event/selected.jpg",
      cover_updated_at: 1_720_000_000_000,
    })).toBe("/event-cover/ABC%20123?v=1720000000000");
  });
});

describe("account dashboard event PIN control", () => {
  it("renders an open lock for an event without a PIN", () => {
    const html = renderEventPinControl({ code: "ABC123", eventName: "Summer trip", gallery_pin_hash: null }, "en");

    expect(html).toContain("data-event-pin-toggle");
    expect(html).toContain('data-locked="false"');
    expect(html).toContain('aria-label="Add PIN"');
    expect(html).toContain('data-event-name="Summer trip"');
  });

  it("renders a closed lock for a protected event", () => {
    const html = renderEventPinControl({ code: "ABC123", eventName: "Private event", gallery_pin_hash: "hash" }, "el");

    expect(html).toContain('data-locked="true"');
    expect(html).toContain('aria-label="Αφαίρεση PIN"');
    expect(html).toContain("bg-amber-300");
  });
});

describe("professional dashboard section", () => {
  it("is shown for active professional accounts except in owner/shared-only views", () => {
    expect(shouldShowProfessionalDashboardSection(true, "all")).toBe(true);
    expect(shouldShowProfessionalDashboardSection(true, "professional")).toBe(true);
    expect(shouldShowProfessionalDashboardSection(true, "upcoming")).toBe(true);
    expect(shouldShowProfessionalDashboardSection(true, "owner")).toBe(false);
    expect(shouldShowProfessionalDashboardSection(true, "shared")).toBe(false);
    expect(shouldShowProfessionalDashboardSection(false, "all")).toBe(false);
  });

  it("opens accepted assignments in Studio and pending ones in the assignment list", () => {
    expect(professionalAssignmentHref("PRO 123", "accepted", "en"))
      .toBe("/studio/events/PRO%20123?lang=en");
    expect(professionalAssignmentHref("PRO123", "invited", "el"))
      .toBe("/studio?lang=el");
  });

  it("builds guest and official album preview links", () => {
    expect(eventAlbumPreviewHref("ABC 123", false, "el"))
      .toBe("/gallery/ABC%20123?lang=el");
    expect(eventAlbumPreviewHref("ABC123", true, "en"))
      .toBe("/gallery/ABC123/official?lang=en");
  });
});

describe("collapsible account dashboard sections", () => {
  it("renders expanded native details that can collapse without JavaScript", () => {
    const html = renderDashboardSection("my-events", "My events", "Albums you own", "<article>Event</article>", "Empty");

    expect(html).toContain('<details id="my-events" open');
    expect(html).toContain("<summary");
    expect(html).toContain("group-open/dashboard-section:rotate-180");
    expect(html).toContain("<article>Event</article>");
  });

  it("renders dashboard navigation in the requested order", () => {
    const html = renderDashboardSubmenu("en", { owned: true, shared: true, studio: true });
    const owned = html.indexOf('href="#my-events"');
    const shared = html.indexOf('href="#shared-with-me"');
    const studio = html.indexOf('href="#official-photographer"');

    expect(owned).toBeGreaterThan(-1);
    expect(shared).toBeGreaterThan(owned);
    expect(studio).toBeGreaterThan(shared);
    expect(html).toContain("Memboux Studio albums");
    expect(html).toContain("sm:ml-auto");
    expect(html).toContain("target.open=true");
  });
});
