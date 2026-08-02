import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { parse as parseMetadata } from "exifr";
import QRCode from "qrcode";
import { getEventRole, roleCan } from "../access";
import { UPLOAD_ACCEPT } from "../config";
import type { Bindings } from "../domain";
import { eventAccessAllows, eventMediaCapacity, getEventAccess, isTrialMediaLimitConstraint } from "../event-access";
import { eventSurfaceAccessToken, eventSurfaceCookieName, eventSurfacePinHash, hasEventSurfaceAccess, hasGalleryAccess, type EventSurface } from "../gallery-access";
import { localeNames, normalizeLocale, supportedLocales, type Locale } from "../i18n";
import { queueAutomaticCloudBackupsForEvent } from "../cloud-backups";
import { GUEST_UPLOAD_POLICY_VERSION } from "../privacy";
import { notifyEventMembersAboutUpload } from "../notifications";
import {
  existingMediaLikeVisitor,
  getGalleryMediaWithLikes,
  getOfficialMediaWithLikes,
  MEDIA_LIKE_COOKIE,
  MEDIA_LIKE_COOKIE_MAX_AGE,
  mediaLikeActorKey,
  mediaLikeVisitor,
  toggleMediaLike,
} from "../media-likes";
import { isCanonicalDuplicateConstraint, mediaCanonicalHash } from "../media-fingerprint";
import { getOrCreateMediaVariant, mediaVariantKey, parseMediaVariant } from "../media-variants";
import { releaseStorage, reserveStorageForEvent } from "../quotas";
import { consumeRateLimit, tooManyRequests } from "../rate-limit";
import { getEvent } from "../repositories";
import { currentUser } from "../session";
import {
  safeFileExtension,
  uploadValidationDetails,
  validateUploadFiles,
} from "../upload-policy";
import {
  bulkSelectionScript,
  cards,
  galleryFilterControls,
  galleryFilterScript,
  galleryProgressiveControls,
  galleryProgressiveScript,
  lightboxMarkup,
  mediaLikeButton,
  mediaLikesScript,
} from "../views/media";
import { shareIconButtons } from "../views/share";
import { brandMark, page } from "../views/shared";
import { uploadLimitsCopy } from "../views/upload";
import { mediaCommentsOverlay, renderGuestParticipation, type GuestbookPreview, type GuestParticipationSettings } from "../views/experience";
import {
  constantTimeEqual,
  esc,
  formatEventDates,
  sha256,
  sha256Bytes,
} from "../utils";

export const galleryRoutes = new Hono<{ Bindings: Bindings }>();

const galleryLanguageLabel: Record<Locale, string> = {
  en: "Language",
  el: "Γλώσσα",
  fr: "Langue",
  de: "Sprache",
  es: "Idioma",
  it: "Lingua",
};

function galleryLanguagePicker(code: string, locale: Locale, official = false) {
  const path = `/gallery/${encodeURIComponent(code)}${official ? "/official" : ""}`;
  const label = galleryLanguageLabel[locale];
  return `<label class="sr-only" for="gallery-language">${esc(label)}</label><select id="gallery-language" aria-label="${esc(label)}" class="cursor-pointer rounded-full border border-[#d9e3df] bg-white/90 px-3 py-2 text-xs font-bold text-[#443653] shadow-sm" onchange="location.href=this.value">${supportedLocales.map((value) => `<option value="${path}?lang=${value}" ${value === locale ? "selected" : ""}>${localeNames[value]}</option>`).join("")}</select>`;
}

type GalleryGuestCopy = {
  privateAlbum: string; promise: string; add: string; explore: string; uploads: string; addTitle: string;
  noAccount: string; name: string; privacy: string; privacyText: string; confirmation: string; upload: string;
  firstMoment: string; addPhotos: string; expired: string; unavailable: string; tooManyPin: string; incorrectPin: string;
  previewTitle: string; previewText: string; privateGallery: string; pinPrompt: string; openGallery: string;
  select: string; cancel: string; downloadSelected: string; shareKicker: string; inviteMore: string; noApp: string;
  qrLabel: string; scan: string; copyLink: string; copiedLink: string; officialCollection: string; officialAlbum: string;
  officialTeaser: string; viewCurated: (count: number) => string; viewCollection: string; guestMoments: string;
  galleryTitle: string; officialDescription: string; curatedBy: string; open: string; officialStory: string;
  curatedMoments: string; momentsCount: (count: number) => string; featuredFirst: string; collectionPreparing: string;
  collectionPreparingText: string;
};

