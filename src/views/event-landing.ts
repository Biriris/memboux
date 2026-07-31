import type { Locale } from "../i18n";
import { esc } from "../utils";
import { brandMark, page } from "./shared";

type LandingCopy = {
  title: string;
  description: string;
  eyebrow: string;
  headline: string;
  lead: string;
  primary: string;
  secondary: string;
  proof: string[];
};

const weddingCopy: Record<Locale, LandingCopy> = {
  el: {
    title: "Wedding Website & Ιδιωτικό Gallery | Memboux",
    description: "Δημιούργησε το wedding website, τις προσκλήσεις, το RSVP, το guestbook και το ιδιωτικό photo gallery του γάμου σου σε ένα μέρος.",
    eyebrow: "Η κοινή μνήμη του γάμου σας",
    headline: "Ο γάμος σας μέσα από τα μάτια όλων όσοι ήταν εκεί.",
    lead: "Μοιραστείτε πρόγραμμα και τοποθεσίες και συγκεντρώστε RSVP, ευχές, φωτογραφίες και βίντεο από κάθε καλεσμένο — με ένα link ή QR.",
    primary: "Δημιούργησε δωρεάν",
    secondary: "Δες πώς λειτουργεί",
    proof: ["Ιδιωτικό preview", "Χωρίς κάρτα", "Έτοιμο για κινητό"],
  },
  en: {
    title: "Wedding Website & Private Gallery | Memboux",
    description: "Create your wedding website, invitations, RSVP, guestbook, and private photo gallery in one beautifully organized place.",
    eyebrow: "The shared memory of your wedding",
    headline: "Your wedding through the eyes of everyone who was there.",
    lead: "Share schedules and venues, then collect RSVPs, wishes, photos, and videos from every guest through one link or QR code.",
    primary: "Create for free",
    secondary: "See how it works",
    proof: ["Private preview", "No card required", "Mobile ready"],
  },
  fr: {
    title: "Site de mariage & galerie privée | Memboux",
    description: "Créez votre site de mariage, gérez les RSVP et rassemblez les photos et vidéos de tous vos invités dans une galerie privée.",
    eyebrow: "La mémoire partagée de votre mariage",
    headline: "Votre mariage à travers les yeux de tous ceux qui y étaient.",
    lead: "Partagez le programme et les lieux, recueillez les RSVP, les vœux, les photos et les vidéos avec un seul lien ou QR code.",
    primary: "Créer gratuitement",
    secondary: "Voir comment ça marche",
    proof: ["Aperçu privé", "Aucune carte requise", "Adapté au mobile"],
  },
  de: {
    title: "Hochzeitswebsite & private Galerie | Memboux",
    description: "Erstellt eure Hochzeitswebsite, verwaltet Zusagen und sammelt Fotos und Videos aller Gäste in einer privaten Galerie.",
    eyebrow: "Die gemeinsame Erinnerung an eure Hochzeit",
    headline: "Eure Hochzeit durch die Augen aller, die dabei waren.",
    lead: "Teilt Ablauf und Orte und sammelt Zusagen, Wünsche, Fotos und Videos über einen einzigen Link oder QR-Code.",
    primary: "Kostenlos erstellen",
    secondary: "So funktioniert es",
    proof: ["Private Vorschau", "Keine Karte erforderlich", "Für Mobilgeräte optimiert"],
  },
  es: {
    title: "Web de boda y galería privada | Memboux",
    description: "Crea la web de tu boda, gestiona las confirmaciones y reúne las fotos y vídeos de todos los invitados en una galería privada.",
    eyebrow: "La memoria compartida de vuestra boda",
    headline: "Vuestra boda desde la mirada de todos los que estuvieron allí.",
    lead: "Comparte el programa y los lugares, y reúne confirmaciones, mensajes, fotos y vídeos con un solo enlace o código QR.",
    primary: "Crear gratis",
    secondary: "Ver cómo funciona",
    proof: ["Vista previa privada", "Sin tarjeta", "Diseñado para móvil"],
  },
  it: {
    title: "Sito matrimonio e galleria privata | Memboux",
    description: "Crea il sito del matrimonio, gestisci le conferme e raccogli foto e video di tutti gli invitati in una galleria privata.",
    eyebrow: "Il ricordo condiviso del vostro matrimonio",
    headline: "Il vostro matrimonio attraverso gli occhi di tutti.",
    lead: "Condividete programma e luoghi e raccogliete conferme, messaggi, foto e video con un solo link o codice QR.",
    primary: "Crea gratis",
    secondary: "Scopri come funziona",
    proof: ["Anteprima privata", "Nessuna carta richiesta", "Ottimizzato per mobile"],
  },
};

