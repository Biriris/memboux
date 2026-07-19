import { describe, expect, it } from "vitest";
import { eventTypeLabel, eventTypeOptions, eventTypes, isEventType, normalizeEventType } from "../src/event-types";
import { supportedLocales } from "../src/i18n";

describe("event types", () => {
  it("keeps a stable, filterable event taxonomy", () => {
    expect(eventTypes).toEqual([
      "wedding", "engagement", "birthday", "party", "baptism", "baby", "graduation",
      "corporate", "trip", "reunion", "community", "memorial", "other",
    ]);
    expect(isEventType("trip")).toBe(true);
    expect(isEventType("anything")).toBe(false);
    expect(normalizeEventType("anything")).toBe("other");
  });

  it("provides every event type in every supported language", () => {
    for (const locale of supportedLocales) {
      for (const type of eventTypes) expect(eventTypeLabel(type, locale)).not.toBe("");
      const options = eventTypeOptions(locale, "baptism");
      expect(options.match(/<option /g)).toHaveLength(eventTypes.length);
      expect(options).toContain('<option value="baptism" selected>');
    }
  });
});
