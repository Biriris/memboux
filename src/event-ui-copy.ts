import type { Locale } from "./i18n";

type EventUiCopy = {
  guidedSetup: string;
  createEvent: string;
  startFreePreview: string;
  viewDemo: string;
  noCardPrivate: string;
  privatePreview: string;
  experienceTitle: string;
  tailoredWizard: string;
  wizardTitle: string;
  wizardText: string;
  trialEyebrow: string;
  trialTitle: string;
  trialText: string;
  createPreview: string;
  previewLanguage: string;
  createYours: string;
  themes: string;
  signature: string;
  vivid: string;
  editorial: string;
  minimal: string;
  demoTitle: string;
  demoText: string;
  appearance: string;
  device: string;
  signatureDescription: string;
  vividDescription: string;
  editorialDescription: string;
  minimalDescription: string;
  trialSummary: string;
  eventPreview: string;
  responsivePreview: string;
  mobile: string;
  tablet: string;
  desktop: string;
  close: string;
  ownerPreview: string;
  edit: string;
  dateTba: string;
  locationTba: string;
  story: string;
  storyFallback: string;
  schedule: string;
  scheduleFallback: string;
  forGuests: string;
  guestsFallback: string;
};

export const eventUiCopy: Record<Locale, EventUiCopy> = {
  en: {
    guidedSetup: "Guided setup with an immediate preview.", createEvent: "Create event",
    startFreePreview: "Start a free preview", viewDemo: "View interactive demo",
    noCardPrivate: "No card · Private until you publish", privatePreview: "Private preview",
    experienceTitle: "Everything your event needs, in one place.", tailoredWizard: "Tailored wizard",
    wizardTitle: "From idea to full preview, step by step.",
    wizardText: "The wizard adapts to this event type and saves your progress automatically.",
    trialEyebrow: "Risk-free trial", trialTitle: "See your complete event before deciding.",
    trialText: "A complete private preview, 14 days and up to 20 files. Upgrade unlocks a larger collection and long-term access.",
    createPreview: "Create your preview", previewLanguage: "Preview language", createYours: "Create yours",
    themes: "Styles", signature: "Signature", vivid: "Vivid", editorial: "Editorial", minimal: "Minimal",
    demoTitle: "See the complete experience before you start.",
    demoText: "Change the appearance and screen size. This is a real preview of the page you will create, not a static image.",
    appearance: "Appearance", device: "Device", signatureDescription: "Elegant & timeless",
    vividDescription: "Bold & social", editorialDescription: "Premium storytelling",
    minimalDescription: "Clean & contemporary", trialSummary: "No card · 14 days · 20 files", eventPreview: "Event preview",
    responsivePreview: "Responsive preview", mobile: "Mobile", tablet: "Tablet", desktop: "Desktop", close: "Close",
    ownerPreview: "Private owner preview", edit: "Edit", dateTba: "Date to be announced",
    locationTba: "Location to be announced", story: "The story", storyFallback: "The event story will appear here.",
    schedule: "Schedule", scheduleFallback: "Schedule details will appear here.", forGuests: "For guests",
    guestsFallback: "Useful guest information will appear here.",
  },
  el: {
    guidedSetup: "Καθοδηγούμενη δημιουργία με άμεση προεπισκόπηση.", createEvent: "Δημιούργησε εκδήλωση",
    startFreePreview: "Ξεκίνα δωρεάν προεπισκόπηση", viewDemo: "Δες το διαδραστικό δείγμα",
    noCardPrivate: "Χωρίς κάρτα · Παραμένει ιδιωτικό μέχρι να το δημοσιεύσεις", privatePreview: "Ιδιωτική προεπισκόπηση",
    experienceTitle: "Όλα όσα χρειάζεται η εκδήλωσή σου, σε ένα μέρος.", tailoredWizard: "Οδηγός στα μέτρα της εκδήλωσης",
    wizardTitle: "Από την ιδέα στην πλήρη προεπισκόπηση, βήμα-βήμα.",
    wizardText: "Ο οδηγός προσαρμόζεται στο είδος της εκδήλωσης και αποθηκεύει αυτόματα την πρόοδό σου.",
    trialEyebrow: "Δοκιμή χωρίς ρίσκο", trialTitle: "Δες ολόκληρη την εκδήλωσή σου πριν αποφασίσεις.",
    trialText: "Πλήρης ιδιωτική προεπισκόπηση, 14 ημέρες και έως 20 αρχεία. Η αναβάθμιση ξεκλειδώνει μεγαλύτερη συλλογή και μακροχρόνια πρόσβαση.",
    createPreview: "Δημιούργησε την προεπισκόπηση", previewLanguage: "Γλώσσα προεπισκόπησης", createYours: "Δημιούργησε τη δική σου",
    themes: "Στυλ", signature: "Υπογραφή", vivid: "Ζωντανό", editorial: "Αφηγηματικό", minimal: "Λιτό",
    demoTitle: "Δες ολόκληρη την εμπειρία πριν ξεκινήσεις.",
    demoText: "Άλλαξε εμφάνιση και μέγεθος οθόνης. Αυτή είναι πραγματική προεπισκόπηση της σελίδας που θα δημιουργήσεις, όχι στατική εικόνα.",
    appearance: "Εμφάνιση", device: "Συσκευή", signatureDescription: "Κομψό & διαχρονικό",
    vividDescription: "Έντονο & κοινωνικό", editorialDescription: "Premium αφήγηση",
    minimalDescription: "Καθαρό & σύγχρονο", trialSummary: "Χωρίς κάρτα · 14 ημέρες · 20 αρχεία", eventPreview: "Προεπισκόπηση εκδήλωσης",
    responsivePreview: "Προσαρμοζόμενη προεπισκόπηση", mobile: "Κινητό", tablet: "Tablet", desktop: "Υπολογιστής", close: "Κλείσιμο",
    ownerPreview: "Ιδιωτική προεπισκόπηση δημιουργού", edit: "Επεξεργασία", dateTba: "Η ημερομηνία θα ανακοινωθεί",
    locationTba: "Η τοποθεσία θα ανακοινωθεί", story: "Η ιστορία", storyFallback: "Η ιστορία της εκδήλωσης θα προστεθεί εδώ.",
    schedule: "Πρόγραμμα", scheduleFallback: "Το πρόγραμμα θα προστεθεί εδώ.", forGuests: "Για τους καλεσμένους",
    guestsFallback: "Οι χρήσιμες πληροφορίες θα προστεθούν εδώ.",
  },
  fr: {
    guidedSetup: "Configuration guidée avec aperçu immédiat.", createEvent: "Créer un événement",
    startFreePreview: "Créer un aperçu gratuit", viewDemo: "Voir la démo interactive",
    noCardPrivate: "Sans carte · Privé jusqu’à la publication", privatePreview: "Aperçu privé",
    experienceTitle: "Tout ce dont votre événement a besoin, au même endroit.", tailoredWizard: "Assistant personnalisé",
    wizardTitle: "De l’idée à l’aperçu complet, étape par étape.",
    wizardText: "L’assistant s’adapte à ce type d’événement et enregistre automatiquement votre progression.",
    trialEyebrow: "Essai sans risque", trialTitle: "Découvrez votre événement complet avant de décider.",
    trialText: "Un aperçu privé complet pendant 14 jours, avec jusqu’à 20 fichiers. La mise à niveau débloque une collection plus grande et un accès durable.",
    createPreview: "Créer votre aperçu", previewLanguage: "Langue de l’aperçu", createYours: "Créer le vôtre",
    themes: "Styles", signature: "Signature", vivid: "Vif", editorial: "Éditorial", minimal: "Minimal",
    demoTitle: "Découvrez l’expérience complète avant de commencer.",
    demoText: "Changez le style et la taille de l’écran. Il s’agit d’un véritable aperçu de la page que vous créerez, pas d’une image statique.",
    appearance: "Apparence", device: "Appareil", signatureDescription: "Élégant et intemporel",
    vividDescription: "Vif et convivial", editorialDescription: "Récit premium",
    minimalDescription: "Épuré et contemporain", trialSummary: "Sans carte · 14 jours · 20 fichiers", eventPreview: "Aperçu de l’événement",
    responsivePreview: "Aperçu adaptatif", mobile: "Mobile", tablet: "Tablette", desktop: "Ordinateur", close: "Fermer",
    ownerPreview: "Aperçu privé de l’organisateur", edit: "Modifier", dateTba: "Date à venir",
    locationTba: "Lieu à venir", story: "L’histoire", storyFallback: "L’histoire de l’événement apparaîtra ici.",
    schedule: "Programme", scheduleFallback: "Le programme apparaîtra ici.", forGuests: "Pour les invités",
    guestsFallback: "Les informations utiles aux invités apparaîtront ici.",
  },
  de: {
    guidedSetup: "Geführte Einrichtung mit sofortiger Vorschau.", createEvent: "Event erstellen",
    startFreePreview: "Kostenlose Vorschau starten", viewDemo: "Interaktive Demo ansehen",
    noCardPrivate: "Keine Karte · Privat bis zur Veröffentlichung", privatePreview: "Private Vorschau",
    experienceTitle: "Alles, was dein Event braucht, an einem Ort.", tailoredWizard: "Passender Assistent",
    wizardTitle: "Von der Idee zur vollständigen Vorschau – Schritt für Schritt.",
    wizardText: "Der Assistent passt sich diesem Eventtyp an und speichert deinen Fortschritt automatisch.",
    trialEyebrow: "Risikofrei testen", trialTitle: "Sieh dir dein vollständiges Event an, bevor du dich entscheidest.",
    trialText: "Eine vollständige private Vorschau für 14 Tage und bis zu 20 Dateien. Ein Upgrade schaltet eine größere Sammlung und dauerhaften Zugriff frei.",
    createPreview: "Vorschau erstellen", previewLanguage: "Vorschausprache", createYours: "Eigenes erstellen",
    themes: "Stile", signature: "Signature", vivid: "Lebendig", editorial: "Editorial", minimal: "Minimal",
    demoTitle: "Erlebe alles vollständig, bevor du beginnst.",
    demoText: "Ändere Stil und Bildschirmgröße. Dies ist eine echte Vorschau deiner späteren Seite, kein statisches Bild.",
    appearance: "Erscheinungsbild", device: "Gerät", signatureDescription: "Elegant und zeitlos",
    vividDescription: "Lebendig und gesellig", editorialDescription: "Hochwertiges Storytelling",
    minimalDescription: "Klar und modern", trialSummary: "Keine Karte · 14 Tage · 20 Dateien", eventPreview: "Eventvorschau",
    responsivePreview: "Responsive Vorschau", mobile: "Mobil", tablet: "Tablet", desktop: "Desktop", close: "Schließen",
    ownerPreview: "Private Veranstaltervorschau", edit: "Bearbeiten", dateTba: "Datum wird noch bekannt gegeben",
    locationTba: "Ort wird noch bekannt gegeben", story: "Die Geschichte", storyFallback: "Die Geschichte des Events erscheint hier.",
    schedule: "Ablauf", scheduleFallback: "Der Ablauf erscheint hier.", forGuests: "Für Gäste",
    guestsFallback: "Nützliche Informationen für Gäste erscheinen hier.",
  },
  es: {
    guidedSetup: "Configuración guiada con vista previa inmediata.", createEvent: "Crear evento",
    startFreePreview: "Crear una vista previa gratis", viewDemo: "Ver demo interactiva",
    noCardPrivate: "Sin tarjeta · Privado hasta que lo publiques", privatePreview: "Vista previa privada",
    experienceTitle: "Todo lo que necesita tu evento, en un solo lugar.", tailoredWizard: "Asistente personalizado",
    wizardTitle: "De la idea a la vista previa completa, paso a paso.",
    wizardText: "El asistente se adapta a este tipo de evento y guarda tu progreso automáticamente.",
    trialEyebrow: "Prueba sin riesgo", trialTitle: "Mira tu evento completo antes de decidir.",
    trialText: "Una vista previa privada completa durante 14 días y hasta 20 archivos. La mejora desbloquea una colección mayor y acceso duradero.",
    createPreview: "Crear tu vista previa", previewLanguage: "Idioma de la vista previa", createYours: "Crear el tuyo",
    themes: "Estilos", signature: "Signature", vivid: "Vibrante", editorial: "Editorial", minimal: "Minimal",
    demoTitle: "Descubre la experiencia completa antes de empezar.",
    demoText: "Cambia el estilo y el tamaño de pantalla. Esta es una vista previa real de la página que crearás, no una imagen estática.",
    appearance: "Apariencia", device: "Dispositivo", signatureDescription: "Elegante y atemporal",
    vividDescription: "Vibrante y social", editorialDescription: "Narrativa premium",
    minimalDescription: "Limpio y contemporáneo", trialSummary: "Sin tarjeta · 14 días · 20 archivos", eventPreview: "Vista previa del evento",
    responsivePreview: "Vista previa adaptable", mobile: "Móvil", tablet: "Tableta", desktop: "Ordenador", close: "Cerrar",
    ownerPreview: "Vista previa privada del organizador", edit: "Editar", dateTba: "Fecha por anunciar",
    locationTba: "Lugar por anunciar", story: "La historia", storyFallback: "La historia del evento aparecerá aquí.",
    schedule: "Programa", scheduleFallback: "El programa aparecerá aquí.", forGuests: "Para los invitados",
    guestsFallback: "La información útil para los invitados aparecerá aquí.",
  },
  it: {
    guidedSetup: "Configurazione guidata con anteprima immediata.", createEvent: "Crea evento",
    startFreePreview: "Crea un’anteprima gratuita", viewDemo: "Guarda la demo interattiva",
    noCardPrivate: "Nessuna carta · Privato fino alla pubblicazione", privatePreview: "Anteprima privata",
    experienceTitle: "Tutto ciò che serve al tuo evento, in un unico posto.", tailoredWizard: "Procedura personalizzata",
    wizardTitle: "Dall’idea all’anteprima completa, passo dopo passo.",
    wizardText: "La procedura si adatta a questo tipo di evento e salva automaticamente i tuoi progressi.",
    trialEyebrow: "Prova senza rischi", trialTitle: "Guarda il tuo evento completo prima di decidere.",
    trialText: "Un’anteprima privata completa per 14 giorni e fino a 20 file. L’upgrade sblocca una raccolta più grande e un accesso duraturo.",
    createPreview: "Crea la tua anteprima", previewLanguage: "Lingua dell’anteprima", createYours: "Crea il tuo",
    themes: "Stili", signature: "Signature", vivid: "Vivace", editorial: "Editoriale", minimal: "Minimal",
    demoTitle: "Scopri l’esperienza completa prima di iniziare.",
    demoText: "Cambia stile e dimensione dello schermo. Questa è un’anteprima reale della pagina che creerai, non un’immagine statica.",
    appearance: "Aspetto", device: "Dispositivo", signatureDescription: "Elegante e senza tempo",
    vividDescription: "Vivace e sociale", editorialDescription: "Narrazione premium",
    minimalDescription: "Pulito e contemporaneo", trialSummary: "Nessuna carta · 14 giorni · 20 file", eventPreview: "Anteprima dell’evento",
    responsivePreview: "Anteprima adattiva", mobile: "Mobile", tablet: "Tablet", desktop: "Computer", close: "Chiudi",
    ownerPreview: "Anteprima privata dell’organizzatore", edit: "Modifica", dateTba: "Data da annunciare",
    locationTba: "Luogo da annunciare", story: "La storia", storyFallback: "La storia dell’evento apparirà qui.",
    schedule: "Programma", scheduleFallback: "Il programma apparirà qui.", forGuests: "Per gli ospiti",
    guestsFallback: "Le informazioni utili per gli ospiti appariranno qui.",
  },
};