const featureIcon = (symbol: string) => `<span aria-hidden="true" class="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e8f2ee] text-xl text-[#6d28d9]">${symbol}</span>`;

export function weddingLandingPage(locale: Locale) {
  const copy = weddingCopy[locale];
  const el = locale === "el";
  const l = (values: Record<Locale, string>) => values[locale];
  const registerUrl = `/${locale}/register?redirect=${encodeURIComponent(`/${locale}/account?create=wedding`)}`;
  const loginUrl = `/${locale}/login`;
  const canonical = `https://memboux.com/${locale}/wedding`;
  const alternates = Object.fromEntries((["el", "en", "fr", "de", "es", "it"] as Locale[]).map((item) => [item, `https://memboux.com/${item}/wedding`]));
  const features = [
    ["✦", "Wedding website", l({ el: "Ιστορία, πρόγραμμα, τοποθεσίες και όλες οι πληροφορίες σε μία κομψή σελίδα.", en: "Story, schedule, venues, and useful details in one elegant page.", fr: "Histoire, programme, lieux et informations utiles sur une page élégante.", de: "Geschichte, Ablauf, Orte und alle wichtigen Informationen auf einer eleganten Seite.", es: "Historia, programa, lugares e información útil en una página elegante.", it: "Storia, programma, luoghi e informazioni utili in una pagina elegante." })],
    ["✓", "RSVP & Guestbook", l({ el: "Απαντήσεις, συνοδοί, ευχές και μηνύματα χωρίς ατελείωτα chats.", en: "Attendance, plus-ones, wishes, and messages without endless chats.", fr: "Présences, accompagnants, vœux et messages sans discussions interminables.", de: "Zusagen, Begleitungen, Wünsche und Nachrichten ohne endlose Chats.", es: "Asistencia, acompañantes, deseos y mensajes sin chats interminables.", it: "Presenze, accompagnatori, auguri e messaggi senza chat infinite." })],
    ["▧", l({ el: "Ιδιωτικό photo gallery", en: "Private photo gallery", fr: "Galerie photo privée", de: "Private Fotogalerie", es: "Galería privada", it: "Galleria privata" }), l({ el: "Οι καλεσμένοι ανεβάζουν φωτογραφίες και βίντεο από κινητό, χωρίς εφαρμογή.", en: "Guests upload photos and videos from mobile without installing an app.", fr: "Les invités ajoutent photos et vidéos depuis leur téléphone, sans application.", de: "Gäste laden Fotos und Videos mobil hoch – ohne App.", es: "Los invitados suben fotos y vídeos desde el móvil, sin instalar una app.", it: "Gli invitati caricano foto e video dal telefono, senza installare un’app." })],
    ["▦", l({ el: "Προσκλήσεις & QR", en: "Invitations & QR", fr: "Invitations & QR", de: "Einladungen & QR", es: "Invitaciones y QR", it: "Inviti e QR" }), l({ el: "Ένα link και έτοιμα QR για πρόσκληση, τραπέζια και χώρο δεξίωσης.", en: "One link and ready QR codes for invitations, tables, and the venue.", fr: "Un lien et des QR codes prêts pour les invitations, les tables et le lieu.", de: "Ein Link und fertige QR-Codes für Einladungen, Tische und Location.", es: "Un enlace y códigos QR listos para invitaciones, mesas y lugar.", it: "Un link e codici QR pronti per inviti, tavoli e location." })],
    ["▶", "Live slideshow", l({ el: "Νέες φωτογραφίες προβάλλονται ζωντανά κατά τη διάρκεια της δεξίωσης.", en: "Display new guest photos live during the reception.", fr: "Affichez en direct les nouvelles photos pendant la réception.", de: "Zeigt neue Gästefotos während der Feier live.", es: "Muestra en directo las nuevas fotos durante la celebración.", it: "Mostra dal vivo le nuove foto durante il ricevimento." })],
    ["◎", l({ el: "Ομάδα γάμου", en: "Wedding team", fr: "Équipe du mariage", de: "Hochzeitsteam", es: "Equipo de boda", it: "Team del matrimonio" }), l({ el: "Σωστοί ρόλοι για σύντροφο, planner και επαγγελματία φωτογράφο.", en: "The right access for your partner, planner, and photographer.", fr: "Les bons accès pour votre partenaire, wedding planner et photographe.", de: "Passende Zugriffe für Partner, Planer und Fotografen.", es: "El acceso adecuado para pareja, wedding planner y fotógrafo.", it: "Gli accessi giusti per partner, wedding planner e fotografo." })],
  ];
  const steps = [
    [l({ el: "Δημιουργήστε", en: "Create", fr: "Créez", de: "Erstellen", es: "Crea", it: "Crea" }), l({ el: "Επιλέξτε design και συμπληρώστε τα στοιχεία μέσα από τον καθοδηγούμενο wizard.", en: "Choose a design and add wedding details through the guided wizard.", fr: "Choisissez un design et ajoutez les informations grâce à l’assistant guidé.", de: "Wählt ein Design und ergänzt die Hochzeitsdetails im geführten Assistenten.", es: "Elige un diseño y añade los detalles con el asistente guiado.", it: "Scegli un design e aggiungi i dettagli con la procedura guidata." })],
    [l({ el: "Δείτε το πριν δημοσιευτεί", en: "Preview before publishing", fr: "Prévisualisez avant de publier", de: "Vor dem Veröffentlichen ansehen", es: "Previsualiza antes de publicar", it: "Anteprima prima di pubblicare" }), l({ el: "Ελέγξτε την εμπειρία σε mobile, tablet και desktop μέσα από ιδιωτικό preview.", en: "Review the full experience on mobile, tablet, and desktop through a private preview.", fr: "Vérifiez toute l’expérience sur mobile, tablette et ordinateur dans un aperçu privé.", de: "Prüft die gesamte Erfahrung mobil, auf Tablet und Desktop in einer privaten Vorschau.", es: "Revisa toda la experiencia en móvil, tablet y ordenador mediante una vista privada.", it: "Controlla l’esperienza su mobile, tablet e desktop con un’anteprima privata." })],
    [l({ el: "Μοιραστείτε", en: "Share", fr: "Partagez", de: "Teilen", es: "Comparte", it: "Condividi" }), l({ el: "Όταν είστε έτοιμοι, χρησιμοποιήστε το guest link ή τα QR για τους καλεσμένους.", en: "When ready, use the guest link or QR codes to invite everyone.", fr: "Quand tout est prêt, partagez le lien invité ou les QR codes.", de: "Wenn alles bereit ist, teilt den Gästelink oder die QR-Codes.", es: "Cuando esté listo, comparte el enlace para invitados o los códigos QR.", it: "Quando è tutto pronto, condividi il link invitati o i codici QR." })],
  ];
  const faqs = [
    [l({ el: "Μπορώ να το δοκιμάσω πριν πληρώσω;", en: "Can I try it before paying?", fr: "Puis-je essayer avant de payer ?", de: "Kann ich es vor dem Bezahlen testen?", es: "¿Puedo probarlo antes de pagar?", it: "Posso provarlo prima di pagare?" }), l({ el: "Ναι. Δημιουργείτε το event και βλέπετε το πλήρες ιδιωτικό preview χωρίς κάρτα. Οι πληρωμές δεν είναι ακόμη ενεργές.", en: "Yes. Build the event and inspect the full private preview without a card. Payments are not active yet.", fr: "Oui. Créez l’événement et consultez l’aperçu privé complet sans carte. Les paiements ne sont pas encore actifs.", de: "Ja. Erstellt das Event und prüft die vollständige private Vorschau ohne Karte. Zahlungen sind noch nicht aktiv.", es: "Sí. Crea el evento y revisa la vista privada completa sin tarjeta. Los pagos aún no están activos.", it: "Sì. Crea l’evento e controlla l’anteprima privata completa senza carta. I pagamenti non sono ancora attivi." })],
    [l({ el: "Χρειάζονται εφαρμογή οι καλεσμένοι;", en: "Do guests need an app?", fr: "Les invités ont-ils besoin d’une application ?", de: "Brauchen Gäste eine App?", es: "¿Los invitados necesitan una app?", it: "Gli invitati hanno bisogno di un’app?" }), l({ el: "Όχι. Ανοίγουν το ασφαλές link ή σκανάρουν το QR από σύγχρονο browser.", en: "No. They open the secure link or scan the QR in any modern browser.", fr: "Non. Ils ouvrent le lien sécurisé ou scannent le QR dans leur navigateur.", de: "Nein. Sie öffnen den sicheren Link oder scannen den QR-Code im Browser.", es: "No. Abren el enlace seguro o escanean el QR desde el navegador.", it: "No. Aprono il link sicuro o scansionano il QR dal browser." })],
    [l({ el: "Μπορώ να προστατεύσω το event;", en: "Can I protect the event?", fr: "Puis-je protéger l’événement ?", de: "Kann ich das Event schützen?", es: "¿Puedo proteger el evento?", it: "Posso proteggere l’evento?" }), l({ el: "Ναι. Ενεργοποιήστε PIN και ελέγξτε ποιοι συμμετέχουν στη διαχείριση.", en: "Yes. Enable a PIN and control who can help manage the event.", fr: "Oui. Activez un code PIN et contrôlez les personnes qui peuvent gérer l’événement.", de: "Ja. Aktiviert eine PIN und bestimmt, wer das Event verwalten darf.", es: "Sí. Activa un PIN y controla quién puede ayudar a gestionar el evento.", it: "Sì. Attiva un PIN e controlla chi può gestire l’evento." })],
  ];
  const body = `<header class="sticky top-0 z-50 border-b border-[#e7e0f0]/80 bg-[#f7faf8]/90 backdrop-blur-xl"><div class="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">${brandMark(`/${locale}`, true)}<nav class="hidden items-center gap-6 text-sm font-semibold text-[#746a80] md:flex"><a href="#features">${l({ el: "Λειτουργίες", en: "Features", fr: "Fonctions", de: "Funktionen", es: "Funciones", it: "Funzioni" })}</a><a href="#how">${copy.secondary}</a><a href="#faq">FAQ</a></nav><div class="flex items-center gap-2"><a href="${loginUrl}" class="hidden rounded-xl px-4 py-2.5 text-sm font-semibold text-[#6d28d9] sm:inline-flex">${l({ el: "Σύνδεση", en: "Sign in", fr: "Connexion", de: "Anmelden", es: "Iniciar sesión", it: "Accedi" })}</a><a href="${registerUrl}" class="rounded-xl bg-[#2b174d] px-4 py-2.5 text-sm font-semibold text-white">${copy.primary}</a></div></div></header>
  <main>
    <section class="relative overflow-hidden bg-[#f8f5ff]"><div class="absolute -right-24 top-8 h-80 w-80 rounded-full bg-[#cfe1da]/55 blur-3xl"></div><div class="mx-auto grid min-h-[78vh] max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.02fr_.98fr] lg:py-24"><div class="relative z-10"><p class="text-xs font-bold uppercase tracking-[.2em] text-[#7c3aed]">${copy.eyebrow}</p><h1 class="mt-5 max-w-3xl text-5xl leading-[.98] tracking-[-.045em] text-[#2b174d] sm:text-6xl lg:text-7xl">${copy.headline}</h1><p class="mt-6 max-w-2xl text-lg leading-8 text-[#60736c]">${copy.lead}</p><div class="mt-8 flex flex-wrap gap-3"><a href="${registerUrl}" class="rounded-2xl bg-[#2b174d] px-6 py-3.5 font-semibold text-white shadow-lg shadow-[#2b174d]/15">${copy.primary}</a><a href="/${locale}/wedding/preview" class="rounded-2xl border border-[#bdcec7] bg-white px-6 py-3.5 font-semibold text-[#6d28d9]">${el ? "Δες και τα 15 designs" : "Explore all 15 designs"}</a></div><ul class="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-[#667970]">${copy.proof.map((item) => `<li class="flex items-center gap-2"><span class="text-[#8b5cf6]">✓</span>${item}</li>`).join("")}</ul></div>
    <div class="relative mx-auto w-full max-w-[620px]" aria-label="${el ? "Προεπισκόπηση wedding website" : "Wedding website preview"}"><div class="absolute -inset-5 rotate-2 rounded-[2.8rem] bg-[#d9e7e1]"></div><div class="relative overflow-hidden rounded-[2.4rem] border-[10px] border-white bg-[#17352d] shadow-[0_35px_90px_rgba(24,60,51,.24)]"><div class="flex items-center justify-between border-b border-white/10 px-5 py-3 text-[10px] uppercase tracking-[.18em] text-white/60"><span>Memboux Wedding</span><span>Private preview</span></div><div class="relative flex min-h-[440px] flex-col justify-end overflow-hidden p-7 text-white sm:min-h-[520px] sm:p-10"><div class="absolute -right-16 -top-16 h-72 w-72 rounded-full border border-white/10"></div><div class="absolute left-8 top-14 h-40 w-28 -rotate-6 rounded-t-full bg-[#9dbbad]/30 shadow-2xl"></div><div class="absolute right-10 top-24 h-52 w-36 rotate-6 rounded-t-full border border-white/15 bg-[#d5c3ad]/20"></div><div class="relative"><p class="text-xs uppercase tracking-[.24em] text-[#d4c5eb]">${el ? "Σάββατο · 14 Ιουνίου" : "Saturday · 14 June"}</p><h2 class="mt-4 font-serif text-5xl leading-none sm:text-7xl">Alex & Maria</h2><p class="mt-5 max-w-md text-sm leading-6 text-white/70">${el ? "Με χαρά σας προσκαλούμε να γιορτάσετε μαζί μας." : "We joyfully invite you to celebrate with us."}</p><div class="mt-7 grid grid-cols-3 gap-2 text-center text-[10px]"><span class="rounded-xl border border-white/10 bg-white/5 p-3">RSVP</span><span class="rounded-xl border border-white/10 bg-white/5 p-3">GALLERY</span><span class="rounded-xl border border-white/10 bg-white/5 p-3">GUESTBOOK</span></div></div></div></div></div></div></section>
    <section id="features" class="mx-auto max-w-7xl px-4 py-20 sm:px-6"><div class="max-w-3xl"><p class="text-xs font-bold uppercase tracking-[.18em] text-[#7c3aed]">${l({ el: "Μία οργανωμένη εμπειρία", en: "One organized experience", fr: "Une expérience bien organisée", de: "Eine organisierte Erfahrung", es: "Una experiencia organizada", it: "Un’esperienza organizzata" })}</p><h2 class="mt-3 text-4xl tracking-[-.035em] sm:text-5xl">${l({ el: "Όλα όσα χρειάζεται ένας σύγχρονος γάμος.", en: "Everything a modern wedding needs.", fr: "Tout ce dont un mariage moderne a besoin.", de: "Alles, was eine moderne Hochzeit braucht.", es: "Todo lo que necesita una boda moderna.", it: "Tutto ciò che serve a un matrimonio moderno." })}</h2></div><div class="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">${features.map(([symbol, title, description]) => `<article class="rounded-[1.7rem] border border-[#e7e0f0] bg-white p-6 shadow-sm">${featureIcon(symbol)}<h3 class="mt-5 text-xl font-semibold">${title}</h3><p class="mt-2 text-sm leading-6 text-[#756b82]">${description}</p></article>`).join("")}</div></section>
    <section id="how" class="bg-[#2b174d] text-white"><div class="mx-auto max-w-7xl px-4 py-20 sm:px-6"><p class="text-xs font-bold uppercase tracking-[.18em] text-[#c4b5fd]">${l({ el: "Από την ιδέα στην πρόσκληση", en: "From idea to invitation", fr: "De l’idée à l’invitation", de: "Von der Idee zur Einladung", es: "De la idea a la invitación", it: "Dall’idea all’invito" })}</p><h2 class="mt-3 max-w-3xl text-4xl tracking-[-.035em] sm:text-5xl">${l({ el: "Δημιουργήστε πρώτα. Μοιραστείτε όταν είστε έτοιμοι.", en: "Build first. Share when you are ready.", fr: "Créez d’abord. Partagez quand tout est prêt.", de: "Erst erstellen. Teilen, wenn alles bereit ist.", es: "Primero crea. Comparte cuando esté listo.", it: "Prima crea. Condividi quando è tutto pronto." })}</h2><ol class="mt-10 grid gap-4 lg:grid-cols-3">${steps.map(([title, description], index) => `<li class="rounded-[1.7rem] border border-white/10 bg-white/5 p-6"><span class="text-sm font-bold text-[#c4b5fd]">0${index + 1}</span><h3 class="mt-8 text-2xl">${title}</h3><p class="mt-3 text-sm leading-6 text-white/65">${description}</p></li>`).join("")}</ol></div></section>
    <section id="faq" class="mx-auto max-w-4xl px-4 py-20 sm:px-6"><p class="text-center text-xs font-bold uppercase tracking-[.18em] text-[#7c3aed]">FAQ</p><h2 class="mt-3 text-center text-4xl">${l({ el: "Πριν ξεκινήσετε", en: "Before you begin", fr: "Avant de commencer", de: "Bevor ihr beginnt", es: "Antes de empezar", it: "Prima di iniziare" })}</h2><div class="mt-9 space-y-3">${faqs.map(([question, answer]) => `<details class="group rounded-2xl border border-[#e7e0f0] bg-white p-5"><summary class="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold"><span>${question}</span><span class="text-xl text-[#7c3aed] group-open:rotate-45">+</span></summary><p class="mt-3 max-w-3xl text-sm leading-6 text-[#756b82]">${answer}</p></details>`).join("")}</div></section>
    <section class="px-4 pb-20 sm:px-6"><div class="mx-auto max-w-6xl overflow-hidden rounded-[2.4rem] bg-[#dceae4] p-7 text-center sm:p-12"><p class="text-xs font-bold uppercase tracking-[.18em] text-[#7c3aed]">Memboux Wedding</p><h2 class="mx-auto mt-3 max-w-3xl text-4xl tracking-[-.035em] sm:text-5xl">${l({ el: "Η κοινή ιστορία σας μπορεί να ξεκινήσει σήμερα.", en: "Your shared story can start today.", fr: "Votre histoire partagée peut commencer aujourd’hui.", de: "Eure gemeinsame Geschichte kann heute beginnen.", es: "Vuestra historia compartida puede empezar hoy.", it: "La vostra storia condivisa può iniziare oggi." })}</h2><p class="mx-auto mt-4 max-w-xl text-sm leading-6 text-[#60736c]">${l({ el: "Δημιουργήστε το ιδιωτικό preview χωρίς κάρτα και αποφασίστε αφού δείτε το αποτέλεσμα.", en: "Create the private preview without a card and decide after seeing the result.", fr: "Créez l’aperçu privé sans carte et décidez après avoir vu le résultat.", de: "Erstellt die private Vorschau ohne Karte und entscheidet erst nach dem Ergebnis.", es: "Crea la vista privada sin tarjeta y decide después de ver el resultado.", it: "Crea l’anteprima privata senza carta e decidi dopo aver visto il risultato." })}</p><a href="${registerUrl}" class="mt-7 inline-flex rounded-2xl bg-[#2b174d] px-7 py-4 font-semibold text-white">${copy.primary}</a></div></section>
  </main><footer class="border-t border-[#e7e0f0] bg-white"><div class="mx-auto flex max-w-7xl flex-col justify-between gap-4 px-4 py-8 text-sm text-[#756b82] sm:flex-row sm:px-6">${brandMark(`/${locale}`, true)}<div class="flex flex-wrap items-center gap-5"><a href="/${locale}/privacy-policy">Privacy</a><a href="/${locale}/terms">Terms</a><a href="mailto:support@memboux.com">support@memboux.com</a></div></div></footer>`;
  return page(copy.title, body, {
    locale,
    description: copy.description,
    canonical,
    alternates: { ...alternates, "x-default": "https://memboux.com/en/wedding" },
    index: true,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Memboux Wedding",
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Web",
      description: copy.description,
      url: canonical,
      offers: { "@type": "Offer", price: "0", priceCurrency: "EUR", description: el ? "Ιδιωτικό preview χωρίς κάρτα" : "Private preview without a card" },
    },
  });
}
