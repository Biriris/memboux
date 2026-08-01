import { describe, expect, it } from "vitest";
import type { EventRow } from "../src/domain";
import { weddingSeatingPrintPage, type SeatingPrintGuest } from "../src/views/wedding-seating-print";

const event = {
  id: "event-1",
  code: "ABC123",
  eventName: "Η βάπτιση της Μαρίας",
  event_start_date: "2026-09-12",
  location: "Αθήνα",
} as EventRow;

const guests: SeatingPrintGuest[] = [
  { first_name: "Νίκος", last_name: "Παπαδόπουλος", party_size: 2, rsvp_status: "yes", table_name: "Τραπέζι 8" },
  { first_name: "Μαρία", last_name: "Αλεξίου", party_size: 3, rsvp_status: "yes", table_name: "Τραπέζι 2" },
  { first_name: "Άννα", last_name: "Αλεξίου", party_size: 1, rsvp_status: "maybe", table_name: null },
  { first_name: "Πέτρος", last_name: "Βασιλείου", party_size: 1, rsvp_status: "no", table_name: "Τραπέζι 1" },
];

describe("weddingSeatingPrintPage", () => {
  it("renders the usher list by surname with only the requested columns", () => {
    const html = weddingSeatingPrintPage(event, "el", guests, Date.UTC(2026, 7, 1, 12), "Κτήμα Δεξιώσεων");

    expect(html).toContain("Αλφαβητική λίστα καλεσμένων");
    expect(html).toContain("<th>Επώνυμο</th><th>Όνομα</th><th>Άτομα</th><th>Τραπέζι</th>");
    expect(html.indexOf("<td>Άννα</td>")).toBeLessThan(html.indexOf("<td>Μαρία</td>"));
    expect(html.indexOf("<td>Μαρία</td>")).toBeLessThan(html.indexOf("<td>Νίκος</td>"));
    expect(html).toContain("Χωρίς τραπέζι");
    expect(html).not.toContain("Πέτρος");
    expect(html).not.toContain("RSVP");
    expect(html).not.toContain("Διατροφικές ανάγκες");
    expect(html).toContain("Κτήμα Δεξιώσεων");
    expect(html).not.toContain("Αθήνα");
  });
});
