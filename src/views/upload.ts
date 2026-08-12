import {
  ALLOWED_TYPES,
  FAST_UPLOAD_MAX_SIZE,
  MAX_FILE_SIZE,
  MAX_LEGACY_FILE_SIZE,
  MAX_UPLOAD_BATCH_SIZE,
  MAX_UPLOAD_FILES,
  MAX_UPLOAD_SELECTION_SIZE,
  UPLOAD_ACCEPT,
} from "../config";
import type { Locale } from "../i18n";

const uploadLimits: Record<Locale, string> = {
  en: "Up to 100 photos or videos · 10 GB per file and 20 GB per selection. Uploads resume automatically after a connection interruption.",
  el: "Έως 100 φωτογραφίες ή βίντεο μαζί · έως 10 GB ανά αρχείο και 20 GB ανά επιλογή. Η μεταφόρτωση συνεχίζεται αυτόματα μετά από διακοπή σύνδεσης.",
  fr: "Jusqu’à 100 photos ou vidéos · 10 Go par fichier et 20 Go par sélection. L’ajout reprend automatiquement après une coupure de connexion.",
  de: "Bis zu 100 Fotos oder Videos · 10 GB pro Datei und 20 GB pro Auswahl. Uploads werden nach einer Verbindungsunterbrechung automatisch fortgesetzt.",
  es: "Hasta 100 fotos o vídeos · 10 GB por archivo y 20 GB por selección. La subida se reanuda automáticamente tras una interrupción.",
  it: "Fino a 100 foto o video · 10 GB per file e 20 GB per selezione. Il caricamento riprende automaticamente dopo un’interruzione.",
};

const selectPhotosCopy: Record<Locale, { photos: string; media: string }> = {
  en: { photos: "Select photos.", media: "Select photos or videos." },
  el: { photos: "Επίλεξε φωτογραφίες.", media: "Επίλεξε φωτογραφίες ή βίντεο." },
  fr: { photos: "Sélectionnez des photos.", media: "Sélectionnez des photos ou vidéos." },
  de: { photos: "Fotos auswählen.", media: "Fotos oder Videos auswählen." },
  es: { photos: "Selecciona fotos.", media: "Selecciona fotos o vídeos." },
  it: { photos: "Seleziona le foto.", media: "Seleziona foto o video." },
};

export function uploadLimitsCopy(locale: Locale) {
  return uploadLimits[locale];
}

export function photoUploadMarkup(html: string, locale: Locale) {
  let result = html
    .replace(
      /<form action="\/studio\/events\/([^"/]+)\/upload"/g,
      '<form data-multi-upload data-upload-origin="official" data-resumable-endpoint="/api/upload/$1/multipart" action="/studio/events/$1/upload"',
    )
    .replaceAll(
      "Up to 20 files, 100 MB each and 100 MB total.",
      "Up to 100 photos or videos. Large guest uploads are resumable.",
    )
    .replaceAll(
      "Έως 20 αρχεία, 100 MB ανά αρχείο και 100 MB συνολικά.",
      "Έως 100 φωτογραφίες ή βίντεο. Οι μεγάλες μεταφορτώσεις των καλεσμένων συνεχίζονται αυτόματα.",
    );
  for (const prompt of Object.values(selectPhotosCopy))
    result = result.replaceAll(prompt.photos, selectPhotosCopy[locale].media);
  return result;
}

