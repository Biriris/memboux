import type { MediaRow } from "../domain";
import type { Locale } from "../i18n";
import { esc } from "../utils";

export type MediaCardRow = MediaRow & {
  like_count?: number;
  viewer_liked?: number;
};

type MediaCardOptions = {
  code?: string;
  locale?: Locale;
  selectable?: boolean;
  deferredSelection?: boolean;
  manage?: boolean;
  lightbox?: boolean;
  reportCode?: string;
  likes?: boolean;
  likesReadonly?: boolean;
  showUploader?: boolean;
  coverControl?: {
    eventCode: string;
    locale: Locale;
    activeMediaId?: string | null;
  };
};

type SelectionAction = {
  buttonId: string;
  label: string;
  kind: "download" | "submit";
  formId?: string;
  inputId?: string;
  confirmMessage?: string;
  requireSingle?: boolean;
  mediaType?: "image" | "video";
};

type BulkSelectionScriptOptions = {
  selectButtonId: string;
  cardSelector: string;
  selectorSelector: string;
  checkboxSelector: string;
  tickSelector: string;
  selectText: string;
  cancelText: string;
  actions: SelectionAction[];
};

export function mediaLikeButton(media: MediaCardRow, locale: Locale = "en", extraClass = "") {
  if (media.media_type !== "image") return "";
  const liked = Boolean(media.viewer_liked);
  const count = Math.max(0, Number(media.like_count ?? 0));
  const label = liked
    ? (locale === "el" ? "Αφαίρεση καρδιάς" : "Unlike photo")
    : (locale === "el" ? "Βάλε καρδιά" : "Like photo");
  return `<button type="button" data-media-like data-media-id="${esc(media.id)}" aria-pressed="${liked}" aria-label="${label}" class="group/like inline-flex min-h-10 items-center gap-1.5 rounded-full border border-white/70 bg-white/90 px-3 py-2 text-xs font-bold text-[#183c33] shadow-lg backdrop-blur transition hover:scale-105 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${extraClass}"><svg data-like-heart aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5 transition ${liked ? "fill-rose-500 text-rose-500" : "fill-transparent text-[#183c33]"}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"/></svg><span data-like-count>${count}</span></button>`;
}

export function mediaLikeBadge(media: MediaCardRow, locale: Locale = "en", extraClass = "") {
  if (media.media_type !== "image") return "";
  const count = Math.max(0, Number(media.like_count ?? 0));
  const label = locale === "el" ? `${count} καρδιές` : `${count} ${count === 1 ? "like" : "likes"}`;
  return `<span aria-label="${label}" title="${label}" class="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-white/70 bg-white/90 px-3 py-2 text-xs font-bold text-[#183c33] shadow-lg backdrop-blur ${extraClass}"><svg aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5 fill-rose-500 text-rose-500" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"/></svg><span>${count}</span></span>`;
}

