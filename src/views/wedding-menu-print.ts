import type { EventRow } from "../domain";
import type { Locale } from "../i18n";
import { weddingMenuCourseLabel, type WeddingMenuCourseRow } from "../wedding-menu-courses";
import { esc } from "../utils";
import { page } from "./shared";

export function weddingMenuPrintPage(input: {
  event: EventRow;
  locale: Locale;
  courses: WeddingMenuCourseRow[];
  accent: string;
  ink: string;
  background: string;
}) {
  const { event, locale, courses, accent, ink, background } = input;
  const el = locale === "el";
  const rows = courses.map((course) => `<article class="menu-course"><p>${esc(course.title || weddingMenuCourseLabel(course.course_type, locale))}</p><div>${esc(course.description)}</div></article>`).join("");
  const body = `<main class="menu-print-page" style="--menu-accent:${esc(accent)};--menu-ink:${esc(ink)};--menu-bg:${esc(background)}"><div class="menu-actions"><a href="/dashboard/${encodeURIComponent(event.code)}/wedding/setup?lang=${locale}&amp;step=4">← ${el ? "Πίσω στο menu" : "Back to menu"}</a><button type="button" onclick="window.print()">${el ? "Εκτύπωση / PDF" : "Print / PDF"}</button></div><section class="menu-sheet"><p class="menu-brand">Memboux</p><h1>${esc(event.eventName)}</h1><p class="menu-label">${el ? "Menu δεξίωσης" : "Reception menu"}</p><div class="menu-courses">${rows}</div></section></main><style>.menu-print-page{min-height:100vh;background:#f5f2f8;padding:2rem;color:var(--menu-ink)}.menu-actions{display:flex;align-items:center;justify-content:space-between;gap:1rem;max-width:210mm;margin:0 auto 1rem}.menu-actions a,.menu-actions button{border:0;border-radius:.8rem;background:var(--menu-ink);padding:.8rem 1rem;color:var(--menu-bg);font-weight:700}.menu-sheet{width:min(100%,210mm);min-height:297mm;margin:auto;border:1px solid color-mix(in srgb,var(--menu-accent) 32%,transparent);background:var(--menu-bg);padding:24mm 20mm;text-align:center;box-shadow:0 24px 70px #1d11301f}.menu-brand{font-size:.65rem;font-weight:800;letter-spacing:.28em;text-transform:uppercase;color:var(--menu-accent)}.menu-sheet h1{max-width:16ch;margin:1.25rem auto 0;font-family:Georgia,serif;font-size:clamp(2.5rem,7vw,4.8rem);font-weight:400;line-height:1}.menu-label{margin-top:1rem;font-size:.7rem;font-weight:800;letter-spacing:.2em;text-transform:uppercase}.menu-courses{display:grid;gap:2rem;margin-top:3.5rem}.menu-course p{margin:0;color:var(--menu-accent);font-size:.72rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase}.menu-course div{max-width:36rem;margin:.65rem auto 0;white-space:pre-line;font-family:Georgia,serif;font-size:1.15rem;line-height:1.7}@media print{body{background:white!important}.menu-actions{display:none}.menu-print-page{padding:0;background:white}.menu-sheet{width:210mm;min-height:297mm;border:0;box-shadow:none;break-after:page}}</style>`;
  return page(`${event.eventName} · Menu`, body, { locale, suppressWidgets: true });
}
