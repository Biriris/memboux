import { describe, expect, it } from "vitest";
import { supportedLocales } from "../src/i18n";
import {
  WEDDING_BASE_PRICE_MINOR,
  calculateWeddingEstimate,
  defaultWeddingFeatures,
  weddingCatalogText,
  weddingFeatureCatalog,
} from "../src/wedding-catalog";

describe("wedding feature catalog", () => {
  it("calculates estimates on the server from available unique selections only", () => {
    const estimate = calculateWeddingEstimate(["rsvp", "rsvp", "guestbook", "guest_quiz", "invalid"]);
    expect(estimate.basePriceMinor).toBe(WEDDING_BASE_PRICE_MINOR);
    expect(estimate.selected).toEqual(["rsvp", "guestbook"]);
    expect(estimate.featurePriceMinor).toBe(1800);
    expect(estimate.totalMinor).toBe(5700);
  });

  it("selects every currently available feature by default", () => {
    expect(defaultWeddingFeatures()).toEqual(
      weddingFeatureCatalog.filter((feature) => feature.available).map((feature) => feature.key),
    );
  });

  it("has visible product copy in every supported locale", () => {
    for (const feature of weddingFeatureCatalog) {
      for (const locale of supportedLocales) {
        expect(weddingCatalogText(feature.title, locale).trim()).not.toBe("");
        expect(weddingCatalogText(feature.description, locale).trim()).not.toBe("");
      }
    }
  });
});