const galleryGuestCopy: Record<Locale, GalleryGuestCopy> = {
  en: {
    privateAlbum: "Private event album", promise: "Share what you saw and lived. Everyone’s candid photos and videos come together in one private album.", add: "Add your moments", explore: "Explore gallery", uploads: "Guest uploads", addTitle: "Add your moments", noAccount: "No app and no account required. Select multiple photos or videos at once.", name: "Your name", privacy: "Privacy and confirmation", privacyText: "Your content will be stored in this event’s private gallery. You can request removal at any time.", confirmation: "I confirm that I am entitled to upload this content and that it does not unlawfully infringe the privacy or rights of others.", upload: "Upload to album", firstMoment: "The first moment is yours", addPhotos: "Add photos or videos",
    expired: "This event has expired.", unavailable: "This event is not available to guests.", tooManyPin: "Too many PIN attempts. Please try again later.", incorrectPin: "Incorrect PIN", previewTitle: "This event is not open yet", previewText: "The owner is preparing it in private preview. Ask them to start the trial period.", privateGallery: "Private gallery", pinPrompt: "Enter the event PIN to view the gallery and upload photos.", openGallery: "Open gallery", select: "Select", cancel: "Cancel", downloadSelected: "Download selected", shareKicker: "QR & Share", inviteMore: "Invite more guests", noApp: "No app", qrLabel: "Guest album QR code", scan: "Scan from another phone for instant access and uploads.", copyLink: "Copy link", copiedLink: "Link copied", officialCollection: "Official collection", officialAlbum: "The official album", officialTeaser: "A separate, curated story combining the professional collection with the finest selected moments.", viewCurated: (count) => `View ${count} curated moments`, viewCollection: "View collection", guestMoments: "Guest moments", galleryTitle: "Gallery", officialDescription: "A carefully curated story of the event, presented separately from the guests’ candid moments.", curatedBy: "Curated by", open: "Open", officialStory: "The official story", curatedMoments: "Curated moments", momentsCount: (count) => `${count} ${count === 1 ? "moment" : "moments"}`, featuredFirst: "The first curated moment is featured above.", collectionPreparing: "The official collection is being prepared", collectionPreparingText: "The professional’s selected media will appear here as soon as it is published.",
  },
  el: {
    privateAlbum: "Ιδιωτικό album εκδήλωσης", promise: "Μοιράσου όσα είδες και έζησες. Οι αυθόρμητες φωτογραφίες και τα βίντεο όλων συγκεντρώνονται σε ένα ιδιωτικό album.", add: "Πρόσθεσε στιγμές", explore: "Δες το album", uploads: "Uploads καλεσμένων", addTitle: "Πρόσθεσε τις στιγμές σου", noAccount: "Χωρίς εφαρμογή και χωρίς εγγραφή. Επίλεξε πολλές φωτογραφίες ή βίντεο μαζί.", name: "Το όνομά σου", privacy: "Απόρρητο και επιβεβαίωση", privacyText: "Το περιεχόμενο θα αποθηκευτεί στην ιδιωτική συλλογή αυτού του event. Μπορείς να ζητήσεις αφαίρεση οποιαδήποτε στιγμή.", confirmation: "Επιβεβαιώνω ότι έχω δικαίωμα να ανεβάσω αυτό το περιεχόμενο και ότι δεν παραβιάζει παράνομα την ιδιωτικότητα ή τα δικαιώματα άλλων.", upload: "Ανέβασμα στο album", firstMoment: "Η πρώτη στιγμή περιμένει εσένα", addPhotos: "Πρόσθεσε φωτογραφίες ή βίντεο",
    expired: "Το event έχει λήξει.", unavailable: "Το event δεν είναι διαθέσιμο στους καλεσμένους.", tooManyPin: "Πολλές προσπάθειες PIN. Δοκίμασε ξανά αργότερα.", incorrectPin: "Λάθος PIN", previewTitle: "Το event δεν έχει ανοίξει ακόμη", previewText: "Ο δημιουργός το προετοιμάζει σε ιδιωτική προεπισκόπηση. Ζήτησέ του να ξεκινήσει τη δοκιμαστική περίοδο.", privateGallery: "Ιδιωτική συλλογή", pinPrompt: "Βάλε το PIN του event για να δεις τη συλλογή και να ανεβάσεις φωτογραφίες.", openGallery: "Άνοιγμα συλλογής", select: "Επιλογή", cancel: "Ακύρωση", downloadSelected: "Λήψη επιλεγμένων", shareKicker: "QR & κοινοποίηση", inviteMore: "Κάλεσε και άλλους", noApp: "Χωρίς εφαρμογή", qrLabel: "QR code του κοινού album", scan: "Σκάναρε από άλλο κινητό για άμεση πρόσβαση και uploads.", copyLink: "Αντιγραφή link", copiedLink: "Το link αντιγράφηκε", officialCollection: "Επίσημη συλλογή", officialAlbum: "Το επίσημο album", officialTeaser: "Μια ξεχωριστή, επιμελημένη αφήγηση με το υλικό του επαγγελματία και τις καλύτερες επιλεγμένες στιγμές.", viewCurated: (count) => `Προβολή ${count} επιλεγμένων στιγμών`, viewCollection: "Προβολή συλλογής", guestMoments: "Στιγμές καλεσμένων", galleryTitle: "Κοινή συλλογή", officialDescription: "Μια προσεκτικά επιμελημένη αφήγηση του event, ξεχωριστή από τις αυθόρμητες στιγμές των καλεσμένων.", curatedBy: "Επιμέλεια", open: "Άνοιγμα", officialStory: "Η επίσημη ιστορία", curatedMoments: "Επιλεγμένες στιγμές", momentsCount: (count) => `${count} ${count === 1 ? "στιγμή" : "στιγμές"}`, featuredFirst: "Η πρώτη επιλεγμένη στιγμή εμφανίζεται επάνω.", collectionPreparing: "Η επίσημη συλλογή ετοιμάζεται", collectionPreparingText: "Το επιλεγμένο υλικό του επαγγελματία θα εμφανιστεί εδώ μόλις δημοσιευτεί.",
  },
  fr: {
    privateAlbum: "Album privé de l’événement", promise: "Partagez ce que vous avez vu et vécu. Les photos et vidéos spontanées de tous se retrouvent dans un album privé.", add: "Ajouter vos moments", explore: "Découvrir l’album", uploads: "Ajouts des invités", addTitle: "Ajoutez vos moments", noAccount: "Sans application ni compte. Sélectionnez plusieurs photos ou vidéos à la fois.", name: "Votre nom", privacy: "Confidentialité et confirmation", privacyText: "Votre contenu sera conservé dans l’album privé de cet événement. Vous pourrez demander son retrait à tout moment.", confirmation: "Je confirme avoir le droit d’ajouter ce contenu et qu’il ne porte pas illégalement atteinte à la vie privée ou aux droits d’autrui.", upload: "Ajouter à l’album", firstMoment: "Le premier moment est le vôtre", addPhotos: "Ajouter des photos ou vidéos",
    expired: "Cet événement a expiré.", unavailable: "Cet événement n’est pas accessible aux invités.", tooManyPin: "Trop de tentatives de code PIN. Réessayez plus tard.", incorrectPin: "Code PIN incorrect", previewTitle: "Cet événement n’est pas encore ouvert", previewText: "L’organisateur le prépare en aperçu privé. Demandez-lui d’activer la période d’essai.", privateGallery: "Album privé", pinPrompt: "Saisissez le code PIN de l’événement pour consulter l’album et ajouter des photos.", openGallery: "Ouvrir l’album", select: "Sélectionner", cancel: "Annuler", downloadSelected: "Télécharger la sélection", shareKicker: "QR & partage", inviteMore: "Inviter d’autres personnes", noApp: "Sans application", qrLabel: "Code QR de l’album partagé", scan: "Scannez avec un autre téléphone pour accéder immédiatement à l’album et ajouter des fichiers.", copyLink: "Copier le lien", copiedLink: "Lien copié", officialCollection: "Collection officielle", officialAlbum: "L’album officiel", officialTeaser: "Un récit soigneusement composé à partir des images du professionnel et des plus beaux moments sélectionnés.", viewCurated: (count) => `Voir ${count} moments sélectionnés`, viewCollection: "Voir la collection", guestMoments: "Moments des invités", galleryTitle: "Galerie", officialDescription: "Un récit soigneusement composé de l’événement, présenté séparément des instants spontanés des invités.", curatedBy: "Sélection par", open: "Ouvrir", officialStory: "L’histoire officielle", curatedMoments: "Moments sélectionnés", momentsCount: (count) => `${count} ${count === 1 ? "moment" : "moments"}`, featuredFirst: "Le premier moment sélectionné est mis en avant ci-dessus.", collectionPreparing: "La collection officielle est en préparation", collectionPreparingText: "Les images sélectionnées par le professionnel apparaîtront ici dès leur publication.",
  },
  de: {
    privateAlbum: "Privates Eventalbum", promise: "Teile, was du gesehen und erlebt hast. Die spontanen Fotos und Videos aller Gäste kommen in einem privaten Album zusammen.", add: "Momente hinzufügen", explore: "Album entdecken", uploads: "Gast-Uploads", addTitle: "Füge deine Momente hinzu", noAccount: "Keine App und kein Konto nötig. Wähle mehrere Fotos oder Videos gleichzeitig aus.", name: "Dein Name", privacy: "Datenschutz und Bestätigung", privacyText: "Deine Inhalte werden im privaten Album dieses Events gespeichert. Du kannst jederzeit ihre Entfernung beantragen.", confirmation: "Ich bestätige, dass ich diese Inhalte hochladen darf und damit nicht rechtswidrig die Privatsphäre oder Rechte anderer verletze.", upload: "Ins Album hochladen", firstMoment: "Der erste Moment gehört dir", addPhotos: "Fotos oder Videos hinzufügen",
    expired: "Dieses Event ist abgelaufen.", unavailable: "Dieses Event ist für Gäste nicht verfügbar.", tooManyPin: "Zu viele PIN-Versuche. Bitte versuche es später erneut.", incorrectPin: "Falsche PIN", previewTitle: "Dieses Event ist noch nicht geöffnet", previewText: "Der Gastgeber bereitet es in einer privaten Vorschau vor. Bitte ihn, den Testzeitraum zu starten.", privateGallery: "Privates Album", pinPrompt: "Gib die Event-PIN ein, um das Album anzusehen und Fotos hochzuladen.", openGallery: "Album öffnen", select: "Auswählen", cancel: "Abbrechen", downloadSelected: "Auswahl herunterladen", shareKicker: "QR & Teilen", inviteMore: "Weitere Gäste einladen", noApp: "Ohne App", qrLabel: "QR-Code des gemeinsamen Albums", scan: "Mit einem anderen Smartphone scannen und sofort auf das Album und die Uploads zugreifen.", copyLink: "Link kopieren", copiedLink: "Link kopiert", officialCollection: "Offizielle Sammlung", officialAlbum: "Das offizielle Album", officialTeaser: "Eine eigene, kuratierte Geschichte mit den Aufnahmen des Profis und den schönsten ausgewählten Momenten.", viewCurated: (count) => `${count} ausgewählte Momente ansehen`, viewCollection: "Sammlung ansehen", guestMoments: "Gästemomente", galleryTitle: "Galerie", officialDescription: "Eine sorgfältig kuratierte Geschichte des Events, getrennt von den spontanen Momenten der Gäste.", curatedBy: "Kuratiert von", open: "Öffnen", officialStory: "Die offizielle Geschichte", curatedMoments: "Ausgewählte Momente", momentsCount: (count) => `${count} ${count === 1 ? "Moment" : "Momente"}`, featuredFirst: "Der erste ausgewählte Moment wird oben hervorgehoben.", collectionPreparing: "Die offizielle Sammlung wird vorbereitet", collectionPreparingText: "Die ausgewählten Aufnahmen des Profis erscheinen hier, sobald sie veröffentlicht wurden.",
  },
  es: {
    privateAlbum: "Álbum privado del evento", promise: "Comparte lo que viste y viviste. Las fotos y los vídeos espontáneos de todos se reúnen en un álbum privado.", add: "Añadir tus momentos", explore: "Explorar el álbum", uploads: "Contenido de invitados", addTitle: "Añade tus momentos", noAccount: "Sin aplicación ni cuenta. Selecciona varias fotos o vídeos a la vez.", name: "Tu nombre", privacy: "Privacidad y confirmación", privacyText: "Tu contenido se guardará en el álbum privado de este evento. Puedes solicitar su retirada en cualquier momento.", confirmation: "Confirmo que tengo derecho a subir este contenido y que no vulnera ilegalmente la privacidad ni los derechos de otras personas.", upload: "Subir al álbum", firstMoment: "El primer momento es tuyo", addPhotos: "Añadir fotos o vídeos",
    expired: "Este evento ha caducado.", unavailable: "Este evento no está disponible para invitados.", tooManyPin: "Demasiados intentos de PIN. Inténtalo de nuevo más tarde.", incorrectPin: "PIN incorrecto", previewTitle: "Este evento todavía no está abierto", previewText: "El anfitrión lo está preparando en una vista privada. Pídele que inicie el periodo de prueba.", privateGallery: "Álbum privado", pinPrompt: "Introduce el PIN del evento para ver el álbum y subir fotos.", openGallery: "Abrir álbum", select: "Seleccionar", cancel: "Cancelar", downloadSelected: "Descargar selección", shareKicker: "QR y compartir", inviteMore: "Invitar a más personas", noApp: "Sin aplicación", qrLabel: "Código QR del álbum compartido", scan: "Escanéalo desde otro móvil para acceder al instante y subir contenido.", copyLink: "Copiar enlace", copiedLink: "Enlace copiado", officialCollection: "Colección oficial", officialAlbum: "El álbum oficial", officialTeaser: "Un relato independiente y cuidado que reúne el material profesional con los mejores momentos seleccionados.", viewCurated: (count) => `Ver ${count} momentos seleccionados`, viewCollection: "Ver colección", guestMoments: "Momentos de invitados", galleryTitle: "Galería", officialDescription: "Un relato cuidadosamente seleccionado del evento, separado de los momentos espontáneos de los invitados.", curatedBy: "Selección de", open: "Abrir", officialStory: "La historia oficial", curatedMoments: "Momentos seleccionados", momentsCount: (count) => `${count} ${count === 1 ? "momento" : "momentos"}`, featuredFirst: "El primer momento seleccionado aparece destacado arriba.", collectionPreparing: "La colección oficial se está preparando", collectionPreparingText: "El material seleccionado por el profesional aparecerá aquí en cuanto se publique.",
  },
  it: {
    privateAlbum: "Album privato dell’evento", promise: "Condividi ciò che hai visto e vissuto. Le foto e i video spontanei di tutti si riuniscono in un album privato.", add: "Aggiungi i tuoi momenti", explore: "Esplora l’album", uploads: "Contenuti degli invitati", addTitle: "Aggiungi i tuoi momenti", noAccount: "Senza app né account. Seleziona più foto o video insieme.", name: "Il tuo nome", privacy: "Privacy e conferma", privacyText: "I tuoi contenuti saranno conservati nell’album privato di questo evento. Potrai richiederne la rimozione in qualsiasi momento.", confirmation: "Confermo di avere il diritto di caricare questi contenuti e che non violano illegalmente la privacy o i diritti altrui.", upload: "Carica nell’album", firstMoment: "Il primo momento è il tuo", addPhotos: "Aggiungi foto o video",
    expired: "Questo evento è scaduto.", unavailable: "Questo evento non è disponibile per gli invitati.", tooManyPin: "Troppi tentativi di PIN. Riprova più tardi.", incorrectPin: "PIN errato", previewTitle: "Questo evento non è ancora aperto", previewText: "L’organizzatore lo sta preparando in anteprima privata. Chiedigli di avviare il periodo di prova.", privateGallery: "Album privato", pinPrompt: "Inserisci il PIN dell’evento per vedere l’album e caricare foto.", openGallery: "Apri album", select: "Seleziona", cancel: "Annulla", downloadSelected: "Scarica selezione", shareKicker: "QR e condivisione", inviteMore: "Invita altre persone", noApp: "Senza app", qrLabel: "Codice QR dell’album condiviso", scan: "Scansiona da un altro telefono per accedere subito e caricare contenuti.", copyLink: "Copia link", copiedLink: "Link copiato", officialCollection: "Raccolta ufficiale", officialAlbum: "L’album ufficiale", officialTeaser: "Un racconto separato e curato che unisce il materiale professionale ai momenti migliori selezionati.", viewCurated: (count) => `Guarda ${count} momenti selezionati`, viewCollection: "Guarda la raccolta", guestMoments: "Momenti degli invitati", galleryTitle: "Galleria", officialDescription: "Un racconto dell’evento curato con attenzione, separato dai momenti spontanei degli invitati.", curatedBy: "A cura di", open: "Apri", officialStory: "La storia ufficiale", curatedMoments: "Momenti selezionati", momentsCount: (count) => `${count} ${count === 1 ? "momento" : "momenti"}`, featuredFirst: "Il primo momento selezionato è in evidenza qui sopra.", collectionPreparing: "La raccolta ufficiale è in preparazione", collectionPreparingText: "Il materiale selezionato dal professionista apparirà qui non appena sarà pubblicato.",
  },
};

