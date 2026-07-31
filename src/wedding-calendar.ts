import type { Locale } from "./i18n";

export type WeddingCalendarKind = "ceremony" | "reception";

type WeddingCalendarInput = {
  code: string;
  eventName: string;
  names: string;
  kind: WeddingCalendarKind;
  startsAt: string;
  location: string;
  locale: Locale;
  generatedAt?: number;
};

const calendarText = (
  locale: Locale,
  en: string,
  el: string,
  fr: string,
  de: string,
  es: string,
  it: string,
) => ({ en, el, fr, de, es, it })[locale];

function escapeIcs(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\r\n", "\\n")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

function parseLocalMoment(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "00"] = match;
  const timestamp = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() + 1 !== Number(month)
    || date.getUTCDate() !== Number(day)
    || date.getUTCHours() !== Number(hour)
    || date.getUTCMinutes() !== Number(minute)
  ) return null;
  return { timestamp, compact: `${year}${month}${day}T${hour}${minute}${second}` };
}

function compactUtc(timestamp: number) {
  return new Date(timestamp).toISOString().replaceAll("-", "").replaceAll(":", "").replace(/\.\d{3}Z$/, "Z");
}

export function isWeddingCalendarKind(value: unknown): value is WeddingCalendarKind {
  return value === "ceremony" || value === "reception";
}

export function weddingCalendarFilename(code: string, kind: WeddingCalendarKind) {
  const safeCode = code.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase() || "event";
  return `memboux-${safeCode}-${kind}.ics`;
}

export function buildWeddingCalendar(input: WeddingCalendarInput) {
  const start = parseLocalMoment(input.startsAt);
  if (!start) return null;
  const durationMinutes = input.kind === "ceremony" ? 90 : 360;
  const end = new Date(start.timestamp + durationMinutes * 60_000);
  const endCompact = end.toISOString().replaceAll("-", "").replaceAll(":", "").replace(/\.\d{3}Z$/, "");
  const kindLabel = input.kind === "ceremony"
    ? calendarText(input.locale, "Wedding ceremony", "Τελετή γάμου", "Cérémonie de mariage", "Hochzeitszeremonie", "Ceremonia de boda", "Cerimonia di matrimonio")
    : calendarText(input.locale, "Wedding reception", "Δεξίωση γάμου", "Réception de mariage", "Hochzeitsfeier", "Celebración de boda", "Ricevimento di matrimonio");
  const summary = input.names ? `${kindLabel} — ${input.names}` : `${kindLabel} — ${input.eventName}`;
  const description = calendarText(
    input.locale,
    "Private wedding event shared through Memboux.",
    "Ιδιωτικό wedding event μέσω Memboux.",
    "Événement de mariage privé partagé via Memboux.",
    "Private Hochzeitsveranstaltung über Memboux.",
    "Evento privado de boda compartido mediante Memboux.",
    "Evento di matrimonio privato condiviso tramite Memboux.",
  );
  const generatedAt = input.generatedAt ?? Date.now();
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Memboux//Wedding Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcs(`${input.code}-${input.kind}@memboux.com`)}`,
    `DTSTAMP:${compactUtc(generatedAt)}`,
    `DTSTART:${start.compact}`,
    `DTEND:${endCompact}`,
    `SUMMARY:${escapeIcs(summary)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    ...(input.location.trim() ? [`LOCATION:${escapeIcs(input.location.trim())}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
