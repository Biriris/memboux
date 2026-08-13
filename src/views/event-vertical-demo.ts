import type { EventRow } from "../domain";
import type { EventVertical } from "../event-verticals";
import { verticalText } from "../event-verticals";
import { eventUiCopy } from "../event-ui-copy";
import { localeNames, supportedLocales, type Locale } from "../i18n";
import { esc } from "../utils";
import { eventVerticalPreviewPage, type EventVerticalProfile } from "./event-vertical-preview";
import { brandMark, page } from "./shared";

const sampleCopy: Record<string, { en: [string, string, string, string]; el: [string, string, string, string] }> = {
  engagement: { en: ["Alex & Jamie — the beginning", "Join us as the next chapter begins.", "From the first hello to the easiest yes.", "Welcome drinks 18:00 · Dinner 20:00"], el: ["Άλεξ & Τζέιμι — η αρχή", "Έλα μαζί μας καθώς ξεκινά το επόμενο κεφάλαιο.", "Από το πρώτο γεια μέχρι το πιο εύκολο ναι.", "Ποτό υποδοχής 18:00 · Δείπνο 20:00"] },
  bachelor: { en: ["The last dance crew", "One crew. One wild weekend. Zero lost photos.", "What happens on the trip stays in our private album.", "Meet-up 19:30 · Surprise 22:00 · After-party late"], el: ["Η τελευταία μεγάλη έξοδος", "Μία παρέα. Ένα επικό βράδυ. Καμία χαμένη φωτογραφία.", "Ό,τι γίνει στο πάρτι, μένει στο ιδιωτικό μας λεύκωμα.", "Συνάντηση 19:30 · Έκπληξη 22:00 · Συνέχεια μέχρι αργά"] },
  birthday: { en: ["Maya turns thirty", "One night, every favorite person.", "Thirty years of stories and a new decade ahead.", "Doors 20:00 · Cake 22:30 · Dancing until late"], el: ["Η Μάγια γίνεται τριάντα", "Μία βραδιά, όλοι οι αγαπημένοι άνθρωποι.", "Τριάντα χρόνια ιστοριών και μία νέα δεκαετία μπροστά.", "Άφιξη 20:00 · Τούρτα 22:30 · Χορός μέχρι αργά"] },
  party: { en: ["The rooftop night", "Music, city lights and no early exits.", "A summer night built for the people who make it count.", "Sunset 19:30 · Live set 21:00"], el: ["Η βραδιά στην ταράτσα", "Μουσική, φώτα πόλης και κανείς δεν φεύγει νωρίς.", "Μία καλοκαιρινή βραδιά για τους ανθρώπους που μετράνε.", "Ηλιοβασίλεμα 19:30 · Live set 21:00"] },
  baptism: { en: ["Nicolas' special day", "Celebrate a beautiful family moment with us.", "A gentle day surrounded by family and love.", "Ceremony 11:00 · Family lunch 13:00"], el: ["Η ξεχωριστή ημέρα του Νικόλα", "Γιόρτασε μαζί μας μία όμορφη οικογενειακή στιγμή.", "Μία τρυφερή ημέρα με οικογένεια και αγάπη.", "Τελετή 11:00 · Οικογενειακό γεύμα 13:00"] },
  baby: { en: ["Welcome, little one", "The first chapter starts here.", "Wishes, predictions and memories for the years ahead.", "Brunch 11:30 · Games 13:00"], el: ["Καλωσόρισες, μικρό μας", "Το πρώτο κεφάλαιο ξεκινά εδώ.", "Ευχές, προβλέψεις και αναμνήσεις για τα χρόνια που έρχονται.", "Brunch 11:30 · Παιχνίδια 13:00"] },
  graduation: { en: ["Class of 2026", "We did the work. Now we celebrate.", "For every late night, lesson and person who helped us arrive.", "Ceremony 18:00 · Reception 20:00"], el: ["Τάξη του 2026", "Κάναμε την προσπάθεια. Τώρα γιορτάζουμε.", "Για κάθε ξενύχτι, μάθημα και άνθρωπο που μας έφερε εδώ.", "Τελετή 18:00 · Δεξίωση 20:00"] },
  corporate: { en: ["Memboux Future Forum", "Ideas, people and the next practical move.", "A focused day for teams shaping what comes next.", "Keynote 09:30 · Sessions 11:00 · Networking 17:30"], el: ["Memboux Future Forum", "Ιδέες, άνθρωποι και το επόμενο πρακτικό βήμα.", "Μία ουσιαστική ημέρα για ομάδες που διαμορφώνουν το αύριο.", "Κεντρική ομιλία 09:30 · Συνεδρίες 11:00 · Δικτύωση 17:30"] },
  trip: { en: ["Our island journal", "Seven days, five friends, one shared story.", "A trip remembered through every person's perspective.", "Athens → Paros → Antiparos"], el: ["Το νησιωτικό μας ημερολόγιο", "Επτά ημέρες, πέντε φίλοι, μία κοινή ιστορία.", "Ένα ταξίδι μέσα από την οπτική κάθε ανθρώπου.", "Αθήνα → Πάρος → Αντίπαρος"] },
  reunion: { en: ["Together again", "Old stories, new memories.", "Ten years later, the group still feels like home.", "Welcome 18:00 · Dinner 20:00"], el: ["Ξανά μαζί", "Παλιές ιστορίες, νέες αναμνήσεις.", "Δέκα χρόνια μετά, η παρέα παραμένει σπίτι.", "Υποδοχή 18:00 · Δείπνο 20:00"] },
  community: { en: ["City Sounds 2026", "One city, three stages, every voice.", "A day made by the community and remembered by everyone.", "Main stage 17:00 · Sunset session 20:30"], el: ["City Sounds 2026", "Μία πόλη, τρεις σκηνές, κάθε φωνή.", "Μία ημέρα από την κοινότητα, για να τη θυμούνται όλοι.", "Κεντρική σκηνή 17:00 · Μουσική στο ηλιοβασίλεμα 20:30"] },
  memorial: { en: ["Remembering Elena", "A life carried forward through every story.", "Share the photographs and moments that keep her close.", "Gathering 11:00 · Family reception 13:00"], el: ["Στη μνήμη της Έλενας", "Μία ζωή που συνεχίζει μέσα από κάθε ιστορία.", "Μοιράσου τις φωτογραφίες και τις στιγμές που την κρατούν κοντά.", "Συνάντηση 11:00 · Οικογενειακή υποδοχή 13:00"] },
  other: { en: ["A day of our own", "Not every meaningful event needs a label.", "A flexible space for the people, details and memories that matter.", "Welcome 17:00 · Main moment 19:00"], el: ["Μία ημέρα δική μας", "Δεν χρειάζεται κάθε σημαντικό event μία ετικέτα.", "Ένας ευέλικτος χώρος για τους ανθρώπους και τις στιγμές που μετράνε.", "Υποδοχή 17:00 · Κεντρική στιγμή 19:00"] },
};

