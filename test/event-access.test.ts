import { describe, expect, it } from "vitest";
import type { EventAccessRow } from "../src/domain";
import { EVENT_FREE_MEDIA_LIMIT, eventAccessAllows, eventMediaCapacity, eventMediaUsage } from "../src/event-access";

const access = (overrides: Partial<EventAccessRow> = {}): EventAccessRow => ({
  event_id: "event-1",
  access_state: "preview",
  enforcement_state: "enforced",
  plan_key: null,
  media_limit: EVENT_FREE_MEDIA_LIMIT,
  media_uploads_consumed: 0,
  guest_access_enabled: 0,
  guest_uploads_enabled: 0,
  original_downloads_enabled: 0,
  unlocked_at: null,
  expires_at: null,
  created_at: 1,
  updated_at: 1,
  ...overrides,
});

describe("event access lifecycle", () => {
  it("uses the intended Free limit", () => {
    expect(EVENT_FREE_MEDIA_LIMIT).toBe(50);
  });

  it("keeps beta observe mode non-blocking", () => {
    const observed = access({ enforcement_state: "observe" });
    expect(eventAccessAllows(observed, "guest_access")).toBe(true);
    expect(eventAccessAllows(observed, "guest_uploads")).toBe(true);
    expect(eventAccessAllows(observed, "original_downloads")).toBe(true);
  });

  it("honors enforced capabilities and unlocks Free and paid events", () => {
    const free = access({ access_state: "free", guest_access_enabled: 1, guest_uploads_enabled: 1, original_downloads_enabled: 1 });
    expect(eventAccessAllows(free, "guest_access")).toBe(true);
    expect(eventAccessAllows(free, "original_downloads")).toBe(true);
    expect(eventAccessAllows(access({ access_state: "unlocked" }), "original_downloads")).toBe(true);
  });

  it("counts gallery, Wedding and in-flight multipart media in one Free limit", async () => {
    const free = access({
      access_state: "free",
      guest_access_enabled: 1,
      guest_uploads_enabled: 1,
    });
    const db = {
      prepare(sql: string) {
        return {
          bind() {
            return {
              first: async () => {
                if (sql.includes("SELECT * FROM event_access")) return free;
                if (sql.includes("media_uploads_consumed")) return { media_uploads_consumed: 48 };
                if (sql.includes("FROM media ")) return { total: 32 };
                if (sql.includes("event_wedding_media")) return { total: 16 };
                if (sql.includes("multipart_upload_sessions")) return { total: 2 };
                return null;
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    const full = await eventMediaCapacity(db, "event-1", 1);
    expect(full).toMatchObject({ allowed: false, used: 50, remaining: 0 });
    const completion = await eventMediaCapacity(db, "event-1", 0);
    expect(completion).toMatchObject({ allowed: true, used: 50, remaining: 0 });
    expect(await eventMediaUsage(db, "event-1")).toEqual({
      galleryMedia: 32,
      weddingMedia: 16,
      pendingUploads: 2,
      consumedUploads: 48,
      total: 50,
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

  it("blocks owner and guest uploads after a package contribution window closes", async () => {
    const closed = access({
      access_state: "free",
      plan_key: "event_free",
      media_limit: 50,
      upload_window_days: 14,
      upload_window_started_at: 1,
      upload_window_ends_at: Date.now() - 1,
      guest_access_enabled: 1,
      guest_uploads_enabled: 1,
      original_downloads_enabled: 1,
    });
    const db = {
      prepare() {
        return { bind() { return { first: async () => closed }; } };
      },
    } as unknown as D1Database;

    await expect(eventMediaCapacity(db, "event-1", 1)).resolves.toMatchObject({
      allowed: false,
      reason: "upload_window_closed",
    });
    await expect(eventMediaCapacity(db, "event-1", 1, true)).resolves.toMatchObject({
      allowed: false,
      reason: "upload_window_closed",
    });
  });
});
