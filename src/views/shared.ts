import type { Locale } from "../i18n";
import { esc } from "../utils";

export type PageOptions = {
  locale?: Locale;
  description?: string;
  canonical?: string;
  alternates?: Partial<Record<Locale | "x-default", string>>;
  index?: boolean;
  image?: string;
  structuredData?: Record<string, unknown>;
};

const eventCreationBehavior = `<script>(()=>{const form=document.querySelector('form[action="/api/account/events"]');if(!form)return;form.addEventListener('submit',async event=>{event.preventDefault();if(form.dataset.submitting==='1')return;const button=form.querySelector('button[type="submit"],button:not([type])');let message=form.querySelector('[data-create-event-error]');if(!message){message=document.createElement('p');message.dataset.createEventError='1';message.className='hidden rounded-xl bg-red-50 p-3 text-sm text-red-700 md:col-span-2';button?.before(message)}form.dataset.submitting='1';if(button){button.disabled=true;button.classList.add('opacity-70')}let succeeded=false;try{const response=await fetch(form.action,{method:'POST',credentials:'include',headers:{Accept:'application/json'},body:new FormData(form)});const raw=await response.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{data={message:raw}}if(!response.ok){message.textContent=data.message||'Could not create the event. Please try again.';message.classList.remove('hidden');return}succeeded=true;location.assign(data.redirect||'/en/account')}catch{message.textContent='Could not create the event. Check your connection and try again.';message.classList.remove('hidden')}finally{if(!succeeded){form.dataset.submitting='0';if(button){button.disabled=false;button.classList.remove('opacity-70')}}}})})()<\/script>`;

const albumInvitationBehavior = `<script>(()=>{const form=document.querySelector('form[action$="/invite"]');if(!form||form.dataset.invitationReady)return;form.dataset.invitationReady='1';form.addEventListener('submit',async event=>{event.preventDefault();if(form.dataset.submitting==='1')return;const button=form.querySelector('button[type="submit"],button:not([type])'),locale=String(new FormData(form).get('locale')||'en');let result=form.nextElementSibling;if(!result||!result.matches('[data-invitation-result]')){result=document.createElement('div');result.dataset.invitationResult='1';result.className='mt-4 hidden rounded-2xl border p-4';form.after(result)}form.dataset.submitting='1';if(button)button.disabled=true;try{const response=await fetch(form.action,{method:'POST',credentials:'include',headers:{Accept:'application/json'},body:new FormData(form)});const raw=await response.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{data={message:raw}}result.replaceChildren();result.classList.remove('hidden','border-red-200','bg-red-50','text-red-700');if(!response.ok){result.classList.add('border-red-200','bg-red-50','text-red-700');result.textContent=data.message||raw||(locale==='el'?'Η πρόσκληση απέτυχε.':'Could not create the invitation.');return}result.classList.add('border-[#c7d2fe]','bg-[#f8faff]');const message=document.createElement('p');message.className='text-sm font-medium';message.textContent=data.delivery==='notification'?(locale==='el'?'Η πρόσκληση εμφανίστηκε στις ειδοποιήσεις του χρήστη.':'The invitation is now in the user’s notifications.'):(locale==='el'?'Το email στάλθηκε. Μπορείς επίσης να αντιγράψεις το προσωπικό link.':'Email sent. You can also copy the personal link.');const row=document.createElement('div');row.className='mt-3 flex flex-col gap-2 sm:flex-row';const input=document.createElement('input');input.readOnly=true;input.value=data.invitationUrl;input.className='min-w-0 flex-1 rounded-xl border bg-white px-3 py-2 text-xs';const copy=document.createElement('button');copy.type='button';copy.className='rounded-xl bg-[#172033] px-4 py-2 text-sm text-white';copy.textContent=locale==='el'?'Αντιγραφή link':'Copy link';copy.onclick=async()=>{await navigator.clipboard.writeText(input.value);copy.textContent=locale==='el'?'Αντιγράφηκε':'Copied'};row.append(input,copy);result.append(message,row);form.reset()}catch{result.classList.remove('hidden');result.classList.add('border-red-200','bg-red-50','text-red-700');result.textContent=locale==='el'?'Έλεγξε τη σύνδεσή σου και δοκίμασε ξανά.':'Check your connection and try again.'}finally{form.dataset.submitting='0';if(button)button.disabled=false}})})()<\/script>`;

