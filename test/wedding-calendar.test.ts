import { describe, expect, it } from "vitest";
import {
  buildWeddingCalendar,
  isWeddingCalendarKind,
  weddingCalendarFilename,
} from "../src/wedding-calendar";

describe("wedding calendar files", () => {
  it("creates a stable private ceremony event without converting the entered local time", () => {
    const calendar = buildWeddingCalendar({
      code: "ABC123",
      eventName: "Summer Wedding",
      names: "Alex & Sam",
      kind: "ceremony",
      startsAt: "2027-06-15T17:00",
      location: "Athens, Greece",
      locale: "en",
      generatedAt: Date.UTC(2026, 6, 31, 10, 0, 0),
    });

    expect(calendar).toContain("BEGIN:VCALENDAR\r\n");
    expect(calendar).toContain("UID:ABC123-ceremony@memboux.com");
    expect(calendar).toContain("DTSTAMP:20260731T100000Z");
    expect(calendar).toContain("DTSTART:20270615T170000");
    expect(calendar).toContain("DTEND:20270615T183000");
    expect(calendar).toContain("SUMMARY:Wedding ceremony — Alex & Sam");
    expect(calendar).toContain("LOCATION:Athens\\, Greece");
    expect(calendar).toMatch(/END:VCALENDAR\r\n$/);
  });

  it("localizes reception copy and safely escapes ICS text", () => {
    const calendar = buildWeddingCalendar({
      code: "WED-9",
      eventName: "Γάμος",
      names: "Άλεξ, Σαμ",
      kind: "reception",
      startsAt: "2027-06-15T20:30",
      location: "Κτήμα; Αίθουσα Α",
      locale: "el",
      generatedAt: 0,
    });

    expect(calendar).toContain("DTEND:20270616T023000");
    expect(calendar).toContain("SUMMARY:Δεξίωση γάμου — Άλεξ\\, Σαμ");
    expect(calendar).toContain("LOCATION:Κτήμα\\; Αίθουσα Α");
  });

  it("rejects invalid moments and generates safe filenames", () => {
    expect(buildWeddingCalendar({
      code: "ABC",
      eventName: "Wedding",
      names: "",
      kind: "ceremony",
      startsAt: "2027-02-31T17:00",
      location: "",
      locale: "en",
    })).toBeNull();
    expect(isWeddingCalendarKind("ceremony")).toBe(true);
    expect(isWeddingCalendarKind("other")).toBe(false);
    expect(weddingCalendarFilename("ABC 123/!", "reception")).toBe("memboux-abc123-reception.ics");
  });
});
