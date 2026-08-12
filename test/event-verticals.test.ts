import { describe, expect, it } from "vitest";
import { eventTypes } from "../src/event-types";
import { eventVerticalFor, eventVerticals, verticalText } from "../src/event-verticals";
import { eventUiCopy, eventWizardCopy } from "../src/event-ui-copy";
import { supportedLocales } from "../src/i18n";
import { esc } from "../src/utils";
import { eventVerticalLandingPage } from "../src/views/event-vertical-landing";
import { demoThemes, eventVerticalDemoFrame, eventVerticalDemoPage, normalizeDemoTheme } from "../src/views/event-vertical-demo";

describe("event vertical landing framework", () => {
  it("covers every specialized non-wedding event exactly once", () => {
    const expected = eventTypes.filter((type) => type !== "wedding");
    expect(eventVerticals.map((vertical) => vertical.type)).toEqual(expected);
    expect(new Set(eventVerticals.map((vertical) => vertical.type)).size).toBe(expected.length);
    expect(eventVerticalFor("unknown")).toBeNull();
  });

  it("provides localized messaging and four tailored wizard phases", () => {
    for (const vertical of eventVerticals) {
      expect(vertical.features).toHaveLength(3);
      expect(vertical.wizardSteps).toHaveLength(4);
      for (const locale of supportedLocales) {
        expect(verticalText(vertical.headline, locale).trim()).not.toBe("");
        for (const step of vertical.wizardSteps) expect(verticalText(step, locale).trim()).not.toBe("");
      }
    }
  });

  it("renders an indexable event-specific funnel", () => {
    const birthday = eventVerticalFor("birthday");
    expect(birthday).not.toBeNull();
    const html = eventVerticalLandingPage("el", birthday!);
    expect(html).toContain('<link rel="canonical" href="https://memboux.com/el/events/birthday">');
    expect(html).toContain("create%3Dbirthday");
    expect(html).toContain("7 ημέρες");
    expect(html).toContain('hreflang="x-default"');
    expect(html).toContain("/el/events/birthday/preview");
  });

  it("renders a real no-account demo in four appearance directions", () => {
    const birthday = eventVerticalFor("birthday")!;
    const shell = eventVerticalDemoPage("el", birthday);
    expect(shell.match(/data-demo-theme=/g)).toHaveLength(4);
    expect(shell).toContain('data-demo-width="390px"');
    expect(shell).toContain("/el/events/birthday/demo-frame?theme=signature");
    expect(shell).toContain("/fr/events/birthday/preview?theme=signature");
    expect(shell).toContain('data-preview-language="it"');
    expect(shell).toContain('content="noindex,nofollow,noarchive"');
    expect(shell).not.toContain("data-support-open");
    for (const theme of demoThemes) {
      const frame = eventVerticalDemoFrame("en", birthday, theme);
      expect(frame).toContain('data-event-preview="birthday"');
      expect(frame).toContain(`data-event-theme="${theme}"`);
      expect(frame).toContain('id="demo-features"');
      expect(frame).toContain('id="demo-interaction"');
      expect(frame).toContain('data-demo-feature-form');
      expect(frame).toContain('id="demo-contribute"');
      expect(frame).toContain('id="demo-gallery"');
      expect(frame).toContain("Every perspective belongs in the story.");
      expect(frame).toContain("The event through everyone’s eyes.");
    }
    expect(normalizeDemoTheme("invalid")).toBe("signature");
  });

  it("offers safe event-specific guest simulations instead of a disabled static demo", () => {
    const bachelor = eventVerticalDemoFrame("el", eventVerticalFor("bachelor")!, "signature");
    const birthday = eventVerticalDemoFrame("el", eventVerticalFor("birthday")!, "signature");
    const corporate = eventVerticalDemoFrame("el", eventVerticalFor("corporate")!, "signature");

    expect(bachelor).toContain('data-demo-kind="poll"');
    expect(bachelor).toContain("Ψήφισε για την επόμενη στιγμή");
    expect(birthday).toContain('data-demo-kind="message"');
    expect(birthday).toContain("Άφησε ένα μήνυμα");
    expect(corporate).toContain('data-demo-kind="rsvp"');
    expect(corporate).toContain("Θα είσαι μαζί μας;");
    expect(bachelor).toContain("form?.addEventListener('submit'");
    expect(bachelor).not.toContain("button,form{pointer-events:none");
    expect(bachelor).toContain("τίποτα δεν αποστέλλεται και δεν αποθηκεύεται");
  });

  it("keeps the selected appearance while changing preview language", () => {
    const bachelor = eventVerticalFor("bachelor")!;
    const html = eventVerticalDemoPage("de", bachelor, "vivid");
    expect(html).toContain("/el/events/bachelor/preview?theme=vivid");
    expect(html).toContain("/fr/events/bachelor/preview?theme=vivid");
    expect(html).toContain("/it/events/bachelor/preview?theme=vivid");
    expect(html).toContain("/de/events/bachelor/demo-frame?theme=vivid");
  });

  it("renders the complete shared-memory demo for every event type and language", () => {
    const languageLabels = { en: "Language", el: "Γλώσσα", fr: "Langue", de: "Sprache", es: "Idioma", it: "Lingua" } as const;
    for (const vertical of eventVerticals) {
      for (const locale of supportedLocales) {
        const frame = eventVerticalDemoFrame(locale, vertical, "signature");
        expect(frame).toContain('id="demo-contribute"');
        expect(frame).toContain('type="file"');
        expect(frame).toContain('href="#demo-gallery"');
        expect(frame).toContain('href="#demo-contribute"');
        expect(frame).toContain(`/${locale}/events/${vertical.type}/demo-frame?theme=signature`);
        expect(frame).not.toContain(`/gallery/DEMO-${vertical.type.toUpperCase()}`);
        expect(frame).not.toContain("pointer-events:none");
        expect(frame).not.toContain("hello@example.com");
        expect(frame).toContain(esc(verticalText(vertical.features[0], locale)));
        expect(frame).toContain(esc(verticalText(vertical.features[1], locale)));
        expect(frame).toContain(esc(verticalText(vertical.features[2], locale)));
        expect(frame).toContain(`aria-label="${languageLabels[locale]}"`);
        if (locale !== "en") expect(frame).not.toContain('aria-label="Language"');
      }
    }
  });

  it("keeps every inner demo language and upload action inside a safe simulation", () => {
    const bachelor = eventVerticalDemoFrame("el", eventVerticalFor("bachelor")!, "vivid");
    for (const locale of supportedLocales) {
      expect(bachelor).toContain(`/${locale}/events/bachelor/demo-frame?theme=vivid`);
    }
    expect(bachelor).toContain("Επίλεξε πρώτα τουλάχιστον μία φωτογραφία ή ένα βίντεο.");
    expect(bachelor).toContain("Η προσομοίωση ολοκληρώθηκε");
    expect(bachelor).toContain("upload?.addEventListener('click'");
  });

  it("uses native specialized copy for high-priority social experiences in every supported language", () => {
    const expected: Record<"fr" | "de" | "es" | "it", [string, string, string, string]> = {
      fr: ["Une dernière grande soirée", "Les photos de tous", "Transformez un anniversaire", "Gardez l’énergie"],
      de: ["Eine letzte große Nacht", "Die Fotos von allen", "Macht aus einem Geburtstag", "Haltet die Energie"],
      es: ["Una última gran noche", "Las fotos de todos", "Convierte un cumpleaños", "Mantén viva la energía"],
      it: ["Un’ultima grande serata", "Le foto di tutti", "Trasforma un compleanno", "Mantieni viva l’energia"],
    };
    for (const locale of ["fr", "de", "es", "it"] as const) {
      const bachelor = eventVerticalLandingPage(locale, eventVerticalFor("bachelor")!);
      const trip = eventVerticalLandingPage(locale, eventVerticalFor("trip")!);
      const birthday = eventVerticalLandingPage(locale, eventVerticalFor("birthday")!);
      const party = eventVerticalLandingPage(locale, eventVerticalFor("party")!);
      expect(bachelor).toContain(expected[locale][0]);
      expect(trip).toContain(expected[locale][1]);
      expect(birthday).toContain(expected[locale][2]);
      expect(party).toContain(expected[locale][3]);
      expect(bachelor).not.toContain("One last big night");
      expect(trip).not.toContain("Everyone’s photos");
      expect(birthday).not.toContain("Turn one birthday");
      expect(party).not.toContain("Keep the energy alive");
    }
  });

  it("uses native specialized copy for engagement, baptism, and baby experiences", () => {
    const expected = {
      fr: ["Commencez l’histoire", "Un doux souvenir numérique", "Rassemblez le premier chapitre"],
      de: ["Beginnt eure Geschichte", "Ein liebevolles digitales Andenken", "Sammelt das erste Kapitel"],
      es: ["Empieza la historia", "Un delicado recuerdo digital", "Reúne el primer capítulo"],
      it: ["Inizia la storia", "Un delicato ricordo digitale", "Raccogli il primo capitolo"],
    } as const;
    for (const locale of ["fr", "de", "es", "it"] as const) {
      for (const [index, type] of ["engagement", "baptism", "baby"].entries()) {
        const html = eventVerticalLandingPage(locale, eventVerticalFor(type)!);
        expect(html).toContain(expected[locale][index]);
      }
    }
  });

  it("uses native specialized copy for graduation, corporate, and reunion experiences", () => {
    const expected = {
      fr: ["Célébrez le travail accompli", "Un espace à votre image", "Réunissez les anciennes histoires"],
      de: ["Feiert die Leistung", "Eine gebrandete Zentrale", "Bringt alte Geschichten"],
      es: ["Celebra el esfuerzo", "Un espacio de marca", "Reúne las historias"],
      it: ["Celebra il percorso", "Un hub coordinato", "Unisci le vecchie storie"],
    } as const;
    for (const locale of ["fr", "de", "es", "it"] as const) {
      for (const [index, type] of ["graduation", "corporate", "reunion"].entries()) {
        expect(eventVerticalLandingPage(locale, eventVerticalFor(type)!)).toContain(expected[locale][index]);
      }
    }
  });

  it("uses native specialized copy for community, memorial, and custom experiences", () => {
    const expected = {
      fr: ["Permettez à toute la communauté", "Préservez une vie", "Créez un événement"],
      de: ["Lasst die ganze Community", "Bewahrt ein Leben", "Gestaltet ein Event"],
      es: ["Haz que toda la comunidad", "Conserva una vida", "Da forma a un evento"],
      it: ["Permetti a tutta la comunità", "Custodisci una vita", "Crea un evento"],
    } as const;
    for (const locale of ["fr", "de", "es", "it"] as const) {
      for (const [index, type] of ["community", "memorial", "other"].entries()) {
        expect(eventVerticalLandingPage(locale, eventVerticalFor(type)!)).toContain(expected[locale][index]);
      }
    }
  });

  it("has no English fallback left in specialized vertical content for FR, DE, ES, or IT", () => {
    for (const vertical of eventVerticals) {
      const values = [
        vertical.eyebrow,
        vertical.headline,
        vertical.lead,
        vertical.previewLabel,
        ...vertical.features,
        ...vertical.wizardSteps,
      ];
      for (const locale of ["fr", "de", "es", "it"] as const) {
        for (const value of values) {
          expect(
            verticalText(value, locale),
            `${vertical.type}/${locale} still falls back to: ${value.en}`,
          ).not.toBe(value.en);
        }
      }
    }
  });

  it("localizes the shared landing, demo, preview, and wizard interface", () => {
    const uiKeys = [
      "guidedSetup", "createEvent", "startFreePreview", "viewDemo", "privatePreview",
      "experienceTitle", "wizardTitle", "trialTitle", "demoTitle", "appearance",
      "device", "responsivePreview", "ownerPreview", "dateTba", "story", "forGuests",
    ] as const;
    const wizardKeys = [
      "identityTitle", "identityText", "headline", "host", "introduction", "flowTitle",
      "scheduleMoments", "artTitle", "visualStyle", "storyLabel", "reviewTitle",
      "reviewText", "guestInfo", "completeWizard", "back", "finishPreview",
      "saveContinue", "autosave", "restored", "saving", "saved", "protected",
      "previewHelp", "openPreview", "backWorkspace",
    ] as const;
    for (const locale of ["el", "fr", "de", "es", "it"] as const) {
      for (const key of uiKeys) expect(eventUiCopy[locale][key], `${locale}/${key}`).not.toBe(eventUiCopy.en[key]);
      for (const key of wizardKeys) expect(eventWizardCopy[locale][key], `${locale}/${key}`).not.toBe(eventWizardCopy.en[key]);
    }
  });

  it("renders native shared copy in public FR/DE/ES/IT funnels and demos", () => {
    const birthday = eventVerticalFor("birthday")!;
    for (const locale of ["fr", "de", "es", "it"] as const) {
      const landing = eventVerticalLandingPage(locale, birthday);
      const demo = eventVerticalDemoPage(locale, birthday);
      expect(landing).toContain(eventUiCopy[locale].startFreePreview);
      expect(landing).toContain(eventUiCopy[locale].trialTitle);
      expect(landing).not.toContain(eventUiCopy.en.startFreePreview);
      expect(demo).toContain(eventUiCopy[locale].demoTitle);
      expect(demo).toContain(eventUiCopy[locale].trialSummary);
      expect(demo).not.toContain(eventUiCopy.en.demoTitle);
    }
  });

  it("uses natural Greek instead of placeholder product jargon in the public funnel", () => {
    const bachelor = eventVerticalFor("bachelor")!;
    const community = eventVerticalFor("community")!;
    const bachelorLanding = eventVerticalLandingPage("el", bachelor);
    const communityLanding = eventVerticalLandingPage("el", community);

    expect(eventUiCopy.el.startFreePreview).toBe("Ξεκίνα δωρεάν προεπισκόπηση");
    expect(eventUiCopy.el.tailoredWizard).toContain("Οδηγός");
    expect(bachelorLanding).toContain("Ζωντανό ανέβασμα φωτογραφιών");
    expect(bachelorLanding).toContain("ομαδική συνομιλία");
    expect(communityLanding).toContain("Ελεγχόμενα ανεβάσματα");
    expect(communityLanding).toContain("επίσημη ανασκόπηση");
    expect(bachelorLanding).not.toContain("Live photo drops");
    expect(communityLanding).not.toContain("Moderated uploads");
  });
});