export function cards(items: MediaCardRow[], options?: MediaCardOptions) {
  return items.map((m, index) => {
    const originalSrc = `/media/${encodeURIComponent(m.id)}`;
    const thumbSrc = `${originalSrc}?variant=thumb`;
    const previewSrc = `${originalSrc}?variant=preview`;
    const media = m.media_type === "image" ? `<img src="${thumbSrc}" alt="" loading="lazy" decoding="async" class="block h-auto w-full object-contain">` : `<video src="${originalSrc}" ${options?.lightbox ? "muted playsinline" : "controls playsinline"} preload="metadata" class="block h-auto w-full bg-black object-contain"></video>`;
    const likesEnabled = options?.likes ?? Boolean(options?.lightbox && m.like_count !== undefined);
    const likeData = ` data-media-id="${esc(m.id)}"${likesEnabled && m.media_type === "image" ? ` data-like-count="${Math.max(0, Number(m.like_count ?? 0))}" data-liked="${Boolean(m.viewer_liked)}"` : ""}`;
    const content = options?.lightbox ? `<button type="button" class="lightbox-item block w-full" data-src="${m.media_type === "image" ? previewSrc : originalSrc}" data-full="${originalSrc}" data-original="${originalSrc}?download=1" data-type="${m.media_type}" data-uploader="${esc(m.uploaded_by)}"${likeData}${options.reportCode ? ` data-report="/gallery/${encodeURIComponent(options.reportCode)}/removal/${encodeURIComponent(m.id)}"` : ""}>${media}</button>` : options?.manage && options.code ? `<a href="/dashboard/${encodeURIComponent(options.code)}/media/${encodeURIComponent(m.id)}?lang=${options.locale ?? "en"}" class="block w-full">${media}</a>` : `<a href="${originalSrc}" class="block w-full">${media}</a>`;
    const selector=options?.selectable?(options.deferredSelection?`<label class="media-selector absolute inset-0 z-20 hidden cursor-pointer bg-transparent transition"><input type="checkbox" class="media-select sr-only" value="${esc(m.id)}" data-download="/media/${encodeURIComponent(m.id)}?download=1"><span class="selection-tick absolute left-3 top-3 hidden h-8 w-8 items-center justify-center rounded-full bg-[#2f6b5b] text-lg text-white shadow-lg">✓</span></label>`:`<label class="absolute left-3 top-3 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/95 shadow"><input type="checkbox" class="media-select h-4 w-4" value="${esc(m.id)}" data-download="/media/${encodeURIComponent(m.id)}?download=1"></label>`):"";
    const like = options?.likesReadonly
      ? mediaLikeBadge(m, options?.locale, "absolute bottom-2 right-2 z-30")
      : likesEnabled ? mediaLikeButton(m, options?.locale, "absolute bottom-2 right-2 z-30") : "";
    const cover = options?.coverControl && m.media_type === "image"
      ? mediaCoverButton(m.id, options.coverControl)
      : "";
    const uploaderName = String(m.uploaded_by || "").trim();
    const uploader = (options?.showUploader ?? options?.lightbox) && uploaderName
      ? `<span class="pointer-events-none absolute bottom-2 left-2 z-30 max-w-[48%] truncate rounded-full border border-white/20 bg-black/60 px-2.5 py-1.5 text-[10px] font-semibold text-white shadow-lg backdrop-blur sm:max-w-[60%]" title="${esc(uploaderName)}">${esc(uploaderName)}</span>`
      : "";
    return `<article data-media-type="${m.media_type}" data-media-order="${index}" data-media-uploaded="${Number(m.uploaded_at) || 0}" data-media-captured="${Number(m.captured_at ?? m.uploaded_at) || 0}" data-media-rating="${Math.max(0, Number(m.like_count ?? 0))}" class="memboux-media-card selectable-media relative mb-3 overflow-hidden rounded-2xl bg-[#f1f6f3] shadow-sm transition sm:mb-4">${selector}${options?.reportCode ? `<a href="/gallery/${encodeURIComponent(options.reportCode)}/removal/${encodeURIComponent(m.id)}?lang=${options.locale??"en"}" class="absolute right-2 top-2 z-10 rounded-full bg-black/55 px-3 py-1 text-xs text-white">${options.locale==="el"?"Αναφορά":"Report"}</a>` : ""}${cover}${uploader}${like}${content}</article>`;
  }).join("");
}

