import type { EventType } from "../event-types";
import type { Locale } from "../i18n";
import { esc } from "../utils";

export type DemoMediaAsset = {
  src: string;
  mobileSrc: string;
  alt: string;
};

const generated = (name: string) => ({
  src: `/demo-media/${name}-1440.webp`,
  mobileSrc: `/demo-media/${name}-720.webp`,
});

const marketing = (name: string, desktopWidth = 1280) => ({
  src: `/marketing/${name}-${desktopWidth}.webp`,
  mobileSrc: `/marketing/${name}-720.webp`,
});

const assetSets = {
  birthday: [generated("birthday-hero"), generated("birthday-cake"), generated("birthday-dance")],
  wedding: [marketing("hero-moments", 1600), generated("wedding-exit"), generated("wedding-dance")],
  family: [generated("family-hero"), marketing("birthday-moments"), generated("birthday-cake")],
  travel: [marketing("trip-moments"), generated("community-hero"), generated("birthday-hero")],
  professional: [generated("corporate-hero"), generated("graduation-hero"), generated("community-hero")],
  community: [generated("community-hero"), generated("birthday-dance"), generated("corporate-hero")],
  remembrance: [generated("memorial-hero"), marketing("birthday-moments"), generated("family-hero")],
} as const;

const setForType: Record<EventType, keyof typeof assetSets> = {
  wedding: "wedding",
  engagement: "wedding",
  bachelor: "birthday",
  birthday: "birthday",
  party: "birthday",
  baptism: "family",
  baby: "family",
  graduation: "professional",
  corporate: "professional",
  trip: "travel",
  reunion: "remembrance",
  community: "community",
  memorial: "remembrance",
  other: "travel",
};

const descriptions: Record<Locale, Record<keyof typeof assetSets, readonly [string, string, string]>> = {
  el: {
    birthday: ["Η Μάγια γιορτάζει με τους φίλους της σε μια φωτισμένη ταράτσα", "Η Μάγια σβήνει τα κεράκια της ενώ οι φίλοι της φωτογραφίζουν τη στιγμή", "Η παρέα χορεύει και καταγράφει τη βραδιά από διαφορετικές οπτικές"],
    wedding: ["Καλεσμένοι μοιράζονται μια αυθόρμητη στιγμή σε γαμήλια δεξίωση", "Το ζευγάρι βγαίνει χαμογελαστό από την τελετή ανάμεσα στους φίλους του", "Το ζευγάρι χορεύει ανάμεσα στους καλεσμένους του"],
    family: ["Τρεις γενιές μιας οικογένειας γιορτάζουν μαζί", "Οικογένεια και φίλοι φωτογραφίζουν μια ξεχωριστή στιγμή", "Οι καλεσμένοι καταγράφουν μια οικογενειακή γιορτή"],
    travel: ["Παρέα μοιράζεται φωτογραφίες από τις διακοπές της στο Αιγαίο", "Μία κοινότητα γιορτάζει σε υπαίθριο φεστιβάλ", "Φίλοι κρατούν τις στιγμές ενός καλοκαιρινού ταξιδιού"],
    professional: ["Συμμετέχοντες συζητούν σε ένα σύγχρονο επαγγελματικό event", "Νέοι απόφοιτοι φωτογραφίζονται μετά την τελετή", "Η κοινότητα ενός event καταγράφει τις σημαντικές στιγμές"],
    community: ["Κοινό και φίλοι χορεύουν σε ένα υπαίθριο μουσικό event", "Μία παρέα καταγράφει τη γιορτή από διαφορετικές οπτικές", "Συμμετέχοντες συναντιούνται σε ένα σύγχρονο event"],
    remembrance: ["Μία οικογένεια μοιράζεται ιστορίες μέσα από παλιές φωτογραφίες", "Τρεις γενιές δημιουργούν μία νέα κοινή ανάμνηση", "Η οικογένεια συγκεντρώνεται γύρω από τις φωτογραφίες της"],
  },
  en: {
    birthday: ["Maya celebrates with friends on a warmly lit rooftop", "Maya blows out her candles while friends photograph the moment", "Friends dance and capture the night from different perspectives"],
    wedding: ["Guests share a candid moment at a wedding reception", "The newly married couple leaves the ceremony surrounded by friends", "The couple dances among their guests"],
    family: ["Three generations of a family celebrate together", "Family and friends photograph a meaningful moment", "Guests capture a warm family celebration"],
    travel: ["Friends share holiday photos on an Aegean beach", "A community celebrates at an open-air festival", "Friends preserve the moments of a summer trip"],
    professional: ["Attendees connect at a contemporary professional event", "Young graduates take photos after their ceremony", "An event community captures its defining moments"],
    community: ["A crowd of friends dances at an open-air music event", "Friends capture a celebration from different perspectives", "Attendees meet at a contemporary event"],
    remembrance: ["A family shares stories through old photographs", "Three generations create a new shared memory", "A family gathers around its photographs"],
  },
  fr: {} as Record<keyof typeof assetSets, readonly [string, string, string]>,
  de: {} as Record<keyof typeof assetSets, readonly [string, string, string]>,
  es: {} as Record<keyof typeof assetSets, readonly [string, string, string]>,
  it: {} as Record<keyof typeof assetSets, readonly [string, string, string]>,
};

export function demoMediaFor(type: EventType, locale: Locale): readonly DemoMediaAsset[] {
  const set = setForType[type];
  const descriptionsForLocale = descriptions[locale][set] ?? descriptions.en[set];
  return assetSets[set].map((asset, index) => ({ ...asset, alt: descriptionsForLocale[index] }));
}

export function demoPicture(asset: DemoMediaAsset, attributes: string) {
  return `<picture><source media="(max-width:720px)" srcset="${esc(asset.mobileSrc)}"><img src="${esc(asset.src)}" alt="${esc(asset.alt)}" ${attributes}></picture>`;
}
