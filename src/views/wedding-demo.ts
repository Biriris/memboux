import type { EventRow } from "../domain";
import { localeNames, supportedLocales, type Locale } from "../i18n";
import { esc } from "../utils";
import { weddingThemeFor, weddingThemes, type WeddingThemeKey } from "../wedding-themes";
import { renderWeddingPage, type PublicWeddingProfile } from "./wedding-page";
import { brandMark, page } from "./shared";

const demoCopy: Record<Locale, {
  eventName: string;
  location: string;
  welcome: string;
  story: string;
  ceremony: string;
  reception: string;
  dressCode: string;
  travel: string;
  stay: string;
  gift: string;
}> = {
  el: {
    eventName: "Ο γάμος του Alex & της Maria", location: "Σαντορίνη, Ελλάδα",
    welcome: "Με χαρά σας προσκαλούμε να γιορτάσετε μαζί μας.",
    story: "Μια ιστορία που ξεκίνησε τυχαία και έγινε το αγαπημένο μας ταξίδι.",
    ceremony: "Παρεκκλήσι Αγίου Νικολάου, Οία", reception: "Κτήμα Ηλιοβασίλεμα",
    dressCode: "Καλοκαιρινό επίσημο", travel: "Η μεταφορά από τα Φηρά αναχωρεί στις 16:30.",
    stay: "Προτεινόμενα καταλύματα στην Οία και στα Φηρά.", gift: "Η παρουσία σας είναι το καλύτερο δώρο.",
  },
  en: {
    eventName: "Alex & Maria's wedding", location: "Santorini, Greece",
    welcome: "We joyfully invite you to celebrate with us.",
    story: "A story that began by chance and became our favorite journey.",
    ceremony: "Saint Nicholas Chapel, Oia", reception: "Sunset Estate",
    dressCode: "Summer formal", travel: "Guest transport leaves Fira at 16:30.",
    stay: "Recommended stays in Oia and Fira.", gift: "Your presence is the greatest gift.",
  },
  fr: {
    eventName: "Le mariage d’Alex et Maria", location: "Santorin, Grèce",
    welcome: "Nous avons la joie de vous inviter à célébrer avec nous.",
    story: "Une histoire née par hasard et devenue notre plus beau voyage.",
    ceremony: "Chapelle Saint-Nicolas, Oia", reception: "Domaine du Coucher de Soleil",
    dressCode: "Tenue d’été élégante", travel: "La navette quitte Fira à 16 h 30.",
    stay: "Hébergements recommandés à Oia et Fira.", gift: "Votre présence est notre plus beau cadeau.",
  },
  de: {
    eventName: "Die Hochzeit von Alex & Maria", location: "Santorin, Griechenland",
    welcome: "Wir freuen uns, diesen besonderen Tag mit euch zu feiern.",
    story: "Eine Geschichte, die zufällig begann und zu unserer schönsten Reise wurde.",
    ceremony: "Kapelle des Heiligen Nikolaus, Oia", reception: "Sunset-Anwesen",
    dressCode: "Sommerlich elegant", travel: "Der Shuttle fährt um 16:30 Uhr in Fira ab.",
    stay: "Empfohlene Unterkünfte in Oia und Fira.", gift: "Eure Anwesenheit ist das schönste Geschenk.",
  },
  es: {
    eventName: "La boda de Alex y Maria", location: "Santorini, Grecia",
    welcome: "Nos hace mucha ilusión invitarte a celebrar con nosotros.",
    story: "Una historia que empezó por casualidad y se convirtió en nuestro viaje favorito.",
    ceremony: "Capilla de San Nicolás, Oia", reception: "Finca Atardecer",
    dressCode: "Elegante de verano", travel: "El transporte sale de Fira a las 16:30.",
    stay: "Alojamientos recomendados en Oia y Fira.", gift: "Tu presencia es el mejor regalo.",
  },
  it: {
    eventName: "Il matrimonio di Alex e Maria", location: "Santorini, Grecia",
    welcome: "Siamo felici di invitarvi a festeggiare insieme a noi.",
    story: "Una storia iniziata per caso e diventata il nostro viaggio preferito.",
    ceremony: "Cappella di San Nicola, Oia", reception: "Tenuta del Tramonto",
    dressCode: "Elegante estivo", travel: "La navetta parte da Fira alle 16:30.",
    stay: "Alloggi consigliati a Oia e Fira.", gift: "La vostra presenza è il regalo più bello.",
  },
};