export function page(title: string, body: string, options: PageOptions = {}) {
  const locale = options.locale ?? "en";
  const description = options.description ?? "Memboux – Collecting Moments";
  const robots = options.index ? "index,follow,max-image-preview:large" : "noindex,nofollow,noarchive";
  const canonical = options.canonical ? `<link rel="canonical" href="${esc(options.canonical)}">` : "";
  const alternates = Object.entries(options.alternates ?? {})
    .map(([language, url]) => `<link rel="alternate" hreflang="${language}" href="${esc(url)}">`)
    .join("");
  const social = options.canonical
    ? `<meta property="og:type" content="website"><meta property="og:site_name" content="Memboux"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(options.canonical)}"><meta property="og:locale" content="${locale === "el" ? "el_GR" : "en_US"}"><meta property="og:image" content="${esc(options.image ?? "https://memboux.com/brand/memboux-icon.png")}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(options.image ?? "https://memboux.com/brand/memboux-icon.png")}">`
    : "";
  const structuredData = options.structuredData
    ? `<script type="application/ld+json">${JSON.stringify(options.structuredData).replace(/</g, "\\u003c")}</script>`
    : "";
  const keywords = "event gallery, private gallery, photo sharing, video sharing, event memories, memboux";
  const creationBehavior = body.includes('action="/api/account/events"') ? eventCreationBehavior : "";
  const invitationBehavior = body.includes('action="/api/account/events/') && body.includes('/invite"') ? albumInvitationBehavior : "";
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#172033"><meta name="application-name" content="Memboux"><meta name="apple-mobile-web-app-title" content="Memboux"><meta name="keywords" content="${keywords}"><meta name="description" content="${esc(description)}"><meta name="robots" content="${robots}">${canonical}${alternates}${social}${structuredData}<link rel="icon" type="image/png" href="/brand/memboux-icon.png"><link rel="apple-touch-icon" href="/brand/memboux-icon.png"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&display=swap" rel="stylesheet"><title>${esc(title)}</title><link rel="stylesheet" href="/app-midnight.css?v=20260713-2"></head><body class="memboux-ui min-h-screen bg-[#f6f7fb] text-[#172033]">${body}${creationBehavior}${invitationBehavior}</body></html>`;
}

export function brandMark(href: string, compact = false, light = false) {
  return `<a href="${href}" class="brand-mark inline-flex shrink-0 items-center gap-2 sm:gap-3 ${light ? "text-white" : "text-[#24304a]"}" aria-label="Memboux"><img src="/brand/memboux-icon.png" alt="" width="48" height="48" class="${compact ? "h-9 w-9" : "h-11 w-11"} shrink-0 object-contain ${light ? "brightness-0 invert" : ""}"><span class="leading-none"><strong class="block font-serif ${compact ? "text-lg sm:text-xl" : "text-2xl"} tracking-wide">Memboux</strong><span class="mt-1 hidden text-[9px] font-semibold uppercase tracking-[.22em] opacity-70 sm:block">Collecting Moments</span></span></a>`;
}

const accountMenuBehavior = `<script>(()=>{document.querySelectorAll('[data-account-menu]').forEach(menu=>{if(menu.dataset.ready)return;menu.dataset.ready='1';const trigger=menu.querySelector('[data-account-menu-trigger]'),links=menu.querySelectorAll('[data-account-menu-link]');let timer;const desktop=()=>matchMedia('(hover:hover) and (pointer:fine)').matches,clear=()=>clearTimeout(timer),sync=()=>trigger?.setAttribute('aria-expanded',String(menu.open)),open=()=>{clear();menu.open=true;sync()},close=(delay=0)=>{clear();timer=setTimeout(()=>{if(!menu.matches(':focus-within')){menu.open=false;sync()}},delay)};menu.addEventListener('toggle',sync);menu.addEventListener('mouseenter',()=>{if(desktop())open()});menu.addEventListener('mouseleave',()=>{if(desktop())close(500)});menu.addEventListener('focusin',open);menu.addEventListener('focusout',()=>close(120));trigger?.addEventListener('click',event=>{if(desktop()&&event.detail>0){event.preventDefault();open()}});menu.addEventListener('keydown',event=>{if(event.key==='Escape'){trigger?.focus();menu.open=false;sync()}});links.forEach(link=>{const url=new URL(link.href,location.href),current=location.pathname.replace(/\/$/,'')||'/',sameHash=url.hash?url.hash===location.hash:!location.hash;if((url.pathname.replace(/\/$/,'')||'/')===current&&sameHash){link.setAttribute('aria-current','page');link.classList.add('bg-[#eef2ff]','text-[#3730a3]')}link.addEventListener('click',()=>{menu.open=false;sync()})});sync()});if(!window.__membouxAccountMenuOutside){window.__membouxAccountMenuOutside=true;document.addEventListener('pointerdown',event=>{document.querySelectorAll('[data-account-menu][open]').forEach(menu=>{if(!menu.contains(event.target))menu.open=false})})}})()<\/script>`;

