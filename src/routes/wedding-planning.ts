import { Hono } from "hono";
import { getEventRole, roleCan } from "../access";
import type { Bindings, EventRow } from "../domain";
import { eventAccessAllows, getEventAccess } from "../event-access";
import { normalizeLocale, type Locale } from "../i18n";
import { getEvent } from "../repositories";
import { currentUser } from "../session";
import { esc, sha256 } from "../utils";
import { eventHeader, logoutScript, page } from "../views/shared";
import { parseWeddingGuestCsv, weddingGuestCsv, WEDDING_GUEST_IMPORT_MAX_BYTES, WEDDING_GUEST_IMPORT_MAX_ROWS } from "../wedding-guests-csv";

type WeddingGuestGroup = {
  id: string;
  name: string;
};

type WeddingGuest = {
  id: string;
  group_id: string | null;
  group_name: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  plus_one_limit: number;
  rsvp_status: "pending" | "yes" | "no" | "maybe";
  party_size: number;
  dietary_notes: string;
  table_id: string | null;
  table_name: string | null;
};

type WeddingTable = {
  id: string;
  name: string;
  shape: "round" | "rectangle" | "oval" | "custom";
  capacity: number;
  assigned_count: number;
};

type EditableWeddingGuest = WeddingGuest & {
  invited_to_ceremony: number;
  invited_to_reception: number;
};

const label = (locale: Locale, el: string, en: string) => locale === "el" ? el : en;

async function manageableWedding(db: D1Database, code: string, userId: string) {
  const event = await getEvent(db, code);
  if (!event || event.event_type !== "wedding") return null;
  return roleCan(await getEventRole(db, event.id, userId), "manage_event") ? event : null;
}

