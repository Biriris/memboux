import { describe, expect, it } from "vitest";
import type { EventRow } from "../src/domain";
import { adminEventCard } from "../src/routes/admin";

const event = (overrides: Partial<EventRow> = {}): EventRow & { media_count: number } => ({
  id: "event-1",
  code: "ABC123",
  eventName: "Summer event",
  admin_token_hash: "",
  created_at: 1,
  expires_at: Date.UTC(2026, 6, 30),
  status: "active",
  notes: "",
  updated_at: null,
  default_locale: "en",
  event_start_date: "2026-07-01",
  event_end_date: "2026-07-10",
  gallery_pin_hash: null,
  deleted_at: null,
  purge_at: null,
  media_count: 12,
  ...overrides,
});

describe("admin event cards", () => {
  it("renders a three-dot menu with direct edit and delete actions", () => {
    const html = adminEventCard(event(), "en");

    expect(html).toContain('aria-label="Event actions">⋯');
    expect(html).toContain('href="/admin/events/ABC123"');
    expect(html).toContain('action="/admin/events/ABC123/delete"');
    expect(html).toContain(">Edit<");
    expect(html).toContain(">Delete<");
  });

  it("exposes permanent deletion for albums already deleted by an owner", () => {
    const html = adminEventCard(event({ deleted_at: 100, purge_at: Date.UTC(2026, 7, 12) }), "en");

    expect(html).toContain("Deleted");
    expect(html).toContain("Delete permanently");
    expect(html).toContain("This cannot be undone");
  });
});
