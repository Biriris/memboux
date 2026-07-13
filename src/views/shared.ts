import type { Locale } from "../i18n";
import { esc } from "../utils";

export function page(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f6f1eb"><meta name="description" content="Memboux – Collecting Moments"><link rel="icon" type="image/png" href="/brand/memboux-icon.png"><link rel="apple-touch-icon" href="/brand/memboux-icon.png"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Serif:wght@300;400;500;600&display=swap" rel="stylesheet"><title>${esc(title)}</title><link rel="stylesheet" href="/app.css"></head><body class="min-h-screen bg-gradient-to-br from-[#f6f1eb] via-[#fffcf8] to-[#e8ddd3] text-[#2b211d]">${body}</body></html>`;
}

export function brandMark(href: string, compact = false, light = false) {
  const destination = /^\/(el|en)$/.test(href) ? `${href}/account` : href;
  return `<a href="${destination}" class="inline-flex items-center gap-3 ${light ? "text-white" : "text-[#594033]"}"><img src="/brand/memboux-icon.png" alt="" width="48" height="48" class="${compact ? "h-9 w-9" : "h-11 w-11"} object-contain ${light ? "brightness-0 invert" : ""}"><span class="leading-none"><strong class="block font-serif ${compact ? "text-xl" : "text-2xl"} tracking-wide">Memboux</strong><span class="mt-1 block text-[9px] font-semibold uppercase tracking-[.22em] opacity-75">Collecting Moments</span></span></a>`;
}

export function accountMenu(locale: Locale, user: { name: string; email: string }) {
  const labels = locale === "el"
    ? { events: "Τα events μου", profile: "Προφίλ", security: "Ασφάλεια", plan: "Plan & χρήση", privacy: "Απόρρητο & δεδομένα", trash: "Κάδος", signOut: "Αποσύνδεση" }
    : { events: "My events", profile: "Profile", security: "Security", plan: "Plan & usage", privacy: "Privacy & data", trash: "Trash", signOut: "Sign out" };
  const item = (href: string, icon: string, label: string) => `<a href="${href}" class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-[#f6f1eb]"><span aria-hidden="true">${icon}</span>${label}</a>`;

  return `<div class="group relative"><button type="button" aria-haspopup="menu" class="flex items-center gap-2 rounded-xl border px-3 py-2"><span class="flex h-8 w-8 items-center justify-center rounded-full bg-[#e8ddd3] font-medium">${esc(user.name.slice(0, 1).toUpperCase())}</span><span class="hidden max-w-36 truncate text-sm md:block">${esc(user.name)}</span><span aria-hidden="true" class="text-xs">⌄</span></button><div role="menu" class="invisible absolute right-0 z-30 mt-0 w-60 translate-y-1 rounded-2xl border bg-white p-2 opacity-0 shadow-xl transition group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100"><p class="truncate px-3 py-2 text-xs text-[#625750]">${esc(user.email)}</p>${item(`/${locale}/account`, "▦", labels.events)}${item(`/${locale}/profile`, "○", labels.profile)}${item(`/${locale}/security`, "◇", labels.security)}${item(`/${locale}/plan`, "◈", labels.plan)}${item(`/${locale}/privacy`, "◌", labels.privacy)}${item(`/${locale}/trash`, "♲", labels.trash)}<button type="button" data-logout class="mt-1 w-full rounded-xl border-t px-3 py-3 text-left text-sm text-red-700 hover:bg-red-50">${labels.signOut}</button></div></div>`;
}

export const logoutScript = (locale: Locale) => `<script>document.querySelectorAll('[data-logout]').forEach(button=>button.onclick=async()=>{button.disabled=true;const response=await fetch('/api/auth/sign-out',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:'{}'});if(response.ok)location.replace('/${locale}');else button.disabled=false})<\/script>`;

export function googleIcon() {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5 shrink-0"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.32 2.98-7.41Z"/><path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.64-2.42l-3.24-2.53c-.9.6-2.05.96-3.4.96-2.61 0-4.82-1.77-5.61-4.14H3.04v2.62A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.87A6 6 0 0 1 6.08 12c0-.65.11-1.28.31-1.87V7.51H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.49l3.35-2.62Z"/><path fill="#EA4335" d="M12 5.99c1.47 0 2.79.5 3.83 1.5l2.88-2.88A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.96 5.51l3.35 2.62C7.18 7.76 9.39 5.99 12 5.99Z"/></svg>`;
}