const galleryUploadCopy: Record<Locale, {
  confirmationRequired: string;
  anonymous: string;
  trialLimit: (count: number) => string;
  storageQuota: string;
}> = {
  en: { confirmationRequired: "Confirmation is required before uploading.", anonymous: "Anonymous", trialLimit: (count) => `This trial event reached its ${count}-media limit.`, storageQuota: "The event storage quota was reached." },
  el: { confirmationRequired: "Απαιτείται επιβεβαίωση πριν από το ανέβασμα.", anonymous: "Ανώνυμος", trialLimit: (count) => `Το δοκιμαστικό event έφτασε το όριο των ${count} αρχείων.`, storageQuota: "Το όριο χώρου του event συμπληρώθηκε." },
  fr: { confirmationRequired: "Une confirmation est requise avant l’ajout.", anonymous: "Anonyme", trialLimit: (count) => `Cet événement d’essai a atteint sa limite de ${count} fichiers.`, storageQuota: "L’espace de stockage de l’événement est saturé." },
  de: { confirmationRequired: "Vor dem Upload ist eine Bestätigung erforderlich.", anonymous: "Anonym", trialLimit: (count) => `Dieses Testevent hat sein Limit von ${count} Dateien erreicht.`, storageQuota: "Das Speicherlimit des Events wurde erreicht." },
  es: { confirmationRequired: "Debes confirmar antes de subir contenido.", anonymous: "Anónimo", trialLimit: (count) => `Este evento de prueba ha alcanzado su límite de ${count} archivos.`, storageQuota: "Se ha alcanzado el límite de almacenamiento del evento." },
  it: { confirmationRequired: "È necessaria una conferma prima del caricamento.", anonymous: "Anonimo", trialLimit: (count) => `Questo evento di prova ha raggiunto il limite di ${count} file.`, storageQuota: "È stato raggiunto il limite di spazio dell’evento." },
};

galleryRoutes.post("/gallery/:code/unlock", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);

  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  const copy = galleryGuestCopy[locale];
  const requestedSurface = String(body.surface ?? "guest_gallery");
  const surface: EventSurface | null = requestedSurface === "website" || requestedSurface === "guest_gallery" || requestedSurface === "official_album"
    ? requestedSurface
    : null;
  if (!surface) return c.text("Invalid protected area", 400);
  if (surface === "website" && event.event_type !== "wedding") return c.text("Wedding website not found", 404);
  const requestedNext = String(body.next ?? "");
  const allowedNextPrefixes = surface === "website"
    ? [`/wedding/${event.code}`]
    : surface === "official_album"
      ? [`/gallery/${event.code}/official`]
      : [`/gallery/${event.code}`];
  const next = allowedNextPrefixes.some((prefix) => requestedNext === prefix || requestedNext.startsWith(`${prefix}?`))
    ? requestedNext
    : surface === "website"
      ? `/wedding/${event.code}?lang=${locale}`
      : surface === "official_album"
        ? `/gallery/${event.code}/official?lang=${locale}`
        : `/gallery/${event.code}?lang=${locale}`;

  if (Date.now() > event.expires_at)
    return c.text(copy.expired, 410);
  if (!eventAccessAllows(await getEventAccess(c.env.DB, event.id), "guest_access"))
    return c.text(copy.unavailable, 403);
  const pinHash = eventSurfacePinHash(event, surface);
  if (!pinHash)
    return c.redirect(next, 303);

  const pinLimit = await consumeRateLimit(c.env.DB, c.req.raw, c.env.BETTER_AUTH_SECRET, {
    scope: `event-surface-pin:${surface}:${event.code}`,
    limit: 10,
    windowMs: 15 * 60_000,
  });
  if (!pinLimit.allowed)
    return tooManyRequests(
      pinLimit,
      copy.tooManyPin,
    );

  if (!constantTimeEqual(await sha256(String(body.pin ?? "")), pinHash))
    return c.text(copy.incorrectPin, 401);

  const token = await eventSurfaceAccessToken(event, surface);
  const maxAge = Math.max(
    0,
    Math.min(2592000, Math.floor((event.expires_at - Date.now()) / 1000)),
  );
  return new Response(null, {
    status: 303,
    headers: {
      Location: next,
      "Set-Cookie": `${eventSurfaceCookieName(event.code, surface)}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`,
    },
  });
});

