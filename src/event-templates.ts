import type { EventType } from "./event-types";
import { normalizeEventType } from "./event-types";
import type { Locale } from "./i18n";

type LocalizedText = Record<Locale, string>;

export type EventTemplateItem = {
  id: string;
  href: "overview" | "engagement" | "share" | "gallery" | "people" | "wedding-profile" | "wedding-schedule" | "wedding-features" | null;
  title: LocalizedText;
  description: LocalizedText;
};

export type EventTemplate = {
  key: "generic" | "wedding";
  appliesTo: readonly EventType[] | "fallback";
  eyebrow: LocalizedText;
  title: LocalizedText;
  description: LocalizedText;
  items: readonly EventTemplateItem[];
};

const text = (en: string, el: string, fr: string, de: string, es: string, it: string): LocalizedText => ({ en, el, fr, de, es, it });

const genericTemplate: EventTemplate = {
  key: "generic",
  appliesTo: "fallback",
  eyebrow: text("Event template", "Template event", "Modèle d’événement", "Event-Vorlage", "Plantilla de evento", "Modello evento"),
  title: text("Set up your event", "Οργάνωσε το event σου", "Configurez votre événement", "Richte dein Event ein", "Configura tu evento", "Configura il tuo evento"),
  description: text(
    "Your existing flexible workspace, organized into the essential steps.",
    "Το ευέλικτο workspace που ήδη γνωρίζεις, οργανωμένο στα βασικά βήματα.",
    "Votre espace flexible, organisé selon les étapes essentielles.",
    "Dein flexibler Workspace, nach den wichtigsten Schritten geordnet.",
    "Tu espacio flexible, organizado en los pasos esenciales.",
    "Il tuo workspace flessibile, organizzato nei passaggi essenziali.",
  ),
  items: [
    { id: "basics", href: "overview", title: text("Event basics", "Βασικά στοιχεία", "Informations principales", "Grunddaten", "Datos básicos", "Dati principali"), description: text("Name, dates and location.", "Όνομα, ημερομηνίες και τοποθεσία.", "Nom, dates et lieu.", "Name, Datum und Ort.", "Nombre, fechas y ubicación.", "Nome, date e luogo.") },
    { id: "experience", href: "engagement", title: text("Guest experience", "Εμπειρία καλεσμένων", "Expérience invités", "Gästeerlebnis", "Experiencia de invitados", "Esperienza ospiti"), description: text("RSVP, guestbook, comments and live display.", "RSVP, guestbook, σχόλια και live προβολή.", "RSVP, livre d’or, commentaires et diaporama.", "RSVP, Gästebuch, Kommentare und Live-Anzeige.", "RSVP, libro de visitas, comentarios y pantalla en vivo.", "RSVP, guestbook, commenti e visualizzazione live.") },
    { id: "sharing", href: "share", title: text("Share & QR", "Κοινοποίηση & QR", "Partage et QR", "Teilen & QR", "Compartir y QR", "Condivisione e QR"), description: text("Guest link, official album and printable QR.", "Guest link, official album και εκτυπώσιμο QR.", "Lien invités, album officiel et QR imprimable.", "Gast-Link, offizielles Album und druckbares QR.", "Enlace para invitados, álbum oficial y QR imprimible.", "Link ospiti, album ufficiale e QR stampabile.") },
    { id: "media", href: "gallery", title: text("Gallery", "Gallery", "Galerie", "Galerie", "Galería", "Galleria"), description: text("Collect, organize and curate every photo.", "Συλλογή, οργάνωση και επιλογή φωτογραφιών.", "Collectez, organisez et sélectionnez les photos.", "Fotos sammeln, organisieren und kuratieren.", "Recopila, organiza y selecciona las fotos.", "Raccogli, organizza e seleziona le foto.") },
    { id: "people", href: "people", title: text("People & roles", "Άτομα & ρόλοι", "Personnes et rôles", "Personen & Rollen", "Personas y roles", "Persone e ruoli"), description: text("Invite viewers, managers and professionals.", "Πρόσκληση viewers, managers και professionals.", "Invitez des spectateurs, gestionnaires et professionnels.", "Betrachter, Manager und Profis einladen.", "Invita a espectadores, gestores y profesionales.", "Invita spettatori, manager e professionisti.") },
  ],
};