export const demoThemes = ["signature", "vivid", "editorial", "minimal"] as const;
export type DemoTheme = typeof demoThemes[number];

export function normalizeDemoTheme(value: unknown): DemoTheme {
  return demoThemes.includes(value as DemoTheme) ? value as DemoTheme : "signature";
}

function sample(locale: Locale, vertical: EventVertical) {
  const copy = sampleCopy[vertical.type] ?? sampleCopy.other;
  if (locale === "el") return copy.el;
  if (locale === "en") return copy.en;
  const schedule: Record<Exclude<Locale, "en" | "el">, string> = {
    fr: "Accueil 18:00 · Moment principal 20:00",
    de: "Empfang 18:00 · Hauptmoment 20:00",
    es: "Bienvenida 18:00 · Momento principal 20:00",
    it: "Accoglienza 18:00 · Momento principale 20:00",
  };
  return [
    verticalText(vertical.previewLabel, locale),
    verticalText(vertical.headline, locale),
    verticalText(vertical.lead, locale),
    schedule[locale],
  ];
}

export function eventVerticalDemoFrame(locale: Locale, vertical: EventVertical, theme: DemoTheme) {
  const [headline, introduction, story, schedule] = sample(locale, vertical);
  const event: EventRow = {
    id: `demo-${vertical.type}`, code: `DEMO-${vertical.type.toUpperCase()}`, eventName: headline,
    admin_token_hash: "", created_at: 0, expires_at: Date.now() + 86_400_000, status: "active",
    notes: "", updated_at: 0, default_locale: locale, event_start_date: "2026-09-19",
    event_end_date: "2026-09-19", event_type: vertical.type, location: {
      en: "Athens, Greece",
      el: "Αθήνα, Ελλάδα",
      fr: "Athènes, Grèce",
      de: "Athen, Griechenland",
      es: "Atenas, Grecia",
      it: "Atene, Grecia",
    }[locale],
    gallery_pin_hash: null, deleted_at: null, purge_at: null,
  };
  const profile: EventVerticalProfile = {
    event_id: event.id, headline, host_name: headline, introduction, story, schedule_notes: schedule,
    guest_notes: {
      en: "Every useful detail, update and photograph will live here.",
      el: "Όλες οι χρήσιμες πληροφορίες, οι ενημερώσεις και οι φωτογραφίες θα βρίσκονται εδώ.",
      fr: "Toutes les informations utiles, les actualités et les photos seront réunies ici.",
      de: "Alle wichtigen Informationen, Updates und Fotos findet ihr hier.",
      es: "Toda la información útil, las novedades y las fotografías estarán aquí.",
      it: "Tutte le informazioni utili, gli aggiornamenti e le fotografie saranno qui.",
    }[locale],
    contact_email: "", custom_fields_json: "{}", theme_key: theme, wizard_step: 4, wizard_completed_at: Date.now(),
    publish_status: "published", updated_at: Date.now(),
  };
  return eventVerticalPreviewPage(locale, event, vertical, profile, false, { demo: true });
}

