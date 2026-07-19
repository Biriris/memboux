import type { EventRow } from "../domain";
import { localeNames, supportedLocales, type Locale } from "../i18n";
import { weddingThemeFor, type WeddingThemeKey } from "../wedding-themes";
import { esc } from "../utils";
import type { WeddingMenuRow } from "../wedding-menu";
import { brandMark, page } from "./shared";
import { weddingArtDirectionStyles } from "./wedding-art-direction";
import { weddingLuxuryStyles } from "./wedding-luxury-style";

export type PublicWeddingProfile = {
  partner_one_name: string;
  partner_two_name: string;
  welcome_message: string;
  story: string;
  ceremony_at: string | null;
  ceremony_location: string;
  ceremony_place_id?: string | null;
  ceremony_lat?: number | null;
  ceremony_lng?: number | null;
  reception_at: string | null;
  reception_location: string;
  reception_place_id?: string | null;
  reception_lat?: number | null;
  reception_lng?: number | null;
  dress_code: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  travel_notes: string;
  accommodation_notes: string;
  gift_message: string;
  gift_url: string;
  template_key: WeddingThemeKey;
  accent_color: string | null;
};

const t = (locale: Locale, en: string, el: string, fr: string, de: string, es: string, it: string) => ({ en, el, fr, de, es, it })[locale];