function mediaCoverButton(mediaId: string, control: NonNullable<MediaCardOptions["coverControl"]>) {
  const labels: Record<Locale, { set: string; active: string }> = {
    en: { set: "Set as cover", active: "Album cover" },
    el: { set: "Ορισμός ως cover", active: "Εξώφυλλο album" },
    fr: { set: "Définir comme couverture", active: "Couverture de l’album" },
    de: { set: "Als Cover festlegen", active: "Album-Cover" },
    es: { set: "Establecer como portada", active: "Portada del álbum" },
    it: { set: "Imposta come copertina", active: "Copertina dell’album" },
  };
  const active = control.activeMediaId === mediaId;
  const label = active ? labels[control.locale].active : labels[control.locale].set;
  return `<form data-media-cover action="/api/account/events/${encodeURIComponent(control.eventCode)}/cover" method="post" class="absolute right-2 top-2 z-30"><input type="hidden" name="locale" value="${control.locale}"><input type="hidden" name="mediaId" value="${esc(mediaId)}"><button type="submit" aria-pressed="${active}" aria-label="${esc(label)}" title="${esc(label)}" class="inline-flex min-h-10 items-center gap-2 rounded-full border ${active ? "border-white/20 bg-[#183c33] text-white" : "border-white/70 bg-white/90 text-[#183c33]"} px-3 py-2 text-xs font-bold shadow-lg backdrop-blur transition hover:scale-105 hover:bg-[#183c33] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75a895]"><svg aria-hidden="true" viewBox="0 0 24 24" class="h-4 w-4 shrink-0 ${active ? "fill-white/20" : "fill-transparent"}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-6-4-6 4Z"/></svg><span class="hidden sm:inline">${esc(label)}</span></button></form>`;
}

export function mediaUploaderOverlay(locale: Locale) {
  const label = locale === "el" ? "Ανέβηκε από" : "Uploaded by";
  return `<script>(()=>{const dialog=document.getElementById('media-lightbox'),stage=document.getElementById('lightbox-stage');if(!dialog||!stage||document.getElementById('lightbox-uploader'))return;const badge=document.createElement('p');badge.id='lightbox-uploader';badge.className='pointer-events-none absolute left-4 top-4 z-40 hidden max-w-[70vw] truncate rounded-full border border-white/20 bg-black/60 px-3 py-2 text-xs font-semibold text-white shadow-xl backdrop-blur sm:left-6 sm:top-6';stage.append(badge);document.querySelectorAll('.lightbox-item').forEach(item=>item.addEventListener('click',()=>{const name=(item.dataset.uploader||'').trim();badge.textContent=name?${JSON.stringify(label)}+' '+name:'';badge.classList.toggle('hidden',!name)}));dialog.addEventListener('close',()=>badge.classList.add('hidden'))})()<\/script>`;
}

export function mediaLikesScript(code: string, locale: Locale) {
  const likeLabel = locale === "el" ? "Βάλε καρδιά" : "Like photo";
  const unlikeLabel = locale === "el" ? "Αφαίρεση καρδιάς" : "Unlike photo";
  return `<script>(()=>{if(window.__membouxMediaLikes)return;window.__membouxMediaLikes=true;const sync=(button,liked,count)=>{button.setAttribute('aria-pressed',String(liked));button.setAttribute('aria-label',liked?${JSON.stringify(unlikeLabel)}:${JSON.stringify(likeLabel)});button.dataset.liked=String(liked);const heart=button.querySelector('[data-like-heart]'),counter=button.querySelector('[data-like-count]');if(counter)counter.textContent=String(count);if(heart){heart.classList.toggle('fill-rose-500',liked);heart.classList.toggle('text-rose-500',liked);heart.classList.toggle('fill-transparent',!liked);heart.classList.toggle('text-[#183c33]',!liked)}};document.addEventListener('click',async event=>{const button=event.target.closest?.('[data-media-like]');if(!button||button.dataset.busy==='1')return;event.preventDefault();event.stopPropagation();const mediaId=button.dataset.mediaId;if(!mediaId)return;button.dataset.busy='1';button.disabled=true;try{const response=await fetch('/api/gallery/${encodeURIComponent(code)}/media/'+encodeURIComponent(mediaId)+'/like',{method:'POST',credentials:'include',headers:{Accept:'application/json'}});const data=await response.json().catch(()=>null);if(!response.ok||!data)throw new Error('Like failed');document.querySelectorAll('[data-media-like]').forEach(item=>{if(item.dataset.mediaId===mediaId)sync(item,Boolean(data.liked),Number(data.count)||0)});document.querySelectorAll('.lightbox-item').forEach(item=>{if(item.dataset.mediaId===mediaId){item.dataset.liked=String(Boolean(data.liked));item.dataset.likeCount=String(Number(data.count)||0)}})}catch{button.classList.add('ring-2','ring-red-300');setTimeout(()=>button.classList.remove('ring-2','ring-red-300'),900)}finally{button.dataset.busy='0';button.disabled=false}})})()<\/script>`;
}