function validEmail(value: string) {
  return value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapedLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function chunks<T>(values: T[], size: number) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

function guestPlannerPage(input: {
  event: EventRow;
  locale: Locale;
  user: { name: string; email: string };
  groups: WeddingGuestGroup[];
  guests: WeddingGuest[];
  tables: WeddingTable[];
  origin: string;
  query: string;
  pageNumber: number;
  totalPages: number;
  totalGuests: number;
  totalFiltered: number;
  assignedGuestCount: number;
  importedCount: number;
  freshGuest?: Pick<WeddingGuest, "id" | "first_name" | "last_name"> | null;
  freshGuestId?: string;
  freshToken?: string;
}) {
  const { event, locale, user, groups, guests, tables, origin, query, pageNumber, totalPages, totalGuests, totalFiltered, assignedGuestCount, importedCount, freshGuestId, freshToken } = input;
  const el = locale === "el";
  const groupOptions = groups.map((group) => `<option value="${esc(group.id)}">${esc(group.name)}</option>`).join("");
  const freshGuest = input.freshGuest ?? guests.find((guest) => guest.id === freshGuestId);
  const inviteUrl = freshGuest && freshToken
    ? `${origin}/wedding/${encodeURIComponent(event.code)}/invite/${encodeURIComponent(freshToken)}?lang=${locale}`
    : null;
  const inviteNotice = inviteUrl ? `<section class="mt-6 rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-5"><p class="text-xs font-bold uppercase tracking-[.15em] text-emerald-800">${el ? "Νέο προσωπικό link" : "New personal link"}</p><h2 class="mt-2 text-xl text-emerald-950">${esc(`${freshGuest!.first_name} ${freshGuest!.last_name}`.trim())}</h2><div class="mt-3 flex flex-col gap-2 sm:flex-row"><input id="fresh-invite-link" readonly value="${esc(inviteUrl)}" class="min-w-0 flex-1 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm"><button type="button" data-copy-fresh-link class="rounded-xl bg-emerald-800 px-4 py-3 text-sm font-bold text-white">${el ? "Αντιγραφή link" : "Copy link"}</button></div><p class="mt-2 text-xs text-emerald-800">${el ? "Αποθήκευσέ το τώρα. Για λόγους ασφαλείας το Memboux κρατά μόνο το hash του token." : "Save it now. For security, Memboux stores only the token hash."}</p></section>` : "";

  const guestRows = guests.map((guest) => {
    const status = guest.rsvp_status === "yes" ? (el ? "Θα έρθει" : "Attending") : guest.rsvp_status === "no" ? (el ? "Δεν θα έρθει" : "Declined") : guest.rsvp_status === "maybe" ? (el ? "Ίσως" : "Maybe") : (el ? "Αναμονή" : "Pending");
    return `<tr class="border-t border-[#eee8f5]"><td class="px-4 py-4"><strong class="text-[#2b174d]">${esc(`${guest.first_name} ${guest.last_name}`.trim())}</strong><span class="mt-1 block text-xs text-[#786e82]">${esc(guest.group_name ?? (el ? "Χωρίς ομάδα" : "No group"))}</span></td><td class="px-4 py-4 text-sm"><span class="block">${esc(guest.email || "–")}</span><span class="text-xs text-[#786e82]">${esc(guest.phone || "–")}</span></td><td class="px-4 py-4 text-sm"><span class="rounded-full bg-[#f3edff] px-2.5 py-1 text-xs font-bold text-[#6d28d9]">${esc(status)}</span><span class="mt-2 block text-xs text-[#786e82]">${guest.party_size} ${el ? "άτομα" : "people"}</span></td><td class="px-4 py-4"><form action="/api/account/events/${encodeURIComponent(event.code)}/wedding/seating" method="post" class="flex min-w-[190px] gap-2"><input type="hidden" name="locale" value="${locale}"><input type="hidden" name="guestId" value="${esc(guest.id)}"><select name="tableId" class="min-w-0 flex-1 rounded-lg border px-2 py-2 text-xs"><option value="">${el ? "Χωρίς τραπέζι" : "Unassigned"}</option>${tables.map((table) => `<option value="${esc(table.id)}" ${guest.table_id === table.id ? "selected" : ""}>${esc(table.name)}</option>`).join("")}</select><button class="rounded-lg bg-[#2b174d] px-3 py-2 text-xs font-bold text-white">${el ? "ΟΚ" : "Save"}</button></form></td><td class="px-4 py-4"><div class="flex flex-wrap gap-2"><a href="/dashboard/${encodeURIComponent(event.code)}/wedding/guests/${esc(guest.id)}/edit?lang=${locale}" class="rounded-lg bg-[#f3edff] px-3 py-2 text-xs font-bold text-[#6d28d9]">${el ? "Επεξεργασία" : "Edit"}</a><form action="/api/account/events/${encodeURIComponent(event.code)}/wedding/guests/${esc(guest.id)}/invite-link" method="post"><input type="hidden" name="locale" value="${locale}"><button class="rounded-lg border border-[#d8cbed] px-3 py-2 text-xs font-bold text-[#6d28d9]">${el ? "Δημιουργία link" : "Create link"}</button></form><form action="/api/account/events/${encodeURIComponent(event.code)}/wedding/guests/${esc(guest.id)}/delete" method="post" onsubmit="return confirm('${el ? "Διαγραφή καλεσμένου;" : "Delete guest?"}')"><input type="hidden" name="locale" value="${locale}"><button class="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">${el ? "Διαγραφή" : "Delete"}</button></form></div></td></tr>`;
  }).join("");

  const tableCards = tables.map((table) => {
    const full = table.assigned_count >= table.capacity;
    return `<article class="rounded-2xl border ${full ? "border-amber-200 bg-amber-50" : "border-[#e8e0f2] bg-white"} p-5"><div class="flex items-start justify-between gap-3"><div><span class="text-xs font-bold uppercase tracking-[.14em] text-[#7c3aed]">${esc(table.shape)}</span><h3 class="mt-1 text-xl text-[#2b174d]">${esc(table.name)}</h3></div><strong class="rounded-full ${full ? "bg-amber-200 text-amber-900" : "bg-[#f3edff] text-[#6d28d9]"} px-3 py-1 text-sm">${table.assigned_count}/${table.capacity}</strong></div></article>`;
  }).join("");

  const pageHref = (targetPage: number) => {
    const parameters = new URLSearchParams({ lang: locale, page: String(targetPage) });
    if (query) parameters.set("q", query);
    return `/dashboard/${encodeURIComponent(event.code)}/wedding/guests?${parameters.toString()}`;
  };
  const pagination = totalPages > 1 ? `<nav aria-label="${el ? "Σελίδες καλεσμένων" : "Guest pages"}" class="flex items-center justify-between gap-3 border-t border-[#eee8f5] p-4"><a ${pageNumber > 1 ? `href="${esc(pageHref(pageNumber - 1))}"` : "aria-disabled=\"true\""} class="rounded-lg border px-3 py-2 text-sm font-semibold ${pageNumber > 1 ? "text-[#6d28d9]" : "pointer-events-none text-[#aaa2b0]"}">← ${el ? "Προηγούμενη" : "Previous"}</a><span class="text-xs font-semibold text-[#756b82]">${pageNumber} / ${totalPages}</span><a ${pageNumber < totalPages ? `href="${esc(pageHref(pageNumber + 1))}"` : "aria-disabled=\"true\""} class="rounded-lg border px-3 py-2 text-sm font-semibold ${pageNumber < totalPages ? "text-[#6d28d9]" : "pointer-events-none text-[#aaa2b0]"}">${el ? "Επόμενη" : "Next"} →</a></nav>` : "";
  const importNotice = importedCount > 0 ? `<p class="mt-5 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">${el ? `Προστέθηκαν ${importedCount} καλεσμένοι από το CSV.` : `${importedCount} guests were imported from CSV.`}</p>` : "";
  const directoryTools = `<section class="mt-6 rounded-[1.8rem] border border-[#e8e0f2] bg-[#f8f5ff] p-5 sm:p-6"><div class="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div><p class="text-xs font-bold uppercase tracking-[.16em] text-[#7c3aed]">Guest list tools</p><h2 class="mt-1 text-2xl text-[#2b174d]">${el ? "Αναζήτηση και μαζική εισαγωγή" : "Search and bulk import"}</h2><p class="mt-2 text-sm text-[#756b82]">${el ? `Έως ${WEDDING_GUEST_IMPORT_MAX_ROWS} καλεσμένοι ανά CSV. Η εισαγωγή απορρίπτεται ολόκληρη αν κάποια γραμμή δεν είναι έγκυρη.` : `Up to ${WEDDING_GUEST_IMPORT_MAX_ROWS} guests per CSV. The whole import is rejected if any row is invalid.`}</p></div><a href="/api/account/events/${encodeURIComponent(event.code)}/wedding/guests/export" class="w-fit rounded-xl border border-[#d9caeb] bg-white px-4 py-3 text-sm font-bold text-[#6d28d9]">${el ? "Λήψη CSV / template" : "Download CSV / template"}</a></div>${importNotice}<div class="mt-5 grid gap-4 lg:grid-cols-2"><form action="/dashboard/${encodeURIComponent(event.code)}/wedding/guests" method="get" class="flex gap-2"><input type="hidden" name="lang" value="${locale}"><input name="q" maxlength="80" value="${esc(query)}" placeholder="${el ? "Όνομα, email, τηλέφωνο ή ομάδα" : "Name, email, phone or group"}" class="min-w-0 flex-1 rounded-xl border bg-white px-4 py-3"><button class="rounded-xl bg-[#2b174d] px-4 py-3 text-sm font-bold text-white">${el ? "Αναζήτηση" : "Search"}</button>${query ? `<a href="/dashboard/${encodeURIComponent(event.code)}/wedding/guests?lang=${locale}" class="rounded-xl border bg-white px-4 py-3 text-sm font-bold text-[#6d28d9]">${el ? "Καθαρισμός" : "Clear"}</a>` : ""}</form><form action="/api/account/events/${encodeURIComponent(event.code)}/wedding/guests/import" method="post" enctype="multipart/form-data" class="flex flex-col gap-2 sm:flex-row"><input type="hidden" name="locale" value="${locale}"><input name="guestFile" type="file" required accept=".csv,text/csv" class="min-w-0 flex-1 rounded-xl border bg-white px-3 py-2 text-sm"><button class="rounded-xl bg-[#7c3aed] px-4 py-3 text-sm font-bold text-white">${el ? "Εισαγωγή CSV" : "Import CSV"}</button></form></div></section>`;

  const body = `${eventHeader(locale, user)}<main class="mx-auto max-w-7xl p-4 pb-16 sm:p-6 lg:p-10"><div class="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><a href="/dashboard/${encodeURIComponent(event.code)}?lang=${locale}" class="text-sm font-semibold text-[#6d28d9]">← ${el ? "Πίσω στο dashboard" : "Back to dashboard"}</a><p class="mt-5 text-xs font-bold uppercase tracking-[.18em] text-[#f43f8f]">Wedding guest operations</p><h1 class="mt-2 text-4xl text-[#2b174d]">${el ? "Καλεσμένοι, RSVP και τραπέζια" : "Guests, RSVP and seating"}</h1><p class="mt-3 max-w-3xl text-sm leading-6 text-[#756b82]">${el ? "Οργάνωσε οικογένειες και παρέες, δημιούργησε ασφαλή προσωπικά links και τοποθέτησε κάθε καλεσμένο στο σωστό τραπέζι." : "Organize households, create secure personal links, and place every guest at the right table."}</p></div><a href="/dashboard/${encodeURIComponent(event.code)}/engagement?lang=${locale}" class="rounded-xl bg-[#2b174d] px-5 py-3 text-center text-sm font-bold text-white">RSVP · Guestbook · Live</a></div>${inviteNotice}<section class="mt-6 grid gap-5 xl:grid-cols-2"><form action="/api/account/events/${encodeURIComponent(event.code)}/wedding/guest-groups" method="post" class="rounded-[1.8rem] border border-[#e8e0f2] bg-[#f8f5ff] p-5"><input type="hidden" name="locale" value="${locale}"><h2 class="text-2xl text-[#2b174d]">${el ? "Οικογένειες και παρέες" : "Households and groups"}</h2><div class="mt-4 flex gap-2"><input name="name" required maxlength="100" placeholder="${el ? "π.χ. Οικογένεια Παπαδοπούλου" : "e.g. Papadopoulos family"}" class="min-w-0 flex-1 rounded-xl border px-4 py-3"><button class="rounded-xl bg-[#7c3aed] px-4 py-3 font-bold text-white">${el ? "Προσθήκη" : "Add"}</button></div><div class="mt-4 flex flex-wrap gap-2">${groups.map((group) => `<span class="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-[#5f526b]">${esc(group.name)}</span>`).join("") || `<span class="text-sm text-[#81758a]">${el ? "Δεν υπάρχουν ομάδες ακόμη." : "No groups yet."}</span>`}</div></form><form action="/api/account/events/${encodeURIComponent(event.code)}/wedding/tables" method="post" class="rounded-[1.8rem] border border-[#e8e0f2] bg-[#f8f5ff] p-5"><input type="hidden" name="locale" value="${locale}"><h2 class="text-2xl text-[#2b174d]">${el ? "Νέο τραπέζι" : "New table"}</h2><div class="mt-4 grid gap-3 sm:grid-cols-3"><input name="name" required maxlength="80" placeholder="${el ? "Όνομα" : "Name"}" class="rounded-xl border px-4 py-3"><select name="shape" class="rounded-xl border px-4 py-3"><option value="round">${el ? "Στρογγυλό" : "Round"}</option><option value="rectangle">${el ? "Ορθογώνιο" : "Rectangle"}</option><option value="oval">${el ? "Οβάλ" : "Oval"}</option></select><input name="capacity" required type="number" min="1" max="100" value="10" class="rounded-xl border px-4 py-3"><button class="rounded-xl bg-[#7c3aed] px-4 py-3 font-bold text-white sm:col-span-3">${el ? "Δημιουργία τραπεζιού" : "Create table"}</button></div></form></section><section class="mt-6 rounded-[1.8rem] border border-[#e8e0f2] bg-white p-5 sm:p-6"><h2 class="text-2xl text-[#2b174d]">${el ? "Προσθήκη καλεσμένου" : "Add guest"}</h2><form action="/api/account/events/${encodeURIComponent(event.code)}/wedding/guests" method="post" class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><input type="hidden" name="locale" value="${locale}"><input name="firstName" required maxlength="80" placeholder="${el ? "Όνομα" : "First name"}" class="rounded-xl border px-4 py-3"><input name="lastName" maxlength="80" placeholder="${el ? "Επώνυμο" : "Last name"}" class="rounded-xl border px-4 py-3"><input name="email" type="email" maxlength="254" placeholder="Email" class="rounded-xl border px-4 py-3"><input name="phone" type="tel" maxlength="40" placeholder="${el ? "Τηλέφωνο" : "Phone"}" class="rounded-xl border px-4 py-3"><select name="groupId" class="rounded-xl border px-4 py-3"><option value="">${el ? "Χωρίς ομάδα" : "No group"}</option>${groupOptions}</select><label class="rounded-xl border px-4 py-2 text-xs font-semibold text-[#655a70]">${el ? "Επιτρεπόμενα +1" : "Allowed plus-ones"}<input name="plusOneLimit" type="number" min="0" max="10" value="0" class="mt-1 w-full border-0 p-0 text-base text-[#2b174d]"></label><label class="flex items-center gap-2 rounded-xl border px-4 py-3 text-sm"><input name="ceremony" value="1" type="checkbox" checked>${el ? "Τελετή" : "Ceremony"}</label><label class="flex items-center gap-2 rounded-xl border px-4 py-3 text-sm"><input name="reception" value="1" type="checkbox" checked>${el ? "Δεξίωση" : "Reception"}</label><button class="rounded-xl bg-gradient-to-r from-[#7c3aed] to-[#f43f8f] px-5 py-3 font-bold text-white sm:col-span-2 lg:col-span-4">${el ? "Προσθήκη στη λίστα" : "Add to guest list"}</button></form></section><section class="mt-6"><div class="flex items-end justify-between gap-3"><div><p class="text-xs font-bold uppercase tracking-[.16em] text-[#7c3aed]">Seating overview</p><h2 class="mt-1 text-3xl text-[#2b174d]">${el ? "Τραπέζια" : "Tables"}</h2></div><span class="text-sm font-semibold text-[#756b82]">${guests.filter((guest) => guest.table_id).length}/${guests.length} ${el ? "τοποθετημένοι" : "assigned"}</span></div><div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">${tableCards || `<div class="rounded-2xl border border-dashed p-7 text-sm text-[#81758a]">${el ? "Δημιούργησε το πρώτο τραπέζι." : "Create the first table."}</div>`}</div></section><section class="mt-6 overflow-hidden rounded-[1.8rem] border border-[#e8e0f2] bg-white"><div class="flex flex-wrap items-center justify-between gap-3 p-5"><div><p class="text-xs font-bold uppercase tracking-[.16em] text-[#7c3aed]">Guest directory</p><h2 class="mt-1 text-2xl text-[#2b174d]">${guests.length} ${el ? "καλεσμένοι" : "guests"}</h2></div>${tables.length ? `<span class="text-xs text-[#756b82]">${el ? "Οι αλλαγές θέσης αποθηκεύονται ανά καλεσμένο." : "Seating changes save per guest."}</span>` : ""}</div><div class="overflow-x-auto"><table class="w-full min-w-[980px] text-left"><thead class="bg-[#f8f5ff] text-xs uppercase tracking-wide text-[#786e82]"><tr><th class="px-4 py-3">${el ? "Καλεσμένος" : "Guest"}</th><th class="px-4 py-3">${el ? "Επικοινωνία" : "Contact"}</th><th class="px-4 py-3">RSVP</th><th class="px-4 py-3">${el ? "Τραπέζι" : "Table"}</th><th class="px-4 py-3">${el ? "Πρόσκληση" : "Invitation"}</th></tr></thead><tbody>${guestRows || `<tr><td colspan="5" class="px-5 py-12 text-center text-[#81758a]">${el ? "Πρόσθεσε τους πρώτους καλεσμένους." : "Add your first guests."}</td></tr>`}</tbody></table></div></section></main><script>(()=>{const button=document.querySelector('[data-copy-fresh-link]');button?.addEventListener('click',async()=>{const input=document.getElementById('fresh-invite-link');if(!input)return;await navigator.clipboard.writeText(input.value);button.textContent=${JSON.stringify(el ? "Αντιγράφηκε" : "Copied")}})})()<\/script>${logoutScript(locale)}`;
  const pageGuestLabel = el ? "καλεσμένοι" : "guests";
  const assignedLabel = el ? "τοποθετημένοι" : "assigned";
  const enhancedBody = body
    .replace('<section class="mt-6 grid gap-5 xl:grid-cols-2">', `${directoryTools}<section class="mt-6 grid gap-5 xl:grid-cols-2">`)
    .replace(`<h2 class="mt-1 text-2xl text-[#2b174d]">${guests.length} ${pageGuestLabel}</h2>`, `<h2 class="mt-1 text-2xl text-[#2b174d]">${totalFiltered} ${pageGuestLabel}</h2>`)
    .replace(`<span class="text-sm font-semibold text-[#756b82]">${guests.filter((guest) => guest.table_id).length}/${guests.length} ${assignedLabel}</span>`, `<span class="text-sm font-semibold text-[#756b82]">${assignedGuestCount}/${totalGuests} ${assignedLabel}</span>`)
    .replace("</tbody></table></div></section></main>", `</tbody></table></div>${pagination}</section></main>`);
  return page(`${event.eventName} · Guests`, enhancedBody, { locale });
}

function guestEditPage(event: EventRow, locale: Locale, user: { name: string; email: string }, guest: EditableWeddingGuest, groups: WeddingGuestGroup[]) {
  const el = locale === "el";
  const groupOptions = groups.map((group) => `<option value="${esc(group.id)}" ${guest.group_id === group.id ? "selected" : ""}>${esc(group.name)}</option>`).join("");
  const body = `${eventHeader(locale, user)}<main class="mx-auto max-w-3xl p-4 pb-16 sm:p-6 lg:p-10"><a href="/dashboard/${encodeURIComponent(event.code)}/wedding/guests?lang=${locale}" class="text-sm font-semibold text-[#6d28d9]">← ${el ? "Πίσω στους καλεσμένους" : "Back to guests"}</a><section class="mt-6 rounded-[2rem] border border-[#e8e0f2] bg-white p-6 shadow-sm sm:p-8"><p class="text-xs font-bold uppercase tracking-[.18em] text-[#f43f8f]">Guest details</p><h1 class="mt-2 text-4xl text-[#2b174d]">${el ? "Επεξεργασία καλεσμένου" : "Edit guest"}</h1><form action="/api/account/events/${encodeURIComponent(event.code)}/wedding/guests/${esc(guest.id)}" method="post" class="mt-7 grid gap-4 sm:grid-cols-2"><input type="hidden" name="locale" value="${locale}"><label class="text-sm font-semibold">${el ? "Όνομα" : "First name"}<input name="firstName" required maxlength="80" value="${esc(guest.first_name)}" class="mt-2 w-full rounded-xl border px-4 py-3 font-normal"></label><label class="text-sm font-semibold">${el ? "Επώνυμο" : "Last name"}<input name="lastName" maxlength="80" value="${esc(guest.last_name)}" class="mt-2 w-full rounded-xl border px-4 py-3 font-normal"></label><label class="text-sm font-semibold">Email<input name="email" type="email" maxlength="254" value="${esc(guest.email)}" class="mt-2 w-full rounded-xl border px-4 py-3 font-normal"></label><label class="text-sm font-semibold">${el ? "Τηλέφωνο" : "Phone"}<input name="phone" type="tel" maxlength="40" value="${esc(guest.phone)}" class="mt-2 w-full rounded-xl border px-4 py-3 font-normal"></label><label class="text-sm font-semibold">${el ? "Ομάδα" : "Group"}<select name="groupId" class="mt-2 w-full rounded-xl border px-4 py-3 font-normal"><option value="">${el ? "Χωρίς ομάδα" : "No group"}</option>${groupOptions}</select></label><label class="text-sm font-semibold">${el ? "Επιτρεπόμενα +1" : "Allowed plus-ones"}<input name="plusOneLimit" type="number" min="0" max="10" value="${guest.plus_one_limit}" class="mt-2 w-full rounded-xl border px-4 py-3 font-normal"></label><label class="flex items-center gap-3 rounded-xl border px-4 py-3 text-sm"><input name="ceremony" value="1" type="checkbox" ${guest.invited_to_ceremony ? "checked" : ""}>${el ? "Πρόσκληση στην τελετή" : "Invited to ceremony"}</label><label class="flex items-center gap-3 rounded-xl border px-4 py-3 text-sm"><input name="reception" value="1" type="checkbox" ${guest.invited_to_reception ? "checked" : ""}>${el ? "Πρόσκληση στη δεξίωση" : "Invited to reception"}</label><button class="rounded-xl bg-gradient-to-r from-[#7c3aed] to-[#f43f8f] px-5 py-3 font-bold text-white sm:col-span-2">${el ? "Αποθήκευση αλλαγών" : "Save changes"}</button></form></section></main>${logoutScript(locale)}`;
  return page(`${event.eventName} · ${guest.first_name}`, body, { locale });
}

export const weddingPlanningRoutes = new Hono<{ Bindings: Bindings }>();

weddingPlanningRoutes.get("/dashboard/:code/wedding/guests", async (c) => {
  const locale = normalizeLocale(c.req.query("lang") ?? "en");
  const user = await currentUser(c);
  if (!user) return c.redirect(`/${locale}/login`);
  const event = await manageableWedding(c.env.DB, c.req.param("code"), user.id);
  if (!event) return c.text("Wedding event not found", 404);
  const query = String(c.req.query("q") ?? "").trim().slice(0, 80);
  const requestedPage = Math.max(1, Math.floor(Number(c.req.query("page")) || 1));
  const pageSize = 50;
  const searchValue = `%${escapedLike(query)}%`;
  const searchClause = query
    ? " AND (g.first_name LIKE ? ESCAPE '\\' OR g.last_name LIKE ? ESCAPE '\\' OR g.email LIKE ? ESCAPE '\\' OR g.phone LIKE ? ESCAPE '\\' OR COALESCE(gg.name,'') LIKE ? ESCAPE '\\')"
    : "";
  const searchBindings = query ? [searchValue, searchValue, searchValue, searchValue, searchValue] : [];
  const [groups, totalRow, filteredRow, assignedRow, tables] = await Promise.all([
    c.env.DB.prepare("SELECT id,name FROM event_wedding_guest_groups WHERE event_id=? ORDER BY name").bind(event.id).all<WeddingGuestGroup>(),
    c.env.DB.prepare("SELECT COUNT(*) count FROM event_wedding_guests WHERE event_id=?").bind(event.id).first<{ count: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) count FROM event_wedding_guests g
      LEFT JOIN event_wedding_guest_groups gg ON gg.id=g.group_id WHERE g.event_id=?${searchClause}`)
      .bind(event.id, ...searchBindings).first<{ count: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) count FROM event_wedding_seat_assignments a
      JOIN event_wedding_guests g ON g.id=a.guest_id WHERE g.event_id=?`).bind(event.id).first<{ count: number }>(),
    c.env.DB.prepare(`SELECT t.id,t.name,t.shape,t.capacity,COALESCE(SUM(g.party_size),0) assigned_count
      FROM event_wedding_tables t LEFT JOIN event_wedding_seat_assignments a ON a.table_id=t.id
      LEFT JOIN event_wedding_guests g ON g.id=a.guest_id
      WHERE t.event_id=? GROUP BY t.id ORDER BY t.sort_order,t.name`).bind(event.id).all<WeddingTable>(),
  ]);
  const totalFiltered = Number(filteredRow?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const pageNumber = Math.min(requestedPage, totalPages);
  const freshGuestId = c.req.query("guest") ?? undefined;
  const [guests, freshGuest] = await Promise.all([
    c.env.DB.prepare(`SELECT g.id,g.group_id,gg.name group_name,g.first_name,g.last_name,g.email,g.phone,
      g.plus_one_limit,g.rsvp_status,g.party_size,g.dietary_notes,a.table_id,t.name table_name
      FROM event_wedding_guests g
      LEFT JOIN event_wedding_guest_groups gg ON gg.id=g.group_id
      LEFT JOIN event_wedding_seat_assignments a ON a.guest_id=g.id
      LEFT JOIN event_wedding_tables t ON t.id=a.table_id
      WHERE g.event_id=?${searchClause} ORDER BY COALESCE(gg.name,''),g.last_name,g.first_name,g.id LIMIT ? OFFSET ?`)
      .bind(event.id, ...searchBindings, pageSize, (pageNumber - 1) * pageSize).all<WeddingGuest>(),
    freshGuestId
      ? c.env.DB.prepare("SELECT id,first_name,last_name FROM event_wedding_guests WHERE id=? AND event_id=?")
        .bind(freshGuestId, event.id).first<Pick<WeddingGuest, "id" | "first_name" | "last_name">>()
      : Promise.resolve(null),
  ]);
  if (query) console.log(JSON.stringify({ event: "wedding_guest_search_used", event_id: event.id, result_count: totalFiltered }));
  return c.html(guestPlannerPage({
    event,
    locale,
    user,
    groups: groups.results,
    guests: guests.results,
    tables: tables.results,
    origin: new URL(c.req.url).origin,
    query,
    pageNumber,
    totalPages,
    totalGuests: Number(totalRow?.count ?? 0),
    totalFiltered,
    assignedGuestCount: Number(assignedRow?.count ?? 0),
    importedCount: Math.max(0, Math.floor(Number(c.req.query("imported")) || 0)),
    freshGuest,
    freshGuestId,
    freshToken: c.req.query("invite") ?? undefined,
  }));
});

weddingPlanningRoutes.get("/api/account/events/:code/wedding/guests/export", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await manageableWedding(c.env.DB, c.req.param("code"), user.id);
  if (!event) return c.text("Wedding event not found", 404);
  const guests = await c.env.DB.prepare(`SELECT g.first_name,g.last_name,g.email,g.phone,gg.name group_name,
    g.plus_one_limit,g.invited_to_ceremony,g.invited_to_reception
    FROM event_wedding_guests g LEFT JOIN event_wedding_guest_groups gg ON gg.id=g.group_id
    WHERE g.event_id=? ORDER BY COALESCE(gg.name,''),g.last_name,g.first_name,g.id`).bind(event.id).all<{
      first_name: string;
      last_name: string;
      email: string;
      phone: string;
      group_name: string | null;
      plus_one_limit: number;
      invited_to_ceremony: number;
      invited_to_reception: number;
    }>();
  const filename = `memboux-${event.code.replace(/[^a-z0-9-]/gi, "-")}-guests.csv`;
  console.log(JSON.stringify({ event: "wedding_guest_csv_exported", event_id: event.id, exported_count: guests.results.length }));
  return c.body(weddingGuestCsv(guests.results), 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store",
  });
});

