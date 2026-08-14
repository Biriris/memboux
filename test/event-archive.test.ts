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

  it("validates a provider-backed manifest that can restore its original files", () => {
    const cloudArchive = {
      ...archive,
      cloudBackup: {
        version: 1,
        provider: "google_drive",
        sourceEventId: "event-1",
        generatedAt: "2026-08-15T00:00:00.000Z",
        files: [{
          itemKey: "media-1", kind: "gallery_media", sourceId: "media-1", filename: "0001.jpg",
          contentType: "image/jpeg", sizeBytes: 123, providerFileId: "drive-file-1", metadata: {},
        }],
      },
    };
    expect(parseEventArchive(cloudArchive)?.cloudBackup?.files).toHaveLength(1);
    expect(parseEventArchive({ ...cloudArchive, cloudBackup: { ...cloudArchive.cloudBackup, provider: "unknown" } })).toBeNull();
    expect(parseEventArchive({ ...cloudArchive, cloudBackup: { ...cloudArchive.cloudBackup, files: [{ ...cloudArchive.cloudBackup.files[0], sizeBytes: -1 }] } })).toBeNull();
  });
});