export function galleryFilterControls(items: MediaRow[], prefix: string, locale: Locale) {
  const photoCount = items.filter((item) => item.media_type === "image").length;
  const labels: Record<Locale, { photo: string; photos: string; sort: string; chronology: string; latest: string; oldest: string; rating: string }> = {
    en: { photo: "photo", photos: "photos", sort: "Sort", chronology: "Event chronology", latest: "Newest uploads", oldest: "Oldest uploads", rating: "Most liked" },
    el: { photo: "φωτογραφία", photos: "φωτογραφίες", sort: "Ταξινόμηση", chronology: "Χρονολογική σειρά", latest: "Νεότερα uploads", oldest: "Παλαιότερα uploads", rating: "Περισσότερες καρδιές" },
    fr: { photo: "photo", photos: "photos", sort: "Trier", chronology: "Chronologie de l’événement", latest: "Ajouts récents", oldest: "Ajouts les plus anciens", rating: "Les plus aimées" },
    de: { photo: "Foto", photos: "Fotos", sort: "Sortieren", chronology: "Event-Chronologie", latest: "Neueste Uploads", oldest: "Älteste Uploads", rating: "Beliebteste" },
    es: { photo: "foto", photos: "fotos", sort: "Ordenar", chronology: "Cronología del evento", latest: "Subidas recientes", oldest: "Subidas antiguas", rating: "Más valoradas" },
    it: { photo: "foto", photos: "foto", sort: "Ordina", chronology: "Cronologia dell’evento", latest: "Upload recenti", oldest: "Upload meno recenti", rating: "Più apprezzate" },
  };
  const copy = labels[locale];
  const countLabel = `${photoCount} ${photoCount === 1 ? copy.photo : copy.photos}`;
  return `<div class="mt-3 flex flex-wrap items-center gap-3"><span data-gallery-photo-count="${photoCount}" class="inline-flex items-center gap-2 rounded-full bg-[#eef4f1] px-3 py-1.5 text-xs font-semibold text-[#586c65]"><svg aria-hidden="true" viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 15-5-5L5 19"/></svg>${esc(countLabel)}</span><label class="ml-auto inline-flex items-center gap-2 text-xs font-semibold text-[#6c7b76]">${copy.sort}<select data-gallery-sort="${prefix}" class="rounded-full border border-[#d6e0dc] bg-white px-3 py-1.5 text-xs font-semibold text-[#344941]"><option value="chronology">${copy.chronology}</option><option value="latest">${copy.latest}</option><option value="oldest">${copy.oldest}</option><option value="rating">${copy.rating}</option></select></label></div>`;
}

export function galleryFilterScript(_items: MediaRow[], prefix: string) {
  return `<script>(()=>{const sort=document.querySelector('[data-gallery-sort="${prefix}"]'),explicitGrid=document.querySelector('[data-gallery-grid="${prefix}"]'),grid=explicitGrid||sort?.closest('section')?.querySelector('[data-media-type]')?.parentElement;if(!grid)return;const cards=[...grid.querySelectorAll('[data-media-type]')];const value=(card,key)=>Number(card.dataset[key])||0;const sortCards=mode=>{cards.sort((a,b)=>mode==='rating'?(value(b,'mediaRating')-value(a,'mediaRating')||value(b,'mediaUploaded')-value(a,'mediaUploaded')):mode==='latest'?(value(b,'mediaUploaded')-value(a,'mediaUploaded')):mode==='oldest'?(value(a,'mediaUploaded')-value(b,'mediaUploaded')):(value(a,'mediaCaptured')-value(b,'mediaCaptured')||value(a,'mediaOrder')-value(b,'mediaOrder')));cards.forEach(card=>grid.append(card));window.__membouxBrickwallRelayout?.()};sort?.addEventListener('change',()=>sortCards(sort.value));sortCards('chronology')})()<\/script>`;
}

