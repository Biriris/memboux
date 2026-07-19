import type { Locale } from "../i18n";
import { esc } from "../utils";
import { brickwallScript, mediaUploaderOverlay } from "./media";
import { multiUploadScript } from "./upload";
import { privacySupportWidgets } from "./privacy-support";

export type PageOptions = {
  locale?: Locale;
  settingsBack?: boolean;
  description?: string;
  canonical?: string;
  alternates?: Partial<Record<Locale | "x-default", string>>;
  index?: boolean;
  image?: string;
  structuredData?: Record<string, unknown>;
  additionalHead?: string;
};

const eventCreationBehavior = `<script>(()=>{const form=document.querySelector('form[action="/api/account/events"]');if(!form)return;form.addEventListener('submit',async event=>{event.preventDefault();if(form.dataset.submitting==='1')return;const button=form.querySelector('button[type="submit"],button:not([type])');let message=form.querySelector('[data-create-event-error]');if(!message){message=document.createElement('p');message.dataset.createEventError='1';message.className='hidden rounded-xl bg-red-50 p-3 text-sm text-red-700 md:col-span-2';button?.before(message)}form.dataset.submitting='1';if(button){button.disabled=true;button.classList.add('opacity-70')}let succeeded=false;try{const response=await fetch(form.action,{method:'POST',credentials:'include',headers:{Accept:'application/json'},body:new FormData(form)});const raw=await response.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{data={message:raw}}if(!response.ok){message.textContent=data.message||'Could not create the event. Please try again.';message.classList.remove('hidden');return}succeeded=true;location.assign(data.redirect||'/en/account')}catch{message.textContent='Could not create the event. Check your connection and try again.';message.classList.remove('hidden')}finally{if(!succeeded){form.dataset.submitting='0';if(button){button.disabled=false;button.classList.remove('opacity-70')}}}})})()<\/script>`;

