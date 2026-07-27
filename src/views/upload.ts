import {
  ALLOWED_TYPES,
  MAX_FILE_SIZE,
  MAX_LEGACY_FILE_SIZE,
  MAX_UPLOAD_BATCH_SIZE,
  MAX_UPLOAD_FILES,
  MAX_UPLOAD_SELECTION_SIZE,
  UPLOAD_ACCEPT,
} from "../config";
import type { Locale } from "../i18n";

export function uploadLimitsCopy(locale: Locale) {
  return locale === "el"
    ? "Έως 100 φωτογραφίες ή βίντεο μαζί · έως 10 GB ανά αρχείο και 20 GB ανά επιλογή. Το upload συνεχίζει αυτόματα μετά από διακοπή σύνδεσης."
    : "Up to 100 photos or videos · 10 GB per file and 20 GB per selection. Uploads resume automatically after a connection interruption.";
}

export function photoUploadMarkup(html: string, locale: Locale) {
  return html
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
      "Έως 100 φωτογραφίες ή βίντεο. Τα μεγάλα guest uploads συνεχίζουν αυτόματα.",
    )
    .replaceAll(
      locale === "el" ? "Επίλεξε φωτογραφίες." : "Select photos.",
      locale === "el" ? "Επίλεξε φωτογραφίες ή βίντεο." : "Select photos or videos.",
    );
}