weddingPlanningRoutes.post("/api/account/events/:code/wedding/guests/import", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await manageableWedding(c.env.DB, c.req.param("code"), user.id);
  if (!event) return c.text("Wedding event not found", 404);
  const contentLength = Number(c.req.header("content-length") ?? 0);
  if (contentLength > WEDDING_GUEST_IMPORT_MAX_BYTES + 100_000) return c.text("CSV upload is too large.", 413);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  const file = body.guestFile;
  if (!(file instanceof File)) return c.text(label(locale, "Επίλεξε ένα αρχείο CSV.", "Choose a CSV file."), 400);
  if (file.size > WEDDING_GUEST_IMPORT_MAX_BYTES)
    return c.text(label(locale, "Το CSV δεν μπορεί να ξεπερνά το 1 MB.", "The CSV cannot exceed 1 MB."), 413);

  let rows;
  try {
    rows = parseWeddingGuestCsv(await file.text());
  } catch (error) {
    return c.text(label(locale, "Μη έγκυρο CSV: ", "Invalid CSV: ") + (error instanceof Error ? error.message : "Unknown error"), 400);
  }

  const emailChunks = chunks(rows.map((row) => row.email).filter(Boolean), 90);
  const [existingGuestBatches, existingGroups] = await Promise.all([
    Promise.all(emailChunks.map((emails) => c.env.DB.prepare(
      `SELECT email FROM event_wedding_guests WHERE event_id=? AND email IN (${emails.map(() => "?").join(",")})`,
    ).bind(event.id, ...emails).all<{ email: string }>())),
    c.env.DB.prepare("SELECT id,name FROM event_wedding_guest_groups WHERE event_id=?").bind(event.id).all<WeddingGuestGroup>(),
  ]);
  const existingEmails = new Set(existingGuestBatches.flatMap((batch) => batch.results).map((guest) => guest.email.toLowerCase()));
  const duplicate = rows.find((row) => row.email && existingEmails.has(row.email));
  if (duplicate)
    return c.text(label(locale, `Το email στη γραμμή ${duplicate.line} υπάρχει ήδη στη λίστα.`, `The email on line ${duplicate.line} is already on the guest list.`), 409);

  const now = Date.now();
  const groupIds = new Map(existingGroups.results.map((group) => [group.name.trim().toLowerCase(), group.id]));
  const newGroups: WeddingGuestGroup[] = [];
  for (const row of rows) {
    const key = row.groupName.trim().toLowerCase();
    if (!key || groupIds.has(key)) continue;
    const id = crypto.randomUUID();
    groupIds.set(key, id);
    newGroups.push({ id, name: row.groupName });
  }
  const groupStatements = chunks(newGroups, 20).map((groupBatch) => c.env.DB.prepare(
    `INSERT INTO event_wedding_guest_groups (id,event_id,name,created_at,updated_at) VALUES ${groupBatch.map(() => "(?,?,?,?,?)").join(",")}`,
  ).bind(...groupBatch.flatMap((group) => [group.id, event.id, group.name, now, now])));
  const guestStatements = chunks(rows, 8).map((guestBatch) => c.env.DB.prepare(`INSERT INTO event_wedding_guests
    (id,event_id,group_id,first_name,last_name,email,phone,plus_one_limit,invited_to_ceremony,invited_to_reception,created_at,updated_at)
    VALUES ${guestBatch.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?)").join(",")}`).bind(...guestBatch.flatMap((row) => [
      crypto.randomUUID(), event.id, row.groupName ? groupIds.get(row.groupName.trim().toLowerCase()) ?? null : null,
      row.firstName, row.lastName, row.email, row.phone, row.plusOneLimit, row.ceremony ? 1 : 0, row.reception ? 1 : 0, now, now,
    ])));
  try {
    await c.env.DB.batch([...groupStatements, ...guestStatements]);
  } catch (error) {
    if (/event_wedding_guests\.event_id.*email|idx_wedding_guests_event_email/i.test(error instanceof Error ? error.message : String(error)))
      return c.text(label(locale, "Ένα email υπάρχει ήδη στη λίστα. Δεν εισήχθη κανένας καλεσμένος.", "An email is already on the guest list. No guests were imported."), 409);
    throw error;
  }
  console.log(JSON.stringify({ event: "wedding_guest_csv_imported", event_id: event.id, imported_count: rows.length }));
  return c.redirect(`/dashboard/${event.code}/wedding/guests?lang=${locale}&imported=${rows.length}`, 303);
});

