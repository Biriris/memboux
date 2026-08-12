import type { Locale } from "../i18n";
import { esc } from "../utils";

export type GuestbookPreview = { author_name: string; message: string; created_at: number; media_id?: string | null };
export type GuestParticipationSettings = { rsvp_enabled: number; guestbook_enabled: number; comments_enabled?: number; guestbook_video_enabled?: number; guestbook_private?: number };

type GuestExperienceCopy = {
  firstMessage: string;
  rsvpTitle: string;
  rsvpText: string;
  fullName: string;
  email: string;
  attendance: string;
  attending: string;
  maybe: string;
  notAttending: string;
  guestCount: string;
  dietary: string;
  hostMessage: string;
  sendRsvp: string;
  guestbookLabel: string;
  guestbookTitle: string;
  yourName: string;
  wish: string;
  addToGuestbook: string;
  publishingNote: string;
  commentsTitle: string;
  noComments: string;
  comment: string;
  send: string;
  commentError: string;
  closeComments: string;
};

const guestExperienceCopy: Record<Locale, GuestExperienceCopy> = {
  en: {
    firstMessage: "Be the first to leave a message.",
    rsvpTitle: "Will you join us?",
    rsvpText: "Let the host know and optionally add dietary notes.",
    fullName: "Full name",
    email: "Email",
    attendance: "Attendance",
    attending: "Yes, I’ll attend",
    maybe: "Maybe",
    notAttending: "I can’t attend",
    guestCount: "Number of guests",
    dietary: "Dietary needs (optional)",
    hostMessage: "Message to the host (optional)",
    sendRsvp: "Send RSVP",
    guestbookLabel: "Guestbook",
    guestbookTitle: "Leave a message",
    yourName: "Your name",
    wish: "Write your wish or memory…",
    addToGuestbook: "Add to guestbook",
    publishingNote: "Your message appears immediately and the host can hide it if needed.",
    commentsTitle: "Comments",
    noComments: "No comments yet.",
    comment: "Write a comment…",
    send: "Send",
    commentError: "Comment could not be sent.",
    closeComments: "Close comments",
  },
  el: {
    firstMessage: "Γίνε ο πρώτος που θα αφήσει μια ευχή.",
    rsvpTitle: "Θα είσαι μαζί μας;",
    rsvpText: "Ενημέρωσε τον διοργανωτή και πρόσθεσε, αν θέλεις, διατροφικές σημειώσεις.",
    fullName: "Ονοματεπώνυμο",
    email: "Email",
    attendance: "Παρουσία",
    attending: "Ναι, θα έρθω",
    maybe: "Ίσως",
    notAttending: "Δεν θα μπορέσω",
    guestCount: "Αριθμός ατόμων",
    dietary: "Διατροφικές ανάγκες (προαιρετικά)",
    hostMessage: "Μήνυμα προς τον διοργανωτή (προαιρετικά)",
    sendRsvp: "Αποστολή RSVP",
    guestbookLabel: "Ευχολόγιο",
    guestbookTitle: "Άφησε μια ευχή",
    yourName: "Το όνομά σου",
    wish: "Γράψε την ευχή ή την ανάμνησή σου…",
    addToGuestbook: "Προσθήκη στο ευχολόγιο",
    publishingNote: "Η ευχή σου εμφανίζεται αμέσως και ο διοργανωτής μπορεί να την αποκρύψει αν χρειαστεί.",
    commentsTitle: "Σχόλια",
    noComments: "Δεν υπάρχουν σχόλια ακόμη.",
    comment: "Γράψε ένα σχόλιο…",
    send: "Αποστολή",
    commentError: "Το σχόλιο δεν στάλθηκε.",
    closeComments: "Κλείσιμο σχολίων",
  },
  fr: {
    firstMessage: "Soyez la première personne à laisser un message.",
    rsvpTitle: "Serez-vous parmi nous ?",
    rsvpText: "Informez l’organisateur et ajoutez, si besoin, vos préférences alimentaires.",
    fullName: "Nom complet",
    email: "E-mail",
    attendance: "Présence",
    attending: "Oui, je serai présent(e)",
    maybe: "Peut-être",
    notAttending: "Je ne pourrai pas venir",
    guestCount: "Nombre de personnes",
    dietary: "Préférences alimentaires (facultatif)",
    hostMessage: "Message à l’organisateur (facultatif)",
    sendRsvp: "Envoyer la réponse",
    guestbookLabel: "Livre d’or",
    guestbookTitle: "Laissez un message",
    yourName: "Votre nom",
    wish: "Écrivez un vœu ou un souvenir…",
    addToGuestbook: "Ajouter au livre d’or",
    publishingNote: "Votre message apparaît immédiatement et l’organisateur peut le masquer si nécessaire.",
    commentsTitle: "Commentaires",
    noComments: "Aucun commentaire pour le moment.",
    comment: "Écrivez un commentaire…",
    send: "Envoyer",
    commentError: "Le commentaire n’a pas pu être envoyé.",
    closeComments: "Fermer les commentaires",
  },
  de: {
    firstMessage: "Hinterlasse die erste Nachricht.",
    rsvpTitle: "Bist du dabei?",
    rsvpText: "Gib dem Gastgeber Bescheid und ergänze bei Bedarf Hinweise zum Essen.",
    fullName: "Vollständiger Name",
    email: "E-Mail",
    attendance: "Teilnahme",
    attending: "Ja, ich bin dabei",
    maybe: "Vielleicht",
    notAttending: "Ich kann leider nicht kommen",
    guestCount: "Anzahl der Gäste",
    dietary: "Essenswünsche (optional)",
    hostMessage: "Nachricht an den Gastgeber (optional)",
    sendRsvp: "Antwort senden",
    guestbookLabel: "Gästebuch",
    guestbookTitle: "Hinterlasse eine Nachricht",
    yourName: "Dein Name",
    wish: "Schreibe einen Wunsch oder eine Erinnerung…",
    addToGuestbook: "Ins Gästebuch eintragen",
    publishingNote: "Deine Nachricht erscheint sofort und kann bei Bedarf vom Gastgeber ausgeblendet werden.",
    commentsTitle: "Kommentare",
    noComments: "Noch keine Kommentare.",
    comment: "Schreibe einen Kommentar…",
    send: "Senden",
    commentError: "Der Kommentar konnte nicht gesendet werden.",
    closeComments: "Kommentare schließen",
  },
  es: {
    firstMessage: "Sé la primera persona en dejar un mensaje.",
    rsvpTitle: "¿Nos acompañas?",
    rsvpText: "Confirma tu asistencia y añade, si lo necesitas, información sobre alimentación.",
    fullName: "Nombre completo",
    email: "Correo electrónico",
    attendance: "Asistencia",
    attending: "Sí, asistiré",
    maybe: "Quizás",
    notAttending: "No podré asistir",
    guestCount: "Número de personas",
    dietary: "Necesidades alimentarias (opcional)",
    hostMessage: "Mensaje para el anfitrión (opcional)",
    sendRsvp: "Enviar respuesta",
    guestbookLabel: "Libro de visitas",
    guestbookTitle: "Deja un mensaje",
    yourName: "Tu nombre",
    wish: "Escribe un deseo o un recuerdo…",
    addToGuestbook: "Añadir al libro de visitas",
    publishingNote: "Tu mensaje aparece inmediatamente y el anfitrión puede ocultarlo si es necesario.",
    commentsTitle: "Comentarios",
    noComments: "Todavía no hay comentarios.",
    comment: "Escribe un comentario…",
    send: "Enviar",
    commentError: "No se pudo enviar el comentario.",
    closeComments: "Cerrar comentarios",
  },
  it: {
    firstMessage: "Lascia il primo messaggio.",
    rsvpTitle: "Sarai con noi?",
    rsvpText: "Conferma la tua presenza e aggiungi, se necessario, eventuali esigenze alimentari.",
    fullName: "Nome completo",
    email: "Email",
    attendance: "Partecipazione",
    attending: "Sì, parteciperò",
    maybe: "Forse",
    notAttending: "Non potrò partecipare",
    guestCount: "Numero di persone",
    dietary: "Esigenze alimentari (facoltativo)",
    hostMessage: "Messaggio per l’organizzatore (facoltativo)",
    sendRsvp: "Invia risposta",
    guestbookLabel: "Guestbook",
    guestbookTitle: "Lascia un messaggio",
    yourName: "Il tuo nome",
    wish: "Scrivi un augurio o un ricordo…",
    addToGuestbook: "Aggiungi al guestbook",
    publishingNote: "Il tuo messaggio appare subito e l’organizzatore può nasconderlo se necessario.",
    commentsTitle: "Commenti",
    noComments: "Non ci sono ancora commenti.",
    comment: "Scrivi un commento…",
    send: "Invia",
    commentError: "Non è stato possibile inviare il commento.",
    closeComments: "Chiudi i commenti",
  },
};