export function eventVerticalDemoPage(locale: Locale, vertical: EventVertical, initialTheme: DemoTheme = "signature") {
  const ui = eventUiCopy[locale];
  const registration = `/${locale}/register?redirect=${encodeURIComponent(`/${locale}/account?create=${vertical.type}&template=${initialTheme}`)}`;
  const frameBase = `/${locale}/events/${vertical.type}/demo-frame`;
  const languageLinks = supportedLocales.map((language) =>
    `<a data-preview-language="${language}" href="/${language}/events/${vertical.type}/preview?theme=${initialTheme}" lang="${language}" class="rounded-full px-3 py-2 text-xs font-bold ${language === locale ? "bg-[#2b174d] text-white" : "border border-[#e2dbec] bg-white text-[#6b5d76]"}">${esc(localeNames[language])}</a>`,
  ).join("");
  const themeLabels = {
    signature: [ui.signature, ui.signatureDescription],
    vivid: [ui.vivid, ui.vividDescription],
    editorial: [ui.editorial, ui.editorialDescription],
    minimal: [ui.minimal, ui.minimalDescription],
  };
  const themes = demoThemes.map((theme, index) => `<button type="button" data-demo-theme="${theme}" aria-pressed="${index === 0}" class="rounded-xl border border-[#e2dbec] bg-white px-4 py-3 text-left transition aria-pressed:border-[#2b174d] aria-pressed:bg-[#2b174d] aria-pressed:text-white"><strong class="block">${esc(themeLabels[theme][0])}</strong><span class="mt-1 block text-xs opacity-65">${esc(themeLabels[theme][1])}</span></button>`).join("");
  const features = vertical.features.map((feature) => `<li class="flex items-center gap-2 text-sm"><span class="h-2 w-2 rounded-full" style="background:${esc(vertical.accent)}"></span>${esc(verticalText(feature, locale))}</li>`).join("");
  const body = `<main class="min-h-screen bg-[#f8f5ff] text-[#24143b]"><header class="border-b border-[#e7e0f0] bg-white"><div class="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">${brandMark(`/${locale}/events/${vertical.type}`, true)}<div class="flex flex-wrap items-center justify-end gap-2"><nav aria-label="${esc(ui.previewLanguage)}" class="flex flex-wrap gap-1">${languageLinks}</nav><a data-use-template href="${registration}" class="rounded-xl px-5 py-2.5 text-sm font-semibold text-white" style="background:${esc(vertical.accent)}">${esc(ui.createYours)}</a></div></div></header>
  <section class="mx-auto max-w-[1500px] px-4 py-6 sm:px-6"><div class="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p class="text-xs font-bold uppercase tracking-[.2em]" style="color:${esc(vertical.accent)}">${esc(verticalText(vertical.eyebrow, locale))}</p><h1 class="mt-2 text-4xl font-medium tracking-[-.04em] sm:text-5xl">${esc(ui.demoTitle)}</h1><p class="mt-3 max-w-3xl leading-7 text-[#6f657c]">${esc(ui.demoText)}</p></div><ul class="grid shrink-0 gap-2 rounded-2xl bg-white p-4 shadow-sm">${features}</ul></div>
  <div class="mt-6 grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]"><aside class="h-fit rounded-[1.6rem] border border-[#e7e0f0] bg-white p-4 xl:sticky xl:top-4"><p class="text-xs font-bold uppercase tracking-[.16em] text-[#6f657c]">${esc(ui.appearance)}</p><div class="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">${themes}</div><div class="mt-6 border-t pt-5"><p class="text-xs font-bold uppercase tracking-[.16em] text-[#6f657c]">${esc(ui.device)}</p><div class="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-[#f3effa] p-1"><button type="button" data-demo-width="390px" class="rounded-lg px-2 py-2 text-xs font-bold">${esc(ui.mobile)}</button><button type="button" data-demo-width="820px" class="rounded-lg px-2 py-2 text-xs font-bold">${esc(ui.tablet)}</button><button type="button" data-demo-width="100%" aria-pressed="true" class="rounded-lg bg-white px-2 py-2 text-xs font-bold shadow-sm">${esc(ui.desktop)}</button></div></div><a data-use-template href="${registration}" class="mt-6 block rounded-xl px-4 py-3 text-center text-sm font-bold text-white" style="background:${esc(vertical.accent)}">${esc(ui.startFreePreview)}</a><p class="mt-3 text-center text-xs text-[#7f7489]">${esc(ui.trialSummary)}</p></aside>
  <section class="min-h-[75vh] overflow-auto rounded-[1.6rem] bg-[#e8e1ef] p-2 sm:p-5"><div id="demo-stage" class="mx-auto min-h-[72vh] max-w-full overflow-hidden rounded-xl bg-white shadow-[0_25px_80px_rgba(20,40,33,.2)] transition-[max-width]"><iframe id="demo-frame" src="${frameBase}?theme=${initialTheme}" data-base="${frameBase}" title="${esc(ui.eventPreview)}" class="h-[72vh] w-full border-0"></iframe></div></section></div></section></main>
  <script>(()=>{const frame=document.getElementById('demo-frame'),stage=document.getElementById('demo-stage');let theme=${JSON.stringify(initialTheme)};const syncLinks=()=>{document.querySelectorAll('[data-preview-language]').forEach(link=>link.href='/'+link.dataset.previewLanguage+'/events/${vertical.type}/preview?theme='+encodeURIComponent(theme));const account='/${locale}/account?create=${vertical.type}&template='+encodeURIComponent(theme),registration='/${locale}/register?redirect='+encodeURIComponent(account);document.querySelectorAll('[data-use-template]').forEach(link=>link.href=registration)};document.querySelectorAll('[data-demo-theme]').forEach(button=>{if(button.dataset.demoTheme===theme)button.setAttribute('aria-pressed','true');else button.setAttribute('aria-pressed','false');button.addEventListener('click',()=>{theme=button.dataset.demoTheme;document.querySelectorAll('[data-demo-theme]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));frame.src=frame.dataset.base+'?theme='+encodeURIComponent(theme);syncLinks()})});syncLinks();document.querySelectorAll('[data-demo-width]').forEach(button=>button.addEventListener('click',()=>{stage.style.maxWidth=button.dataset.demoWidth;document.querySelectorAll('[data-demo-width]').forEach(item=>{item.setAttribute('aria-pressed',String(item===button));item.classList.toggle('bg-white',item===button);item.classList.toggle('shadow-sm',item===button)})}))})()<\/script>`;
  return page(`${verticalText(vertical.eyebrow, locale)} preview | Memboux`, body, {
    locale,
    description: verticalText(vertical.lead, locale),
    index: false,
    suppressWidgets: true,
  });
}
