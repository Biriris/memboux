import { describe, expect, it } from "vitest";
import { eventTypes } from "../src/event-types";
import { eventWizardFields, mergeWizardFields, parseCustomFields } from "../src/event-wizard-schema";
import { supportedLocales } from "../src/i18n";

describe("event-specific wizard schema", () => {
  it("gives every non-wedding event three localized fields", () => {
    for (const type of eventTypes.filter((type) => type !== "wedding")) {
      const fields = eventWizardFields[type];
      expect(fields).toHaveLength(3);
      expect(new Set(fields.map((field) => field.key)).size).toBe(3);
      for (const field of fields) {
        for (const locale of supportedLocales) {
          expect(field.label[locale].trim()).not.toBe("");
          expect(field.placeholder[locale].trim()).not.toBe("");
        }
      }
    }
  });

  it("only merges whitelisted fields from the active step", () => {
    const value = mergeWizardFields("bachelor", 1, {
      guestOfHonor: " Alex ",
      crewName: "The Crew",
      secretPlan: "must not be saved yet",
      injected: "no",
    }, '{"existing":"kept"}');
    expect(parseCustomFields(value)).toEqual({
      existing: "kept",
      guestOfHonor: "Alex",
      crewName: "The Crew",
    });
  });
});
