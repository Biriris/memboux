import type { Locale } from "../i18n";

type HomeCopy = {
  title: string;
  description: string;
  language: string;
  navFeatures: string;
  navHow: string;
  navPrivacy: string;
  login: string;
  register: string;
  eyebrow: string;
  heroTitle: string;
  heroText: string;
  heroPrimary: string;
  heroSecondary: string;
  trust: string[];
  previewEyebrow: string;
  previewTitle: string;
  previewDate: string;
  previewUploads: string;
  previewShare: string;
  eventKinds: string;
  eventChips: string[];
  howEyebrow: string;
  howTitle: string;
  steps: Array<[string, string, string]>;
  featuresEyebrow: string;
  featuresTitle: string;
  features: Array<[string, string, string]>;
  privacyEyebrow: string;
  privacyTitle: string;
  privacyText: string;
  privacyPoints: string[];
  finalEyebrow: string;
  finalTitle: string;
  finalText: string;
  finalButton: string;
  footerText: string;
  terms: string;
  dataRequest: string;
};

export const additionalHomeCopy: Partial<Record<Locale, HomeCopy>> = {
  fr: {
    title: "Memboux – Galeries privées pour chaque événement",
    description: "Rassemblez les photos de tous dans une galerie privée. Partagez-la par lien ou QR code et conservez chaque moment au même endroit.",
    language: "Langue", navFeatures: "Fonctionnalités", navHow: "Comment ça marche", navPrivacy: "Confidentialité",
    login: "Se connecter", register: "Créer un compte", eyebrow: "Un espace privé pour chaque événement",
    heroTitle: "Rassemblez chaque moment. Gardez-le à vous.",
    heroText: "Créez un événement, partagez son lien ou son QR code et laissez chacun ajouter ses photos — sans application.",
    heroPrimary: "Créer votre galerie", heroSecondary: "J’ai déjà un compte",
    trust: ["Aucune application pour les invités", "Photos de tous", "Accès sous votre contrôle"],
    previewEyebrow: "Votre événement", previewTitle: "Été à Milos", previewDate: "15–22 juin 2026", previewUploads: "24 nouveaux moments", previewShare: "Partager la galerie",
    eventKinds: "Pour les moments qui méritent de rester ensemble", eventChips: ["Voyages", "Anniversaires", "Fêtes", "Famille", "Amis", "Communautés"],
    howEyebrow: "Simple dès le départ", howTitle: "De l’événement à la galerie partagée en trois étapes.",
    steps: [["01", "Créez votre événement", "Ajoutez un nom et des dates, puis choisissez qui peut publier."], ["02", "Partagez un lien ou un QR", "Les invités ouvrent la galerie directement sur leur téléphone."], ["03", "Rassemblez tout", "Les photos restent organisées chronologiquement au même endroit."]],
    featuresEyebrow: "Plus qu’un album partagé", featuresTitle: "Tout ce qu’il faut pour gérer les moments, pas les fichiers.",
    features: [["link", "Ajout facile pour les invités", "Ajouts multiples depuis n’importe quel téléphone par lien ou QR, sans installation."], ["gallery", "Galerie photo", "Une galerie claire, le balayage mobile, la sélection multiple et le téléchargement groupé."], ["users", "Collaboration par rôles", "Invitez proches ou collaborateurs avec le bon niveau d’accès."], ["shield", "Confidentialité et contrôle", "PIN facultatif, signalements, gestion des accès et demandes de confidentialité."], ["studio", "Memboux Studio", "Connectez un photographe professionnel et gardez l’album officiel avec les moments des invités."], ["restore", "Suppression récupérable", "Les médias supprimés restent 30 jours dans la corbeille avant leur suppression définitive."]],
    privacyEyebrow: "Privé dès la conception", privacyTitle: "Vos moments personnels ne sont pas du contenu.",
    privacyText: "Memboux est conçu pour un partage maîtrisé. Vous définissez l’événement, ses membres et les accès, avec signalements, corbeille et outils de confidentialité.",
    privacyPoints: ["Galeries privées", "PIN d’ajout facultatif", "Masquage immédiat des médias signalés", "Outils RGPD et de suppression"],
    finalEyebrow: "Votre prochain moment commence ici", finalTitle: "Créez votre première galerie d’événement.", finalText: "Un lieu pour tous. Chaque moment reste à vous.", finalButton: "Commencer",
    footerText: "Collection privée de photos pour chaque événement.", terms: "Conditions", dataRequest: "Demande de données",
  },
  de: {
    title: "Memboux – Private Galerien für jedes Event",
    description: "Sammle Fotos von allen in einer privaten Event-Galerie. Teile sie per Link oder QR-Code und bewahre jeden Moment gemeinsam auf.",
    language: "Sprache", navFeatures: "Funktionen", navHow: "So funktioniert’s", navPrivacy: "Datenschutz",
    login: "Anmelden", register: "Konto erstellen", eyebrow: "Ein privater Ort für jedes Event",
    heroTitle: "Sammle jeden Moment. Behalte ihn für dich.",
    heroText: "Erstelle ein Event, teile Link oder QR-Code und lass alle Fotos hinzufügen — ganz ohne App.",
    heroPrimary: "Galerie erstellen", heroSecondary: "Ich habe bereits ein Konto",
    trust: ["Keine App für Gäste nötig", "Fotos von allen", "Zugriff unter deiner Kontrolle"],
    previewEyebrow: "Dein Event", previewTitle: "Sommer auf Milos", previewDate: "15.–22. Juni 2026", previewUploads: "24 neue Momente", previewShare: "Galerie teilen",
    eventKinds: "Für Momente, die zusammengehören", eventChips: ["Reisen", "Geburtstage", "Partys", "Familie", "Freunde", "Gruppen"],
    howEyebrow: "Von Anfang an einfach", howTitle: "Vom Event zur gemeinsamen Galerie in drei Schritten.",
    steps: [["01", "Event erstellen", "Füge Name und Datum hinzu und lege fest, wer hochladen darf."], ["02", "Link oder QR teilen", "Gäste öffnen die Galerie direkt auf ihrem Smartphone."], ["03", "Alles gemeinsam sammeln", "Fotos bleiben chronologisch an einem Ort organisiert."]],
    featuresEyebrow: "Mehr als ein geteiltes Album", featuresTitle: "Alles, um Momente statt Dateien zu verwalten.",
    features: [["link", "Einfacher Gäste-Upload", "Mehrere Uploads von jedem Smartphone per Link oder QR, ohne Installation."], ["gallery", "Fotogalerie", "Klare Ansicht, mobiles Wischen, Mehrfachauswahl und Sammeldownloads."], ["users", "Zusammenarbeit mit Rollen", "Lade Familie, Freunde oder Partner mit der passenden Zugriffsstufe ein."], ["shield", "Privatsphäre und Kontrolle", "Optionale PINs, Meldungen, Zugriffsverwaltung und Datenschutzanfragen."], ["studio", "Memboux Studio", "Verbinde einen professionellen Fotografen und bewahre das offizielle Album neben den Gästemomenten auf."], ["restore", "Wiederherstellbares Löschen", "Gelöschte Medien bleiben 30 Tage im Papierkorb, bevor sie endgültig entfernt werden."]],
    privacyEyebrow: "Von Grund auf privat", privacyTitle: "Deine persönlichen Momente sind kein Content.",
    privacyText: "Memboux ist für kontrolliertes Teilen gemacht. Du bestimmst Event, Mitglieder und Zugriff und erhältst Werkzeuge für Meldungen, Papierkorb und Datenschutz.",
    privacyPoints: ["Private Event-Galerien", "Optionale Upload-PIN", "Sofortiges Ausblenden gemeldeter Medien", "DSGVO- und Löschwerkzeuge"],
    finalEyebrow: "Dein nächster Moment beginnt hier", finalTitle: "Erstelle deine erste Event-Galerie.", finalText: "Ein Ort für alle. Jeder Moment bleibt deiner.", finalButton: "Jetzt starten",
    footerText: "Private Fotosammlung für jedes Event.", terms: "Bedingungen", dataRequest: "Datenanfrage",
  },
  es: {
    title: "Memboux – Galerías privadas para cada evento",
    description: "Reúne las fotos de todos en una galería privada. Compártela por enlace o QR y conserva cada momento en un solo lugar.",
    language: "Idioma", navFeatures: "Funciones", navHow: "Cómo funciona", navPrivacy: "Privacidad",
    login: "Iniciar sesión", register: "Crear cuenta", eyebrow: "Un espacio privado para cada evento",
    heroTitle: "Reúne cada momento. Hazlo tuyo.",
    heroText: "Crea un evento, comparte su enlace o QR y deja que todos añadan fotos — sin instalar una app.",
    heroPrimary: "Crear tu galería", heroSecondary: "Ya tengo una cuenta",
    trust: ["Sin app para los invitados", "Fotos de todos", "Acceso bajo tu control"],
    previewEyebrow: "Tu evento", previewTitle: "Verano en Milos", previewDate: "15–22 de junio de 2026", previewUploads: "24 momentos nuevos", previewShare: "Compartir galería",
    eventKinds: "Para los momentos que merecen seguir juntos", eventChips: ["Viajes", "Cumpleaños", "Fiestas", "Familia", "Amigos", "Comunidades"],
    howEyebrow: "Sencillo desde el principio", howTitle: "Del evento a la galería compartida en tres pasos.",
    steps: [["01", "Crea tu evento", "Añade un nombre y fechas, y decide quién puede subir contenido."], ["02", "Comparte un enlace o QR", "Los invitados abren la galería directamente desde su móvil."], ["03", "Reunidlo todo", "Las fotos quedan ordenadas cronológicamente en un solo lugar."]],
    featuresEyebrow: "Más que un álbum compartido", featuresTitle: "Todo lo necesario para gestionar momentos, no archivos.",
    features: [["link", "Subidas fáciles para invitados", "Subidas múltiples desde cualquier móvil mediante enlace o QR, sin instalaciones."], ["gallery", "Galería de fotos", "Visor limpio, deslizamiento móvil, selección múltiple y descargas en lote."], ["users", "Colaboración por roles", "Invita a amigos, familiares o colaboradores con el nivel de acceso adecuado."], ["shield", "Privacidad y control", "PIN opcional, reportes, gestión de accesos y solicitudes de privacidad."], ["studio", "Memboux Studio", "Conecta a un fotógrafo profesional y guarda el álbum oficial junto a los momentos de los invitados."], ["restore", "Eliminación recuperable", "El contenido eliminado permanece 30 días en la papelera antes de borrarse definitivamente."]],
    privacyEyebrow: "Privado desde el diseño", privacyTitle: "Tus momentos personales no son contenido.",
    privacyText: "Memboux está diseñado para compartir con control. Tú defines el evento, sus miembros y el acceso, con reportes, papelera y herramientas de privacidad.",
    privacyPoints: ["Galerías privadas", "PIN de subida opcional", "Ocultación inmediata de contenido reportado", "Herramientas RGPD y de eliminación"],
    finalEyebrow: "Tu próximo momento empieza aquí", finalTitle: "Crea tu primera galería de evento.", finalText: "Un lugar para todos. Cada momento es tuyo.", finalButton: "Empezar ahora",
    footerText: "Colección privada de fotos para cada evento.", terms: "Términos", dataRequest: "Solicitud de datos",
  },
  it: {
    title: "Memboux – Gallerie private per ogni evento",
    description: "Raccogli le foto di tutti in una galleria privata. Condividila tramite link o QR e conserva ogni momento nello stesso posto.",
    language: "Lingua", navFeatures: "Funzionalità", navHow: "Come funziona", navPrivacy: "Privacy",
    login: "Accedi", register: "Crea account", eyebrow: "Uno spazio privato per ogni evento",
    heroTitle: "Raccogli ogni momento. Tienilo per te.",
    heroText: "Crea un evento, condividi il link o il QR e lascia che tutti aggiungano foto — senza installare un’app.",
    heroPrimary: "Crea la tua galleria", heroSecondary: "Ho già un account",
    trust: ["Nessuna app per gli invitati", "Foto di tutti", "Accesso sotto il tuo controllo"],
    previewEyebrow: "Il tuo evento", previewTitle: "Estate a Milo", previewDate: "15–22 giugno 2026", previewUploads: "24 nuovi momenti", previewShare: "Condividi galleria",
    eventKinds: "Per i momenti che meritano di restare insieme", eventChips: ["Viaggi", "Compleanni", "Feste", "Famiglia", "Amici", "Community"],
    howEyebrow: "Semplice fin dall’inizio", howTitle: "Dall’evento alla galleria condivisa in tre passaggi.",
    steps: [["01", "Crea il tuo evento", "Aggiungi nome e date, poi scegli chi può caricare."], ["02", "Condividi link o QR", "Gli invitati aprono la galleria direttamente dal telefono."], ["03", "Raccogliete tutto insieme", "Le foto restano organizzate cronologicamente in un unico posto."]],
    featuresEyebrow: "Più di un album condiviso", featuresTitle: "Tutto ciò che serve per gestire i momenti, non i file.",
    features: [["link", "Upload semplice per gli invitati", "Upload multipli da qualsiasi telefono tramite link o QR, senza installazioni."], ["gallery", "Galleria fotografica", "Visualizzazione pulita, swipe mobile, selezione multipla e download di gruppo."], ["users", "Collaborazione con ruoli", "Invita amici, familiari o collaboratori con il livello di accesso corretto."], ["shield", "Privacy e controllo", "PIN opzionali, segnalazioni, gestione accessi e richieste privacy."], ["studio", "Memboux Studio", "Collega un fotografo professionista e conserva l’album ufficiale accanto ai momenti degli invitati."], ["restore", "Eliminazione recuperabile", "I media eliminati restano nel cestino per 30 giorni prima della rimozione definitiva."]],
    privacyEyebrow: "Privato fin dalla progettazione", privacyTitle: "I tuoi momenti personali non sono contenuti.",
    privacyText: "Memboux è pensato per una condivisione controllata. Definisci evento, membri e accesso, con strumenti per segnalazioni, cestino e gestione della privacy.",
    privacyPoints: ["Gallerie private", "PIN di upload opzionale", "Occultamento immediato dei media segnalati", "Strumenti GDPR e di eliminazione"],
    finalEyebrow: "Il tuo prossimo momento inizia qui", finalTitle: "Crea la tua prima galleria evento.", finalText: "Un posto per tutti. Ogni momento è tuo.", finalButton: "Inizia ora",
    footerText: "Raccolta privata di foto per ogni evento.", terms: "Termini", dataRequest: "Richiesta dati",
  },
};
