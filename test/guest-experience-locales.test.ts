import { describe, expect, it } from "vitest";
import type { Locale } from "../src/i18n";
import { mediaCommentsOverlay, renderGuestParticipation } from "../src/views/experience";

const localeExpectations: Record<Locale, {
  rsvp: string;
  guestbook: string;
  comments: string;
  attendance: string;
}> = {
  en: {
    rsvp: "Will you join us?",
    guestbook: "Guestbook",
    comments: "Comments",
    attendance: "Yes, I’ll attend",
  },
  el: {
    rsvp: "Θα είσαι μαζί μας;",
    guestbook: "Ευχολόγιο",
    comments: "Σχόλια",
    attendance: "Ναι, θα έρθω",
  },
  fr: {
    rsvp: "Serez-vous parmi nous ?",
    guestbook: "Livre d’or",
    comments: "Commentaires",
    attendance: "Oui, je serai présent(e)",
  },
  de: {
    rsvp: "Bist du dabei?",
    guestbook: "Gästebuch",
    comments: "Kommentare",
    attendance: "Ja, ich bin dabei",
  },
  es: {
    rsvp: "¿Nos acompañas?",
    guestbook: "Libro de visitas",
    comments: "Comentarios",
    attendance: "Sí, asistiré",
  },
  it: {
    rsvp: "Sarai con noi?",
    guestbook: "Guestbook",
    comments: "Commenti",
    attendance: "Sì, parteciperò",
  },
};

describe("six-language guest participation experience", () => {
  for (const [locale, expected] of Object.entries(localeExpectations) as Array<[Locale, typeof localeExpectations[Locale]]>) {
    it(`renders localized RSVP, guestbook, and comments in ${locale}`, () => {
      const participation = renderGuestParticipation(
        "AB<123",
        [{ author_name: "<Maria>", message: "<Great day>", created_at: 1 }],
        locale,
      );
      const comments = mediaCommentsOverlay("AB<123", locale);
      const commentScript = comments.match(/^<script>([\s\S]*)<\/script>$/)?.[1];

      expect(participation).toContain(expected.rsvp);
      expect(participation).toContain(expected.guestbook);
      expect(participation).toContain(expected.attendance);
      expect(participation).toContain(`name="locale" value="${locale}"`);
      expect(participation).toContain('aria-label="RSVP"');
      expect(participation).toContain('autocomplete="name"');
      expect(participation).toContain("&lt;Maria&gt;");
      expect(participation).toContain("&lt;Great day&gt;");
      expect(participation).toContain("/api/gallery/AB%3C123/rsvp");
      expect(comments).toContain(JSON.stringify(expected.comments));
      expect(comments).toContain("button.setAttribute('aria-label',labels.title)");
      expect(comments).toContain('role="alert"');
      expect(commentScript).toBeTruthy();
      expect(() => new Function(commentScript!)).not.toThrow();

      if (locale !== "en") {
        expect(participation).not.toContain("Will you join us?");
        expect(participation).not.toContain("Yes, I’ll attend");
        expect(comments).not.toContain('"title":"Comments"');
      }
    });
  }

  it("describes immediate guestbook publishing instead of an approval queue", () => {
    const english = renderGuestParticipation("EVENT1", [], "en");
    const greek = renderGuestParticipation("EVENT1", [], "el");

    expect(english).toContain("Your message appears immediately and the host can hide it if needed.");
    expect(english).not.toContain("after host approval");
    expect(greek).toContain("Η ευχή σου εμφανίζεται αμέσως και ο διοργανωτής μπορεί να την αποκρύψει αν χρειαστεί.");
    expect(greek).not.toContain("μετά από έγκριση");
  });

  it("renders only the enabled participation module", () => {
    const rsvpOnly = renderGuestParticipation("EVENT1", [], "fr", {
      rsvp_enabled: 1,
      guestbook_enabled: 0,
    });
    const guestbookOnly = renderGuestParticipation("EVENT1", [], "de", {
      rsvp_enabled: 0,
      guestbook_enabled: 1,
    });

    expect(rsvpOnly).toContain("Serez-vous parmi nous ?");
    expect(rsvpOnly).not.toContain("Livre d’or");
    expect(guestbookOnly).toContain("Gästebuch");
    expect(guestbookOnly).not.toContain("Bist du dabei?");
    expect(renderGuestParticipation("EVENT1", [], "es", {
      rsvp_enabled: 0,
      guestbook_enabled: 0,
    })).toBe("");
  });
});
