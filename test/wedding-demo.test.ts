import { describe, expect, it } from "vitest";
import { weddingThemes } from "../src/wedding-themes";
import { weddingDemoFrame, weddingDemoPage } from "../src/views/wedding-demo";

describe("public wedding demo", () => {
  it("marks the requested initial theme as selected before JavaScript runs", () => {
    const html = weddingDemoPage("en", "nocturne");
    expect(html).toContain('data-wedding-demo-theme="nocturne" data-layout="editorial" aria-pressed="true"');
    expect(html).toContain('data-wedding-demo-theme="cypress" data-layout="centered" aria-pressed="false"');
  });

  it("offers every wedding art direction before registration", () => {
    const html = weddingDemoPage("el");
    expect(html.match(/data-wedding-demo-theme=/g)).toHaveLength(15);
    expect(html).toContain('class="w-demo-rail"');
    expect(html).toContain('class="w-demo-thumb"');
    expect(html).toContain("scroll-snap-type:x proximity");
    expect(html).toContain('data-wedding-demo-width="390px"');
    expect(html).toContain("/fr/wedding/preview?theme=cypress");
    expect(html).toContain('data-preview-language="it"');
    expect(html).toContain("redirect=%2Fel%2Faccount%3Fcreate%3Dwedding");
    expect(html).toContain('content="noindex,nofollow,noarchive"');
    expect(html).not.toContain("data-support-open");
  });

  it("preserves the selected wedding design across languages", () => {
    const html = weddingDemoPage("es", "nocturne");
    expect(html).toContain("/el/wedding/preview?theme=nocturne");
    expect(html).toContain("/de/wedding/preview?theme=nocturne");
    expect(html).toContain("/it/wedding/preview?theme=nocturne");
    expect(html).toContain("/es/wedding/demo-frame?theme=nocturne");
  });

  it("renders each theme through the actual wedding renderer", () => {
    for (const theme of weddingThemes) {
      const html = weddingDemoFrame("en", theme.key);
      expect(html).toContain(`data-wedding-theme="${theme.key}"`);
      expect(html).toContain("Alex &amp; Maria");
      expect(html).toContain("RSVP");
      expect(html).toContain("Guestbook");
      expect(html).toContain('id="guest-experience"');
      expect(html).toContain('id="guest-upload"');
      expect(html).toContain('id="official-album"');
      expect(html).toContain('id="live"');
      expect(html).toContain("Every perspective, together");
      expect(html).not.toContain('href="/gallery/WEDDING-DEMO');
    }
  });

  it("localizes the actual preview content instead of only the language controls", () => {
    expect(weddingDemoFrame("fr", "cypress")).toContain("Chapelle Saint-Nicolas, Oia");
    expect(weddingDemoFrame("de", "cypress")).toContain("Kapelle des Heiligen Nikolaus, Oia");
    expect(weddingDemoFrame("es", "cypress")).toContain("Capilla de San Nicolás, Oia");
    expect(weddingDemoFrame("it", "cypress")).toContain("Cappella di San Nicola, Oia");
    expect(weddingDemoFrame("el", "cypress")).toContain("Παρεκκλήσι Αγίου Νικολάου, Οία");
    expect(weddingDemoFrame("el", "cypress")).toContain("Κάθε οπτική, μαζί");
    expect(weddingDemoFrame("el", "cypress")).toContain("Έτοιμο για ανέβασμα σε πραγματική εκδήλωση.");
    expect(weddingDemoFrame("el", "cypress")).not.toContain("πραγματικό event");
    const italian = weddingDemoFrame("it", "cypress");
    expect(italian).toContain("RSVP e libro degli ospiti");
    expect(italian).toContain("Aggiungi al libro degli ospiti");
    expect(italian).not.toContain(">Guestbook<");
    expect(italian).not.toContain("Aggiungi al guestbook");
  });

  it("keeps the in-preview language switch on real demo routes", () => {
    const html = weddingDemoFrame("el", "nocturne");
    expect(html).toContain('value="/en/wedding/demo-frame?theme=nocturne"');
    expect(html).toContain('value="/fr/wedding/demo-frame?theme=nocturne"');
    expect(html).toContain('value="/it/wedding/demo-frame?theme=nocturne"');
    expect(html).not.toContain("/wedding/WEDDING-DEMO?lang=");
  });

  it("makes RSVP, guestbook and guest uploads interactive without sending preview data", () => {
    const html = weddingDemoFrame("el", "cypress");
    expect(html).toContain('data-wedding-demo-action="rsvp"');
    expect(html).toContain('data-wedding-demo-action="guestbook"');
    expect(html).toContain('data-wedding-demo-action="upload"');
    expect(html).toContain('role="status" aria-live="polite"');
    expect(html).toContain("Η παρουσία επιβεβαιώθηκε σε αυτή την προεπισκόπηση.");
    expect(html).toContain("Η ευχή σου εμφανίζεται εδώ στην προεπισκόπηση.");
    expect(html).toContain("Επίλεξε πρώτα τουλάχιστον μία φωτογραφία ή ένα βίντεο.");
    expect(html).toContain("form.reportValidity()");
    expect(html).not.toContain('method="post"');
    expect(html).not.toContain('action="/api/');
  });

  it("uses natural Greek copy throughout the preview and its controls", () => {
    const html = weddingDemoPage("el", "cypress");
    const frame = weddingDemoFrame("el", "cypress");
    expect(html).toContain("Βοτανική αισθητική περιοδικού");
    expect(html).toContain(">Κινητό</button>");
    expect(html).toContain(">Υπολογιστής</button>");
    expect(html).not.toContain("Editorial βοτανική");
    expect(frame).toContain("Επίσημο άλμπουμ");
    expect(frame).toContain("Ζωντανές στιγμές");
    expect(frame).toContain(">Επίσημο<");
    expect(frame).toContain(">Ζωντανά<");
  });

  it("localizes device controls in every public preview language", () => {
    expect(weddingDemoPage("fr")).toContain(">Ordinateur</button>");
    expect(weddingDemoPage("de")).toContain(">Mobil</button>");
    expect(weddingDemoPage("es")).toContain(">Móvil</button>");
    expect(weddingDemoPage("es")).toContain(">Ordenador</button>");
    expect(weddingDemoPage("it")).toContain(">Computer</button>");
    expect(weddingDemoFrame("fr", "cypress")).toContain("RSVP et livre d’or");
    expect(weddingDemoFrame("de", "cypress")).toContain("RSVP &amp; Gästebuch");
  });

  it("keeps narrow wedding previews free of desktop-navigation overflow", () => {
    const html = weddingDemoFrame("en", "cypress");
    expect(html).toContain(".w-page .w-nav{display:none}");
    expect(html).toContain("grid-template-columns:minmax(0,1fr) auto");
    expect(html).toContain("overflow-x:hidden");
  });

  it("demonstrates safe interactive calendar actions without fake contact details", () => {
    const html = weddingDemoFrame("el", "nocturne");
    expect(html).toContain("Προσθήκη στο ημερολόγιο");
    expect(html).toContain('href="#schedule"');
    expect(html).toContain("scroll-behavior:smooth");
    expect(html).not.toContain(".w-page a,.w-page button,.w-page form{pointer-events:none!important}");
    expect(html).not.toContain("wedding@example.com");
  });
});