export function additiveFileSelectionScript(locale: Locale) {
  const copy: Record<Locale, { hint: string; selected: string; clear: string }> = {
    en: { hint: "Choose several files together, or open the picker again to add more.", selected: "files selected", clear: "Clear selection" },
    el: { hint: "Επίλεξε πολλά αρχεία μαζί ή άνοιξε ξανά την επιλογή για να προσθέσεις κι άλλα.", selected: "αρχεία επιλέχθηκαν", clear: "Καθαρισμός επιλογής" },
    fr: { hint: "Sélectionnez plusieurs fichiers ensemble ou rouvrez le sélecteur pour en ajouter.", selected: "fichiers sélectionnés", clear: "Effacer la sélection" },
    de: { hint: "Wähle mehrere Dateien gemeinsam aus oder öffne die Auswahl erneut, um weitere hinzuzufügen.", selected: "Dateien ausgewählt", clear: "Auswahl löschen" },
    es: { hint: "Selecciona varios archivos a la vez o abre de nuevo el selector para añadir más.", selected: "archivos seleccionados", clear: "Borrar selección" },
    it: { hint: "Seleziona più file insieme oppure riapri la scelta per aggiungerne altri.", selected: "file selezionati", clear: "Cancella selezione" },
  };
  const message = copy[locale];
  return `<script>(()=>{document.querySelectorAll('form[data-multi-upload],form[enctype="multipart/form-data"]').forEach(form=>{const input=form.querySelector('input[type="file"][name="file"][multiple]');if(!input||input.dataset.additiveSelectionReady)return;input.dataset.additiveSelectionReady='true';const hint=document.createElement('p');hint.dataset.additiveSelectionHint='true';hint.className='mt-2 text-xs font-semibold leading-5 text-[#6f657c]';hint.textContent=${JSON.stringify(message.hint)};const summary=document.createElement('div');summary.dataset.selectedFilesSummary='true';summary.className='mt-3 hidden items-center justify-between gap-3 rounded-xl border border-[#e5dff0] bg-[#f8f5ff] px-3 py-2';summary.innerHTML='<strong data-selected-files-count class="text-xs text-[#49395a]"></strong><button type="button" data-clear-selected-files class="shrink-0 rounded-lg border border-[#d8cfea] bg-white px-3 py-1.5 text-xs font-bold text-[#6d28d9]">${message.clear}</button>';input.insertAdjacentElement('afterend',summary);summary.insertAdjacentElement('afterend',hint);const count=summary.querySelector('[data-selected-files-count]'),clear=summary.querySelector('[data-clear-selected-files]');let selected=[...(input.files||[])];const key=file=>[file.name,file.size,file.lastModified,file.type].join('::'),sync=()=>{if(typeof DataTransfer!=='function')return false;const transfer=new DataTransfer();selected.forEach(file=>transfer.items.add(file));input.files=transfer.files;return true},render=()=>{summary.classList.toggle('hidden',!selected.length);summary.classList.toggle('flex',!!selected.length);count.textContent=selected.length+' '+${JSON.stringify(message.selected)};window.dispatchEvent(new CustomEvent('memboux:multi-file-selection',{detail:{count:selected.length}}))};input.addEventListener('change',()=>{const incoming=[...(input.files||[])];if(typeof DataTransfer==='function'){const known=new Set(selected.map(key));incoming.forEach(file=>{const identity=key(file);if(!known.has(identity)){known.add(identity);selected.push(file)}});sync()}else selected=incoming;render()});clear.addEventListener('click',()=>{selected=[];input.value='';sync();render()});form.addEventListener('submit',()=>{clear.disabled=true});form.addEventListener('reset',()=>{selected=[];setTimeout(render)});render()})})()<\/script>`;
}

export function uploadQueueScript(locale: Locale) {
  void locale;
  return `<script>(()=>{const marker='memboux-upload-return';if(sessionStorage.getItem(marker)!=='gallery')return;sessionStorage.removeItem(marker);if(location.hash!=='#guest-moments')history.replaceState(null,'',location.pathname+location.search+'#guest-moments');requestAnimationFrame(()=>document.getElementById('guest-moments')?.scrollIntoView({block:'start'}))})()<\/script>`;
}