galleryRoutes.get("/gallery/:code/cover", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if (Date.now() > event.expires_at) return c.text("Event expired", 410);
  const guestAccessAllowed = eventAccessAllows(await getEventAccess(c.env.DB, event.id), "guest_access");
  const user = guestAccessAllowed ? null : await currentUser(c);
  const memberCanView = Boolean(user && roleCan(await getEventRole(c.env.DB, event.id, user.id), "view"));
  if (!guestAccessAllowed && !memberCanView) return c.text("This event is not available to guests.", 403);
  if (!memberCanView && !(await hasGalleryAccess(c.req.raw, event))) return c.text("Gallery access required", 401);
  const cover = await c.env.DB.prepare("SELECT object_key,content_type FROM event_covers WHERE event_id=?")
    .bind(event.id)
    .first<{ object_key: string; content_type: string }>();
  if (!cover) return c.text("Cover not found", 404);
  const object = await c.env.MEDIA.get(cover.object_key);
  if (!object) return c.text("Cover not found", 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": cover.content_type,
      "Cache-Control": "private, max-age=3600",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

galleryRoutes.get("/gallery/:code", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Η εκδήλωση δεν βρέθηκε.", 404);

  const locale = normalizeLocale(c.req.query("lang") ?? event.default_locale);
  const guestUrl = `${new URL(c.req.url).origin}/gallery/${event.code}`;
  const g = galleryGuestCopy[locale];

  if (Date.now() > event.expires_at) return c.text(g.expired, 410);
  const eventAccess = await getEventAccess(c.env.DB, event.id);
  const originalDownloads = eventAccessAllows(eventAccess, "original_downloads");
  if (!eventAccessAllows(eventAccess, "guest_access"))
    return c.html(page(event.eventName, `<main class="flex min-h-screen items-center justify-center p-5"><section class="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl">${brandMark("/", true)}<p class="mt-7 text-xs font-bold uppercase tracking-[.16em] text-[#7c3aed]">Memboux preview</p><h1 class="mt-2 text-4xl">${esc(g.previewTitle)}</h1><p class="mt-3 leading-6 text-[#6f657c]">${esc(g.previewText)}</p></section></main>`, { locale }), 403);
  if (!(await hasGalleryAccess(c.req.raw, event))) {
    return c.html(
      page(
        event.eventName,
        `<main class="flex min-h-screen items-center justify-center p-5"><section class="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl"><div class="flex items-center justify-between">${brandMark("/", true)}${galleryLanguagePicker(event.code, locale)}</div><h1 class="mt-7 text-4xl">${esc(g.privateGallery)}</h1><p class="mt-2 text-[#6f657c]">${esc(g.pinPrompt)}</p><form action="/gallery/${encodeURIComponent(event.code)}/unlock" method="post" class="mt-6 space-y-3"><input type="hidden" name="locale" value="${locale}"><input type="hidden" name="surface" value="guest_gallery"><input type="hidden" name="next" value="/gallery/${esc(event.code)}?lang=${locale}"><input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" required autofocus aria-label="PIN" placeholder="PIN" class="w-full rounded-xl border px-4 py-3 text-center text-xl tracking-[.3em]"><button class="w-full rounded-xl bg-[#7c3aed] px-5 py-3 text-white">${esc(g.openGallery)}</button></form></section></main>`,
        { locale },
      ),
      401,
    );
  }

  const likeVisitor = existingMediaLikeVisitor(c.req.raw);
  const likeActorKey = likeVisitor
    ? await mediaLikeActorKey(c.env.BETTER_AUTH_SECRET, likeVisitor)
    : "";
  const qrOptions = { type: "svg" as const, width: 220, margin: 1, errorCorrectionLevel: "M" as const };
  const [allMedia, officialResult, guestQrRaw, cover, guestbookResult, experienceSettings] = await Promise.all([
    getGalleryMediaWithLikes(c.env.DB, event.id, likeActorKey),
    c.env.DB.prepare(
      `SELECT COUNT(*) total FROM official_album_items o JOIN media m ON m.id=o.media_id
      WHERE o.event_id=? AND m.deleted_at IS NULL AND m.reported_at IS NULL`,
    ).bind(event.id).first<{ total: number }>(),
    QRCode.toString(guestUrl, qrOptions),
    c.env.DB.prepare("SELECT updated_at FROM event_covers WHERE event_id=?")
      .bind(event.id)
      .first<{ updated_at: number }>(),
    c.env.DB.prepare("SELECT author_name,message,created_at FROM event_guestbook_entries WHERE event_id=? AND status!='hidden' ORDER BY created_at DESC LIMIT 6")
      .bind(event.id)
      .all<GuestbookPreview>()
      .catch(() => ({ results: [] as GuestbookPreview[] })),
    c.env.DB.prepare("SELECT rsvp_enabled,guestbook_enabled,comments_enabled FROM event_experience_settings WHERE event_id=?")
      .bind(event.id)
      .first<GuestParticipationSettings>()
      .catch(() => null),
  ]);
  const items = allMedia.filter((item) => item.origin !== "official");
  const photoItems = items;
  const officialCount = officialResult?.total ?? 0;
  const guestQrSvg = guestQrRaw.replace("<svg", '<svg class="block h-auto w-full max-w-full"');
  const participationSettings: GuestParticipationSettings = {
    rsvp_enabled: 0,
    guestbook_enabled: experienceSettings?.guestbook_enabled ?? 1,
    comments_enabled: experienceSettings?.comments_enabled ?? 1,
  };
  const selectionScript = originalDownloads ? bulkSelectionScript({
    selectButtonId: "select-media",
    cardSelector: ".selectable-media",
    selectorSelector: ".media-selector",
    checkboxSelector: ".media-select",
    tickSelector: ".selection-tick",
    selectText: g.select,
    cancelText: g.cancel,
    actions: [
      {
        buttonId: "download-selected",
        label: g.downloadSelected,
        kind: "download",
      },
    ],
  }) : `<style>#select-media,#download-selected{display:none!important}</style>`;

  return c.html(
    page(
      `${event.eventName} – ${g.galleryTitle}`,
      `<main class="guest-album-page mx-auto max-w-7xl p-4 sm:p-6 lg:p-10">
        <header class="guest-album-topbar flex items-center justify-between px-1 py-2">${brandMark("/", true)}${galleryLanguagePicker(event.code, locale)}</header>
        <section class="guest-event-hero relative mt-4 overflow-hidden rounded-[2rem] bg-[#2b174d] px-6 py-9 text-white sm:px-10 sm:py-12 lg:px-14 lg:py-16">
          ${cover ? `<img src="/gallery/${encodeURIComponent(event.code)}/cover?v=${cover.updated_at}" alt="" class="absolute inset-0 h-full w-full object-cover"><div class="absolute inset-0 bg-gradient-to-r from-[#24143b]/95 via-[#2b174d]/80 to-[#2b174d]/45"></div>` : ""}
          <div class="relative">
            <p class="text-xs font-bold uppercase tracking-[.22em] text-[#ddcff5]">${esc(g.privateAlbum)}</p>
            <h1 class="mt-3 max-w-4xl text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">${esc(event.eventName)}</h1>
            <p class="mt-4 text-sm font-semibold text-[#ddcff5] sm:text-base">${esc(formatEventDates(event, locale))}</p>
            ${event.location ? `<p class="mt-2 text-sm text-white/75">${esc(event.location)}</p>` : ""}
            <p class="mt-4 max-w-2xl text-sm leading-7 text-white/80 sm:text-base">${esc(g.promise)}</p>
            <div class="mt-7 flex flex-col gap-3 sm:flex-row"><a href="#guest-upload" class="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-[#2b174d] shadow-lg"><svg aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 16V4M7 9l5-5 5 5M5 14v5h14v-5"/></svg>${esc(g.add)}</a><a href="#guest-moments" class="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm">${esc(g.explore)}</a></div>
          </div>
        </section>
        <div class="mt-6">
          <section id="guest-upload" class="gallery-upload-card scroll-mt-6 rounded-[2rem] border border-[#e9e3f2] bg-white p-5 shadow-sm sm:p-8">
            <div class="flex items-start gap-4"><span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f2ecff] text-[#7c3aed]"><svg aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 16V4M7 9l5-5 5 5M5 14v5h14v-5"/></svg></span><div><p class="text-xs font-bold uppercase tracking-[.18em] text-[#7c3aed]">${esc(g.uploads)}</p><h2 class="mt-1 text-3xl">${esc(g.addTitle)}</h2><p class="mt-2 text-sm leading-6 text-[#756b82]">${esc(g.noAccount)}</p></div></div>
            <form data-multi-upload action="/api/upload/${event.code}" method="post" enctype="multipart/form-data" class="gallery-upload mt-6 space-y-3 text-left"><input type="hidden" name="locale" value="${locale}"><input name="name" maxlength="60" aria-label="${esc(g.name)}" placeholder="${esc(g.name)}" autocomplete="name" class="w-full rounded-xl border px-4 py-3"><input name="file" required multiple type="file" accept="${UPLOAD_ACCEPT}" aria-label="${esc(g.addPhotos)}" class="w-full rounded-xl border p-3"><p class="text-xs text-[#6f657c]">${esc(uploadLimitsCopy(locale))}</p><section id="guest-upload-confirmation" aria-labelledby="guest-upload-confirmation-title" class="rounded-2xl border border-[#eae4f3] bg-[#f7f3ff] p-4 text-sm text-[#675a72]"><div class="flex items-center gap-2"><svg aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5 shrink-0 text-[#6d28d9]" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg><strong id="guest-upload-confirmation-title" class="font-semibold text-[#49395a]">${esc(g.privacy)}</strong></div><p class="mt-3 leading-6">${esc(g.privacyText)}</p><label class="mt-3 flex cursor-pointer items-start gap-3 rounded-xl bg-white/75 p-3"><input name="upload_confirmation" value="accepted" required type="checkbox" class="mt-1 h-4 w-4 shrink-0"><span>${esc(g.confirmation)}</span></label></section><button class="w-full rounded-xl bg-[#7c3aed] py-3.5 font-bold text-white shadow-lg shadow-indigo-950/10">${esc(g.upload)}</button></form>
          </section>
        </div>
        <section id="guest-moments" class="guest-gallery mt-6 scroll-mt-6 rounded-[2rem] border border-[#e9e3f2] bg-white p-5 shadow-sm sm:p-8"><div class="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p class="text-xs font-bold uppercase tracking-[.18em] text-[#7c3aed]">${esc(g.guestMoments)}</p><h2 class="mt-1 text-3xl">${esc(g.galleryTitle)}</h2>${galleryFilterControls(photoItems, "guest-gallery", locale)}</div><div class="flex flex-wrap gap-2"><button id="select-media" class="rounded-xl border px-4 py-2 text-sm font-semibold">${esc(g.select)}</button><button id="download-selected" class="hidden rounded-xl bg-[#7c3aed] px-4 py-2 text-sm font-semibold text-white">${esc(g.downloadSelected)}</button></div></div>${photoItems.length ? `<div data-gallery-grid="guest-gallery" class="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">${cards(photoItems, { selectable: true, deferredSelection: true, lightbox: true, reportCode: event.code, locale, likes: true, deferAfter: 12 })}</div>${galleryProgressiveControls(photoItems.length, "guest-gallery", locale)}` : `<div class="rounded-3xl border border-dashed border-[#cfdbd6] bg-[#faf8ff] px-6 py-16 text-center"><p class="text-2xl">${esc(g.firstMoment)}</p><a href="#guest-upload" class="mt-4 inline-flex rounded-xl bg-[#2b174d] px-5 py-3 text-sm font-semibold text-white">${esc(g.addPhotos)}</a></div>`}</section>
        ${renderGuestParticipation(event.code, guestbookResult.results, locale, participationSettings)}
        ${officialCount ? `<section class="official-album-teaser mt-6 overflow-hidden rounded-[2rem] border border-[#e9e3f2] bg-white shadow-sm"><a href="/gallery/${event.code}/official?lang=${locale}" class="group grid min-h-[18rem] lg:grid-cols-[minmax(0,1fr)_minmax(22rem,.9fr)]"><div class="flex flex-col justify-center p-6 sm:p-9 lg:p-12"><p class="text-xs font-bold uppercase tracking-[.2em] text-[#7c3aed]">${esc(g.officialCollection)}</p><h2 class="mt-3 text-4xl text-[#2b174d]">${esc(g.officialAlbum)}</h2><p class="mt-3 max-w-xl text-sm leading-7 text-[#756b82]">${esc(g.officialTeaser)}</p><span class="mt-6 inline-flex w-fit items-center gap-2 rounded-xl bg-[#2b174d] px-5 py-3 text-sm font-semibold text-white">${esc(g.viewCurated(officialCount))}<span aria-hidden="true" class="transition group-hover:translate-x-1">→</span></span></div><div class="relative min-h-64 overflow-hidden bg-gradient-to-br from-[#2a4139] via-[#6d28d9] to-[#b5d0c5]"><div class="absolute inset-0 opacity-50" style="background:radial-gradient(circle at 72% 28%,rgba(200,221,213,.55),transparent 24%),radial-gradient(circle at 30% 76%,rgba(117,168,149,.35),transparent 28%)"></div><div class="absolute inset-0 flex items-center justify-center"><span class="flex h-36 w-36 items-center justify-center rounded-full border border-white/15 bg-white/5 backdrop-blur-sm"><img src="/brand/memboux-icon.png" alt="" class="h-24 w-24 opacity-40 brightness-0 invert transition duration-500 group-hover:scale-110"></span></div><div class="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent"></div><span class="absolute bottom-5 left-5 rounded-full border border-white/20 bg-black/25 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">Memboux Studio</span></div></a></section>` : ""}
        <section id="guest-share" class="guest-share-card mt-6 rounded-[2rem] border border-[#e9e3f2] bg-[#f6f2fc] p-5 sm:p-7"><div class="grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_12rem]"><div><div class="flex items-center justify-between gap-3"><div><p class="text-xs font-bold uppercase tracking-[.18em] text-[#7c3aed]">${esc(g.shareKicker)}</p><h2 class="mt-1 text-2xl">${esc(g.inviteMore)}</h2></div><span class="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#746a80]">${esc(g.noApp)}</span></div><p class="mt-4 text-sm leading-6 text-[#756b82]">${esc(g.scan)}</p>${shareIconButtons(guestUrl, event.eventName, locale, false)}<button id="copy-guest-link" type="button" data-copy-label="${esc(g.copyLink)}" data-copied-label="${esc(g.copiedLink)}" class="mt-4 rounded-xl border border-[#d3e2dc] bg-white px-4 py-3 text-sm font-semibold text-[#443653]">${esc(g.copyLink)}</button></div><div class="mx-auto w-full max-w-[180px] overflow-hidden rounded-[1.4rem] border border-[#d9e3df] bg-white p-3 shadow-sm" role="img" aria-label="${esc(g.qrLabel)}">${guestQrSvg}</div></div></section>
      </main>${galleryFilterScript(photoItems, "guest-gallery")}${galleryProgressiveScript("guest-gallery")}${lightboxMarkup(locale, true, originalDownloads)}${experienceSettings?.comments_enabled === 0 ? "" : mediaCommentsOverlay(event.code, locale)}${selectionScript}${mediaLikesScript(event.code, locale)}<script>(()=>{const button=document.getElementById('copy-guest-link');button?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(${JSON.stringify(guestUrl)});button.textContent=button.dataset.copiedLabel;setTimeout(()=>button.textContent=button.dataset.copyLabel,1800)}catch{}})})()<\/script>`,
      { locale },
    ),
  );
});

galleryRoutes.post("/api/gallery/:code/media/:mediaId/like", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.json({ message: "Event not found" }, 404);
  if (Date.now() > event.expires_at)
    return c.json({ message: "Event expired" }, 410);
  const guestAccessAllowed = eventAccessAllows(await getEventAccess(c.env.DB, event.id), "guest_access");
  if (!guestAccessAllowed) {
    const user = await currentUser(c);
    if (!user || !roleCan(await getEventRole(c.env.DB, event.id, user.id), "view"))
      return c.json({ message: "This event is not available to guests" }, 403);
  }
  if (!(await hasGalleryAccess(c.req.raw, event))) {
    const user = await currentUser(c);
    if (!user || !(await getEventRole(c.env.DB, event.id, user.id)))
      return c.json({ message: "Gallery access required" }, 401);
  }

  const limit = await consumeRateLimit(c.env.DB, c.req.raw, c.env.BETTER_AUTH_SECRET, {
    scope: `media-like:${event.id}`,
    limit: 180,
    windowMs: 60_000,
  });
  if (!limit.allowed)
    return tooManyRequests(limit, "Too many reactions. Please try again shortly.");

  const existingVisitor = existingMediaLikeVisitor(c.req.raw);
  const visitor = existingVisitor ?? mediaLikeVisitor(c.req.raw);
  const actorKey = await mediaLikeActorKey(c.env.BETTER_AUTH_SECRET, visitor);
  const result = await toggleMediaLike(
    c.env.DB,
    event.id,
    c.req.param("mediaId"),
    actorKey,
  );
  if (!result) return c.json({ message: "Photo not found" }, 404);

  if (!existingVisitor) {
    setCookie(c, MEDIA_LIKE_COOKIE, visitor, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      maxAge: MEDIA_LIKE_COOKIE_MAX_AGE,
    });
  }
  c.header("Cache-Control", "private, no-store");
  return c.json(result);
});

