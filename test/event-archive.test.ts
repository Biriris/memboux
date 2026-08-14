import { describe, expect, it } from "vitest";
import { EVENT_ARCHIVE_FORMAT, EVENT_ARCHIVE_VERSION, parseEventArchive } from "../src/event-archive";

describe("event archive format", () => {
  const archive = {
    format: EVENT_ARCHIVE_FORMAT,
    version: EVENT_ARCHIVE_VERSION,
    exportedAt: "2026-08-15T00:00:00.000Z",
    event: { eventName: "Restored event", default_locale: "en" },
    data: {
      verticalProfile: null,
      weddingProfile: null,
      weddingFeatures: [],
      experienceSettings: null,
      albums: [],
      branding: null,
      qrDesigns: [],
      weddingGuestGroups: [],
      weddingGuests: [],
      weddingTables: [],
      weddingSeatAssignments: [],
      weddingMenuCourses: [],
    },
    excluded: [],
  };

  it("accepts the current version and rejects unknown or incomplete files", () => {
    expect(parseEventArchive(archive)?.event.eventName).toBe("Restored event");
    expect(parseEventArchive({ ...archive, version: 99 })).toBeNull();
    expect(parseEventArchive({ ...archive, event: { eventName: "" } })).toBeNull();
  });
});