const demoPageCopy: Record<Locale, {
  previewLanguage: string;
  create: string;
  headline: string;
  lead: string;
  device: string;
  start: string;
  description: string;
}> = {
  el: { previewLanguage: "Γλώσσα προεπισκόπησης", create: "Δημιούργησε τον γάμο σου", headline: "Εξερεύνησε και τα 15 σχέδια γάμου.", lead: "Πραγματική προεπισκόπηση με RSVP, βιβλίο ευχών, πρόγραμμα, ταξιδιωτικές πληροφορίες και όλες τις βασικές λειτουργίες.", device: "Συσκευή", start: "Ξεκίνα χωρίς κάρτα", description: "Διαδραστική προεπισκόπηση των σχεδίων γάμου του Memboux." },
  en: { previewLanguage: "Preview language", create: "Create your wedding", headline: "Explore all 15 wedding art directions.", lead: "A real responsive preview with RSVP, guestbook, schedule, travel information, and every essential feature.", device: "Device", start: "Start without a card", description: "Interactive preview of Memboux wedding templates." },
  fr: { previewLanguage: "Langue de l’aperçu", create: "Créer votre mariage", headline: "Explorez les 15 univers graphiques du mariage.", lead: "Un aperçu responsive complet avec RSVP, livre d’or, programme, informations de voyage et toutes les fonctions essentielles.", device: "Appareil", start: "Commencer sans carte", description: "Aperçu interactif des modèles de mariage Memboux." },
  de: { previewLanguage: "Vorschau-Sprache", create: "Hochzeit erstellen", headline: "Entdecke alle 15 Hochzeitsdesigns.", lead: "Eine echte responsive Vorschau mit RSVP, Gästebuch, Ablauf, Reiseinformationen und allen wichtigen Funktionen.", device: "Gerät", start: "Ohne Karte starten", description: "Interaktive Vorschau der Memboux-Hochzeitsdesigns." },
  es: { previewLanguage: "Idioma de la vista previa", create: "Crear tu boda", headline: "Explora los 15 estilos de boda.", lead: "Una vista previa responsive real con RSVP, libro de visitas, programa, información de viaje y todas las funciones esenciales.", device: "Dispositivo", start: "Empezar sin tarjeta", description: "Vista previa interactiva de las plantillas de boda de Memboux." },
  it: { previewLanguage: "Lingua dell’anteprima", create: "Crea il tuo matrimonio", headline: "Esplora tutti i 15 stili per il matrimonio.", lead: "Un’anteprima responsive reale con RSVP, guestbook, programma, informazioni di viaggio e tutte le funzioni essenziali.", device: "Dispositivo", start: "Inizia senza carta", description: "Anteprima interattiva dei template matrimonio Memboux." },
};

const demoDeviceLabels: Record<Locale, readonly [string, string, string]> = {
  en: ["Mobile", "Tablet", "Desktop"],
  el: ["Κινητό", "Tablet", "Υπολογιστής"],
  fr: ["Mobile", "Tablette", "Ordinateur"],
  de: ["Mobil", "Tablet", "Desktop"],
  es: ["Móvil", "Tableta", "Ordenador"],
  it: ["Mobile", "Tablet", "Computer"],
};

const demoText = (locale: Locale, values: Record<Locale, string>) => values[locale];