export function renderGuestParticipation(code: string, entries: GuestbookPreview[], locale: Locale, settings: GuestParticipationSettings = { rsvp_enabled: 1, guestbook_enabled: 1 }) {
  if (!settings.rsvp_enabled && !settings.guestbook_enabled) return "";
  const copy = guestExperienceCopy[locale];
  const messages = entries.length
    ? entries.map((entry) => `<blockquote class="overflow-hidden rounded-2xl border border-[#ece6f3] bg-white p-4">${entry.media_id ? `<video src="/media/${encodeURIComponent(entry.media_id)}" controls playsinline preload="metadata" class="mb-4 aspect-video w-full rounded-xl bg-black object-contain"></video>` : ""}<p class="text-sm leading-6 text-[#65566f]">“${esc(entry.message)}”</p><footer class="mt-3 text-xs font-bold text-[#6d28d9]">${esc(entry.author_name)}</footer></blockquote>`).join("")
    : `<p class="rounded-2xl border border-dashed border-[#ccdcd5] bg-white/70 p-6 text-center text-sm text-[#756b82]">${esc(copy.firstMessage)}</p>`;
  const rsvp = settings.rsvp_enabled ? `<div><p class="text-xs font-bold uppercase tracking-[.18em] text-[#7c3aed]">RSVP</p><h2 class="mt-2 text-3xl text-[#2b174d]">${esc(copy.rsvpTitle)}</h2><p class="mt-2 text-sm leading-6 text-[#756b82]">${esc(copy.rsvpText)}</p><form action="/api/gallery/${encodeURIComponent(code)}/rsvp" method="post" aria-label="RSVP" class="mt-5 grid gap-3 sm:grid-cols-2"><input type="hidden" name="locale" value="${locale}"><input name="name" required maxlength="80" aria-label="${esc(copy.fullName)}" placeholder="${esc(copy.fullName)}" autocomplete="name" class="rounded-xl border px-4 py-3 sm:col-span-2"><input name="email" required type="email" maxlength="254" aria-label="${esc(copy.email)}" placeholder="${esc(copy.email)}" autocomplete="email" class="rounded-xl border px-4 py-3 sm:col-span-2"><select name="response" required aria-label="${esc(copy.attendance)}" class="rounded-xl border px-4 py-3"><option value="yes">${esc(copy.attending)}</option><option value="maybe">${esc(copy.maybe)}</option><option value="no">${esc(copy.notAttending)}</option></select><input name="guestCount" type="number" min="1" max="20" value="1" aria-label="${esc(copy.guestCount)}" class="rounded-xl border px-4 py-3"><input name="dietaryNotes" maxlength="300" aria-label="${esc(copy.dietary)}" placeholder="${esc(copy.dietary)}" class="rounded-xl border px-4 py-3 sm:col-span-2"><textarea name="message" maxlength="500" rows="3" aria-label="${esc(copy.hostMessage)}" placeholder="${esc(copy.hostMessage)}" class="rounded-xl border px-4 py-3 sm:col-span-2"></textarea><button class="rounded-xl bg-[#2b174d] px-5 py-3 font-semibold text-white sm:col-span-2">${esc(copy.sendRsvp)}</button></form></div>` : "";
  const videoFields = settings.guestbook_video_enabled ? `<label class="block rounded-xl border border-[#e2dcef] bg-white p-3 text-sm font-semibold text-[#51465b]">${locale === "el" ? "Προαιρετικό video μήνυμα" : "Optional video message"}<input name="guestbook_video" type="file" accept="video/mp4,video/webm,video/quicktime" capture="user" class="mt-2 block w-full text-xs font-normal"><span class="mt-2 block text-xs font-normal leading-5 text-[#756b82]">${locale === "el" ? "Επίλεξε ή τράβηξε ένα σύντομο βίντεο έως 64 MB." : "Choose or record a short video up to 64 MB."}</span></label><label class="flex items-start gap-3 rounded-xl border border-[#e2dcef] bg-white p-3 text-xs leading-5 text-[#65566f]"><input name="upload_confirmation" value="accepted" type="checkbox" class="mt-1"><span>${locale === "el" ? "Επιβεβαιώνω ότι έχω δικαίωμα να ανεβάσω αυτό το βίντεο." : "I confirm that I may upload this video."}</span></label><p data-video-guestbook-status class="hidden rounded-xl bg-[#f7f3ff] p-3 text-xs font-semibold text-[#65566f]" role="status" aria-live="polite"></p>` : "";
  const guestbook = settings.guestbook_enabled ? `<div><p class="text-xs font-bold uppercase tracking-[.18em] text-[#7c3aed]">${esc(copy.guestbookLabel)}</p><h2 class="mt-2 text-3xl text-[#2b174d]">${esc(copy.guestbookTitle)}</h2><form ${settings.guestbook_video_enabled ? "data-video-guestbook" : ""} action="/api/gallery/${encodeURIComponent(code)}/guestbook" method="post" aria-label="${esc(copy.guestbookLabel)}" class="mt-5 space-y-3"><input type="hidden" name="locale" value="${locale}"><input name="name" required maxlength="80" aria-label="${esc(copy.yourName)}" placeholder="${esc(copy.yourName)}" autocomplete="name" class="w-full rounded-xl border px-4 py-3"><textarea name="message" required maxlength="800" rows="4" aria-label="${esc(copy.wish)}" placeholder="${esc(copy.wish)}" class="w-full rounded-xl border px-4 py-3"></textarea>${videoFields}<button class="w-full rounded-xl bg-[#7c3aed] px-5 py-3 font-semibold text-white">${esc(copy.addToGuestbook)}</button><p class="text-xs leading-5 text-[#756b82]">${esc(copy.publishingNote)}</p></form><div class="mt-5 grid gap-3 sm:grid-cols-2">${messages}</div></div>` : "";
  const videoScript = settings.guestbook_video_enabled ? `<script>(()=>{const form=document.querySelector('form[data-video-guestbook]');if(!form)return;const input=form.querySelector('input[name="guestbook_video"]'),status=form.querySelector('[data-video-guestbook-status]'),button=form.querySelector('button');const show=(message,error=false)=>{status.textContent=message;status.classList.remove('hidden');status.classList.toggle('text-red-700',error)};const hex=buffer=>[...new Uint8Array(buffer)].map(value=>value.toString(16).padStart(2,'0')).join('');form.addEventListener('submit',async event=>{const file=input.files?.[0];if(!file)return;event.preventDefault();if(!form.elements.upload_confirmation.checked){show(${JSON.stringify(locale === "el" ? "Χρειάζεται η επιβεβαίωση upload." : "Upload confirmation is required.")},true);return}if(file.size>64*1024*1024){show(${JSON.stringify(locale === "el" ? "Το βίντεο πρέπει να είναι έως 64 MB." : "The video must be 64 MB or smaller.")},true);return}button.disabled=true;input.disabled=true;show(${JSON.stringify(locale === "el" ? "Προετοιμασία και ανέβασμα βίντεο…" : "Preparing and uploading video…")});try{const bytes=await file.arrayBuffer(),hash=hex(await crypto.subtle.digest('SHA-256',bytes)),response=await fetch('/api/upload/${encodeURIComponent(code)}/fast',{method:'PUT',credentials:'same-origin',headers:{Accept:'application/json','Content-Type':file.type||'video/mp4','Upload-Filename':encodeURIComponent(file.name),'Upload-Size':String(file.size),'Upload-Last-Modified':String(file.lastModified),'Upload-Fingerprint':hash,'Upload-Content-SHA256':hash,'Upload-Origin':'guest','Upload-Name':encodeURIComponent(String(form.elements.name.value||'')),'Upload-Consent':'accepted','Upload-Locale':String(form.elements.locale.value||'en')},body:bytes});const uploaded=await response.json();if(!response.ok||!uploaded.mediaId)throw new Error(uploaded.message||'Upload failed');show(${JSON.stringify(locale === "el" ? "Αποθήκευση της ευχής…" : "Saving your message…")});const body=new FormData(form);body.delete('guestbook_video');body.set('mediaId',uploaded.mediaId);const saved=await fetch(form.action,{method:'POST',credentials:'same-origin',headers:{Accept:'application/json'},body}),result=await saved.json().catch(()=>({}));if(!saved.ok)throw new Error(result.message||'Save failed');show(${JSON.stringify(locale === "el" ? "Η video ευχή προστέθηκε." : "Your video message was added.")});setTimeout(()=>location.reload(),650)}catch(reason){show(reason instanceof Error?reason.message:${JSON.stringify(locale === "el" ? "Η αποστολή απέτυχε." : "Upload failed.")},true);button.disabled=false;input.disabled=false}})})()<\/script>` : "";
  return `<section id="participate" class="mt-6 scroll-mt-6 rounded-[2rem] border border-[#e9e3f2] bg-[#f2f6f4] p-5 shadow-sm sm:p-8"><div class="grid gap-7 ${settings.rsvp_enabled && settings.guestbook_enabled ? "lg:grid-cols-2" : ""}">${rsvp}${guestbook}</div></section>${videoScript}`;
}

