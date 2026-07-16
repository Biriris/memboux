import type { Locale } from "../i18n";
import { cookieValue } from "../utils";
import { brandMark, page } from "./shared";

export const adminLocale = (request: Request): Locale =>
  cookieValue(request, "memboux_admin_locale") === "el" ? "el" : "en";

export function adminShell(
  title: string,
  content: string,
  locale: Locale = "en",
) {
  return page(
    `${title} – Memboux Admin`,
    `<style>.admin-ui,.admin-ui button,.admin-ui input,.admin-ui select,.admin-ui textarea{font-family:'Manrope',sans-serif}.admin-ui{font-weight:300}.admin-ui h1,.admin-ui h2,.admin-ui h3{font-family:'Manrope',sans-serif;font-weight:400}.admin-ui strong{font-weight:500}.admin-ui summary::-webkit-details-marker{display:none}</style><div class="admin-ui"><header class="border-b bg-[#172033] text-white"><div class="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">${brandMark("/admin", true, true)}<div class="flex items-center gap-2"><a href="/admin/language/${locale === "el" ? "en" : "el"}" class="rounded-lg border border-white/20 px-3 py-2 text-sm">${locale === "el" ? "EN" : "EL"}</a><details class="relative"><summary class="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-white/20 px-4 py-2 text-sm outline-none transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/30"><span class="flex h-7 w-7 items-center justify-center rounded-full bg-white/15">A</span>Admin <span>⌄</span></summary><div class="absolute right-0 top-full z-40 mt-2 w-56 rounded-2xl border border-[#dbe2f0] bg-[#ffffff] p-2 text-[#111827] shadow-2xl"><a href="/admin" class="block rounded-xl px-3 py-2 text-sm hover:bg-[#f5f7ff]">${locale === "el" ? "Βιβλιοθήκη events" : "Event library"}</a><a href="/admin/readiness" class="block rounded-xl px-3 py-2 text-sm hover:bg-[#f5f7ff]">${locale === "el" ? "Ετοιμότητα launch" : "Launch readiness"}</a><a href="/admin/accounts" class="block rounded-xl px-3 py-2 text-sm hover:bg-[#f5f7ff]">${locale === "el" ? "Plans χρηστών" : "Account plans"}</a><a href="/admin/professionals" class="block rounded-xl px-3 py-2 text-sm hover:bg-[#f5f7ff]">${locale === "el" ? "Professional profiles" : "Professional profiles"}</a><a href="/admin/reported" class="block rounded-xl px-3 py-2 text-sm hover:bg-[#f5f7ff]">${locale === "el" ? "Reported φωτογραφίες" : "Reported media"}</a><a href="/admin/privacy-requests" class="block rounded-xl px-3 py-2 text-sm hover:bg-[#f5f7ff]">${locale === "el" ? "Αιτήματα απορρήτου" : "Privacy requests"}</a><a href="/admin/trash" class="block rounded-xl px-3 py-2 text-sm hover:bg-[#f5f7ff]">${locale === "el" ? "Κάδος φωτογραφιών" : "Media trash"}</a><form action="/admin/logout" method="post" class="mt-1 border-t"><button class="w-full rounded-xl px-3 py-3 text-left text-sm text-red-700 hover:bg-red-50">${locale === "el" ? "Αποσύνδεση" : "Sign out"}</button></form></div></details></div></div></header>${content}</div>`,
  );
}
