import { localeNames, supportedLocales, type Locale } from "../i18n";
import { brandMark, page } from "./shared";
import { additionalHomeCopy } from "./home-copy";
import { homeCommercialSections } from "./home-commercial";
import type { CommerceProduct } from "../commerce";

const icon = (path: string, className = "h-5 w-5") =>
  `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="${className}">${path}</svg>`;

const icons = {
  arrow: icon('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  check: icon('<path d="m5 12 4 4L19 6"/>', "h-4 w-4"),
  link: icon('<path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/>'),
  upload: icon('<path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M5 15v4h14v-4"/>'),
  gallery: icon('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/>'),
  users: icon('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
  shield: icon('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>'),
  studio: icon('<path d="M4 19V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14"/><path d="M2 19h20M8 7h8M8 11h5"/>'),
  restore: icon('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  play: icon('<path d="m9 7 8 5-8 5V7Z"/>', "h-4 w-4"),
  lock: icon('<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>', "h-4 w-4"),
  globe: icon('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>', "h-4 w-4"),
};

export function homePage(locale: Locale, products: CommerceProduct[]) {
  const el = locale === "el";
  const copy = {
    title: el ? "Memboux – Όλες οι στιγμές του event, σε ένα μέρος" : "Memboux – Every event moment, in one place",
    description: el
      ? "Φτιάξε το δικό σου event space, μοιράσου ένα link ή QR και συγκέντρωσε τις φωτογραφίες όλης της παρέας — χωρίς εφαρμογή."
      : "Create your event space, share one link or QR, and collect the whole crew’s photos — no app required.",
    language: el ? "Γλώσσα" : "Language",
    navFeatures: el ? "Δυνατότητες" : "Features",
    navHow: el ? "Πώς λειτουργεί" : "How it works",
    navPrivacy: el ? "Απόρρητο" : "Privacy",
    login: el ? "Σύνδεση" : "Sign in",
    register: el ? "Δημιουργία λογαριασμού" : "Create account",
    eyebrow: el ? "Οι φωτογραφίες όλων. Επιτέλους μαζί." : "Everyone’s photos. Finally together.",
    heroTitle: el ? "Μην αφήσεις τις αναμνήσεις σου στα κινητά των άλλων." : "Don’t leave your memories on everyone else’s phone.",
    heroText: el
      ? "Σε κάθε γάμο, πάρτι ή ταξίδι όλοι τραβούν φωτογραφίες και βίντεο. Με ένα link ή QR, το Memboux τα φέρνει σε ένα ιδιωτικό μέρος — πριν χαθούν για πάντα στα προσωπικά galleries."
      : "At every wedding, party, or trip, everyone captures photos and videos. With one link or QR, Memboux brings them into one private place—before they disappear into personal camera rolls.",
    heroPrimary: el ? "Φτιάξε το event σου" : "Create your event",
    heroSecondary: el ? "Έχω ήδη λογαριασμό" : "I already have an account",
    trust: el
      ? ["Χωρίς app", "Όλη η παρέα ανεβάζει", "Εσύ κρατάς τον έλεγχο"]
      : ["No app required", "The whole crew uploads", "You stay in control"],
    previewEyebrow: el ? "Το event σου" : "Your event",
    previewTitle: el ? "Καλοκαίρι στη Μήλο" : "Summer in Milos",
    previewDate: el ? "15–22 Ιουνίου 2026" : "15–22 June 2026",
    previewUploads: el ? "24 νέες στιγμές" : "24 new moments",
    previewShare: el ? "Μοιράσου το gallery" : "Share gallery",
    eventKinds: el ? "Για κάθε «θυμάσαι τότε;» που θέλεις να κρατήσεις." : "For every “remember when?” worth keeping.",
    eventChips: el
      ? ["Γάμοι", "Ταξίδια", "Γενέθλια", "Bachelor", "Πάρτι", "Παρέες"]
      : ["Weddings", "Trips", "Birthdays", "Bachelor", "Parties", "Crews"],
    howEyebrow: el ? "Ένα link και έτοιμοι" : "One link and you’re ready",
    howTitle: el ? "Από το «στείλε τις φωτογραφίες» σε ένα gallery που τα έχει όλα." : "From “send me the photos” to one gallery with everything.",
    steps: el
      ? [
          ["01", "Δημιούργησε το event", "Δώσε όνομα, ημερομηνίες και επίλεξε ποιος μπορεί να ανεβάζει."],
          ["02", "Μοιράσου link ή QR", "Οι καλεσμένοι ανοίγουν το gallery κατευθείαν από το κινητό τους."],
          ["03", "Συλλέξτε τα πάντα μαζί", "Οι φωτογραφίες οργανώνονται χρονολογικά σε ένα μέρος."],
        ]
      : [
          ["01", "Create your event", "Add a name and dates, then choose who can upload."],
          ["02", "Share a link or QR", "Guests open the gallery directly from their phone."],
          ["03", "Collect everything together", "Photos stay organised chronologically in one place."],
        ],
    featuresEyebrow: el ? "Όχι άλλο ψάξιμο στο group chat" : "No more digging through the group chat",
    featuresTitle: el ? "Λιγότερο ψάξιμο. Περισσότερες στιγμές μαζί." : "Less searching. More moments together.",
    features: el
      ? [
          ["link", "Εύκολο guest upload", "Πολλαπλό upload από κινητό μέσω link ή QR, χωρίς εγκατάσταση εφαρμογής."],
          ["gallery", "Συλλογή φωτογραφιών", "Καθαρή προβολή, swipe στο κινητό, επιλογή και μαζικό download."],
          ["users", "Συνεργασία με ρόλους", "Πρόσθεσε φίλους, οικογένεια ή συνεργάτες με το κατάλληλο επίπεδο πρόσβασης."],
          ["shield", "Ιδιωτικότητα και έλεγχος", "PIN όπου το χρειάζεσαι, reports, διαχείριση πρόσβασης και αιτήματα δεδομένων."],
          ["studio", "Memboux Studio", "Σύνδεσε επαγγελματία φωτογράφο και κράτησε το επίσημο album δίπλα στις στιγμές των καλεσμένων."],
          ["restore", "Ασφαλής διαγραφή", "Διεγραμμένο υλικό παραμένει στον κάδο για 30 ημέρες πριν αφαιρεθεί οριστικά."],
        ]
      : [
          ["link", "Effortless guest uploads", "Multiple uploads from any phone by link or QR, with no app to install."],
          ["gallery", "Photo gallery", "A clean viewer, mobile swipe, multi-select, and bulk downloads."],
          ["users", "Role-based collaboration", "Invite friends, family, or collaborators with the right level of access."],
          ["shield", "Privacy and control", "Optional PINs, reports, access management, and privacy request tools."],
          ["studio", "Memboux Studio", "Connect a professional photographer and keep the official album beside guest moments."],
          ["restore", "Recoverable deletion", "Deleted media stays in the trash for 30 days before permanent removal."],
        ],
    privacyEyebrow: el ? "Ιδιωτικό από σχεδιασμό" : "Private by design",
    privacyTitle: el ? "Οι προσωπικές σου στιγμές δεν είναι περιεχόμενο." : "Your personal moments are not content.",
    privacyText: el
      ? "Το Memboux είναι φτιαγμένο για ελεγχόμενη κοινοποίηση. Εσύ ορίζεις το event, τα μέλη και τον τρόπο πρόσβασης, ενώ διαθέτεις εργαλεία report, κάδου και διαχείρισης προσωπικών δεδομένων."
      : "Memboux is built for controlled sharing. You define the event, its members, and how people access it, with reporting, trash recovery, and privacy-management tools included.",
    privacyPoints: el
      ? ["Ιδιωτικά event galleries", "Προαιρετικό upload PIN", "Άμεση απόκρυψη reported media", "Εργαλεία GDPR και διαγραφής"]
      : ["Private event galleries", "Optional upload PIN", "Immediate reported-media hiding", "GDPR and deletion tools"],
    finalEyebrow: el ? "Ready όταν είσαι κι εσύ" : "Ready when you are",
    finalTitle: el ? "Το επόμενο μεγάλο σας event ξεκινά εδώ." : "Your next big event starts here.",
    finalText: el ? "Ένα link. Όλη η παρέα. Καμία στιγμή χαμένη." : "One link. The whole crew. No moment lost.",
    finalButton: el ? "Ξεκίνα τώρα" : "Get started",
    footerText: el ? "Ιδιωτική συλλογή φωτογραφιών για κάθε event." : "Private photo collection for every event.",
    terms: el ? "Όροι" : "Terms",
    dataRequest: el ? "Αίτημα δεδομένων" : "Data request",
  };
  Object.assign(copy, additionalHomeCopy[locale] ?? {});
  const visionCopy: Record<Locale, { eyebrow: string; title: string; text: string; points: string[] }> = {
    el: {
      eyebrow: "Γιατί υπάρχει το Memboux",
      title: "Μία φωτογραφία μπορεί να μη σημαίνει πολλά σήμερα. Σε λίγα χρόνια μπορεί να σημαίνει τα πάντα.",
      text: "Ένα αγαπημένο πρόσωπο, ένα παιδί όπως ήταν τότε, μια αυθόρμητη στιγμή ή μια διαφορετική οπτική γωνία μπορεί να υπάρχει μόνο στο κινητό κάποιου άλλου. Το Memboux δημιουργήθηκε για να μη χαθεί.",
      points: ["Φωτογραφίες και βίντεο από όλους", "Κάθε οπτική γωνία σε ένα μέρος", "Ιδιωτική συλλογή που μένει"],
    },
    en: {
      eyebrow: "Why Memboux exists",
      title: "A photo may feel ordinary today. Years from now, it can mean everything.",
      text: "A loved one, a child as they were then, a candid moment, or a completely different point of view may exist only on somebody else’s phone. Memboux was created so it does not get lost.",
      points: ["Photos and videos from everyone", "Every point of view in one place", "A private collection that lasts"],
    },
    fr: {
      eyebrow: "Pourquoi Memboux existe",
      title: "Une photo peut sembler ordinaire aujourd’hui. Dans quelques années, elle peut devenir inestimable.",
      text: "Un être cher, un enfant tel qu’il était, un instant spontané ou un autre point de vue peut n’exister que dans le téléphone de quelqu’un d’autre. Memboux a été créé pour ne pas le perdre.",
      points: ["Photos et vidéos de tous", "Tous les points de vue au même endroit", "Une collection privée qui reste"],
    },
    de: {
      eyebrow: "Warum es Memboux gibt",
      title: "Ein Foto wirkt heute vielleicht alltäglich. Jahre später kann es alles bedeuten.",
      text: "Ein geliebter Mensch, ein Kind von damals, ein spontaner Moment oder eine andere Perspektive existiert vielleicht nur auf dem Handy eines anderen. Memboux wurde geschaffen, damit sie nicht verloren geht.",
      points: ["Fotos und Videos von allen", "Jede Perspektive an einem Ort", "Eine private Sammlung, die bleibt"],
    },
    es: {
      eyebrow: "Por qué existe Memboux",
      title: "Una foto puede parecer normal hoy. Dentro de unos años puede significarlo todo.",
      text: "Un ser querido, un niño tal como era entonces, un momento espontáneo u otra perspectiva quizá solo exista en el móvil de otra persona. Memboux nació para que no se pierda.",
      points: ["Fotos y vídeos de todos", "Cada perspectiva en un solo lugar", "Una colección privada que permanece"],
    },
    it: {
      eyebrow: "Perché esiste Memboux",
      title: "Una foto può sembrare normale oggi. Tra qualche anno può significare tutto.",
      text: "Una persona cara, un bambino com’era allora, un momento spontaneo o un altro punto di vista potrebbero esistere solo sul telefono di qualcun altro. Memboux è nato perché non vadano perduti.",
      points: ["Foto e video di tutti", "Ogni punto di vista in un solo posto", "Una raccolta privata che rimane"],
    },
  };
  const vision = visionCopy[locale];
  const visualCopy: Record<Locale, { heroAlt: string; birthdayAlt: string; tripAlt: string; capturedBy: string }> = {
    el: {
      heroAlt: "Παρέα καταγράφει από διαφορετικές οπτικές μια αυθόρμητη στιγμή σε γαμήλια δεξίωση",
      birthdayAlt: "Οικογένεια φωτογραφίζει ένα παιδί που σβήνει τα κεράκια των γενεθλίων του",
      tripAlt: "Παρέα μοιράζεται φωτογραφίες από τις διακοπές της σε μια παραλία του Αιγαίου",
      capturedBy: "Από 8 καλεσμένους",
    },
    en: {
      heroAlt: "Friends capture a candid wedding reception moment from different perspectives",
      birthdayAlt: "A family photographs a child blowing out birthday candles",
      tripAlt: "Friends share their holiday photos on an Aegean beach",
      capturedBy: "From 8 guests",
    },
    fr: {
      heroAlt: "Des amis immortalisent sous plusieurs angles un moment spontané de mariage",
      birthdayAlt: "Une famille photographie un enfant qui souffle ses bougies d’anniversaire",
      tripAlt: "Des amis partagent leurs photos de vacances sur une plage de la mer Égée",
      capturedBy: "Par 8 invités",
    },
    de: {
      heroAlt: "Freunde halten einen spontanen Hochzeitsmoment aus verschiedenen Perspektiven fest",
      birthdayAlt: "Eine Familie fotografiert ein Kind beim Ausblasen der Geburtstagskerzen",
      tripAlt: "Freunde teilen ihre Urlaubsfotos an einem Strand in der Ägäis",
      capturedBy: "Von 8 Gästen",
    },
    es: {
      heroAlt: "Amigos capturan desde distintos ángulos un momento espontáneo de una boda",
      birthdayAlt: "Una familia fotografía a una niña soplando las velas de cumpleaños",
      tripAlt: "Un grupo de amigos comparte sus fotos de vacaciones en una playa del Egeo",
      capturedBy: "De 8 invitados",
    },
    it: {
      heroAlt: "Amici immortalano da prospettive diverse un momento spontaneo di un matrimonio",
      birthdayAlt: "Una famiglia fotografa una bambina mentre spegne le candeline",
      tripAlt: "Un gruppo di amici condivide le foto delle vacanze su una spiaggia dell’Egeo",
      capturedBy: "Da 8 invitati",
    },
  };
  const visuals = visualCopy[locale];
  const commercialSections = homeCommercialSections(locale, products);

  const featureIcon = (name: string) => icons[name as keyof typeof icons] ?? icons.gallery;
  const featureCards = copy.features
    .map(
      ([name, title, description]) =>
        `<article class="group rounded-[1.75rem] border border-[#eadffc] bg-white p-6 transition hover:-translate-y-1 hover:border-[#c4a7f5] hover:shadow-[0_20px_55px_rgba(124,58,237,.13)] sm:p-7"><span class="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f1eafe] text-[#7c3aed] transition group-hover:bg-[#7c3aed] group-hover:text-white">${featureIcon(name)}</span><h3 class="mt-6 text-xl font-medium text-[#2b1b4b]">${title}</h3><p class="mt-3 text-sm leading-7 text-[#6f6680]">${description}</p></article>`,
    )
    .join("");
  const stepCards = copy.steps
    .map(
      ([number, title, description]) =>
        `<article class="relative border-t border-[#ddd0f5] pt-6"><span class="text-xs font-semibold tracking-[.18em] text-[#f43f8f]">${number}</span><h3 class="mt-5 text-2xl font-medium text-[#2b1b4b]">${title}</h3><p class="mt-3 max-w-sm text-sm leading-7 text-[#6f6680]">${description}</p></article>`,
    )
    .join("");
  const chips = copy.eventChips.map((label) => `<span class="rounded-full border border-[#e3d5fb] bg-white px-4 py-2 text-sm text-[#5d477e] shadow-sm">${label}</span>`).join("");
  const trustItems = copy.trust.map((label) => `<li class="flex items-center gap-2"><span class="flex h-5 w-5 items-center justify-center rounded-full bg-[#ddfbf6] text-[#0f9f8c]">${icons.check}</span>${label}</li>`).join("");
  const privacyItems = copy.privacyPoints.map((label) => `<li class="flex items-center gap-3"><span class="flex h-7 w-7 items-center justify-center rounded-full bg-[#e9e4f7] text-[#57468e]">${icons.check}</span><span>${label}</span></li>`).join("");
  const languageLinks = supportedLocales.map((code) => `<a href="/${code}" lang="${code}" hreflang="${code}" class="flex items-center justify-between gap-4 rounded-xl px-3 py-2.5 text-sm ${code === locale ? "bg-[#f2ecff] font-semibold text-[#6d28d9]" : "text-[#675a72] hover:bg-[#f8f5ff] hover:text-[#2b174d]"}"><span>${localeNames[code]}</span>${code === locale ? `<span aria-hidden="true">${icons.check}</span>` : ""}</a>`).join("");

  const title = copy.title;
  const canonical = `https://memboux.com/${locale}`;
  return page(
    title,
    `<main data-page="home" data-locale="${locale}" class="overflow-hidden bg-[#fbfafc] text-[#302b38]">
      <header class="home-header relative z-30 border-b border-[#e9e6ed] bg-white/90 backdrop-blur-xl">
        <nav aria-label="${el ? "Κύρια πλοήγηση" : "Main navigation"}" class="home-nav mx-auto flex h-20 max-w-7xl items-center justify-between gap-5 px-5 sm:px-8">
          ${brandMark(`/${locale}`, true)}
          <div class="hidden items-center gap-7 text-sm text-[#596d65] lg:flex">
            <a href="#event-types" class="hover:text-[#2b174d]">Events</a>
            <a href="#demo" class="hover:text-[#2b174d]">Demo</a>
            <a href="#features" class="hover:text-[#2b174d]">${copy.navFeatures}</a>
            <a href="#pricing" class="hover:text-[#2b174d]">${el ? "Πακέτα" : "Pricing"}</a>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <details class="home-mobile-menu group relative lg:hidden"><summary aria-label="Menu" class="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border border-[#e2dcef] bg-white text-lg text-[#443653] shadow-sm [&::-webkit-details-marker]:hidden">☰</summary><div class="absolute right-0 top-[calc(100%+.65rem)] z-50 w-60 rounded-2xl border border-[#e7e0f0] bg-white p-2 text-sm shadow-[0_20px_55px_rgba(24,60,51,.16)]"><a href="#event-types" class="block rounded-xl px-3 py-3 font-semibold hover:bg-[#f8f7fc]">Events</a><a href="#demo" class="block rounded-xl px-3 py-3 font-semibold hover:bg-[#f8f7fc]">Demo</a><a href="#features" class="block rounded-xl px-3 py-3 font-semibold hover:bg-[#f8f7fc]">${copy.navFeatures}</a><a href="#pricing" class="block rounded-xl px-3 py-3 font-semibold hover:bg-[#f8f7fc]">${el ? "Πακέτα" : "Pricing"}</a><a href="#faq" class="block rounded-xl px-3 py-3 font-semibold hover:bg-[#f8f7fc]">FAQ</a><a href="/${locale}/login" class="mt-1 block rounded-xl bg-[#f0edff] px-3 py-3 font-bold text-[#4d2fbd] sm:hidden">${copy.login}</a><a href="/${locale}/register" class="mt-1 block rounded-xl bg-[#7152f3] px-3 py-3 font-bold text-white sm:hidden">${copy.register}</a></div></details>
            <details class="group relative"><summary aria-label="${copy.language}" title="${copy.language}" class="flex h-10 cursor-pointer list-none items-center gap-2 rounded-full border border-[#e2dcef] bg-white px-3 text-xs font-semibold text-[#443653] shadow-sm transition hover:border-[#b8cbc3] hover:bg-[#fafcfb] [&::-webkit-details-marker]:hidden">${icons.globe}<span class="hidden sm:inline">${localeNames[locale]}</span><span class="sm:hidden">${locale.toUpperCase()}</span><span aria-hidden="true" class="text-[10px] transition group-open:rotate-180">⌄</span></summary><div class="absolute right-0 top-[calc(100%+.65rem)] z-50 w-48 rounded-2xl border border-[#e7e0f0] bg-white p-2 shadow-[0_20px_55px_rgba(24,60,51,.16)]"><p class="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[.16em] text-[#788b84]">${copy.language}</p>${languageLinks}</div></details>
            <a href="/${locale}/login" class="hidden rounded-full px-4 py-2.5 text-sm font-semibold text-[#2b174d] hover:bg-white sm:inline-flex">${copy.login}</a>
            <a href="/${locale}/register" class="home-header-register inline-flex items-center gap-2 rounded-xl bg-[#7967bd] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_6px_18px_rgba(87,70,142,.16)] hover:-translate-y-0.5 hover:bg-[#6855ad] sm:px-5">${copy.register}<span class="hidden sm:inline">${icons.arrow}</span></a>
          </div>
        </nav>
      </header>

      <section class="home-hero relative">
        <div class="absolute left-1/2 top-0 h-[32rem] w-[52rem] -translate-x-1/2 rounded-full bg-[#f0edf6] opacity-80 blur-3xl"></div>
        <div class="home-hero-grid relative mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-16 sm:px-8 sm:pb-28 sm:pt-24 lg:grid-cols-[.88fr_1.12fr] lg:gap-20 lg:pb-32 lg:pt-28">
          <div class="home-hero-copy">
            <p class="text-xs font-semibold uppercase tracking-[.22em] text-[#f43f8f]">${copy.eyebrow}</p>
            <h1 class="mt-5 max-w-3xl text-[2.8rem] font-medium leading-[1.04] tracking-[-.045em] text-[#2b1b4b] sm:text-6xl lg:text-[4.6rem]">${copy.heroTitle}</h1>
            <p class="mt-7 max-w-2xl text-lg leading-8 text-[#6f6680] sm:text-xl">${copy.heroText}</p>
            <div class="home-hero-actions mt-9 flex flex-col gap-3 sm:flex-row">
              <a href="/${locale}/register" class="inline-flex items-center justify-center gap-3 rounded-xl bg-[#7967bd] px-6 py-4 font-semibold text-white shadow-[0_8px_22px_rgba(87,70,142,.18)] hover:-translate-y-0.5 hover:bg-[#6855ad]">${copy.heroPrimary}${icons.arrow}</a>
              <a href="/${locale}/login" class="inline-flex items-center justify-center rounded-xl border border-[#dcd7e3] bg-white px-6 py-4 font-semibold text-[#302b38] hover:border-[#bbb2c8]">${copy.heroSecondary}</a>
            </div>
            <ul class="home-trust-list mt-8 flex flex-col gap-3 text-xs text-[#756b82] sm:flex-row sm:flex-wrap sm:gap-x-5">${trustItems}</ul>
          </div>

          <div class="home-hero-preview relative mx-auto w-full max-w-2xl">
            <div class="absolute -inset-6 rounded-[3rem] bg-gradient-to-br from-[#ddcff5]/70 via-white/20 to-[#f7d8de]/60 blur-2xl"></div>
            <figure class="home-hero-photo relative overflow-hidden rounded-[1.5rem] border border-white/70 bg-[#eeeaf5] shadow-[0_24px_70px_rgba(57,48,69,.16)] sm:rounded-[1.75rem]">
              <picture>
                <source media="(max-width: 720px)" srcset="/marketing/hero-moments-720.webp">
                <img src="/marketing/hero-moments-1600.webp" width="1600" height="838" alt="${visuals.heroAlt}" fetchpriority="high" decoding="async" class="h-full w-full object-cover">
              </picture>
              <div class="home-hero-photo-shade absolute inset-0"></div>
              <figcaption class="absolute inset-x-3 bottom-3 flex items-end justify-between gap-3 sm:inset-x-5 sm:bottom-5">
                <span class="rounded-xl bg-white/92 px-4 py-3 text-left shadow-lg backdrop-blur-md"><span class="block text-[10px] font-bold uppercase tracking-[.16em] text-[#7967bd]">${copy.previewEyebrow}</span><strong class="mt-1 block text-sm text-[#302b38] sm:text-base">${copy.previewUploads}</strong><span class="mt-0.5 block text-[10px] text-[#756f7c]">${visuals.capturedBy}</span></span>
                <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#7967bd] text-white shadow-lg" aria-hidden="true">${icons.gallery}</span>
              </figcaption>
            </figure>
            <div class="home-hero-share absolute -bottom-6 right-4 flex max-w-[85%] items-center gap-3 rounded-xl border border-[#e1dce8] bg-white px-4 py-3 shadow-[0_16px_35px_rgba(57,48,69,.14)] sm:-bottom-7 sm:right-8"><span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f2ecff] text-[#7c3aed]">${icons.link}</span><span class="min-w-0"><strong class="block truncate text-xs">${copy.previewShare}</strong><span class="block truncate text-[10px] text-[#84978f]">memboux.com/gallery/OUR-DAY</span></span></div>
          </div>
        </div>
      </section>

      <section class="border-y border-[#e9e3f2] bg-white/70">
        <div class="mx-auto flex max-w-7xl flex-col items-center gap-6 px-5 py-8 sm:px-8 lg:flex-row lg:justify-between">
          <p class="text-center text-sm font-medium text-[#536e65] lg:text-left">${copy.eventKinds}</p>
          <div class="home-event-chips flex flex-wrap justify-center gap-2">${chips}</div>
        </div>
      </section>

      ${commercialSections}

      <section class="relative overflow-hidden border-y border-[#e9e6ed] bg-[#f5f3f8] text-[#302b38]">
        <div class="absolute -left-24 top-10 h-72 w-72 rounded-full bg-[#e8e2f3]/70 blur-3xl"></div>
        <div class="absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-[#f4e8eb]/70 blur-3xl"></div>
        <div class="relative mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[.92fr_1.08fr] lg:items-center lg:gap-20">
          <div><p class="text-xs font-semibold uppercase tracking-[.22em] text-[#7967bd]">${vision.eyebrow}</p><h2 class="mt-5 max-w-4xl text-4xl font-medium leading-tight tracking-[-.035em] sm:text-6xl">${vision.title}</h2><p class="mt-7 max-w-3xl text-base leading-8 text-[#756f7c] sm:text-lg">${vision.text}</p><ul class="mt-8 space-y-3">${vision.points.map((point) => `<li class="flex items-center gap-3 text-sm text-[#514a58]"><span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e9e4f7] text-[#57468e]">${icons.check}</span>${point}</li>`).join("")}</ul></div>
          <div class="home-memory-collage grid grid-cols-12 gap-3 sm:gap-4" aria-label="${vision.eyebrow}">
            <figure class="col-span-12 overflow-hidden rounded-[1.35rem] bg-white shadow-[0_18px_50px_rgba(57,48,69,.1)] sm:col-span-7"><picture><source media="(max-width: 720px)" srcset="/marketing/birthday-moments-720.webp"><img loading="lazy" decoding="async" src="/marketing/birthday-moments-1280.webp" width="1280" height="853" alt="${visuals.birthdayAlt}" class="h-full w-full object-cover"></picture></figure>
            <figure class="col-span-12 overflow-hidden rounded-[1.35rem] bg-white shadow-[0_18px_50px_rgba(57,48,69,.1)] sm:col-span-5 sm:mt-16"><picture><source media="(max-width: 720px)" srcset="/marketing/trip-moments-720.webp"><img loading="lazy" decoding="async" src="/marketing/trip-moments-1280.webp" width="1280" height="853" alt="${visuals.tripAlt}" class="h-full w-full object-cover"></picture></figure>
          </div>
        </div>
      </section>

      <section id="how-it-works" class="scroll-mt-24 mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32">
        <p class="text-xs font-semibold uppercase tracking-[.22em] text-[#7c3aed]">${copy.howEyebrow}</p>
        <h2 class="mt-4 max-w-3xl text-4xl font-medium leading-tight tracking-[-.035em] sm:text-5xl">${copy.howTitle}</h2>
        <div class="mt-16 grid gap-10 md:grid-cols-3">${stepCards}</div>
      </section>

      <section id="features" class="scroll-mt-24 bg-[#f6f5f7] py-24 sm:py-32">
        <div class="mx-auto max-w-7xl px-5 sm:px-8">
          <div class="max-w-4xl"><p class="text-xs font-semibold uppercase tracking-[.22em] text-[#7c3aed]">${copy.featuresEyebrow}</p><h2 class="mt-4 text-4xl font-medium leading-tight tracking-[-.035em] sm:text-5xl">${copy.featuresTitle}</h2></div>
          <div class="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">${featureCards}</div>
        </div>
      </section>

      <section id="privacy" class="scroll-mt-24 border-y border-[#e9e6ed] bg-white text-[#302b38]">
        <div class="mx-auto grid max-w-7xl items-center gap-14 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[1.05fr_.95fr] lg:gap-24">
          <div><p class="text-xs font-semibold uppercase tracking-[.22em] text-[#7967bd]">${copy.privacyEyebrow}</p><h2 class="mt-5 max-w-3xl text-4xl font-medium leading-tight tracking-[-.035em] sm:text-6xl">${copy.privacyTitle}</h2><p class="mt-7 max-w-2xl text-base leading-8 text-[#756f7c] sm:text-lg">${copy.privacyText}</p></div>
          <div class="relative"><div class="absolute -inset-8 rounded-full bg-[#eeeaf5] blur-3xl"></div><div class="relative rounded-[1.5rem] border border-[#e4e0e8] bg-[#f8f7fa] p-7 sm:p-9"><span class="flex h-14 w-14 items-center justify-center rounded-xl bg-[#e9e4f7] text-[#57468e]">${icons.shield}</span><ul class="mt-8 space-y-5 text-sm text-[#625b69] sm:text-base">${privacyItems}</ul><a href="/${locale}/privacy-policy" class="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[#57468e] hover:text-[#40336b]">${el ? "Δες την πολιτική απορρήτου" : "Read our privacy policy"}${icons.arrow}</a></div></div>
        </div>
      </section>

      <section class="home-final-cta px-5 py-10 sm:px-8 sm:py-14 lg:py-16">
        <div class="relative mx-auto max-w-7xl overflow-hidden rounded-[1.5rem] border border-[#ddd8e4] bg-[#eeebf4] px-6 py-12 text-center text-[#302b38] shadow-[0_18px_50px_rgba(57,48,69,.08)] sm:px-12 sm:py-16">
          <div class="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-white/60 blur-2xl"></div><div class="absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-[#f4e7ea]/60 blur-2xl"></div>
          <div class="relative mx-auto max-w-3xl"><p class="text-xs font-semibold uppercase tracking-[.22em] text-[#7967bd]">${copy.finalEyebrow}</p><h2 class="mt-5 text-4xl font-medium tracking-[-.035em] sm:text-6xl">${copy.finalTitle}</h2><p class="mt-5 text-lg text-[#756f7c]">${copy.finalText}</p><a href="/${locale}/register" class="mt-9 inline-flex items-center gap-3 rounded-xl bg-[#7967bd] px-7 py-4 font-semibold text-white shadow-[0_8px_22px_rgba(87,70,142,.16)] hover:-translate-y-0.5 hover:bg-[#6855ad]">${copy.finalButton}${icons.arrow}</a></div>
        </div>
      </section>

      <footer class="border-t border-[#e9e2f2] bg-white">
        <div class="mx-auto grid max-w-7xl gap-6 px-5 py-7 sm:px-8 sm:py-8 md:grid-cols-[1fr_auto] md:items-end">
          <div>${brandMark(`/${locale}`, true)}<p class="mt-4 max-w-md text-sm leading-6 text-[#697f77]">${copy.footerText}</p></div>
          <div class="flex flex-wrap gap-x-6 gap-y-3 text-sm text-[#596d65]"><a href="/${locale}/privacy-policy" class="hover:text-[#2b174d]">${copy.navPrivacy}</a><a href="/${locale}/terms" class="hover:text-[#2b174d]">${copy.terms}</a><a href="/${locale}/privacy-request" class="hover:text-[#2b174d]">${copy.dataRequest}</a></div>
        </div>
      </footer>
    </main>`,
    {
      locale,
      description: copy.description,
      canonical,
      alternates: {
        en: "https://memboux.com/en",
        el: "https://memboux.com/el",
        fr: "https://memboux.com/fr",
        de: "https://memboux.com/de",
        es: "https://memboux.com/es",
        it: "https://memboux.com/it",
        "x-default": "https://memboux.com/en",
      },
      index: true,
      structuredData: {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: "Memboux",
        url: canonical,
        applicationCategory: "PhotographyApplication",
        operatingSystem: "Web",
        description: copy.description,
        inLanguage: locale,
      },
    },
  );
}
