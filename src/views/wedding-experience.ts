import { UPLOAD_ACCEPT } from "../config";
import type { LikeableMediaRow } from "../media-likes";
import type { Locale } from "../i18n";
import { esc } from "../utils";
import {
  bulkSelectionScript,
  cards,
  galleryFilterControls,
  galleryFilterScript,
  lightboxMarkup,
  mediaLikesScript,
} from "./media";
import {
  mediaCommentsOverlay,
  renderGuestParticipation,
  type GuestbookPreview,
  type GuestParticipationSettings,
} from "./experience";
import { shareIconButtons } from "./share";
import { uploadLimitsCopy } from "./upload";

export type WeddingExperienceSettings = GuestParticipationSettings & {
  slideshow_enabled: number;
};

type WeddingExperienceInput = {
  code: string;
  eventName: string;
  locale: Locale;
  guestUrl: string;
  guestQrSvg: string;
  guestItems: LikeableMediaRow[];
  officialItems: LikeableMediaRow[];
  guestbookEntries: GuestbookPreview[];
  settings: WeddingExperienceSettings;
  curatorName: string;
};

const tr = (locale: Locale, values: Record<Locale, string>) => values[locale];

export function renderWeddingExperience(input: WeddingExperienceInput) {
  const { code, eventName, locale, guestUrl, guestQrSvg, guestbookEntries, settings } = input;
  const guestItems = input.guestItems.filter((item) => item.media_type === "image");
  const officialItems = input.officialItems.filter((item) => item.media_type === "image");
  const selectText = tr(locale, { en: "Select", el: "Επιλογή", fr: "Sélectionner", de: "Auswählen", es: "Seleccionar", it: "Seleziona" });
  const cancelText = tr(locale, { en: "Cancel", el: "Ακύρωση", fr: "Annuler", de: "Abbrechen", es: "Cancelar", it: "Annulla" });
  const downloadText = tr(locale, { en: "Download selected", el: "Λήψη επιλεγμένων", fr: "Télécharger la sélection", de: "Auswahl herunterladen", es: "Descargar selección", it: "Scarica selezionate" });
  const selectionScript = bulkSelectionScript({
    selectButtonId: "wedding-select-media",
    cardSelector: "#guest-moments .selectable-media",
    selectorSelector: "#guest-moments .media-selector",
    checkboxSelector: "#guest-moments .media-select",
    tickSelector: "#guest-moments .selection-tick",
    selectText,
    cancelText,
    actions: [{ buttonId: "wedding-download-selected", label: downloadText, kind: "download" }],
  });
  const experienceStyles = `<style>.w-integrated{background:var(--w-bg);color:var(--w-ink)}.w-integrated-alt{background:var(--w-panel)}.w-guest-grid{display:grid;gap:1rem;margin-top:3rem}.w-integrated-card{border:1px solid color-mix(in srgb,var(--w-ink) 14%,transparent);background:color-mix(in srgb,var(--w-panel) 94%,transparent);padding:clamp(1.25rem,4vw,2.5rem)}.w-integrated-card h3{margin:.4rem 0;font-family:var(--w-display);font-size:clamp(1.8rem,4vw,3rem);font-weight:400}.w-integrated-card p{line-height:1.7}.w-card-kicker{color:var(--w-accent);font-size:.68rem;font-weight:750;letter-spacing:.2em;text-transform:uppercase}.w-qr{width:min(12rem,70%);margin:1.5rem auto;background:#fff;padding:.75rem}.w-integrated-button{display:inline-flex;min-height:3rem;align-items:center;justify-content:center;border:0;background:var(--w-ink);padding:.75rem 1.2rem;color:var(--w-bg);font-size:.76rem;font-weight:750;letter-spacing:.06em;text-decoration:none;text-transform:uppercase}.w-integrated-button.secondary{margin-top:1rem;border:1px solid color-mix(in srgb,var(--w-ink) 20%,transparent);background:transparent;color:var(--w-ink)}.w-section-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:1.5rem}.w-section-head h2{font-size:clamp(2.8rem,6vw,5.5rem)}.w-select-actions{display:flex;gap:.5rem}.w-select-actions button{border:1px solid color-mix(in srgb,var(--w-ink) 24%,transparent);padding:.65rem 1rem;font-size:.75rem;font-weight:700}.w-select-actions button:last-child{background:var(--w-ink);color:var(--w-bg)}.w-empty{margin-top:2rem;border:1px dashed color-mix(in srgb,var(--w-ink) 25%,transparent);padding:3rem;text-align:center}.w-count{display:flex;height:3rem;min-width:3rem;align-items:center;justify-content:center;border:1px solid color-mix(in srgb,var(--w-ink) 20%,transparent);border-radius:50%;font-weight:700}.w-live{background:#080b0a;color:#f3efe5}.w-live .w-eyebrow{color:#86b9a6}.w-live-stage{position:relative;display:flex;min-height:min(70vh,44rem);margin-top:3rem;align-items:center;justify-content:center;overflow:hidden;background:#020303;color:#ffffff8f}.w-live-image{position:absolute;inset:0;height:100%;width:100%;object-fit:contain;animation:w-live-in .7s ease}.w-live-meta{display:flex;justify-content:space-between;gap:1rem;padding-top:1rem;color:#ffffff9c;font-size:.75rem}.w-share-card [data-native-share],.w-share-card [data-message-app],.w-share-card a{cursor:pointer}@media(min-width:760px){.w-guest-grid{grid-template-columns:minmax(0,1.35fr) minmax(18rem,.65fr)}}@keyframes w-live-in{from{opacity:0;transform:scale(.985)}to{opacity:1;transform:none}}</style>`;
  const uploadTitle = tr(locale, { en: "Add your moments", el: "Πρόσθεσε τις στιγμές σου", fr: "Ajoutez vos moments", de: "Füge deine Momente hinzu", es: "Añade tus momentos", it: "Aggiungi i tuoi momenti" });
  const uploadCopy = tr(locale, { en: "No app or account needed. Select many photos at once.", el: "Χωρίς εφαρμογή ή εγγραφή. Επίλεξε πολλές φωτογραφίες μαζί.", fr: "Sans application ni compte. Sélectionnez plusieurs photos à la fois.", de: "Keine App und kein Konto nötig. Wähle mehrere Fotos gleichzeitig.", es: "Sin app ni cuenta. Selecciona varias fotos a la vez.", it: "Nessuna app o account. Seleziona più foto insieme." });
  const confirmation = tr(locale, { en: "I confirm that I may upload this content and that it does not unlawfully infringe anyone’s privacy or rights.", el: "Επιβεβαιώνω ότι έχω δικαίωμα να ανεβάσω αυτό το περιεχόμενο και ότι δεν παραβιάζει παράνομα την ιδιωτικότητα ή τα δικαιώματα άλλων.", fr: "Je confirme avoir le droit d’ajouter ce contenu et ne pas porter atteinte aux droits ou à la vie privée d’autrui.", de: "Ich bestätige, dass ich diese Inhalte hochladen darf und keine Rechte oder Privatsphäre Dritter verletze.", es: "Confirmo que puedo subir este contenido y que no vulnera derechos ni privacidad de terceros.", it: "Confermo di poter caricare questi contenuti senza violare diritti o privacy altrui." });
  const emptyGuest = tr(locale, { en: "The first shared moment is waiting for you.", el: "Η πρώτη κοινή στιγμή περιμένει εσένα.", fr: "Le premier moment partagé vous attend.", de: "Der erste gemeinsame Moment wartet auf dich.", es: "El primer momento compartido te espera.", it: "Il primo momento condiviso ti aspetta." });
  const officialTitle = tr(locale, { en: "The professional album", el: "Το professional album", fr: "L’album professionnel", de: "Das professionelle Album", es: "El álbum profesional", it: "L’album professionale" });
  const officialEmpty = tr(locale, { en: "The curated professional collection will appear here when it is ready.", el: "Η επιμελημένη συλλογή του επαγγελματία θα εμφανιστεί εδώ μόλις είναι έτοιμη.", fr: "La collection professionnelle apparaîtra ici lorsqu’elle sera prête.", de: "Die kuratierte professionelle Sammlung erscheint hier, sobald sie bereit ist.", es: "La colección profesional aparecerá aquí cuando esté lista.", it: "La raccolta professionale apparirà qui quando sarà pronta." });
  const liveTitle = tr(locale, { en: "Live moments", el: "Live στιγμές", fr: "Moments en direct", de: "Live-Momente", es: "Momentos en directo", it: "Momenti live" });
  const liveEmpty = tr(locale, { en: "New uploads will appear here automatically.", el: "Τα νέα uploads θα εμφανίζονται εδώ αυτόματα.", fr: "Les nouveaux ajouts apparaîtront automatiquement ici.", de: "Neue Uploads erscheinen hier automatisch.", es: "Las nuevas fotos aparecerán aquí automáticamente.", it: "I nuovi upload appariranno qui automaticamente." });

  const html = `<section id="guest-experience" class="w-section w-integrated"><div class="w-inner"><p class="w-eyebrow">Guest experience</p><h2>${esc(tr(locale, { en: "Everything happens here", el: "Όλα συμβαίνουν εδώ", fr: "Tout se passe ici", de: "Alles passiert hier", es: "Todo sucede aquí", it: "Tutto accade qui" }))}</h2><p class="w-story-copy">${esc(tr(locale, { en: "Upload, share, respond and celebrate without leaving the event page.", el: "Ανέβασε, μοιράσου, απάντησε και γιόρτασε χωρίς να φύγεις από τη σελίδα του event.", fr: "Ajoutez, partagez, répondez et célébrez sans quitter la page.", de: "Hochladen, teilen, antworten und feiern – alles auf einer Seite.", es: "Sube, comparte, responde y celebra sin salir de la página.", it: "Carica, condividi, rispondi e festeggia senza lasciare la pagina." }))}</p><div class="w-guest-grid"><article id="guest-upload" class="w-integrated-card"><p class="w-card-kicker">Guest uploads</p><h3>${esc(uploadTitle)}</h3><p>${esc(uploadCopy)}</p><form data-multi-upload action="/api/upload/${encodeURIComponent(code)}" method="post" enctype="multipart/form-data" class="mt-6 space-y-3"><input type="hidden" name="locale" value="${locale}"><input name="name" maxlength="60" placeholder="${esc(tr(locale, { en: "Your name", el: "Το όνομά σου", fr: "Votre nom", de: "Dein Name", es: "Tu nombre", it: "Il tuo nome" }))}" class="w-full rounded-xl border px-4 py-3"><input name="file" required multiple type="file" accept="${UPLOAD_ACCEPT}" class="w-full rounded-xl border p-3"><p class="text-xs opacity-70">${esc(uploadLimitsCopy(locale))}</p><label class="flex cursor-pointer items-start gap-3 border border-current/10 bg-white/60 p-4 text-sm leading-6"><input name="upload_confirmation" value="accepted" required type="checkbox" class="mt-1 h-4 w-4 shrink-0"><span>${esc(confirmation)}</span></label><button class="w-integrated-button w-full">${esc(tr(locale, { en: "Upload to album", el: "Ανέβασμα στο album", fr: "Ajouter à l’album", de: "Zum Album hochladen", es: "Subir al álbum", it: "Carica nell’album" }))}</button></form></article><aside class="w-integrated-card w-share-card"><p class="w-card-kicker">QR & Share</p><h3>${esc(tr(locale, { en: "Invite more guests", el: "Κάλεσε και άλλους", fr: "Invitez d’autres personnes", de: "Weitere Gäste einladen", es: "Invita a más personas", it: "Invita altri ospiti" }))}</h3><div class="w-qr">${guestQrSvg}</div>${shareIconButtons(guestUrl, eventName, locale, false)}<button id="copy-wedding-link" type="button" class="w-integrated-button secondary w-full">${esc(tr(locale, { en: "Copy event link", el: "Αντιγραφή link event", fr: "Copier le lien", de: "Event-Link kopieren", es: "Copiar enlace", it: "Copia link" }))}</button></aside></div></div></section>
  <section id="guest-moments" class="w-section w-integrated w-integrated-alt"><div class="w-inner"><div class="w-section-head"><div><p class="w-eyebrow">Guest moments</p><h2>${esc(tr(locale, { en: "Shared gallery", el: "Κοινό gallery", fr: "Galerie partagée", de: "Gemeinsame Galerie", es: "Galería compartida", it: "Gallery condivisa" }))}</h2>${galleryFilterControls(guestItems, "wedding-guest-gallery", locale)}</div><div class="w-select-actions"><button id="wedding-select-media" type="button">${esc(selectText)}</button><button id="wedding-download-selected" type="button" class="hidden">${esc(downloadText)}</button></div></div>${guestItems.length ? `<div data-gallery-grid="wedding-guest-gallery" class="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">${cards(guestItems, { selectable: true, deferredSelection: true, lightbox: true, reportCode: code, locale, likes: true })}</div>` : `<p class="w-empty">${esc(emptyGuest)}</p>`}</div></section>
  ${renderGuestParticipation(code, guestbookEntries, locale, settings)}
  <section id="official-album" class="w-section w-integrated"><div class="w-inner"><p class="w-eyebrow">Memboux Studio</p><div class="w-section-head"><div><h2>${esc(officialTitle)}</h2><p class="w-story-copy">${esc(tr(locale, { en: `Curated by ${input.curatorName}.`, el: `Σε επιμέλεια ${input.curatorName}.`, fr: `Sélectionné par ${input.curatorName}.`, de: `Kuratiert von ${input.curatorName}.`, es: `Seleccionado por ${input.curatorName}.`, it: `A cura di ${input.curatorName}.` }))}</p></div><span class="w-count">${officialItems.length}</span></div>${officialItems.length ? `<div class="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">${cards(officialItems, { lightbox: true, locale, likes: true })}</div>` : `<p class="w-empty">${esc(officialEmpty)}</p>`}</div></section>
  ${settings.slideshow_enabled ? `<section id="live" class="w-section w-live"><div class="w-inner"><div class="w-section-head"><div><p class="w-eyebrow">● Memboux Live</p><h2>${esc(liveTitle)}</h2><p class="w-story-copy">${esc(liveEmpty)}</p></div><a href="/gallery/${encodeURIComponent(code)}/slideshow?lang=${locale}" target="_blank" rel="noopener" class="w-integrated-button">${esc(tr(locale, { en: "Open fullscreen", el: "Πλήρης οθόνη", fr: "Plein écran", de: "Vollbild", es: "Pantalla completa", it: "Schermo intero" }))}</a></div><div id="wedding-live-stage" class="w-live-stage"><p>${esc(liveEmpty)}</p></div><div class="w-live-meta"><span id="wedding-live-uploader"></span><span id="wedding-live-count">0 / 0</span></div></div></section>` : ""}`;

  const liveScript = settings.slideshow_enabled ? `<script>(()=>{const stage=document.getElementById('wedding-live-stage'),count=document.getElementById('wedding-live-count'),uploader=document.getElementById('wedding-live-uploader');if(!stage)return;let items=[],index=0,signature='',timer;const render=()=>{clearTimeout(timer);if(!items.length)return;const item=items[index%items.length],image=document.createElement('img');image.src=item.url+'?variant=preview';image.alt='';image.className='w-live-image';stage.replaceChildren(image);count.textContent=(index+1)+' / '+items.length;uploader.textContent=item.uploaded_by?${JSON.stringify(tr(locale, { en: "Uploaded by ", el: "Ανέβηκε από ", fr: "Ajouté par ", de: "Hochgeladen von ", es: "Subido por ", it: "Caricata da " }))}+item.uploaded_by:'';timer=setTimeout(()=>{index=(index+1)%items.length;render()},5000)};const refresh=async()=>{try{const response=await fetch('/api/gallery/${encodeURIComponent(code)}/slideshow-feed',{credentials:'include',cache:'no-store'});if(!response.ok)return;const data=await response.json(),next=(data.items||[]).filter(item=>item.media_type==='image'),nextSignature=next.map(item=>item.id).join(',');if(nextSignature!==signature){const current=items[index]?.id;items=next;signature=nextSignature;index=Math.max(0,items.findIndex(item=>item.id===current));render()}}catch{}};refresh();setInterval(refresh,5000)})()<\/script>` : "";
  const scripts = `${galleryFilterScript(guestItems, "wedding-guest-gallery")}${lightboxMarkup(locale, true)}${settings.comments_enabled === 0 ? "" : mediaCommentsOverlay(code, locale)}${selectionScript}${mediaLikesScript(code, locale)}${liveScript}<script>(()=>{const button=document.getElementById('copy-wedding-link');button?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(${JSON.stringify(guestUrl)});button.textContent=${JSON.stringify(tr(locale, { en: "Link copied", el: "Το link αντιγράφηκε", fr: "Lien copié", de: "Link kopiert", es: "Enlace copiado", it: "Link copiato" }))}}catch{}})})()<\/script>`;
  return { html: `${experienceStyles}${html}`, scripts };
}