weddingPlanningRoutes.get("/dashboard/:code/wedding/guests/:guestId/edit", async (c) => {
  const locale = normalizeLocale(c.req.query("lang") ?? "en");
  const user = await currentUser(c);
  if (!user) return c.redirect(`/${locale}/login`);
  const event = await manageableWedding(c.env.DB, c.req.param("code"), user.id);
  if (!event) return c.text("Wedding event not found", 404);
  const [guest, groups] = await Promise.all([
    c.env.DB.prepare(`SELECT g.*,gg.name group_name,NULL table_id,NULL table_name
      FROM event_wedding_guests g LEFT JOIN event_wedding_guest_groups gg ON gg.id=g.group_id
      WHERE g.id=? AND g.event_id=?`).bind(c.req.param("guestId"), event.id).first<EditableWeddingGuest>(),
    c.env.DB.prepare("SELECT id,name FROM event_wedding_guest_groups WHERE event_id=? ORDER BY name")
      .bind(event.id).all<WeddingGuestGroup>(),
  ]);
  if (!guest) return c.text("Guest not found", 404);
  return c.html(guestEditPage(event, locale, user, guest, groups.results));
});

weddingPlanningRoutes.post("/api/account/events/:code/wedding/guest-groups", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await manageableWedding(c.env.DB, c.req.param("code"), user.id);
  if (!event) return c.text("Wedding event not found", 404);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  const name = String(body.name ?? "").trim().slice(0, 100);
  if (!name) return c.text("Group name required", 400);
  const now = Date.now();
  await c.env.DB.prepare("INSERT INTO event_wedding_guest_groups (id,event_id,name,created_at,updated_at) VALUES (?,?,?,?,?)")
    .bind(crypto.randomUUID(), event.id, name, now, now).run();
  return c.redirect(`/dashboard/${event.code}/wedding/guests?lang=${locale}`, 303);
});