const weddingTemplate: EventTemplate = {
  key: "wedding",
  appliesTo: ["wedding"],
  eyebrow: text("Wedding template", "Wedding template", "Modèle mariage", "Hochzeitsvorlage", "Plantilla de boda", "Modello matrimonio"),
  title: text("Build your wedding experience", "Οργάνωσε την εμπειρία του γάμου", "Créez votre expérience de mariage", "Gestalte euer Hochzeitserlebnis", "Crea la experiencia de tu boda", "Crea l’esperienza del matrimonio"),
  description: text(
    "A guided wedding workspace. Existing gallery tools stay intact while wedding-specific modules are added here.",
    "Ένα καθοδηγούμενο wedding workspace. Όλες οι υπάρχουσες λειτουργίες gallery παραμένουν και εδώ προστίθενται οι ειδικές ενότητες γάμου.",
    "Un espace mariage guidé qui conserve tous les outils de galerie existants.",
    "Ein geführter Hochzeitsbereich, der alle vorhandenen Galerie-Werkzeuge beibehält.",
    "Un espacio de boda guiado que conserva todas las herramientas actuales de la galería.",
    "Un workspace matrimonio guidato che mantiene tutti gli strumenti della galleria.",
  ),
  items: [
    { id: "basics", href: "overview", title: text("Wedding basics", "Βασικά στοιχεία γάμου", "Informations du mariage", "Hochzeitsdaten", "Datos de la boda", "Dati del matrimonio"), description: text("Title, wedding date and location.", "Τίτλος, ημερομηνία γάμου και τοποθεσία.", "Titre, date et lieu.", "Titel, Datum und Ort.", "Título, fecha y ubicación.", "Titolo, data e luogo.") },
    { id: "couple", href: "wedding-profile", title: text("Couple & story", "Ζευγάρι & ιστορία", "Couple et histoire", "Paar & Geschichte", "Pareja e historia", "Coppia e storia"), description: text("Names, welcome message, story and invitation cover.", "Ονόματα, μήνυμα καλωσορίσματος, ιστορία και invitation cover.", "Noms, message, histoire et couverture.", "Namen, Begrüßung, Geschichte und Cover.", "Nombres, bienvenida, historia y portada.", "Nomi, benvenuto, storia e copertina.") },
    { id: "schedule", href: "wedding-schedule", title: text("Ceremony & reception", "Τελετή & δεξίωση", "Cérémonie et réception", "Zeremonie & Feier", "Ceremonia y recepción", "Cerimonia e ricevimento"), description: text("Schedule, venues, directions and useful information.", "Πρόγραμμα, χώροι, οδηγίες και χρήσιμες πληροφορίες.", "Programme, lieux, itinéraires et informations utiles.", "Ablauf, Orte, Anfahrt und Hinweise.", "Programa, lugares, indicaciones e información útil.", "Programma, luoghi, indicazioni e informazioni utili.") },
    { id: "features", href: "wedding-features", title: text("Features & estimate", "Λειτουργίες & εκτίμηση", "Fonctions et estimation", "Funktionen & Schätzung", "Funciones y estimación", "Funzioni e stima"), description: text("Choose optional modules and see the estimated total.", "Επίλεξε προαιρετικές λειτουργίες και δες το εκτιμώμενο σύνολο.", "Choisissez les modules et consultez l’estimation.", "Optionale Module wählen und Schätzung sehen.", "Elige módulos opcionales y consulta la estimación.", "Scegli moduli opzionali e visualizza la stima.") },
    { id: "experience", href: "engagement", title: text("Guest experience", "Εμπειρία καλεσμένων", "Expérience invités", "Gästeerlebnis", "Experiencia de invitados", "Esperienza ospiti"), description: text("RSVP, guestbook, comments, live slideshow and QR.", "RSVP, guestbook, σχόλια, live slideshow και QR.", "RSVP, livre d’or, commentaires, diaporama et QR.", "RSVP, Gästebuch, Kommentare, Slideshow und QR.", "RSVP, libro de visitas, comentarios, presentación y QR.", "RSVP, guestbook, commenti, slideshow e QR.") },
    { id: "sharing", href: "share", title: text("Publish & share", "Δημοσίευση & κοινοποίηση", "Publier et partager", "Veröffentlichen & teilen", "Publicar y compartir", "Pubblica e condividi"), description: text("Guest invitation link, official album and QR templates.", "Invitation link, official album και QR templates.", "Lien d’invitation, album officiel et modèles QR.", "Einladungslink, offizielles Album und QR-Vorlagen.", "Enlace de invitación, álbum oficial y plantillas QR.", "Link invito, album ufficiale e modelli QR.") },
    { id: "media", href: "gallery", title: text("Photos & official album", "Φωτογραφίες & official album", "Photos et album officiel", "Fotos & offizielles Album", "Fotos y álbum oficial", "Foto e album ufficiale"), description: text("Guest moments, cover photo and professional curation.", "Guest moments, cover photo και επαγγελματική επιλογή.", "Photos invités, couverture et sélection professionnelle.", "Gastfotos, Cover und professionelle Auswahl.", "Fotos de invitados, portada y selección profesional.", "Foto ospiti, copertina e selezione professionale.") },
    { id: "people", href: "people", title: text("Wedding team & roles", "Ομάδα γάμου & ρόλοι", "Équipe et rôles", "Hochzeitsteam & Rollen", "Equipo y roles", "Team e ruoli"), description: text("Partner, planners, family and official photographer.", "Σύντροφος, planners, οικογένεια και official photographer.", "Partenaire, organisateurs, famille et photographe.", "Partner, Planer, Familie und Fotograf.", "Pareja, organizadores, familia y fotógrafo.", "Partner, planner, famiglia e fotografo.") },
  ],
};

export const eventTemplates = [weddingTemplate, genericTemplate] as const;

export function eventTemplateFor(type: unknown): EventTemplate {
  const normalized = normalizeEventType(type);
  return eventTemplates.find((template) => template.appliesTo !== "fallback" && template.appliesTo.includes(normalized)) ?? genericTemplate;
}

export function eventTemplateText(value: LocalizedText, locale: Locale): string {
  return value[locale];
}
