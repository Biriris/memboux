import type { EventRow } from "../domain";
import type { EventVertical } from "../event-verticals";
import { verticalText } from "../event-verticals";
import { eventUiCopy } from "../event-ui-copy";
import { parseCustomFields, wizardFieldsFor } from "../event-wizard-schema";
import { localeNames, supportedLocales, type Locale } from "../i18n";
import { esc } from "../utils";
import {
  cards,
  galleryFilterControls,
  galleryFilterScript,
  galleryProgressiveControls,
  galleryProgressiveScript,
  lightboxMarkup,
  mediaLikesScript,
  type MediaCardRow,
} from "./media";
import { brandMark, page } from "./shared";
import { demoMediaFor, demoPicture, type DemoMediaAsset } from "./demo-media";

export type EventVerticalProfile = {
  event_id: string;
  headline: string;
  host_name: string;
  introduction: string;
  story: string;
  schedule_notes: string;
  guest_notes: string;
  contact_email: string;
  custom_fields_json: string;
  theme_key: "signature" | "vivid" | "editorial" | "minimal";
  wizard_step: number;
  wizard_completed_at: number | null;
  publish_status: "draft" | "published";
  updated_at: number;
};

function formatDate(value: string | null, locale: Locale) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function demoExperience(locale: Locale, vertical: EventVertical, card: string, accent: string, media: readonly DemoMediaAsset[]) {
  const text = (values: Record<Locale, string>) => values[locale];
  const interactionKind = (["bachelor", "party", "trip", "community"] as string[]).includes(vertical.type)
    ? "poll"
    : (["birthday", "baptism", "baby", "memorial", "graduation"] as string[]).includes(vertical.type)
      ? "message"
      : "rsvp";
  const interactionCopy = {
    en: {
      kicker: "Try a guest action", title: "This preview responds like the real event.",
      note: "Nothing is sent or stored in this demonstration.",
      pollTitle: "Vote for the group’s next moment", pollOne: "Golden-hour photos", pollTwo: "One more surprise", pollThree: "Straight to the celebration",
      messageTitle: "Leave a message for the hosts", name: "Your name", message: "Your message",
      rsvpTitle: "Will you be there?", yes: "Yes, count me in", no: "I cannot make it",
      submit: "Try this action", success: "Done — this is how guests receive instant confirmation.",
    },
    el: {
      kicker: "Δοκίμασε μία ενέργεια καλεσμένου", title: "Η προεπισκόπηση αντιδρά όπως το πραγματικό event.",
      note: "Σε αυτή τη δοκιμή τίποτα δεν αποστέλλεται και δεν αποθηκεύεται.",
      pollTitle: "Ψήφισε για την επόμενη στιγμή της παρέας", pollOne: "Φωτογραφίες στο ηλιοβασίλεμα", pollTwo: "Μία ακόμη έκπληξη", pollThree: "Κατευθείαν στη γιορτή",
      messageTitle: "Άφησε ένα μήνυμα στους διοργανωτές", name: "Το όνομά σου", message: "Το μήνυμά σου",
      rsvpTitle: "Θα είσαι μαζί μας;", yes: "Ναι, θα είμαι εκεί", no: "Δεν θα μπορέσω",
      submit: "Δοκίμασε την ενέργεια", success: "Έτοιμο — έτσι λαμβάνει ο καλεσμένος άμεση επιβεβαίωση.",
    },
    fr: {
      kicker: "Essayez une action invité", title: "Cet aperçu réagit comme le véritable événement.",
      note: "Rien n’est envoyé ni enregistré dans cette démonstration.",
      pollTitle: "Votez pour le prochain moment du groupe", pollOne: "Photos au coucher du soleil", pollTwo: "Une dernière surprise", pollThree: "Direction la fête",
      messageTitle: "Laissez un message aux hôtes", name: "Votre nom", message: "Votre message",
      rsvpTitle: "Serez-vous présent ?", yes: "Oui, je serai là", no: "Je ne pourrai pas venir",
      submit: "Tester cette action", success: "C’est fait — les invités reçoivent ainsi une confirmation immédiate.",
    },
    de: {
      kicker: "Gastaktion ausprobieren", title: "Diese Vorschau reagiert wie das echte Event.",
      note: "In dieser Demo wird nichts gesendet oder gespeichert.",
      pollTitle: "Stimmt über den nächsten Moment ab", pollOne: "Fotos zur goldenen Stunde", pollTwo: "Noch eine Überraschung", pollThree: "Direkt zur Feier",
      messageTitle: "Hinterlasse den Gastgebern eine Nachricht", name: "Dein Name", message: "Deine Nachricht",
      rsvpTitle: "Bist du dabei?", yes: "Ja, ich bin dabei", no: "Ich kann leider nicht kommen",
      submit: "Aktion testen", success: "Erledigt — so erhalten Gäste sofort eine Bestätigung.",
    },
    es: {
      kicker: "Prueba una acción de invitado", title: "Esta vista previa responde como el evento real.",
      note: "En esta demostración no se envía ni se guarda nada.",
      pollTitle: "Vota por el próximo momento del grupo", pollOne: "Fotos al atardecer", pollTwo: "Una sorpresa más", pollThree: "Directos a la celebración",
      messageTitle: "Deja un mensaje a los anfitriones", name: "Tu nombre", message: "Tu mensaje",
      rsvpTitle: "¿Vas a asistir?", yes: "Sí, allí estaré", no: "No podré asistir",
      submit: "Probar esta acción", success: "Listo: así reciben los invitados una confirmación inmediata.",
    },
    it: {
      kicker: "Prova un’azione ospite", title: "Questa anteprima reagisce come l’evento reale.",
      note: "In questa dimostrazione non viene inviato o salvato nulla.",
      pollTitle: "Vota il prossimo momento del gruppo", pollOne: "Foto al tramonto", pollTwo: "Un’ultima sorpresa", pollThree: "Subito alla festa",
      messageTitle: "Lascia un messaggio agli organizzatori", name: "Il tuo nome", message: "Il tuo messaggio",
      rsvpTitle: "Ci sarai?", yes: "Sì, ci sarò", no: "Non potrò esserci",
      submit: "Prova questa azione", success: "Fatto — così gli ospiti ricevono una conferma immediata.",
    },
  }[locale];
  const interactionFields = interactionKind === "poll"
    ? `<fieldset><legend>${esc(interactionCopy.pollTitle)}</legend><label><input type="radio" name="demoChoice" value="one" required> ${esc(interactionCopy.pollOne)}</label><label><input type="radio" name="demoChoice" value="two"> ${esc(interactionCopy.pollTwo)}</label><label><input type="radio" name="demoChoice" value="three"> ${esc(interactionCopy.pollThree)}</label></fieldset>`
    : interactionKind === "message"
      ? `<h3>${esc(interactionCopy.messageTitle)}</h3><input name="demoName" required aria-label="${esc(interactionCopy.name)}" placeholder="${esc(interactionCopy.name)}"><textarea name="demoMessage" required rows="3" aria-label="${esc(interactionCopy.message)}" placeholder="${esc(interactionCopy.message)}"></textarea>`
      : `<fieldset><legend>${esc(interactionCopy.rsvpTitle)}</legend><label><input type="radio" name="demoRsvp" value="yes" required> ${esc(interactionCopy.yes)}</label><label><input type="radio" name="demoRsvp" value="no"> ${esc(interactionCopy.no)}</label></fieldset>`;
  const contributors = {
    en: ["Maya’s view", "Nikos’ view", "The whole group"],
    el: ["Η οπτική της Μάγιας", "Η οπτική του Νίκου", "Όλη η παρέα"],
    fr: ["Le regard de Maya", "Le regard de Nikos", "Tout le groupe"],
    de: ["Mayas Blick", "Nikos’ Blick", "Die ganze Gruppe"],
    es: ["La mirada de Maya", "La mirada de Nikos", "Todo el grupo"],
    it: ["Lo sguardo di Maya", "Lo sguardo di Nikos", "Tutto il gruppo"],
  }[locale];
  const uploadCopy = {
    en: { choose: "Choose at least one photo or video first.", ready: "Preview complete — in a real event these files would now be uploaded privately." },
    el: { choose: "Επίλεξε πρώτα τουλάχιστον μία φωτογραφία ή ένα βίντεο.", ready: "Η προσομοίωση ολοκληρώθηκε — σε πραγματικό event τα αρχεία θα ανέβαιναν τώρα ιδιωτικά." },
    fr: { choose: "Choisissez d’abord au moins une photo ou vidéo.", ready: "Aperçu terminé — dans un vrai événement, ces fichiers seraient maintenant ajoutés en privé." },
    de: { choose: "Wähle zuerst mindestens ein Foto oder Video aus.", ready: "Vorschau abgeschlossen — in einem echten Event würden diese Dateien jetzt privat hochgeladen." },
    es: { choose: "Elige primero al menos una foto o un vídeo.", ready: "Vista previa completada: en un evento real, estos archivos se subirían ahora de forma privada." },
    it: { choose: "Scegli prima almeno una foto o un video.", ready: "Anteprima completata: in un evento reale questi file verrebbero ora caricati privatamente." },
  }[locale];
  return `<style>
    .v-demo-section{padding:clamp(4.5rem,10vw,8rem) clamp(1rem,5vw,5rem)}
    .v-demo-inner{width:min(100%,80rem);margin:auto}
    .v-demo-kicker{font-size:.7rem;font-weight:800;letter-spacing:.2em;text-transform:uppercase}
    .v-demo-title{max-width:15ch;margin-top:1rem;font-size:clamp(2.4rem,5vw,4.8rem);font-weight:500;line-height:1;letter-spacing:-.045em;text-wrap:balance}
    .v-demo-lead{max-width:46rem;margin-top:1.25rem;font-size:clamp(1rem,1.5vw,1.15rem);line-height:1.8;opacity:.72}
    .v-demo-features,.v-demo-form-grid{display:grid;gap:1rem;margin-top:2.5rem}
    .v-demo-card{border:1px solid currentColor;padding:clamp(1.25rem,3vw,2rem)}
    .v-demo-card span{font-size:1.8rem}.v-demo-card h3{margin-top:1rem;font-size:1.25rem}
    .v-demo-card p{margin-top:.65rem;line-height:1.65;opacity:.68}
    .v-demo-form-grid>*{min-width:0}.v-demo-form{display:grid;min-width:0;gap:.8rem}.v-demo-form :is(input,textarea){box-sizing:border-box;width:100%;min-width:0;border:1px solid currentColor;background:transparent;padding:.9rem 1rem;color:inherit;font:inherit}.v-demo-form button{border:0;padding:1rem 1.2rem;color:#fff;font-weight:750}.v-demo-file{display:flex;min-width:0;align-items:center;justify-content:space-between;gap:1rem;border:1px solid currentColor;padding:.9rem 1rem}.v-demo-file span:first-of-type{min-width:0;overflow-wrap:anywhere}.v-demo-file input{position:absolute;width:1px!important;height:1px;overflow:hidden;clip-path:inset(50%)}.v-demo-file span:last-child{font-size:.75rem;font-weight:750;opacity:.65}
    .v-demo-gallery{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));grid-auto-rows:clamp(10rem,22vw,20rem);gap:.75rem;margin-top:2.5rem}
    .v-demo-photo{position:relative;display:flex;grid-column:span 4;align-items:flex-end;overflow:hidden;background:#251547;color:#fff;font-size:.68rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.v-demo-photo picture{position:absolute;inset:0}.v-demo-photo img{width:100%;height:100%;object-fit:cover;transition:transform .7s cubic-bezier(.2,.8,.2,1)}.v-demo-photo:after{content:"";position:absolute;inset:30% 0 0;background:linear-gradient(transparent,#171021bf)}.v-demo-photo figcaption{position:relative;z-index:1;padding:1rem;text-shadow:0 1px 8px #0009}
    .v-demo-photo:first-child{grid-column:span 7;grid-row:span 2}.v-demo-photo:nth-child(2){grid-column:span 5}.v-demo-photo:nth-child(3){grid-column:span 5}
    .v-demo-safety{display:flex;flex-wrap:wrap;gap:.7rem;margin-top:2rem}.v-demo-safety span{border:1px solid currentColor;border-radius:999px;padding:.6rem .9rem;font-size:.72rem;font-weight:700}
    .v-demo-interaction{display:grid;gap:1rem;max-width:46rem;margin-top:2.5rem}.v-demo-interaction fieldset{display:grid;gap:.7rem;border:0;padding:0}.v-demo-interaction legend,.v-demo-interaction h3{margin:0 0 .45rem;font-size:1.2rem;font-weight:750}.v-demo-interaction label{display:flex;align-items:center;gap:.65rem;border:1px solid currentColor;padding:.85rem 1rem}.v-demo-interaction input[type=radio]{width:1rem;height:1rem;accent-color:${accent}}.v-demo-interaction :is(input[type=text],input:not([type]),textarea){box-sizing:border-box;width:100%;border:1px solid currentColor;background:transparent;padding:.9rem 1rem;color:inherit;font:inherit}.v-demo-interaction button{width:fit-content;border:0;padding:1rem 1.25rem;background:${accent};color:#fff;font-weight:750}.v-demo-result{min-height:1.5rem;font-weight:700;color:${accent}}
    @media(min-width:700px){.v-demo-features{grid-template-columns:repeat(3,minmax(0,1fr))}.v-demo-form-grid{grid-template-columns:minmax(0,1.15fr) minmax(18rem,.85fr)}}
    @media(max-width:560px){.v-demo-gallery{grid-template-columns:1fr 1fr;grid-auto-rows:12rem}.v-demo-photo,.v-demo-photo:first-child,.v-demo-photo:nth-child(2),.v-demo-photo:nth-child(3){grid-column:auto;grid-row:auto}.v-demo-photo:first-child{grid-column:1/-1}}
  </style>
  <section id="demo-features" class="v-demo-section" style="background:${card}">
    <div class="v-demo-inner"><p class="v-demo-kicker" style="color:${accent}">${esc(verticalText(vertical.previewLabel, locale))}</p><h2 class="v-demo-title">${esc(text({ en: "See what guests can actually do.", el: "Δες τι μπορούν πραγματικά να κάνουν οι καλεσμένοι.", fr: "Découvrez ce que les invités peuvent vraiment faire.", de: "Seht, was Gäste wirklich tun können.", es: "Descubre lo que pueden hacer los invitados.", it: "Scopri cosa possono fare davvero gli invitati." }))}</h2><div class="v-demo-features">${vertical.features.map((feature, index) => `<article class="v-demo-card"><span>${["◇", "◎", "↗"][index]}</span><h3>${esc(verticalText(feature, locale))}</h3><p>${esc(text({ en: "Built into this event space and ready from the same private link.", el: "Ενσωματωμένο σε αυτό το event και διαθέσιμο από το ίδιο ιδιωτικό link.", fr: "Intégré à cet espace et accessible depuis le même lien privé.", de: "In diesen Eventbereich integriert und über denselben privaten Link erreichbar.", es: "Integrado en este espacio y disponible desde el mismo enlace privado.", it: "Integrato in questo spazio e disponibile dallo stesso link privato." }))}</p></article>`).join("")}</div></div>
  </section>
  <section id="demo-interaction" class="v-demo-section">
    <div class="v-demo-inner"><p class="v-demo-kicker" style="color:${accent}">${esc(interactionCopy.kicker)}</p><h2 class="v-demo-title">${esc(interactionCopy.title)}</h2><p class="v-demo-lead">${esc(interactionCopy.note)}</p><form data-demo-feature-form data-demo-kind="${interactionKind}" class="v-demo-card v-demo-interaction">${interactionFields}<button>${esc(interactionCopy.submit)}</button><p data-demo-feature-result class="v-demo-result" role="status" aria-live="polite"></p></form></div>
  </section>
  <section id="demo-contribute" class="v-demo-section">
    <div class="v-demo-inner"><p class="v-demo-kicker" style="color:${accent}">Memboux Guest Moments</p><h2 class="v-demo-title">${esc(text({ en: "Every perspective belongs in the story.", el: "Κάθε οπτική ανήκει στην ιστορία.", fr: "Chaque point de vue appartient à l’histoire.", de: "Jede Perspektive gehört zur Geschichte.", es: "Cada perspectiva forma parte de la historia.", it: "Ogni prospettiva appartiene alla storia." }))}</h2><p class="v-demo-lead">${esc(text({ en: "One link lets everyone contribute the photos and videos that would otherwise stay forgotten on separate phones.", el: "Ένα link επιτρέπει σε όλους να προσθέσουν τις φωτογραφίες και τα βίντεο που διαφορετικά θα έμεναν ξεχασμένα σε ξεχωριστά κινητά.", fr: "Un seul lien permet à chacun d’ajouter les photos et vidéos qui resteraient autrement oubliées sur différents téléphones.", de: "Über einen Link tragen alle die Fotos und Videos bei, die sonst auf einzelnen Handys vergessen würden.", es: "Un enlace permite que todos añadan las fotos y vídeos que acabarían olvidados en móviles separados.", it: "Un link permette a tutti di aggiungere foto e video che altrimenti resterebbero dimenticati su telefoni diversi." }))}</p><div class="v-demo-form-grid"><form class="v-demo-card v-demo-form" onsubmit="return false"><input aria-label="${esc(text({ en: "Your name", el: "Το όνομά σου", fr: "Votre nom", de: "Dein Name", es: "Tu nombre", it: "Il tuo nome" }))}" placeholder="${esc(text({ en: "Your name", el: "Το όνομά σου", fr: "Votre nom", de: "Dein Name", es: "Tu nombre", it: "Il tuo nome" }))}"><label class="v-demo-file"><input type="file" multiple aria-label="${esc(text({ en: "Choose photos or videos", el: "Επιλογή φωτογραφιών ή βίντεο", fr: "Choisir des photos ou vidéos", de: "Fotos oder Videos auswählen", es: "Elegir fotos o vídeos", it: "Scegli foto o video" }))}"><span>${esc(text({ en: "Choose photos or videos", el: "Επιλογή φωτογραφιών ή βίντεο", fr: "Choisir des photos ou vidéos", de: "Fotos oder Videos auswählen", es: "Elegir fotos o vídeos", it: "Scegli foto o video" }))}</span><span>＋</span></label><button type="button" style="background:${accent}">${esc(text({ en: "Add my moments", el: "Προσθήκη των στιγμών μου", fr: "Ajouter mes moments", de: "Meine Momente hinzufügen", es: "Añadir mis momentos", it: "Aggiungi i miei momenti" }))}</button></form><aside class="v-demo-card"><span>▦</span><h3>${esc(text({ en: "No app for guests", el: "Χωρίς εφαρμογή για τους καλεσμένους", fr: "Aucune application pour les invités", de: "Keine App für Gäste", es: "Sin app para invitados", it: "Nessuna app per gli invitati" }))}</h3><p>${esc(text({ en: "Open the QR or private link, choose media and upload.", el: "Άνοιγμα του QR ή του ιδιωτικού link, επιλογή υλικού και ανέβασμα.", fr: "Ouvrez le QR ou le lien privé, choisissez les médias et ajoutez-les.", de: "QR oder privaten Link öffnen, Medien auswählen und hochladen.", es: "Abre el QR o enlace privado, elige contenido y súbelo.", it: "Apri il QR o il link privato, scegli i contenuti e caricali." }))}</p><div class="v-demo-safety"><span>${esc(text({ en: "Private access", el: "Ιδιωτική πρόσβαση", fr: "Accès privé", de: "Privater Zugriff", es: "Acceso privado", it: "Accesso privato" }))}</span><span>PIN</span><span>${esc(text({ en: "Moderation", el: "Έλεγχος περιεχομένου", fr: "Modération", de: "Moderation", es: "Moderación", it: "Moderazione" }))}</span></div></aside></div></div>
  </section>
  <section id="demo-gallery" class="v-demo-section" style="background:${card}">
    <div class="v-demo-inner"><p class="v-demo-kicker" style="color:${accent}">${esc(text({ en: "Shared album", el: "Κοινό album", fr: "Album partagé", de: "Gemeinsames Album", es: "Álbum compartido", it: "Album condiviso" }))}</p><h2 class="v-demo-title">${esc(text({ en: "The event through everyone’s eyes.", el: "Το event μέσα από τα μάτια όλων.", fr: "L’événement vu par tous.", de: "Das Event durch die Augen aller.", es: "El evento a través de todos.", it: "L’evento attraverso gli occhi di tutti." }))}</h2><div class="v-demo-gallery">${contributors.map((name, index) => `<figure class="v-demo-photo">${demoPicture(media[index] ?? media[0], `loading="${index === 0 ? "eager" : "lazy"}" decoding="async"`)}<figcaption>${esc(name)}</figcaption></figure>`).join("")}</div></div>
  </section>
  <script>(()=>{const form=document.querySelector('[data-demo-feature-form]'),result=document.querySelector('[data-demo-feature-result]'),file=document.querySelector('.v-demo-file input'),upload=document.querySelector('.v-demo-form button[type=button]'),uploadResult=document.createElement('p');uploadResult.className='v-demo-result';uploadResult.setAttribute('role','status');uploadResult.setAttribute('aria-live','polite');upload?.after(uploadResult);form?.addEventListener('submit',event=>{event.preventDefault();if(!form.reportValidity())return;result.textContent=${JSON.stringify(interactionCopy.success)};form.querySelector('button')?.focus()});file?.addEventListener('change',event=>{const count=event.target.files?.length||0;if(count)event.target.nextElementSibling.textContent=String(count)+' ${esc(text({ en: "files selected", el: "αρχεία επιλέχθηκαν", fr: "fichiers sélectionnés", de: "Dateien ausgewählt", es: "archivos seleccionados", it: "file selezionati" }))}';uploadResult.textContent=''});upload?.addEventListener('click',()=>{uploadResult.textContent=file?.files?.length?${JSON.stringify(uploadCopy.ready)}:${JSON.stringify(uploadCopy.choose)}})})()<\/script>`;
}

