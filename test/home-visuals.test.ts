import { describe, expect, it } from "vitest";
import { homePage } from "../src/views/home";

describe("homepage visual storytelling", () => {
  it("renders responsive event imagery without delaying below-the-fold media", () => {
    const html = homePage("el", []);

    expect(html).toContain('/marketing/hero-moments-1600.webp');
    expect(html).toContain('/marketing/hero-moments-720.webp');
    expect(html).toContain('fetchpriority="high"');
    expect(html).toContain('/marketing/birthday-moments-1280.webp');
    expect(html).toContain('/marketing/trip-moments-1280.webp');
    expect(html).toMatch(/<img loading="lazy"[^>]+birthday-moments-1280\.webp/);
    expect(html).toMatch(/<img loading="lazy"[^>]+trip-moments-1280\.webp/);
    expect(html).toContain("διαφορετικές οπτικές");
  });

  it("localizes the marketing image descriptions", () => {
    const html = homePage("en", []);

    expect(html).toContain("Friends capture a candid wedding reception moment");
    expect(html).toContain("A family photographs a child blowing out birthday candles");
    expect(html).toContain("Friends share their holiday photos on an Aegean beach");
  });
});
