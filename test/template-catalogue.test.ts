import { describe, expect, it } from "vitest";
import { eventVerticals } from "../src/event-verticals";
import { supportedLocales } from "../src/i18n";
import { weddingThemes } from "../src/wedding-themes";
import { templateCataloguePage } from "../src/views/template-catalogue";

describe("public template catalogue", () => {
  it("lists every wedding edition and event vertical with a real preview", () => {
    const html = templateCataloguePage("en");
    for (const theme of weddingThemes) {
      expect(html).toContain(`/en/wedding/preview?theme=${theme.key}`);
      expect(html).toContain(`create%3Dwedding%26template%3D${theme.key}`);
    }
    for (const vertical of eventVerticals) {
      expect(html).toContain(`/en/events/${vertical.type}/preview?theme=signature`);
      expect(html).toContain(`create%3D${vertical.type}%26template%3Dsignature`);
    }
    expect(html.match(/data-category="wedding"/g)).toHaveLength(weddingThemes.length);
    expect(html.match(/data-category="event"/g)).toHaveLength(eventVerticals.length);
  });

  it("is localized, indexable and exposes accessible filters plus analytics events", () => {
    for (const locale of supportedLocales) {
      const html = templateCataloguePage(locale);
      expect(html).toContain(`<link rel="canonical" href="https://memboux.com/${locale}/templates">`);
      expect(html).toContain(`href="/${locale}/templates"`);
      expect(html).not.toContain("noindex,nofollow");
    }
    const html = templateCataloguePage("el");
    expect(html).toContain('data-template-filter="all" aria-pressed="true"');
    expect(html).toContain("memboux:template-action");
    expect(html).toContain("Χρήση αυτού του template");
  });
});
