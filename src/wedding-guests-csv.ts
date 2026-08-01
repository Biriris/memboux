export const WEDDING_GUEST_IMPORT_MAX_BYTES = 1_000_000;
export const WEDDING_GUEST_IMPORT_MAX_ROWS = 200;

export type WeddingGuestImportRow = {
  line: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  groupName: string;
  plusOneLimit: number;
  ceremony: boolean;
  reception: boolean;
};

const requiredHeaders = ["first_name", "last_name", "email", "phone", "group", "plus_one_limit", "ceremony", "reception"] as const;

function csvCells(source: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted value.");
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function normalizedHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function booleanCell(value: string, defaultValue: boolean) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (["1", "true", "yes", "y", "ναι"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "όχι", "οχι"].includes(normalized)) return false;
  return null;
}

export function parseWeddingGuestCsv(source: string): WeddingGuestImportRow[] {
  const parsed = csvCells(source).filter((row) => row.some((cell) => cell.trim()));
  if (!parsed.length) throw new Error("The CSV is empty.");
  const headers = parsed[0]!.map(normalizedHeader);
  const indexes = new Map(headers.map((header, index) => [header, index]));
  const missing = requiredHeaders.filter((header) => !indexes.has(header));
  if (missing.length) throw new Error(`Missing CSV columns: ${missing.join(", ")}.`);
  const dataRows = parsed.slice(1);
  if (!dataRows.length) throw new Error("The CSV has headers but no guests.");
  if (dataRows.length > WEDDING_GUEST_IMPORT_MAX_ROWS)
    throw new Error(`A single import can contain up to ${WEDDING_GUEST_IMPORT_MAX_ROWS} guests.`);

  const value = (row: string[], key: typeof requiredHeaders[number]) => {
    const normalized = String(row[indexes.get(key)!] ?? "").trim();
    return /^'[=+\-@]/.test(normalized) ? normalized.slice(1) : normalized;
  };
  const seenEmails = new Set<string>();
  return dataRows.map((row, rowIndex) => {
    const line = rowIndex + 2;
    const firstName = value(row, "first_name");
    const lastName = value(row, "last_name");
    const email = value(row, "email").toLowerCase();
    const phone = value(row, "phone");
    const groupName = value(row, "group");
    const plusOneRaw = value(row, "plus_one_limit");
    const plusOneLimit = plusOneRaw === "" ? 0 : Number(plusOneRaw);
    const ceremony = booleanCell(value(row, "ceremony"), true);
    const reception = booleanCell(value(row, "reception"), true);
    if (!firstName) throw new Error(`Line ${line}: first_name is required.`);
    if (!email && !phone) throw new Error(`Line ${line}: add an email or phone.`);
    if (firstName.length > 80 || lastName.length > 80) throw new Error(`Line ${line}: names can contain up to 80 characters.`);
    if (email.length > 254) throw new Error(`Line ${line}: email can contain up to 254 characters.`);
    if (phone.length > 40) throw new Error(`Line ${line}: phone can contain up to 40 characters.`);
    if (groupName.length > 100) throw new Error(`Line ${line}: group can contain up to 100 characters.`);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Line ${line}: invalid email.`);
    if (!Number.isInteger(plusOneLimit) || plusOneLimit < 0 || plusOneLimit > 10)
      throw new Error(`Line ${line}: plus_one_limit must be an integer from 0 to 10.`);
    if (ceremony === null || reception === null)
      throw new Error(`Line ${line}: ceremony and reception must be yes/no or true/false.`);
    if (email && seenEmails.has(email)) throw new Error(`Line ${line}: duplicate email in this CSV.`);
    if (email) seenEmails.add(email);
    return { line, firstName, lastName, email, phone, groupName, plusOneLimit, ceremony, reception };
  });
}

function csvValue(value: unknown) {
  const raw = String(value ?? "");
  const normalized = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(normalized) ? `"${normalized.replace(/"/g, '""')}"` : normalized;
}

export function weddingGuestCsv(rows: Array<{
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  group_name: string | null;
  plus_one_limit: number;
  invited_to_ceremony: number;
  invited_to_reception: number;
}>) {
  const header = requiredHeaders.join(",");
  const lines = rows.map((row) => [
    row.first_name, row.last_name, row.email, row.phone, row.group_name ?? "", row.plus_one_limit,
    row.invited_to_ceremony ? "yes" : "no", row.invited_to_reception ? "yes" : "no",
  ].map(csvValue).join(","));
  return `\uFEFF${[header, ...lines].join("\r\n")}\r\n`;
}
