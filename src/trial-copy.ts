import type { Locale } from "./i18n";

type TrialCopy = {
  eventNotFound: string;
  confirmationRequired: string;
  capacityError: (limit: number) => string;
  back: string;
  title: string;
  intro: string;
  actionRequired: string;
  capacityWarning: (used: number, limit: number, excess: number) => string;
  checkDates: string;
  dateWarning: string;
  startsToday: string;
  noRestart: string;
  mediaUsage: string;
  mediaCountTogether: string;
  confirmation: (days: number, limit: number) => string;
  activate: string;
  unlocks: string;
  guestLink: string;
  uploads: string;
  liveGallery: string;
  ownerExperience: string;
  noOriginals: string;
  futurePlans: string;
  pageTitle: string;
};

export const trialCopy: Record<Locale, TrialCopy> = {
  en: {
    eventNotFound: "Event not found.", confirmationRequired: "Trial activation confirmation is required.",
    capacityError: (limit) => `The trial supports up to ${limit} media files. Remove extra files before activation.`,
    back: "Back to event", title: "Open the event to your guests",
    intro: "Your private preview has no timer. The 14-day period starts only after you confirm below.",
    actionRequired: "Action required",
    capacityWarning: (used, limit, excess) => `This event has ${used} media files. The trial allows ${limit}. Remove ${excess} files before continuing.`,
    checkDates: "Check the dates", dateWarning: "The trial will end before the event date. Start it closer to the event or choose a plan when payments become available.",
    startsToday: "If started today", noRestart: "The clock cannot be paused or restarted.",
    mediaUsage: "Upload slots used", mediaCountTogether: "Photos and videos count together. Deleting a file does not return its trial slot.",
    confirmation: (days, limit) => `I understand that the trial lasts ${days} days, includes ${limit} lifetime upload slots even if files are later deleted, and does not include original downloads.`,
    activate: "Confirm and start trial", unlocks: "What becomes available", guestLink: "Guest link and QR code",
    uploads: "Photo and video uploads", liveGallery: "Live gallery and slideshow", ownerExperience: "Complete owner experience",
    noOriginals: "No original downloads", futurePlans: "View future packages", pageTitle: "Start trial",
  },
  el: {
    eventNotFound: "Το event δεν βρέθηκε.", confirmationRequired: "Απαιτείται επιβεβαίωση ενεργοποίησης.",
    capacityError: (limit) => `Η δοκιμή υποστηρίζει έως ${limit} αρχεία. Αφαίρεσε επιπλέον αρχεία πριν την ενεργοποίηση.`,
    back: "Πίσω στο event", title: "Άνοιξε το event στους καλεσμένους",
    intro: "Το ιδιωτικό preview σου δεν έχει χρονόμετρο. Η περίοδος των 14 ημερών ξεκινά μόνο αφού επιβεβαιώσεις παρακάτω.",
    actionRequired: "Χρειάζεται ενέργεια",
    capacityWarning: (used, limit, excess) => `Το event έχει ${used} αρχεία. Η δοκιμή επιτρέπει έως ${limit}. Διέγραψε ή μετέφερε ${excess} αρχεία πριν συνεχίσεις.`,
    checkDates: "Έλεγξε τις ημερομηνίες", dateWarning: "Η δοκιμή θα λήξει πριν από την ημερομηνία του event. Ξεκίνησέ την πιο κοντά στην εκδήλωση ή επίλεξε πακέτο όταν ενεργοποιηθούν οι πληρωμές.",
    startsToday: "Αν ξεκινήσεις σήμερα", noRestart: "Δεν γίνεται παύση ή επανεκκίνηση.",
    mediaUsage: "Θέσεις upload που χρησιμοποιήθηκαν", mediaCountTogether: "Φωτογραφίες και βίντεο μετρούν μαζί. Η διαγραφή αρχείου δεν επιστρέφει τη θέση του trial.",
    confirmation: (days, limit) => `Καταλαβαίνω ότι η δοκιμή διαρκεί ${days} ημέρες, περιλαμβάνει ${limit} συνολικές θέσεις upload ακόμη κι αν διαγραφούν αρχεία και δεν περιλαμβάνει λήψεις πρωτοτύπων.`,
    activate: "Επιβεβαίωση και έναρξη trial", unlocks: "Τι ξεκλειδώνει", guestLink: "Guest link και QR code",
    uploads: "Uploads φωτογραφιών και βίντεο", liveGallery: "Live gallery και slideshow", ownerExperience: "Πλήρης προβολή για τον ιδιοκτήτη",
    noOriginals: "Χωρίς λήψεις πρωτοτύπων", futurePlans: "Δες τα μελλοντικά πακέτα", pageTitle: "Έναρξη δοκιμής",
  },
  fr: {
    eventNotFound: "Événement introuvable.", confirmationRequired: "La confirmation d’activation de l’essai est requise.",
    capacityError: (limit) => `L’essai accepte jusqu’à ${limit} fichiers. Supprimez les fichiers supplémentaires avant l’activation.`,
    back: "Retour à l’événement", title: "Ouvrez l’événement à vos invités",
    intro: "Votre aperçu privé n’a pas de minuteur. La période de 14 jours commence uniquement après votre confirmation.",
    actionRequired: "Action requise",
    capacityWarning: (used, limit, excess) => `Cet événement contient ${used} fichiers. L’essai en autorise ${limit}. Supprimez ${excess} fichiers avant de continuer.`,
    checkDates: "Vérifiez les dates", dateWarning: "L’essai se terminera avant la date de l’événement. Démarrez-le plus près de l’événement ou choisissez une offre lorsque les paiements seront disponibles.",
    startsToday: "En commençant aujourd’hui", noRestart: "Le délai ne peut être ni suspendu ni redémarré.",
    mediaUsage: "Emplacements utilisés", mediaCountTogether: "Photos et vidéos sont comptées ensemble. Supprimer un fichier ne rend pas son emplacement d’essai.",
    confirmation: (days, limit) => `Je comprends que l’essai dure ${days} jours, inclut ${limit} emplacements d’ajout au total même si des fichiers sont supprimés et n’inclut pas le téléchargement des originaux.`,
    activate: "Confirmer et démarrer l’essai", unlocks: "Ce qui devient disponible", guestLink: "Lien invité et code QR",
    uploads: "Ajout de photos et vidéos", liveGallery: "Galerie en direct et diaporama", ownerExperience: "Expérience complète du propriétaire",
    noOriginals: "Sans téléchargement des originaux", futurePlans: "Voir les futures offres", pageTitle: "Démarrer l’essai",
  },
  de: {
    eventNotFound: "Event nicht gefunden.", confirmationRequired: "Die Bestätigung zur Aktivierung der Testphase ist erforderlich.",
    capacityError: (limit) => `Die Testphase unterstützt bis zu ${limit} Dateien. Entferne zusätzliche Dateien vor der Aktivierung.`,
    back: "Zurück zum Event", title: "Öffne das Event für deine Gäste",
    intro: "Deine private Vorschau hat keinen Timer. Die 14 Tage beginnen erst nach deiner Bestätigung.",
    actionRequired: "Aktion erforderlich",
    capacityWarning: (used, limit, excess) => `Dieses Event enthält ${used} Dateien. Die Testphase erlaubt ${limit}. Entferne ${excess} Dateien, bevor du fortfährst.`,
    checkDates: "Termine prüfen", dateWarning: "Die Testphase endet vor dem Eventdatum. Starte sie näher am Event oder wähle ein Paket, sobald Zahlungen verfügbar sind.",
    startsToday: "Bei Start heute", noRestart: "Die Laufzeit kann nicht pausiert oder neu gestartet werden.",
    mediaUsage: "Verwendete Upload-Plätze", mediaCountTogether: "Fotos und Videos zählen zusammen. Das Löschen gibt keinen Testplatz zurück.",
    confirmation: (days, limit) => `Ich verstehe, dass die Testphase ${days} Tage dauert, insgesamt ${limit} Upload-Plätze auch bei später gelöschten Dateien umfasst und keine Originaldownloads enthält.`,
    activate: "Bestätigen und Testphase starten", unlocks: "Was verfügbar wird", guestLink: "Gästelink und QR-Code",
    uploads: "Foto- und Video-Uploads", liveGallery: "Live-Galerie und Diashow", ownerExperience: "Vollständige Eigentümeransicht",
    noOriginals: "Keine Originaldownloads", futurePlans: "Zukünftige Pakete ansehen", pageTitle: "Testphase starten",
  },
  es: {
    eventNotFound: "Evento no encontrado.", confirmationRequired: "Debes confirmar la activación de la prueba.",
    capacityError: (limit) => `La prueba admite hasta ${limit} archivos. Elimina los archivos adicionales antes de activarla.`,
    back: "Volver al evento", title: "Abre el evento a tus invitados",
    intro: "Tu vista previa privada no tiene temporizador. El periodo de 14 días empieza solo cuando lo confirmes.",
    actionRequired: "Acción necesaria",
    capacityWarning: (used, limit, excess) => `Este evento tiene ${used} archivos. La prueba permite ${limit}. Elimina ${excess} archivos antes de continuar.`,
    checkDates: "Revisa las fechas", dateWarning: "La prueba terminará antes de la fecha del evento. Iníciala más cerca del evento o elige un plan cuando estén disponibles los pagos.",
    startsToday: "Si empieza hoy", noRestart: "El periodo no se puede pausar ni reiniciar.",
    mediaUsage: "Espacios de subida usados", mediaCountTogether: "Fotos y vídeos cuentan juntos. Eliminar un archivo no devuelve su espacio de prueba.",
    confirmation: (days, limit) => `Entiendo que la prueba dura ${days} días, incluye ${limit} espacios de subida totales aunque se eliminen archivos y no incluye descargas de originales.`,
    activate: "Confirmar e iniciar la prueba", unlocks: "Qué estará disponible", guestLink: "Enlace para invitados y código QR",
    uploads: "Subidas de fotos y vídeos", liveGallery: "Galería en directo y presentación", ownerExperience: "Experiencia completa del propietario",
    noOriginals: "Sin descargas de originales", futurePlans: "Ver futuros planes", pageTitle: "Iniciar prueba",
  },
  it: {
    eventNotFound: "Evento non trovato.", confirmationRequired: "È richiesta la conferma per attivare la prova.",
    capacityError: (limit) => `La prova supporta fino a ${limit} file. Rimuovi i file aggiuntivi prima dell’attivazione.`,
    back: "Torna all’evento", title: "Apri l’evento ai tuoi invitati",
    intro: "La tua anteprima privata non ha un timer. Il periodo di 14 giorni inizia solo dopo la conferma.",
    actionRequired: "Azione necessaria",
    capacityWarning: (used, limit, excess) => `Questo evento contiene ${used} file. La prova ne consente ${limit}. Rimuovi ${excess} file prima di continuare.`,
    checkDates: "Controlla le date", dateWarning: "La prova terminerà prima della data dell’evento. Avviala più vicino all’evento o scegli un piano quando i pagamenti saranno disponibili.",
    startsToday: "Se iniziata oggi", noRestart: "Il periodo non può essere sospeso o riavviato.",
    mediaUsage: "Spazi di upload usati", mediaCountTogether: "Foto e video contano insieme. Eliminare un file non restituisce lo spazio di prova.",
    confirmation: (days, limit) => `Comprendo che la prova dura ${days} giorni, include ${limit} spazi di upload totali anche se i file vengono eliminati e non include il download degli originali.`,
    activate: "Conferma e avvia la prova", unlocks: "Cosa diventa disponibile", guestLink: "Link per gli invitati e codice QR",
    uploads: "Caricamento di foto e video", liveGallery: "Galleria live e slideshow", ownerExperience: "Esperienza completa del proprietario",
    noOriginals: "Nessun download degli originali", futurePlans: "Vedi i piani futuri", pageTitle: "Avvia la prova",
  },
};
