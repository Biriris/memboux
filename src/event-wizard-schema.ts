import type { EventType } from "./event-types";
import type { Locale } from "./i18n";

export type EventWizardField = {
  key: string;
  step: 1 | 2 | 4;
  label: Record<Locale, string>;
  placeholder: Record<Locale, string>;
  max: number;
};

const l = (en: string, el: string, fr: string, de: string, es: string, it: string): Record<Locale, string> =>
  ({ en, el, fr, de, es, it });
const f = (key: string, step: 1 | 2 | 4, label: Record<Locale, string>, placeholder = label, max = 160): EventWizardField =>
  ({ key, step, label, placeholder, max });

export const eventWizardFields: Record<Exclude<EventType, "wedding">, EventWizardField[]> = {
  engagement: [
    f("coupleNames", 1, l("Couple's names", "Ονόματα ζευγαριού", "Prénoms du couple", "Namen des Paares", "Nombres de la pareja", "Nomi della coppia")),
    f("proposalStory", 1, l("The proposal in one line", "Η πρόταση σε μία φράση", "La demande en une phrase", "Der Antrag in einem Satz", "La propuesta en una frase", "La proposta in una frase"), undefined, 240),
    f("countdownMoment", 2, l("Moment everyone should know", "Στιγμή που πρέπει να γνωρίζουν όλοι", "Moment à ne pas manquer", "Moment, den niemand verpassen darf", "Momento que nadie debe perderse", "Momento da non perdere"), undefined, 240),
  ],
  bachelor: [
    f("guestOfHonor", 1, l("Guest of honor", "Τιμώμενο πρόσωπο", "Personne à l'honneur", "Ehrengast", "Persona homenajeada", "Persona festeggiata")),
    f("crewName", 1, l("Crew name", "Όνομα παρέας", "Nom de la bande", "Name der Crew", "Nombre del grupo", "Nome della crew")),
    f("secretPlan", 2, l("Secret plan or surprise", "Μυστικό πλάνο ή έκπληξη", "Plan secret ou surprise", "Geheimer Plan oder Überraschung", "Plan secreto o sorpresa", "Piano segreto o sorpresa"), undefined, 400),
  ],
  birthday: [
    f("celebrantName", 1, l("Who are we celebrating?", "Ποιον γιορτάζουμε;", "Qui fête-t-on ?", "Wen feiern wir?", "¿A quién celebramos?", "Chi festeggiamo?")),
    f("milestone", 1, l("Age or milestone", "Ηλικία ή ορόσημο", "Âge ou étape", "Alter oder Meilenstein", "Edad o momento especial", "Età o traguardo")),
    f("wishPrompt", 4, l("Prompt for guest wishes", "Προτροπή για τις ευχές", "Question pour les vœux", "Impuls für Gästewünsche", "Pregunta para los deseos", "Spunto per gli auguri"), undefined, 240),
  ],
  party: [
    f("partyName", 1, l("Party name", "Όνομα πάρτι", "Nom de la fête", "Name der Party", "Nombre de la fiesta", "Nome della festa")),
    f("musicMood", 2, l("Music mood", "Μουσικό ύφος", "Ambiance musicale", "Musikstimmung", "Ambiente musical", "Atmosfera musicale")),
    f("dressCode", 4, l("Dress code", "Ενδυματολογικός κώδικας", "Code vestimentaire", "Dresscode", "Código de vestimenta", "Dress code")),
  ],
  baptism: [
    f("childName", 1, l("Child's name", "Όνομα παιδιού", "Prénom de l'enfant", "Name des Kindes", "Nombre del niño o niña", "Nome del bambino")),
    f("godparents", 1, l("Godparent names", "Ονόματα νονού ή νονάς", "Parrain et marraine", "Namen der Paten", "Nombres de los padrinos", "Nomi dei padrini")),
    f("ceremonyTradition", 2, l("Ceremony note or tradition", "Σημείωση ή παράδοση τελετής", "Note ou tradition de cérémonie", "Hinweis oder Tradition zur Zeremonie", "Nota o tradición de la ceremonia", "Nota o tradizione della cerimonia"), undefined, 300),
  ],
  baby: [
    f("familyNames", 1, l("Baby or parents' names", "Όνομα μωρού ή γονέων", "Prénom du bébé ou des parents", "Name des Babys oder der Eltern", "Nombre del bebé o de los padres", "Nome del bebè o dei genitori")),
    f("familyMilestone", 1, l("Family milestone", "Οικογενειακό ορόσημο", "Étape familiale", "Familienmeilenstein", "Momento familiar", "Traguardo familiare")),
    f("predictionPrompt", 4, l("Prompt for wishes or predictions", "Προτροπή για ευχές ή προβλέψεις", "Question pour vœux ou prédictions", "Impuls für Wünsche oder Vorhersagen", "Pregunta para deseos o predicciones", "Spunto per auguri o previsioni"), undefined, 240),
  ],
  graduation: [
    f("graduateName", 1, l("Graduate or class", "Απόφοιτος ή τάξη", "Diplômé ou promotion", "Absolvent oder Jahrgang", "Graduado o promoción", "Laureato o classe")),
    f("institution", 1, l("School or institution", "Σχολή ή εκπαιδευτικό ίδρυμα", "École ou établissement", "Schule oder Institution", "Escuela o institución", "Scuola o istituto")),
    f("classYear", 2, l("Class year or qualification", "Έτος ή τίτλος σπουδών", "Année ou diplôme", "Jahrgang oder Abschluss", "Promoción o título", "Anno o titolo di studio")),
  ],
  corporate: [
    f("companyName", 1, l("Company or organization", "Εταιρεία ή οργανισμός", "Entreprise ou organisation", "Unternehmen oder Organisation", "Empresa u organización", "Azienda o organizzazione")),
    f("eventObjective", 1, l("Event objective", "Στόχος εκδήλωσης", "Objectif de l'événement", "Ziel der Veranstaltung", "Objetivo del evento", "Obiettivo dell'evento"), undefined, 240),
    f("keySpeakers", 2, l("Key speakers or sessions", "Κύριοι ομιλητές ή ενότητες", "Intervenants ou sessions clés", "Wichtige Speaker oder Sessions", "Ponentes o sesiones principales", "Relatori o sessioni principali"), undefined, 400),
  ],
  trip: [
    f("destination", 1, l("Destination", "Προορισμός", "Destination", "Reiseziel", "Destino", "Destinazione")),
    f("travelGroup", 1, l("Travel group", "Ταξιδιωτική παρέα", "Groupe de voyage", "Reisegruppe", "Grupo de viaje", "Gruppo di viaggio")),
    f("mustSeeStops", 2, l("Must-see stops", "Στάσεις που δεν χάνονται", "Étapes incontournables", "Unverzichtbare Stopps", "Paradas imprescindibles", "Tappe imperdibili"), undefined, 400),
  ],
  reunion: [
    f("groupName", 1, l("Family, class or group", "Οικογένεια, τάξη ή παρέα", "Famille, classe ou groupe", "Familie, Klasse oder Gruppe", "Familia, clase o grupo", "Famiglia, classe o gruppo")),
    f("reunionYear", 1, l("Reunion year or anniversary", "Χρονιά ή επέτειος επανένωσης", "Année ou anniversaire", "Jahr oder Jubiläum", "Año o aniversario", "Anno o anniversario")),
    f("memoryPrompt", 4, l("Then-and-now memory prompt", "Προτροπή για αναμνήσεις τότε και τώρα", "Question souvenirs d'hier et d'aujourd'hui", "Impuls für Damals-und-heute-Erinnerungen", "Pregunta sobre recuerdos de antes y ahora", "Spunto per ricordi di ieri e oggi"), undefined, 240),
  ],
  community: [
    f("organizer", 1, l("Organizer", "Διοργανωτής", "Organisateur", "Veranstalter", "Organizador", "Organizzatore")),
    f("stagesZones", 2, l("Stages, zones or venues", "Σκηνές, ζώνες ή χώροι", "Scènes, zones ou lieux", "Bühnen, Bereiche oder Orte", "Escenarios, zonas o espacios", "Palchi, aree o luoghi"), undefined, 400),
    f("moderationNote", 4, l("Community upload guidance", "Οδηγίες αναρτήσεων κοινότητας", "Consignes de contribution", "Hinweise für Community-Uploads", "Normas para las aportaciones", "Indicazioni per i contributi"), undefined, 400),
  ],
  memorial: [
    f("personRemembered", 1, l("Person remembered", "Πρόσωπο που τιμούμε", "Personne honorée", "Person, der wir gedenken", "Persona a quien recordamos", "Persona che ricordiamo")),
    f("lifeDates", 1, l("Life dates", "Χρονολογίες ζωής", "Dates de vie", "Lebensdaten", "Fechas de vida", "Date della vita")),
    f("memoryInvitation", 4, l("Invitation to share a memory", "Πρόσκληση για μοίρασμα ανάμνησης", "Invitation à partager un souvenir", "Einladung, eine Erinnerung zu teilen", "Invitación a compartir un recuerdo", "Invito a condividere un ricordo"), undefined, 300),
  ],
  other: [
    f("eventPurpose", 1, l("What is the occasion?", "Ποια είναι η περίσταση;", "Quelle est l'occasion ?", "Was ist der Anlass?", "¿Cuál es la ocasión?", "Qual è l'occasione?")),
    f("mainHighlight", 2, l("Main highlight", "Κεντρική στιγμή", "Moment principal", "Höhepunkt", "Momento principal", "Momento principale"), undefined, 300),
    f("contributionPrompt", 4, l("What should guests contribute?", "Τι θέλεις να μοιραστούν οι καλεσμένοι;", "Que doivent partager les invités ?", "Was sollen Gäste beitragen?", "¿Qué deberían compartir los invitados?", "Cosa dovrebbero condividere gli invitati?"), undefined, 300),
  ],
};

export function wizardFieldsFor(type: EventType, step?: number): EventWizardField[] {
  if (type === "wedding") return [];
  return step ? eventWizardFields[type].filter((field) => field.step === step) : eventWizardFields[type];
}

export function parseCustomFields(value: string | null | undefined): Record<string, string> {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function mergeWizardFields(type: EventType, step: number, body: Record<string, unknown>, current: string | null | undefined) {
  const values = parseCustomFields(current);
  for (const field of wizardFieldsFor(type, step)) values[field.key] = String(body[field.key] ?? "").trim().slice(0, field.max);
  return JSON.stringify(values);
}