function formatMoment(value: string | null, locale: Locale) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function mapUrl(location: string, lat?: number | null, lng?: number | null) {
  const query = Number.isFinite(lat) && Number.isFinite(lng) ? `${lat},${lng}` : location;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function renderWeddingPage(input: {
  event: EventRow;
  profile: PublicWeddingProfile;
  locale: Locale;
  selectedFeatures: readonly string[];
  coverUpdatedAt: number | null;
  preview?: boolean;
  menu?: WeddingMenuRow | null;
  experienceHtml?: string;
  experienceScripts?: string;
  portraitMap?: Record<string, string | null>;
}) {
  const { event, profile, locale, selectedFeatures, coverUpdatedAt, preview = false, menu = null, experienceHtml = "", experienceScripts = "", portraitMap = {} } = input;
  const theme = weddingThemeFor(profile.template_key);
  const accent = profile.accent_color ?? theme.defaultAccent;
  const names = [profile.partner_one_name, profile.partner_two_name].filter(Boolean).join(" & ") || event.eventName;
  const nameScale = names.length > 30 ? "long" : names.length > 20 ? "compact" : "standard";
  const monogram = [profile.partner_one_name, profile.partner_two_name]
    .map((value) => value.trim().charAt(0).toUpperCase())
    .filter(Boolean)
    .join("") || names.trim().charAt(0).toUpperCase();
  const ceremony = formatMoment(profile.ceremony_at, locale);
  const reception = formatMoment(profile.reception_at, locale);
  const features = new Set(selectedFeatures);
  const hasStory = Boolean(profile.welcome_message || profile.story);
  const hasSchedule = Boolean(ceremony || reception || profile.ceremony_location || profile.reception_location || profile.dress_code);
  const hasGuestInfo = Boolean(profile.travel_notes || profile.accommodation_notes || profile.gift_message || profile.gift_url || profile.contact_name || profile.contact_email || profile.contact_phone);
  const hasMenu = Boolean(menu);
  const experienceCards = [
    features.has("rsvp") ? { href: experienceHtml ? "#participate" : `/gallery/${event.code}?lang=${locale}#participate`, title: "RSVP", copy: t(locale, "Confirm your attendance in a few seconds.", "Επιβεβαίωσε την παρουσία σου σε λίγα δευτερόλεπτα.", "Confirmez votre présence en quelques secondes.", "Bestätige deine Teilnahme in wenigen Sekunden.", "Confirma tu asistencia en segundos.", "Conferma la tua presenza in pochi secondi.") } : null,
    features.has("guestbook") ? { href: experienceHtml ? "#participate" : `/gallery/${event.code}?lang=${locale}#participate`, title: t(locale, "Guestbook", "Ευχολόγιο", "Livre d’or", "Gästebuch", "Libro de visitas", "Guestbook"), copy: t(locale, "Leave a message for the couple.", "Άφησε μια ευχή για το ζευγάρι.", "Laissez un message au couple.", "Hinterlasse dem Paar eine Nachricht.", "Deja un mensaje para la pareja.", "Lascia un messaggio alla coppia.") } : null,
    features.has("live_slideshow") ? { href: experienceHtml ? "#live" : `/gallery/${event.code}/slideshow?lang=${locale}`, title: t(locale, "Live moments", "Live στιγμές", "Moments live", "Live-Momente", "Momentos en vivo", "Momenti live"), copy: t(locale, "Follow the celebration as it unfolds.", "Δες τη γιορτή να ξεδιπλώνεται ζωντανά.", "Suivez la célébration en direct.", "Erlebe die Feier live.", "Sigue la celebración en directo.", "Segui la festa dal vivo.") } : null,
  ].filter((card): card is { href: string; title: string; copy: string } => Boolean(card));
  const nav = [
    hasStory ? ["story", t(locale, "Our story", "Η ιστορία μας", "Notre histoire", "Unsere Geschichte", "Nuestra historia", "La nostra storia")] : null,
    hasSchedule ? ["schedule", t(locale, "The day", "Η ημέρα", "La journée", "Der Tag", "El día", "Il giorno")] : null,
    hasMenu ? ["menu", t(locale, "Menu", "Menu", "Menu", "Menü", "Menú", "Menu")] : null,
    hasGuestInfo ? ["details", t(locale, "Guest guide", "Οδηγός καλεσμένων", "Guide invités", "Gäste-Guide", "Guía", "Guida ospiti")] : null,
    ["moments", t(locale, "Moments", "Στιγμές", "Moments", "Momente", "Momentos", "Momenti")],
    experienceHtml ? ["guest-experience", t(locale, "Guests", "Καλεσμένοι", "Invités", "Gäste", "Invitados", "Ospiti")] : null,
    experienceHtml ? ["official-album", t(locale, "Official", "Official", "Officiel", "Offiziell", "Oficial", "Ufficiale")] : null,
    experienceHtml && features.has("live_slideshow") ? ["live", "Live"] : null,
  ].filter((item): item is string[] => Boolean(item));
  const languagePicker = `<label class="sr-only" for="wedding-language">Language</label><select id="wedding-language" aria-label="Language" onchange="location.href=this.value">${supportedLocales.map((value) => `<option value="/wedding/${encodeURIComponent(event.code)}?lang=${value}${preview ? "&preview=1" : ""}" ${value === locale ? "selected" : ""}>${esc(localeNames[value])}</option>`).join("")}</select>`;
  const heroPortrait = portraitMap.hero ? `<img class="w-cover" src="/gallery/${encodeURIComponent(event.code)}/media/${encodeURIComponent(portraitMap.hero)}" alt="" loading="eager">` : "";
  const cover = coverUpdatedAt ? `<img class="w-cover" src="/gallery/${encodeURIComponent(event.code)}/cover?v=${coverUpdatedAt}" alt="">` : "";
  const heroImage = heroPortrait || cover;
  const storyPortrait = portraitMap.story ? `<img class="w-story-image" src="/gallery/${encodeURIComponent(event.code)}/media/${encodeURIComponent(portraitMap.story)}" alt="" loading="lazy">` : "";
  const divider1 = portraitMap.divider_1 ? `<section class="w-section w-divider"><img class="w-divider-image" src="/gallery/${encodeURIComponent(event.code)}/media/${encodeURIComponent(portraitMap.divider_1)}" alt="" loading="lazy"></section>` : "";
  const divider2 = portraitMap.divider_2 ? `<section class="w-section w-divider"><img class="w-divider-image" src="/gallery/${encodeURIComponent(event.code)}/media/${encodeURIComponent(portraitMap.divider_2)}" alt="" loading="lazy"></section>` : "";
  const divider3 = portraitMap.divider_3 ? `<section class="w-section w-divider"><img class="w-divider-image" src="/gallery/${encodeURIComponent(event.code)}/media/${encodeURIComponent(portraitMap.divider_3)}" alt="" loading="lazy"></section>` : "";
  const draftBanner = preview ? `<aside class="w-preview"><strong>${esc(t(locale, "Private preview", "Ιδιωτική προεπισκόπηση", "Aperçu privé", "Private Vorschau", "Vista previa privada", "Anteprima privata"))}</strong><a href="/dashboard/${event.code}/wedding/setup?lang=${locale}&step=1">${esc(t(locale, "Edit website", "Επεξεργασία website", "Modifier le site", "Website bearbeiten", "Editar sitio", "Modifica sito"))}</a></aside>` : "";

  const scheduleCards = [
    ceremony || profile.ceremony_location ? `<article class="w-event-card"><span>01</span><p>${esc(t(locale, "Ceremony", "Τελετή", "Cérémonie", "Zeremonie", "Ceremonia", "Cerimonia"))}</p>${ceremony ? `<h3>${esc(ceremony)}</h3>` : ""}${profile.ceremony_location ? `<a href="${esc(mapUrl(profile.ceremony_location, profile.ceremony_lat, profile.ceremony_lng))}" target="_blank" rel="noopener">${esc(profile.ceremony_location)} <i>↗</i></a>` : ""}</article>` : "",
    reception || profile.reception_location ? `<article class="w-event-card"><span>02</span><p>${esc(t(locale, "Celebration", "Δεξίωση", "Réception", "Feier", "Celebración", "Ricevimento"))}</p>${reception ? `<h3>${esc(reception)}</h3>` : ""}${profile.reception_location ? `<a href="${esc(mapUrl(profile.reception_location, profile.reception_lat, profile.reception_lng))}" target="_blank" rel="noopener">${esc(profile.reception_location)} <i>↗</i></a>` : ""}</article>` : "",
  ].join("");

  const menuSection = menu ? `<section id="menu" class="w-section w-menu"><div class="w-inner w-menu-layout" data-reveal><div><p class="w-eyebrow">${esc(t(locale, "At the table", "Στο τραπέζι", "À table", "Zu Tisch", "En la mesa", "A tavola"))}</p><h2>${esc(t(locale, "Wedding menu", "Menu γάμου", "Menu du mariage", "Hochzeitsmenü", "Menú de boda", "Menu del matrimonio"))}</h2><p class="w-story-copy">${esc(t(locale, "A taste of what we will share together.", "Μια γεύση από όσα θα μοιραστούμε μαζί.", "Un avant-goût de ce que nous partagerons.", "Ein Vorgeschmack auf das, was wir gemeinsam genießen.", "Un adelanto de lo que compartiremos.", "Un assaggio di ciò che condivideremo insieme."))}</p></div><div class="w-menu-frame">${menu.content_type === "application/pdf" ? `<a class="w-menu-document" href="/wedding/${encodeURIComponent(event.code)}/menu" target="_blank" rel="noopener"><strong>${esc(t(locale, "View the menu", "Δες το menu", "Voir le menu", "Menü ansehen", "Ver el menú", "Visualizza il menu"))}</strong><span>PDF · ${esc(menu.original_filename)}</span></a>` : `<a href="/wedding/${encodeURIComponent(event.code)}/menu" target="_blank" rel="noopener"><img class="w-menu-image" src="/wedding/${encodeURIComponent(event.code)}/menu" alt="${esc(t(locale, "Wedding food and drinks menu", "Menu φαγητού και ποτών γάμου", "Menu du mariage", "Speise- und Getränkekarte", "Menú de comida y bebida", "Menu di cibo e bevande"))}" loading="lazy"></a>`}</div></div></section>` : "";

  const detailCards = [
    profile.travel_notes ? `<article><span>↗</span><h3>${esc(t(locale, "Travel & transport", "Μετακίνηση & πρόσβαση", "Voyage et transport", "Anreise & Transport", "Viaje y transporte", "Viaggio e trasporti"))}</h3><p>${esc(profile.travel_notes)}</p></article>` : "",
    profile.accommodation_notes ? `<article><span>⌂</span><h3>${esc(t(locale, "Stay", "Διαμονή", "Hébergement", "Unterkunft", "Alojamiento", "Alloggio"))}</h3><p>${esc(profile.accommodation_notes)}</p></article>` : "",
    profile.gift_message || profile.gift_url ? `<article><span>◇</span><h3>${esc(t(locale, "Gifts", "Δώρα", "Cadeaux", "Geschenke", "Regalos", "Regali"))}</h3>${profile.gift_message ? `<p>${esc(profile.gift_message)}</p>` : ""}${profile.gift_url ? `<a class="w-text-link" href="${esc(profile.gift_url)}" target="_blank" rel="noopener">${esc(t(locale, "Open gift list", "Άνοιγμα λίστας δώρων", "Ouvrir la liste", "Geschenkliste öffnen", "Abrir lista", "Apri la lista"))} →</a>` : ""}</article>` : "",
    profile.contact_name || profile.contact_email || profile.contact_phone ? `<article><span>○</span><h3>${esc(t(locale, "Contact", "Επικοινωνία", "Contact", "Kontakt", "Contacto", "Contatti"))}</h3>${profile.contact_name ? `<p>${esc(profile.contact_name)}</p>` : ""}<div class="w-contact">${profile.contact_email ? `<a href="mailto:${esc(profile.contact_email)}">${esc(profile.contact_email)}</a>` : ""}${profile.contact_phone ? `<a href="tel:${esc(profile.contact_phone)}">${esc(profile.contact_phone)}</a>` : ""}</div></article>` : "",
  ].join("");

  const body = `${draftBanner}<div class="w-page" data-wedding-theme="${theme.key}" data-wedding-layout="${theme.layout}" data-wedding-font="${theme.font}" data-wedding-name-scale="${nameScale}" style="--w-accent:${accent};--w-ink:${theme.palette[0]};--w-soft:${theme.palette[1]};--w-bg:${theme.palette[2]};--w-monogram:'${esc(monogram)}'">
  <style>
    .w-page{--w-bg:#f4f0e7;--w-ink:#173d34;--w-soft:#dfd5c8;--w-panel:#fffdf8;--w-display:Georgia,'Times New Roman',serif;background:var(--w-bg);color:var(--w-ink);font-family:Manrope,sans-serif;font-weight:350}.w-page *{box-sizing:border-box}.w-top{position:absolute;inset:0 0 auto;z-index:20;display:flex;align-items:center;justify-content:space-between;padding:1rem clamp(1rem,4vw,4rem);color:#fff}.w-top .brand-mark{color:#fff}.w-top select{cursor:pointer;border:1px solid #ffffff4d;border-radius:999px;background:#ffffff1a;color:#fff;padding:.6rem .8rem;backdrop-filter:blur(12px)}.w-top select option{color:#172d27}.w-nav{display:none;gap:1.25rem}.w-nav a{color:inherit;font-size:.72rem;font-weight:650;letter-spacing:.12em;text-transform:uppercase}.w-hero{position:relative;display:grid;min-height:100svh;place-items:end center;overflow:hidden;background:linear-gradient(145deg,#173d34,#315d50);color:#fff}.w-cover{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.w-hero:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,#0c1e171f 0%,#142a226b 50%,#0d211bed 100%)}.w-hero-copy{position:relative;z-index:2;width:min(92%,68rem);padding:8rem 1rem 8vh;text-align:center}.w-kicker{margin:0 0 1.5rem;font-size:.7rem;font-weight:700;letter-spacing:.28em;text-transform:uppercase}.w-hero h1,.w-section h2{font-family:var(--w-display);font-weight:400}.w-hero h1{margin:0;font-size:clamp(3rem,9vw,7rem);line-height:.9;letter-spacing:-.04em}.w-hero-message{max-width:42rem;margin:1.8rem auto 0;font-size:clamp(.95rem,2vw,1.2rem);line-height:1.8;color:#fffde9}.w-date{margin-top:1.8rem;font-size:.78rem;font-weight:650;letter-spacing:.17em;text-transform:uppercase}.w-scroll{display:inline-flex;margin-top:3rem;color:#fff;animation:w-float 2.4s ease-in-out infinite}.w-section{padding:clamp(5rem,11vw,9rem) clamp(1.25rem,6vw,7rem)}.w-inner{width:min(100%,76rem);margin:auto}.w-eyebrow{margin:0 0 1rem;color:var(--w-accent);font-size:.7rem;font-weight:750;letter-spacing:.22em;text-transform:uppercase}.w-section h2{max-width:16ch;margin:0;font-size:clamp(2.2rem,5.5vw,4.5rem);line-height:1.05;letter-spacing:-.03em}.w-story{background:var(--w-panel)}.w-story-grid{display:grid;gap:3rem}.w-story-image{width:100%;height:auto;max-height:28rem;object-fit:cover;border-radius:1.5rem;box-shadow:0 20px 60px #0000001a}.w-story-copy{max-width:48rem;font-size:clamp(1rem,1.8vw,1.15rem);line-height:1.9;white-space:pre-line}.w-lead{font-family:var(--w-display);font-size:clamp(1.4rem,2.5vw,2rem)!important;line-height:1.4!important}.w-divider{padding:0!important;overflow:hidden;max-height:60vh}.w-divider-image{width:100%;height:60vh;object-fit:cover;display:block}.w-schedule-grid{display:grid;gap:1px;margin-top:3rem;background:color-mix(in srgb,var(--w-ink) 17%,transparent)}.w-event-card{position:relative;background:var(--w-bg);padding:clamp(2rem,5vw,4rem)}.w-event-card>span{position:absolute;right:1.5rem;top:1.2rem;color:color-mix(in srgb,var(--w-ink) 22%,transparent);font-family:var(--w-display);font-size:3rem}.w-event-card p{color:var(--w-accent);font-size:.7rem;font-weight:700;letter-spacing:.19em;text-transform:uppercase}.w-event-card h3{max-width:24rem;margin:2rem 0 1rem;font-family:var(--w-display);font-size:clamp(1.4rem,2.5vw,2rem);font-weight:400}.w-event-card a,.w-text-link,.w-contact a{display:block;width:fit-content;margin-top:.65rem;color:inherit;text-decoration:none;border-bottom:1px solid color-mix(in srgb,var(--w-ink) 35%,transparent)}.w-detail-grid,.w-experience-grid{display:grid;gap:1rem;margin-top:3rem}.w-detail-grid article,.w-experience-card{border:1px solid color-mix(in srgb,var(--w-ink) 14%,transparent);background:color-mix(in srgb,var(--w-panel) 92%,transparent);padding:2rem}.w-detail-grid article>span{color:var(--w-accent);font-size:1.5rem}.w-detail-grid h3,.w-experience-card h3{font-family:var(--w-display);font-size:1.5rem;font-weight:400}.w-detail-grid p,.w-experience-card p{white-space:pre-line;line-height:1.75;color:color-mix(in srgb,var(--w-ink) 76%,transparent)}.w-moments{position:relative;overflow:hidden;background:var(--w-ink);color:var(--w-bg)}.w-moments:before{content:"";position:absolute;width:32rem;height:32rem;right:-12rem;top:-15rem;border-radius:50%;background:var(--w-accent);filter:blur(4rem);opacity:.25}.w-experience-card{position:relative;color:inherit;text-decoration:none;transition:transform .35s ease,background .35s}.w-experience-card:hover{transform:translateY(-5px);background:#ffffff1a}.w-actions{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:3rem}.w-button{display:inline-flex;align-items:center;justify-content:center;min-height:3.2rem;border:1px solid currentColor;padding:.8rem 1.3rem;color:inherit;text-decoration:none;font-size:.78rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.w-button.primary{background:var(--w-bg);color:var(--w-ink);border-color:var(--w-bg)}.w-footer{padding:2rem;text-align:center;background:var(--w-ink);color:var(--w-bg);font-size:.72rem;letter-spacing:.13em;text-transform:uppercase}.w-preview{position:fixed;z-index:100;left:50%;bottom:1rem;display:flex;gap:1rem;align-items:center;transform:translateX(-50%);border:1px solid #ffffff33;border-radius:999px;background:#132e26e8;padding:.7rem 1rem;color:#fff;box-shadow:0 14px 40px #0003;backdrop-filter:blur(14px)}.w-preview a{color:#fff;font-weight:700}.w-page [data-reveal]{opacity:0;transform:translateY(24px);transition:opacity .8s ease,transform .8s cubic-bezier(.2,.8,.2,1)}.w-page [data-reveal].is-visible{opacity:1;transform:none}

    [data-wedding-theme="nocturne"]{--w-bg:#151717;--w-ink:#e8dfd2;--w-soft:#2b2927;--w-panel:#1d2020;--w-display:Georgia,'Times New Roman',serif}.w-page[data-wedding-theme="nocturne"] .w-hero{background:linear-gradient(135deg,#070808,#2c2119)}.w-page[data-wedding-theme="nocturne"] .w-hero:after{background:linear-gradient(90deg,#050606df,#11111140),linear-gradient(180deg,transparent,#090a09e8)}.w-page[data-wedding-theme="nocturne"] .w-hero-copy{text-align:left;margin-right:auto}.w-page[data-wedding-theme="nocturne"] .w-hero-message{margin-left:0}.w-page[data-wedding-theme="nocturne"] .w-event-card{background:#191b1b}.w-page[data-wedding-theme="nocturne"] .w-moments{background:#090a0a}
    [data-wedding-theme="lumiere"]{--w-bg:#fbf6f1;--w-ink:#5d4541;--w-soft:#eadbd4;--w-panel:#fffaf6;--w-display:Georgia,'Times New Roman',serif}.w-page[data-wedding-theme="lumiere"] .w-hero{min-height:92svh;background:linear-gradient(145deg,#9f756d,#d6b8ae)}.w-page[data-wedding-theme="lumiere"] .w-hero:after{background:linear-gradient(180deg,#6f4f4840,#4f3832bd)}.w-page[data-wedding-theme="lumiere"] .w-hero h1{font-style:italic}.w-page[data-wedding-theme="lumiere"] .w-story-grid{grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);align-items:start}.w-page[data-wedding-theme="lumiere"] .w-schedule-grid{gap:1rem;background:transparent}.w-page[data-wedding-theme="lumiere"] .w-event-card{border-radius:2rem;box-shadow:0 20px 70px #6d514c12}.w-page[data-wedding-theme="lumiere"] .w-detail-grid article{border-radius:1.5rem}
    @media(min-width:760px){.w-nav{display:flex}.w-schedule-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.w-detail-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.w-experience-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.w-story-grid{grid-template-columns:minmax(0,.75fr) minmax(0,1.25fr);align-items:start}}
    @media(prefers-reduced-motion:reduce){.w-scroll{animation:none}.w-page [data-reveal]{opacity:1;transform:none;transition:none}}@keyframes w-float{50%{transform:translateY(8px)}}
  </style><style>${weddingLuxuryStyles}</style><style>${weddingArtDirectionStyles}</style>
  <div class="w-top" role="navigation" aria-label="Wedding navigation">${brandMark(`/wedding/${event.code}?lang=${locale}`, true, true)}<nav class="w-nav">${nav.map(([id, label]) => `<a href="#${id}">${esc(label)}</a>`).join("")}</nav>${languagePicker}</div>
  <section class="w-hero" data-luxury-hero>${heroImage}<div class="w-hero-copy" data-reveal><p class="w-kicker">${esc(t(locale, "We are getting married", "Παντρευόμαστε", "Nous nous marions", "Wir heiraten", "Nos casamos", "Ci sposiamo"))}</p><h1>${esc(names)}</h1>${profile.welcome_message ? `<p class="w-hero-message">${esc(profile.welcome_message)}</p>` : ""}${ceremony ? `<p class="w-date">${esc(ceremony)}</p>` : ""}<a class="w-scroll" href="#${hasStory ? "story" : hasSchedule ? "schedule" : hasMenu ? "menu" : "moments"}" aria-label="Scroll">↓</a></div></section>

  ${hasStory ? `<section id="story" class="w-section w-story"><div class="w-inner w-story-grid" data-reveal><div><p class="w-eyebrow">${esc(t(locale, "How it began", "Πώς ξεκίνησε", "Comment tout a commencé", "Wie alles begann", "Cómo empezó", "Come è iniziato"))}</p><h2>${esc(t(locale, "Our story", "Η ιστορία μας", "Notre histoire", "Unsere Geschichte", "Nuestra historia", "La nostra storia"))}</h2></div><div class="w-story-copy ${profile.story ? "" : "w-lead"}">${esc(profile.story || profile.welcome_message)}</div>${storyPortrait}</div></section>` : ""}
  ${divider1}
  ${hasSchedule ? `<section id="schedule" class="w-section"><div class="w-inner" data-reveal><p class="w-eyebrow">${esc(t(locale, "Save the date", "Κράτησε την ημερομηνία", "Réservez la date", "Save the Date", "Reserva la fecha", "Segna la data"))}</p><h2>${esc(t(locale, "The celebration", "Η γιορτή", "La célébration", "Die Feier", "La celebración", "La celebrazione"))}</h2><div class="w-schedule-grid">${scheduleCards}</div>${profile.dress_code ? `<p class="w-hero-message" style="color:inherit;text-align:center">${esc(profile.dress_code)}</p>` : ""}</div></section>` : ""}
  ${divider2}
  ${menuSection}
  ${divider3}
  ${hasGuestInfo ? `<section id="details" class="w-section w-story"><div class="w-inner" data-reveal><p class="w-eyebrow">${esc(t(locale, "Everything in one place", "Όλα σε ένα σημείο", "Tout au même endroit", "Alles an einem Ort", "Todo en un lugar", "Tutto in un unico posto"))}</p><h2>${esc(t(locale, "Guest guide", "Οδηγός καλεσμένων", "Guide des invités", "Gäste-Guide", "Guía para invitados", "Guida per gli ospiti"))}</h2><div class="w-detail-grid">${detailCards}</div></div></section>` : ""}
  <section id="moments" class="w-section w-moments"><div class="w-inner" data-reveal><p class="w-eyebrow">Memboux · Collecting Moments</p><h2>${esc(t(locale, "Be part of the story", "Γίνε μέρος της ιστορίας", "Faites partie de l’histoire", "Werde Teil der Geschichte", "Sé parte de la historia", "Entra nella storia"))}</h2><p class="w-story-copy">${esc(t(locale, "See the shared album, add the moments you captured and celebrate together.", "Δες το κοινό album, πρόσθεσε τις στιγμές που κατέγραψες και γιόρτασε μαζί μας.", "Découvrez l’album partagé et ajoutez vos moments.", "Entdecke das gemeinsame Album und füge deine Momente hinzu.", "Descubre el álbum compartido y añade tus momentos.", "Scopri l’album condiviso e aggiungi i tuoi momenti."))}</p>${experienceCards.length ? `<div class="w-experience-grid">${experienceCards.map((card) => `<a class="w-experience-card" href="${esc(card.href)}"><h3>${esc(card.title)}</h3><p>${esc(card.copy)}</p><span>→</span></a>`).join("")}</div>` : ""}<div class="w-actions"><a class="w-button primary" href="/gallery/${event.code}?lang=${locale}">${esc(t(locale, "Open shared album", "Άνοιγμα κοινού album", "Ouvrir l’album", "Album öffnen", "Abrir álbum", "Apri album"))}</a><a class="w-button" href="/gallery/${event.code}/official?lang=${locale}">${esc(t(locale, "Official album", "Επίσημο album", "Album officiel", "Offizielles Album", "Álbum oficial", "Album ufficiale"))}</a></div></div></section>
  <footer class="w-footer">Memboux · Collecting Moments</footer></div><script>(()=>{const items=[...document.querySelectorAll('[data-reveal]')];if(!('IntersectionObserver'in window)||matchMedia('(prefers-reduced-motion:reduce)').matches){items.forEach(item=>item.classList.add('is-visible'));return}const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target)}}),{threshold:.12});items.forEach(item=>observer.observe(item))})()<\/script>`;

  const renderedBody = experienceHtml
    ? body
      .replace(`href="/gallery/${event.code}?lang=${locale}"`, 'href="#guest-upload"')
      .replace(`href="/gallery/${event.code}/official?lang=${locale}"`, 'href="#official-album"')
      .replace('<footer class="w-footer">', `${experienceHtml}<footer class="w-footer">`)
    : body;
  return page(names, `${renderedBody}${experienceScripts}`, {
    locale,
    description: profile.welcome_message || t(locale, "A private wedding experience on Memboux.", "Μια ιδιωτική wedding εμπειρία στο Memboux.", "Une expérience de mariage privée sur Memboux.", "Eine private Hochzeitserfahrung auf Memboux.", "Una experiencia de boda privada en Memboux.", "Un’esperienza di matrimonio privata su Memboux."),
    canonical: `https://memboux.com/wedding/${event.code}`,
    alternates: Object.fromEntries(supportedLocales.map((value) => [value, `https://memboux.com/wedding/${event.code}?lang=${value}`])),
    image: coverUpdatedAt ? `https://memboux.com/gallery/${event.code}/cover?v=${coverUpdatedAt}` : undefined,
    additionalHead: '<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=GFS+Didot&family=Noto+Serif:ital,wght@0,300;0,400;1,300&display=swap" rel="stylesheet">',
  });
}