galleryRoutes.get("/gallery/:code/official", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  const locale = normalizeLocale(c.req.query("lang") ?? event.default_locale);
  if (Date.now() > event.expires_at) return c.text("Event expired", 410);
  const eventAccess = await getEventAccess(c.env.DB, event.id);
  if (!eventAccessAllows(eventAccess, "guest_access"))
    return c.redirect(`/gallery/${event.code}?lang=${locale}`);
  const originalDownloads = eventAccessAllows(eventAccess, "original_downloads");
  if (!(await hasEventSurfaceAccess(c.req.raw, event, "official_album"))) {
    const next = `/gallery/${event.code}/official?lang=${locale}`;
    const g = galleryGuestCopy[locale];
    return c.html(page(event.eventName, `<main class="flex min-h-screen items-center justify-center p-5"><section class="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl"><div class="flex items-center justify-between">${brandMark("/", true)}${galleryLanguagePicker(event.code, locale, true)}</div><h1 class="mt-7 text-4xl">${esc(g.officialAlbum)}</h1><p class="mt-2 text-[#6f657c]">${esc(g.pinPrompt)}</p><form action="/gallery/${encodeURIComponent(event.code)}/unlock" method="post" class="mt-6 space-y-3"><input type="hidden" name="locale" value="${locale}"><input type="hidden" name="surface" value="official_album"><input type="hidden" name="next" value="${esc(next)}"><input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" required autofocus aria-label="PIN" placeholder="PIN" class="w-full rounded-xl border px-4 py-3 text-center text-xl tracking-[.3em]"><button class="w-full rounded-xl bg-[#7c3aed] px-5 py-3 text-white">${esc(g.openGallery)}</button></form></section></main>`, { locale }), 401);
  }
  const g = galleryGuestCopy[locale];
  const likeVisitor = existingMediaLikeVisitor(c.req.raw);
  const likeActorKey = likeVisitor
    ? await mediaLikeActorKey(c.env.BETTER_AUTH_SECRET, likeVisitor)
    : "";
  const [officialItems, curator] = await Promise.all([
    getOfficialMediaWithLikes(c.env.DB, event.id, likeActorKey),
    c.env.DB.prepare(
      `SELECT p.business_name FROM event_professional_assignments a
       JOIN professional_profiles p ON p.user_id=a.professional_user_id
       WHERE a.event_id=? AND a.status='accepted' ORDER BY a.accepted_at DESC LIMIT 1`,
    ).bind(event.id).first<{ business_name: string }>().catch(() => null),
  ]);
  const items = officialItems;
  const featured = items[0];
  const featuredMedia = featured
    ? `<button type="button" class="lightbox-item group relative block h-full min-h-[20rem] w-full overflow-hidden" data-src="/media/${encodeURIComponent(featured.id)}${featured.media_type === "image" ? "?variant=preview" : ""}" data-full="/media/${encodeURIComponent(featured.id)}" data-original="/media/${encodeURIComponent(featured.id)}?download=1" data-type="${featured.media_type}" data-uploader="${esc(featured.uploaded_by)}"${featured.media_type === "image" ? ` data-media-id="${esc(featured.id)}" data-like-count="${Number(featured.like_count ?? 0)}" data-liked="${Boolean(featured.viewer_liked)}"` : ""}>${featured.media_type === "image" ? `<img src="/media/${encodeURIComponent(featured.id)}?variant=preview" alt="" class="h-full w-full object-cover transition duration-700 group-hover:scale-[1.025]">` : `<video src="/media/${encodeURIComponent(featured.id)}#t=0.1" poster="/media/${encodeURIComponent(featured.id)}?variant=thumb" muted playsinline preload="metadata" class="h-full w-full object-cover"></video><span class="pointer-events-none absolute left-5 top-5 rounded-full border border-white/20 bg-black/65 px-3 py-1.5 text-[10px] font-bold tracking-[.12em] text-white backdrop-blur">VIDEO</span>`}</button>`
    : `<div class="flex min-h-[20rem] items-center justify-center bg-gradient-to-br from-[#2a4139] via-[#6d28d9] to-[#b5d0c5]"><img src="/brand/memboux-icon.png" alt="" class="h-28 w-28 opacity-25 brightness-0 invert"></div>`;
  return c.html(
    page(
      `${event.eventName} – ${g.officialAlbum}`,
      `<main class="official-album-page mx-auto max-w-7xl p-4 sm:p-6 lg:p-10"><header class="flex items-center justify-between gap-3 px-1 py-2">${brandMark("/", true)}<div class="flex items-center gap-2">${galleryLanguagePicker(event.code, locale, true)}<a href="/gallery/${event.code}?lang=${locale}" class="rounded-full bg-[#2b174d] px-4 py-2 text-xs font-semibold text-white">${esc(g.guestMoments)}</a></div></header><section class="mt-4 grid overflow-hidden rounded-[2.25rem] border border-[#e9e3f2] bg-white shadow-sm lg:grid-cols-[minmax(0,.85fr)_minmax(28rem,1.15fr)]"><div class="flex flex-col justify-center p-7 sm:p-10 lg:p-14"><p class="text-xs font-bold uppercase tracking-[.22em] text-[#7c3aed]">${esc(g.officialCollection)}</p><h1 class="mt-3 text-4xl leading-tight sm:text-5xl">${esc(event.eventName)}</h1><p class="mt-4 font-semibold text-[#7c3aed]">${esc(formatEventDates(event, locale))}</p>${event.location ? `<p class="mt-2 text-sm text-[#756b82]">${esc(event.location)}</p>` : ""}<p class="mt-5 max-w-xl text-sm leading-7 text-[#756b82]">${esc(g.officialDescription)}</p><div class="mt-7 flex items-center gap-3"><span class="flex h-10 w-10 items-center justify-center rounded-full bg-[#f2ecff] text-[#7c3aed]">✦</span><div><p class="text-xs uppercase tracking-[.14em] text-[#8b9994]">${esc(g.curatedBy)}</p><p class="font-semibold text-[#49395a]">${esc(curator?.business_name ?? "Memboux Studio")}</p></div></div></div><div class="relative min-h-[20rem] bg-[#2b174d]">${featuredMedia}${featured ? `<span class="pointer-events-none absolute right-5 top-5 rounded-full border border-white/20 bg-black/30 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">${esc(g.open)}</span>${mediaLikeButton(featured, locale, "absolute bottom-5 left-5 z-30")}` : ""}</div></section><section class="mt-6 rounded-[2rem] border border-[#e9e3f2] bg-white p-5 shadow-sm sm:p-8"><div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p class="text-xs font-bold uppercase tracking-[.18em] text-[#7c3aed]">${esc(g.officialStory)}</p><h2 class="mt-1 text-3xl">${esc(g.curatedMoments)}</h2></div><span class="text-sm font-semibold text-[#877d91]">${esc(g.momentsCount(items.length))}</span></div>${items.length > 1 ? `<div class="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">${cards(items.slice(1), { lightbox: true, locale, likes: true })}</div>` : items.length ? `<p class="mt-6 rounded-2xl bg-[#f7faf8] p-5 text-sm text-[#756b82]">${esc(g.featuredFirst)}</p>` : `<div class="mt-6 rounded-3xl border border-dashed border-[#cfdbd6] bg-[#faf8ff] px-6 py-16 text-center"><p class="text-2xl">${esc(g.collectionPreparing)}</p><p class="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#756b82]">${esc(g.collectionPreparingText)}</p></div>`}</section></main>${lightboxMarkup(locale, true, originalDownloads)}${mediaCommentsOverlay(event.code, locale)}${mediaLikesScript(event.code, locale)}`,
      { locale },
    ),
  );
});

