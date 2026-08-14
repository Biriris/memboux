import { describe, expect, it } from "vitest";
import type { LikeableMediaRow } from "../src/media-likes";
import { renderWeddingExperience } from "../src/views/wedding-experience";

const photo = (id: string, origin: "guest" | "official"): LikeableMediaRow => ({
  id,
  event_id: "event-1",
  object_key: `${id}.jpg`,
  media_type: "image",
  content_type: "image/jpeg",
  uploaded_by: origin === "guest" ? "Guest Maria" : "Studio",
  uploaded_at: 10,
  captured_at: 9,
  content_hash: id,
  canonical_hash: id,
  reported_at: null,
  size_bytes: 10,
  title: null,
  deleted_at: null,
  purge_at: null,
  upload_consent_at: 10,
  upload_policy_version: "v1",
  origin,
  uploaded_by_user_id: null,
  like_count: 2,
  viewer_liked: 0,
});

describe("integrated wedding guest experience", () => {
  it("renders uploads, gallery, guestbook, official album, live and sharing in that order without RSVP", () => {
    const result = renderWeddingExperience({
      code: "ABC123",
      eventName: "Alex & Sam",
      locale: "en",
      guestUrl: "https://memboux.com/wedding/ABC123",
      guestQrSvg: '<svg data-test="guest-qr"></svg>',
      guestItems: [photo("guest-1", "guest")],
      officialItems: [photo("official-1", "official")],
      guestbookEntries: [{ author_name: "Nina", message: "Beautiful day", created_at: 10 }],
      settings: { rsvp_enabled: 1, guestbook_enabled: 1, comments_enabled: 1, slideshow_enabled: 1 },
      curatorName: "North Studio",
    });
    expect(result.html).toContain('id="guest-upload"');
    expect(result.html).toContain('id="guest-moments"');
    expect(result.html).toContain('id="participate"');
    expect(result.html).toContain('id="official-album"');
    expect(result.html).toContain('id="live"');
    expect(result.html).toContain('id="guest-share"');
    expect(result.html).not.toContain('aria-label="RSVP"');
    expect(result.html.indexOf('id="guest-upload"')).toBeLessThan(result.html.indexOf('id="guest-moments"'));
    expect(result.html.indexOf('id="guest-moments"')).toBeLessThan(result.html.indexOf('id="participate"'));
    expect(result.html.indexOf('id="participate"')).toBeLessThan(result.html.indexOf('id="official-album"'));
    expect(result.html.indexOf('id="official-album"')).toBeLessThan(result.html.indexOf('id="guest-share"'));
    expect(result.html).toContain('data-test="guest-qr"');
    expect(result.html).toContain("North Studio");
    expect(result.html).toContain("Guest Maria");
    expect(result.scripts).toContain("slideshow-feed");
    expect(result.scripts).toContain("wedding-select-media");
  });

  it("matches wedding download controls to the event entitlement", () => {
    const input = {
      code: "ABC123",
      eventName: "Alex & Sam",
      locale: "en" as const,
      guestUrl: "https://memboux.com/wedding/ABC123",
      guestQrSvg: "<svg></svg>",
      guestItems: [photo("guest-1", "guest")],
      officialItems: [],
      guestbookEntries: [],
      settings: { rsvp_enabled: 0, guestbook_enabled: 0, comments_enabled: 0, slideshow_enabled: 0 },
      curatorName: "Memboux Studio",
    };

    const trial = renderWeddingExperience({ ...input, originalDownloads: false });
    expect(trial.scripts).toContain("Originals unlock with upgrade");
    expect(trial.scripts).not.toContain('id="lightbox-download"');
    expect(trial.scripts).toContain("#wedding-select-media,#wedding-download-selected");

    const unlocked = renderWeddingExperience({ ...input, originalDownloads: true });
    expect(unlocked.scripts).toContain('id="lightbox-download"');
    expect(unlocked.scripts).not.toContain("#wedding-select-media,#wedding-download-selected");
  });

  it("progressively reveals large guest galleries", () => {
    const result = renderWeddingExperience({
      code: "ABC123",
      eventName: "Alex & Sam",
      locale: "en",
      guestUrl: "https://memboux.com/wedding/ABC123",
      guestQrSvg: "<svg></svg>",
      guestItems: Array.from({ length: 24 }, (_, index) => photo(`guest-${index}`, "guest")),
      guestMediaCount: { total: 30, photos: 30, videos: 0 },
      officialItems: [],
      guestbookEntries: [],
      settings: { rsvp_enabled: 0, guestbook_enabled: 0, comments_enabled: 0, slideshow_enabled: 0 },
      curatorName: "Memboux Studio",
    });
    expect(result.html).toContain('data-gallery-more="wedding-guest-gallery"');
    expect(result.html).toContain("6 remaining");
    expect(result.html).toContain("/api/gallery/ABC123/media-page?lang=en&amp;surface=website");
    expect(result.html).not.toContain('data-gallery-deferred="true"');
    expect(result.scripts).toContain('data-gallery-grid="wedding-guest-gallery"');
    expect(result.html).not.toContain('id="official-album"');
  });

  it("localizes every integrated Wedding section and the visible media picker", () => {
    const expectations = {
      en: ["Guest experience", "Guest uploads", "QR &amp; Share", "Guest moments", "Choose photos or videos"],
      el: ["Εμπειρία καλεσμένων", "Περιεχόμενο καλεσμένων", "QR &amp; κοινοποίηση", "Στιγμές καλεσμένων", "Επίλεξε φωτογραφίες ή βίντεο"],
      fr: ["Expérience invités", "Contenu des invités", "QR et partage", "Moments des invités", "Choisir des photos ou vidéos"],
      de: ["Gästeerlebnis", "Beiträge der Gäste", "QR &amp; Teilen", "Gästemomente", "Fotos oder Videos auswählen"],
      es: ["Experiencia de invitados", "Contenido de invitados", "QR y compartir", "Momentos de invitados", "Elegir fotos o vídeos"],
      it: ["Esperienza ospiti", "Contenuti degli ospiti", "QR e condivisione", "Momenti degli ospiti", "Scegli foto o video"],
    } as const;

    for (const [locale, labels] of Object.entries(expectations)) {
      const result = renderWeddingExperience({
        code: "ABC123",
        eventName: "Alex & Sam",
        locale: locale as keyof typeof expectations,
        guestUrl: "https://memboux.com/wedding/ABC123",
        guestQrSvg: "<svg></svg>",
        guestItems: [],
        officialItems: [],
        guestbookEntries: [],
        settings: { rsvp_enabled: 0, guestbook_enabled: 0, comments_enabled: 0, slideshow_enabled: 0 },
        curatorName: "Memboux Studio",
      });
      for (const label of labels) expect(result.html).toContain(label);
      expect(result.html).toContain('input name="file" required multiple type="file"');
      expect(result.html).toContain('class="sr-only"');
      if (locale !== "en") {
        expect(result.html).not.toContain(">Guest experience<");
        expect(result.html).not.toContain(">Guest uploads<");
        expect(result.html).not.toContain(">Guest moments<");
      }
    }
  });

  it("uses natural Greek and Italian copy without mixed-language fallbacks", () => {
    const render = (locale: "el" | "it") => renderWeddingExperience({
      code: "ABC123",
      eventName: "Alex & Sam",
      locale,
      guestUrl: "https://memboux.com/wedding/ABC123",
      guestQrSvg: "<svg></svg>",
      guestItems: [],
      officialItems: [],
      guestbookEntries: [],
      settings: { rsvp_enabled: 0, guestbook_enabled: 0, comments_enabled: 0, slideshow_enabled: 1 },
      curatorName: "Memboux Studio",
    });

    const greek = render("el");
    for (const phrase of [
      "Ζωντανές στιγμές",
      "Οι νέες φωτογραφίες και τα βίντεο θα εμφανίζονται εδώ αυτόματα.",
      "Προσθήκη στο άλμπουμ",
      "Αντιγραφή συνδέσμου εκδήλωσης",
      "Κοινό άλμπουμ",
    ]) expect(greek.html).toContain(phrase);
    expect(greek.scripts).toContain("Ο σύνδεσμος αντιγράφηκε");
    for (const fallback of ["professional album", "Live στιγμές", "νέα uploads", "σελίδα του event", "στο album", "link event", "Κοινό gallery"]) {
      expect(`${greek.html}${greek.scripts}`).not.toContain(fallback);
    }

    const italian = render("it");
    expect(italian.html).toContain("Galleria condivisa");
    expect(italian.html).not.toContain("Gallery condivisa");
  });
});