function weddingDemoExperience(locale: Locale) {
  const text = (en: string, el: string, fr: string, de: string, es: string, it: string) =>
    demoText(locale, { en, el, fr, de, es, it });
  const rsvpSuccess = text(
    "Attendance confirmed in this preview.",
    "Η παρουσία επιβεβαιώθηκε σε αυτή την προεπισκόπηση.",
    "La présence est confirmée dans cet aperçu.",
    "Die Teilnahme wurde in dieser Vorschau bestätigt.",
    "La asistencia se confirmó en esta vista previa.",
    "La presenza è stata confermata in questa anteprima.",
  );
  const guestbookSuccess = text(
    "Your wish appears here in the preview.",
    "Η ευχή σου εμφανίζεται εδώ στην προεπισκόπηση.",
    "Votre message apparaît ici dans l’aperçu.",
    "Euer Wunsch erscheint hier in der Vorschau.",
    "Tu mensaje aparece aquí en la vista previa.",
    "Il tuo messaggio appare qui nell’anteprima.",
  );
  const uploadChoose = text(
    "Choose at least one photo or video first.",
    "Επίλεξε πρώτα τουλάχιστον μία φωτογραφία ή ένα βίντεο.",
    "Choisissez d’abord au moins une photo ou vidéo.",
    "Wähle zuerst mindestens ein Foto oder Video aus.",
    "Elige primero al menos una foto o un vídeo.",
    "Scegli prima almeno una foto o un video.",
  );
  const uploadReady = text(
    "Ready for upload in a real event. Nothing was sent from this preview.",
    "Έτοιμο για ανέβασμα σε πραγματική εκδήλωση. Τίποτα δεν στάλθηκε από την προεπισκόπηση.",
    "Prêt pour l’ajout dans un véritable événement. Rien n’a été envoyé depuis cet aperçu.",
    "Bereit zum Hochladen in einem echten Event. Aus dieser Vorschau wurde nichts gesendet.",
    "Listo para subir en un evento real. No se envió nada desde esta vista previa.",
    "Pronto per il caricamento in un evento reale. Da questa anteprima non è stato inviato nulla.",
  );
  return `<style>
    .w-demo-note{margin-top:1rem;color:color-mix(in srgb,var(--w-ink) 65%,transparent);font-size:.78rem;line-height:1.6}
    .w-demo-grid{display:grid;gap:clamp(1rem,3vw,2rem);margin-top:clamp(2rem,5vw,4rem)}
    .w-demo-card{border:1px solid color-mix(in srgb,var(--w-ink) 16%,transparent);background:var(--w-panel);padding:clamp(1.25rem,3vw,2.25rem)}
    .w-demo-card h3{margin:.4rem 0 1rem;font-family:var(--w-display);font-size:clamp(1.5rem,3vw,2.25rem);font-weight:400}
    .w-demo-form{display:grid;gap:.85rem}.w-demo-form :is(input,select,textarea){width:100%;border:1px solid color-mix(in srgb,var(--w-ink) 22%,transparent);background:var(--w-bg);padding:.9rem 1rem;color:var(--w-ink);font:inherit}.w-demo-form button{border:0;background:var(--w-ink);padding:1rem 1.2rem;color:var(--w-bg);font-weight:700}
    .w-demo-result{min-height:1.4rem;margin:0;color:var(--w-accent);font-size:.82rem;font-weight:700;line-height:1.5}
    .w-demo-upload{max-width:38rem;margin-top:2rem}.w-demo-upload input[type=file]{padding:.8rem;background:var(--w-panel)}
    .w-demo-gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.65rem;margin-top:2rem}.w-demo-photo{display:grid;min-height:clamp(8rem,22vw,18rem);place-items:end start;overflow:hidden;padding:1rem;background:linear-gradient(145deg,color-mix(in srgb,var(--w-accent) 78%,var(--w-ink)),var(--w-soft));color:#fff;font-size:.7rem;font-weight:750;letter-spacing:.12em;text-transform:uppercase}.w-demo-photo:nth-child(2){background:linear-gradient(35deg,var(--w-ink),var(--w-accent))}.w-demo-photo:nth-child(3){background:linear-gradient(160deg,var(--w-soft),var(--w-ink))}
    .w-demo-live{display:grid;min-height:clamp(18rem,48vw,34rem);place-items:center;margin-top:2rem;background:radial-gradient(circle at 30% 30%,var(--w-accent),transparent 32%),linear-gradient(135deg,var(--w-ink),color-mix(in srgb,var(--w-ink) 72%,#000));color:#fff;text-align:center}.w-demo-live strong{display:block;font-family:var(--w-display);font-size:clamp(2rem,5vw,4rem);font-weight:400}.w-demo-live span{display:block;margin-top:.7rem;font-size:.72rem;letter-spacing:.16em;text-transform:uppercase}
    @media(min-width:760px){.w-demo-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:560px){.w-demo-gallery{grid-template-columns:1fr 1fr}.w-demo-photo:last-child{grid-column:1/-1}}
  </style>
  <section id="guest-experience" class="w-section w-integrated"><div class="w-inner">
    <p class="w-eyebrow">${esc(text("RSVP & Guestbook", "RSVP & Ευχολόγιο", "RSVP et livre d’or", "RSVP & Gästebuch", "RSVP y libro de visitas", "RSVP e libro degli ospiti"))}</p>
    <h2>${esc(text("Join the celebration", "Γίνε μέρος της γιορτής", "Participez à la fête", "Feiert mit uns", "Únete a la celebración", "Partecipa alla festa"))}</h2>
    <p class="w-demo-note">${esc(text("This is a safe preview. The controls demonstrate the guest experience without sending or saving data.", "Αυτή είναι ασφαλής προεπισκόπηση. Τα πεδία δείχνουν την εμπειρία καλεσμένου χωρίς αποστολή ή αποθήκευση δεδομένων.", "Ceci est un aperçu sécurisé. Aucune donnée n’est envoyée ni enregistrée.", "Dies ist eine sichere Vorschau. Es werden keine Daten gesendet oder gespeichert.", "Esta es una vista previa segura. No se envían ni guardan datos.", "Questa è un’anteprima sicura. Nessun dato viene inviato o salvato."))}</p>
    <div class="w-demo-grid">
      <article class="w-demo-card"><p class="w-eyebrow">RSVP</p><h3>${esc(text("Will you be there?", "Θα είσαι μαζί μας;", "Serez-vous parmi nous ?", "Seid ihr dabei?", "¿Nos acompañas?", "Sarai con noi?"))}</h3><form class="w-demo-form" data-wedding-demo-action="rsvp"><input required aria-label="${esc(text("Your name", "Το όνομά σου", "Votre nom", "Dein Name", "Tu nombre", "Il tuo nome"))}" placeholder="${esc(text("Your name", "Το όνομά σου", "Votre nom", "Dein Name", "Tu nombre", "Il tuo nome"))}"><select aria-label="RSVP"><option>${esc(text("Joyfully accepts", "Θα παρευρεθώ με χαρά", "Accepte avec joie", "Gerne dabei", "Acepto con ilusión", "Parteciperò con gioia"))}</option><option>${esc(text("Sadly declines", "Δεν θα μπορέσω να παρευρεθώ", "Décline avec regret", "Leider verhindert", "No podré asistir", "Non potrò partecipare"))}</option></select><button type="submit">${esc(text("Confirm attendance", "Επιβεβαίωση παρουσίας", "Confirmer", "Teilnahme bestätigen", "Confirmar asistencia", "Conferma presenza"))}</button><p class="w-demo-result" role="status" aria-live="polite"></p></form></article>
      <article class="w-demo-card"><p class="w-eyebrow">${esc(text("Guestbook", "Ευχολόγιο", "Livre d’or", "Gästebuch", "Libro de visitas", "Libro degli ospiti"))}</p><h3>${esc(text("Leave a wish", "Άφησε μια ευχή", "Laissez un message", "Hinterlasst einen Wunsch", "Deja un mensaje", "Lascia un messaggio"))}</h3><form class="w-demo-form" data-wedding-demo-action="guestbook"><input required aria-label="${esc(text("Your name", "Το όνομά σου", "Votre nom", "Dein Name", "Tu nombre", "Il tuo nome"))}" placeholder="${esc(text("Your name", "Το όνομά σου", "Votre nom", "Dein Name", "Tu nombre", "Il tuo nome"))}"><textarea required rows="4" aria-label="${esc(text("Your message", "Η ευχή σου", "Votre message", "Eure Nachricht", "Tu mensaje", "Il tuo messaggio"))}" placeholder="${esc(text("Write something for the couple…", "Γράψε κάτι για το ζευγάρι…", "Écrivez un mot pour le couple…", "Schreibt dem Paar etwas…", "Escribe algo para la pareja…", "Scrivi qualcosa per gli sposi…"))}"></textarea><button type="submit">${esc(text("Add to guestbook", "Προσθήκη στο ευχολόγιο", "Ajouter au livre d’or", "Ins Gästebuch eintragen", "Añadir al libro", "Aggiungi al libro degli ospiti"))}</button><p class="w-demo-result" role="status" aria-live="polite"></p></form></article>
    </div>
  </div></section>
  <section id="guest-upload" class="w-section w-integrated w-story"><div class="w-inner"><p class="w-eyebrow">Memboux Guest Moments</p><h2>${esc(text("Every perspective, together", "Κάθε οπτική, μαζί", "Tous les points de vue, réunis", "Jede Perspektive, gemeinsam", "Cada perspectiva, reunida", "Ogni prospettiva, insieme"))}</h2><p class="w-story-copy">${esc(text("Guests upload the photos and videos they captured, so moments do not remain forgotten on separate phones.", "Οι καλεσμένοι ανεβάζουν τις φωτογραφίες και τα βίντεο που τράβηξαν, ώστε οι στιγμές να μη μείνουν ξεχασμένες σε διαφορετικά κινητά.", "Les invités ajoutent leurs photos et vidéos pour qu’aucun souvenir ne reste oublié sur un téléphone.", "Gäste laden ihre Fotos und Videos hoch, damit keine Erinnerung auf einzelnen Handys verloren geht.", "Los invitados suben sus fotos y vídeos para que ningún recuerdo quede olvidado en móviles separados.", "Gli invitati caricano foto e video perché nessun ricordo resti dimenticato sui singoli telefoni."))}</p><form class="w-demo-form w-demo-upload" data-wedding-demo-action="upload"><input type="file" multiple accept="image/*,video/*" aria-label="${esc(text("Choose photos or videos", "Επιλογή φωτογραφιών ή βίντεο", "Choisir des photos ou vidéos", "Fotos oder Videos auswählen", "Elegir fotos o vídeos", "Scegli foto o video"))}"><button type="button">${esc(text("Add my moments", "Προσθήκη των στιγμών μου", "Ajouter mes moments", "Meine Momente hinzufügen", "Añadir mis momentos", "Aggiungi i miei momenti"))}</button><p class="w-demo-result" role="status" aria-live="polite"></p></form><div class="w-demo-gallery"><div class="w-demo-photo">${esc(text("Maria’s view", "Η οπτική της Μαρίας", "Le regard de Maria", "Marias Blick", "La mirada de Maria", "Lo sguardo di Maria"))}</div><div class="w-demo-photo">${esc(text("Nikos’ view", "Η οπτική του Νίκου", "Le regard de Nikos", "Nikos’ Blick", "La mirada de Nikos", "Lo sguardo di Nikos"))}</div><div class="w-demo-photo">${esc(text("The whole table", "Όλο το τραπέζι", "Toute la table", "Der ganze Tisch", "Toda la mesa", "Tutto il tavolo"))}</div></div></div></section>
  <section id="official-album" class="w-section w-integrated"><div class="w-inner"><p class="w-eyebrow">Memboux Studio</p><h2>${esc(text("Official album", "Επίσημο άλμπουμ", "Album officiel", "Offizielles Album", "Álbum oficial", "Album ufficiale"))}</h2><p class="w-story-copy">${esc(text("Professional photographs live beside guest moments, clearly curated and never mixed up.", "Οι επαγγελματικές φωτογραφίες βρίσκονται δίπλα στις στιγμές των καλεσμένων, καθαρά οργανωμένες και χωρίς να μπερδεύονται.", "Les photos professionnelles restent clairement organisées à côté des moments des invités.", "Professionelle Fotos bleiben klar kuratiert neben den Gästemomenten.", "Las fotos profesionales quedan organizadas junto a los momentos de los invitados.", "Le foto professionali restano curate accanto ai momenti degli invitati."))}</p></div></section>
  <section id="live" class="w-section w-integrated w-moments"><div class="w-inner"><p class="w-eyebrow">● Memboux Live</p><h2>${esc(text("The celebration as it happens", "Η γιορτή την ώρα που συμβαίνει", "La fête en direct", "Die Feier, live", "La celebración en directo", "La festa in diretta"))}</h2><div class="w-demo-live"><div><strong>${esc(text("Live photo wall", "Ζωντανός τοίχος φωτογραφιών", "Mur photo en direct", "Live-Fotowand", "Muro de fotos en vivo", "Foto wall in diretta"))}</strong><span>${esc(text("New guest moments appear here", "Οι νέες στιγμές των καλεσμένων εμφανίζονται εδώ", "Les nouveaux moments apparaissent ici", "Neue Gästemomente erscheinen hier", "Los nuevos momentos aparecen aquí", "I nuovi momenti appaiono qui"))}</span></div></div></div></section>
  <script>(()=>{const messages={rsvp:${JSON.stringify(rsvpSuccess)},guestbook:${JSON.stringify(guestbookSuccess)},uploadChoose:${JSON.stringify(uploadChoose)},uploadReady:${JSON.stringify(uploadReady)}};document.querySelectorAll('[data-wedding-demo-action="rsvp"],[data-wedding-demo-action="guestbook"]').forEach(form=>form.addEventListener('submit',event=>{event.preventDefault();if(!form.reportValidity())return;const result=form.querySelector('[role=status]');if(result)result.textContent=messages[form.dataset.weddingDemoAction]}));const upload=document.querySelector('[data-wedding-demo-action="upload"]'),file=upload?.querySelector('input[type=file]'),result=upload?.querySelector('[role=status]');upload?.querySelector('button')?.addEventListener('click',()=>{if(result)result.textContent=file?.files?.length?messages.uploadReady:messages.uploadChoose})})()<\/script>`;
}