export type EventWizardCopy = {
  identityTitle: string; identityText: string; headline: string; host: string; introduction: string; introductionPlaceholder: string;
  flowTitle: string; scheduleMoments: string; schedulePlaceholder: string; artTitle: string; visualStyle: string; storyLabel: string; storyPlaceholder: string;
  reviewTitle: string; reviewText: string; guestInfo: string; guestPlaceholder: string; contactEmail: string; completeWizard: string; completeText: string;
  back: string; finishPreview: string; saveContinue: string; autosave: string; restored: string; saving: string; saved: string; protected: string;
  previewHelp: string; openPreview: string; backWorkspace: string;
};

const wizardEnglish: EventWizardCopy = {
  identityTitle: "Give the event its identity", identityText: "The primary message guests will see first.", headline: "Main headline",
  host: "Host or team", introduction: "Short introduction", introductionPlaceholder: "Welcome your guests…",
  flowTitle: "Organize the event flow", scheduleMoments: "Schedule and key moments", schedulePlaceholder: "Times, stops, activities, or key instructions…",
  artTitle: "Choose the art direction and story", visualStyle: "Visual style", storyLabel: "The event story", storyPlaceholder: "Share what makes this event special…",
  reviewTitle: "Review the guest experience", reviewText: "The event remains a private preview. Publishing here completes setup without enabling payment.",
  guestInfo: "Useful guest information", guestPlaceholder: "Access, dress code, what to bring, or other instructions…", contactEmail: "Contact email",
  completeWizard: "Complete the wizard", completeText: "The preview will be marked ready. Guest access remains controlled by the trial or plan.",
  back: "Back", finishPreview: "Finish & preview", saveContinue: "Save & continue", autosave: "Changes are saved automatically.",
  restored: "Your latest changes were restored.", saving: "Saving…", saved: "Saved.",
  protected: "Changes are protected on this device and will save when you continue.",
  previewHelp: "See exactly how it adapts across mobile, tablet, and desktop.", openPreview: "Open preview", backWorkspace: "Back to workspace",
};