const albumInvitationBehavior = `<script>(()=>{const form=document.querySelector('form[action$="/invite"]');if(!form||form.dataset.invitationReady)return;form.dataset.invitationReady='1';form.addEventListener('submit',async event=>{event.preventDefault();if(form.dataset.submitting==='1')return;const formData=new FormData(form),button=form.querySelector('button[type="submit"],button:not([type])'),locale=String(formData.get('locale')||'en'),email=String(formData.get('email')||''),role=String(formData.get('role')||'viewer');let result=form.nextElementSibling;if(!result||!result.matches('[data-invitation-result]')){result=document.createElement('div');result.dataset.invitationResult='1';result.className='mt-4 hidden overflow-hidden rounded-2xl border';form.after(result)}form.dataset.submitting='1';if(button){button.disabled=true;button.classList.add('opacity-70')}try{const response=await fetch(form.action,{method:'POST',credentials:'include',headers:{Accept:'application/json'},body:formData});const raw=await response.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{data={message:raw}}result.replaceChildren();result.classList.remove('hidden','border-red-200','bg-red-50','text-red-700','border-[#c8ddd5]','bg-white');if(!response.ok){result.classList.add('border-red-200','bg-red-50','p-4','text-red-700');result.textContent=data.message||raw||(locale==='el'?'Η πρόσκληση απέτυχε.':'Could not create the invitation.');return}result.classList.remove('p-4');result.classList.add('border-[#c8ddd5]','bg-white');const header=document.createElement('div');header.className='bg-[#183c33] px-5 py-4 text-white';const eyebrow=document.createElement('p');eyebrow.className='text-[10px] font-bold uppercase tracking-[.18em] text-[#a9c9bc]';eyebrow.textContent=locale==='el'?'Η πρόσκληση είναι έτοιμη':'Invitation ready';const heading=document.createElement('h4');heading.className='mt-1 text-xl font-semibold';heading.textContent=locale==='el'?'Σκάναρε για άμεση πρόσβαση':'Scan for instant access';header.append(eyebrow,heading);const content=document.createElement('div');content.className='p-5';const qr=document.createElement('div');qr.dataset.invitationQr='1';qr.className='mx-auto w-full max-w-[220px] rounded-2xl border border-[#dfe8e4] bg-white p-3 shadow-sm';if(data.invitationQrSvg)qr.innerHTML=data.invitationQrSvg;const help=document.createElement('p');help.className='mt-4 text-center text-sm leading-6 text-[#586c65]';help.textContent=locale==='el'?'Ο παραλήπτης σκανάρει το QR, συνδέεται και αποδέχεται την πρόσκληση.':'The recipient scans the QR, signs in, and accepts the invitation.';const meta=document.createElement('p');meta.className='mt-2 break-all text-center text-xs text-[#7b8a85]';meta.textContent=email+' · '+(role==='editor'?(locale==='el'?'Manager':'Manager'):(locale==='el'?'Viewer':'Viewer'))+' · '+(locale==='el'?'λήξη σε 14 ημέρες':'expires in 14 days');const row=document.createElement('div');row.className='mt-4 flex flex-col gap-2';const input=document.createElement('input');input.readOnly=true;input.value=data.invitationUrl;input.className='min-w-0 w-full rounded-xl border border-[#d6e0dc] bg-[#f8faf9] px-3 py-2 text-xs text-[#344941]';const actions=document.createElement('div');actions.className='grid grid-cols-2 gap-2 sm:grid-cols-3';const copy=document.createElement('button');copy.type='button';copy.className='rounded-xl bg-[#183c33] px-3 py-2.5 text-sm font-semibold text-white';copy.textContent=locale==='el'?'Αντιγραφή':'Copy';copy.onclick=async()=>{await navigator.clipboard.writeText(input.value);copy.textContent=locale==='el'?'Αντιγράφηκε':'Copied'};const share=document.createElement('button');share.type='button';share.className='rounded-xl bg-[#2f6b5b] px-3 py-2.5 text-sm font-semibold text-white';share.textContent=locale==='el'?'Κοινοποίηση':'Share';share.onclick=async()=>{const payload={title:locale==='el'?'Πρόσκληση Memboux':'Memboux invitation',text:locale==='el'?'Άνοιξε την προσωπική σου πρόσκληση στο Memboux.':'Open your personal invitation on Memboux.',url:input.value};if(navigator.share){try{await navigator.share(payload);return}catch(error){if(error?.name==='AbortError')return}}await navigator.clipboard.writeText(input.value);share.textContent=locale==='el'?'Link αντιγράφηκε':'Link copied'};const open=document.createElement('a');open.href=input.value;open.target='_blank';open.rel='noopener';open.className='col-span-2 rounded-xl border border-[#d6e0dc] px-3 py-2.5 text-center text-sm font-semibold text-[#2b443c] sm:col-span-1';open.textContent=locale==='el'?'Άνοιγμα':'Open';actions.append(copy,share,open);row.append(input,actions);content.append(qr,help,meta,row);result.append(header,content);form.reset()}catch{result.classList.remove('hidden');result.classList.add('border-red-200','bg-red-50','p-4','text-red-700');result.textContent=locale==='el'?'Έλεγξε τη σύνδεσή σου και δοκίμασε ξανά.':'Check your connection and try again.'}finally{form.dataset.submitting='0';if(button){button.disabled=false;button.classList.remove('opacity-70')}}})})()<\/script>`;

const outsideDismissBehavior = `<script>(()=>{if(window.__membouxOutsideDismiss)return;window.__membouxOutsideDismiss=true;const dismissibleDetails=()=>document.querySelectorAll('details[open]:not([class~="group/dashboard-section"])');document.addEventListener('pointerdown',event=>{const target=event.target;if(!(target instanceof Node))return;dismissibleDetails().forEach(details=>{if(!details.contains(target))details.removeAttribute('open')});document.querySelectorAll('[data-outside-dismiss][data-open="true"]').forEach(element=>{if(!element.contains(target)){element.dataset.open='false';element.dispatchEvent(new CustomEvent('memboux:dismiss'))}})});document.addEventListener('click',event=>{const target=event.target;if(target instanceof HTMLDialogElement&&target.open)target.close()});document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;dismissibleDetails().forEach(details=>details.removeAttribute('open'))})})()<\/script>`;