export function mediaCommentsOverlay(code: string, locale: Locale) {
  const copy = guestExperienceCopy[locale];
  const labels = {
    title: copy.commentsTitle,
    empty: copy.noComments,
    name: copy.yourName,
    message: copy.comment,
    send: copy.send,
    error: copy.commentError,
    close: copy.closeComments,
  };
  return `<script>(()=>{const dialog=document.getElementById('media-lightbox'),stage=document.getElementById('lightbox-stage');if(!dialog||!stage)return;const labels=${JSON.stringify(labels)};const button=document.createElement('button');button.type='button';button.id='lightbox-comments-button';button.setAttribute('aria-label',labels.title);button.className='absolute bottom-5 right-5 z-40 hidden min-h-11 items-center gap-2 rounded-full border border-white/25 bg-black/55 px-4 py-2 text-sm font-bold text-white shadow-xl backdrop-blur';button.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg><span>'+labels.title+'</span>';const panel=document.createElement('aside');panel.setAttribute('aria-label',labels.title);panel.className='absolute inset-y-3 right-3 z-50 hidden w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-3xl bg-white text-[#2b174d] shadow-2xl sm:inset-y-6 sm:right-6';panel.innerHTML='<header class="flex items-center justify-between border-b px-5 py-4"><h2 class="text-xl font-semibold">'+labels.title+'</h2><button type="button" data-close-comments aria-label="'+labels.close+'" class="flex h-10 w-10 items-center justify-center rounded-full bg-[#f6f2fc] text-xl">×</button></header><div data-comment-list class="max-h-[calc(100%-13rem)] overflow-y-auto p-5" aria-live="polite"></div><form data-comment-form aria-label="'+labels.title+'" class="absolute inset-x-0 bottom-0 grid gap-2 border-t bg-white p-4"><input name="name" required maxlength="80" aria-label="'+labels.name+'" placeholder="'+labels.name+'" autocomplete="name" class="rounded-xl border px-3 py-2"><div class="flex gap-2"><input name="message" required maxlength="500" aria-label="'+labels.message+'" placeholder="'+labels.message+'" class="min-w-0 flex-1 rounded-xl border px-3 py-2"><button class="rounded-xl bg-[#7c3aed] px-4 py-2 font-semibold text-white">'+labels.send+'</button></div><p data-comment-error class="hidden text-xs text-red-600" role="alert"></p></form>';stage.append(button,panel);let mediaId='';const list=panel.querySelector('[data-comment-list]'),form=panel.querySelector('[data-comment-form]'),error=panel.querySelector('[data-comment-error]');const draw=comments=>{list.replaceChildren();if(!comments.length){const empty=document.createElement('p');empty.className='py-10 text-center text-sm text-[#807588]';empty.textContent=labels.empty;list.append(empty);return}comments.forEach(comment=>{const article=document.createElement('article');article.className='border-b border-[#f3effa] py-3';const name=document.createElement('p');name.className='text-sm font-bold';name.textContent=comment.author_name;const message=document.createElement('p');message.className='mt-1 text-sm leading-6 text-[#746a80]';message.textContent=comment.message;article.append(name,message);list.append(article)})};const load=async()=>{if(!mediaId)return;list.innerHTML='<p class="py-10 text-center text-sm text-[#807588]">…</p>';try{const response=await fetch('/api/gallery/${encodeURIComponent(code)}/media/'+encodeURIComponent(mediaId)+'/comments',{credentials:'include'}),data=await response.json();draw(data.comments||[])}catch{draw([])}};document.querySelectorAll('.lightbox-item').forEach(item=>item.addEventListener('click',()=>{mediaId=item.dataset.mediaId||'';button.classList.toggle('hidden',!mediaId);button.classList.toggle('inline-flex',!!mediaId);panel.classList.add('hidden')}));button.onclick=()=>{panel.classList.toggle('hidden');if(!panel.classList.contains('hidden'))load()};panel.querySelector('[data-close-comments]').onclick=()=>panel.classList.add('hidden');form.addEventListener('submit',async event=>{event.preventDefault();error.classList.add('hidden');const data=new FormData(form);try{const response=await fetch('/api/gallery/${encodeURIComponent(code)}/media/'+encodeURIComponent(mediaId)+'/comments',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({name:data.get('name'),message:data.get('message')})});const result=await response.json();if(!response.ok)throw new Error(result.message);form.elements.message.value='';await load()}catch{error.textContent=labels.error;error.classList.remove('hidden')}});dialog.addEventListener('close',()=>{panel.classList.add('hidden');button.classList.add('hidden');button.classList.remove('inline-flex')})})()<\/script>`;
}
