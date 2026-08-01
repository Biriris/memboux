import { describe, expect, it } from "vitest";
import { parseWeddingGuestCsv, weddingGuestCsv, WEDDING_GUEST_IMPORT_MAX_ROWS } from "../src/wedding-guests-csv";

const header = "first_name,last_name,email,phone,group,plus_one_limit,ceremony,reception";

describe("wedding guest CSV", () => {
  it("parses BOM, quoted values, escaped quotes, CRLF, and localized booleans", () => {
    const rows = parseWeddingGuestCsv(`\uFEFF${header}\r\n"Jamie, Jr.","O""Neil",JAMIE@example.com,,"Close, Friends",2,ναι,όχι\r\n`);

    expect(rows).toEqual([{
      line: 2,
      firstName: "Jamie, Jr.",
      lastName: 'O"Neil',
      email: "jamie@example.com",
      phone: "",
      groupName: "Close, Friends",
      plusOneLimit: 2,
      ceremony: true,
      reception: false,
    }]);
  });

  it.each([
    ["missing columns", "first_name,email\nJamie,jamie@example.com", "Missing CSV columns"],
    ["missing contact", `${header}\nJamie,,,,,0,yes,yes`, "add an email or phone"],
    ["invalid email", `${header}\nJamie,,bad-email,,Friends,0,yes,yes`, "invalid email"],
    ["invalid plus one", `${header}\nJamie,,jamie@example.com,,Friends,11,yes,yes`, "plus_one_limit"],
    ["duplicate email", `${header}\nJamie,,same@example.com,,Friends,0,yes,yes\nAlex,,SAME@example.com,,Friends,0,yes,yes`, "duplicate email"],
    ["unclosed quote", `${header}\n"Jamie,,jamie@example.com,,Friends,0,yes,yes`, "unclosed quoted value"],
  ])("rejects %s", (_name, csv, expected) => {
    expect(() => parseWeddingGuestCsv(csv)).toThrow(expected);
  });

  it("enforces the import row limit", () => {
    const guests = Array.from({ length: WEDDING_GUEST_IMPORT_MAX_ROWS + 1 }, (_, index) =>
      `Guest ${index},,guest-${index}@example.com,,Friends,0,yes,yes`).join("\n");
    expect(() => parseWeddingGuestCsv(`${header}\n${guests}`)).toThrow(`up to ${WEDDING_GUEST_IMPORT_MAX_ROWS}`);
  });

  it("exports the import template safely and escapes spreadsheet formulas", () => {
    const csv = weddingGuestCsv([{
      first_name: "=HYPERLINK(\"https://example.com\")",
      last_name: "O'Neil, Jr.",
      email: "jamie@example.com",
      phone: "+3012345",
      group_name: "Friends",
      plus_one_limit: 1,
      invited_to_ceremony: 1,
      invited_to_reception: 0,
    }]);

    expect(csv).toMatch(/^\uFEFFfirst_name,last_name,email,phone,group,plus_one_limit,ceremony,reception\r\n/);
    expect(csv).toContain('"\'=HYPERLINK(""https://example.com"")"');
    expect(csv).toContain("'+3012345");
    expect(csv).toContain('"O\'Neil, Jr."');
    expect(csv).toContain(",1,yes,no\r\n");
    expect(parseWeddingGuestCsv(csv)[0]?.phone).toBe("+3012345");
  });
});
