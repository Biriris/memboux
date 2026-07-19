import type { Locale } from "./i18n";

type LocalizedText = Record<Locale, string>;

const text = (en: string, el: string, fr: string, de: string, es: string, it: string): LocalizedText => ({ en, el, fr, de, es, it });

export const WEDDING_CATALOG_VERSION = "wedding-2026-v1";
export const WEDDING_BASE_PRICE_MINOR = 3900;

export const weddingFeatureCatalog = [
  { key: "rsvp", priceMinor: 1000, available: true, title: text("Guest RSVP", "RSVP καλεσμένων", "RSVP invités", "Gäste-RSVP", "RSVP de invitados", "RSVP ospiti"), description: text("Attendance, guest count and dietary notes.", "Παρουσία, αριθμός ατόμων και διατροφικές σημειώσεις.", "Présence, nombre d’invités et préférences alimentaires.", "Teilnahme, Personenzahl und Essenshinweise.", "Asistencia, número de invitados y notas alimentarias.", "Presenza, numero ospiti e note alimentari.") },
  { key: "guestbook", priceMinor: 800, available: true, title: text("Guestbook & comments", "Ευχολόγιο & σχόλια", "Livre d’or et commentaires", "Gästebuch & Kommentare", "Libro de visitas y comentarios", "Guestbook e commenti"), description: text("Collect wishes and conversations around each moment.", "Συλλογή ευχών και συζητήσεων γύρω από κάθε στιγμή.", "Recueillez les vœux et les commentaires.", "Wünsche und Kommentare sammeln.", "Recopila deseos y comentarios.", "Raccogli auguri e commenti.") },
  { key: "live_slideshow", priceMinor: 800, available: true, title: text("Live slideshow", "Live slideshow", "Diaporama en direct", "Live-Diashow", "Presentación en vivo", "Slideshow live"), description: text("A live screen that refreshes as guests upload photos.", "Ζωντανή προβολή που ανανεώνεται με τα uploads των καλεσμένων.", "Un écran qui se met à jour avec les nouvelles photos.", "Eine Live-Anzeige für neue Gästefotos.", "Una pantalla que se actualiza con las nuevas fotos.", "Uno schermo che si aggiorna con le nuove foto.") },
  { key: "qr_print_kit", priceMinor: 500, available: true, title: text("Printable QR kit", "Εκτυπώσιμο QR kit", "Kit QR imprimable", "Druckbares QR-Kit", "Kit QR imprimible", "Kit QR stampabile"), description: text("Ready layouts for tables, entrance and thank-you cards.", "Έτοιμα layouts για τραπέζια, είσοδο και ευχαριστήριες κάρτες.", "Modèles pour tables, entrée et cartes de remerciement.", "Vorlagen für Tische, Eingang und Dankeskarten.", "Diseños para mesas, entrada y tarjetas de agradecimiento.", "Layout per tavoli, ingresso e biglietti di ringraziamento.") },
  { key: "calendar_links", priceMinor: 500, available: false, title: text("Add to calendar", "Προσθήκη στο calendar", "Ajouter au calendrier", "Zum Kalender hinzufügen", "Añadir al calendario", "Aggiungi al calendario"), description: text("Calendar links for ceremony and reception.", "Calendar links για τελετή και δεξίωση.", "Liens calendrier pour cérémonie et réception.", "Kalenderlinks für Zeremonie und Feier.", "Enlaces de calendario para ceremonia y recepción.", "Link calendario per cerimonia e ricevimento.") },
  { key: "travel_guide", priceMinor: 1000, available: false, title: text("Travel & stay guide", "Οδηγός διαμονής & μετακίνησης", "Guide voyage et séjour", "Reise- & Unterkunftsführer", "Guía de viaje y alojamiento", "Guida viaggio e soggiorno"), description: text("Hotels, transport, parking and local suggestions.", "Ξενοδοχεία, μετακινήσεις, parking και τοπικές προτάσεις.", "Hôtels, transport, parking et suggestions locales.", "Hotels, Transport, Parken und lokale Tipps.", "Hoteles, transporte, aparcamiento y recomendaciones.", "Hotel, trasporti, parcheggio e consigli locali.") },
  { key: "gift_registry", priceMinor: 500, available: false, title: text("Gift information", "Πληροφορίες δώρων", "Informations cadeaux", "Geschenkinformationen", "Información de regalos", "Informazioni regali"), description: text("A respectful message and an optional registry link.", "Διακριτικό μήνυμα και προαιρετικό registry link.", "Un message discret et un lien facultatif.", "Eine dezente Nachricht und ein optionaler Link.", "Un mensaje discreto y un enlace opcional.", "Un messaggio discreto e un link facoltativo.") },
  { key: "bilingual_invitation", priceMinor: 1500, available: false, title: text("Bilingual invitation", "Δίγλωσσο προσκλητήριο", "Invitation bilingue", "Zweisprachige Einladung", "Invitación bilingüe", "Invito bilingue"), description: text("Independent wedding content in a second language.", "Ανεξάρτητο wedding περιεχόμενο σε δεύτερη γλώσσα.", "Contenu du mariage dans une deuxième langue.", "Hochzeitsinhalte in einer zweiten Sprache.", "Contenido de boda en un segundo idioma.", "Contenuto matrimonio in una seconda lingua.") },
  { key: "guest_quiz", priceMinor: 1200, available: false, title: text("Guest quiz", "Quiz καλεσμένων", "Quiz invités", "Gästequiz", "Quiz de invitados", "Quiz ospiti"), description: text("Custom questions with results for the couple.", "Προσωπικές ερωτήσεις και αποτελέσματα για το ζευγάρι.", "Questions personnalisées et résultats.", "Eigene Fragen und Ergebnisse.", "Preguntas personalizadas y resultados.", "Domande personalizzate e risultati.") },
  { key: "printable_invitation", priceMinor: 1500, available: false, title: text("Printable invitation PDF", "Εκτυπώσιμο προσκλητήριο PDF", "Invitation PDF imprimable", "Druckbare PDF-Einladung", "Invitación PDF imprimible", "Invito PDF stampabile"), description: text("A print-ready companion to the digital experience.", "Εκτυπώσιμη έκδοση που συνοδεύει την ψηφιακή εμπειρία.", "Une version prête à imprimer.", "Eine druckfertige Ergänzung.", "Una versión lista para imprimir.", "Una versione pronta per la stampa.") },
  { key: "email_summary", priceMinor: 800, available: false, title: text("Email activity summary", "Αναφορά δραστηριότητας email", "Résumé d’activité par e-mail", "E-Mail-Aktivitätsbericht", "Resumen de actividad por email", "Riepilogo attività email"), description: text("Scheduled summaries for RSVPs, wishes and uploads.", "Περιοδικές αναφορές για RSVP, ευχές και uploads.", "Rapports périodiques RSVP, vœux et photos.", "Regelmäßige Berichte zu RSVP, Wünschen und Uploads.", "Informes periódicos de RSVP, deseos y fotos.", "Report periodici su RSVP, auguri e upload.") },
  { key: "sms_table_updates", priceMinor: 0, available: false, title: text("SMS table updates", "SMS ενημέρωση τραπεζιού", "SMS de placement", "SMS-Tischinformationen", "SMS de asignación de mesa", "SMS assegnazione tavolo"), description: text("Usage-based messaging after an SMS provider is connected.", "Χρέωση βάσει χρήσης όταν συνδεθεί SMS provider.", "Messagerie à l’usage après connexion d’un fournisseur SMS.", "Nutzungsabhängig nach Anbindung eines SMS-Anbieters.", "Mensajería por uso tras conectar un proveedor SMS.", "Messaggi a consumo dopo il collegamento di un provider SMS.") },
  { key: "prewedding_embed", priceMinor: 1000, available: false, title: text("Pre-wedding film embed", "Ενσωμάτωση pre-wedding film", "Film pré-mariage intégré", "Pre-Wedding-Film", "Vídeo preboda integrado", "Film pre-wedding integrato"), description: text("Embed a film hosted by a compatible external provider.", "Ενσωμάτωση film από συμβατό εξωτερικό provider.", "Intégration d’un film hébergé par un fournisseur compatible.", "Einbettung eines extern gehosteten Films.", "Integración de un vídeo alojado externamente.", "Integrazione di un film ospitato esternamente.") },
] as const;

