import { describe, expect, it } from "vitest";
import type { EventAccessRow } from "../src/domain";
import { EVENT_TRIAL_DAYS, EVENT_TRIAL_MEDIA_LIMIT, eventAccessAllows, eventMediaCapacity, eventMediaUsage } from "../src/event-access";

const access = (overrides: Partial<EventAccessRow> = {}): EventAccessRow => ({
  event_id: "event-1",
  access_state: "preview",
  enforcement_state: "enforced",
  media_limit: EVENT_TRIAL_MEDIA_LIMIT,
  media_uploads_consumed: 0,
  guest_access_enabled: 0,
  guest_uploads_enabled: 0,
  original_downloads_enabled: 0,
  trial_started_at: null,
  trial_ends_at: null,
  unlocked_at: null,
  expires_at: null,
  created_at: 1,
  updated_at: 1,
  ...overrides,
});

describe("event access lifecycle", () => {
  it("uses the intended trial shape", () => {
    expect(EVENT_TRIAL_DAYS).toBe(7);
    expect(EVENT_TRIAL_MEDIA_LIMIT).toBe(20);
  });

  it("keeps beta observe mode non-blocking", () => {
    const observed = access({ enforcement_state: "observe" });
    expect(eventAccessAllows(observed, "guest_access")).toBe(true);
    expect(eventAccessAllows(observed, "guest_uploads")).toBe(true);
    expect(eventAccessAllows(observed, "original_downloads")).toBe(true);
  });

  it("honors enforced capabilities and always unlocks paid events", () => {
    const trial = access({ access_state: "trial", guest_access_enabled: 1, guest_uploads_enabled: 1 });
    expect(eventAccessAllows(trial, "guest_access")).toBe(true);
    expect(eventAccessAllows(trial, "original_downloads")).toBe(false);
    expect(eventAccessAllows(access({ access_state: "unlocked" }), "original_downloads")).toBe(true);
  });

  it("counts gallery, Wedding and in-flight multipart media in one trial limit", async () => {
    const trial = access({
      access_state: "trial",
      guest_access_enabled: 1,
      guest_uploads_enabled: 1,
    });
    const db = {
      prepare(sql: string) {
        return {
          bind() {
            return {
              first: async () => {
                if (sql.includes("SELECT * FROM event_access")) return trial;
                if (sql.includes("media_uploads_consumed")) return { media_uploads_consumed: 18 };
                if (sql.includes("FROM media ")) return { total: 12 };
                if (sql.includes("event_wedding_media")) return { total: 6 };
                if (sql.includes("multipart_upload_sessions")) return { total: 2 };
                return null;
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    const full = await eventMediaCapacity(db, "event-1", 1);
    expect(full).toMatchObject({ allowed: false, used: 20, remaining: 0 });
    const completion = await eventMediaCapacity(db, "event-1", 0);
    expect(completion).toMatchObject({ allowed: true, used: 20, remaining: 0 });
    expect(await eventMediaUsage(db, "event-1")).toEqual({
      galleryMedia: 12,
      weddingMedia: 6,
      pendingUploads: 2,
      consumedUploads: 18,
      total: 20,
    });
  });

  it("allows a private owner preview within quota but blocks guest and expired uploads", async () => {
    let current = access({ access_state: "preview", media_limit: 20 });
    const db = {
      prepare(sql: string) {
        return {
          bind() {
            return {
              first: async () => sql.includes("SELECT * FROM event_access") ? current : { total: 0 },
            };
          },
        };
      },
    } as unknown as D1Database;

    expect((await eventMediaCapacity(db, "event-1", 1)).allowed).toBe(false);
    expect((await eventMediaCapacity(db, "event-1", 1, true)).allowed).toBe(true);
    current = access({ access_state: "expired", media_limit: 20 });
    expect((await eventMediaCapacity(db, "event-1", 1, true)).allowed).toBe(false);
  });
});