export function brickwallScript() {
  return `<script>(()=>{if(window.__membouxBrickwall)return;window.__membouxBrickwall=true;const grids=[...new Set([...document.querySelectorAll('.memboux-media-card')].map(card=>card.parentElement).filter(Boolean))],pending=new WeakMap();if(!grids.length)return;const layout=grid=>{pending.delete(grid);const width=grid.clientWidth;if(!width)return;grid.classList.add('memboux-brickwall');const gap=parseFloat(getComputedStyle(grid).columnGap)||12,columnWidth=(width-gap)/2,heights=[0,0],cards=[...grid.children].filter(card=>card.classList.contains('memboux-media-card')&&!card.classList.contains('hidden'));cards.forEach(card=>{card.style.width=columnWidth+'px'});cards.forEach(card=>{const column=heights[0]<=heights[1]?0:1,x=column*(columnWidth+gap),y=heights[column];card.style.transform='translate3d('+Math.round(x)+'px,'+Math.round(y)+'px,0)';heights[column]+=card.offsetHeight+gap});grid.style.height=Math.max(0,Math.max(...heights)-gap)+'px';grid.dataset.brickwallReady='true'};const schedule=grid=>{if(pending.has(grid))cancelAnimationFrame(pending.get(grid));pending.set(grid,requestAnimationFrame(()=>layout(grid)))};const resizeObserver=new ResizeObserver(entries=>entries.forEach(entry=>schedule(entry.target.classList.contains('memboux-brickwall')?entry.target:entry.target.parentElement)));grids.forEach(grid=>{grid.classList.add('memboux-brickwall');resizeObserver.observe(grid);[...grid.children].filter(card=>card.classList.contains('memboux-media-card')).forEach(card=>{resizeObserver.observe(card);card.querySelectorAll('img,video').forEach(media=>{if(media.dataset.brickwallWatch)return;media.dataset.brickwallWatch='true';media.addEventListener(media.tagName==='VIDEO'?'loadedmetadata':'load',()=>schedule(grid),{once:true});media.addEventListener('error',()=>schedule(grid),{once:true})})});new MutationObserver(records=>{if(records.some(record=>record.type==='childList'||record.target.classList?.contains('memboux-media-card')))schedule(grid)}).observe(grid,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});schedule(grid)});window.__membouxBrickwallRelayout=()=>grids.forEach(schedule)})()<\/script>`;
}

