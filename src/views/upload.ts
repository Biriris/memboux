import {
  ALLOWED_TYPES,
  MAX_FILE_SIZE,
  MAX_UPLOAD_BATCH_SIZE,
  MAX_UPLOAD_FILES,
  MAX_UPLOAD_SELECTION_SIZE,
  UPLOAD_ACCEPT,
} from "../config";
import type { Locale } from "../i18n";

export function uploadLimitsCopy(locale: Locale) {
  return locale === "el"
    ? "Έως 100 φωτογραφίες μαζί · έως 100 MB ανά φωτογραφία και έως 2 GB ανά επιλογή. Τα μεγάλα uploads χωρίζονται αυτόματα σε ασφαλή batches."
    : "Up to 100 photos · 100 MB per photo and up to 2 GB per selection. Large uploads are split into safe batches automatically.";
}

export function photoUploadMarkup(html: string, locale: Locale) {
  const videoAccept = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime";
  return html
    .replaceAll(`accept="${videoAccept}"`, `accept="${UPLOAD_ACCEPT}"`)
    .replaceAll("Upload photos / videos", "Upload photos")
    .replaceAll("Upload φωτογραφιών / βίντεο", "Upload φωτογραφιών")
    .replaceAll("Upload official media", "Upload official photos")
    .replaceAll("Upload official υλικού", "Upload επίσημων φωτογραφιών")
    .replaceAll(
      "Up to 20 files, 100 MB each and 100 MB total.",
      "Up to 100 photos per selection, 100 MB per photo.",
    )
    .replaceAll(
      "Έως 20 αρχεία, 100 MB ανά αρχείο και 100 MB συνολικά.",
      "Έως 100 φωτογραφίες ανά επιλογή, 100 MB ανά φωτογραφία.",
    )
    .replaceAll(
      locale === "el" ? "Επίλεξε φωτογραφίες ή βίντεο." : "Select photos or videos.",
      locale === "el" ? "Επίλεξε φωτογραφίες." : "Select photos.",
    );
}

export function multiUploadScript(locale: Locale) {
  const messages = locale === "el"
    ? {
        tooMany: `Μπορείς να επιλέξεις έως ${MAX_UPLOAD_FILES} φωτογραφίες μαζί.`,
        unsupported: "Προς το παρόν υποστηρίζονται μόνο φωτογραφίες JPEG, PNG, WebP και GIF.",
        fileTooLarge: "Κάθε φωτογραφία πρέπει να είναι έως 100 MB.",
        selectionTooLarge: "Η συνολική επιλογή πρέπει να είναι έως 2 GB.",
        limitsCopy: uploadLimitsCopy("el"),
        uploading: "Ανέβασμα batch",
        complete: "Το ανέβασμα ολοκληρώθηκε.",
        failed: "Το ανέβασμα σταμάτησε. Τα batches που ολοκληρώθηκαν έχουν αποθηκευτεί με ασφάλεια.",
      }
    : {
        tooMany: `You can select up to ${MAX_UPLOAD_FILES} photos at once.`,
        unsupported: "Only JPEG, PNG, WebP, and GIF photos are supported right now.",
        fileTooLarge: "Each photo must be no larger than 100 MB.",
        selectionTooLarge: "The total selection must be no larger than 2 GB.",
        limitsCopy: uploadLimitsCopy("en"),
        uploading: "Uploading batch",
        complete: "Upload complete.",
        failed: "Upload stopped. Completed batches were saved safely.",
      };

  return `<script>(()=>{if(window.__membouxMultiUpload)return;window.__membouxMultiUpload=true;const limits={types:${JSON.stringify([...ALLOWED_TYPES])},files:${MAX_UPLOAD_FILES},fileBytes:${MAX_FILE_SIZE},selectionBytes:${MAX_UPLOAD_SELECTION_SIZE},batchBytes:${MAX_UPLOAD_BATCH_SIZE}},messages=${JSON.stringify(messages)};document.querySelectorAll('form[data-multi-upload],form[enctype="multipart/form-data"]').forEach(form=>{const input=form.querySelector('input[type="file"][name="file"][multiple]'),submit=form.querySelector('button[type="submit"],button:not([type])');if(!input||!submit||form.dataset.multiUploadReady)return;form.dataset.multiUploadReady='true';let anchor=input;if(!form.textContent.includes(messages.limitsCopy)){const hint=document.createElement('p');hint.className='mt-2 text-xs text-[#65756f]';hint.textContent=messages.limitsCopy;input.insertAdjacentElement('afterend',hint);anchor=hint}const status=document.createElement('p');status.className='mt-2 text-xs font-semibold text-[#586c65]';status.setAttribute('role','status');status.setAttribute('aria-live','polite');anchor.insertAdjacentElement('afterend',status);const setStatus=(message,error=false)=>{status.textContent=message;status.classList.toggle('text-red-700',error);status.classList.toggle('text-[#586c65]',!error)};form.addEventListener('submit',async event=>{const files=[...(input.files||[])];if(!files.length)return;event.preventDefault();if(files.length>limits.files){setStatus(messages.tooMany,true);return}if(files.some(file=>!limits.types.includes(file.type))){setStatus(messages.unsupported,true);return}if(files.some(file=>file.size>limits.fileBytes)){setStatus(messages.fileTooLarge,true);return}if(files.reduce((total,file)=>total+file.size,0)>limits.selectionBytes){setStatus(messages.selectionTooLarge,true);return}const batches=[];let batch=[],bytes=0;files.forEach(file=>{if(batch.length&&bytes+file.size>limits.batchBytes){batches.push(batch);batch=[];bytes=0}batch.push(file);bytes+=file.size});if(batch.length)batches.push(batch);const base=new FormData(form);base.delete('file');const originalLabel=submit.textContent;submit.disabled=true;input.disabled=true;form.dataset.uploading='true';try{for(let index=0;index<batches.length;index++){setStatus(messages.uploading+' '+(index+1)+' / '+batches.length+'…');const body=new FormData();base.forEach((value,key)=>body.append(key,value));batches[index].forEach(file=>body.append('file',file,file.name));const response=await fetch(form.action,{method:'POST',body,credentials:'same-origin',headers:{Accept:'application/json'}});if(!response.ok){const detail=await response.text().catch(()=>"");throw new Error(detail||('Upload failed ('+response.status+')'))}}setStatus(messages.complete);window.setTimeout(()=>window.location.reload(),500)}catch(error){setStatus((error instanceof Error&&error.message?error.message:messages.failed),true);submit.disabled=false;input.disabled=false;delete form.dataset.uploading;submit.textContent=originalLabel}})})})()<\/script>`;
}