export function page(title: string, body: string, options: PageOptions = {}) {
  const locale = options.locale ?? (body.includes('name="locale" value="el"') ? "el" : "en");
  const openGraphLocales: Record<Locale, string> = { en: "en_US", el: "el_GR", fr: "fr_FR", de: "de_DE", es: "es_ES", it: "it_IT" };
  const description = options.description ?? "Memboux – Collecting Moments";
  const robots = options.index ? "index,follow,max-image-preview:large" : "noindex,nofollow,noarchive";
  const canonical = options.canonical ? `<link rel="canonical" href="${esc(options.canonical)}">` : "";
  const alternates = Object.entries(options.alternates ?? {})
    .map(([language, url]) => `<link rel="alternate" hreflang="${language}" href="${esc(url)}">`)
    .join("");
  const social = options.canonical
    ? `<meta property="og:type" content="website"><meta property="og:site_name" content="Memboux"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(options.canonical)}"><meta property="og:locale" content="${openGraphLocales[locale]}"><meta property="og:image" content="${esc(options.image ?? "https://memboux.com/brand/memboux-icon.png")}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(options.image ?? "https://memboux.com/brand/memboux-icon.png")}">`
    : "";
  const structuredData = options.structuredData
    ? `<script type="application/ld+json">${JSON.stringify(options.structuredData).replace(/</g, "\\u003c")}</script>`
    : "";
  const keywords = "event gallery, private gallery, photo sharing, event photos, event memories, memboux";
  const creationBehavior = body.includes('action="/api/account/events"') ? eventCreationBehavior : "";
  const invitationBehavior = body.includes('action="/api/account/events/') && body.includes('/invite"') ? albumInvitationBehavior : "";
  const uploadBehavior = body.includes('enctype="multipart/form-data"') ? multiUploadScript(locale) : "";
  const brickwallBehavior = body.includes("memboux-media-card") ? brickwallScript() : "";
  const uploaderBehavior = body.includes("lightbox-item") ? mediaUploaderOverlay(locale) : "";
  const privacySupport = body.includes("admin-ui") || body.includes('id="slideshow"') ? "" : privacySupportWidgets(locale);
  const baseRenderedBody = body.includes('id="slideshow"')
    ? body
      .replace('<span id="slide-counter">0 / 0</span><span>', '<span id="slide-counter">0 / 0</span><span id="slide-uploader" class="max-w-[50vw] truncate font-semibold text-white/85"></span><span>')
      .replace("counter=document.getElementById('slide-counter'),empty=", "counter=document.getElementById('slide-counter'),uploader=document.getElementById('slide-uploader'),empty=")
      .replace("counter.textContent='0 / 0';return", "counter.textContent='0 / 0';uploader.textContent='';return")
      .replace("counter.textContent=(index+1)+' / '+items.length;clearTimeout(timer);", `counter.textContent=(index+1)+' / '+items.length;uploader.textContent=item.uploaded_by?${JSON.stringify(locale === "el" ? "Ανέβηκε από" : "Uploaded by")}+' '+item.uploaded_by:'';clearTimeout(timer);`)
    : body;
  const settingsSubsection = options.settingsBack || [
    'id="professional-enabled"',
    'id="revoke-sessions"',
    'id="delete-account"',
    "Account capacity",
    '/api/cloud/google/connect',
    'id="owner-trash-select"',
  ].some((marker) => baseRenderedBody.includes(marker));
  const renderedBody = settingsSubsection
    ? baseRenderedBody
      .replace(/<a href="\/(?:el|en|fr|de|es|it)\/account" class="text-sm text-\[#2f6b5b\]">← [^<]+<\/a>/, "")
      .replace(/(<main\b[^>]*>)/, `$1${settingsBackLink(locale)}`)
    : baseRenderedBody;
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#183c33"><meta name="application-name" content="Memboux"><meta name="apple-mobile-web-app-title" content="Memboux"><meta name="keywords" content="${keywords}"><meta name="description" content="${esc(description)}"><meta name="robots" content="${robots}">${canonical}${alternates}${social}${structuredData}<link rel="icon" type="image/png" href="/brand/memboux-icon.png"><link rel="apple-touch-icon" href="/brand/memboux-icon.png"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&display=swap" rel="stylesheet">${options.additionalHead ?? ""}<title>${esc(title)}</title><link rel="stylesheet" href="/app-midnight.css?v=20260718-1"></head><body class="memboux-ui min-h-screen bg-[#f6f9f7] text-[#183c33]">${renderedBody}${creationBehavior}${invitationBehavior}${uploadBehavior}${brickwallBehavior}${uploaderBehavior}${privacySupport}${outsideDismissBehavior}</body></html>`;
}

