import type { EventRow } from "../domain";
import type { Locale } from "../i18n";
import { esc } from "../utils";
import { page } from "./shared";

export type SeatingPrintGuest = {
  first_name: string;
  last_name: string;
  group_name: string | null;
  party_size: number;
  rsvp_status: "pending" | "yes" | "no" | "maybe";
  dietary_notes: string;
  table_id: string | null;
};

export type SeatingPrintTable = {
  id: string;
  name: string;
  capacity: number;
};

export function weddingSeatingPrintPage(
  event: EventRow,
  locale: Locale,
  tables: SeatingPrintTable[],
  guests: SeatingPrintGuest[],
  generatedAt: number,
) {
  const el = locale === "el";
  const status = (value: SeatingPrintGuest["rsvp_status"]) => value === "yes"
    ? (el ? "Έρχεται" : "Attending")
    : value === "maybe" ? (el ? "Ίσως" : "Maybe")
      : value === "pending" ? (el ? "Αναμονή" : "Pending") : (el ? "Δεν έρχεται" : "Declined");
  const rows = (items: SeatingPrintGuest[]) => items.map((guest, index) => `<tr><td>${index + 1}</td><td><strong>${esc(`${guest.first_name} ${guest.last_name}`.trim())}</strong></td><td>${esc(guest.group_name ?? "—")}</td><td>${guest.party_size}</td><td>${esc(status(guest.rsvp_status))}</td><td>${esc(guest.dietary_notes || "—")}</td></tr>`).join("");
  const section = (title: string, items: SeatingPrintGuest[], capacity?: number) => `<section class="seating-print-section break-inside-avoid rounded-2xl border border-[#ded7e8] bg-white p-5"><div class="flex items-end justify-between gap-4"><h2 class="text-2xl text-[#2b174d]">${esc(title)}</h2><strong class="text-sm text-[#756b82]">${items.reduce((sum, guest) => sum + guest.party_size, 0)}${capacity ? ` / ${capacity}` : ""} ${el ? "άτομα" : "people"}</strong></div><div class="mt-4 overflow-hidden rounded-xl border"><table class="seating-print-table w-full text-left text-xs"><thead class="bg-[#f5f1fb]"><tr><th>#</th><th>${el ? "Καλεσμένος" : "Guest"}</th><th>${el ? "Ομάδα" : "Group"}</th><th>${el ? "Άτομα" : "Party"}</th><th>RSVP</th><th>${el ? "Διατροφικές ανάγκες" : "Dietary notes"}</th></tr></thead><tbody>${rows(items) || `<tr><td colspan="6">${el ? "Δεν υπάρχουν καταχωρήσεις." : "No entries."}</td></tr>`}</tbody></table></div></section>`;
  const activeGuests = guests.filter((guest) => guest.rsvp_status !== "no");
  const tableSections = tables.map((table) => section(table.name, activeGuests.filter((guest) => guest.table_id === table.id), table.capacity)).join("");
  const unassigned = activeGuests.filter((guest) => !guest.table_id);
  const body = `<main class="seating-print-sheet mx-auto max-w-6xl p-5 sm:p-8"><div class="seating-print-actions flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#2b174d] p-4 text-white"><a href="/dashboard/${encodeURIComponent(event.code)}/wedding/guests?lang=${locale}" class="font-semibold">← ${el ? "Πίσω στους καλεσμένους" : "Back to guests"}</a><button type="button" onclick="window.print()" class="rounded-xl bg-white px-5 py-3 font-bold text-[#2b174d]">${el ? "Εκτύπωση / Αποθήκευση PDF" : "Print / Save as PDF"}</button></div><header class="mt-8 border-b-2 border-[#2b174d] pb-5"><p class="text-xs font-bold uppercase tracking-[.18em] text-[#7c3aed]">Memboux · Seating plan</p><h1 class="mt-2 text-4xl text-[#2b174d]">${esc(event.eventName)}</h1><div class="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-[#655a70]"><span>${el ? "Ημερομηνία" : "Date"}: ${esc(event.event_start_date ?? "—")}</span><span>${el ? "Τοποθεσία" : "Location"}: ${esc(event.location ?? "—")}</span><span>${el ? "Εκδόθηκε" : "Generated"}: ${esc(new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(generatedAt)))}</span></div></header><div class="mt-6 grid gap-5">${tableSections}${section(el ? "Χωρίς ανάθεση τραπεζιού" : "Unassigned guests", unassigned)}</div><footer class="mt-6 border-t pt-4 text-xs text-[#756b82]">${el ? "Για χρήση από το προσωπικό του χώρου. Δεν περιλαμβάνονται email ή τηλέφωνα καλεσμένων." : "For venue staff use. Guest email addresses and phone numbers are not included."}</footer></main>`;
  return page(`${event.eventName} · Seating plan`, body, { locale, suppressWidgets: true });
}
