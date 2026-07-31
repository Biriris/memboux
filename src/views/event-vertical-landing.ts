import { supportedLocales, type Locale } from "../i18n";
import { type EventVertical, verticalText } from "../event-verticals";
import { eventUiCopy } from "../event-ui-copy";
import { esc } from "../utils";
import { brandMark, page } from "./shared";

export function eventVerticalLandingPage(locale: Locale, vertical: EventVertical) {
  const ui = eventUiCopy[locale];
  const text = (value: Parameters<typeof verticalText>[0]) => verticalText(value, locale);
  const canonical = `https://memboux.com/${locale}/events/${vertical.type}`;
  const registerRedirect = `/${locale}/account?create=${vertical.type}`;
  const registerUrl = `/${locale}/register?redirect=${encodeURIComponent(registerRedirect)}`;
  const alternates = Object.fromEntries(
    supportedLocales.map((language) => [language, `https://memboux.com/${language}/events/${vertical.type}`]),
  );
  const features = vertical.features.map((feature, index) => `
    <article class="rounded-[1.75rem] border border-black/10 bg-white/80 p-6 shadow-[0_20px_60px_rgba(20,34,29,.06)]">
      <span class="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white" style="background:${esc(vertical.accent)}">0${index + 1}</span>
      <h3 class="mt-5 text-xl font-semibold text-[#24143b]">${esc(text(feature))}</h3>
    </article>`).join("");
  const steps = vertical.wizardSteps.map((step, index) => `
    <li class="flex gap-4">
      <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-current text-sm font-bold">${index + 1}</span>
      <div><strong class="block text-lg">${esc(text(step))}</strong><span class="mt-1 block text-sm opacity-70">${esc(ui.guidedSetup)}</span></div>
    </li>`).join("");

  const body = `<main style="--event-accent:${esc(vertical.accent)};--event-soft:${esc(vertical.soft)}" class="min-h-screen bg-[#fbfcfb] text-[#24143b]">
    <header class="border-b border-black/5 bg-white/90 backdrop-blur"><div class="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">${brandMark(`/${locale}`, true)}<a href="${registerUrl}" class="rounded-full px-5 py-2.5 text-sm font-semibold text-white" style="background:var(--event-accent)">${esc(ui.createEvent)}</a></div></header>
    <section class="overflow-hidden" style="background:linear-gradient(145deg,var(--event-soft),#fff 60%)"><div class="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:py-24">
      <div><p class="text-xs font-bold uppercase tracking-[.22em]" style="color:var(--event-accent)">${esc(text(vertical.eyebrow))}</p><h1 class="mt-5 max-w-3xl text-5xl font-medium leading-[1.02] tracking-[-.045em] sm:text-6xl">${esc(text(vertical.headline))}</h1><p class="mt-6 max-w-2xl text-lg leading-8 text-[#5f7069]">${esc(text(vertical.lead))}</p><div class="mt-9 flex flex-wrap gap-3"><a href="${registerUrl}" class="rounded-2xl px-7 py-4 font-semibold text-white shadow-lg" style="background:var(--event-accent)">${esc(ui.startFreePreview)}</a><a href="/${locale}/events/${vertical.type}/preview" class="rounded-2xl border border-black/10 bg-white px-7 py-4 font-semibold">${esc(ui.viewDemo)}</a></div><p class="mt-4 text-sm text-[#756b82]">${esc(ui.noCardPrivate)}</p></div>
      <div class="relative mx-auto w-full max-w-lg"><div class="absolute -inset-8 rounded-full opacity-50 blur-3xl" style="background:var(--event-soft)"></div><div class="relative rotate-1 rounded-[2.5rem] border border-white/80 bg-white p-4 shadow-[0_35px_100px_rgba(23,45,39,.18)]"><div class="rounded-[2rem] p-8 sm:p-10" style="background:linear-gradient(155deg,var(--event-soft),#fff)"><div class="flex items-center justify-between"><span class="text-3xl">${esc(vertical.symbol)}</span><span class="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold">${esc(ui.privatePreview)}</span></div><p class="mt-16 text-xs font-bold uppercase tracking-[.2em]" style="color:var(--event-accent)">${esc(text(vertical.previewLabel))}</p><h2 class="mt-3 text-4xl font-medium tracking-[-.04em]">${esc(text(vertical.headline))}</h2><div class="mt-10 grid grid-cols-3 gap-2">${vertical.features.map((feature) => `<div class="rounded-xl bg-white/80 p-3 text-xs font-semibold">${esc(text(feature))}</div>`).join("")}</div></div></div></div>
    </div></section>
    <section class="mx-auto max-w-7xl px-4 py-20 sm:px-6"><div class="max-w-2xl"><p class="text-xs font-bold uppercase tracking-[.2em]" style="color:var(--event-accent)">Memboux experience</p><h2 class="mt-3 text-4xl font-medium tracking-[-.035em]">${esc(ui.experienceTitle)}</h2></div><div class="mt-10 grid gap-5 md:grid-cols-3">${features}</div></section>
    <section id="how-it-works" class="border-y border-black/5" style="background:var(--event-soft)"><div class="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2"><div><p class="text-xs font-bold uppercase tracking-[.2em]" style="color:var(--event-accent)">${esc(ui.tailoredWizard)}</p><h2 class="mt-3 text-4xl font-medium tracking-[-.035em]">${esc(ui.wizardTitle)}</h2><p class="mt-5 leading-7 text-[#5f7069]">${esc(ui.wizardText)}</p></div><ol class="space-y-7" style="color:var(--event-accent)">${steps}</ol></div></section>
    <section class="mx-auto max-w-5xl px-4 py-20 text-center sm:px-6"><div class="rounded-[2.5rem] px-6 py-14 text-white sm:px-12" style="background:var(--event-accent)"><p class="text-sm font-semibold uppercase tracking-[.18em] opacity-75">${esc(ui.trialEyebrow)}</p><h2 class="mx-auto mt-4 max-w-3xl text-4xl font-medium tracking-[-.04em]">${esc(ui.trialTitle)}</h2><p class="mx-auto mt-5 max-w-2xl leading-7 opacity-80">${esc(ui.trialText)}</p><a href="${registerUrl}" class="mt-8 inline-flex rounded-2xl bg-white px-7 py-4 font-semibold" style="color:var(--event-accent)">${esc(ui.createPreview)}</a></div></section>
  </main><footer class="border-t border-black/5 bg-white"><div class="mx-auto flex max-w-7xl flex-col justify-between gap-4 px-4 py-8 text-sm text-[#756b82] sm:flex-row sm:px-6">${brandMark(`/${locale}`, true)}<div class="flex flex-wrap gap-5"><a href="/${locale}/privacy-policy">Privacy</a><a href="/${locale}/terms">Terms</a><a href="mailto:support@memboux.com">support@memboux.com</a></div></div></footer>`;

  const description = text(vertical.lead);
  return page(`${text(vertical.eyebrow)} | Memboux`, body, {
    locale,
    description,
    canonical,
    alternates: { ...alternates, "x-default": `https://memboux.com/en/events/${vertical.type}` },
    index: true,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: `Memboux ${vertical.type}`,
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Web",
      description,
      url: canonical,
      offers: { "@type": "Offer", price: "0", priceCurrency: "EUR", description: ui.noCardPrivate },
    },
  });
}
