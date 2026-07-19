import { describe, expect, it } from "vitest";
import { normalizeWeddingTheme, validWeddingAccent, weddingThemes } from "../src/wedding-themes";

describe("wedding themes", () => {
  it("offers fifteen original, localized templates with distinct art direction", () => {
    expect(weddingThemes.map((theme) => theme.key)).toEqual([
      "cypress", "nocturne", "lumiere", "atelier", "aegean",
      "champagne", "wildflower", "terracotta", "monogram", "deco",
      "celeste", "vinifera", "pearl", "solstice", "alpine",
    ]);
    expect(new Set(weddingThemes.map((theme) => theme.key)).size).toBe(15);
    for (const theme of weddingThemes) {
      for (const locale of ["en", "el", "fr", "de", "es", "it"] as const) {
        expect(theme.name[locale]).toBeTruthy();
        expect(theme.description[locale]).toBeTruthy();
      }
      expect(theme.palette).toHaveLength(3);
      expect(["centered", "editorial", "split", "framed", "poster"]).toContain(theme.layout);
      expect(["didot", "garamond", "noto-serif", "modern"]).toContain(theme.font);
      expect(theme.defaultAccent).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("normalizes template and accent input", () => {
    expect(normalizeWeddingTheme("NOCTURNE")).toBe("nocturne");
    expect(normalizeWeddingTheme("DECO")).toBe("deco");
    expect(normalizeWeddingTheme("unknown")).toBe("cypress");
    expect(validWeddingAccent("#AABBCC")).toBe("#aabbcc");
    expect(validWeddingAccent("red; background:url(x)")).toBeNull();
  });
});