type AccountMenuIcon = "events" | "invitations" | "studio" | "security" | "plan" | "privacy" | "backups" | "trash" | "signout" | "chevron";

function accountMenuIcon(icon: AccountMenuIcon, className = "h-5 w-5") {
  const paths: Record<AccountMenuIcon, string> = {
    events: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 2v4M16 2v4M3 9h18M8 13h2M14 13h2M8 17h2"/>',
    invitations: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
    studio: '<circle cx="12" cy="12" r="3.25"/><path d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12"/>',
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
  notificationCount = 0,
) {
  const el = locale === "el";
  const labels = el
    ? { menu: "Μενού λογαριασμού", profile: "Προβολή προφίλ", workspace: "Χώρος εργασίας", events: "Τα events μου", invitations: "Προσκλήσεις", studio: "Memboux Studio", cloud: "Cloud & συνδρομή", backups: "Αντίγραφα ασφαλείας", plan: "Πλάνο & χρήση", account: "Λογαριασμός", security: "Ασφάλεια", privacy: "Απόρρητο & δεδομένα", trash: "Κάδος", signOut: "Αποσύνδεση" }
    : { menu: "Account menu", profile: "View profile", workspace: "Workspace", events: "My events", invitations: "Invitations", studio: "Memboux Studio", cloud: "Cloud & plan", backups: "Cloud backups", plan: "Plan & usage", account: "Account", security: "Security", privacy: "Privacy & data", trash: "Trash", signOut: "Sign out" };
  const initial = esc((user.name.trim().slice(0, 1) || "M").toUpperCase());
  const triggerClass = darkTrigger
    ? "border-white/15 bg-white/5 text-white hover:bg-white/10 focus-visible:ring-white/40"
    : "border-[#d8deea] bg-white/70 text-[#172033] hover:bg-white focus-visible:ring-[#6366f1]/35";
  const section = (label: string, content: string) => `<section class="border-t border-[#e7eaf1] px-2 py-2.5 first:border-t-0"><h2 class="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[.16em] text-[#7b8497]">${esc(label)}</h2><div class="space-y-0.5">${content}</div></section>`;
  const item = (href: string, icon: AccountMenuIcon, label: string, badge = 0) => `<a data-account-menu-link href="${href}" class="group flex min-h-11 items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium text-[#263146] outline-none transition hover:bg-[#f2f4f9] focus-visible:bg-[#eef2ff] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#818cf8]"><span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#e4e8f1] bg-white text-[#59657b] shadow-sm transition group-hover:border-[#cfd5e2] group-hover:text-[#3730a3]">${accountMenuIcon(icon)}</span><span class="min-w-0 flex-1 truncate">${esc(label)}</span>${badge > 0 ? `<span class="flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#e9653b] px-1.5 text-[10px] font-bold text-white">${badge > 99 ? "99+" : badge}</span>` : accountMenuIcon("chevron", "h-4 w-4 text-[#a1a9b8] transition group-hover:translate-x-0.5")}</a>`;

  return `<details data-account-menu class="account-menu group/account relative z-50 shrink-0">
    <summary data-account-menu-trigger aria-label="${labels.menu}" aria-expanded="false" class="flex h-11 w-11 touch-manipulation cursor-pointer list-none select-none items-center justify-center gap-2 rounded-xl border p-0 outline-none transition focus-visible:ring-2 sm:h-auto sm:w-auto sm:justify-start sm:px-2.5 sm:py-1.5 ${triggerClass}">
      <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${darkTrigger ? "bg-white/15" : "bg-[#e8edff] text-[#3730a3]"} text-sm font-semibold">${initial}</span>
      <span class="hidden max-w-32 truncate text-sm font-medium md:block">${esc(user.name)}</span>
      <svg aria-hidden="true" viewBox="0 0 20 20" class="hidden h-4 w-4 opacity-65 transition group-open/account:rotate-180 sm:block" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 8 4 4 4-4" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </summary>
    <div data-account-menu-panel class="fixed inset-x-3 top-[4.75rem] z-[100] max-h-[calc(100dvh-5.5rem)] overflow-y-auto overscroll-contain rounded-3xl border border-[#dfe3ec] bg-white p-1.5 text-[#172033] shadow-[0_24px_70px_rgba(15,23,42,.24)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[22rem]">
      <nav aria-label="${labels.menu}">
        <a data-account-menu-link href="/${locale}/profile" class="group flex min-w-0 items-center gap-3 rounded-[1.15rem] bg-[#f5f6fa] p-3 outline-none transition hover:bg-[#eef1f7] focus-visible:ring-2 focus-visible:ring-[#818cf8]">
          <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#373f51] font-semibold text-white shadow-sm">${initial}</span>
          <span class="min-w-0 flex-1"><strong class="block truncate text-sm font-semibold text-[#172033]">${esc(user.name)}</strong><span class="block truncate text-xs text-[#6f788a]">${esc(user.email)}</span><span class="mt-0.5 block text-[11px] font-semibold text-[#4f46e5]">${esc(labels.profile)}</span></span>
          ${accountMenuIcon("chevron", "h-4 w-4 shrink-0 text-[#929bad] transition group-hover:translate-x-0.5")}
        </a>
        ${section(labels.workspace, `${item(`/${locale}/account`, "events", labels.events)}${item(`/${locale}/account#invitations`, "invitations", labels.invitations, notificationCount)}${item(`/studio?lang=${locale}`, "studio", labels.studio)}`)}
        ${section(labels.cloud, `${item(`/${locale}/backups`, "backups", labels.backups)}${item(`/${locale}/plan`, "plan", labels.plan)}`)}
        ${section(labels.account, `${item(`/${locale}/security`, "security", labels.security)}${item(`/${locale}/privacy`, "privacy", labels.privacy)}${item(`/${locale}/trash`, "trash", labels.trash)}`)}
      </nav>
      <div class="border-t border-[#e7eaf1] p-2">
        <button type="button" data-logout class="group flex min-h-11 w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-medium text-[#4b5567] outline-none transition hover:bg-[#f2f4f9] hover:text-[#172033] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#818cf8]"><span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#e4e8f1] bg-white text-[#687386] shadow-sm">${accountMenuIcon("signout")}</span><span class="flex-1">${esc(labels.signOut)}</span>${accountMenuIcon("chevron", "h-4 w-4 text-[#a1a9b8]")}</button>
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
) {
  const otherLocale = locale === "el" ? "en" : "el";
  const notificationLabel = locale === "el" ? "Προσκλήσεις" : "Invitations";
  const notificationBadge = notificationCount > 0
    ? `<span class="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#f97316] px-1 text-[10px] font-bold text-white">${notificationCount > 99 ? "99+" : notificationCount}</span>`
    : "";
  return `<header class="app-shell-header relative z-40 border-b border-white/10 bg-[#172033]/95 text-white backdrop-blur-xl"><div class="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:gap-3 sm:px-6 sm:py-4">${brandMark(`/${locale}/account`, true, true)}<div class="flex shrink-0 items-center gap-2"><span class="header-primary-action">${primaryAction}</span><a href="/${locale}/account#invitations" aria-label="${notificationLabel}" title="${notificationLabel}" class="relative flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white hover:bg-white/10"><svg aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/></svg>${notificationBadge}</a><a href="/${otherLocale}/account" class="flex h-11 items-center rounded-xl border border-white/15 bg-white/5 px-3 text-sm font-semibold text-white hover:bg-white/10">${otherLocale.toUpperCase()}</a>${accountMenuDark(locale, user, notificationCount)}</div></div></header>`;
}

export function accountHeader(locale: Locale, user: { name: string; email: string }) {
  return `<header class="app-shell-header relative z-40 border-b border-white/10 bg-[#172033]/95 text-white backdrop-blur-xl"><div class="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4">${brandMark(`/${locale}/account`, true, true)}<div class="flex shrink-0 items-center gap-2"><a href="/${locale === "el" ? "en" : "el"}/account" class="flex h-11 items-center rounded-xl border border-white/15 bg-white/5 px-3 text-sm font-semibold text-white hover:bg-white/10">${locale === "el" ? "EN" : "EL"}</a>${accountMenuDark(locale, user)}</div></div></header>`;
}

export function accountMenuDark(locale: Locale, user: { name: string; email: string }, notificationCount = 0) {
  return renderAccountMenu(locale, user, true, notificationCount);
}

export const logoutScript = (locale: Locale) => `<script>document.querySelectorAll('[data-logout]').forEach(button=>button.onclick=async()=>{button.disabled=true;const response=await fetch('/api/auth/sign-out',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:'{}'});if(response.ok)location.replace('/${locale}');else button.disabled=false})<\/script>`;

export function googleIcon() {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5 shrink-0"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.32 2.98-7.41Z"/><path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.64-2.42l-3.24-2.53c-.9.6-2.05.96-3.4.96-2.61 0-4.82-1.77-5.61-4.14H3.04v2.62A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.87A6 6 0 0 1 6.08 12c0-.65.11-1.28.31-1.87V7.51H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.49l3.35-2.62Z"/><path fill="#EA4335" d="M12 5.99c1.47 0 2.79.5 3.83 1.5l2.88-2.88A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.96 5.51l3.35 2.62C7.18 7.76 9.39 5.99 12 5.99Z"/></svg>`;
}
