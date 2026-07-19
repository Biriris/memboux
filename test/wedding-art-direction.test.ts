import { describe, expect, it } from "vitest";
import { weddingThemeKeys } from "../src/wedding-themes";
import { weddingArtDirectionStyles } from "../src/views/wedding-art-direction";
import { weddingTemplatePickerStyles } from "../src/views/wedding-template-picker-style";

describe("wedding template art direction", () => {
  it("gives every edition explicit theme-specific composition rules", () => {
    for (const key of weddingThemeKeys) {
      expect(weddingArtDirectionStyles).toContain(`data-wedding-theme="${key}"`);
    }
  });

  it("keeps translated navigation collision-safe on desktop and accessible on mobile", () => {
    expect(weddingArtDirectionStyles).toContain("grid-template-columns:minmax(12rem,.8fr) minmax(0,2.7fr) minmax(5.5rem,.65fr)");
    expect(weddingArtDirectionStyles).toContain("overflow-x:auto");
    expect(weddingArtDirectionStyles).toContain(".w-page .w-nav{display:flex}");
  });

  it("normalizes picker card height and previews all fifteen distinct editions", () => {
    expect(weddingTemplatePickerStyles).toContain("height:100%;flex-direction:column");
    expect(weddingTemplatePickerStyles).toContain("aspect-ratio:4/3");
    expect(weddingTemplatePickerStyles).toContain('.w-template-card[data-selected="true"]');
    expect(weddingTemplatePickerStyles).toContain(".w-template-selected");
    for (let index = 1; index <= weddingThemeKeys.length; index += 1) {
      expect(weddingTemplatePickerStyles).toContain(`.w-template-card:nth-child(${index})`);
    }
  });

  it("keeps the complete brand visible and uses readable preview typography", () => {
    expect(weddingArtDirectionStyles).toContain("min-width:11.5rem");
    expect(weddingArtDirectionStyles).toContain("display:block!important");
    expect(weddingArtDirectionStyles).toContain("--w-hero-size:clamp(3rem,7.4vw,6.9rem)");
    expect(weddingArtDirectionStyles).toContain("--w-title-size:clamp(2.2rem,4.7vw,4.5rem)");
    expect(weddingArtDirectionStyles).toContain('.w-page[data-wedding-layout="poster"] .w-hero h1{font-size:var(--w-hero-size)}');
  });
});