galleryRoutes.get("/gallery/:code/removal/:mediaId", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if (Date.now() > event.expires_at || !eventAccessAllows(await getEventAccess(c.env.DB, event.id), "guest_access"))
    return c.text("This event is not available to guests.", 403);
  if (!(await hasGalleryAccess(c.req.raw, event)))
    return c.text("Gallery PIN required", 401);
  const media = await c.env.DB.prepare(
    "SELECT id FROM media WHERE id=? AND event_id=? AND deleted_at IS NULL",
  )
    .bind(c.req.param("mediaId"), event.id)
    .first();
  if (!media) return c.text("Media not found", 404);

  return c.html(
    page(
      "Request removal",
      `<main class="mx-auto flex min-h-screen max-w-xl items-center p-5"><section class="w-full rounded-3xl bg-white p-7 shadow-xl">${brandMark("/", true)}<p class="mt-7 text-xs uppercase tracking-[.2em] text-[#6d28d9]">Privacy request</p><h1 class="mt-2 text-4xl">Request photo removal</h1><p class="mt-3 text-[#6f657c]">Use this form if you appear in this content or believe it infringes your privacy or rights. The event owner will receive the request for review.</p><form action="/gallery/${encodeURIComponent(event.code)}/removal/${encodeURIComponent(c.req.param("mediaId"))}" method="post" class="mt-6 space-y-4"><label class="block">Email<input name="email" type="email" required maxlength="254" class="mt-1 w-full rounded-xl border px-4 py-3"></label><label class="block">Reason<textarea name="reason" required minlength="10" maxlength="1000" rows="5" class="mt-1 w-full rounded-xl border px-4 py-3"></textarea></label><button class="w-full rounded-xl bg-[#7c3aed] px-5 py-3 text-white">Submit removal request</button></form></section></main>`,
    ),
  );
});