export const eventWizardCopy: Record<Locale, EventWizardCopy> = {
  en: wizardEnglish,
  el: {
    identityTitle: "Δώσε ταυτότητα στην εκδήλωση", identityText: "Το βασικό μήνυμα που θα δουν πρώτα οι καλεσμένοι.", headline: "Κεντρικός τίτλος",
    host: "Οικοδεσπότης ή ομάδα", introduction: "Σύντομη εισαγωγή", introductionPlaceholder: "Καλωσόρισε τους καλεσμένους…",
    flowTitle: "Οργάνωσε τη ροή της ημέρας", scheduleMoments: "Πρόγραμμα και σημαντικές στιγμές", schedulePlaceholder: "Ώρες, στάσεις, δραστηριότητες ή βασικές οδηγίες…",
    artTitle: "Διάλεξε κατεύθυνση και αφήγηση", visualStyle: "Οπτικό ύφος", storyLabel: "Η ιστορία της εκδήλωσης", storyPlaceholder: "Πες τι κάνει αυτή την εκδήλωση ξεχωριστή…",
    reviewTitle: "Έλεγξε την εμπειρία των καλεσμένων", reviewText: "Η εκδήλωση παραμένει ιδιωτική προεπισκόπηση. Η δημοσίευση ολοκληρώνει τη ρύθμιση χωρίς να ενεργοποιεί πληρωμή.",
    guestInfo: "Χρήσιμες πληροφορίες για καλεσμένους", guestPlaceholder: "Πρόσβαση, ενδυματολογικός κώδικας, τι να φέρουν ή άλλες οδηγίες…", contactEmail: "Email επικοινωνίας",
    completeWizard: "Ολοκλήρωση του οδηγού", completeText: "Η προεπισκόπηση θα σημειωθεί ως έτοιμη. Η πρόσβαση των καλεσμένων παραμένει ελεγχόμενη από τη δοκιμή ή το πακέτο.",
    back: "Πίσω", finishPreview: "Ολοκλήρωση & προεπισκόπηση", saveContinue: "Αποθήκευση & συνέχεια", autosave: "Οι αλλαγές αποθηκεύονται αυτόματα.",
    restored: "Επαναφέρθηκαν οι τελευταίες αλλαγές σου.", saving: "Αποθήκευση…", saved: "Αποθηκεύτηκε.",
    protected: "Οι αλλαγές προστατεύονται σε αυτή τη συσκευή και θα αποθηκευτούν όταν συνεχίσεις.",
    previewHelp: "Δες ακριβώς πώς προσαρμόζεται σε κινητό, tablet και υπολογιστή.", openPreview: "Άνοιγμα προεπισκόπησης", backWorkspace: "Πίσω στον χώρο εργασίας",
  },
  fr: {
    ...wizardEnglish, identityTitle: "Donnez une identité à l’événement", identityText: "Le message principal que les invités verront en premier.",
    headline: "Titre principal", host: "Hôte ou équipe", introduction: "Courte introduction", introductionPlaceholder: "Accueillez vos invités…",
    flowTitle: "Organisez le déroulement", scheduleMoments: "Programme et moments clés", schedulePlaceholder: "Horaires, étapes, activités ou consignes importantes…",
    artTitle: "Choisissez la direction artistique et le récit", visualStyle: "Style visuel", storyLabel: "L’histoire de l’événement", storyPlaceholder: "Racontez ce qui rend cet événement unique…",
    reviewTitle: "Vérifiez l’expérience des invités", reviewText: "L’événement reste un aperçu privé. La publication termine la configuration sans activer de paiement.",
    guestInfo: "Informations utiles aux invités", guestPlaceholder: "Accès, tenue, objets à apporter ou autres consignes…", contactEmail: "E-mail de contact",
    completeWizard: "Terminer l’assistant", completeText: "L’aperçu sera marqué comme prêt. L’accès des invités reste contrôlé par l’essai ou l’offre.",
    back: "Retour", finishPreview: "Terminer et prévisualiser", saveContinue: "Enregistrer et continuer", autosave: "Les modifications sont enregistrées automatiquement.",
    restored: "Vos dernières modifications ont été restaurées.", saving: "Enregistrement…", saved: "Enregistré.",
    protected: "Les modifications sont protégées sur cet appareil et seront enregistrées lorsque vous continuerez.",
    previewHelp: "Voyez exactement l’affichage sur mobile, tablette et ordinateur.", openPreview: "Ouvrir l’aperçu", backWorkspace: "Retour à l’espace",
  },
  de: {
    ...wizardEnglish, identityTitle: "Gib dem Event seine Identität", identityText: "Die wichtigste Botschaft, die Gäste zuerst sehen.",
    headline: "Hauptüberschrift", host: "Gastgeber oder Team", introduction: "Kurze Einführung", introductionPlaceholder: "Begrüße deine Gäste…",
    flowTitle: "Organisiere den Ablauf", scheduleMoments: "Ablauf und Schlüsselmomente", schedulePlaceholder: "Zeiten, Stationen, Aktivitäten oder wichtige Hinweise…",
    artTitle: "Wähle Stil und Geschichte", visualStyle: "Visueller Stil", storyLabel: "Die Eventgeschichte", storyPlaceholder: "Was macht dieses Event besonders?…",
    reviewTitle: "Prüfe das Gästeerlebnis", reviewText: "Das Event bleibt eine private Vorschau. Die Veröffentlichung schließt die Einrichtung ab, ohne eine Zahlung zu aktivieren.",
    guestInfo: "Nützliche Informationen für Gäste", guestPlaceholder: "Zugang, Dresscode, Mitbringsel oder andere Hinweise…", contactEmail: "Kontakt-E-Mail",
    completeWizard: "Assistent abschließen", completeText: "Die Vorschau wird als bereit markiert. Der Gästezugang bleibt durch Testphase oder Tarif gesteuert.",
    back: "Zurück", finishPreview: "Abschließen & Vorschau", saveContinue: "Speichern & weiter", autosave: "Änderungen werden automatisch gespeichert.",
    restored: "Deine letzten Änderungen wurden wiederhergestellt.", saving: "Wird gespeichert…", saved: "Gespeichert.",
    protected: "Änderungen sind auf diesem Gerät geschützt und werden beim Fortfahren gespeichert.",
    previewHelp: "Sieh genau, wie es sich an Mobilgerät, Tablet und Desktop anpasst.", openPreview: "Vorschau öffnen", backWorkspace: "Zurück zum Workspace",
  },
  es: {
    ...wizardEnglish, identityTitle: "Dale identidad al evento", identityText: "El mensaje principal que verán primero los invitados.",
    headline: "Título principal", host: "Anfitrión o equipo", introduction: "Introducción breve", introductionPlaceholder: "Da la bienvenida a tus invitados…",
    flowTitle: "Organiza el desarrollo del evento", scheduleMoments: "Programa y momentos clave", schedulePlaceholder: "Horarios, paradas, actividades o instrucciones importantes…",
    artTitle: "Elige la dirección artística y la historia", visualStyle: "Estilo visual", storyLabel: "La historia del evento", storyPlaceholder: "Cuenta qué hace especial este evento…",
    reviewTitle: "Revisa la experiencia de los invitados", reviewText: "El evento sigue siendo una vista previa privada. Publicarlo completa la configuración sin activar pagos.",
    guestInfo: "Información útil para invitados", guestPlaceholder: "Acceso, código de vestimenta, qué llevar u otras instrucciones…", contactEmail: "Email de contacto",
    completeWizard: "Completar el asistente", completeText: "La vista previa quedará marcada como lista. El acceso de invitados seguirá controlado por la prueba o el plan.",
    back: "Atrás", finishPreview: "Finalizar y previsualizar", saveContinue: "Guardar y continuar", autosave: "Los cambios se guardan automáticamente.",
    restored: "Se restauraron tus últimos cambios.", saving: "Guardando…", saved: "Guardado.",
    protected: "Los cambios están protegidos en este dispositivo y se guardarán cuando continúes.",
    previewHelp: "Comprueba cómo se adapta a móvil, tableta y ordenador.", openPreview: "Abrir vista previa", backWorkspace: "Volver al espacio",
  },
  it: {
    ...wizardEnglish, identityTitle: "Dai un’identità all’evento", identityText: "Il messaggio principale che gli ospiti vedranno per primo.",
    headline: "Titolo principale", host: "Organizzatore o team", introduction: "Breve introduzione", introductionPlaceholder: "Dai il benvenuto agli ospiti…",
    flowTitle: "Organizza lo svolgimento dell’evento", scheduleMoments: "Programma e momenti chiave", schedulePlaceholder: "Orari, tappe, attività o istruzioni importanti…",
    artTitle: "Scegli la direzione artistica e il racconto", visualStyle: "Stile visivo", storyLabel: "La storia dell’evento", storyPlaceholder: "Racconta cosa rende speciale questo evento…",
    reviewTitle: "Controlla l’esperienza degli ospiti", reviewText: "L’evento resta un’anteprima privata. La pubblicazione completa la configurazione senza attivare pagamenti.",
    guestInfo: "Informazioni utili per gli ospiti", guestPlaceholder: "Accesso, dress code, cosa portare o altre istruzioni…", contactEmail: "Email di contatto",
    completeWizard: "Completa la procedura", completeText: "L’anteprima sarà contrassegnata come pronta. L’accesso degli ospiti resta controllato dalla prova o dal piano.",
    back: "Indietro", finishPreview: "Termina e guarda l’anteprima", saveContinue: "Salva e continua", autosave: "Le modifiche vengono salvate automaticamente.",
    restored: "Le ultime modifiche sono state ripristinate.", saving: "Salvataggio…", saved: "Salvato.",
    protected: "Le modifiche sono protette su questo dispositivo e verranno salvate quando continuerai.",
    previewHelp: "Guarda esattamente come si adatta a mobile, tablet e computer.", openPreview: "Apri anteprima", backWorkspace: "Torna allo spazio",
  },
};
