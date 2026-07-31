import type { Locale } from "../i18n";
import { cookieValue } from "../utils";
import { brandMark, page } from "./shared";
import { uploadLimitsCopy } from "./upload";
import { adminCan, adminRoleProfiles, type AdminIdentity, type AdminPermission } from "../admin-rbac";

export const adminLocale = (request: Request): Locale =>
  cookieValue(request, "memboux_admin_locale") === "el" ? "el" : "en";

export function adminShell(
  title: string,
  content: string,
  locale: Locale = "en",
  actor?: AdminIdentity,
) {
  const linkClass = "block rounded-xl px-3 py-2 text-sm hover:bg-[#f7f3ff]";
  const routedContent = content
    .replaceAll('href="/admin"', 'href="/admin/events"')
    .replaceAll("Up to 20 files, 100 MB each and 100 MB total.", uploadLimitsCopy(locale))
    .replaceAll("Έως 20 αρχεία, 100 MB ανά αρχείο και 100 MB συνολικά.", uploadLimitsCopy(locale));
  const link = (href: string, permission: AdminPermission, el: string, en: string) =>
    !actor || adminCan(actor.role, permission) ? `<a href="${href}" class="${linkClass}">${locale === "el" ? el : en}</a>` : "";
  const menu = `${link("/admin/users", "users.read", "Εγγεγραμμένοι χρήστες", "Registered users")}
    ${link("/admin/profile", "support.read", "Οι ειδοποιήσεις μου", "My notifications")}
    ${link("/admin/team", "team.manage", "Ομάδα & ρόλοι", "Team & roles")}
    ${link("/admin/support", "support.read", "Υποστήριξη", "Support inbox")}
    ${link("/admin/events", "events.read", "Βιβλιοθήκη εκδηλώσεων", "Event library")}
    ${link("/admin/readiness", "system.read", "Ετοιμότητα κυκλοφορίας", "Launch readiness")}
    ${link("/admin/accounts", "billing.read", "Πακέτα & όρια", "Plans & limits")}
    ${link("/admin/professionals", "events.read", "Επαγγελματικά προφίλ", "Professional profiles")}
    ${link("/admin/reported", "moderation.read", "Αναφορές περιεχομένου", "Reported media")}
    ${link("/admin/privacy-requests", "privacy.read", "Αιτήματα απορρήτου", "Privacy requests")}
    ${link("/admin/trash", "moderation.read", "Κάδος πολυμέσων", "Media trash")}`;
  const identity = actor ? `<div class="mb-2 border-b border-[#e6dff0] px-3 py-3"><strong class="block text-sm">${actor.name}</strong><span class="mt-1 block text-xs text-[#766a82]">${adminRoleProfiles[actor.role].label[locale === "el" ? "el" : "en"]}</span></div>` : "";

  return page(
    `${title} – Memboux Admin`,
    `<style>.admin-ui,.admin-ui button,.admin-ui input,.admin-ui select,.admin-ui textarea{font-family:'Manrope',sans-serif}.admin-ui{font-weight:300}.admin-ui h1,.admin-ui h2,.admin-ui h3{font-family:'Manrope',sans-serif;font-weight:400}.admin-ui strong{font-weight:500}.admin-ui summary::-webkit-details-marker{display:none}</style><div class="admin-ui"><header class="border-b bg-[#2b174d] text-white"><div class="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">${brandMark("/admin", true, true)}<div class="flex items-center gap-2"><a href="/admin/language/${locale === "el" ? "en" : "el"}" class="rounded-lg border border-white/20 px-3 py-2 text-sm">${locale === "el" ? "EN" : "EL"}</a><details class="relative"><summary class="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-white/20 px-4 py-2 text-sm outline-none transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/30"><span class="flex h-7 w-7 items-center justify-center rounded-full bg-white/15">${actor ? actor.name.slice(0, 1).toUpperCase() : "A"}</span>${actor ? actor.name : "Admin"} <span>⌄</span></summary><div class="absolute right-0 top-full z-40 mt-2 w-64 rounded-2xl border border-[#e6dff0] bg-white p-2 text-[#24143b] shadow-2xl">${identity}${menu}<form action="/admin/logout" method="post" class="mt-1 border-t"><button class="w-full rounded-xl px-3 py-3 text-left text-sm text-red-700 hover:bg-red-50">${locale === "el" ? "Έξοδος από το Admin" : "Exit Admin"}</button></form></div></details></div></div></header>${routedContent}</div>`,
    { locale },
  );
}