galleryRoutes.post("/gallery/:code/removal/:mediaId", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if (Date.now() > event.expires_at || !eventAccessAllows(await getEventAccess(c.env.DB, event.id), "guest_access"))
    return c.text("This event is not available to guests.", 403);
  if (!(await hasGalleryAccess(c.req.raw, event)))
    return c.text("Gallery PIN required", 401);
  const media = await c.env.DB.prepare(
    "SELECT id FROM media WHERE id=? AND event_id=? AND deleted_at IS NULL",
  )
    .bind(c.req.param("mediaId"), event.id)
    .first();
  if (!media) return c.text("Media not found", 404);

  const reportLimit = await consumeRateLimit(c.env.DB, c.req.raw, c.env.BETTER_AUTH_SECRET, {
    scope: `removal-report:${event.code}`,
    limit: 5,
    windowMs: 60 * 60_000,
  });
  if (!reportLimit.allowed) return tooManyRequests(reportLimit);

  const body = await c.req.parseBody();
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 254);
  const reason = String(body.reason ?? "").trim().slice(0, 1000);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || reason.length < 10)
    return c.text("Check your email and reason.", 400);

  const reportedAt = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO media_removal_requests (id,media_id,event_id,requester_email,reason,status,created_at) VALUES (?,?,?,?,?,'pending',?)",
    ).bind(crypto.randomUUID(), c.req.param("mediaId"), event.id, email, reason, reportedAt),
    c.env.DB.prepare("UPDATE media SET reported_at=? WHERE id=? AND event_id=? AND deleted_at IS NULL").bind(reportedAt, c.req.param("mediaId"), event.id),
  ]);

  return c.html(
    page(
      "Request received",
      `<main class="flex min-h-screen items-center justify-center p-5"><section class="max-w-lg rounded-3xl bg-white p-8 text-center shadow-xl"><h1 class="text-4xl">Request received</h1><p class="mt-3 text-[#6f657c]">Your removal request was recorded and will be reviewed by the event owner.</p><a href="/gallery/${encodeURIComponent(event.code)}" class="mt-6 inline-block rounded-xl bg-[#7c3aed] px-5 py-3 text-white">Back to gallery</a></section></main>`,
    ),
  );
});

galleryRoutes.post("/api/upload/:code", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Η εκδήλωση δεν βρέθηκε.", 404);
  if (Date.now() > event.expires_at) return c.text("Η εκδήλωση έχει λήξει.", 410);
  if (!(await hasGalleryAccess(c.req.raw, event)))
    return c.text("Gallery PIN required", 401);
  const uploaderUser = await currentUser(c);

  const uploadLimit = await consumeRateLimit(c.env.DB, c.req.raw, c.env.BETTER_AUTH_SECRET, {
    scope: `gallery-upload:${event.code}`,
    limit: 30,
    windowMs: 60 * 60_000,
  });
  if (!uploadLimit.allowed) return tooManyRequests(uploadLimit);

  const form = await c.req.formData();
  const locale = normalizeLocale(String(form.get("locale") ?? event.default_locale));
  const uploadCopy = galleryUploadCopy[locale];
  if (form.get("upload_confirmation") !== "accepted")
    return c.text(uploadCopy.confirmationRequired, 400);

  const uploadedBy = String(form.get("name") ?? uploadCopy.anonymous).trim().slice(0, 60) || uploadCopy.anonymous;
  const files = form.getAll("file").filter((value): value is File => value instanceof File && value.size > 0);
  const validationError = validateUploadFiles(files);
  if (validationError) {
    const detail = uploadValidationDetails(validationError, locale);
    return new Response(detail.message, { status: detail.status });
  }
  const capacity = await eventMediaCapacity(c.env.DB, event.id, files.length);
  if (!capacity.allowed)
    return c.text(uploadCopy.trialLimit(capacity.access.media_limit), 409);

  const uploadedKeys: string[] = [];
  let reservedBytes = 0;
  let reservationOwner: string | null = null;

  try {
    for (const file of files) {
      const id = crypto.randomUUID();
      const extension = safeFileExtension(file.name);
      const objectKey = `${event.id}/${id}.${extension}`;
      const bytes = await file.arrayBuffer();
      const contentHash = await sha256Bytes(bytes);
      const canonicalHash = await mediaCanonicalHash(bytes, file.type, contentHash);
      if (
        await c.env.DB.prepare("SELECT 1 FROM media WHERE event_id=? AND deleted_at IS NULL AND (content_hash=? OR canonical_hash=?)")
          .bind(event.id, contentHash, canonicalHash)
          .first()
      ) {
        continue;
      }

      const reservation = await reserveStorageForEvent(c.env.DB, event.id, file.size);
      if (!reservation.allowed) throw new Error("storage_quota_exceeded");
      reservationOwner = reservation.ownerId;
      reservedBytes += file.size;

      let capturedAt: number | null = null;
      if (file.type.startsWith("image/")) {
        try {
          const metadata = await parseMetadata(bytes, ["DateTimeOriginal", "CreateDate", "ModifyDate"]);
          const value = metadata?.DateTimeOriginal ?? metadata?.CreateDate ?? metadata?.ModifyDate;
          const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
          if (Number.isFinite(parsed) && parsed > 0 && parsed <= Date.now() + 86400000) capturedAt = parsed;
        } catch {
          /* No readable metadata. */
        }
      }

      await c.env.MEDIA.put(objectKey, bytes, {
        httpMetadata: { contentType: file.type, cacheControl: "private, no-store" },
      });
      uploadedKeys.push(objectKey);
      const uploadedAt = Date.now();
      try {
        await c.env.DB.prepare(
          "INSERT INTO media (id,event_id,object_key,media_type,content_type,uploaded_by,uploaded_at,captured_at,content_hash,canonical_hash,size_bytes,title,upload_consent_at,upload_policy_version,uploaded_by_user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL,?,?,?)",
        ).bind(
          id,
          event.id,
          objectKey,
          file.type.startsWith("image/") ? "image" : "video",
          file.type,
          uploadedBy,
          uploadedAt,
          capturedAt,
          contentHash,
          canonicalHash,
          file.size,
          uploadedAt,
          GUEST_UPLOAD_POLICY_VERSION,
          uploaderUser?.id ?? null,
        ).run();
      } catch (error) {
        if (!isCanonicalDuplicateConstraint(error)) throw error;
        await c.env.MEDIA.delete(objectKey);
        uploadedKeys.pop();
        await releaseStorage(c.env.DB, reservation.ownerId, file.size);
        reservedBytes -= file.size;
      }
    }
  } catch (error) {
    if (uploadedKeys.length) await c.env.MEDIA.delete(uploadedKeys);
    if (uploadedKeys.length)
      await c.env.DB.batch(uploadedKeys.map((key) => c.env.DB.prepare("DELETE FROM media WHERE object_key=?").bind(key)));
    await releaseStorage(c.env.DB, reservationOwner, reservedBytes);
    if (error instanceof Error && error.message.includes("storage_quota_exceeded"))
      return c.text(uploadCopy.storageQuota, 413);
    if (isTrialMediaLimitConstraint(error))
      return c.text(uploadCopy.trialLimit(20), 409);
    throw error;
  }

  if (uploadedKeys.length) {
    await notifyEventMembersAboutUpload(c.env.DB, {
      eventId: event.id,
      actorUserId: uploaderUser?.id ?? null,
      actorName: uploaderUser?.name ?? uploadedBy,
      itemCount: uploadedKeys.length,
    });
    c.executionCtx.waitUntil(
      queueAutomaticCloudBackupsForEvent(c.env, event.id).catch((error) => {
        console.error(JSON.stringify({
          event: "drive_upload_sync_failed",
          eventId: event.id,
          error: error instanceof Error ? error.message.slice(0, 300) : "unknown",
        }));
      }),
    );
  }

  if (c.req.header("Accept")?.includes("application/json"))
    return c.json({ ok: true, uploaded: uploadedKeys.length });
  return c.redirect(`/gallery/${event.code}?lang=${locale}`, 303);
});