export function weddingDemoFrame(locale: Locale, theme: WeddingThemeKey) {
  const copy = demoCopy[locale];
  const event: EventRow = {
    id: "wedding-demo", code: "WEDDING-DEMO", eventName: copy.eventName,
    admin_token_hash: "", created_at: 0, expires_at: Date.now() + 86_400_000, status: "active", notes: "",
    updated_at: Date.now(), default_locale: locale, event_start_date: "2027-06-14", event_end_date: "2027-06-14",
    event_type: "wedding", location: copy.location, gallery_pin_hash: null,
    deleted_at: null, purge_at: null,
  };
  const profile: PublicWeddingProfile = {
    partner_one_name: "Alex", partner_two_name: "Maria",
    welcome_message: copy.welcome, story: copy.story,
    ceremony_at: "2027-06-14T17:30", ceremony_location: copy.ceremony,
    reception_at: "2027-06-14T20:00", reception_location: copy.reception,
    dress_code: copy.dressCode, contact_name: "Memboux Wedding Team",
    contact_email: "", contact_phone: "", travel_notes: copy.travel,
    accommodation_notes: copy.stay, gift_message: copy.gift,
    gift_url: "", template_key: theme, accent_color: weddingThemeFor(theme).defaultAccent,
  };
  return renderWeddingPage({
    event, profile, locale,
    selectedFeatures: ["rsvp", "guestbook", "live_slideshow", "calendar_links", "comments", "travel", "accommodation", "gifts", "menu"],
    coverUpdatedAt: null,
    experienceHtml: weddingDemoExperience(locale),
    demo: true,
  });
}