export type WeddingFeatureKey = typeof weddingFeatureCatalog[number]["key"];

export function weddingCatalogText(value: LocalizedText, locale: Locale) {
  return value[locale];
}

export function isWeddingFeatureKey(value: unknown): value is WeddingFeatureKey {
  return typeof value === "string" && weddingFeatureCatalog.some((feature) => feature.key === value);
}

export function defaultWeddingFeatures(): WeddingFeatureKey[] {
  return weddingFeatureCatalog.filter((feature) => feature.available).map((feature) => feature.key);
}

export function calculateWeddingEstimate(values: readonly unknown[]) {
  const selected = new Set(values.filter(isWeddingFeatureKey));
  const features = weddingFeatureCatalog.filter((feature) => feature.available && selected.has(feature.key));
  return {
    catalogVersion: WEDDING_CATALOG_VERSION,
    currency: "EUR" as const,
    basePriceMinor: WEDDING_BASE_PRICE_MINOR,
    featurePriceMinor: features.reduce((total, feature) => total + feature.priceMinor, 0),
    totalMinor: WEDDING_BASE_PRICE_MINOR + features.reduce((total, feature) => total + feature.priceMinor, 0),
    selected: features.map((feature) => feature.key),
  };
}

export function formatWeddingPrice(minor: number, locale: Locale) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(minor / 100);
}
