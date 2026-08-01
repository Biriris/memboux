import { describe, expect, it } from "vitest";
import { weddingThemeKeys } from "../src/wedding-themes";
import { weddingArtDirectionStyles } from "../src/views/wedding-art-direction";
import { weddingLuxuryStyles } from "../src/views/wedding-luxury-style";
import { weddingTemplatePickerStyles } from "../src/views/wedding-template-picker-style";

describe("wedding template art direction", () => {
  it("gives every edition explicit theme-specific composition rules", () => {
    for (const key of weddingThemeKeys) {
      expect(weddingArtDirectionStyles).toContain(`data-wedding-theme="${key}"`);
    }
  });

  it("keeps translated navigation collision-safe on desktop and removes it from the narrow mobile header", () => {
    expect(weddingArtDirectionStyles).toContain("grid-template-columns:minmax(12rem,.8fr) minmax(0,2.7fr) minmax(5.5rem,.65fr)");
    expect(weddingArtDirectionStyles).toContain("overflow-x:auto");
    expect(weddingArtDirectionStyles).toContain(".w-page .w-nav{display:none}");
    expect(weddingArtDirectionStyles).toContain("grid-template-columns:minmax(0,1fr) auto");
    expect(weddingArtDirectionStyles).toContain(".w-page .w-top>.brand-mark strong+span{display:none!important}");
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
    expect(weddingArtDirectionStyles).toContain("--w-hero-size:clamp(2.85rem,6.7vw,6.15rem)");
    expect(weddingArtDirectionStyles).toContain("--w-title-size:clamp(2rem,3.9vw,3.75rem)");
    expect(weddingArtDirectionStyles).toContain('.w-page[data-wedding-layout="poster"] .w-hero h1{font-size:var(--w-hero-size)}');
  });

  it("gives pre-wedding media a responsive photo-led composition", () => {
    expect(weddingArtDirectionStyles).toContain(".w-page .w-hero-slide.is-active");
    expect(weddingArtDirectionStyles).toContain(".w-page .w-story-portrait");
    expect(weddingArtDirectionStyles).toContain(".w-page .w-photo-grid");
    expect(weddingArtDirectionStyles).toContain('.w-page[data-wedding-layout="editorial"] .w-photo-card:nth-child(1)');
    expect(weddingArtDirectionStyles).toContain("grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-flow:dense");
    expect(weddingArtDirectionStyles).toContain(".w-page.is-motion-ready [data-reveal-item]");
    expect(weddingArtDirectionStyles).toContain("transition-delay:calc(var(--w-reveal-index,0) * 70ms)");
    expect(weddingArtDirectionStyles).toContain(".w-page .w-hero-media{position:absolute;z-index:-3");
  });

  it("keeps hero slides independent from the entrance animation and provides resilient font fallbacks", () => {
    expect(weddingLuxuryStyles).toContain(".w-hero-media{animation:w-cover-arrive");
    expect(weddingLuxuryStyles).not.toContain(".w-cover{z-index:-3");
    expect(weddingLuxuryStyles).not.toContain(".w-cover{z-index:-3;transform:scale(1.012);animation");
    expect(weddingLuxuryStyles).toContain('html[lang="el"] .w-page');
    expect(weddingLuxuryStyles).toContain("'Noto Sans'");
    expect(weddingLuxuryStyles).toContain("@supports ((background-clip:text) or (-webkit-background-clip:text))");
    expect(weddingLuxuryStyles).toContain(".w-hero h1{position:relative;max-width:12ch;margin:0 auto;color:#fff");
  });

  it("adds restrained countdown typography and template-aware ornaments", () => {
    expect(weddingArtDirectionStyles).toContain(".w-page .w-countdown-grid");
    expect(weddingArtDirectionStyles).toContain("font-variant-numeric:tabular-nums");
    expect(weddingArtDirectionStyles).toContain('content:"❦"');
    expect(weddingArtDirectionStyles).toContain("font-size:min(var(--w-title-size),clamp(2rem,3.9vw,3.75rem))");
  });
});
