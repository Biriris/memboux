import { describe, expect, it } from "vitest";
import { eventTemplateFor, eventTemplateText } from "../src/event-templates";
import { eventTypes } from "../src/event-types";
import { supportedLocales } from "../src/i18n";

describe("event templates", () => {
  it("selects Wedding explicitly and keeps every other event on the generic fallback", () => {
    expect(eventTemplateFor("wedding").key).toBe("wedding");
    for (const type of eventTypes.filter((type) => type !== "wedding")) {
      expect(eventTemplateFor(type).key).toBe("generic");
    }
    expect(eventTemplateFor("invalid").key).toBe("generic");
  });

  it("has visible template copy in every supported locale", () => {
    for (const template of [eventTemplateFor("wedding"), eventTemplateFor("trip")]) {
      for (const locale of supportedLocales) {
        expect(eventTemplateText(template.title, locale).trim()).not.toBe("");
        expect(eventTemplateText(template.description, locale).trim()).not.toBe("");
        for (const item of template.items) {
          expect(eventTemplateText(item.title, locale).trim()).not.toBe("");
          expect(eventTemplateText(item.description, locale).trim()).not.toBe("");
        }
      }
    }
  });
});
