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
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#172033"><meta name="application-name" content="Memboux"><meta name="apple-mobile-web-app-title" content="Memboux"><meta name="keywords" content="${keywords}"><meta name="description" content="${esc(description)}"><meta name="robots" content="${robots}">${canonical}${alternates}${social}${structuredData}<link rel="icon" type="image/png" href="/brand/memboux-icon.png"><link rel="apple-touch-icon" href="/brand/memboux-icon.png"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&display=swap" rel="stylesheet"><title>${esc(title)}</title><link rel="stylesheet" href="/app-midnight.css?v=20260713-2"></head><body class="memboux-ui min-h-screen bg-[#f6f7fb] text-[#172033]">${body}${creationBehavior}</body></html>`;
}

export function brandMark(href: string, compact = false, light = false) {
  return `<a href="${href}" class="brand-mark inline-flex shrink-0 items-center gap-2 sm:gap-3 ${light ? "text-white" : "text-[#24304a]"}" aria-label="Memboux"><img src="/brand/memboux-icon.png" alt="" width="48" height="48" class="${compact ? "h-9 w-9" : "h-11 w-11"} shrink-0 object-contain ${light ? "brightness-0 invert" : ""}"><span class="leading-none"><strong class="block font-serif ${compact ? "text-lg sm:text-xl" : "text-2xl"} tracking-wide">Memboux</strong><span class="mt-1 hidden text-[9px] font-semibold uppercase tracking-[.22em] opacity-70 sm:block">Collecting Moments</span></span></a>`;
}

const accountMenuBehavior = `<script>(()=>{document.querySelectorAll('[data-account-menu]').forEach(menu=>{if(menu.dataset.ready)return;menu.dataset.ready='1';const trigger=menu.querySelector('[data-account-menu-trigger]');let timer;const desktop=()=>matchMedia('(hover:hover) and (pointer:fine)').matches;const sync=()=>trigger?.setAttribute('aria-expanded',String(menu.open));menu.addEventListener('toggle',sync);menu.addEventListener('mouseenter',()=>{if(!desktop())return;clearTimeout(timer);menu.open=true;sync()});menu.addEventListener('mouseleave',()=>{if(!desktop())return;clearTimeout(timer);timer=setTimeout(()=>{menu.open=false;sync()},300)});sync()});if(!window.__membouxAccountMenuOutside){window.__membouxAccountMenuOutside=true;document.addEventListener('pointerdown',event=>{document.querySelectorAll('[data-account-menu][open]').forEach(menu=>{if(!menu.contains(event.target))menu.open=false})})}})()<\/script>`;