export function weddingDemoPage(locale: Locale, initialTheme: WeddingThemeKey = "cypress") {
  const ui = demoPageCopy[locale];
  const registerUrl = `/${locale}/register?redirect=${encodeURIComponent(`/${locale}/account?create=wedding`)}`;
  const frameBase = `/${locale}/wedding/demo-frame`;
  const languageLinks = supportedLocales.map((language) =>
    `<a data-preview-language="${language}" href="/${language}/wedding/preview?theme=${initialTheme}" lang="${language}" class="rounded-full px-3 py-2 text-xs font-bold ${language === locale ? "bg-[#2b174d] text-white" : "border border-[#e2dbec] bg-white text-[#6b5d76]"}">${esc(localeNames[language])}</a>`,
  ).join("");
  const themes = weddingThemes.map((theme) => `<button type="button" data-wedding-demo-theme="${theme.key}" data-layout="${theme.layout}" aria-pressed="${theme.key === initialTheme}" aria-label="${esc(`${theme.name[locale]}. ${theme.description[locale]}`)}" class="w-demo-choice" style="--choice-ink:${theme.palette[0]};--choice-soft:${theme.palette[1]};--choice-bg:${theme.palette[2]}"><span class="w-demo-thumb" aria-hidden="true"><i class="w-demo-thumb-image"></i><i class="w-demo-thumb-frame"></i><span><small>THE WEDDING OF</small><b>A <em>&</em> M</b><small>18 · 07 · 2027</small></span></span><span class="w-demo-choice-copy"><strong>${esc(theme.name[locale])}</strong><span>${theme.palette.map((color) => `<i style="background:${esc(color)}"></i>`).join("")}</span></span></button>`).join("");
  const deviceLabels = demoDeviceLabels[locale];
  const pickerStyles = `<style>
    .w-demo-controls{display:grid;gap:1rem;border:1px solid #e7e0f0;border-radius:1.6rem;background:#fff;padding:1rem;box-shadow:0 16px 50px #2b174d0d}
    .w-demo-rail{display:flex;gap:.75rem;overflow-x:auto;overscroll-behavior-inline:contain;padding:.2rem .15rem .7rem;scroll-snap-type:x proximity;scrollbar-width:thin;scrollbar-color:#cfc4dc transparent}
    .w-demo-choice{flex:0 0 10.5rem;scroll-snap-align:start;overflow:hidden;border:2px solid #e7e0f0;border-radius:1rem;background:#fff;padding:.35rem;color:#2b174d;text-align:left;transition:border-color .2s,box-shadow .2s,transform .2s}
    .w-demo-choice:hover{transform:translateY(-2px);box-shadow:0 10px 28px #2b174d17}.w-demo-choice[aria-pressed=true]{border-color:#7c3aed;box-shadow:0 0 0 3px #ede7ff}
    .w-demo-thumb{position:relative;display:block;aspect-ratio:16/10;overflow:hidden;border-radius:.7rem;background:var(--choice-bg);color:#fff}
    .w-demo-thumb-image{position:absolute;inset:0;background:linear-gradient(135deg,var(--choice-soft),var(--choice-ink));opacity:.9}.w-demo-thumb-image:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent,var(--choice-ink))}
    .w-demo-thumb-frame{display:none;position:absolute;z-index:1;inset:.45rem;border:1px solid #ffffff88}
    .w-demo-thumb>span{position:absolute;z-index:2;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:.65rem;text-align:center;text-shadow:0 2px 9px #0008}
    .w-demo-thumb small{font-size:.34rem;font-weight:700;letter-spacing:.2em}.w-demo-thumb b{margin:.35rem 0;font-family:Georgia,serif;font-size:1.45rem;font-weight:400;line-height:.8}.w-demo-thumb em{font-weight:400}
    .w-demo-choice[data-layout=editorial] .w-demo-thumb>span,.w-demo-choice[data-layout=poster] .w-demo-thumb>span{align-items:flex-start;justify-content:flex-end;text-align:left}
    .w-demo-choice[data-layout=split] .w-demo-thumb-image{left:48%}.w-demo-choice[data-layout=split] .w-demo-thumb>span{right:48%;align-items:flex-start;text-align:left;text-shadow:none;color:var(--choice-ink)}
    .w-demo-choice[data-layout=framed] .w-demo-thumb-frame{display:block}.w-demo-choice[data-layout=poster] .w-demo-thumb b{font-family:Arial,sans-serif;font-weight:250;text-transform:uppercase}
    .w-demo-choice-copy{display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:.65rem .35rem .35rem}.w-demo-choice-copy strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.78rem}.w-demo-choice-copy>span{display:flex}.w-demo-choice-copy i{display:block;width:.55rem;height:.55rem;border:1px solid #0001;border-radius:999px}
    .w-demo-toolbar{display:flex;flex-wrap:wrap;align-items:end;justify-content:space-between;gap:1rem;border-top:1px solid #eee8f4;padding-top:.9rem}.w-demo-toolbar-group{min-width:min(100%,19rem)}
    @media(min-width:760px){.w-demo-controls{padding:1.15rem}.w-demo-choice{flex-basis:11.5rem}}
  </style>`;
  const body = `<main class="min-h-screen bg-[#f8f5ff] text-[#172d27]"><header class="border-b border-[#e7e0f0] bg-white"><div class="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">${brandMark(`/${locale}/wedding`, true)}<div class="flex flex-wrap items-center justify-end gap-2"><nav aria-label="${esc(ui.previewLanguage)}" class="flex flex-wrap gap-1">${languageLinks}</nav><a href="${registerUrl}" class="rounded-xl bg-[#2b174d] px-5 py-2.5 text-sm font-semibold text-white">${esc(ui.create)}</a></div></div></header><section class="mx-auto max-w-[1600px] px-4 py-6 sm:px-6"><div class="max-w-4xl"><p class="text-xs font-bold uppercase tracking-[.2em] text-[#7c3aed]">Memboux Wedding</p><h1 class="mt-2 text-4xl font-medium tracking-[-.04em] sm:text-5xl">${esc(ui.headline)}</h1><p class="mt-3 leading-7 text-[#65756f]">${esc(ui.lead)}</p></div><aside class="w-demo-controls mt-6"><div class="w-demo-rail" aria-label="${esc(ui.headline)}">${themes}</div><div class="w-demo-toolbar"><div class="w-demo-toolbar-group"><p class="text-xs font-bold uppercase tracking-[.16em] text-[#65756f]">${esc(ui.device)}</p><div class="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-[#f3effa] p-1"><button type="button" data-wedding-demo-width="390px" class="rounded-lg px-2 py-2 text-xs font-bold">${esc(deviceLabels[0])}</button><button type="button" data-wedding-demo-width="820px" class="rounded-lg px-2 py-2 text-xs font-bold">${esc(deviceLabels[1])}</button><button type="button" data-wedding-demo-width="100%" aria-pressed="true" class="rounded-lg bg-white px-2 py-2 text-xs font-bold shadow-sm">${esc(deviceLabels[2])}</button></div></div><a href="${registerUrl}" class="rounded-xl bg-[#2b174d] px-6 py-3 text-center text-sm font-bold text-white">${esc(ui.start)}</a></div></aside><section class="mt-5 min-h-[76vh] overflow-auto rounded-[1.6rem] bg-[#e8e1ef] p-2 sm:p-5"><div id="wedding-demo-stage" class="mx-auto min-h-[72vh] max-w-full overflow-hidden rounded-xl bg-white shadow-[0_25px_80px_rgba(20,40,33,.2)] transition-[max-width]"><iframe id="wedding-demo-frame" src="${frameBase}?theme=${initialTheme}" data-base="${frameBase}" title="${esc(ui.previewLanguage)}" class="h-[72vh] w-full border-0"></iframe></div></section></section></main>${pickerStyles}<script>(()=>{const frame=document.getElementById('wedding-demo-frame'),stage=document.getElementById('wedding-demo-stage');let theme=${JSON.stringify(initialTheme)};const syncLanguages=()=>document.querySelectorAll('[data-preview-language]').forEach(link=>link.href='/'+link.dataset.previewLanguage+'/wedding/preview?theme='+encodeURIComponent(theme));document.querySelectorAll('[data-wedding-demo-theme]').forEach(button=>{if(button.dataset.weddingDemoTheme===theme)button.setAttribute('aria-pressed','true');else button.setAttribute('aria-pressed','false');button.addEventListener('click',()=>{theme=button.dataset.weddingDemoTheme;document.querySelectorAll('[data-wedding-demo-theme]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));frame.src=frame.dataset.base+'?theme='+encodeURIComponent(theme);button.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});syncLanguages()})});syncLanguages();document.querySelectorAll('[data-wedding-demo-width]').forEach(button=>button.addEventListener('click',()=>{stage.style.maxWidth=button.dataset.weddingDemoWidth;document.querySelectorAll('[data-wedding-demo-width]').forEach(item=>{item.setAttribute('aria-pressed',String(item===button));item.classList.toggle('bg-white',item===button);item.classList.toggle('shadow-sm',item===button)})}))})()<\/script>`;
  return page("Wedding previews | Memboux", body, {
    locale,
    description: ui.description,
    index: false,
    suppressWidgets: true,
  });
}