export function eventVerticalPreviewPage(
  locale: Locale,
  event: EventRow,
  vertical: EventVertical,
  profile: EventVerticalProfile,
  ownerPreview: boolean,
  options: { demo?: boolean; guestExperienceOpen?: boolean; guestItems?: readonly MediaCardRow[]; coverUpdatedAt?: number | null } = {},
) {
  const ui = eventUiCopy[locale];
  const headline = profile.headline.trim() || event.eventName;
  const intro = profile.introduction.trim() || verticalText(vertical.lead, locale);
  const dates = [formatDate(event.event_start_date, locale), event.event_end_date !== event.event_start_date ? formatDate(event.event_end_date, locale) : ""].filter(Boolean).join(" — ");
  const theme = {
    signature: { bg: "#faf8f4", ink: "#182c27", card: "#ffffff", accent: vertical.accent },
    vivid: { bg: vertical.soft, ink: "#1d2220", card: "#ffffffcc", accent: vertical.accent },
    editorial: { bg: "#f2f0eb", ink: "#171918", card: "#e8e4dc", accent: "#292d2b" },
    minimal: { bg: "#ffffff", ink: "#1c2925", card: "#f5f7f6", accent: vertical.accent },
  }[profile.theme_key];
  const ownerActions = {
    en: { workspace: "Workspace", trial: "Review trial" },
    el: { workspace: "Χώρος εργασίας", trial: "Έλεγχος trial" },
    fr: { workspace: "Espace de travail", trial: "Voir l’essai" },
    de: { workspace: "Arbeitsbereich", trial: "Testphase prüfen" },
    es: { workspace: "Espacio de trabajo", trial: "Revisar prueba" },
    it: { workspace: "Area di lavoro", trial: "Rivedi la prova" },
  }[locale];
  const experience = {
    en: { kicker: "One event. Every perspective.", title: "The moments on everyone’s phones belong together.", text: "Guests open one private link—no app and no account—to add the photos and videos that might otherwise never be seen.", album: "Open shared album", add: "Add my moments", locked: "Start the trial to open guest access and uploads.", trial: "Start or review trial" },
    el: { kicker: "Ένα event. Κάθε οπτική.", title: "Οι στιγμές από τα κινητά όλων αξίζει να μείνουν μαζί.", text: "Οι καλεσμένοι ανοίγουν ένα ιδιωτικό link — χωρίς app και χωρίς λογαριασμό — και προσθέτουν φωτογραφίες και βίντεο που διαφορετικά ίσως να μη δει ποτέ κανείς.", album: "Άνοιγμα κοινού album", add: "Πρόσθεσε τις στιγμές σου", locked: "Ξεκίνα το trial για να ανοίξεις την πρόσβαση και τα uploads των καλεσμένων.", trial: "Έναρξη ή έλεγχος trial" },
    fr: { kicker: "Un événement. Tous les regards.", title: "Les moments présents sur tous les téléphones méritent d’être réunis.", text: "Les invités ouvrent un lien privé, sans application ni compte, et ajoutent les photos et vidéos qui risqueraient de ne jamais être vues.", album: "Ouvrir l’album partagé", add: "Ajouter mes moments", locked: "Démarrez l’essai pour ouvrir l’accès et les ajouts des invités.", trial: "Démarrer ou voir l’essai" },
    de: { kicker: "Ein Event. Alle Perspektiven.", title: "Die Momente auf allen Handys gehören zusammen.", text: "Gäste öffnen einen privaten Link – ohne App und Konto – und fügen Fotos und Videos hinzu, die sonst vielleicht nie gesehen würden.", album: "Gemeinsames Album öffnen", add: "Meine Momente hinzufügen", locked: "Starte die Testphase, um Gastzugriff und Uploads zu öffnen.", trial: "Testphase starten oder prüfen" },
    es: { kicker: "Un evento. Todas las perspectivas.", title: "Los momentos de todos los móviles merecen estar juntos.", text: "Los invitados abren un enlace privado, sin aplicación ni cuenta, y añaden fotos y vídeos que quizá nunca llegarían a verse.", album: "Abrir álbum compartido", add: "Añadir mis momentos", locked: "Inicia la prueba para habilitar el acceso y las subidas de invitados.", trial: "Iniciar o revisar prueba" },
    it: { kicker: "Un evento. Ogni prospettiva.", title: "I momenti su tutti i telefoni meritano di stare insieme.", text: "Gli invitati aprono un link privato, senza app né account, e aggiungono foto e video che altrimenti potrebbero non essere mai visti.", album: "Apri l’album condiviso", add: "Aggiungi i miei momenti", locked: "Avvia la prova per aprire l’accesso e i caricamenti degli invitati.", trial: "Avvia o controlla la prova" },
  }[locale];
  const guestAlbumCopy = ({
    en: { kicker: "Guest album", title: "The event through everyone’s eyes.", empty: "The first shared moments will appear here.", count: (value: number) => `${value} shared moments`, open: "Open full album", add: "Add photos or videos" },
    el: { kicker: "Album καλεσμένων", title: "Το event μέσα από τα μάτια όλων.", empty: "Οι πρώτες κοινές στιγμές θα εμφανιστούν εδώ.", count: (value: number) => `${value} κοινές στιγμές`, open: "Άνοιγμα πλήρους album", add: "Πρόσθεσε φωτογραφίες ή βίντεο" },
    fr: { kicker: "Album des invités", title: "L’événement vu par tous.", empty: "Les premiers moments partagés apparaîtront ici.", count: (value: number) => `${value} moments partagés`, open: "Ouvrir l’album complet", add: "Ajouter des photos ou vidéos" },
    de: { kicker: "Gästealbum", title: "Das Event durch die Augen aller.", empty: "Die ersten gemeinsamen Momente erscheinen hier.", count: (value: number) => `${value} gemeinsame Momente`, open: "Ganzes Album öffnen", add: "Fotos oder Videos hinzufügen" },
    es: { kicker: "Álbum de invitados", title: "El evento a través de todos.", empty: "Los primeros momentos compartidos aparecerán aquí.", count: (value: number) => `${value} momentos compartidos`, open: "Abrir álbum completo", add: "Añadir fotos o vídeos" },
    it: { kicker: "Album degli ospiti", title: "L’evento attraverso gli occhi di tutti.", empty: "I primi momenti condivisi appariranno qui.", count: (value: number) => `${value} momenti condivisi`, open: "Apri l’album completo", add: "Aggiungi foto o video" },
  } satisfies Record<Locale, { kicker: string; title: string; empty: string; count: (value: number) => string; open: string; add: string }>)[locale];
  const guestItems = [...(options.guestItems ?? [])];
  const demoMedia = options.demo ? demoMediaFor(vertical.type, locale) : [];
  const guestAlbum = options.demo ? "" : `<section id="guest-album" class="mx-auto max-w-7xl px-4 pb-20 sm:px-6"><div class="rounded-[2.5rem] p-5 sm:p-8 lg:p-10" style="background:${theme.card}"><header class="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p class="text-xs font-bold uppercase tracking-[.2em]" style="color:${theme.accent}">${esc(guestAlbumCopy.kicker)}</p><h2 class="mt-3 max-w-3xl text-4xl font-medium leading-tight tracking-[-.04em] sm:text-5xl">${esc(guestAlbumCopy.title)}</h2>${guestItems.length ? `<div class="mt-4">${galleryFilterControls(guestItems, "event-guest-gallery", locale)}</div>` : ""}</div><span class="text-sm font-bold opacity-60">${esc(guestAlbumCopy.count(guestItems.length))}</span></header>${guestItems.length ? `<div data-gallery-grid="event-guest-gallery" class="mt-8 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">${cards(guestItems, { lightbox: true, reportCode: event.code, locale, likes: true, deferAfter: 12 })}</div>${galleryProgressiveControls(guestItems.length, "event-guest-gallery", locale)}` : `<p class="mt-8 rounded-2xl border border-dashed border-current/20 px-5 py-12 text-center opacity-65">${esc(guestAlbumCopy.empty)}</p>`}<div class="mt-7 flex flex-col gap-3 sm:flex-row"><a href="/gallery/${encodeURIComponent(event.code)}?lang=${locale}" class="inline-flex min-h-12 items-center justify-center rounded-xl px-5 py-3 text-sm font-bold text-white" style="background:${theme.accent}">${esc(guestAlbumCopy.open)}</a><a href="/gallery/${encodeURIComponent(event.code)}?lang=${locale}#guest-upload" class="inline-flex min-h-12 items-center justify-center rounded-xl border border-current/20 px-5 py-3 text-sm font-bold">${esc(guestAlbumCopy.add)}</a></div></div></section>`;
  const guestAlbumScripts = !options.demo && guestItems.length
    ? `${galleryFilterScript(guestItems, "event-guest-gallery")}${galleryProgressiveScript("event-guest-gallery")}${lightboxMarkup(locale, true)}${mediaLikesScript(event.code, locale)}`
    : "";
  const languageLabel = ({ en: "Language", el: "Γλώσσα", fr: "Langue", de: "Sprache", es: "Idioma", it: "Lingua" } as const)[locale];
  const languagePicker = `<label class="sr-only" for="event-language">${esc(languageLabel)}</label><select id="event-language" aria-label="${esc(languageLabel)}" class="max-w-[7rem] rounded-full border border-current/15 bg-transparent px-3 py-2 text-xs font-bold" onchange="location.href=this.value">${supportedLocales.map((language) => {
    const href = options.demo
      ? `/${language}/events/${vertical.type}/demo-frame?theme=${profile.theme_key}`
      : `/event/${encodeURIComponent(event.code)}?lang=${language}${ownerPreview ? "&preview=1" : ""}`;
    return `<option value="${href}" ${language === locale ? "selected" : ""}>${esc(localeNames[language])}</option>`;
  }).join("")}</select>`;
  const draft = ownerPreview ? `<aside class="fixed inset-x-0 top-0 z-50 flex flex-wrap items-center justify-between gap-2 bg-[#24143b] px-3 py-2 text-xs font-semibold text-white sm:px-4"><span>${esc(ui.ownerPreview)}</span><nav class="flex flex-wrap items-center gap-2" aria-label="${esc(ui.ownerPreview)}"><a href="/dashboard/${esc(event.code)}/setup?lang=${locale}" class="rounded-full bg-white/10 px-3 py-1.5">${esc(ui.edit)}</a><a href="/dashboard/${esc(event.code)}?lang=${locale}" class="rounded-full bg-white/10 px-3 py-1.5">${esc(ownerActions.workspace)}</a><a href="/dashboard/${esc(event.code)}?lang=${locale}#package-access-title" class="rounded-full bg-white px-3 py-1.5 text-[#24143b]">${esc(ownerActions.trial)} →</a></nav></aside>` : "";
  const section = (label: string, value: string, fallback: string) => `<article class="rounded-[2rem] p-7 sm:p-9" style="background:${theme.card}"><p class="text-xs font-bold uppercase tracking-[.2em]" style="color:${theme.accent}">${esc(label)}</p><p class="mt-4 whitespace-pre-line text-base leading-7 opacity-75">${esc(value.trim() || fallback)}</p></article>`;
  const custom = parseCustomFields(profile.custom_fields_json);
  const details = wizardFieldsFor(vertical.type).filter((field) => custom[field.key]?.trim()).map((field) =>
    `<div><dt class="text-xs font-bold uppercase tracking-[.16em]" style="color:${theme.accent}">${esc(field.label[locale])}</dt><dd class="mt-2 whitespace-pre-line leading-7 opacity-75">${esc(custom[field.key])}</dd></div>`).join("");
  const heroVisual = options.coverUpdatedAt
    ? `<aside data-event-hero-cover class="relative min-h-[24rem] overflow-hidden rounded-[2.5rem] shadow-[0_30px_90px_rgba(20,35,30,.18)]"><img src="/gallery/${encodeURIComponent(event.code)}/cover?v=${options.coverUpdatedAt}" alt="" loading="eager" fetchpriority="high" class="absolute inset-0 h-full w-full object-cover"><div class="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent"></div><div class="absolute inset-x-0 bottom-0 p-7 text-white sm:p-9"><span class="text-4xl">${esc(vertical.symbol)}</span><p class="mt-5 text-xs font-bold uppercase tracking-[.2em] text-white/75">${esc(verticalText(vertical.previewLabel, locale))}</p><h2 class="mt-2 text-3xl font-medium">${esc(profile.host_name || event.eventName)}</h2></div></aside>`
    : options.demo && demoMedia[0]
      ? `<aside data-event-demo-hero class="relative min-h-[24rem] overflow-hidden rounded-[2.5rem] shadow-[0_30px_90px_rgba(20,35,30,.18)]">${demoPicture(demoMedia[0], 'loading="eager" fetchpriority="high" decoding="async" class="absolute inset-0 h-full w-full object-cover"')}<div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent"></div><div class="absolute inset-x-0 bottom-0 p-7 text-white sm:p-9"><span class="text-4xl">${esc(vertical.symbol)}</span><p class="mt-5 text-xs font-bold uppercase tracking-[.2em] text-white/80">${esc(verticalText(vertical.previewLabel, locale))}</p><h2 class="mt-2 text-3xl font-medium">${esc(profile.host_name || event.eventName)}</h2></div></aside>`
      : `<aside class="rounded-[2.5rem] p-9 shadow-[0_30px_90px_rgba(20,35,30,.12)]" style="background:${theme.card}"><span class="text-5xl">${esc(vertical.symbol)}</span><p class="mt-14 text-xs font-bold uppercase tracking-[.2em]" style="color:${theme.accent}">${esc(verticalText(vertical.previewLabel, locale))}</p><h2 class="mt-3 text-3xl font-medium">${esc(profile.host_name || event.eventName)}</h2><p class="mt-4 leading-7 opacity-65">${esc(verticalText(vertical.features[0], locale))} · ${esc(verticalText(vertical.features[1], locale))} · ${esc(verticalText(vertical.features[2], locale))}</p></aside>`;
  const body = `${draft}<main data-event-preview="${esc(vertical.type)}" data-event-theme="${profile.theme_key}" class="${ownerPreview ? "pt-10" : ""} min-h-screen" style="background:${theme.bg};color:${theme.ink}">
    <header class="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-6 sm:px-6">${brandMark("#", true)}<div class="flex min-w-0 items-center gap-2">${languagePicker}<span class="hidden text-2xl min-[340px]:inline">${esc(vertical.symbol)}</span></div></header>
    <section class="mx-auto grid min-h-[70vh] max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.12fr_.88fr]">
      <div><p class="text-xs font-bold uppercase tracking-[.23em]" style="color:${theme.accent}">${esc(verticalText(vertical.eyebrow, locale))}</p><h1 class="mt-5 max-w-4xl text-5xl font-medium leading-[1.02] tracking-[-.05em] sm:text-7xl">${esc(headline)}</h1><p class="mt-6 max-w-2xl text-lg leading-8 opacity-70">${esc(intro)}</p><div class="mt-9 flex flex-wrap gap-3 text-sm font-semibold"><span class="rounded-full border border-current/15 px-4 py-2">${esc(dates || ui.dateTba)}</span><span class="rounded-full border border-current/15 px-4 py-2">${esc(event.location || ui.locationTba)}</span></div></div>
      ${heroVisual}
    </section>
    <section class="mx-auto grid max-w-7xl gap-5 px-4 pb-20 sm:px-6 lg:grid-cols-3">
      ${section(ui.story, profile.story, ui.storyFallback)}
      ${section(ui.schedule, profile.schedule_notes, ui.scheduleFallback)}
      ${section(ui.forGuests, profile.guest_notes, ui.guestsFallback)}
    </section>
    <section class="mx-auto max-w-7xl px-4 pb-20 sm:px-6"><div class="overflow-hidden rounded-[2.5rem] p-7 sm:p-10 lg:p-14" style="background:${theme.ink};color:${theme.bg}"><p class="text-xs font-bold uppercase tracking-[.22em]" style="color:${theme.accent}">${esc(experience.kicker)}</p><h2 class="mt-4 max-w-4xl text-4xl font-medium leading-tight tracking-[-.04em] sm:text-5xl">${esc(experience.title)}</h2><p class="mt-5 max-w-3xl text-base leading-8 opacity-75">${esc(experience.text)}</p>${ownerPreview && options.guestExperienceOpen === false ? `<div class="mt-8 rounded-2xl border border-current/15 p-5"><p class="text-sm leading-6 opacity-80">${esc(experience.locked)}</p><a href="/dashboard/${encodeURIComponent(event.code)}?lang=${locale}#package-access-title" class="mt-4 inline-flex rounded-xl px-5 py-3 text-sm font-bold" style="background:${theme.accent};color:white">${esc(experience.trial)} →</a></div>` : `<div class="mt-8 flex flex-col gap-3 sm:flex-row"><a href="${options.demo ? "#demo-gallery" : `/gallery/${encodeURIComponent(event.code)}?lang=${locale}`}" class="inline-flex min-h-12 items-center justify-center rounded-xl px-6 py-3 text-sm font-bold" style="background:${theme.accent};color:white">${esc(experience.album)}</a><a href="${options.demo ? "#demo-contribute" : `/gallery/${encodeURIComponent(event.code)}?lang=${locale}#guest-upload`}" class="inline-flex min-h-12 items-center justify-center rounded-xl border border-current/20 px-6 py-3 text-sm font-bold">${esc(experience.add)}</a></div>`}</div></section>
    ${details ? `<section class="mx-auto max-w-7xl px-4 pb-20 sm:px-6"><div class="rounded-[2rem] p-7 sm:p-9" style="background:${theme.card}"><dl class="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">${details}</dl></div></section>` : ""}
    ${guestAlbum}
    ${options.demo ? demoExperience(locale, vertical, theme.card, theme.accent, demoMedia) : ""}
    <footer class="border-t border-current/10"><div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-sm opacity-65 sm:px-6"><span>Memboux · ${esc(event.eventName)}</span>${profile.contact_email ? `<a href="mailto:${esc(profile.contact_email)}">${esc(profile.contact_email)}</a>` : ""}</div></footer>
  </main>`;
  return page(`${headline} | Memboux`, `${body}${guestAlbumScripts}`, {
    locale,
    description: intro,
    index: !options.demo && !ownerPreview && profile.publish_status === "published",
    suppressWidgets: options.demo,
    additionalHead: options.demo ? "<style>html{scroll-behavior:smooth}</style>" : undefined,
  });
}
