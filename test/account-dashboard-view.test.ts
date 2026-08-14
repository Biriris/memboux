import { describe, expect, it } from "vitest";
import {
  eventAlbumPreviewHref,
  dashboardMediaSummary,
  dashboardVideoCoverMarkup,
  partitionDashboardEvents,
  professionalAssignmentHref,
  renderCreateEventTile,
  renderDashboardSection,
  renderDashboardSubmenu,
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

  it("preselects bachelor when creation starts from its landing page", () => {
    const field = renderNewEventTypeField("el", "bachelor");
    expect(field).toContain('<option value="bachelor" selected>');
    expect(field).not.toContain('<option value="" selected');
  });

  it("keeps the plus white when its circle turns green", () => {
    const html = renderCreateEventTile("New event", "en");

    expect(html).toContain("data-new-event-plus");
    expect(html).toContain("group-hover:bg-[#7c3aed]");
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

describe("account dashboard media summary", () => {
  it("shows image and video totals in both primary dashboard languages", () => {
    expect(dashboardMediaSummary("en", 12, 3)).toBe("12 images · 3 videos");
    expect(dashboardMediaSummary("el", 12, 3)).toBe("12 εικόνες · 3 βίντεο");
    expect(dashboardMediaSummary("el", 0, 1)).toBe("0 εικόνες · 1 βίντεο");
  });

  it("uses a playable first frame and generated poster for video-only events", () => {
    const html = dashboardVideoCoverMarkup("video/id");
    expect(html).toContain('src="/media/video%2Fid#t=0.1"');
    expect(html).toContain('poster="/media/video%2Fid?variant=thumb"');
    expect(html).toContain("object-cover");
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

describe("calendar event ordering", () => {
  it("shows nearest upcoming events first and most recent past events first", () => {
    const result = partitionDashboardEvents([
      { event_start_date: "2026-09-20", event_end_date: "2026-09-20" },
      { event_start_date: "2026-08-01", event_end_date: "2026-08-02" },
      { event_start_date: "2026-08-20", event_end_date: "2026-08-20" },
      { event_start_date: "2026-07-10", event_end_date: "2026-07-10" },
    ], "2026-08-13");

    expect(result.upcoming.map((event) => event.event_start_date)).toEqual(["2026-08-20", "2026-09-20"]);
    expect(result.past.map((event) => event.event_start_date)).toEqual(["2026-08-01", "2026-07-10"]);
  });

  it("keeps undated events in upcoming planning", () => {
    const result = partitionDashboardEvents([{ event_start_date: null, event_end_date: null }], "2026-08-13");
    expect(result.upcoming).toHaveLength(1);
    expect(result.past).toHaveLength(0);
  });
});