export function multiUploadScript(locale: Locale) {
  const messages = locale === "el"
    ? {
        tooMany: `Μπορείς να επιλέξεις έως ${MAX_UPLOAD_FILES} αρχεία μαζί.`,
        unsupported: "Υποστηρίζονται JPEG, PNG, WebP, GIF, MP4, WebM και MOV.",
        fileTooLarge: "Κάθε αρχείο πρέπει να είναι έως 10 GB.",
        legacyFileTooLarge: "Σε αυτό το σημείο κάθε αρχείο πρέπει να είναι έως 100 MB.",
        selectionTooLarge: "Η συνολική επιλογή πρέπει να είναι έως 20 GB.",
        limitsCopy: uploadLimitsCopy("el"),
        preparing: "Προετοιμασία",
        uploading: "Ανέβασμα",
        paused: "Η σύνδεση διακόπηκε. Το upload θα συνεχίσει αυτόματα μόλις επανέλθει.",
        retrying: "Προσωρινό πρόβλημα σύνδεσης. Νέα προσπάθεια",
        complete: "Το upload ολοκληρώθηκε.",
        duplicate: "Το διπλό αρχείο αναγνωρίστηκε και δεν αποθηκεύτηκε δεύτερη φορά.",
        failed: "Το upload σταμάτησε. Επίλεξε ξανά τα ίδια αρχεία για να συνεχίσει από το αποθηκευμένο σημείο.",
      }
    : {
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
      };

  return `<script>(()=>{if(window.__membouxMultiUpload)return;window.__membouxMultiUpload=true;const limits={types:${JSON.stringify([...ALLOWED_TYPES])},files:${MAX_UPLOAD_FILES},fileBytes:${MAX_FILE_SIZE},legacyFileBytes:${MAX_LEGACY_FILE_SIZE},selectionBytes:${MAX_UPLOAD_SELECTION_SIZE},batchBytes:${MAX_UPLOAD_BATCH_SIZE}},messages=${JSON.stringify(messages)},encoder=new TextEncoder();const bytesLabel=value=>{const units=['B','KB','MB','GB'];let amount=value,index=0;while(amount>=1024&&index<units.length-1){amount/=1024;index++}return amount.toFixed(index>1?1:0)+' '+units[index]};const hex=buffer=>[...new Uint8Array(buffer)].map(value=>value.toString(16).padStart(2,'0')).join('');const digest=async value=>hex(await crypto.subtle.digest('SHA-256',value));const fileFingerprint=async file=>{const sample=64*1024,head=new Uint8Array(await file.slice(0,Math.min(sample,file.size)).arrayBuffer()),tailStart=Math.max(0,file.size-sample),tail=new Uint8Array(await file.slice(tailStart,file.size).arrayBuffer()),metadata=encoder.encode(file.size+'\\0'+file.type+'\\0'+file.lastModified),combined=new Uint8Array(metadata.length+head.length+tail.length);combined.set(metadata);combined.set(head,metadata.length);combined.set(tail,metadata.length+head.length);return digest(combined)};const waitForOnline=()=>navigator.onLine?Promise.resolve():new Promise(resolve=>window.addEventListener('online',resolve,{once:true}));const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));const responseMessage=async response=>{const raw=await response.text().catch(()=>'');try{return JSON.parse(raw).message||raw}catch{return raw}};const retry=async(run,onWait)=>{let lastError;for(let attempt=0;attempt<9;attempt++){if(!navigator.onLine){onWait(messages.paused);await waitForOnline()}try{const response=await run();if(response.ok)return response;const detail=await responseMessage(response);if(response.status<500&&response.status!==408&&response.status!==429)throw Object.assign(new Error(detail||('Upload failed ('+response.status+')')),{permanent:true});lastError=new Error(detail||('Upload failed ('+response.status+')'))}catch(error){if(error?.permanent)throw error;lastError=error}const seconds=Math.min(30,Math.pow(2,attempt));onWait(messages.retrying+' '+(attempt+2)+' / 9…');await delay(seconds*1000)}throw lastError||new Error(messages.failed)};const imageVariants=async file=>{if(!file.type.startsWith('image/'))return[];let source,url;try{if('createImageBitmap'in window)source=await createImageBitmap(file,{imageOrientation:'from-image'});else{url=URL.createObjectURL(file);source=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=url})}const width=source.width||source.naturalWidth,height=source.height||source.naturalHeight;if(!width||!height)return[];const make=async(name,maxWidth,quality)=>{const scale=Math.min(1,maxWidth/width),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));const context=canvas.getContext('2d',{alpha:false});if(!context)throw new Error('Canvas unavailable');context.drawImage(source,0,0,canvas.width,canvas.height);const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Preview unavailable')),'image/webp',quality));return{name,blob}};return await Promise.all([make('thumb',640,.78),make('preview',1600,.84)])}catch{return[]}finally{source?.close?.();if(url)URL.revokeObjectURL(url)}};const resumableEndpoint=form=>{if(form.dataset.resumableEndpoint)return form.dataset.resumableEndpoint;const url=new URL(form.action,location.href);return /^\\/api\\/upload\\/[^/]+$/.test(url.pathname)?url.pathname+'/multipart':null};document.querySelectorAll('form[data-multi-upload],form[enctype="multipart/form-data"]').forEach(form=>{const input=form.querySelector('input[type="file"][name="file"][multiple]'),submit=form.querySelector('button[type="submit"],button:not([type])');if(!input||!submit||form.dataset.multiUploadReady)return;form.dataset.multiUploadReady='true';let anchor=input;if(!form.textContent.includes(messages.limitsCopy)){const hint=document.createElement('p');hint.className='mt-2 text-xs text-[#65756f]';hint.textContent=messages.limitsCopy;input.insertAdjacentElement('afterend',hint);anchor=hint}const panel=document.createElement('div');panel.className='mt-3 hidden rounded-2xl border border-[#d9e5e0] bg-[#f5f9f7] p-3';panel.innerHTML='<div class="flex items-center justify-between gap-3 text-xs font-semibold text-[#40564e]"><span data-upload-status></span><span data-upload-percent>0%</span></div><div class="mt-2 h-2 overflow-hidden rounded-full bg-[#dce8e3]"><span data-upload-progress class="block h-full w-0 rounded-full bg-[#2f6b5b] transition-[width] duration-200"></span></div><p data-upload-detail class="mt-2 text-[11px] text-[#65756f]" role="status" aria-live="polite"></p>';anchor.insertAdjacentElement('afterend',panel);const status=panel.querySelector('[data-upload-status]'),percent=panel.querySelector('[data-upload-percent]'),progress=panel.querySelector('[data-upload-progress]'),detail=panel.querySelector('[data-upload-detail]');const show=(label,done,total,message='',error=false)=>{panel.classList.remove('hidden');const value=total?Math.min(100,Math.round(done/total*100)):0;status.textContent=label;percent.textContent=value+'%';progress.style.width=value+'%';detail.textContent=message||(bytesLabel(done)+' / '+bytesLabel(total));detail.classList.toggle('text-red-700',error);detail.classList.toggle('text-[#65756f]',!error)};const uploadResumable=async(files,endpoint,base,totalBytes)=>{let selectionDone=0,duplicates=0;const finalized=[];for(let fileIndex=0;fileIndex<files.length;fileIndex++){const file=files[fileIndex],prefix=(fileIndex+1)+' / '+files.length+' · '+file.name;show(messages.preparing+' '+prefix,selectionDone,totalBytes);const fingerprint=await fileFingerprint(file),createResponse=await retry(()=>fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({filename:file.name,contentType:file.type,size:file.size,lastModified:file.lastModified,fingerprint,origin:form.dataset.uploadOrigin||'guest',name:String(base.get('name')||''),consent:String(base.get('upload_confirmation')||''),locale:String(base.get('locale')||'en')})}),message=>show(messages.preparing+' '+prefix,selectionDone,totalBytes,message));const session=await createResponse.json(),uploaded=new Map((session.uploadedParts||[]).map(part=>[Number(part.partNumber),part])),partSize=Number(session.partSize),totalParts=Number(session.totalParts);localStorage.setItem('memboux-upload:'+endpoint+':'+fingerprint,JSON.stringify({id:session.sessionId,token:session.token,expiresAt:Date.now()+6*86400000}));let fileDone=0,nextPart=1;const update=(message='')=>show(messages.uploading+' '+prefix,selectionDone+fileDone,totalBytes,message);const worker=async()=>{while(true){const partNumber=nextPart++;if(partNumber>totalParts)return;const start=(partNumber-1)*partSize,end=Math.min(file.size,start+partSize),blob=file.slice(start,end),partHash=await digest(await blob.arrayBuffer()),known=uploaded.get(partNumber);if(known&&known.hash===partHash){fileDone+=blob.size;update();continue}await retry(()=>fetch(endpoint+'/'+encodeURIComponent(session.sessionId)+'/parts/'+partNumber,{method:'PUT',credentials:'same-origin',headers:{Accept:'application/json','Upload-Token':session.token,'Part-Fingerprint':partHash,'Content-Type':'application/octet-stream'},body:blob}),message=>update(message));fileDone+=blob.size;update()}};await Promise.all(Array.from({length:Math.min(3,totalParts)},worker));const variants=await imageVariants(file);for(const variant of variants)await retry(()=>fetch(endpoint+'/'+encodeURIComponent(session.sessionId)+'/variants/'+variant.name,{method:'PUT',credentials:'same-origin',headers:{Accept:'application/json','Upload-Token':session.token,'Content-Type':'image/webp'},body:variant.blob}),message=>update(message));const completeResponse=await retry(()=>fetch(endpoint+'/'+encodeURIComponent(session.sessionId)+'/complete',{method:'POST',credentials:'same-origin',headers:{Accept:'application/json','Upload-Token':session.token}}),message=>update(message)),completed=await completeResponse.json();if(completed.duplicate)duplicates++;finalized.push({id:session.sessionId,token:session.token});localStorage.removeItem('memboux-upload:'+endpoint+':'+fingerprint);selectionDone+=file.size;fileDone=0;show(messages.uploading+' '+prefix,selectionDone,totalBytes,completed.duplicate?messages.duplicate:'')}await retry(()=>fetch(endpoint+'/finalize',{method:'POST',credentials:'same-origin',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({sessions:finalized})}),message=>show(messages.uploading,selectionDone,totalBytes,message));return duplicates};const uploadLegacy=async(files,totalBytes)=>{const batches=[];let batch=[],bytes=0;files.forEach(file=>{if(batch.length&&bytes+file.size>limits.batchBytes){batches.push(batch);batch=[];bytes=0}batch.push(file);bytes+=file.size});if(batch.length)batches.push(batch);let done=0;const base=new FormData(form);base.delete('file');for(let index=0;index<batches.length;index++){const body=new FormData();base.forEach((value,key)=>body.append(key,value));batches[index].forEach(file=>body.append('file',file,file.name));await retry(()=>fetch(form.action,{method:'POST',body,credentials:'same-origin',headers:{Accept:'application/json'}}),message=>show(messages.uploading+' '+(index+1)+' / '+batches.length,done,totalBytes,message));done+=batches[index].reduce((sum,file)=>sum+file.size,0);show(messages.uploading+' '+(index+1)+' / '+batches.length,done,totalBytes)}return 0};form.addEventListener('submit',async event=>{const files=[...(input.files||[])];if(!files.length)return;event.preventDefault();const endpoint=resumableEndpoint(form),totalBytes=files.reduce((total,file)=>total+file.size,0),maxFile=endpoint?limits.fileBytes:limits.legacyFileBytes;if(files.length>limits.files){show('',0,totalBytes,messages.tooMany,true);return}if(files.some(file=>!limits.types.includes(file.type))){show('',0,totalBytes,messages.unsupported,true);return}if(files.some(file=>file.size>maxFile)){show('',0,totalBytes,endpoint?messages.fileTooLarge:messages.legacyFileTooLarge,true);return}if(totalBytes>limits.selectionBytes){show('',0,totalBytes,messages.selectionTooLarge,true);return}const base=new FormData(form);base.delete('file');submit.disabled=true;input.disabled=true;form.dataset.uploading='true';try{const duplicates=endpoint?await uploadResumable(files,endpoint,base,totalBytes):await uploadLegacy(files,totalBytes);show(messages.complete,totalBytes,totalBytes,duplicates?messages.duplicate:'');window.setTimeout(()=>window.location.reload(),700)}catch(error){show('',0,totalBytes,error instanceof Error&&error.message?error.message:messages.failed,true);submit.disabled=false;input.disabled=false;delete form.dataset.uploading}})})})()<\/script>`;
}
