import { describe, expect, it } from "vitest";
import { defaultEventBranding, eventBrandIdentity, eventBrandingStyle, validBrandColor } from "../src/event-branding";

describe("event presentation branding", () => {
  it("accepts only six-digit hexadecimal colors", () => {
    expect(validBrandColor("#7c3aed")).toBe(true);
    expect(validBrandColor("#FFFFFF")).toBe(true);
    expect(validBrandColor("red")).toBe(false);
    expect(validBrandColor("#fff")).toBe(false);
    expect(validBrandColor("#123456;")).toBe(false);
  });

  it("escapes brand identity and emits bounded CSS variables", () => {
    const branding = { ...defaultEventBranding, brand_name: "<script>Acme</script>", primary_color: "#112233", hide_memboux: 1 };
    expect(eventBrandIdentity(branding)).toContain("&lt;script&gt;Acme&lt;/script&gt;");
    expect(eventBrandIdentity(branding)).not.toContain("by Memboux");
    expect(eventBrandingStyle(branding)).toContain("--event-brand-primary:#112233");
  });
});