export function accountMenu(locale: Locale, user: { name: string; email: string }) {
  const labels = locale === "el"
    ? { events: "Τα events μου", studio: "Memboux Studio", profile: "Προφίλ", security: "Ασφάλεια", plan: "Plan & χρήση", privacy: "Απόρρητο & δεδομένα", trash: "Κάδος", signOut: "Αποσύνδεση" }
    : { events: "My events", studio: "Memboux Studio", profile: "Profile", security: "Security", plan: "Plan & usage", privacy: "Privacy & data", trash: "Trash", signOut: "Sign out" };
  const quickItem = (href: string, icon: string, label: string) => `<a href="${href}" class="flex min-w-0 items-center gap-2 rounded-xl border bg-white p-2 text-xs font-medium hover:border-[#a5b4fc] hover:bg-[#eef2ff]"><span aria-hidden="true" class="text-base text-[#4f46e5]">${icon}</span><span class="truncate">${label}</span></a>`;
  const moreItem = (href: string, icon: string, label: string) => `<a href="${href}" class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-[#eef2ff]"><span aria-hidden="true" class="text-[#4f46e5]">${icon}</span>${label}</a>`;

  return `<details data-account-menu class="account-menu relative z-50 shrink-0">
    <summary data-account-menu-trigger aria-label="Account menu" aria-haspopup="menu" class="flex h-11 w-11 touch-manipulation select-none cursor-pointer list-none items-center justify-center gap-2 rounded-xl border p-0 outline-none transition hover:bg-white/70 focus-visible:ring-2 focus-visible:ring-[#7c3aed]/30 sm:h-auto sm:w-auto sm:justify-start sm:px-3 sm:py-2">
      <span class="flex h-8 w-8 items-center justify-center rounded-full bg-[#e8edff] font-medium">${esc(user.name.slice(0, 1).toUpperCase())}</span>
      <span class="hidden max-w-36 truncate text-sm md:block">${esc(user.name)}</span>
      <span aria-hidden="true" class="hidden text-xs sm:inline">⌄</span>
    </summary>
    <div role="menu" class="fixed inset-x-3 top-[4.5rem] z-[100] rounded-2xl border border-[#dbe2f0] bg-white p-2 text-[#111827] shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-64">
      <div class="flex min-w-0 items-center gap-2 rounded-xl bg-[#f5f7ff] p-2"><span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#4f46e5] font-semibold text-white">${esc(user.name.slice(0, 1).toUpperCase())}</span><span class="min-w-0"><strong class="block truncate text-sm">${esc(user.name)}</strong><span class="block truncate text-xs text-[#64748b]">${esc(user.email)}</span></span></div>
      <div class="mt-2 grid grid-cols-2 gap-2">
        ${quickItem(`/${locale}/account`, "▦", labels.events)}
        ${quickItem(`/studio?lang=${locale}`, "◆", labels.studio)}
        ${quickItem(`/${locale}/profile`, "○", labels.profile)}
        ${quickItem(`/${locale}/security`, "◇", labels.security)}
      </div>
      <details class="mt-2 rounded-xl border border-[#e2e8f0] bg-[#f8faff]">
        <summary class="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-[.12em] text-[#64748b]"><span>${locale === "el" ? "Περισσότερα" : "More"}</span><span aria-hidden="true">＋</span></summary>
        <div class="border-t border-[#e2e8f0] p-1">
          ${moreItem(`/${locale}/plan`, "◈", labels.plan)}
          ${moreItem(`/${locale}/privacy`, "◌", labels.privacy)}
          ${moreItem(`/${locale}/backups`, "☁", locale === "el" ? "Αντίγραφα ασφαλείας" : "Cloud backups")}
          ${moreItem(`/${locale}/trash`, "♲", labels.trash)}
        </div>
      </details>
      <button type="button" data-logout class="mt-2 flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"><span>${labels.signOut}</span><span aria-hidden="true">↗</span></button>
    </div>
  </details>${accountMenuBehavior}`;
}

export function eventHeader(
  locale: Locale,
  user: { name: string; email: string },
  primaryAction = "",
) {
  const otherLocale = locale === "el" ? "en" : "el";
  return `<header class="app-shell-header relative z-40 border-b border-white/10 bg-[#172033]/95 text-white backdrop-blur-xl"><div class="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:gap-3 sm:px-6 sm:py-4">${brandMark(`/${locale}/account`, true, true)}<div class="flex shrink-0 items-center gap-2"><span class="header-primary-action">${primaryAction}</span><a href="/${otherLocale}/account" class="flex h-11 items-center rounded-xl border border-white/15 bg-white/5 px-3 text-sm font-semibold text-white hover:bg-white/10">${otherLocale.toUpperCase()}</a>${accountMenuDark(locale, user)}</div></div></header>`;
}

export function accountHeader(locale: Locale, user: { name: string; email: string }) {
  return `<header class="app-shell-header relative z-40 border-b border-white/10 bg-[#172033]/95 text-white backdrop-blur-xl"><div class="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4">${brandMark(`/${locale}/account`, true, true)}<div class="flex shrink-0 items-center gap-2"><a href="/${locale === "el" ? "en" : "el"}/account" class="flex h-11 items-center rounded-xl border border-white/15 bg-white/5 px-3 text-sm font-semibold text-white hover:bg-white/10">${locale === "el" ? "EN" : "EL"}</a>${accountMenuDark(locale, user)}</div></div></header>`;
}