export function brandMark(href: string, compact = false, light = false) {
  return `<a href="${href}" class="brand-mark inline-flex shrink-0 items-center gap-2 sm:gap-3 ${light ? "text-white" : "text-[#26493e]"}" aria-label="Memboux"><img src="/brand/memboux-icon.png" alt="" width="48" height="48" class="${compact ? "h-9 w-9" : "h-11 w-11"} shrink-0 object-contain ${light ? "brightness-0 invert" : ""}"><span class="leading-none"><strong class="block font-serif ${compact ? "text-lg sm:text-xl" : "text-2xl"} tracking-wide">Memboux</strong><span class="mt-1 hidden text-[9px] font-semibold uppercase tracking-[.22em] opacity-70 sm:block">Collecting Moments</span></span></a>`;
}

export function settingsBackLink(locale: Locale) {
  const labels: Record<Locale, string> = {
    en: "Back to settings",
    el: "Πίσω στις ρυθμίσεις",
    fr: "Retour aux paramètres",
    de: "Zurück zu den Einstellungen",
    es: "Volver a ajustes",
    it: "Torna alle impostazioni",
  };
  const label = labels[locale];
  return `<a data-settings-back href="/${locale}/settings" aria-label="${esc(label)}" class="mb-6 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-[#d6e0dc] bg-white px-4 py-2 text-sm font-semibold text-[#2b6253] shadow-sm transition hover:-translate-x-0.5 hover:border-[#a9c9bc] hover:bg-[#f6faf8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75a895]"><svg aria-hidden="true" viewBox="0 0 24 24" class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/><path d="M9 12h10"/></svg><span>${esc(label)}</span></a>`;
}