export function trialUploadGuardScript(locale: Locale) {
  const copy: Record<Locale, { status: string; full: string; exceeded: string }> = {
    en: { status: "Free trial · {used}/{limit} photo or video slots used.", full: "This event’s free trial has reached 20 photos and videos. Existing memories are safe. The organizer can activate a package to continue uploads.", exceeded: "The selected files exceed the remaining free-trial upload slots." },
    el: { status: "Δωρεάν trial · χρησιμοποιήθηκαν {used}/{limit} θέσεις φωτογραφιών ή βίντεο.", full: "Το δωρεάν trial αυτού του event έφτασε τις 20 φωτογραφίες και βίντεο. Οι αναμνήσεις που ανέβηκαν είναι ασφαλείς. Ο διοργανωτής μπορεί να ενεργοποιήσει πακέτο για να συνεχιστούν τα uploads.", exceeded: "Τα επιλεγμένα αρχεία ξεπερνούν τις διαθέσιμες θέσεις upload του δωρεάν trial." },
    fr: { status: "Essai gratuit · {used}/{limit} emplacements photo ou vidéo utilisés.", full: "L’essai gratuit a atteint 20 photos et vidéos. Les souvenirs déjà ajoutés sont conservés. L’organisateur peut activer un forfait pour poursuivre les ajouts.", exceeded: "Les fichiers sélectionnés dépassent les emplacements restants de l’essai gratuit." },
    de: { status: "Kostenloser Test · {used}/{limit} Foto- oder Video-Plätze belegt.", full: "Der kostenlose Test hat 20 Fotos und Videos erreicht. Bereits hochgeladene Erinnerungen sind sicher. Der Veranstalter kann ein Paket aktivieren, um Uploads fortzusetzen.", exceeded: "Die ausgewählten Dateien überschreiten die verbleibenden Plätze des kostenlosen Tests." },
    es: { status: "Prueba gratuita · {used}/{limit} espacios de foto o vídeo usados.", full: "La prueba gratuita ha alcanzado 20 fotos y vídeos. Los recuerdos ya subidos están seguros. El organizador puede activar un paquete para continuar las subidas.", exceeded: "Los archivos seleccionados superan los espacios restantes de la prueba gratuita." },
    it: { status: "Prova gratuita · {used}/{limit} spazi foto o video usati.", full: "La prova gratuita ha raggiunto 20 foto e video. I ricordi già caricati sono al sicuro. L’organizzatore può attivare un pacchetto per continuare i caricamenti.", exceeded: "I file selezionati superano gli spazi rimanenti della prova gratuita." },
  };
  return `<script>(()=>{const copy=${JSON.stringify(copy[locale])};document.querySelectorAll('form[data-multi-upload]').forEach(async form=>{const match=new URL(form.action,location.href).pathname.match(/^\/api\/upload\/([^/]+)$/);if(!match)return;try{const response=await fetch('/api/upload/'+encodeURIComponent(match[1])+'/capacity',{credentials:'include',headers:{Accept:'application/json'},cache:'no-store'});if(!response.ok)return;const state=await response.json();if(!state.trial)return;const remaining=Number(state.remaining),input=form.querySelector('input[type="file"]'),button=form.querySelector('button[type="submit"],button:not([type])'),message=remaining<=0?copy.full:copy.status.replace('{used}',state.used).replace('{limit}',state.limit),notice=document.createElement('div');form.dataset.trialUploadRemaining=String(remaining);notice.setAttribute('role','status');notice.className='rounded-xl border p-3 text-sm font-semibold leading-6 '+(remaining<=0?'border-amber-300 bg-amber-50 text-amber-950':'border-violet-200 bg-violet-50 text-violet-950');notice.textContent=message;form.prepend(notice);if(remaining<=0){if(input)input.disabled=true;if(button)button.disabled=true;button?.classList.add('cursor-not-allowed','opacity-50')}form.addEventListener('submit',event=>{const selected=input?.files?.length||0;if(selected<=remaining)return;event.preventDefault();event.stopImmediatePropagation();window.alert(copy.exceeded+' '+remaining);},{capture:true})}catch{}})})()<\/script>`;
}

