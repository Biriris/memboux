import type { EventRow } from "./domain";
import type { Locale } from "./i18n";

export const esc = (value: unknown) => String(value ?? "").replace(/[&<>'\"]/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#39;",
  "\"": "&quot;",
}[character]!));

export const randomCode = () => crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.byteLength !== rightBytes.byteLength) return false;
  return crypto.subtle.timingSafeEqual(leftBytes, rightBytes);
}

export async function secureSecretEqual(left: string, right: string) {
  const [leftHash, rightHash] = await Promise.all([sha256(left), sha256(right)]);
  return constantTimeEqual(leftHash, rightHash);
}

export async function sha256Bytes(value: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const cookieValue = (request: Request, name: string) => (request.headers.get("Cookie") ?? "")
  .split(";")
  .map((part) => part.trim())
  .find((part) => part.startsWith(`${name}=`))
  ?.slice(name.length + 1);

export const dateInput = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

export const formatDate = (timestamp: number) => new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  timeZone: "Europe/Athens",
}).format(new Date(timestamp));

export const formatDateTime = (timestamp: number, _locale: Locale) => new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Europe/Athens",
}).format(new Date(timestamp));

export const validEventDate = (value: unknown) => {
  const date = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
};

const formatIsoDate = (value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(2, 4)}`;

export const formatEventDates = (
  event: Pick<EventRow, "event_start_date" | "event_end_date">,
  locale: Locale,
) => {
  if (!event.event_start_date) return locale === "el" ? "Δεν ορίστηκε ημερομηνία" : "Date not set";
  const start = formatIsoDate(event.event_start_date);
  if (!event.event_end_date || event.event_end_date === event.event_start_date) return start;
  return `${start} – ${formatIsoDate(event.event_end_date)}`;
};