const accountMenuBehavior = `<script>(()=>{const updateNotifications=count=>{const value=Math.max(0,Number(count)||0),label=value>99?'99+':String(value);document.querySelectorAll('[data-account-notification-badge]').forEach(badge=>badge.classList.toggle('hidden',value===0));document.querySelectorAll('[data-account-notification-count]').forEach(badge=>{badge.textContent=label;badge.classList.toggle('hidden',value===0);badge.classList.toggle('flex',value>0)});document.querySelectorAll('[data-account-notification-chevron]').forEach(icon=>icon.classList.toggle('hidden',value>0))};window.__membouxUpdateNotifications=updateNotifications;document.querySelectorAll('[data-account-menu]').forEach(menu=>{if(menu.dataset.ready)return;menu.dataset.ready='1';const trigger=menu.querySelector('[data-account-menu-trigger]'),links=menu.querySelectorAll('[data-account-menu-link]');let timer;const desktop=()=>matchMedia('(hover:hover) and (pointer:fine)').matches,clear=()=>clearTimeout(timer),sync=()=>trigger?.setAttribute('aria-expanded',String(menu.open)),open=()=>{clear();menu.open=true;sync()},close=(delay=0)=>{clear();timer=setTimeout(()=>{if(!menu.matches(':focus-within')){menu.open=false;sync()}},delay)};menu.addEventListener('toggle',sync);menu.addEventListener('mouseenter',()=>{if(desktop())open()});menu.addEventListener('mouseleave',()=>{if(desktop())close(500)});menu.addEventListener('focusin',open);menu.addEventListener('focusout',()=>close(120));trigger?.addEventListener('click',event=>{if(desktop()&&event.detail>0){event.preventDefault();open()}});menu.addEventListener('keydown',event=>{if(event.key==='Escape'){trigger?.focus();menu.open=false;sync()}});links.forEach(link=>{const url=new URL(link.href,location.href),current=location.pathname.replace(/\/$/,'')||'/',sameHash=url.hash?url.hash===location.hash:!location.hash;if((url.pathname.replace(/\/$/,'')||'/')===current&&sameHash){link.setAttribute('aria-current','page');link.classList.add('bg-[#e8f3ee]','text-[#214c40]')}link.addEventListener('click',()=>{menu.open=false;sync()})});sync()});if(!window.__membouxAccountMenuOutside){window.__membouxAccountMenuOutside=true;document.addEventListener('pointerdown',event=>{document.querySelectorAll('[data-account-menu][open],[data-notification-menu][open]').forEach(menu=>{if(!menu.contains(event.target))menu.open=false})})}if(!window.__membouxNotificationRefresh){window.__membouxNotificationRefresh=true;const refresh=()=>fetch('/api/account/notifications/count',{credentials:'include'}).then(response=>response.ok?response.json():null).then(data=>{if(data)updateNotifications(data.count)}).catch(()=>{});refresh();setInterval(()=>{if(document.visibilityState==='visible')refresh()},30000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh()})}})()<\/script>`;

const notificationPanelBehavior = `<script>(()=>{document.querySelectorAll('[data-notification-menu]').forEach(menu=>{if(menu.dataset.ready)return;menu.dataset.ready='1';const trigger=menu.querySelector('[data-notification-trigger]'),list=menu.querySelector('[data-notification-list]'),readAll=menu.querySelector('[data-notification-read-all]'),locale=menu.dataset.locale||'en';let loading=false;const renderItem=item=>{const link=document.createElement('a');link.href=item.href;link.className='group flex items-start gap-3 border-b border-[#edf3f0] px-4 py-3.5 text-left transition last:border-b-0 hover:bg-[#f7faf8]';if(item.id)link.dataset.notificationId=item.id;const icon=document.createElement('span');icon.className='mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full '+(item.kind==='invitation_accepted'?'bg-emerald-50 text-emerald-700':'bg-[#e9f2ee] text-[#2b6253]');icon.textContent=item.kind==='invitation_accepted'?'✓':item.kind==='invitation'?'↗':'＋';const copy=document.createElement('span');copy.className='min-w-0 flex-1';const title=document.createElement('strong');title.className='block text-sm leading-5 text-[#183c33]';title.textContent=item.title;const detail=document.createElement('span');detail.className='mt-1 block truncate text-xs text-[#74847f]';detail.textContent=item.detail;copy.append(title,detail);link.append(icon,copy);if(item.unread){const dot=document.createElement('span');dot.className='mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500';link.append(dot)}link.addEventListener('click',()=>{if(item.id)fetch('/api/account/notifications/'+encodeURIComponent(item.id)+'/read',{method:'POST',credentials:'include',keepalive:true}).catch(()=>{})});return link};const load=async()=>{if(loading)return;loading=true;list.className='max-h-[min(26rem,calc(100dvh-10rem))] overflow-y-auto overscroll-contain';try{const response=await fetch('/api/account/notifications/preview?locale='+encodeURIComponent(locale),{credentials:'include',cache:'no-store'}),data=await response.json();if(!response.ok)throw new Error('load failed');window.__membouxUpdateNotifications?.(data.count);list.replaceChildren();if(!data.items?.length){const empty=document.createElement('p');empty.className='px-5 py-9 text-center text-sm text-[#74847f]';empty.textContent=data.labels?.empty||'You’re all caught up.';list.append(empty)}else data.items.forEach(item=>list.append(renderItem(item)))}catch{list.textContent=locale==='el'?'Δεν ήταν δυνατή η φόρτωση.':'Could not load notifications.';list.className='px-5 py-8 text-center text-sm text-red-700'}finally{loading=false}};readAll?.addEventListener('click',async()=>{if(readAll.disabled)return;readAll.disabled=true;try{const response=await fetch('/api/account/notifications/read',{method:'POST',credentials:'include',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({locale})}),data=await response.json();if(response.ok){window.__membouxUpdateNotifications?.(data.count);await load()}}finally{readAll.disabled=false}});menu.addEventListener('toggle',()=>{trigger?.setAttribute('aria-expanded',String(menu.open));if(menu.open)load()});menu.addEventListener('keydown',event=>{if(event.key==='Escape'){menu.open=false;trigger?.focus()}});trigger?.setAttribute('aria-expanded','false')})})()<\/script>`;