export function bulkSelectionScript(options: BulkSelectionScriptOptions) {
  const actions = options.actions
    .map(
      (action) =>
        `{buttonId:${JSON.stringify(action.buttonId)},label:${JSON.stringify(action.label)},kind:${JSON.stringify(action.kind)},formId:${action.formId ? JSON.stringify(action.formId) : "null"},inputId:${action.inputId ? JSON.stringify(action.inputId) : "null"},confirmMessage:${action.confirmMessage ? JSON.stringify(action.confirmMessage) : "null"},requireSingle:${Boolean(action.requireSingle)},mediaType:${action.mediaType ? JSON.stringify(action.mediaType) : "null"}}`,
    )
    .join(",");
  return `<script>(()=>{const selectButton=document.getElementById(${JSON.stringify(options.selectButtonId)});if(!selectButton)return;const selectors=[...document.querySelectorAll(${JSON.stringify(options.selectorSelector)})];const selected=()=>[...document.querySelectorAll(${JSON.stringify(options.checkboxSelector)}+':checked')];const cards=[...document.querySelectorAll(${JSON.stringify(options.cardSelector)})];const actions=[${actions}].map(action=>({...action,button:document.getElementById(action.buttonId)})).filter(action=>action.button);let mode=false;const eligible=(action,boxes)=>boxes.length>0&&(!action.requireSingle||boxes.length===1)&&(!action.mediaType||boxes.every(box=>box.closest('[data-media-type]')?.dataset.mediaType===action.mediaType));const extFromType=(type='')=>{const map={'image/jpeg':'jpg','image/jpg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','video/x-msvideo':'avi'};return map[type.toLowerCase()]||type.split('/')[1]?.split(';')[0]||'bin'};const refresh=()=>{cards.forEach(card=>{const checked=card.querySelector(${JSON.stringify(options.checkboxSelector)})?.checked;card.classList.toggle('ring-4',!!checked);card.classList.toggle('ring-[#356f5e]',!!checked);card.classList.toggle('brightness-75',!!checked);card.setAttribute('aria-selected',String(!!checked));const tick=card.querySelector(${JSON.stringify(options.tickSelector)});if(tick){tick.classList.toggle('hidden',!checked);tick.classList.toggle('flex',!!checked)}});const boxes=selected(),count=boxes.length;actions.forEach(action=>{const enabled=eligible(action,boxes);action.button.textContent=action.label+' ('+count+')';action.button.disabled=!enabled;action.button.classList.toggle('opacity-50',!enabled);action.button.classList.toggle('cursor-not-allowed',!enabled)})};const shareSelected=async(boxes)=>{const files=await Promise.all(boxes.map(async(box,index)=>{const url=box.dataset.download||box.value;const response=await fetch(url,{credentials:'include'});if(!response.ok)throw new Error('Download failed');const blob=await response.blob();const type=blob.type||response.headers.get('content-type')||'';return new File([blob],'memboux-'+(index+1)+'.'+extFromType(type),{type:type||blob.type||'application/octet-stream'})}));if(navigator.share&&(!navigator.canShare||navigator.canShare({files}))){try{await navigator.share({files,title:document.title,text:document.title});return true}catch(error){if(error?.name==='AbortError')return true}}return false};selectButton.addEventListener('click',()=>{mode=!mode;selectors.forEach(selector=>selector.classList.toggle('hidden',!mode));document.querySelectorAll('[data-media-like]').forEach(button=>button.classList.toggle('hidden',mode));actions.forEach(action=>action.button.classList.toggle('hidden',!mode));selectButton.textContent=mode?${JSON.stringify(options.cancelText)}:${JSON.stringify(options.selectText)};selectButton.setAttribute('aria-pressed',String(mode));if(!mode)document.querySelectorAll(${JSON.stringify(options.checkboxSelector)}).forEach(box=>box.checked=false);refresh()});document.querySelectorAll(${JSON.stringify(options.checkboxSelector)}).forEach(box=>box.addEventListener('change',refresh));actions.forEach(action=>action.button.addEventListener('click',async()=>{const boxes=selected();if(!eligible(action,boxes))return;if(action.kind==='download'){try{if(await shareSelected(boxes))return}catch(error){}boxes.forEach((box,i)=>setTimeout(()=>{const a=document.createElement('a');a.href=box.dataset.download||box.value;a.download='';a.rel='noopener';document.body.append(a);a.click();a.remove()},i*250));return}if(action.confirmMessage&&!confirm(action.confirmMessage))return;if(action.formId&&action.inputId){const input=document.getElementById(action.inputId),form=document.getElementById(action.formId);if(input&&form){input.value=boxes.map(box=>box.value).join(',');form.requestSubmit?form.requestSubmit():form.submit()}}}));refresh()})()<\/script>`;
}