galleryRoutes.get("/media/:id", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT m.object_key,m.content_type,m.media_type,m.size_bytes,m.captured_at,m.uploaded_at,m.event_id,m.origin,e.code,e.gallery_pin_hash,e.website_pin_hash,e.guest_gallery_pin_hash,e.official_album_pin_hash,e.expires_at FROM media m JOIN events e ON e.id=m.event_id WHERE m.id=? AND m.deleted_at IS NULL AND m.reported_at IS NULL AND e.deleted_at IS NULL",
  )
    .bind(c.req.param("id"))
    .first<{
      object_key: string;
      content_type: string;
      media_type: "image" | "video";
      size_bytes: number;
      captured_at: number | null;
      uploaded_at: number;
      event_id: string;
      code: string;
      origin: string;
      gallery_pin_hash: string | null;
      website_pin_hash: string | null;
      guest_gallery_pin_hash: string | null;
      official_album_pin_hash: string | null;
      expires_at: number;
    }>();
  if (!row) return c.text("Το αρχείο δεν βρέθηκε.", 404);

  const access = await getEventAccess(c.env.DB, row.event_id);
  const guestAccessAllowed = Date.now() <= row.expires_at
    && eventAccessAllows(access, "guest_access");
  let memberCanView = false;
  const mediaSurface = row.origin === "official" ? "official_album" : "guest_gallery";
  const mediaPinHash = eventSurfacePinHash({ ...row, id: row.event_id }, mediaSurface);
  if (!guestAccessAllowed || mediaPinHash) {
    const user = await currentUser(c);
    memberCanView = Boolean(user && roleCan(await getEventRole(c.env.DB, row.event_id, user.id), "view"));
  }
  if (!guestAccessAllowed && !memberCanView)
    return c.text("This event is not available to guests.", 403);

  if (mediaPinHash && !memberCanView) {
    const accessEvent = { ...row, id: row.event_id };
    const ownSurfaceAccess = await hasEventSurfaceAccess(c.req.raw, accessEvent, mediaSurface);
    const embeddedWebsiteAccess = Boolean(row.website_pin_hash)
      && await hasEventSurfaceAccess(c.req.raw, accessEvent, "website");
    if (!ownSurfaceAccess && !embeddedWebsiteAccess) return c.text("Private media", 401);
  }

  const originalDownloadsAllowed = eventAccessAllows(access, "original_downloads");
  const wantsOriginalDownload = c.req.query("download") === "1";
  if (
    wantsOriginalDownload
    && !originalDownloadsAllowed
  ) {
    return c.text("Οι λήψεις πρωτοτύπων ξεκλειδώνουν με την αναβάθμιση του event.", 403);
  }

  const requestedVariant = wantsOriginalDownload
    ? null
    : parseMediaVariant(c.req.query("variant"));
  // A missing variant used to expose the original object directly. During an
  // enforced trial every image request is pinned to the preview derivative,
  // regardless of the URL a client constructs.
  const variant = row.media_type === "image" && !originalDownloadsAllowed
    ? "preview"
    : row.media_type === "video" && requestedVariant !== "thumb"
      ? null
      : requestedVariant;
  let object: R2ObjectBody | null = null;
  let transformed = false;
  if (variant && row.media_type === "video") {
    object = await c.env.MEDIA.get(mediaVariantKey(row.object_key, "thumb"));
    transformed = Boolean(object);
    if (!object) return c.text("Video preview unavailable.", 404);
  } else if (variant) {
    try {
      const result = await getOrCreateMediaVariant(c.env, row.object_key, variant);
      object = result?.object ?? null;
      transformed = Boolean(object && object.key !== row.object_key);
      if (!originalDownloadsAllowed && object && !transformed)
        return c.text("Preview unavailable. The original remains protected.", 503);
    } catch (error) {
      console.error(JSON.stringify({
        event: "image_variant_failed",
        mediaId: c.req.param("id"),
        variant,
        error: error instanceof Error ? error.message.slice(0, 300) : "unknown",
      }));
    }
  }
  const rangeRequested = !variant && c.req.header("Range");
  object ??= await c.env.MEDIA.get(
    row.object_key,
    rangeRequested ? { range: c.req.raw.headers } : undefined,
  );
  if (!object) return c.text("Το αρχείο δεν βρέθηκε.", 404);

  const headers = new Headers({
    "Content-Type": transformed ? "image/webp" : row.content_type,
    "Cache-Control": transformed ? "private, max-age=31536000, immutable" : "private, no-store",
    ETag: object.httpEtag,
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  });
  if (!originalDownloadsAllowed) headers.set("X-Memboux-Media-Access", "preview-only");
  let status: 200 | 206 = 200;
  if (rangeRequested && object.range) {
    const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeRequested.trim());
    if (match) {
      const [, startText, endText] = match;
      const suffixLength = !startText && endText ? Number(endText) : null;
      const offset = suffixLength === null
        ? Number(startText)
        : Math.max(0, row.size_bytes - suffixLength);
      const requestedEnd = endText && startText ? Number(endText) : row.size_bytes - 1;
      const end = Math.min(row.size_bytes - 1, requestedEnd);
      const length = Math.max(0, end - offset + 1);
      headers.set("Content-Range", `bytes ${offset}-${end}/${row.size_bytes}`);
      headers.set("Content-Length", String(length));
      status = 206;
    }
  }

  if (c.req.query("download") === "1") {
    const extension =
      row.content_type.split("/")[1]?.replace("jpeg", "jpg").replace("quicktime", "mov") ||
      (row.media_type === "image" ? "jpg" : "mp4");
    const date = new Date(row.captured_at ?? row.uploaded_at).toISOString().slice(0, 10);
    headers.set("Content-Disposition", `attachment; filename="memboux-${date}.${extension}"`);
  }

  return new Response(object.body, { headers, status });
});
