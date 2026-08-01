import type { EventRow } from "../domain";
import type { Locale } from "../i18n";
import { esc } from "../utils";
import { page } from "./shared";

export type SeatingPrintGuest = {
  first_name: string;
  last_name: string;
  party_size: number;
  rsvp_status: "pending" | "yes" | "no" | "maybe";
  table_name: string | null;
};

export function weddingSeatingPrintPage(
  event: EventRow,
  locale: Locale,
  guests: SeatingPrintGuest[],
  generatedAt: number,
) {
  const el = locale === "el";
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  const activeGuests = guests
    .filter((guest) => guest.rsvp_status !== "no")
    .sort((left, right) => collator.compare(left.last_name, right.last_name)
      || collator.compare(left.first_name, right.first_name));
  const rows = activeGuests.map((guest) => `<tr><td><strong>${esc(guest.last_name || "—")}</strong></td><td>${esc(guest.first_name || "—")}</td><td>${guest.party_size}</td><td>${esc(guest.table_name ?? (el ? "Χωρίς τραπέζι" : "Unassigned"))}</td></tr>`).join("");
  const peopleCount = activeGuests.reduce((sum, guest) => sum + guest.party_size, 0);
  const body = `<main class="seating-print-sheet mx-auto max-w-6xl p-5 sm:p-8"><div class="seating-print-actions flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#2b174d] p-4 text-white"><a href="/dashboard/${encodeURIComponent(event.code)}/wedding/guests?lang=${locale}" class="font-semibold">← ${el ? "Πίσω στους καλεσμένους" : "Back to guests"}</a><button type="button" onclick="window.print()" class="rounded-xl bg-white px-5 py-3 font-bold text-[#2b174d]">${el ? "Εκτύπωση / Αποθήκευση PDF" : "Print / Save as PDF"}</button></div><header class="mt-8 border-b-2 border-[#2b174d] pb-5"><p class="text-xs font-bold uppercase tracking-[.18em] text-[#7c3aed]">Memboux · ${el ? "Αλφαβητική λίστα καλεσμένων" : "Alphabetical guest list"}</p><h1 class="mt-2 text-4xl text-[#2b174d]">${esc(event.eventName)}</h1><div class="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-[#655a70]"><span>${el ? "Ημερομηνία" : "Date"}: ${esc(event.event_start_date ?? "—")}</span><span>${el ? "Τοποθεσία" : "Location"}: ${esc(event.location ?? "—")}</span><span>${el ? "Καλεσμένοι" : "Invitations"}: ${activeGuests.length}</span><span>${el ? "Άτομα" : "People"}: ${peopleCount}</span><span>${el ? "Εκδόθηκε" : "Generated"}: ${esc(new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(generatedAt)))}</span></div></header><section class="seating-print-section mt-6 rounded-2xl border border-[#ded7e8] bg-white p-5"><div class="overflow-hidden rounded-xl border"><table class="seating-print-table w-full text-left text-sm"><thead class="bg-[#f5f1fb]"><tr><th>${el ? "Επώνυμο" : "Last name"}</th><th>${el ? "Όνομα" : "First name"}</th><th>${el ? "Άτομα" : "People"}</th><th>${el ? "Τραπέζι" : "Table"}</th></tr></thead><tbody>${rows || `<tr><td colspan="4">${el ? "Δεν υπάρχουν καταχωρήσεις." : "No entries."}</td></tr>`}</tbody></table></div></section><footer class="mt-6 border-t pt-4 text-xs text-[#756b82]">${el ? "Αλφαβητική λίστα για χρήση από τους ταξιθέτες. Δεν περιλαμβάνονται email ή τηλέφωνα καλεσμένων." : "Alphabetical list for venue ushers. Guest email addresses and phone numbers are not included."}</footer></main>`;
  return page(`${event.eventName} · Seating plan`, body, { locale, suppressWidgets: true });
}