export function lightboxMarkup(locale: Locale, likes = false) {
  const likeLabel = locale === "el" ? "Βάλε καρδιά" : "Like photo";
  const unlikeLabel = locale === "el" ? "Αφαίρεση καρδιάς" : "Unlike photo";
  const lightboxLike = likes ? `<button id="lightbox-like" type="button" data-media-like class="absolute bottom-5 left-1/2 z-30 hidden min-h-11 -translate-x-1/2 items-center gap-2 rounded-full border border-white/25 bg-black/55 px-4 py-2 text-sm font-bold text-white shadow-xl backdrop-blur"><svg data-like-heart aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5 fill-transparent text-white transition" stroke="currentColor" stroke-width="1.8"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"/></svg><span data-like-count>0</span></button>` : `<p id="lightbox-title" class="absolute bottom-4 left-1/2 max-w-[70vw] -translate-x-1/2 truncate rounded-full bg-black/45 px-5 py-2 text-sm text-white"></p>`;
  const doubleHeart = likes ? `<span id="lightbox-double-heart" aria-hidden="true" class="pointer-events-none absolute left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow-2xl"><svg viewBox="0 0 24 24" class="h-28 w-28 fill-rose-500 text-white" stroke="currentColor" stroke-width="1.2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"/></svg></span>` : "";
  return `<dialog id="media-lightbox" class="h-screen w-screen max-h-none max-w-none bg-transparent p-0 backdrop:bg-black/85"><div id="lightbox-stage" class="relative flex h-full w-full items-center justify-center p-4 sm:p-12"><button id="lightbox-prev" class="absolute left-3 z-20 hidden h-12 w-12 items-center justify-center rounded-full bg-white/15 text-3xl text-white sm:left-6 sm:flex">‹</button><div id="lightbox-content" class="flex max-h-full max-w-full flex-col items-center"></div><button id="lightbox-next" class="absolute right-3 z-20 hidden h-12 w-12 items-center justify-center rounded-full bg-white/15 text-3xl text-white sm:right-6 sm:flex">›</button>${lightboxLike}${doubleHeart}</div></dialog><script>(()=>{const items=[...document.querySelectorAll('.lightbox-item')],dialog=document.getElementById('media-lightbox'),content=document.getElementById('lightbox-content'),stage=document.getElementById('lightbox-stage'),title=document.getElementById('lightbox-title'),likeButton=document.getElementById('lightbox-like'),doubleHeart=document.getElementById('lightbox-double-heart');let index=0;const activeItems=()=>items.filter(item=>!item.closest('[data-media-type]')?.classList.contains('hidden'));const resetPosition=()=>{content.style.transition='none';content.style.transform='translateX(0) scale(1)';content.style.opacity='1'};const syncLike=item=>{if(!likeButton)return;const visible=item.dataset.type==='image'&&item.dataset.mediaId;if(!visible){likeButton.classList.add('hidden');likeButton.classList.remove('inline-flex');return}const liked=item.dataset.liked==='true',heart=likeButton.querySelector('[data-like-heart]'),counter=likeButton.querySelector('[data-like-count]');likeButton.dataset.mediaId=item.dataset.mediaId;likeButton.setAttribute('aria-pressed',String(liked));likeButton.setAttribute('aria-label',liked?${JSON.stringify(unlikeLabel)}:${JSON.stringify(likeLabel)});likeButton.classList.remove('hidden');likeButton.classList.add('inline-flex');if(counter)counter.textContent=item.dataset.likeCount||'0';if(heart){heart.classList.toggle('fill-rose-500',liked);heart.classList.toggle('text-rose-500',liked);heart.classList.toggle('fill-transparent',!liked);heart.classList.toggle('text-white',!liked)}};const show=i=>{const available=activeItems();if(!available.length)return;index=(i+available.length)%available.length;resetPosition();const item=available[index],src=item.dataset.src,full=item.dataset.full||src;content.innerHTML=item.dataset.type==='video'?'<video src="'+src+'" controls autoplay playsinline class="max-h-[80vh] max-w-[86vw] rounded-xl"></video>':'<img src="'+src+'" alt="" draggable="true" class="native-save-image max-h-[80vh] max-w-[86vw] touch-manipulation select-none rounded-xl object-contain">';const visibleImage=content.querySelector('.native-save-image');if(visibleImage&&full!==src){const original=new Image();original.onload=()=>{if(content.contains(visibleImage)&&activeItems()[index]===item){visibleImage.src=full;visibleImage.dataset.fullResolution='true'}};original.src=full}if(title)title.textContent=item.dataset.title||'';syncLike(item)};const showDoubleHeart=()=>{if(!doubleHeart)return;doubleHeart.classList.remove('lightbox-heart-pop');void doubleHeart.offsetWidth;doubleHeart.classList.add('lightbox-heart-pop')};items.forEach(item=>item.onclick=()=>{show(activeItems().indexOf(item));dialog.showModal()});document.getElementById('lightbox-prev').onclick=()=>show(index-1);document.getElementById('lightbox-next').onclick=()=>show(index+1);let touchX=0,touchY=0,dragX=0,dragging=false,tapStartedOnImage=false,lastTapAt=0,lastTapX=0,lastTapY=0;dialog.addEventListener('touchstart',e=>{if(!dialog.open||!e.touches.length)return;const touch=e.touches[0];touchX=touch.clientX;touchY=touch.clientY;dragX=0;dragging=false;tapStartedOnImage=Boolean(e.target.closest?.('.native-save-image'));content.style.transition='none'},{passive:true});dialog.addEventListener('touchmove',e=>{if(!dialog.open||!e.touches.length)return;const touch=e.touches[0],dx=touch.clientX-touchX,dy=touch.clientY-touchY;if(!dragging&&Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy))dragging=true;if(!dragging)return;e.preventDefault();dragX=dx;lastTapAt=0;const scale=1-Math.min(Math.abs(dx)/window.innerWidth,1)*.04;content.style.transform='translateX('+dx+'px) scale('+scale+')';content.style.opacity=String(1-Math.min(Math.abs(dx)/window.innerWidth,.35))},{passive:false});dialog.addEventListener('touchend',e=>{if(!dragging){resetPosition();const touch=e.changedTouches[0],now=Date.now(),isDouble=tapStartedOnImage&&touch&&now-lastTapAt<340&&Math.hypot(touch.clientX-lastTapX,touch.clientY-lastTapY)<36;if(isDouble){e.preventDefault();const item=activeItems()[index];if(item?.dataset.type==='image'&&likeButton){if(item.dataset.liked!=='true'&&likeButton.dataset.busy!=='1')likeButton.click();showDoubleHeart()}lastTapAt=0}else if(tapStartedOnImage&&touch){lastTapAt=now;lastTapX=touch.clientX;lastTapY=touch.clientY}else lastTapAt=0;tapStartedOnImage=false;return}content.style.transition='transform 180ms ease-out, opacity 180ms ease-out';if(Math.abs(dragX)>60){content.style.transform='translateX('+(dragX<0?'-110vw':'110vw')+') scale(.96)';content.style.opacity='0';setTimeout(()=>show(dragX<0?index+1:index-1),180)}else{content.style.transform='translateX(0) scale(1)';content.style.opacity='1'}dragging=false;tapStartedOnImage=false;lastTapAt=0},{passive:false});dialog.onclick=e=>{if(e.target===dialog||e.target===stage)dialog.close()};document.addEventListener('keydown',e=>{if(!dialog.open)return;if(e.key==='ArrowLeft')show(index-1);if(e.key==='ArrowRight')show(index+1);if(e.key==='Escape')dialog.close()})})()<\/script>`;
}
