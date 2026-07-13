import { describe, expect, it } from "vitest";
import type { EventRow } from "../src/domain";
import { constantTimeEqual, cookieValue, esc, formatDate, formatDateTime, formatEventDates, secureSecretEqual, sha256, sha256Bytes, validEventDate } from "../src/utils";

const event = (overrides: Partial<EventRow> = {}): EventRow => ({
  id: "event-1",
  code: "ABC123",
  eventName: "Summer event",
  admin_token_hash: "",
  created_at: 0,
  expires_at: 0,
  status: "active",
  notes: "",
  updated_at: null,
  default_locale: "en",
  event_start_date: "2026-06-15",
  event_end_date: "2026-06-28",
  gallery_pin_hash: null,
  deleted_at: null,
  purge_at: null,
  ...overrides,
});

describe("HTML escaping", () => {
  it("escapes markup and both quote types", () => {
    expect(esc(`<script data-x="1">'test' & more</script>`)).toBe(
      "&lt;script data-x=&quot;1&quot;&gt;&#39;test&#39; &amp; more&lt;/script&gt;",
    );
  });

  it("handles nullish values without leaking text", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
  });
});

describe("cryptographic hashes", () => {
  it("produces the known SHA-256 digest", async () => {
    expect(await sha256("memboux")).toBe("6f69116f5dffa737613401c85f998e8c1f0ae586bf494ea84a9c4c273bb5a0d2");
  });

  it("hashes bytes independently of filenames", async () => {
    const bytes = new TextEncoder().encode("same media bytes").buffer;
    expect(await sha256Bytes(bytes)).toBe(await sha256("same media bytes"));
  });

  it("compares fixed-length values with the Workers timing-safe primitive", () => {
    expect(constantTimeEqual("same-value", "same-value")).toBe(true);
    expect(constantTimeEqual("same-value", "other-val!")).toBe(false);
    expect(constantTimeEqual("short", "longer-value")).toBe(false);
  });

  it("compares secrets without exposing their original length", async () => {
    expect(await secureSecretEqual("correct secret", "correct secret")).toBe(true);
    expect(await secureSecretEqual("short", "a much longer secret")).toBe(false);
  });
});

describe("event dates", () => {
  it("accepts real ISO calendar dates", () => {
    expect(validEventDate("2026-02-28")).toBe("2026-02-28");
    expect(validEventDate("2028-02-29")).toBe("2028-02-29");
  });

  it("rejects impossible or differently formatted dates", () => {
    expect(validEventDate("2026-02-29")).toBeNull();
    expect(validEventDate("28/02/26")).toBeNull();
    expect(validEventDate("2026-13-01")).toBeNull();
  });

  it("formats single dates and date ranges as dd/mm/yy", () => {
    expect(formatEventDates(event(), "en")).toBe("15/06/26 – 28/06/26");
    expect(formatEventDates(event({ event_end_date: "2026-06-15" }), "el")).toBe("15/06/26");
  });

  it("shows a localized missing-date message", () => {
    expect(formatEventDates(event({ event_start_date: null, event_end_date: null }), "en")).toBe("Date not set");
    expect(formatEventDates(event({ event_start_date: null, event_end_date: null }), "el")).toBe("Δεν ορίστηκε ημερομηνία");
  });

  it("uses the Athens timezone for stored timestamps", () => {
    const timestamp = Date.parse("2026-06-15T20:35:00Z");
    expect(formatDate(timestamp)).toBe("15/06/26");
    expect(formatDateTime(timestamp, "en")).toBe("15/06/26, 23:35");
  });
});

describe("cookie parsing", () => {
  it("returns only the requested cookie value", () => {
    const request = new Request("https://memboux.com", { headers: { Cookie: "session=abc; memboux_admin=secure-value; lang=en" } });
    expect(cookieValue(request, "memboux_admin")).toBe("secure-value");
    expect(cookieValue(request, "missing")).toBeUndefined();
  });
});