export function multiUploadScript(locale: Locale) {
  const copy: Record<Locale, {
    tooMany: string; unsupported: string; fileTooLarge: string; legacyFileTooLarge: string;
    selectionTooLarge: string; limitsCopy: string; preparing: string; uploading: string;
    paused: string; retrying: string; complete: string; duplicate: string; failed: string;
    cancel: string; cancelled: string;
  }> = {
    el: {
        tooMany: `Μπορείς να επιλέξεις έως ${MAX_UPLOAD_FILES} αρχεία μαζί.`,
        unsupported: "Υποστηρίζονται JPEG, PNG, WebP, GIF, MP4, WebM και MOV.",
        fileTooLarge: "Κάθε αρχείο πρέπει να είναι έως 10 GB.",
        legacyFileTooLarge: "Σε αυτό το σημείο κάθε αρχείο πρέπει να είναι έως 100 MB.",
        selectionTooLarge: "Η συνολική επιλογή πρέπει να είναι έως 20 GB.",
        limitsCopy: uploadLimitsCopy("el"),
        preparing: "Προετοιμασία",
        uploading: "Μεταφόρτωση",
        paused: "Η σύνδεση διακόπηκε. Η μεταφόρτωση θα συνεχιστεί αυτόματα μόλις επανέλθει.",
        retrying: "Προσωρινό πρόβλημα σύνδεσης. Νέα προσπάθεια",
        complete: "Η μεταφόρτωση ολοκληρώθηκε.",
        duplicate: "Το διπλό αρχείο αναγνωρίστηκε και δεν αποθηκεύτηκε δεύτερη φορά.",
        failed: "Η μεταφόρτωση σταμάτησε. Επίλεξε ξανά τα ίδια αρχεία για να συνεχιστεί από το αποθηκευμένο σημείο.",
        cancel: "Ακύρωση",
        cancelled: "Η μεταφόρτωση ακυρώθηκε.",
    },
    en: {
        tooMany: `You can select up to ${MAX_UPLOAD_FILES} files at once.`,
        unsupported: "Supported formats: JPEG, PNG, WebP, GIF, MP4, WebM, and MOV.",
        fileTooLarge: "Each file must be no larger than 10 GB.",
        legacyFileTooLarge: "Files in this uploader must be no larger than 100 MB.",
        selectionTooLarge: "The total selection must be no larger than 20 GB.",
        limitsCopy: uploadLimitsCopy("en"),
        preparing: "Preparing",
        uploading: "Uploading",
        paused: "Connection interrupted. Upload will resume automatically when you are online.",
        retrying: "Temporary connection problem. Retrying",
        complete: "Upload complete.",
        duplicate: "The duplicate was detected and was not stored twice.",
        failed: "Upload paused. Select the same files again to continue from the saved point.",
        cancel: "Cancel",
        cancelled: "Upload cancelled.",
    },
    fr: {
      tooMany: `Vous pouvez sélectionner jusqu’à ${MAX_UPLOAD_FILES} fichiers à la fois.`,
      unsupported: "Formats pris en charge : JPEG, PNG, WebP, GIF, MP4, WebM et MOV.",
      fileTooLarge: "Chaque fichier doit peser au maximum 10 Go.",
      legacyFileTooLarge: "Dans cet espace, chaque fichier doit peser au maximum 100 Mo.",
      selectionTooLarge: "La sélection complète doit peser au maximum 20 Go.",
      limitsCopy: uploadLimitsCopy("fr"),
      preparing: "Préparation",
      uploading: "Ajout",
      paused: "Connexion interrompue. L’ajout reprendra automatiquement dès votre retour en ligne.",
      retrying: "Problème de connexion temporaire. Nouvelle tentative",
      complete: "Ajout terminé.",
      duplicate: "Le doublon a été détecté et n’a pas été enregistré une seconde fois.",
      failed: "Ajout interrompu. Sélectionnez à nouveau les mêmes fichiers pour reprendre au point enregistré.",
      cancel: "Annuler",
      cancelled: "Ajout annulé.",
    },
    de: {
      tooMany: `Du kannst bis zu ${MAX_UPLOAD_FILES} Dateien gleichzeitig auswählen.`,
      unsupported: "Unterstützte Formate: JPEG, PNG, WebP, GIF, MP4, WebM und MOV.",
      fileTooLarge: "Jede Datei darf höchstens 10 GB groß sein.",
      legacyFileTooLarge: "In diesem Uploader darf jede Datei höchstens 100 MB groß sein.",
      selectionTooLarge: "Die gesamte Auswahl darf höchstens 20 GB groß sein.",
      limitsCopy: uploadLimitsCopy("de"),
      preparing: "Vorbereitung",
      uploading: "Upload",
      paused: "Verbindung unterbrochen. Der Upload wird automatisch fortgesetzt, sobald du wieder online bist.",
      retrying: "Vorübergehendes Verbindungsproblem. Neuer Versuch",
      complete: "Upload abgeschlossen.",
      duplicate: "Das Duplikat wurde erkannt und nicht erneut gespeichert.",
      failed: "Upload angehalten. Wähle dieselben Dateien erneut aus, um am gespeicherten Punkt fortzufahren.",
      cancel: "Abbrechen",
      cancelled: "Upload abgebrochen.",
    },
    es: {
      tooMany: `Puedes seleccionar hasta ${MAX_UPLOAD_FILES} archivos a la vez.`,
      unsupported: "Formatos compatibles: JPEG, PNG, WebP, GIF, MP4, WebM y MOV.",
      fileTooLarge: "Cada archivo debe ocupar como máximo 10 GB.",
      legacyFileTooLarge: "En este cargador, cada archivo debe ocupar como máximo 100 MB.",
      selectionTooLarge: "La selección completa debe ocupar como máximo 20 GB.",
      limitsCopy: uploadLimitsCopy("es"),
      preparing: "Preparando",
      uploading: "Subiendo",
      paused: "La conexión se ha interrumpido. La subida continuará automáticamente cuando vuelvas a estar en línea.",
      retrying: "Problema temporal de conexión. Reintentando",
      complete: "Subida completada.",
      duplicate: "Se detectó el archivo duplicado y no se guardó dos veces.",
      failed: "Subida pausada. Selecciona de nuevo los mismos archivos para continuar desde el punto guardado.",
      cancel: "Cancelar",
      cancelled: "Subida cancelada.",
    },
    it: {
      tooMany: `Puoi selezionare fino a ${MAX_UPLOAD_FILES} file alla volta.`,
      unsupported: "Formati supportati: JPEG, PNG, WebP, GIF, MP4, WebM e MOV.",
      fileTooLarge: "Ogni file deve avere una dimensione massima di 10 GB.",
      legacyFileTooLarge: "In questa sezione ogni file deve avere una dimensione massima di 100 MB.",
      selectionTooLarge: "La selezione completa deve avere una dimensione massima di 20 GB.",
      limitsCopy: uploadLimitsCopy("it"),
      preparing: "Preparazione",
      uploading: "Caricamento",
      paused: "Connessione interrotta. Il caricamento riprenderà automaticamente quando tornerai online.",
      retrying: "Problema temporaneo di connessione. Nuovo tentativo",
      complete: "Caricamento completato.",
      duplicate: "Il duplicato è stato rilevato e non è stato salvato due volte.",
      failed: "Caricamento in pausa. Seleziona di nuovo gli stessi file per riprendere dal punto salvato.",
      cancel: "Annulla",
      cancelled: "Caricamento annullato.",
    },
  };
  const messages = copy[locale];

  return `<script>(()=>{if(window.__membouxMultiUpload)return;window.__membouxMultiUpload=true;const limits={types:${JSON.stringify([...ALLOWED_TYPES])},files:${MAX_UPLOAD_FILES},fileBytes:${MAX_FILE_SIZE},legacyFileBytes:${MAX_LEGACY_FILE_SIZE},selectionBytes:${MAX_UPLOAD_SELECTION_SIZE},batchBytes:${MAX_UPLOAD_BATCH_SIZE},fastFileBytes:${FAST_UPLOAD_MAX_SIZE}},messages=${JSON.stringify(messages)},encoder=new TextEncoder();const bytesLabel=value=>{const units=['B','KB','MB','GB'];let amount=value,index=0;while(amount>=1024&&index<units.length-1){amount/=1024;index++}return amount.toFixed(index>1?1:0)+' '+units[index]};const hex=buffer=>[...new Uint8Array(buffer)].map(value=>value.toString(16).padStart(2,'0')).join('');const digest=async value=>hex(await crypto.subtle.digest('SHA-256',value));const fileFingerprint=async file=>{const sample=64*1024,head=new Uint8Array(await file.slice(0,Math.min(sample,file.size)).arrayBuffer()),tailStart=Math.max(0,file.size-sample),tail=new Uint8Array(await file.slice(tailStart,file.size).arrayBuffer()),metadata=encoder.encode(file.size+'\\0'+file.type+'\\0'+file.lastModified),combined=new Uint8Array(metadata.length+head.length+tail.length);combined.set(metadata);combined.set(head,metadata.length);combined.set(tail,metadata.length+head.length);return digest(combined)};const videoPoster=file=>new Promise(resolve=>{if(!file.type.startsWith('video/'))return resolve(null);const video=document.createElement('video'),url=URL.createObjectURL(file);let settled=false;const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);URL.revokeObjectURL(url);video.remove();resolve(value)};const capture=()=>{try{const width=Math.min(640,video.videoWidth||640),height=Math.max(1,Math.round(width*(video.videoHeight||360)/(video.videoWidth||640))),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d')?.drawImage(video,0,0,width,height);canvas.toBlob(blob=>finish(blob),'image/webp',.78)}catch{finish(null)}};const timer=setTimeout(()=>finish(null),8000);video.muted=true;video.playsInline=true;video.preload='metadata';video.addEventListener('error',()=>finish(null),{once:true});video.addEventListener('loadeddata',()=>{if(Number.isFinite(video.duration)&&video.duration>.2){video.addEventListener('seeked',capture,{once:true});video.currentTime=Math.min(.2,video.duration/2)}else capture()},{once:true});video.src=url;video.load()});const waitForOnline=()=>navigator.onLine?Promise.resolve():new Promise(resolve=>window.addEventListener('online',resolve,{once:true}));const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));const responseMessage=async response=>{const raw=await response.text().catch(()=>'');try{return JSON.parse(raw).message||raw}catch{return raw}};const retry=async(run,onWait)=>{let lastError;for(let attempt=0;attempt<9;attempt++){if(!navigator.onLine){onWait(messages.paused);await waitForOnline()}try{const response=await run();if(response.ok)return response;const detail=await responseMessage(response);if(response.status<500&&response.status!==408&&response.status!==429)throw Object.assign(new Error(detail||('Upload failed ('+response.status+')')),{permanent:true});lastError=new Error(detail||('Upload failed ('+response.status+')'))}catch(error){if(error?.name==='AbortError')throw Object.assign(new Error(messages.cancelled),{permanent:true,cancelled:true});if(error?.permanent)throw error;lastError=error}const seconds=Math.min(30,Math.pow(2,attempt));onWait(messages.retrying+' '+(attempt+2)+' / 9…');await delay(seconds*1000)}throw lastError||new Error(messages.failed)};const resumableEndpoint=form=>{if(form.dataset.resumableEndpoint)return form.dataset.resumableEndpoint;const url=new URL(form.action,location.href);return /^\\/api\\/upload\\/[^/]+$/.test(url.pathname)?url.pathname+'/multipart':null};document.querySelectorAll('form[data-multi-upload],form[enctype="multipart/form-data"]').forEach(form=>{const input=form.querySelector('input[type="file"][name="file"][multiple]'),submit=form.querySelector('button[type="submit"],button:not([type])');if(!input||!submit||form.dataset.multiUploadReady)return;form.dataset.multiUploadReady='true';window.addEventListener('beforeunload',event=>{if(form.dataset.uploading!=='true')return;event.preventDefault();event.returnValue=''});let anchor=input;if(!form.textContent.includes(messages.limitsCopy)){const hint=document.createElement('p');hint.className='mt-2 text-xs text-[#6f657c]';hint.textContent=messages.limitsCopy;input.insertAdjacentElement('afterend',hint);anchor=hint}const panel=document.createElement('div');panel.className='mt-3 hidden rounded-2xl border border-[#e5dff0] bg-[#f9f6ff] p-3';panel.innerHTML='<div class="flex items-center justify-between gap-3 text-xs font-semibold text-[#5e4f69]"><span data-upload-status></span><span data-upload-percent>0%</span></div><div class="mt-2 h-2 overflow-hidden rounded-full bg-[#e8e1f1]"><span data-upload-progress class="block h-full w-0 rounded-full bg-[#7c3aed] transition-[width] duration-100 ease-linear"></span></div><div class="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]"><p data-upload-detail class="text-[#6f657c]" role="status" aria-live="polite"></p><div class="flex items-center gap-3"><span data-upload-count class="font-bold text-[#5e4f69]">0 / 0</span><button data-upload-cancel type="button" class="hidden rounded-lg border border-[#cfc3df] bg-white px-3 py-1.5 font-semibold text-[#5e4f69] hover:border-[#7c3aed] hover:text-[#6d28d9]">'+messages.cancel+'</button></div></div>';anchor.insertAdjacentElement('afterend',panel);const status=panel.querySelector('[data-upload-status]'),percent=panel.querySelector('[data-upload-percent]'),progress=panel.querySelector('[data-upload-progress]'),detail=panel.querySelector('[data-upload-detail]'),count=panel.querySelector('[data-upload-count]'),cancel=panel.querySelector('[data-upload-cancel]');let completedFiles=0,totalFiles=0,controller=null,cleanup=async()=>{};const uploadFetch=(url,options={})=>fetch(url,{...options,signal:controller?.signal});const xhrUpload=(url,options,onProgress)=>new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest(),abort=()=>xhr.abort(),detach=()=>controller?.signal.removeEventListener('abort',abort);xhr.open(options.method||'GET',url,true);xhr.withCredentials=true;Object.entries(options.headers||{}).forEach(([key,value])=>xhr.setRequestHeader(key,String(value)));xhr.upload.onprogress=event=>{if(event.lengthComputable)onProgress?.(event.loaded,event.total)};xhr.onload=()=>{detach();resolve(new Response(xhr.responseText,{status:xhr.status,statusText:xhr.statusText,headers:{'Content-Type':xhr.getResponseHeader('Content-Type')||'application/json'}}))};xhr.onerror=()=>{detach();reject(new TypeError('Network request failed'))};xhr.onabort=()=>{detach();reject(new DOMException(messages.cancelled,'AbortError'))};if(controller?.signal.aborted)return xhr.onabort();controller?.signal.addEventListener('abort',abort,{once:true});xhr.send(options.body??null)});const markFileDone=()=>{completedFiles=Math.min(totalFiles,completedFiles+1)};const show=(label,done,total,message='',error=false)=>{panel.classList.remove('hidden');const value=total?Math.min(100,done/total*100):0,displayValue=value>=99.95?'100':value.toFixed(1);status.textContent=label;percent.textContent=displayValue+'%';progress.style.width=value+'%';detail.textContent=message||(bytesLabel(done)+' / '+bytesLabel(total));count.textContent=completedFiles+' / '+totalFiles;detail.classList.toggle('text-red-700',error);detail.classList.toggle('text-[#6f657c]',!error)};const uploadResumable=async(files,endpoint,base,totalBytes)=>{  let duplicates=0,nextFile=0;  const finalized=[],progressByFile=files.map(()=>0),activeSessions=new Map();cleanup=async()=>{await Promise.allSettled([...activeSessions.values()].map(session=>fetch(endpoint+'/'+encodeURIComponent(session.id),{method:'DELETE',credentials:'same-origin',keepalive:true,headers:{Accept:'application/json','Upload-Token':session.token}})))};  const totalDone=()=>progressByFile.reduce((sum,value)=>sum+value,0);  const connection=navigator.connection||{},coarse=matchMedia('(pointer:coarse)').matches,constrained=connection.saveData||/^(slow-)?2g$/.test(connection.effectiveType||''),maxFileConcurrency=constrained?2:coarse?5:8;  const uploadFile=async fileIndex=>{    const file=files[fileIndex],posterPromise=videoPoster(file),fingerprintPromise=fileFingerprint(file);    show(messages.preparing,totalDone(),totalBytes);    if(file.size<=limits.fastFileBytes){const [fingerprint,fileBytes]=await Promise.all([fingerprintPromise,file.arrayBuffer()]),contentHash=await digest(fileBytes),fastEndpoint=endpoint.replace(/\\/multipart$/,'/fast'),fastResponse=await retry(()=>xhrUpload(fastEndpoint,{method:'PUT',credentials:'same-origin',headers:{Accept:'application/json','Content-Type':file.type||'application/octet-stream','Upload-Filename':encodeURIComponent(file.name),'Upload-Size':String(file.size),'Upload-Last-Modified':String(file.lastModified),'Upload-Fingerprint':fingerprint,'Upload-Content-SHA256':contentHash,'Upload-Origin':form.dataset.uploadOrigin||'guest','Upload-Name':encodeURIComponent(String(base.get('name')||'')),'Upload-Consent':String(base.get('upload_confirmation')||''),'Upload-Locale':String(base.get('locale')||'en')},body:fileBytes},loaded=>{progressByFile[fileIndex]=Math.min(file.size,loaded);show(messages.uploading,totalDone(),totalBytes)}),message=>show(messages.uploading,totalDone(),totalBytes,message)),fastResult=await fastResponse.json();if(fastResult.duplicate)duplicates++;else if(fastResult.sessionId&&fastResult.token){const saved={id:fastResult.sessionId,token:fastResult.token};finalized.push(saved);activeSessions.set(saved.id,saved);const poster=await posterPromise;if(poster)await uploadFetch(endpoint+'/'+encodeURIComponent(saved.id)+'/variants/thumb',{method:'PUT',credentials:'same-origin',headers:{Accept:'application/json','Upload-Token':saved.token,'Content-Type':'image/webp'},body:poster}).catch(()=>{})}progressByFile[fileIndex]=file.size;markFileDone();show(messages.uploading,totalDone(),totalBytes,fastResult.duplicate?messages.duplicate:'');return}    const fingerprint=await fingerprintPromise;    const createResponse=await retry(()=>uploadFetch(endpoint,{method:'POST',credentials:'same-origin',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({filename:file.name,contentType:file.type,size:file.size,lastModified:file.lastModified,fingerprint,origin:form.dataset.uploadOrigin||'guest',name:String(base.get('name')||''),consent:String(base.get('upload_confirmation')||''),locale:String(base.get('locale')||'en')})}),message=>show(messages.preparing,totalDone(),totalBytes,message));    const session=await createResponse.json();if(session.duplicate){duplicates++;progressByFile[fileIndex]=file.size;markFileDone();show(messages.uploading,totalDone(),totalBytes,messages.duplicate);return}const uploaded=new Map((session.uploadedParts||[]).map(part=>[Number(part.partNumber),part])),partSize=Number(session.partSize),totalParts=Number(session.totalParts);    activeSessions.set(session.sessionId,{id:session.sessionId,token:session.token});    localStorage.setItem('memboux-upload:'+endpoint+':'+fingerprint,JSON.stringify({id:session.sessionId,token:session.token,expiresAt:Date.now()+6*86400000}));    let nextPart=1,committedBytes=0;const inFlightBytes=new Map();    const update=(message='')=>{const done=totalDone();show(messages.uploading,done,totalBytes,message)};    const partWorker=async()=>{while(true){const partNumber=nextPart++;if(partNumber>totalParts)return;const start=(partNumber-1)*partSize,end=Math.min(file.size,start+partSize),blob=file.slice(start,end),partBytes=await blob.arrayBuffer(),partHash=await digest(partBytes),known=uploaded.get(partNumber);inFlightBytes.set(partNumber,0);const partProgress=loaded=>{inFlightBytes.set(partNumber,Math.min(partBytes.byteLength,loaded));progressByFile[fileIndex]=Math.min(file.size,committedBytes+[...inFlightBytes.values()].reduce((sum,value)=>sum+value,0));update()};if(!(known&&known.hash===partHash))await retry(()=>xhrUpload(endpoint+'/'+encodeURIComponent(session.sessionId)+'/parts/'+partNumber,{method:'PUT',headers:{Accept:'application/json','Upload-Token':session.token,'Part-Fingerprint':partHash,'Content-Type':'application/octet-stream'},body:partBytes},partProgress),message=>update(message));inFlightBytes.delete(partNumber);committedBytes+=partBytes.byteLength;progressByFile[fileIndex]=Math.min(file.size,committedBytes+[...inFlightBytes.values()].reduce((sum,value)=>sum+value,0));update()}};    const partConcurrency=files.length===1?Math.min(constrained?2:coarse?3:6,totalParts):Math.min(1,totalParts);    await Promise.all(Array.from({length:partConcurrency},partWorker));    const poster=await posterPromise;if(poster)await uploadFetch(endpoint+'/'+encodeURIComponent(session.sessionId)+'/variants/thumb',{method:'PUT',credentials:'same-origin',headers:{Accept:'application/json','Upload-Token':session.token,'Content-Type':'image/webp'},body:poster}).catch(()=>{});    const completeResponse=await retry(()=>uploadFetch(endpoint+'/'+encodeURIComponent(session.sessionId)+'/complete',{method:'POST',credentials:'same-origin',headers:{Accept:'application/json','Upload-Token':session.token}}),message=>update(message)),completed=await completeResponse.json();    if(completed.duplicate)duplicates++;    finalized.push({id:session.sessionId,token:session.token});    localStorage.removeItem('memboux-upload:'+endpoint+':'+fingerprint);    progressByFile[fileIndex]=file.size;markFileDone();    show(messages.uploading,totalDone(),totalBytes,completed.duplicate?messages.duplicate:'');  };  const fileWorker=async()=>{while(true){const fileIndex=nextFile++;if(fileIndex>=files.length)return;await uploadFile(fileIndex)}};  await Promise.all(Array.from({length:Math.min(maxFileConcurrency,files.length)},fileWorker));  await retry(()=>uploadFetch(endpoint+'/finalize',{method:'POST',credentials:'same-origin',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({sessions:finalized})}),message=>show(messages.uploading,totalDone(),totalBytes,message));  activeSessions.clear();cleanup=async()=>{};  return duplicates};const uploadLegacy=async(files,totalBytes)=>{const batches=[];let batch=[],bytes=0;files.forEach(file=>{if(batch.length&&bytes+file.size>limits.batchBytes){batches.push(batch);batch=[];bytes=0}batch.push(file);bytes+=file.size});if(batch.length)batches.push(batch);let done=0;const base=new FormData(form);base.delete('file');for(let index=0;index<batches.length;index++){const body=new FormData();base.forEach((value,key)=>body.append(key,value));batches[index].forEach(file=>body.append('file',file,file.name));const batchBytes=batches[index].reduce((sum,file)=>sum+file.size,0);await retry(()=>xhrUpload(form.action,{method:'POST',body,headers:{Accept:'application/json'}},loaded=>show(messages.uploading+' '+(index+1)+' / '+batches.length,done+Math.min(batchBytes,loaded),totalBytes)),message=>show(messages.uploading+' '+(index+1)+' / '+batches.length,done,totalBytes,message));done+=batches[index].reduce((sum,file)=>sum+file.size,0);completedFiles+=batches[index].length;show(messages.uploading+' '+(index+1)+' / '+batches.length,done,totalBytes)}return 0};form.addEventListener('submit',async event=>{const files=[...(input.files||[])];if(!files.length)return;event.preventDefault();const endpoint=resumableEndpoint(form),totalBytes=files.reduce((total,file)=>total+file.size,0),maxFile=endpoint?limits.fileBytes:limits.legacyFileBytes;if(files.length>limits.files){show('',0,totalBytes,messages.tooMany,true);return}if(files.some(file=>!limits.types.includes(file.type))){show('',0,totalBytes,messages.unsupported,true);return}if(files.some(file=>file.size>maxFile)){show('',0,totalBytes,endpoint?messages.fileTooLarge:messages.legacyFileTooLarge,true);return}if(totalBytes>limits.selectionBytes){show('',0,totalBytes,messages.selectionTooLarge,true);return}const base=new FormData(form);base.delete('file');completedFiles=0;totalFiles=files.length;controller=new AbortController();cleanup=async()=>{};cancel.disabled=false;cancel.classList.remove('hidden');submit.disabled=true;input.disabled=true;form.dataset.uploading='true';try{const duplicates=endpoint?await uploadResumable(files,endpoint,base,totalBytes):await uploadLegacy(files,totalBytes);cancel.classList.add('hidden');show(messages.complete,totalBytes,totalBytes,duplicates?messages.duplicate:'');sessionStorage.setItem('memboux-upload-return','gallery');delete form.dataset.uploading;window.setTimeout(()=>window.location.reload(),700)}catch(error){cancel.classList.add('hidden');show('',0,totalBytes,error instanceof Error&&error.message?error.message:messages.failed,true);submit.disabled=false;input.disabled=false;delete form.dataset.uploading}});cancel.addEventListener('click',async()=>{if(form.dataset.uploading!=='true'||!controller)return;cancel.disabled=true;controller.abort();await cleanup();show('',0,1,messages.cancelled,true);submit.disabled=false;input.disabled=false;cancel.classList.add('hidden');delete form.dataset.uploading})})})()<\/script>`;
}