export function accountMenuDark(locale: Locale, user: { name: string; email: string }) {
  const labels = locale === "el"
    ? { events: "Τα events μου", studio: "Memboux Studio", profile: "Προφίλ", security: "Ασφάλεια", plan: "Plan & χρήση", privacy: "Απόρρητο & δεδομένα", trash: "Κάδος", signOut: "Αποσύνδεση" }
    : { events: "My events", studio: "Memboux Studio", profile: "Profile", security: "Security", plan: "Plan & usage", privacy: "Privacy & data", trash: "Trash", signOut: "Sign out" };
  const quickItem = (href: string, icon: string, label: string) => `<a href="${href}" class="flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-2 text-xs font-medium text-white hover:border-[#818cf8] hover:bg-white/10"><span aria-hidden="true" class="text-base text-[#a5b4fc]">${icon}</span><span class="truncate">${label}</span></a>`;
  const moreItem = (href: string, icon: string, label: string) => `<a href="${href}" class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/90 hover:bg-white/10"><span aria-hidden="true" class="text-[#a5b4fc]">${icon}</span>${label}</a>`;
  return `<details data-account-menu class="account-menu relative z-50 shrink-0">
    <summary data-account-menu-trigger aria-label="Account menu" aria-haspopup="menu" class="flex h-11 w-11 touch-manipulation select-none cursor-pointer list-none items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 p-0 text-white outline-none transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/30 sm:h-auto sm:w-auto sm:justify-start sm:px-3 sm:py-2">
      <span class="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 font-medium">${esc(user.name.slice(0, 1).toUpperCase())}</span>
      <span class="hidden max-w-36 truncate text-sm md:block">${esc(user.name)}</span>
      <span aria-hidden="true" class="hidden text-xs opacity-70 sm:inline">⌄</span>
    </summary>
    <div role="menu" class="fixed inset-x-3 top-[4.5rem] z-[100] rounded-2xl border border-white/15 bg-[#172033] p-2 text-white shadow-2xl shadow-black/30 sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-64">
      <div class="flex min-w-0 items-center gap-2 rounded-xl bg-white/5 p-2"><span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#4f46e5] font-semibold text-white">${esc(user.name.slice(0, 1).toUpperCase())}</span><span class="min-w-0"><strong class="block truncate text-sm">${esc(user.name)}</strong><span class="block truncate text-xs text-white/60">${esc(user.email)}</span></span></div>
      <div class="mt-2 grid grid-cols-2 gap-2">
        ${quickItem(`/${locale}/account`, "▦", labels.events)}
        ${quickItem(`/studio?lang=${locale}`, "◆", labels.studio)}
        ${quickItem(`/${locale}/profile`, "○", labels.profile)}
        ${quickItem(`/${locale}/security`, "◇", labels.security)}
      </div>
      <details class="mt-2 rounded-xl border border-white/10 bg-white/5">
        <summary class="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-[.12em] text-white/60"><span>${locale === "el" ? "Περισσότερα" : "More"}</span><span aria-hidden="true">＋</span></summary>
        <div class="border-t border-white/10 p-1">
          ${moreItem(`/${locale}/plan`, "◈", labels.plan)}
          ${moreItem(`/${locale}/privacy`, "◌", labels.privacy)}
          ${moreItem(`/${locale}/backups`, "☁", locale === "el" ? "Αντίγραφα ασφαλείας" : "Cloud backups")}
          ${moreItem(`/${locale}/trash`, "⌫", labels.trash)}
        </div>
      </details>
      <button type="button" data-logout class="mt-2 flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-red-200 hover:bg-white/10"><span>${labels.signOut}</span><span aria-hidden="true">↗</span></button>
    </div>
  </details>${accountMenuBehavior}`;
}

export const logoutScript = (locale: Locale) => `<script>document.querySelectorAll('[data-logout]').forEach(button=>button.onclick=async()=>{button.disabled=true;const response=await fetch('/api/auth/sign-out',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:'{}'});if(response.ok)location.replace('/${locale}');else button.disabled=false})<\/script>`;

export function googleIcon() {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5 shrink-0"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.32 2.98-7.41Z"/><path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.64-2.42l-3.24-2.53c-.9.6-2.05.96-3.4.96-2.61 0-4.82-1.77-5.61-4.14H3.04v2.62A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.87A6 6 0 0 1 6.08 12c0-.65.11-1.28.31-1.87V7.51H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.49l3.35-2.62Z"/><path fill="#EA4335" d="M12 5.99c1.47 0 2.79.5 3.83 1.5l2.88-2.88A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.96 5.51l3.35 2.62C7.18 7.76 9.39 5.99 12 5.99Z"/></svg>`;
}
