import { describe, expect, it } from "vitest";
import type { CommerceProduct } from "../src/commerce";
import { homeCommercialSections } from "../src/views/home-commercial";

const product = (key: string, name: string, amount: number, files: number, days: number): CommerceProduct => ({
  product_key: key,
  scope: "event",
  billing_model: "one_time",
  name_en: name,
  name_el: name,
  name_fr: name,
  name_de: name,
  name_es: name,
  name_it: name,
  description_en: "Event package",
  description_el: "Event package",
  description_fr: "Event package",
  description_de: "Event package",
  description_es: "Event package",
  description_it: "Event package",
  amount_minor: amount,
  currency: "EUR",
  media_limit: files,
  event_duration_days: days,
  guest_access_enabled: 1,
  original_downloads_enabled: 1,
  active: 1,
  checkout_enabled: 0,
  sort_order: amount,
});

describe("public commercial homepage sections", () => {
  it("renders prices and limits from the server-controlled product catalog", () => {
    const html = homeCommercialSections("en", [
      product("event_pass", "Moments", 3900, 5000, 365),
      product("event_plus", "Celebration", 7900, 20000, 730),
    ]);

    expect(html).toContain("Moments");
    expect(html).toContain("Celebration");
    expect(html).toContain("€39.00");
    expect(html).toContain("€79.00");
    expect(html).toContain("5,000 photos &amp; videos");
    expect(html).toContain('data-marketing-action="plan-event_pass"');
    expect(html).toContain("Paid checkout is not live yet");
  });

  it("keeps demos, event links, FAQs and the free plan available without catalog rows", () => {
    const html = homeCommercialSections("el", []);

    expect(html).toContain('id="event-types"');
    expect(html).toContain('/el/wedding/preview');
    expect(html).toContain('/el/events/birthday/demo-frame?theme=vivid');
    expect(html).toContain('id="pricing"');
    expect(html).toContain("Memboux Free");
    expect(html).toContain('id="faq"');
    expect(html).toContain('class="home-event-grid');
    expect(html).toContain('class="home-plan-grid');
  });
});