weddingPlanningRoutes.post("/api/account/events/:code/wedding/guests", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await manageableWedding(c.env.DB, c.req.param("code"), user.id);
  if (!event) return c.text("Wedding event not found", 404);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  const firstName = String(body.firstName ?? "").trim().slice(0, 80);
  const lastName = String(body.lastName ?? "").trim().slice(0, 80);
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 254);
  const phone = String(body.phone ?? "").trim().slice(0, 40);
  const groupId = String(body.groupId ?? "").trim() || null;
  const plusOneLimit = Math.min(10, Math.max(0, Number(body.plusOneLimit) || 0));
  if (!firstName || !validEmail(email) || (!email && !phone)) {
    return c.text(label(locale, "Συμπλήρωσε όνομα και email ή τηλέφωνο.", "Add a name and an email or phone."), 400);
  }
  if (groupId) {
    const group = await c.env.DB.prepare("SELECT id FROM event_wedding_guest_groups WHERE id=? AND event_id=?").bind(groupId, event.id).first();
    if (!group) return c.text("Invalid group", 400);
  }
  const now = Date.now();
  try {
    await c.env.DB.prepare(`INSERT INTO event_wedding_guests
      (id,event_id,group_id,first_name,last_name,email,phone,plus_one_limit,invited_to_ceremony,invited_to_reception,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), event.id, groupId, firstName, lastName, email, phone, plusOneLimit, body.ceremony === "1" ? 1 : 0, body.reception === "1" ? 1 : 0, now, now).run();
  } catch (error) {
    if (/event_wedding_guests\.event_id.*email|idx_wedding_guests_event_email/i.test(error instanceof Error ? error.message : String(error)))
      return c.text(label(locale, "Αυτό το email υπάρχει ήδη στη λίστα.", "That email is already on the guest list."), 409);
    throw error;
  }
  return c.redirect(`/dashboard/${event.code}/wedding/guests?lang=${locale}`, 303);
});

weddingPlanningRoutes.post("/api/account/events/:code/wedding/guests/:guestId", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await manageableWedding(c.env.DB, c.req.param("code"), user.id);
  if (!event) return c.text("Wedding event not found", 404);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  const firstName = String(body.firstName ?? "").trim().slice(0, 80);
  const lastName = String(body.lastName ?? "").trim().slice(0, 80);
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 254);
  const phone = String(body.phone ?? "").trim().slice(0, 40);
  const groupId = String(body.groupId ?? "").trim() || null;
  const plusOneLimit = Math.min(10, Math.max(0, Number(body.plusOneLimit) || 0));
  if (!firstName || !validEmail(email) || (!email && !phone))
    return c.text(label(locale, "Συμπλήρωσε όνομα και email ή τηλέφωνο.", "Add a name and an email or phone."), 400);
  if (groupId && !(await c.env.DB.prepare("SELECT id FROM event_wedding_guest_groups WHERE id=? AND event_id=?").bind(groupId, event.id).first()))
    return c.text("Invalid group", 400);
  try {
    const result = await c.env.DB.prepare(`UPDATE event_wedding_guests SET group_id=?,first_name=?,last_name=?,email=?,phone=?,
      plus_one_limit=?,party_size=MIN(party_size,?),invited_to_ceremony=?,invited_to_reception=?,updated_at=? WHERE id=? AND event_id=?`)
      .bind(groupId, firstName, lastName, email, phone, plusOneLimit, 1 + plusOneLimit, body.ceremony === "1" ? 1 : 0, body.reception === "1" ? 1 : 0, Date.now(), c.req.param("guestId"), event.id).run();
    if (result.meta.changes !== 1) return c.text("Guest not found", 404);
  } catch (error) {
    if (/event_wedding_guests\.event_id.*email|idx_wedding_guests_event_email/i.test(error instanceof Error ? error.message : String(error)))
      return c.text(label(locale, "Αυτό το email υπάρχει ήδη στη λίστα.", "That email is already on the guest list."), 409);
    throw error;
  }
  return c.redirect(`/dashboard/${event.code}/wedding/guests?lang=${locale}`, 303);
});

weddingPlanningRoutes.post("/api/account/events/:code/wedding/guests/:guestId/invite-link", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await manageableWedding(c.env.DB, c.req.param("code"), user.id);
  if (!event) return c.text("Wedding event not found", 404);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const result = await c.env.DB.prepare("UPDATE event_wedding_guests SET invitation_token_hash=?,invitation_created_at=?,updated_at=? WHERE id=? AND event_id=?")
    .bind(await sha256(token), Date.now(), Date.now(), c.req.param("guestId"), event.id).run();
  if (result.meta.changes !== 1) return c.text("Guest not found", 404);
  return c.redirect(`/dashboard/${event.code}/wedding/guests?lang=${locale}&guest=${encodeURIComponent(c.req.param("guestId"))}&invite=${encodeURIComponent(token)}`, 303);
});

weddingPlanningRoutes.post("/api/account/events/:code/wedding/guests/:guestId/delete", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await manageableWedding(c.env.DB, c.req.param("code"), user.id);
  if (!event) return c.text("Wedding event not found", 404);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM event_rsvps WHERE wedding_guest_id=? AND event_id=?").bind(c.req.param("guestId"), event.id),
    c.env.DB.prepare("DELETE FROM event_wedding_guests WHERE id=? AND event_id=?").bind(c.req.param("guestId"), event.id),
  ]);
  return c.redirect(`/dashboard/${event.code}/wedding/guests?lang=${locale}`, 303);
});

weddingPlanningRoutes.post("/api/account/events/:code/wedding/tables", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await manageableWedding(c.env.DB, c.req.param("code"), user.id);
  if (!event) return c.text("Wedding event not found", 404);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  const name = String(body.name ?? "").trim().slice(0, 80);
  const shape = ["round", "rectangle", "oval", "custom"].includes(String(body.shape)) ? String(body.shape) : "round";
  const capacity = Math.min(100, Math.max(1, Number(body.capacity) || 10));
  if (!name) return c.text("Table name required", 400);
  const now = Date.now();
  await c.env.DB.prepare("INSERT INTO event_wedding_tables (id,event_id,name,shape,capacity,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), event.id, name, shape, capacity, now, now).run();
  return c.redirect(`/dashboard/${event.code}/wedding/guests?lang=${locale}`, 303);
});

weddingPlanningRoutes.post("/api/account/events/:code/wedding/seating", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await manageableWedding(c.env.DB, c.req.param("code"), user.id);
  if (!event) return c.text("Wedding event not found", 404);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  const guestId = String(body.guestId ?? "");
  const tableId = String(body.tableId ?? "");
  const guest = await c.env.DB.prepare("SELECT id,party_size,rsvp_status FROM event_wedding_guests WHERE id=? AND event_id=?")
    .bind(guestId, event.id).first<{ id: string; party_size: number; rsvp_status: string }>();
  if (!guest) return c.text("Guest not found", 404);
  if (!tableId) {
    await c.env.DB.prepare("DELETE FROM event_wedding_seat_assignments WHERE guest_id=?").bind(guestId).run();
  } else {
    if (guest.rsvp_status === "no") return c.text(label(locale, "Ο καλεσμένος έχει απαντήσει ότι δεν θα παρευρεθεί.", "This guest has declined the invitation."), 409);
    const table = await c.env.DB.prepare(`SELECT t.capacity,COALESCE(SUM(g.party_size),0) assigned
      FROM event_wedding_tables t LEFT JOIN event_wedding_seat_assignments a ON a.table_id=t.id AND a.guest_id<>?
      LEFT JOIN event_wedding_guests g ON g.id=a.guest_id
      WHERE t.id=? AND t.event_id=? GROUP BY t.id`).bind(guestId, tableId, event.id).first<{ capacity: number; assigned: number }>();
    if (!table) return c.text("Table not found", 404);
    if (table.assigned + guest.party_size > table.capacity) return c.text(label(locale, "Δεν υπάρχουν αρκετές θέσεις σε αυτό το τραπέζι.", "There are not enough seats at this table."), 409);
    await c.env.DB.prepare(`INSERT INTO event_wedding_seat_assignments (guest_id,table_id,seat_number,assigned_at)
      VALUES (?,?,NULL,?) ON CONFLICT(guest_id) DO UPDATE SET table_id=excluded.table_id,seat_number=NULL,assigned_at=excluded.assigned_at`)
      .bind(guestId, tableId, Date.now()).run();
  }
  return c.redirect(`/dashboard/${event.code}/wedding/guests?lang=${locale}`, 303);
});

weddingPlanningRoutes.get("/wedding/:code/invite/:token", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event || event.event_type !== "wedding") return c.text("Invitation not found", 404);
  if (Date.now() > event.expires_at) return c.text("Invitation expired", 410);
  const locale = normalizeLocale(c.req.query("lang") ?? event.default_locale);
  const [profile, access, guest] = await Promise.all([
    c.env.DB.prepare("SELECT publish_status FROM event_wedding_profiles WHERE event_id=?").bind(event.id).first<{ publish_status: string }>(),
    getEventAccess(c.env.DB, event.id),
    c.env.DB.prepare("SELECT id,first_name,last_name,email,plus_one_limit,rsvp_status,party_size,dietary_notes FROM event_wedding_guests WHERE event_id=? AND invitation_token_hash=?")
      .bind(event.id, await sha256(c.req.param("token"))).first<Pick<WeddingGuest, "id" | "first_name" | "last_name" | "email" | "plus_one_limit" | "rsvp_status" | "party_size" | "dietary_notes">>(),
  ]);
  if (!guest || profile?.publish_status !== "published" || !eventAccessAllows(access, "guest_access")) return c.text("Invitation not available", 404);
  const el = locale === "el";
  const maxParty = 1 + guest.plus_one_limit;
  const responseNotice = c.req.query("rsvp") === "sent" ? `<p class="mt-5 rounded-xl bg-emerald-50 p-4 font-semibold text-emerald-800">${el ? "Η απάντησή σου αποθηκεύτηκε." : "Your response was saved."}</p>` : "";
  const html = `<main class="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#f8f5ff] via-white to-[#fdf2f8] p-5"><section class="w-full max-w-xl rounded-[2rem] border border-white/70 bg-white p-6 shadow-2xl sm:p-9"><p class="text-xs font-bold uppercase tracking-[.2em] text-[#f43f8f]">Memboux Wedding</p><h1 class="mt-3 text-4xl text-[#2b174d]">${el ? "Πρόσκληση για" : "Invitation for"} ${esc(`${guest.first_name} ${guest.last_name}`.trim())}</h1><p class="mt-3 text-[#6f657c]">${esc(event.eventName)}</p>${responseNotice}<form action="/api/gallery/${encodeURIComponent(event.code)}/rsvp" method="post" class="mt-7 grid gap-4"><input type="hidden" name="locale" value="${locale}"><input type="hidden" name="invitationToken" value="${esc(c.req.param("token"))}"><label class="text-sm font-semibold">${el ? "Απάντηση" : "Response"}<select name="response" required class="mt-2 w-full rounded-xl border px-4 py-3"><option value="yes" ${guest.rsvp_status === "yes" ? "selected" : ""}>${el ? "Θα παρευρεθώ" : "Attending"}</option><option value="maybe" ${guest.rsvp_status === "maybe" ? "selected" : ""}>${el ? "Ίσως" : "Maybe"}</option><option value="no" ${guest.rsvp_status === "no" ? "selected" : ""}>${el ? "Δεν θα παρευρεθώ" : "Decline"}</option></select></label><label class="text-sm font-semibold">${el ? "Αριθμός ατόμων" : "Party size"}<input name="guestCount" type="number" min="1" max="${maxParty}" value="${Math.min(guest.party_size, maxParty)}" class="mt-2 w-full rounded-xl border px-4 py-3"></label><label class="text-sm font-semibold">${el ? "Διατροφικές ανάγκες" : "Dietary requirements"}<textarea name="dietaryNotes" maxlength="300" rows="3" class="mt-2 w-full rounded-xl border px-4 py-3">${esc(guest.dietary_notes)}</textarea></label><label class="text-sm font-semibold">${el ? "Μήνυμα" : "Message"}<textarea name="message" maxlength="500" rows="3" class="mt-2 w-full rounded-xl border px-4 py-3"></textarea></label><button class="rounded-xl bg-gradient-to-r from-[#7c3aed] to-[#f43f8f] px-5 py-3 font-bold text-white">${el ? "Αποστολή RSVP" : "Send RSVP"}</button></form><a href="/wedding/${encodeURIComponent(event.code)}?lang=${locale}" class="mt-5 block text-center text-sm font-semibold text-[#6d28d9]">${el ? "Άνοιγμα wedding website" : "Open wedding website"}</a></section></main>`;
  return c.html(page(`${event.eventName} · RSVP`, html, { locale }));
});
