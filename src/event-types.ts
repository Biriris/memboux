import type { Locale } from "./i18n";

export const eventTypes = [
  "wedding",
  "engagement",
  "birthday",
  "party",
  "baptism",
  "baby",
  "graduation",
  "corporate",
  "trip",
  "reunion",
  "community",
  "memorial",
  "other",
] as const;

export type EventType = typeof eventTypes[number];

const labels: Record<Locale, Record<EventType, string>> = {
  en: {
    wedding: "Wedding",
    engagement: "Engagement & pre-wedding",
    birthday: "Birthday",
    party: "Party & celebration",
    baptism: "Baptism / christening",
    baby: "Baby shower & family milestone",
    graduation: "Graduation & school",
    corporate: "Corporate & business",
    trip: "Trip & vacation",
    reunion: "Reunion & gathering",
    community: "Festival, concert & community",
    memorial: "Memorial / celebration of life",
    other: "Other",
  },
  el: {
    wedding: "Γάμος",
    engagement: "Αρραβώνας & pre-wedding",
    birthday: "Γενέθλια",
    party: "Πάρτι & γιορτή",
    baptism: "Βάπτιση",
    baby: "Baby shower & οικογενειακό ορόσημο",
    graduation: "Αποφοίτηση & σχολική εκδήλωση",
    corporate: "Εταιρικό & επαγγελματικό",
    trip: "Ταξίδι & διακοπές",
    reunion: "Reunion & συνάντηση",
    community: "Φεστιβάλ, συναυλία & κοινότητα",
    memorial: "Μνημόσυνο / γιορτή ζωής",
    other: "Άλλο",
  },
  fr: {
    wedding: "Mariage",
    engagement: "Fiançailles et avant-mariage",
    birthday: "Anniversaire",
    party: "Fête et célébration",
    baptism: "Baptême",
    baby: "Baby shower et étape familiale",
    graduation: "Remise de diplôme et école",
    corporate: "Entreprise et professionnel",
    trip: "Voyage et vacances",
    reunion: "Réunion et rassemblement",
    community: "Festival, concert et communauté",
    memorial: "Commémoration / célébration de vie",
    other: "Autre",
  },
  de: {
    wedding: "Hochzeit",
    engagement: "Verlobung & Vorhochzeit",
    birthday: "Geburtstag",
    party: "Party & Feier",
    baptism: "Taufe",
    baby: "Babyparty & Familienmeilenstein",
    graduation: "Abschluss & Schule",
    corporate: "Firmen- & Business-Event",
    trip: "Reise & Urlaub",
    reunion: "Wiedersehen & Treffen",
    community: "Festival, Konzert & Community",
    memorial: "Gedenkfeier / Celebration of Life",
    other: "Sonstiges",
  },
  es: {
    wedding: "Boda",
    engagement: "Compromiso y preboda",
    birthday: "Cumpleaños",
    party: "Fiesta y celebración",
    baptism: "Bautizo",
    baby: "Baby shower y ocasión familiar",
    graduation: "Graduación y evento escolar",
    corporate: "Corporativo y empresarial",
    trip: "Viaje y vacaciones",
    reunion: "Reencuentro y reunión",
    community: "Festival, concierto y comunidad",
    memorial: "Memorial / celebración de vida",
    other: "Otro",
  },
  it: {
    wedding: "Matrimonio",
    engagement: "Fidanzamento e pre-matrimonio",
    birthday: "Compleanno",
    party: "Festa e celebrazione",
    baptism: "Battesimo",
    baby: "Baby shower e ricorrenza familiare",
    graduation: "Laurea, diploma ed evento scolastico",
    corporate: "Aziendale e professionale",
    trip: "Viaggio e vacanza",
    reunion: "Riunione e ritrovo",
    community: "Festival, concerto e comunità",
    memorial: "Memoriale / celebrazione della vita",
    other: "Altro",
  },
};

const fieldLabels: Record<Locale, string> = {
  en: "Event type",
  el: "Είδος event",
  fr: "Type d’événement",
  de: "Event-Typ",
  es: "Tipo de evento",
  it: "Tipo di evento",
};

export function isEventType(value: unknown): value is EventType {
  return typeof value === "string" && (eventTypes as readonly string[]).includes(value);
}

export function normalizeEventType(value: unknown): EventType {
  return isEventType(value) ? value : "other";
}

export function eventTypeLabel(type: unknown, locale: Locale): string {
  return labels[locale][normalizeEventType(type)];
}

export function eventTypeFieldLabel(locale: Locale): string {
  return fieldLabels[locale];
}

export function eventTypeOptions(locale: Locale, selected: unknown): string {
  const current = normalizeEventType(selected);
  return eventTypes
    .map((type) => `<option value="${type}"${type === current ? " selected" : ""}>${labels[locale][type]}</option>`)
    .join("");
}