type AccountMenuIcon = "events" | "invitations" | "studio" | "settings" | "security" | "plan" | "privacy" | "backups" | "trash" | "signout" | "chevron";

function accountMenuIcon(icon: AccountMenuIcon, className = "h-5 w-5") {
  const paths: Record<AccountMenuIcon, string> = {
    events: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 2v4M16 2v4M3 9h18M8 13h2M14 13h2M8 17h2"/>',
    invitations: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
    studio: '<circle cx="12" cy="12" r="3.25"/><path d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12"/>',
    settings: '<path d="M4 6h8M16 6h4M4 12h3M11 12h9M4 18h10M18 18h2"/><circle cx="14" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
    security: '<path d="M12 3 5 6v5c0 4.7 2.8 8.1 7 10 4.2-1.9 7-5.3 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
    plan: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h3"/>',
    privacy: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
    backups: '<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.3 8.1 5 5 0 0 0 7 18Z"/><path d="m9 13 3-3 3 3M12 10v7"/>',
    trash: '<path d="M4 7h16M9 3h6l1 4H8l1-4ZM7 7l1 14h8l1-14M10 11v6M14 11v6"/>',
    signout: '<path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4M14 8l4 4-4 4M9 12h9"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24" class="${className}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[icon]}</svg>`;
}

function renderAccountMenu(
  locale: Locale,
  user: { name: string; email: string },
  darkTrigger: boolean,
  _notificationCount = 0,
) {
  const el = locale === "el";
  const labels = el
    ? { menu: "Μενού λογαριασμού", events: "Τα events μου", studio: "Memboux Studio", settings: "Ρυθμίσεις", signOut: "Αποσύνδεση" }
    : { menu: "Account menu", events: "My events", studio: "Memboux Studio", settings: "Settings", signOut: "Sign out" };
  const initial = esc((user.name.trim().slice(0, 1) || "M").toUpperCase());
  const triggerClass = darkTrigger
    ? "border-white/15 bg-white/5 text-white hover:bg-white/10 focus-visible:ring-white/40"
    : "border-[#d6e0dc] bg-white/70 text-[#183c33] hover:bg-white focus-visible:ring-[#3f7d6c]/35";
  const item = (href: string, icon: AccountMenuIcon, label: string) => `<a data-account-menu-link href="${href}" class="group flex min-h-12 items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium text-[#2b443c] outline-none transition hover:bg-[#f1f6f3] focus-visible:bg-[#e8f3ee] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#75a895]"><span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#e4ebe8] bg-white text-[#586c65] shadow-sm transition group-hover:border-[#cfdbd6] group-hover:text-[#214c40]">${accountMenuIcon(icon)}</span><span class="min-w-0 flex-1 truncate">${esc(label)}</span>${accountMenuIcon("chevron", "h-4 w-4 text-[#a1ada8] transition group-hover:translate-x-0.5")}</a>`;

  return `<details data-account-menu class="account-menu group/account relative z-50 shrink-0">
    <summary data-account-menu-trigger aria-label="${labels.menu}" aria-expanded="false" class="relative flex h-11 w-11 touch-manipulation cursor-pointer list-none select-none items-center justify-center gap-2 rounded-xl border p-0 outline-none transition focus-visible:ring-2 sm:h-auto sm:w-auto sm:justify-start sm:px-2.5 sm:py-1.5 ${triggerClass}">
      <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${darkTrigger ? "bg-white/15" : "bg-[#e4f0eb] text-[#214c40]"} text-sm font-semibold">${initial}</span>
      <span class="hidden max-w-32 truncate text-sm font-medium md:block">${esc(user.name)}</span>
      <svg aria-hidden="true" viewBox="0 0 20 20" class="hidden h-4 w-4 opacity-65 transition group-open/account:rotate-180 sm:block" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 8 4 4 4-4" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </summary>
    <div data-account-menu-panel class="fixed inset-x-3 top-[4.75rem] z-[100] rounded-3xl border border-[#dfe8e4] bg-white p-1.5 text-[#183c33] shadow-[0_24px_70px_rgba(18,43,36,.24)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[19rem]">
      <div class="flex min-w-0 items-center gap-3 rounded-[1.15rem] bg-[#f4f8f6] p-3">
          <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#304c43] font-semibold text-white shadow-sm">${initial}</span>
          <span class="min-w-0 flex-1"><strong class="block truncate text-sm font-semibold text-[#183c33]">${esc(user.name)}</strong><span class="block truncate text-xs text-[#6f837b]">${esc(user.email)}</span></span>
      </div>
      <nav aria-label="${labels.menu}" class="space-y-0.5 px-2 py-2.5">
        ${item(`/${locale}/account`, "events", labels.events)}
        ${item(`/studio?lang=${locale}`, "studio", labels.studio)}
        ${item(`/${locale}/settings`, "settings", labels.settings)}
      </nav>
      <div class="border-t border-[#e7edea] p-2">
        <button type="button" data-logout class="group flex min-h-11 w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-medium text-[#4b645b] outline-none transition hover:bg-[#f1f6f3] hover:text-[#183c33] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#75a895]"><span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#e4ebe8] bg-white text-[#697b74] shadow-sm">${accountMenuIcon("signout")}</span><span class="flex-1">${esc(labels.signOut)}</span>${accountMenuIcon("chevron", "h-4 w-4 text-[#a1ada8]")}</button>
      </div>
    </div>
  </details>${accountMenuBehavior}`;
}

export function accountMenu(locale: Locale, user: { name: string; email: string }, notificationCount = 0) {
  return renderAccountMenu(locale, user, false, notificationCount);
}

export function eventHeader(
  locale: Locale,
  user: { name: string; email: string },
  primaryAction = "",
  notificationCount = 0,
  secondaryAction = "",
) {
  return `<header class="app-shell-header relative z-40 border-b border-white/10 bg-[#183c33]/95 text-white backdrop-blur-xl"><div class="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:gap-3 sm:px-6 sm:py-4">${brandMark(`/${locale}/account`, true, true)}<div class="flex shrink-0 items-center gap-2">${secondaryAction}<span class="header-primary-action">${primaryAction}</span>${notificationBell(locale, notificationCount, true)}${accountMenuDark(locale, user, notificationCount)}</div></div></header>`;
}

export function accountHeader(locale: Locale, user: { name: string; email: string }, notificationCount = 0) {
  return `<header class="app-shell-header relative z-40 border-b border-white/10 bg-[#183c33]/95 text-white backdrop-blur-xl"><div class="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4">${brandMark(`/${locale}/account`, true, true)}<div class="flex shrink-0 items-center gap-2">${notificationBell(locale, notificationCount, true)}${accountMenuDark(locale, user, notificationCount)}</div></div></header>`;
}

function notificationBell(locale: Locale, notificationCount = 0, dark = false) {
  const label = locale === "el" ? "Ειδοποιήσεις" : "Notifications";
  const viewAll = locale === "el" ? "Προβολή όλων" : "View all";
  const readAll = locale === "el" ? "Όλα αναγνωσμένα" : "Mark all read";
  const loading = locale === "el" ? "Φόρτωση ειδοποιήσεων…" : "Loading notifications…";
  const countLabel = notificationCount > 99 ? "99+" : String(notificationCount);
  const colors = dark
    ? "border-white/15 bg-white/5 text-white hover:bg-white/10 focus-visible:ring-white/40"
    : "border-[#d6e0dc] bg-white/70 text-[#183c33] hover:bg-white focus-visible:ring-[#3f7d6c]/35";
  return `<details data-notification-menu data-locale="${locale}" class="group/notifications relative z-50 shrink-0"><summary data-notification-bell data-notification-trigger aria-label="${label}" title="${label}" class="relative flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-xl border outline-none transition focus-visible:ring-2 ${colors}"><svg aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg><span data-account-notification-count class="${notificationCount > 0 ? "flex" : "hidden"} absolute -right-1.5 -top-1.5 min-h-5 min-w-5 items-center justify-center rounded-full border-2 ${dark ? "border-[#183c33]" : "border-white"} bg-[#ef4444] px-1 text-[10px] font-bold leading-none text-white">${countLabel}</span></summary><section class="fixed inset-x-3 top-[4.75rem] z-[110] overflow-hidden rounded-3xl border border-[#dfe8e4] bg-white text-[#183c33] shadow-[0_24px_70px_rgba(18,43,36,.25)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[24rem]" aria-label="${label}"><header class="border-b border-[#e7edea] px-5 py-4"><div class="flex items-center justify-between gap-3"><div><p class="text-[10px] font-bold uppercase tracking-[.18em] text-[#7b8a85]">Memboux</p><h2 class="mt-0.5 text-lg font-semibold">${label}</h2></div><a href="/${locale}/notifications?view=history" class="rounded-full bg-[#f0f5f2] px-3 py-1.5 text-xs font-bold text-[#485e56] hover:bg-[#e8efec]">${viewAll}</a></div><button type="button" data-notification-read-all class="mt-3 text-xs font-semibold text-[#2b6253] hover:text-[#214c40] disabled:opacity-50">${readAll}</button></header><div data-notification-list class="max-h-[min(26rem,calc(100dvh-10rem))] overflow-y-auto overscroll-contain"><p class="px-5 py-8 text-center text-sm text-[#74847f]">${loading}</p></div></section></details>${notificationPanelBehavior}`;
}

export function accountMenuDark(locale: Locale, user: { name: string; email: string }, notificationCount = 0) {
  return renderAccountMenu(locale, user, true, notificationCount);
}

export const logoutScript = (locale: Locale) => `<script>document.querySelectorAll('[data-logout]').forEach(button=>button.onclick=async()=>{button.disabled=true;const response=await fetch('/api/auth/sign-out',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:'{}'});if(response.ok)location.replace('/${locale}');else button.disabled=false})<\/script>`;

export function googleIcon() {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5 shrink-0"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.32 2.98-7.41Z"/><path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.64-2.42l-3.24-2.53c-.9.6-2.05.96-3.4.96-2.61 0-4.82-1.77-5.61-4.14H3.04v2.62A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.87A6 6 0 0 1 6.08 12c0-.65.11-1.28.31-1.87V7.51H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.49l3.35-2.62Z"/><path fill="#EA4335" d="M12 5.99c1.47 0 2.79.5 3.83 1.5l2.88-2.88A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.96 5.51l3.35 2.62C7.18 7.76 9.39 5.99 12 5.99Z"/></svg>`;
}
