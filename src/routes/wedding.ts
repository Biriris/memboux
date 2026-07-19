import { Hono } from "hono";
import QRCode from "qrcode";
import { getEventRole, roleCan } from "../access";
import type { Bindings, EventRow } from "../domain";
import { normalizeLocale, type Locale } from "../i18n";
import {
  existingMediaLikeVisitor,
  getGalleryMediaWithLikes,
  getOfficialMediaWithLikes,
  mediaLikeActorKey,
} from "../media-likes";
import { getOrCreateMediaVariant, mediaObjectKeys, parseMediaVariant } from "../media-variants";
import { getEvent } from "../repositories";
import { currentUser } from "../session";
import { hasGalleryAccess } from "../gallery-access";
import { PlaceInputError, resolveEventPlaceInput } from "../places";
import { esc } from "../utils";
import {
  calculateWeddingEstimate,
  defaultWeddingFeatures,
  formatWeddingPrice,
  weddingCatalogText,
  weddingFeatureCatalog,
  type WeddingFeatureKey,
} from "../wedding-catalog";
import { normalizeWeddingTheme, validWeddingAccent, weddingThemeFor, weddingThemes, type WeddingThemeKey } from "../wedding-themes";
import { getWeddingPortraitMap, isValidPortraitSlot, upsertWeddingPortrait, deleteWeddingPortrait, getWeddingMedia, insertWeddingMedia, deleteWeddingMedia } from "../wedding-portraits";

import { renderWeddingPage, type PublicWeddingProfile } from "../views/wedding-page";
import { renderWeddingExperience, type WeddingExperienceSettings } from "../views/wedding-experience";
import { weddingTemplatePickerStyles } from "../views/wedding-template-picker-style";
import type { GuestbookPreview } from "../views/experience";
import { locationPickerMarkup, locationPickerScript } from "../views/location-picker";
import { brandMark, eventHeader, logoutScript, page } from "../views/shared";
import { safeWeddingMenuFilename, validateWeddingMenuFile, weddingMenuBytesMatch, type WeddingMenuRow } from "../wedding-menu";
import { safeFileExtension, uploadValidationDetails, validateUploadFiles } from "../upload-policy";

type WeddingProfile = {
  event_id: string;
  partner_one_name: string;
  partner_two_name: string;
  welcome_message: string;
  story: string;
  ceremony_at: string | null;
  ceremony_location: string;
  ceremony_place_id: string | null;
  ceremony_lat: number | null;
  ceremony_lng: number | null;
  reception_at: string | null;
  reception_location: string;
  reception_place_id: string | null;
  reception_lat: number | null;
  reception_lng: number | null;
  dress_code: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  travel_notes: string;
  accommodation_notes: string;
  gift_message: string;
  gift_url: string;
  wizard_step: number;
  wizard_completed_at: number | null;
  estimated_total_minor: number;
  currency: string;
  template_key: WeddingThemeKey;
  publish_status: "draft" | "published";
  accent_color: string | null;
};

const localized = (locale: Locale, en: string, el: string, fr: string, de: string, es: string, it: string) => ({ en, el, fr, de, es, it })[locale];
const field = (label: string, name: string, value: string, options: { required?: boolean; type?: string; max?: number; placeholder?: string } = {}) => `<label class="block text-sm font-semibold text-[#344941]">${esc(label)}<input name="${name}" value="${esc(value)}" ${options.required ? "required" : ""} type="${options.type ?? "text"}" ${options.type === "datetime-local" ? 'lang="en-GB" step="60"' : ""} maxlength="${options.max ?? 160}" placeholder="${esc(options.placeholder ?? "")}" class="mt-2 w-full rounded-xl border border-[#d6e0dc] bg-white px-4 py-3 font-normal text-[#183c33] outline-none focus:border-[#3f7d6c] focus:ring-2 focus:ring-[#c8ddd5]"></label>`;
const area = (label: string, name: string, value: string, max = 2000, rows = 5) => `<label class="block text-sm font-semibold text-[#344941]">${esc(label)}<textarea name="${name}" maxlength="${max}" rows="${rows}" class="mt-2 w-full rounded-xl border border-[#d6e0dc] bg-white px-4 py-3 font-normal leading-6 text-[#183c33] outline-none focus:border-[#3f7d6c] focus:ring-2 focus:ring-[#c8ddd5]">${esc(value)}</textarea></label>`;

async function ownedWedding(db: D1Database, code: string, userId: string) {
  const event = await getEvent(db, code);
  if (!event || event.event_type !== "wedding") return null;
  const role = await getEventRole(db, event.id, userId);
  return roleCan(role, "manage_event") ? event : null;
}

async function ensureProfile(db: D1Database, event: EventRow) {
  const now = Date.now();
  const estimate = calculateWeddingEstimate(defaultWeddingFeatures());
  await db.prepare(`INSERT OR IGNORE INTO event_wedding_profiles
    (event_id,ceremony_at,ceremony_location,wizard_step,catalog_version,estimated_total_minor,currency,updated_at)
    VALUES (?,?,?,?,?,?,?,?)`)
    .bind(event.id, event.event_start_date ? `${event.event_start_date}T12:00` : null, event.location ?? "", 1, estimate.catalogVersion, estimate.totalMinor, estimate.currency, now)
    .run();
  return db.prepare("SELECT * FROM event_wedding_profiles WHERE event_id=?").bind(event.id).first<WeddingProfile>();
}

async function selectedFeatures(db: D1Database, profile: WeddingProfile) {
  const rows = await db.prepare("SELECT feature_key FROM event_wedding_features WHERE event_id=? AND enabled=1")
    .bind(profile.event_id).all<{ feature_key: WeddingFeatureKey }>();
  return profile.wizard_step >= 5 ? rows.results.map((row) => row.feature_key) : defaultWeddingFeatures();
}

function validDateTime(value: string) {
  return value === "" || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value);
}

function formatWeddingMoment(value: string | null, locale: Locale) {
  if (!value || !validDateTime(value)) return "—";
  const date = new Date(`${value}:00Z`);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(date);
}

function weddingLocationPicker(locale: Locale, kind: "ceremony" | "reception", profile: WeddingProfile) {
  const ceremony = kind === "ceremony";
  return locationPickerMarkup({
    id: `wedding-${kind}-location`,
    locale,
    location: {
      location: ceremony ? profile.ceremony_location : profile.reception_location,
      location_place_id: ceremony ? profile.ceremony_place_id : profile.reception_place_id,
      location_lat: ceremony ? profile.ceremony_lat : profile.reception_lat,
      location_lng: ceremony ? profile.ceremony_lng : profile.reception_lng,
    },
    inputName: `${kind}Location`,
    placeIdName: `${kind}PlaceId`,
    sessionName: `${kind}LocationSessionToken`,
    clearName: `clear${kind[0].toUpperCase()}${kind.slice(1)}Location`,
    latitudeName: `${kind}Lat`,
    longitudeName: `${kind}Lng`,
  });
}

function wizardShell(locale: Locale, event: EventRow, user: { name: string; email: string }, profile: WeddingProfile, activeStep: number, content: string) {
  const steps = [
    localized(locale, "Couple", "Ζευγάρι", "Couple", "Paar", "Pareja", "Coppia"),
    localized(locale, "Portraits", "Φωτογραφίες", "Portraits", "Porträts", "Retratos", "Ritratti"),
    localized(locale, "Schedule", "Πρόγραμμα", "Programme", "Ablauf", "Programa", "Programma"),
    localized(locale, "Guest details", "Πληροφορίες καλεσμένων", "Informations invités", "Gästeinfos", "Información para invitados", "Informazioni ospiti"),
    localized(locale, "Features", "Λειτουργίες", "Fonctionnalités", "Funktionen", "Funciones", "Funzioni"),
    localized(locale, "Review", "Έλεγχος", "Vérification", "Prüfen", "Revisión", "Revisione"),
  ];
  const progress = Math.round((activeStep / steps.length) * 100);
  const stepNav = steps.map((label, index) => {
    const step = index + 1;
    const allowed = step <= Math.max(profile.wizard_step, activeStep);
    const classes = step === activeStep ? "border-[#2f6b5b] bg-[#2f6b5b] text-white" : step < activeStep ? "border-[#9fc0b4] bg-[#e7f1ed] text-[#255848]" : "border-[#dce5e1] bg-white text-[#7a8984]";
    const inner = `<span class="flex h-8 w-8 items-center justify-center rounded-full border ${classes} text-xs font-bold">${step < activeStep ? "✓" : step}</span><span class="hidden text-xs font-semibold sm:block">${esc(label)}</span>`;
    return allowed ? `<a href="/dashboard/${event.code}/wedding/setup?lang=${locale}&step=${step}" class="flex min-w-10 items-center gap-2 rounded-xl p-1.5 hover:bg-white">${inner}</a>` : `<span class="flex min-w-10 items-center gap-2 rounded-xl p-1.5">${inner}</span>`;
  }).join("");
  const title = localized(locale, "Wedding setup", "Οργάνωση Wedding event", "Configuration du mariage", "Hochzeit einrichten", "Configurar boda", "Configura matrimonio");
  const intro = localized(locale, "Build the experience one clear step at a time. Everything is saved as a draft.", "Στήσε την εμπειρία βήμα-βήμα. Όλα αποθηκεύονται ως draft.", "Construisez l’expérience étape par étape. Tout est enregistré comme brouillon.", "Richte alles Schritt für Schritt ein. Alles wird als Entwurf gespeichert.", "Crea la experiencia paso a paso. Todo se guarda como borrador.", "Crea l’esperienza passo dopo passo. Tutto viene salvato come bozza.");
  return page(title, `${eventHeader(locale, user, "")}<main class="mx-auto max-w-6xl p-4 pb-14 sm:p-6 md:p-10"><div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p class="text-xs font-bold uppercase tracking-[.18em] text-[#2f6b5b]">Memboux Wedding</p><h1 class="mt-2 text-4xl text-[#183c33]">${esc(title)}</h1><p class="mt-2 max-w-2xl text-sm leading-6 text-[#687a74]">${esc(intro)}</p></div><a href="/dashboard/${event.code}?lang=${locale}#template" class="rounded-xl border border-[#d6e0dc] bg-white px-4 py-2.5 text-sm font-semibold">${esc(localized(locale, "Save & exit", "Αποθήκευση & έξοδος", "Enregistrer et quitter", "Speichern & verlassen", "Guardar y salir", "Salva ed esci"))}</a></div><section class="mt-7 overflow-hidden rounded-[2rem] border border-[#dce6e2] bg-white shadow-sm"><div class="border-b border-[#e5ece9] bg-[#f3f7f5] p-4 sm:p-5"><div class="flex items-center justify-between gap-2 overflow-x-auto">${stepNav}</div><div class="mt-4 h-1.5 overflow-hidden rounded-full bg-[#dce7e2]"><div class="h-full rounded-full bg-[#2f6b5b] transition-all" style="width:${progress}%"></div></div></div><div class="p-5 sm:p-8">${content}</div></section></main>${logoutScript(locale)}`);
}

export const weddingRoutes = new Hono<{ Bindings: Bindings }>();

weddingRoutes.get("/wedding-media/:id", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT wm.object_key,wm.content_type,wm.media_type,wm.event_id FROM event_wedding_media wm WHERE wm.id=?"
  ).bind(c.req.param("id")).first<{ object_key: string; content_type: string; media_type: string; event_id: string }>();
  if (!row) return c.text("Not found", 404);
  const [event, profile] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM events WHERE id=? AND deleted_at IS NULL").bind(row.event_id).first<EventRow>(),
    c.env.DB.prepare("SELECT publish_status FROM event_wedding_profiles WHERE event_id=?")
      .bind(row.event_id).first<{ publish_status: "draft" | "published" }>(),
  ]);
  if (!event || !profile) return c.text("Not found", 404);

  let manager = false;
  if (profile.publish_status !== "published" || event.gallery_pin_hash) {
    const user = await currentUser(c);
    manager = Boolean(user && roleCan(await getEventRole(c.env.DB, event.id, user.id), "manage_event"));
  }
  if (profile.publish_status !== "published" && !manager) return c.text("Not found", 404);
  if (!manager && !(await hasGalleryAccess(c.req.raw, event))) return c.text("Private media", 401);

  const variant = row.media_type === "image" ? parseMediaVariant(c.req.query("variant")) : null;
  let object: R2ObjectBody | null = null;
  let transformed = false;
  if (variant) {
    try {
      const result = await getOrCreateMediaVariant(c.env, row.object_key, variant);
      object = result?.object ?? null;
      transformed = Boolean(object && object.key !== row.object_key);
    } catch (error) {
      console.error(JSON.stringify({
        event: "wedding_image_variant_failed",
        mediaId: c.req.param("id"),
        variant,
        error: error instanceof Error ? error.message.slice(0, 300) : "unknown",
      }));
    }
  }
  object ??= await c.env.MEDIA.get(row.object_key);
  if (!object) return c.text("Not found", 404);
  const headers = new Headers({
    "Content-Type": transformed ? "image/webp" : row.content_type,
    "Cache-Control": "private, max-age=31536000, immutable",
    ETag: object.httpEtag,
    "X-Content-Type-Options": "nosniff",
  });
  return new Response(object.body, { headers });
});

weddingRoutes.get("/wedding/:code", async (c) => {

  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event || event.event_type !== "wedding") return c.text("Wedding event not found", 404);
  const locale = normalizeLocale(c.req.query("lang") ?? event.default_locale);
  if (Date.now() > event.expires_at) return c.text(localized(locale, "This event has expired.", "Αυτό το event έχει λήξει.", "Cet événement a expiré.", "Dieses Event ist abgelaufen.", "Este evento ha caducado.", "Questo evento è scaduto."), 410);
  const profile = await c.env.DB.prepare("SELECT * FROM event_wedding_profiles WHERE event_id=?")
    .bind(event.id).first<WeddingProfile>();
  if (!profile) return c.text("Wedding page not found", 404);

  const previewRequested = c.req.query("preview") === "1";
  let preview = false;
  let authorizedPreview = false;
  if (profile.publish_status !== "published" || previewRequested) {
    const user = await currentUser(c);
    authorizedPreview = Boolean(user && roleCan(await getEventRole(c.env.DB, event.id, user.id), "manage_event"));
    if (profile.publish_status !== "published" && !authorizedPreview) return c.text("Wedding page not published", 404);
    preview = authorizedPreview;
  }

  if (!authorizedPreview && !(await hasGalleryAccess(c.req.raw, event))) {
    const next = `/wedding/${event.code}?lang=${locale}${preview ? "&preview=1" : ""}`;
    return c.html(page(event.eventName, `<main class="flex min-h-screen items-center justify-center p-5"><section class="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl"><div class="flex items-center justify-between">${brandMark("/", true)}<span class="rounded-full bg-[#edf4f1] px-3 py-1.5 text-xs font-bold text-[#2f6b5b]">Memboux Wedding</span></div><h1 class="mt-7 text-4xl">${esc(localized(locale, "Private wedding page", "Ιδιωτική wedding σελίδα", "Page de mariage privée", "Private Hochzeitsseite", "Página de boda privada", "Pagina matrimonio privata"))}</h1><p class="mt-2 text-[#65756f]">${esc(localized(locale, "Enter the event PIN to open the complete experience.", "Βάλε το PIN του event για να ανοίξεις ολόκληρη την εμπειρία.", "Saisissez le PIN de l’événement.", "Gib die Event-PIN ein.", "Introduce el PIN del evento.", "Inserisci il PIN dell'evento."))}</p><form action="/gallery/${encodeURIComponent(event.code)}/unlock" method="post" class="mt-6 space-y-3"><input type="hidden" name="locale" value="${locale}"><input type="hidden" name="next" value="${esc(next)}"><input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" required autofocus placeholder="PIN" class="w-full rounded-xl border px-4 py-3 text-center text-xl tracking-[.3em]"><button class="w-full rounded-xl bg-[#2f6b5b] px-5 py-3 text-white">${esc(localized(locale, "Open wedding page", "Άνοιγμα wedding σελίδας", "Ouvrir la page", "Hochzeitsseite öffnen", "Abrir página", "Apri pagina"))}</button></form></section></main>`, { locale }), 401);
  }

  const likeVisitor = existingMediaLikeVisitor(c.req.raw);
  const likeActorKey = likeVisitor
    ? await mediaLikeActorKey(c.env.BETTER_AUTH_SECRET, likeVisitor)
    : "";
  const guestUrl = `${new URL(c.req.url).origin}/wedding/${encodeURIComponent(event.code)}`;
  const [featureRows, cover, allMedia, officialMedia, guestQrRaw, guestbook, experienceSettings, curator, menu, portraitMap, preWeddingMedia] = await Promise.all([
    c.env.DB.prepare("SELECT feature_key FROM event_wedding_features WHERE event_id=? AND enabled=1").bind(event.id).all<{ feature_key: string }>(),
    c.env.DB.prepare("SELECT updated_at FROM event_covers WHERE event_id=?").bind(event.id).first<{ updated_at: number }>(),
    getGalleryMediaWithLikes(c.env.DB, event.id, likeActorKey),
    getOfficialMediaWithLikes(c.env.DB, event.id, likeActorKey),
    QRCode.toString(guestUrl, { type: "svg", width: 220, margin: 1, errorCorrectionLevel: "M" }),
    c.env.DB.prepare("SELECT author_name,message,created_at FROM event_guestbook_entries WHERE event_id=? AND status='approved' ORDER BY created_at DESC LIMIT 6")
      .bind(event.id).all<GuestbookPreview>().catch(() => ({ results: [] as GuestbookPreview[] })),
    c.env.DB.prepare("SELECT rsvp_enabled,guestbook_enabled,comments_enabled,slideshow_enabled FROM event_experience_settings WHERE event_id=?")
      .bind(event.id).first<WeddingExperienceSettings>().catch(() => null),
    c.env.DB.prepare(`SELECT p.business_name FROM event_professional_assignments a
      JOIN professional_profiles p ON p.user_id=a.professional_user_id
      WHERE a.event_id=? AND a.status='accepted' ORDER BY a.accepted_at DESC LIMIT 1`)
      .bind(event.id).first<{ business_name: string }>().catch(() => null),
    c.env.DB.prepare("SELECT * FROM event_wedding_menus WHERE event_id=?")
      .bind(event.id).first<WeddingMenuRow>().catch(() => null),
    getWeddingPortraitMap(c.env.DB, event.id),
    getWeddingMedia(c.env.DB, event.id),
  ]);
  const selectedFeatureKeys = featureRows.results.map((row) => row.feature_key);
  const settings: WeddingExperienceSettings = experienceSettings ?? {
    rsvp_enabled: selectedFeatureKeys.includes("rsvp") ? 1 : 0,
    guestbook_enabled: selectedFeatureKeys.includes("guestbook") ? 1 : 0,
    comments_enabled: selectedFeatureKeys.includes("guestbook") ? 1 : 0,
    slideshow_enabled: selectedFeatureKeys.includes("live_slideshow") ? 1 : 0,
  };
  const experience = renderWeddingExperience({
    code: event.code,
    eventName: event.eventName,
    locale,
    guestUrl,
    guestQrSvg: guestQrRaw.replace("<svg", '<svg class="block h-auto w-full"'),
    guestItems: allMedia.filter((item) => item.origin !== "official"),
    officialItems: officialMedia,
    guestbookEntries: guestbook.results,
    settings,
    curatorName: curator?.business_name ?? "Memboux Studio",
  });
  const previewTheme = authorizedPreview && c.req.query("theme")
    ? normalizeWeddingTheme(c.req.query("theme"))
    : profile.template_key;
  return c.html(renderWeddingPage({
    event,
    profile: { ...profile, template_key: previewTheme } as PublicWeddingProfile,
    locale,
    selectedFeatures: selectedFeatureKeys,
    coverUpdatedAt: cover?.updated_at ?? null,
    preview,
    menu,
    experienceHtml: experience.html,
    experienceScripts: experience.scripts,
    portraitMap,
    preWeddingMedia,
  }));
});

weddingRoutes.get("/wedding/:code/menu", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event || event.event_type !== "wedding") return c.text("Not found", 404);
  const profile = await c.env.DB.prepare("SELECT publish_status FROM event_wedding_profiles WHERE event_id=?")
    .bind(event.id).first<{ publish_status: "draft" | "published" }>();
  if (!profile) return c.text("Not found", 404);

  const user = await currentUser(c);
  const manager = Boolean(user && roleCan(await getEventRole(c.env.DB, event.id, user.id), "manage_event"));
  if (profile.publish_status !== "published" && !manager) return c.text("Not found", 404);
  if (!manager && !(await hasGalleryAccess(c.req.raw, event))) return c.text("Unauthorized", 401);

  const menu = await c.env.DB.prepare("SELECT * FROM event_wedding_menus WHERE event_id=?")
    .bind(event.id).first<WeddingMenuRow>();
  if (!menu) return c.text("Not found", 404);
  const object = await c.env.MEDIA.get(menu.object_key);
  if (!object) return c.text("Not found", 404);

  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Content-Type": menu.content_type,
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(menu.original_filename)}`,
    "X-Content-Type-Options": "nosniff",
  });
  if (menu.content_type === "application/pdf") headers.set("Content-Security-Policy", "sandbox; default-src 'none'");
  return new Response(object.body, { headers });
});

weddingRoutes.get("/dashboard/:code/wedding/setup", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.redirect(`/en/login`);
  const event = await ownedWedding(c.env.DB, c.req.param("code"), user.id);
  if (!event) return c.text("Wedding event not found", 404);
  const locale = normalizeLocale(c.req.query("lang") ?? event.default_locale);
  const profile = await ensureProfile(c.env.DB, event);
  if (!profile) return c.text("Wedding setup unavailable", 500);
  const requested = Number(c.req.query("step") ?? profile.wizard_step);
  const step = Math.max(1, Math.min(6, Number.isInteger(requested) ? requested : 1));
  const action = `/api/account/events/${event.code}/wedding/setup/${step}`;
  const previous = step > 1 ? `<a href="/dashboard/${event.code}/wedding/setup?lang=${locale}&step=${step - 1}" class="rounded-xl border border-[#d6e0dc] px-5 py-3 text-center font-semibold">${esc(localized(locale, "Back", "Πίσω", "Retour", "Zurück", "Atrás", "Indietro"))}</a>` : "";
  const nextLabel = step === 6 ? localized(locale, "Finish setup", "Ολοκλήρωση setup", "Terminer", "Einrichtung abschließen", "Finalizar", "Completa configurazione") : localized(locale, "Save & continue", "Αποθήκευση & συνέχεια", "Enregistrer et continuer", "Speichern & weiter", "Guardar y continuar", "Salva e continua");
  let content = "";
  if (step === 1) {
    const selectedTheme = weddingThemeFor(profile.template_key);
    const previewLabel = localized(locale, "Preview", "Προεπισκόπηση", "Aperçu", "Vorschau", "Vista previa", "Anteprima");
    const selectedLabel = localized(locale, "Selected", "Επιλεγμένο", "Sélectionné", "Ausgewählt", "Seleccionado", "Selezionato");
    const themePickerStyles = `<style>.w-template-preview{position:relative;height:13rem;overflow:hidden;background:var(--preview-bg);color:var(--preview-bg);box-sizing:border-box}.w-template-image{position:absolute;inset:0;background:linear-gradient(135deg,color-mix(in srgb,var(--preview-soft) 75%,#fff),var(--preview-ink));opacity:.88}.w-template-image:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 20%,var(--preview-ink) 115%)}.w-template-copy{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1.3rem;text-align:center;text-shadow:0 2px 12px #0008;box-sizing:border-box;width:100%}.w-template-copy small{font:650 .42rem/1 Manrope,sans-serif;letter-spacing:.24em}.w-template-copy b{margin:.7rem 0;font:400 2.3rem/.85 var(--preview-font);letter-spacing:-.06em;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.w-template-copy em{font-weight:400}.w-template-frame{display:none;position:absolute;z-index:1;inset:.7rem;border:1px solid color-mix(in srgb,var(--preview-bg) 75%,transparent)}.w-template-preview[data-preview-layout=editorial] .w-template-copy{align-items:flex-start;justify-content:flex-end;text-align:left}.w-template-preview[data-preview-layout=editorial] .w-template-image:after,.w-template-preview[data-preview-layout=split] .w-template-image:after{background:linear-gradient(90deg,var(--preview-ink) 0 43%,transparent 90%)}.w-template-preview[data-preview-layout=split] .w-template-copy{right:48%;align-items:flex-start;text-align:left}.w-template-preview[data-preview-layout=framed] .w-template-frame{display:block}.w-template-preview[data-preview-layout=framed] .w-template-copy{inset:1rem}.w-template-preview[data-preview-layout=poster] .w-template-copy{align-items:flex-start;text-align:left}.w-template-preview[data-preview-layout=poster] .w-template-copy b{font-family:Manrope,sans-serif;font-size:2.65rem;font-weight:250;text-transform:uppercase}.w-template-card:hover{transform:translateY(-2px);box-shadow:0 14px 35px #183c3312}@media(max-width:639px){.w-template-preview{height:15rem}}</style>`;
    const themeCards = '<style>.w-template-preview{color:#fff}</style>' + themePickerStyles + weddingThemes.map((theme) => {
      const previewFont = theme.font === "modern" ? "Manrope,Arial,sans-serif" : theme.font === "didot" ? "'GFS Didot',Georgia,serif" : theme.font === "noto-serif" ? "'Noto Serif',Georgia,serif" : "'EB Garamond',Georgia,serif";
      return `<article class="w-template-card relative overflow-hidden rounded-2xl border-2 border-[#d8e2de] bg-white transition-all" data-selected="${selectedTheme.key === theme.key}"><label class="block cursor-pointer"><span class="w-template-selected" aria-hidden="true"><span>✓</span>${esc(selectedLabel)}</span><input class="sr-only template-radio" type="radio" name="templateKey" value="${theme.key}" data-accent="${theme.defaultAccent}" ${selectedTheme.key === theme.key ? "checked" : ""}><span class="w-template-preview block" data-preview-layout="${theme.layout}" style="--preview-ink:${theme.palette[0]};--preview-soft:${theme.palette[1]};--preview-bg:${theme.palette[2]};--preview-font:${previewFont}"><i class="w-template-image"></i><i class="w-template-frame"></i><span class="w-template-copy"><small>THE WEDDING OF</small><b>A <em>&</em> B</b><small>18 · 07 · 2027</small></span></span><span class="block p-4 pb-3"><span class="flex items-start justify-between gap-3"><strong class="block text-[#183c33]">${esc(theme.name[locale])}</strong><i class="mt-1 h-5 w-5 shrink-0 rounded-full border-2 border-white bg-[#2f6b5b] opacity-0 shadow-[0_0_0_2px_#2f6b5b] transition-all ${selectedTheme.key === theme.key ? "opacity-100 scale-110" : ""}"></i></span><span class="mt-1 block min-h-10 text-xs leading-5 text-[#687a74]">${esc(theme.description[locale])}</span><span class="mt-3 flex gap-1.5">${theme.palette.map((color) => `<i class="h-2 flex-1 rounded-full" style="background:${color}"></i>`).join("")}</span></span></label><a href="/wedding/${encodeURIComponent(event.code)}?lang=${locale}&preview=1&theme=${theme.key}" target="_blank" rel="noopener" class="mx-4 mb-4 block rounded-lg border border-[#d8e2de] px-3 py-2 text-center text-xs font-semibold text-[#2f6b5b] hover:bg-[#f1f6f4]">${esc(previewLabel)} ↗</a></article>`;

    }).join("");
    content = `<div class="max-w-3xl"><p class="text-xs font-bold uppercase tracking-[.18em] text-[#2f6b5b]">01 · Style & story</p><h2 class="mt-2 text-3xl">${esc(localized(locale, "Choose a template and introduce yourselves", "Επίλεξε template και σύστησε το ζευγάρι", "Choisissez un modèle et présentez-vous", "Wähle eine Vorlage und stellt euch vor", "Elige una plantilla y presentaos", "Scegli un template e presentatevi"))}</h2><p class="mt-2 text-sm leading-6 text-[#687a74]">${esc(localized(locale, "Every template uses the same content, with its own visual identity. Empty sections are hidden automatically.", "Κάθε template χρησιμοποιεί το ίδιο περιεχόμενο με διαφορετική αισθητική. Οι κενές ενότητες κρύβονται αυτόματα.", "Chaque modèle utilise le même contenu avec une identité visuelle différente.", "Jede Vorlage nutzt dieselben Inhalte mit eigener Ästhetik.", "Cada plantilla usa el mismo contenido con una estética propia.", "Ogni template usa gli stessi contenuti con una propria estetica."))}</p></div><form action="${action}" method="post" class="mt-7 grid gap-5 sm:grid-cols-2"><input type="hidden" name="locale" value="${locale}"><fieldset class="sm:col-span-2"><legend class="text-sm font-semibold text-[#344941]">${esc(localized(locale, "Website template", "Template ιστοσελίδας", "Modèle du site", "Website-Vorlage", "Plantilla del sitio", "Template del sito"))}</legend><div class="mt-3 grid gap-3 md:grid-cols-3">${themeCards}</div></fieldset><label class="sm:col-span-2 block rounded-2xl bg-[#f3f7f5] p-4 text-sm font-semibold text-[#344941]">${esc(localized(locale, "Accent colour", "Χρώμα λεπτομερειών", "Couleur d’accent", "Akzentfarbe", "Color de acento", "Colore accento"))}<span class="mt-3 flex items-center gap-3"><input name="accentColor" type="color" value="${esc(profile.accent_color ?? selectedTheme.defaultAccent)}" class="h-11 w-16 cursor-pointer rounded-lg border border-[#d6e0dc] bg-white p-1"><small class="font-normal text-[#687a74]">${esc(localized(locale, "You can change this later.", "Μπορείς να το αλλάξεις αργότερα.", "Modifiable plus tard.", "Später änderbar.", "Puedes cambiarlo después.", "Puoi cambiarlo in seguito."))}</small></span></label>${field(localized(locale, "First partner", "Πρώτο άτομο", "Première personne", "Erste Person", "Primera persona", "Prima persona"), "partnerOneName", profile.partner_one_name, { required: true, max: 80 })}${field(localized(locale, "Second partner", "Δεύτερο άτομο", "Deuxième personne", "Zweite Person", "Segunda persona", "Seconda persona"), "partnerTwoName", profile.partner_two_name, { required: true, max: 80 })}<div class="sm:col-span-2">${field(localized(locale, "Welcome message", "Μήνυμα καλωσορίσματος", "Message de bienvenue", "Willkommensnachricht", "Mensaje de bienvenida", "Messaggio di benvenuto"), "welcomeMessage", profile.welcome_message, { max: 180, placeholder: localized(locale, "We cannot wait to celebrate with you.", "Ανυπομονούμε να γιορτάσουμε μαζί σας.", "Nous avons hâte de célébrer avec vous.", "Wir freuen uns, mit euch zu feiern.", "Estamos deseando celebrarlo con vosotros.", "Non vediamo l’ora di festeggiare con voi.") })}</div><div class="sm:col-span-2">${area(localized(locale, "Your story", "Η ιστορία σας", "Votre histoire", "Eure Geschichte", "Vuestra historia", "La vostra storia"), "story", profile.story)}</div><div class="flex gap-3 sm:col-span-2">${previous}<button class="ml-auto rounded-xl bg-[#2f6b5b] px-6 py-3 font-semibold text-white">${esc(nextLabel)}</button></div></form>`;
    content = weddingTemplatePickerStyles + content;
    content += `<script>(()=>{const form=document.querySelector('form[action="${action}"]'),accent=form?.querySelector('input[name="accentColor"]');form?.querySelectorAll('.template-radio').forEach(input=>{input.addEventListener('change',()=>{if(input.checked&&accent)accent.value=input.dataset.accent;document.querySelectorAll('.w-template-card').forEach(card=>{const isSelected=Boolean(card.querySelector('.template-radio')?.checked);card.dataset.selected=String(isSelected);const tick=card.querySelector('i.h-5');if(tick){tick.classList.toggle('opacity-100',isSelected);tick.classList.toggle('scale-110',isSelected)}})})})})()<\/script>`;

  } else if (step === 2) {
    const [portraitRows, weddingMedia] = await Promise.all([
      c.env.DB.prepare(`
        SELECT p.slot, wm.id AS media_id, wm.object_key
        FROM event_wedding_portrait_assignments p
        JOIN event_wedding_media wm ON wm.id = p.media_id
        WHERE p.event_id = ?
      `).bind(event.id).all<{ slot: string; media_id: string; object_key: string }>(),
      getWeddingMedia(c.env.DB, event.id),
    ]);
    const portraitMap: Record<string, string | null> = { hero: null, story: null, divider_1: null, divider_2: null, divider_3: null };
    const portraitMediaIds: Record<string, string | null> = { hero: null, story: null, divider_1: null, divider_2: null, divider_3: null };
    for (const row of portraitRows.results) {
      portraitMap[row.slot] = row.object_key;
      portraitMediaIds[row.slot] = row.media_id;
    }

    const portraitSlots = ["hero", "story", "divider_1", "divider_2", "divider_3"] as const;
    const slotLabels: Record<string, string> = {
      hero: localized(locale, "Hero slideshow", "Hero slideshow", "Diaporama principal", "Hero-Slideshow", "Presentación principal", "Slideshow principale"),
      story: localized(locale, "Couple portrait", "Πορτρέτο ζευγαριού", "Portrait du couple", "Paarporträt", "Retrato de pareja", "Ritratto della coppia"),
      divider_1: localized(locale, "Opening portrait", "Εναρκτήριο πορτρέτο", "Portrait d’ouverture", "Eröffnungsporträt", "Retrato de apertura", "Ritratto di apertura"),
      divider_2: localized(locale, "Celebration transition", "Μετάβαση γιορτής", "Transition célébration", "Feier-Übergang", "Transición de celebración", "Transizione celebrazione"),
      divider_3: localized(locale, "Guest experience transition", "Μετάβαση εμπειρίας καλεσμένων", "Transition expérience invités", "Gästeerlebnis-Übergang", "Transición de invitados", "Transizione esperienza ospiti"),
    };
    const slotDescriptions: Record<string, string> = {
      hero: localized(locale, "Leads the opening slideshow; more gallery photos rotate automatically.", "Ξεκινά το slideshow της αρχικής· περισσότερες gallery φωτογραφίες εναλλάσσονται αυτόματα.", "Ouvre le diaporama; d’autres photos alternent automatiquement.", "Startet die Slideshow; weitere Fotos wechseln automatisch.", "Abre la presentación; más fotos rotan automáticamente.", "Apre lo slideshow; altre foto ruotano automaticamente."),
      story: localized(locale, "Appears beside your story in an editorial portrait layout.", "Εμφανίζεται δίπλα στην ιστορία σας σε editorial σύνθεση.", "Apparaît près de votre histoire dans une mise en page éditoriale.", "Erscheint neben eurer Geschichte im Editorial-Layout.", "Aparece junto a vuestra historia en un diseño editorial.", "Appare accanto alla vostra storia in un layout editoriale."),
      divider_1: localized(locale, "A full-width photograph between your story and the schedule.", "Φωτογραφία πλήρους πλάτους ανάμεσα στην ιστορία και το πρόγραμμα.", "Une photo pleine largeur entre l’histoire et le programme.", "Ein Vollbildfoto zwischen Geschichte und Ablauf.", "Una foto a todo ancho entre la historia y el programa.", "Una foto a tutta larghezza tra storia e programma."),
      divider_2: localized(locale, "A cinematic pause before the pre-wedding photo story.", "Μια κινηματογραφική παύση πριν από το pre-wedding photo story.", "Une pause cinématographique avant le récit photo.", "Eine filmische Pause vor der Fotostrecke.", "Una pausa cinematográfica antes del relato fotográfico.", "Una pausa cinematografica prima del racconto fotografico."),
      divider_3: localized(locale, "Connects the wedding details with the guest experience.", "Συνδέει τις πληροφορίες του γάμου με την εμπειρία καλεσμένων.", "Relie les détails du mariage à l’expérience des invités.", "Verbindet Hochzeitsdetails und Gästeerlebnis.", "Conecta los detalles de la boda con la experiencia de invitados.", "Collega i dettagli del matrimonio all’esperienza ospiti."),
    };
    const preWeddingImages = weddingMedia.filter((m) => m.media_type === "image");
    const galleryHtml = preWeddingImages.map((m) => {
      const assignedTo = Object.entries(portraitMap).find(([, v]) => v === m.object_key)?.[0];
      return `<button type="button" class="gallery-pick group relative h-28 w-28 overflow-hidden rounded-xl border-2 ${assignedTo ? "border-[#2f6b5b]" : "border-transparent"} bg-[#e7f1ed] hover:border-[#2f6b5b] transition" data-media-id="${esc(m.id)}" data-object-key="${esc(m.object_key)}"><img src="/wedding-media/${encodeURIComponent(m.id)}?variant=thumb" alt="" class="h-full w-full object-cover" loading="lazy">${assignedTo ? `<span class="absolute bottom-0 left-0 right-0 bg-[#2f6b5b] px-1 py-0.5 text-[9px] font-bold text-white text-center">${esc(slotLabels[assignedTo])}</span>` : ""}</button>`;
    }).join("");
    const modal = `<div id="portrait-modal" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/40 p-4" style="display:none" role="dialog" aria-modal="true"><div class="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"><div class="flex items-center justify-between"><h3 id="portrait-modal-title" class="text-xl font-bold text-[#183c33]"></h3><button type="button" id="portrait-modal-close" class="rounded-full p-2 text-[#687a74] hover:bg-[#f3f7f5]" aria-label="${esc(localized(locale, "Close", "Κλείσιμο", "Fermer", "Schließen", "Cerrar", "Chiudi"))}">✕</button></div><div class="mt-4"><form id="portrait-upload-form" action="/api/account/events/${encodeURIComponent(event.code)}/wedding/media/upload" method="post" enctype="multipart/form-data" class="flex flex-col gap-3 rounded-2xl border-2 border-dashed border-[#d6e0dc] p-4 sm:flex-row sm:items-end"><input type="hidden" name="locale" value="${locale}"><input id="portrait-upload-slot" type="hidden" name="slot" value=""><label class="min-w-0 flex-1 cursor-pointer text-sm font-semibold text-[#344941]">${esc(localized(locale, "Upload new photos", "Ανέβασε νέες φωτογραφίες", "Télécharger de nouvelles photos", "Neue Fotos hochladen", "Subir nuevas fotos", "Carica nuove foto"))}<input name="file" type="file" required multiple accept="image/jpeg,image/png,image/webp,image/gif" class="mt-2 block w-full cursor-pointer rounded-xl border border-[#d6e0dc] bg-white px-3 py-2 text-sm"><small class="mt-2 block font-normal leading-5 text-[#687a74]">${esc(localized(locale, "The first photo fills this position. Every additional photo joins the pre-wedding gallery and the template can use it automatically.", "Η πρώτη φωτογραφία γεμίζει αυτή τη θέση. Κάθε επιπλέον φωτογραφία μπαίνει στο pre-wedding gallery και το template μπορεί να τη χρησιμοποιήσει αυτόματα.", "La première photo remplit cet emplacement; les autres rejoignent la galerie pré-mariage.", "Das erste Foto füllt diese Position; weitere kommen in die Pre-Wedding-Galerie.", "La primera foto ocupa esta posición; las demás se añaden a la galería pre-boda.", "La prima foto riempie questa posizione; le altre entrano nella galleria pre-matrimonio."))}</small></label><button data-portrait-upload-submit class="rounded-xl bg-[#183c33] px-5 py-3 font-semibold text-white disabled:cursor-wait disabled:opacity-60">${esc(localized(locale, "Upload & place", "Ανέβασμα & τοποθέτηση", "Télécharger et placer", "Hochladen & einsetzen", "Subir y colocar", "Carica e inserisci"))}</button></form><p id="portrait-action-error" class="mt-2 hidden rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700" role="alert"></p></div>${weddingMedia.length ? `<div class="mt-4"><p class="text-xs font-semibold text-[#344941]">${esc(localized(locale, "Or choose from gallery", "Ή επίλεξε από το gallery", "Ou choisissez dans la galerie", "Oder aus der Galerie wählen", "O elige de la galería", "Oppure scegli dalla galleria"))}</p><div class="mt-2 flex flex-wrap gap-3">${galleryHtml}</div></div>` : `<div class="mt-6 rounded-xl border-2 border-dashed border-[#d6e0dc] p-6 text-center text-sm text-[#687a74]">${esc(localized(locale, "Upload one or more photos above. The first fills this position and the rest build your photo story.", "Ανέβασε μία ή περισσότερες φωτογραφίες. Η πρώτη γεμίζει τη θέση και οι υπόλοιπες χτίζουν το photo story σας.", "Ajoutez une ou plusieurs photos; la première remplit cet emplacement.", "Lade ein oder mehrere Fotos hoch; das erste füllt diese Position.", "Sube una o varias fotos; la primera ocupa esta posición.", "Carica una o più foto; la prima riempie questa posizione."))}</div>`}</div></div>`;
    const portraitSection = `<div class="mt-4 grid gap-3 sm:grid-cols-2">${portraitSlots.map((slot) => {
      const assigned = portraitMap[slot];
      const assignedMediaId = portraitMediaIds[slot];
      const label = slotLabels[slot];
      return `<div class="rounded-xl border border-[#d9e5e0] bg-white p-3"><div class="flex items-center justify-between gap-2"><strong class="text-sm text-[#183c33]">${esc(label)}</strong>${assigned ? `<button type="button" class="portrait-remove-btn text-xs font-semibold text-red-600 hover:text-red-800" data-slot="${slot}">${esc(localized(locale, "Remove", "Αφαίρεση", "Supprimer", "Entfernen", "Eliminar", "Rimuovi"))}</button>` : ""}</div><p class="mt-1 min-h-10 text-xs leading-5 text-[#687a74]">${esc(slotDescriptions[slot])}</p>${assigned ? `<button type="button" class="slot-pick-btn block w-full" data-slot="${slot}"><img src="/wedding-media/${encodeURIComponent(assignedMediaId ?? "")}?variant=thumb" alt="" class="mt-2 h-32 w-full rounded-lg object-cover"></button>` : `<button type="button" class="slot-pick-btn mt-2 flex h-32 w-full items-center justify-center rounded-lg border-2 border-dashed border-[#d6e0dc] text-xs text-[#687a74] hover:border-[#2f6b5b] hover:bg-[#edf4f1] transition" data-slot="${slot}">+ ${esc(localized(locale, "Add photo", "Προσθήκη φωτογραφίας", "Ajouter une photo", "Foto hinzufügen", "Añadir foto", "Aggiungi foto"))}</button>`}</div>`;


    }).join("")}</div>`;
    const libraryCards = preWeddingImages.map((media, index) => {
      const assignedSlots = Object.entries(portraitMap).filter(([, key]) => key === media.object_key).map(([slot]) => slotLabels[slot]);
      const deferred = index >= 12;
      return `<article data-wedding-library-card class="group relative overflow-hidden rounded-2xl border border-[#d9e5e0] bg-[#edf3f0]${deferred ? " hidden" : ""}"><img ${deferred ? `data-library-src="/wedding-media/${encodeURIComponent(media.id)}?variant=thumb"` : `src="/wedding-media/${encodeURIComponent(media.id)}?variant=thumb"`} alt="" loading="lazy" decoding="async" class="aspect-[4/3] w-full object-cover"><div class="flex min-h-12 items-center justify-between gap-2 bg-white px-3 py-2">${assignedSlots.length ? `<span class="min-w-0 truncate text-[10px] font-bold text-[#2f6b5b]" title="${esc(assignedSlots.join(", "))}">${esc(assignedSlots.join(" · "))}</span>` : `<span class="text-[10px] font-semibold text-[#7a8984]">${esc(localized(locale, "In library", "Στη βιβλιοθήκη", "Dans la bibliothèque", "In der Bibliothek", "En la biblioteca", "Nella libreria"))}</span>`}<form data-wedding-media-delete action="/api/account/events/${encodeURIComponent(event.code)}/wedding/media/${encodeURIComponent(media.id)}/delete" method="post"><input type="hidden" name="locale" value="${locale}"><button type="submit" class="flex h-8 w-8 items-center justify-center rounded-full text-red-600 transition hover:bg-red-50" aria-label="${esc(localized(locale, "Delete photo", "Διαγραφή φωτογραφίας", "Supprimer la photo", "Foto löschen", "Eliminar foto", "Elimina foto"))}" title="${esc(localized(locale, "Delete photo", "Διαγραφή φωτογραφίας", "Supprimer la photo", "Foto löschen", "Eliminar foto", "Elimina foto"))}"><svg aria-hidden="true" viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/></svg></button></form></div></article>`;
    }).join("");
    const librarySection = `<section class="mt-8 rounded-3xl border border-[#dce6e2] bg-[#f6f9f7] p-4 sm:p-6"><div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p class="text-xs font-bold uppercase tracking-[.16em] text-[#2f6b5b]">${esc(localized(locale, "Pre-wedding library", "Pre-wedding βιβλιοθήκη", "Bibliothèque pré-mariage", "Pre-Wedding-Bibliothek", "Biblioteca pre-boda", "Libreria pre-matrimonio"))}</p><h3 class="mt-1 text-2xl text-[#183c33]">${esc(localized(locale, "All your photos in one place", "Όλες οι φωτογραφίες σε ένα σημείο", "Toutes vos photos au même endroit", "Alle Fotos an einem Ort", "Todas las fotos en un solo lugar", "Tutte le foto in un unico posto"))}</h3><p class="mt-2 max-w-2xl text-xs leading-5 text-[#687a74]">${esc(localized(locale, "Delete unused photos here. If a placed photo is removed, its template position is cleared automatically.", "Διέγραψε εδώ φωτογραφίες που δεν χρειάζεσαι. Αν μια φωτογραφία χρησιμοποιείται στο template, η θέση της καθαρίζει αυτόματα.", "Supprimez ici les photos inutilisées; leur emplacement sera aussi libéré.", "Lösche hier ungenutzte Fotos; ihre Template-Position wird automatisch geleert.", "Elimina aquí las fotos que no uses; su posición también se liberará.", "Elimina qui le foto inutilizzate; la posizione nel template verrà liberata."))}</p></div><span class="w-fit rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#2f6b5b]">${preWeddingImages.length} ${esc(localized(locale, "photos", "φωτογραφίες", "photos", "Fotos", "fotos", "foto"))}</span></div><form action="/api/account/events/${encodeURIComponent(event.code)}/wedding/media/upload" method="post" enctype="multipart/form-data" class="mt-5 flex flex-col gap-3 rounded-2xl border border-dashed border-[#bdcec7] bg-white p-4 sm:flex-row sm:items-end"><input type="hidden" name="locale" value="${locale}"><label class="min-w-0 flex-1 cursor-pointer text-sm font-semibold text-[#344941]">${esc(localized(locale, "Add photos to the library", "Προσθήκη φωτογραφιών στη βιβλιοθήκη", "Ajouter des photos", "Fotos hinzufügen", "Añadir fotos", "Aggiungi foto"))}<input name="file" type="file" required multiple accept="image/jpeg,image/png,image/webp,image/gif" class="mt-2 block w-full cursor-pointer rounded-xl border border-[#d6e0dc] bg-white px-3 py-2 text-sm"></label><button class="rounded-xl bg-[#183c33] px-5 py-3 font-semibold text-white">${esc(localized(locale, "Upload photos", "Ανέβασμα φωτογραφιών", "Ajouter", "Hochladen", "Subir", "Carica"))}</button></form>${preWeddingImages.length ? `<div data-wedding-library class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">${libraryCards}</div>${preWeddingImages.length > 12 ? `<div class="mt-5 text-center"><button type="button" data-wedding-library-more class="rounded-full border border-[#c9d8d2] bg-white px-5 py-2.5 text-sm font-semibold text-[#2f6b5b]">${esc(localized(locale, "Show more photos", "Προβολή περισσότερων φωτογραφιών", "Afficher plus", "Mehr Fotos", "Mostrar más", "Mostra altre"))}</button></div>` : ""}` : `<p class="mt-5 rounded-2xl border border-dashed border-[#cad8d2] bg-white p-8 text-center text-sm text-[#687a74]">${esc(localized(locale, "Your pre-wedding library is empty.", "Η pre-wedding βιβλιοθήκη είναι άδεια.", "Votre bibliothèque est vide.", "Deine Bibliothek ist leer.", "Tu biblioteca está vacía.", "La libreria è vuota."))}</p>`}</section>`;
    const script = `<script>(()=>{let activeSlot=null;const modal=document.getElementById('portrait-modal'),title=document.getElementById('portrait-modal-title'),closeBtn=document.getElementById('portrait-modal-close'),slotInput=document.getElementById('portrait-upload-slot'),uploadForm=document.getElementById('portrait-upload-form'),uploadButton=uploadForm?.querySelector('[data-portrait-upload-submit]'),errorBox=document.getElementById('portrait-action-error');const message=${JSON.stringify(localized(locale, "The photo could not be saved. Please try again.", "Η φωτογραφία δεν αποθηκεύτηκε. Δοκίμασε ξανά.", "La photo n’a pas pu être enregistrée. Réessayez.", "Das Foto konnte nicht gespeichert werden. Versuche es erneut.", "No se pudo guardar la foto. Inténtalo de nuevo.", "Impossibile salvare la foto. Riprova."))};const showError=()=>{if(errorBox){errorBox.textContent=message;errorBox.classList.remove('hidden')}};const close=()=>{modal.style.display='none';activeSlot=null;if(slotInput)slotInput.value='';errorBox?.classList.add('hidden')};document.querySelectorAll('.slot-pick-btn').forEach(btn=>{btn.addEventListener('click',()=>{activeSlot=btn.dataset.slot||null;if(slotInput)slotInput.value=activeSlot||'';const slotDiv=btn.closest('.rounded-xl');title.textContent=slotDiv?.querySelector('strong')?.textContent||'';errorBox?.classList.add('hidden');modal.style.display='flex'})});closeBtn.addEventListener('click',close);modal.addEventListener('click',(e)=>{if(e.target===modal)close()});uploadForm?.addEventListener('submit',event=>{if(!activeSlot){event.preventDefault();showError();return}if(uploadButton)uploadButton.disabled=true});document.querySelectorAll('.gallery-pick').forEach(el=>{el.addEventListener('click',async()=>{if(!activeSlot)return;const mediaId=el.dataset.mediaId;if(!mediaId)return;el.disabled=true;errorBox?.classList.add('hidden');const form=new FormData();form.set('slot',activeSlot);form.set('mediaId',mediaId);try{const response=await fetch('/api/account/events/${encodeURIComponent(event.code)}/wedding/portraits',{method:'POST',credentials:'include',body:form});if(!response.ok)throw new Error('assign_failed');location.reload()}catch{el.disabled=false;showError()}})});document.querySelectorAll('.portrait-remove-btn').forEach(btn=>{btn.addEventListener('click',async(e)=>{e.stopPropagation();const slot=btn.dataset.slot;if(!slot)return;btn.disabled=true;try{const response=await fetch('/api/account/events/${encodeURIComponent(event.code)}/wedding/portraits/'+encodeURIComponent(slot),{method:'DELETE',credentials:'include'});if(!response.ok)throw new Error('remove_failed');location.reload()}catch{btn.disabled=false;showError()}})})})()<\/script>`;
    const libraryScript = `<script>(()=>{const cards=[...document.querySelectorAll('[data-wedding-library-card]')],more=document.querySelector('[data-wedding-library-more]');let visible=12;const render=()=>{cards.forEach((card,index)=>{const show=index<visible;card.classList.toggle('hidden',!show);if(show)card.querySelectorAll('[data-library-src]').forEach(image=>{image.src=image.dataset.librarySrc;delete image.dataset.librarySrc})});more?.classList.toggle('hidden',visible>=cards.length)};more?.addEventListener('click',()=>{visible+=12;render()});document.querySelectorAll('[data-wedding-media-delete]').forEach(form=>form.addEventListener('submit',event=>{if(!confirm(${JSON.stringify(localized(locale, "Delete this photo permanently from the pre-wedding library? Any template placement using it will also be cleared.", "Να διαγραφεί οριστικά αυτή η φωτογραφία από την pre-wedding βιβλιοθήκη; Θα καθαριστεί και κάθε θέση του template που τη χρησιμοποιεί.", "Supprimer définitivement cette photo et ses emplacements ?", "Dieses Foto und seine Template-Positionen dauerhaft löschen?", "¿Eliminar definitivamente esta foto y sus posiciones?", "Eliminare definitivamente questa foto e le sue posizioni?"))}))event.preventDefault()}));render()})()<\/script>`;
    content = `<p class="text-xs font-bold uppercase tracking-[.18em] text-[#2f6b5b]">02 · Photo story</p><h2 class="mt-2 text-3xl">${esc(localized(locale, "Pre-wedding photo story", "Pre-wedding φωτογραφική ιστορία", "Récit photo pré-mariage", "Pre-Wedding-Fotostrecke", "Historia fotográfica pre-boda", "Racconto fotografico pre-matrimonio"))}</h2><p class="mt-2 text-sm leading-6 text-[#687a74]">${esc(localized(locale, "All uploaded photos become part of the template’s visual story. Use these five positions to choose the leading images; the rest automatically build the hero slideshow and editorial gallery.", "Όλες οι φωτογραφίες που ανεβάζετε γίνονται μέρος της οπτικής ιστορίας του template. Με αυτές τις πέντε θέσεις ορίζετε τις βασικές εικόνες· οι υπόλοιπες χτίζουν αυτόματα το hero slideshow και το editorial gallery.", "Toutes les photos alimentent le récit visuel. Ces cinq emplacements définissent les images principales; les autres composent le diaporama et la galerie.", "Alle Fotos werden Teil der visuellen Geschichte. Diese fünf Positionen bestimmen die Hauptbilder; weitere Fotos bilden Slideshow und Galerie.", "Todas las fotos forman parte de la historia visual. Estas cinco posiciones definen las imágenes principales; las demás crean la presentación y la galería.", "Tutte le foto entrano nel racconto visivo. Queste cinque posizioni definiscono le immagini principali; le altre creano slideshow e galleria."))}</p><div class="mt-4 inline-flex rounded-full bg-[#edf4f1] px-3 py-1.5 text-xs font-bold text-[#2f6b5b]">${preWeddingImages.length} ${esc(localized(locale, "photos in your story", "φωτογραφίες στην ιστορία σας", "photos dans votre récit", "Fotos in eurer Geschichte", "fotos en vuestra historia", "foto nel vostro racconto"))}</div>${portraitSection}${librarySection}${modal}<form action="${action}" method="post" class="mt-7"><input type="hidden" name="locale" value="${locale}"><div class="mt-6 flex gap-3">${previous}<button class="ml-auto rounded-xl bg-[#2f6b5b] px-6 py-3 font-semibold text-white">${esc(nextLabel)}</button></div></form>${script}${libraryScript}`;




  } else if (step === 3) {
    const ceremonyLocation = weddingLocationPicker(locale, "ceremony", profile);
    const receptionLocation = weddingLocationPicker(locale, "reception", profile);
    content = `<p class="text-xs font-bold uppercase tracking-[.18em] text-[#2f6b5b]">03 · Schedule</p><h2 class="mt-2 text-3xl">${esc(localized(locale, "Ceremony & celebration", "Τελετή & δεξίωση", "Cérémonie et réception", "Zeremonie & Feier", "Ceremonia y celebración", "Cerimonia e ricevimento"))}</h2><p class="mt-2 text-sm leading-6 text-[#687a74]">${esc(localized(locale, "Search Google Places and choose a result so directions remain accurate for every guest.", "Αναζήτησε στο Google Places και επίλεξε αποτέλεσμα ώστε οι οδηγίες να παραμένουν σωστές για κάθε καλεσμένο.", "Recherchez le lieu avec Google Places et choisissez un résultat.", "Suche den Ort mit Google Places und wähle ein Ergebnis.", "Busca el lugar con Google Places y elige un resultado.", "Cerca il luogo con Google Places e scegli un risultato."))}</p><form action="${action}" method="post" class="mt-7 grid gap-5 sm:grid-cols-2"><input type="hidden" name="locale" value="${locale}">${field(localized(locale, "Ceremony date & time", "Ημερομηνία & ώρα τελετής", "Date et heure de cérémonie", "Datum & Uhrzeit der Zeremonie", "Fecha y hora de ceremonia", "Data e ora cerimonia"), "ceremonyAt", profile.ceremony_at ?? "", { type: "datetime-local", max: 16 })}<label class="block text-sm font-semibold text-[#344941]">${esc(localized(locale, "Ceremony location", "Τοποθεσία τελετής", "Lieu de cérémonie", "Ort der Zeremonie", "Lugar de ceremonia", "Luogo cerimonia"))}${ceremonyLocation}</label>${field(localized(locale, "Reception date & time", "Ημερομηνία & ώρα δεξίωσης", "Date et heure de réception", "Datum & Uhrzeit der Feier", "Fecha y hora de recepción", "Data e ora ricevimento"), "receptionAt", profile.reception_at ?? "", { type: "datetime-local", max: 16 })}<label class="block text-sm font-semibold text-[#344941]">${esc(localized(locale, "Reception location", "Τοποθεσία δεξίωσης", "Lieu de réception", "Ort der Feier", "Lugar de recepción", "Luogo ricevimento"))}${receptionLocation}</label><div class="sm:col-span-2">${field(localized(locale, "Dress code or useful note", "Dress code ή χρήσιμη σημείωση", "Tenue ou note utile", "Dresscode oder Hinweis", "Código de vestimenta o nota", "Dress code o nota utile"), "dressCode", profile.dress_code, { max: 180 })}</div><div class="flex gap-3 sm:col-span-2">${previous}<button class="ml-auto rounded-xl bg-[#2f6b5b] px-6 py-3 font-semibold text-white">${esc(nextLabel)}</button></div></form>${locationPickerScript(locale)}`;
  } else if (step === 4) {
    const menu = await c.env.DB.prepare("SELECT * FROM event_wedding_menus WHERE event_id=?").bind(event.id).first<WeddingMenuRow>();
    const menuStatus = menu ? `<div class="flex flex-col gap-3 rounded-2xl border border-[#d9e5e0] bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div class="min-w-0"><strong class="block truncate text-[#183c33]">${esc(menu.original_filename)}</strong><span class="text-xs text-[#687a74]">${Math.max(0.1, menu.size_bytes / 1048576).toFixed(1)} MB · ${menu.content_type === "application/pdf" ? "PDF" : localized(locale, "Image", "Εικόνα", "Image", "Bild", "Imagen", "Immagine")}</span></div><div class="flex gap-2"><a href="/wedding/${encodeURIComponent(event.code)}/menu" target="_blank" class="rounded-xl border border-[#d6e0dc] px-3 py-2 text-xs font-semibold">${esc(localized(locale, "Preview", "Προεπισκόπηση", "Aperçu", "Vorschau", "Vista previa", "Anteprima"))}</a><form action="/api/account/events/${encodeURIComponent(event.code)}/wedding/menu/delete" method="post"><input type="hidden" name="locale" value="${locale}"><button class="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">${esc(localized(locale, "Remove", "Αφαίρεση", "Supprimer", "Entfernen", "Eliminar", "Rimuovi"))}</button></form></div></div>` : `<p class="text-sm text-[#687a74]">${esc(localized(locale, "No menu has been uploaded. This section will stay hidden from guests.", "Δεν έχει ανέβει menu. Η ενότητα θα παραμείνει κρυφή από τους καλεσμένους.", "Aucun menu n’a été ajouté.", "Es wurde noch kein Menü hochgeladen.", "No se ha subido ningún menú.", "Nessun menu è stato caricato."))}</p>`;
    const menuUpload = `<section class="mt-7 rounded-2xl bg-[#f3f7f5] p-5"><p class="text-xs font-bold uppercase tracking-[.14em] text-[#2f6b5b]">${esc(localized(locale, "Optional wedding menu", "Προαιρετικό menu γάμου", "Menu de mariage facultatif", "Optionales Hochzeitsmenü", "Menú de boda opcional", "Menu matrimonio facoltativo"))}</p><h3 class="mt-2 text-2xl text-[#183c33]">${esc(localized(locale, "Add the food & drinks menu", "Πρόσθεσε το menu φαγητού & ποτών", "Ajoutez le menu du repas", "Speise- und Getränkekarte hinzufügen", "Añade el menú de comida y bebida", "Aggiungi il menu di cibo e bevande"))}</h3><p class="mt-2 text-sm leading-6 text-[#687a74]">JPG, PNG, WebP or PDF · max 15 MB</p><div class="mt-4">${menuStatus}</div><form action="/api/account/events/${encodeURIComponent(event.code)}/wedding/menu" method="post" enctype="multipart/form-data" class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"><input type="hidden" name="locale" value="${locale}"><label class="min-w-0 flex-1 text-sm font-semibold text-[#344941]">${esc(menu ? localized(locale, "Replace menu", "Αντικατάσταση menu", "Remplacer le menu", "Menü ersetzen", "Reemplazar menú", "Sostituisci menu") : localized(locale, "Choose menu file", "Επίλεξε αρχείο menu", "Choisir le fichier", "Menüdatei auswählen", "Elegir archivo", "Scegli file"))}<input name="menuFile" type="file" required accept="image/jpeg,image/png,image/webp,application/pdf" class="mt-2 block w-full cursor-pointer rounded-xl border border-[#d6e0dc] bg-white px-3 py-2.5 text-sm"></label><button class="rounded-xl bg-[#183c33] px-5 py-3 font-semibold text-white">${esc(localized(locale, "Upload menu", "Ανέβασμα menu", "Ajouter le menu", "Menü hochladen", "Subir menú", "Carica menu"))}</button></form></section>`;
    content = `<p class="text-xs font-bold uppercase tracking-[.18em] text-[#2f6b5b]">03 · Guests</p><h2 class="mt-2 text-3xl">${esc(localized(locale, "Helpful information", "Χρήσιμες πληροφορίες", "Informations utiles", "Hilfreiche Informationen", "Información útil", "Informazioni utili"))}</h2>${menuUpload}<form action="${action}" method="post" class="mt-7 grid gap-5 sm:grid-cols-2"><input type="hidden" name="locale" value="${locale}">${field(localized(locale, "Contact person", "Άτομο επικοινωνίας", "Personne de contact", "Kontaktperson", "Persona de contacto", "Persona di contatto"), "contactName", profile.contact_name, { max: 100 })}${field("Email", "contactEmail", profile.contact_email, { type: "email", max: 254 })}${field(localized(locale, "Contact phone", "Τηλέφωνο επικοινωνίας", "Téléphone", "Telefon", "Teléfono", "Telefono"), "contactPhone", profile.contact_phone, { type: "tel", max: 40 })}<div></div><div>${area(localized(locale, "Travel & transport notes", "Μετακίνηση & πρόσβαση", "Voyage et transport", "Anreise & Transport", "Viaje y transporte", "Viaggio e trasporti"), "travelNotes", profile.travel_notes, 1500, 4)}</div><div>${area(localized(locale, "Accommodation suggestions", "Προτάσεις διαμονής", "Suggestions d’hébergement", "Unterkunftsvorschläge", "Sugerencias de alojamiento", "Suggerimenti alloggio"), "accommodationNotes", profile.accommodation_notes, 1500, 4)}</div><div>${area(localized(locale, "Gift message", "Μήνυμα για δώρα", "Message cadeaux", "Geschenkhinweis", "Mensaje de regalos", "Messaggio regali"), "giftMessage", profile.gift_message, 800, 3)}</div><div>${field(localized(locale, "Optional gift or registry link", "Προαιρετικό gift/registry link", "Lien cadeau facultatif", "Optionaler Geschenk-Link", "Enlace de regalos opcional", "Link regalo facoltativo"), "giftUrl", profile.gift_url, { type: "url", max: 500, placeholder: "https://" })}</div><div class="flex gap-3 sm:col-span-2">${previous}<button class="ml-auto rounded-xl bg-[#2f6b5b] px-6 py-3 font-semibold text-white">${esc(nextLabel)}</button></div></form>`;
  } else if (step === 5) {
    const selected = new Set(await selectedFeatures(c.env.DB, profile));
    const estimate = calculateWeddingEstimate([...selected]);
    const featureCards = weddingFeatureCatalog.map((feature) => `<label class="relative flex gap-3 rounded-2xl border ${feature.available ? "cursor-pointer border-[#d9e5e0] bg-white hover:border-[#9fc0b4]" : "border-dashed border-[#dce3e0] bg-[#f8faf9] opacity-75"} p-4"><input type="checkbox" name="feature" value="${feature.key}" data-wedding-feature data-price="${feature.priceMinor}" ${selected.has(feature.key) ? "checked" : ""} ${feature.available ? "" : "disabled"} class="mt-1 h-5 w-5 accent-[#2f6b5b]"><span><strong class="block text-[#183c33]">${esc(weddingCatalogText(feature.title, locale))}</strong><span class="mt-1 block text-sm leading-5 text-[#687a74]">${esc(weddingCatalogText(feature.description, locale))}</span><span class="mt-3 inline-flex rounded-full ${feature.available ? "bg-[#e9f2ee] text-[#255848]" : "bg-[#ecefed] text-[#74817c]"} px-2.5 py-1 text-xs font-bold">${feature.available ? `+${formatWeddingPrice(feature.priceMinor, locale)}` : esc(localized(locale, "In development", "Σε ανάπτυξη", "En développement", "In Entwicklung", "En desarrollo", "In sviluppo"))}</span></span></label>`).join("");
    content = `<div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p class="text-xs font-bold uppercase tracking-[.18em] text-[#2f6b5b]">05 · Features</p><h2 class="mt-2 text-3xl">${esc(localized(locale, "Choose what you need", "Επίλεξε ό,τι χρειάζεσαι", "Choisissez vos options", "Wähle deine Funktionen", "Elige lo que necesitas", "Scegli ciò che ti serve"))}</h2><p class="mt-2 max-w-2xl text-sm leading-6 text-[#687a74]">${esc(localized(locale, "Only available features affect the estimate. Features in development cannot be selected or charged.", "Μόνο οι διαθέσιμες λειτουργίες επηρεάζουν την εκτίμηση. Όσα είναι σε ανάπτυξη δεν επιλέγονται και δεν χρεώνονται.", "Seules les fonctions disponibles modifient l’estimation.", "Nur verfügbare Funktionen ändern die Schätzung.", "Solo las funciones disponibles cambian la estimación.", "Solo le funzioni disponibili cambiano la stima."))}</p></div><div class="rounded-2xl bg-[#183c33] px-5 py-4 text-white"><span class="block text-xs text-white/65">${esc(localized(locale, "Estimated total", "Εκτίμηση συνόλου", "Total estimé", "Geschätzter Gesamtpreis", "Total estimado", "Totale stimato"))}</span><strong id="wedding-estimate" data-base-price="3900" class="mt-1 block text-3xl">${formatWeddingPrice(estimate.totalMinor, locale)}</strong></div></div><form action="${action}" method="post" class="mt-7"><input type="hidden" name="locale" value="${locale}"><div class="grid gap-3 md:grid-cols-2">${featureCards}</div><div class="mt-6 rounded-2xl bg-[#f3f7f5] p-4 text-sm text-[#5f716a]">${esc(localized(locale, "The core Wedding workspace is €39. This is a configuration estimate, not a payment or charge.", "Το βασικό Wedding workspace είναι €39. Πρόκειται για εκτίμηση διαμόρφωσης, όχι για πληρωμή ή χρέωση.", "L’espace Wedding de base coûte 39 €. Il s’agit d’une estimation, pas d’un paiement.", "Der Wedding-Grundbereich kostet 39 €. Dies ist eine Schätzung, keine Zahlung.", "El espacio Wedding básico cuesta 39 €. Es una estimación, no un pago.", "Il workspace Wedding base costa 39 €. È una stima, non un pagamento."))}</div><div class="mt-6 flex gap-3">${previous}<button class="ml-auto rounded-xl bg-[#2f6b5b] px-6 py-3 font-semibold text-white">${esc(nextLabel)}</button></div></form><script>(()=>{const output=document.getElementById('wedding-estimate'),boxes=[...document.querySelectorAll('[data-wedding-feature]')],format=new Intl.NumberFormat(${JSON.stringify(locale)},{style:'currency',currency:'EUR'});const update=()=>{const minor=Number(output.dataset.basePrice)+boxes.filter(box=>box.checked&&!box.disabled).reduce((sum,box)=>sum+Number(box.dataset.price||0),0);output.textContent=format.format(minor/100)};boxes.forEach(box=>box.addEventListener('change',update));update()})()<\/script>`;
  } else if (step === 6) {
    const selected = await selectedFeatures(c.env.DB, profile);
    const estimate = calculateWeddingEstimate(selected);
    const featureList = weddingFeatureCatalog.filter((feature) => selected.includes(feature.key)).map((feature) => `<li class="flex items-center justify-between gap-3 border-b border-[#e7edea] py-3 last:border-0"><span>${esc(weddingCatalogText(feature.title, locale))}</span><strong>${formatWeddingPrice(feature.priceMinor, locale)}</strong></li>`).join("");
    content = `<p class="text-xs font-bold uppercase tracking-[.18em] text-[#2f6b5b]">06 · Review</p><h2 class="mt-2 text-3xl">${esc(localized(locale, "Your Wedding setup", "Το Wedding setup σου", "Votre configuration Wedding", "Dein Wedding-Setup", "Tu configuración Wedding", "La tua configurazione Wedding"))}</h2><div class="mt-7 grid gap-5 lg:grid-cols-[1fr_360px]"><div class="space-y-4"><article class="rounded-2xl border border-[#dfe8e4] p-5"><p class="text-xs font-bold uppercase tracking-[.14em] text-[#6f817a]">${esc(localized(locale, "Couple", "Ζευγάρι", "Couple", "Paar", "Pareja", "Coppia"))}</p><h3 class="mt-2 text-2xl">${esc(profile.partner_one_name)} & ${esc(profile.partner_two_name)}</h3><p class="mt-2 text-sm leading-6 text-[#687a74]">${esc(profile.welcome_message || profile.story || "—")}</p><a href="?lang=${locale}&step=1" class="mt-3 inline-block text-sm font-semibold text-[#2f6b5b]">${esc(localized(locale, "Edit", "Επεξεργασία", "Modifier", "Bearbeiten", "Editar", "Modifica"))}</a></article><article class="rounded-2xl border border-[#dfe8e4] p-5"><p class="text-xs font-bold uppercase tracking-[.14em] text-[#6f817a]">${esc(localized(locale, "Schedule", "Πρόγραμμα", "Programme", "Ablauf", "Programa", "Programma"))}</p><p class="mt-2 text-sm leading-6 text-[#344941]">${esc(formatWeddingMoment(profile.ceremony_at, locale))} · ${esc(profile.ceremony_location || "—")}<br>${esc(formatWeddingMoment(profile.reception_at, locale))} · ${esc(profile.reception_location || "—")}</p><a href="?lang=${locale}&step=3" class="mt-3 inline-block text-sm font-semibold text-[#2f6b5b]">${esc(localized(locale, "Edit", "Επεξεργασία", "Modifier", "Bearbeiten", "Editar", "Modifica"))}</a></article></div><aside class="h-fit rounded-2xl bg-[#f3f7f5] p-5"><div class="flex items-center justify-between border-b border-[#dce6e2] pb-3"><span>${esc(localized(locale, "Core Wedding workspace", "Βασικό Wedding workspace", "Espace Wedding", "Wedding-Grundbereich", "Espacio Wedding", "Workspace Wedding"))}</span><strong>${formatWeddingPrice(estimate.basePriceMinor, locale)}</strong></div><ul>${featureList}</ul><div class="mt-4 flex items-center justify-between rounded-xl bg-[#183c33] p-4 text-white"><span>${esc(localized(locale, "Estimated total", "Εκτίμηση συνόλου", "Total estimé", "Gesamtschätzung", "Total estimado", "Totale stimato"))}</span><strong class="text-2xl">${formatWeddingPrice(estimate.totalMinor, locale)}</strong></div><p class="mt-3 text-xs leading-5 text-[#687a74]">${esc(localized(locale, "No payment is taken at this stage.", "Σε αυτό το στάδιο δεν πραγματοποιείται πληρωμή.", "Aucun paiement n’est effectué à ce stade.", "In diesem Schritt erfolgt keine Zahlung.", "No se realiza ningún pago en este paso.", "In questa fase non viene effettuato alcun pagamento."))}</p></aside></div><form action="${action}" method="post" class="mt-7 flex gap-3"><input type="hidden" name="locale" value="${locale}">${previous}<button class="ml-auto rounded-xl bg-[#2f6b5b] px-6 py-3 font-semibold text-white">${esc(nextLabel)}</button></form>`;
  }
  return c.html(wizardShell(locale, event, user, profile, step, content));
});

weddingRoutes.post("/api/account/events/:code/wedding/media/upload", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await ownedWedding(c.env.DB, c.req.param("code"), user.id);
  if (!event) return c.text("Wedding event not found", 404);
  const form = await c.req.formData();
  const locale = normalizeLocale(String(form.get("locale") ?? event.default_locale));
  const requestedSlotValue = String(form.get("slot") ?? "");
  if (requestedSlotValue && !isValidPortraitSlot(requestedSlotValue)) return c.text("Invalid portrait slot", 400);
  const requestedSlot = isValidPortraitSlot(requestedSlotValue) ? requestedSlotValue : null;
  const files = form.getAll("file").filter((item): item is File => item instanceof File && item.size > 0);
  const validation = validateUploadFiles(files);
  if (validation) {
    const detail = uploadValidationDetails(validation, locale);
    return c.text(detail.message, detail.status as 400 | 413 | 415);
  }
  let assignedRequestedSlot = false;
  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const ext = safeFileExtension(file.name);
    const objectKey = `wedding-media/${event.id}/${crypto.randomUUID()}.${ext}`;
    await c.env.MEDIA.put(objectKey, bytes, {
      httpMetadata: { contentType: file.type, cacheControl: "private, max-age=31536000, immutable" },
      customMetadata: { eventId: event.id, purpose: "wedding-portrait" },
    });
    try {
      const mediaId = await insertWeddingMedia(c.env.DB, event.id, objectKey, "image", file.type, file.size, user.id);
      if (requestedSlot && !assignedRequestedSlot) {
        const assigned = await upsertWeddingPortrait(c.env.DB, event.id, mediaId, requestedSlot);
        if (!assigned) throw new Error("wedding_portrait_assignment_failed");
        assignedRequestedSlot = true;
      }
    } catch (error) {
      await c.env.MEDIA.delete(objectKey);
      throw error;
    }
  }
  return c.redirect(`/dashboard/${event.code}/wedding/setup?lang=${locale}&step=2`, 303);
});

weddingRoutes.post("/api/account/events/:code/wedding/media/:mediaId/delete", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await ownedWedding(c.env.DB, c.req.param("code"), user.id);
  if (!event) return c.text("Wedding event not found", 404);
  const form = await c.req.formData();
  const locale = normalizeLocale(String(form.get("locale") ?? event.default_locale));
  const media = await c.env.DB.prepare(
    "SELECT id,object_key FROM event_wedding_media WHERE id=? AND event_id=?",
  ).bind(c.req.param("mediaId"), event.id).first<{ id: string; object_key: string }>();
  if (!media) return c.text("Wedding photo not found", 404);

  const deleted = await deleteWeddingMedia(c.env.DB, media.id);
  if (!deleted) return c.text("Wedding photo not found", 404);
  c.executionCtx.waitUntil(
    c.env.MEDIA.delete(mediaObjectKeys(media.object_key)).catch((error) => {
      console.error(JSON.stringify({
        event: "wedding_media_object_delete_failed",
        eventId: event.id,
        mediaId: media.id,
        error: error instanceof Error ? error.message.slice(0, 300) : "unknown",
      }));
    }),
  );
  return c.redirect(`/dashboard/${event.code}/wedding/setup?lang=${locale}&step=2`, 303);
});

weddingRoutes.post("/api/account/events/:code/wedding/menu", async (c) => {

  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await ownedWedding(c.env.DB, c.req.param("code"), user.id);
  if (!event) return c.text("Wedding event not found", 404);
  const form = await c.req.formData();
  const locale = normalizeLocale(String(form.get("locale") ?? event.default_locale));
  const file = form.get("menuFile");
  if (!(file instanceof File)) return c.text(localized(locale, "Choose a menu file.", "Επίλεξε αρχείο menu.", "Choisissez un fichier.", "Wähle eine Menüdatei.", "Elige un archivo.", "Scegli un file."), 400);
  const validation = validateWeddingMenuFile(file);
  if (!validation.ok) {
    const size = validation.reason === "size";
    return c.text(size
      ? localized(locale, "The menu must be between 1 byte and 15 MB.", "Το menu πρέπει να είναι από 1 byte έως 15 MB.", "Le menu doit faire au maximum 15 Mo.", "Das Menü darf höchstens 15 MB groß sein.", "El menú debe tener un máximo de 15 MB.", "Il menu deve avere una dimensione massima di 15 MB.")
      : localized(locale, "Use a JPG, PNG, WebP or PDF file.", "Χρησιμοποίησε αρχείο JPG, PNG, WebP ή PDF.", "Utilisez un fichier JPG, PNG, WebP ou PDF.", "Verwende JPG, PNG, WebP oder PDF.", "Usa un archivo JPG, PNG, WebP o PDF.", "Usa un file JPG, PNG, WebP o PDF."), 400);
  }
  const bytes = await file.arrayBuffer();
  if (!weddingMenuBytesMatch(validation.contentType, bytes)) return c.text("Invalid file contents", 400);

  const previous = await c.env.DB.prepare("SELECT * FROM event_wedding_menus WHERE event_id=?")
    .bind(event.id).first<WeddingMenuRow>();
  const objectKey = `wedding-menus/${event.id}/${crypto.randomUUID()}.${validation.extension}`;
  const filename = safeWeddingMenuFilename(file.name);
  await c.env.MEDIA.put(objectKey, bytes, {
    httpMetadata: {
      contentType: validation.contentType,
      contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      cacheControl: "private, no-store",
    },
    customMetadata: { eventId: event.id, purpose: "wedding-menu" },
  });
  try {
    await c.env.DB.prepare(`INSERT INTO event_wedding_menus (event_id,object_key,content_type,original_filename,size_bytes,updated_by,updated_at)
      VALUES (?,?,?,?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET object_key=excluded.object_key,content_type=excluded.content_type,original_filename=excluded.original_filename,size_bytes=excluded.size_bytes,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
      .bind(event.id, objectKey, validation.contentType, filename, file.size, user.id, Date.now()).run();
  } catch (error) {
    await c.env.MEDIA.delete(objectKey);
    throw error;
  }
  if (previous?.object_key && previous.object_key !== objectKey) c.executionCtx.waitUntil(c.env.MEDIA.delete(previous.object_key));
  return c.redirect(`/dashboard/${event.code}/wedding/setup?lang=${locale}&step=4`, 303);
});

weddingRoutes.post("/api/account/events/:code/wedding/menu/delete", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await ownedWedding(c.env.DB, c.req.param("code"), user.id);
  if (!event) return c.text("Wedding event not found", 404);
  const form = await c.req.formData();
  const locale = normalizeLocale(String(form.get("locale") ?? event.default_locale));
  const menu = await c.env.DB.prepare("SELECT * FROM event_wedding_menus WHERE event_id=?")
    .bind(event.id).first<WeddingMenuRow>();
  if (menu) {
    await c.env.DB.prepare("DELETE FROM event_wedding_menus WHERE event_id=?").bind(event.id).run();
    c.executionCtx.waitUntil(c.env.MEDIA.delete(menu.object_key));
  }
  return c.redirect(`/dashboard/${event.code}/wedding/setup?lang=${locale}&step=4`, 303);
});

weddingRoutes.get("/api/account/events/:code/wedding/portraits", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const event = await ownedWedding(c.env.DB, c.req.param("code"), user.id);
  if (!event) return c.json({ error: "Wedding event not found" }, 404);
  const portraits = await getWeddingPortraitMap(c.env.DB, event.id);
  return c.json(portraits);
});

weddingRoutes.post("/api/account/events/:code/wedding/portraits/:slot/delete", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const event = await ownedWedding(c.env.DB, c.req.param("code"), user.id);
  if (!event) return c.json({ error: "Wedding event not found" }, 404);
  const slot = c.req.param("slot");
  if (!isValidPortraitSlot(slot)) return c.json({ error: "Invalid slot" }, 400);
  await deleteWeddingPortrait(c.env.DB, event.id, slot);
  const form = await c.req.formData();
  const locale = normalizeLocale(String(form.get("locale") ?? event.default_locale));
  return c.redirect(`/dashboard/${event.code}/wedding/setup?lang=${locale}&step=2`, 303);
});

weddingRoutes.post("/api/account/events/:code/wedding/portraits", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const event = await ownedWedding(c.env.DB, c.req.param("code"), user.id);
  if (!event) return c.json({ error: "Wedding event not found" }, 404);
  const form = await c.req.formData();
  const slot = String(form.get("slot") ?? "");
  if (!isValidPortraitSlot(slot)) return c.json({ error: "Invalid slot" }, 400);
  const mediaId = String(form.get("mediaId") ?? "");
  if (!mediaId) return c.json({ error: "mediaId required" }, 400);
  const assigned = await upsertWeddingPortrait(c.env.DB, event.id, mediaId, slot);
  if (!assigned) return c.json({ error: "Photo not found in this event" }, 404);
  return c.json({ ok: true });
});

weddingRoutes.delete("/api/account/events/:code/wedding/portraits/:slot", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const event = await ownedWedding(c.env.DB, c.req.param("code"), user.id);
  if (!event) return c.json({ error: "Wedding event not found" }, 404);
  const slot = c.req.param("slot");
  if (!isValidPortraitSlot(slot)) return c.json({ error: "Invalid slot" }, 400);
  await deleteWeddingPortrait(c.env.DB, event.id, slot);
  return c.json({ ok: true });
});

weddingRoutes.post("/api/account/events/:code/wedding/setup/:step", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await ownedWedding(c.env.DB, c.req.param("code"), user.id);
  if (!event) return c.text("Wedding event not found", 404);
  const profile = await ensureProfile(c.env.DB, event);
  if (!profile) return c.text("Wedding setup unavailable", 500);
  const form = await c.req.formData();
  const locale = normalizeLocale(String(form.get("locale") ?? event.default_locale));
  const step = Number(c.req.param("step"));
  const now = Date.now();
  const next = Math.min(6, step + 1);
  if (step === 1) {
    const first = String(form.get("partnerOneName") ?? "").trim().slice(0, 80);
    const second = String(form.get("partnerTwoName") ?? "").trim().slice(0, 80);
    if (!first || !second) return c.text(localized(locale, "Add both names.", "Συμπλήρωσε και τα δύο ονόματα.", "Ajoutez les deux noms.", "Füge beide Namen hinzu.", "Añade ambos nombres.", "Aggiungi entrambi i nomi."), 400);
    const templateKey = normalizeWeddingTheme(form.get("templateKey"));
    const accentColor = validWeddingAccent(form.get("accentColor")) ?? weddingThemeFor(templateKey).defaultAccent;
    await c.env.DB.prepare("UPDATE event_wedding_profiles SET template_key=?,accent_color=?,partner_one_name=?,partner_two_name=?,welcome_message=?,story=?,wizard_step=MAX(wizard_step,2),updated_at=? WHERE event_id=?")
      .bind(templateKey, accentColor, first, second, String(form.get("welcomeMessage") ?? "").trim().slice(0, 180), String(form.get("story") ?? "").trim().slice(0, 2000), now, event.id).run();
  } else if (step === 2) {
    // Step 2 is portraits — no DB fields to save, just advance wizard_step
    await c.env.DB.prepare("UPDATE event_wedding_profiles SET wizard_step=MAX(wizard_step,3),updated_at=? WHERE event_id=?")
      .bind(now, event.id).run();
  } else if (step === 3) {
    const ceremonyAt = String(form.get("ceremonyAt") ?? "");
    const receptionAt = String(form.get("receptionAt") ?? "");
    if (!validDateTime(ceremonyAt) || !validDateTime(receptionAt)) return c.text("Invalid date", 400);
    let ceremonyPlace;
    let receptionPlace;
    try {
      [ceremonyPlace, receptionPlace] = await Promise.all([
        resolveEventPlaceInput({
          apiKey: c.env.GOOGLE_MAPS_API_KEY,
          location: form.get("ceremonyLocation"),
          placeId: form.get("ceremonyPlaceId"),
          latitude: form.get("ceremonyLat"),
          longitude: form.get("ceremonyLng"),
          clearLocation: form.get("clearCeremonyLocation"),
          locale,
          sessionToken: form.get("ceremonyLocationSessionToken"),
          current: {
            location: profile.ceremony_location || null,
            location_place_id: profile.ceremony_place_id,
            location_lat: profile.ceremony_lat,
            location_lng: profile.ceremony_lng,
            location_provider: profile.ceremony_place_id ? "google_places" : null,
          },
        }),
        resolveEventPlaceInput({
          apiKey: c.env.GOOGLE_MAPS_API_KEY,
          location: form.get("receptionLocation"),
          placeId: form.get("receptionPlaceId"),
          latitude: form.get("receptionLat"),
          longitude: form.get("receptionLng"),
          clearLocation: form.get("clearReceptionLocation"),
          locale,
          sessionToken: form.get("receptionLocationSessionToken"),
          current: {
            location: profile.reception_location || null,
            location_place_id: profile.reception_place_id,
            location_lat: profile.reception_lat,
            location_lng: profile.reception_lng,
            location_provider: profile.reception_place_id ? "google_places" : null,
          },
        }),
      ]);
    } catch (error) {
      const selection = error instanceof PlaceInputError && error.reason === "selection_required";
      return c.text(selection
        ? localized(locale, "Choose each location from the Google results.", "Επίλεξε κάθε τοποθεσία από τα αποτελέσματα της Google.", "Choisissez chaque lieu dans les résultats Google.", "Wähle jeden Ort aus den Google-Ergebnissen.", "Elige cada lugar de los resultados de Google.", "Scegli ogni luogo dai risultati Google.")
        : localized(locale, "Location verification is temporarily unavailable.", "Η επαλήθευση τοποθεσίας δεν είναι προσωρινά διαθέσιμη.", "La vérification du lieu est temporairement indisponible.", "Die Ortsprüfung ist vorübergehend nicht verfügbar.", "La verificación de ubicación no está disponible temporalmente.", "La verifica del luogo non è temporaneamente disponibile."), 400);
    }
    await c.env.DB.prepare("UPDATE event_wedding_profiles SET ceremony_at=?,ceremony_location=?,ceremony_place_id=?,ceremony_lat=?,ceremony_lng=?,reception_at=?,reception_location=?,reception_place_id=?,reception_lat=?,reception_lng=?,dress_code=?,wizard_step=MAX(wizard_step,4),updated_at=? WHERE event_id=?")
      .bind(ceremonyAt || null, ceremonyPlace.location ?? "", ceremonyPlace.location_place_id, ceremonyPlace.location_lat, ceremonyPlace.location_lng, receptionAt || null, receptionPlace.location ?? "", receptionPlace.location_place_id, receptionPlace.location_lat, receptionPlace.location_lng, String(form.get("dressCode") ?? "").trim().slice(0, 180), now, event.id).run();
  } else if (step === 4) {
    const email = String(form.get("contactEmail") ?? "").trim().toLowerCase().slice(0, 254);
    const giftUrl = String(form.get("giftUrl") ?? "").trim().slice(0, 500);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.text("Invalid email", 400);
    if (giftUrl && !/^https:\/\//i.test(giftUrl)) return c.text("Gift link must use HTTPS", 400);
    await c.env.DB.prepare("UPDATE event_wedding_profiles SET contact_name=?,contact_email=?,contact_phone=?,travel_notes=?,accommodation_notes=?,gift_message=?,gift_url=?,wizard_step=MAX(wizard_step,5),updated_at=? WHERE event_id=?")
      .bind(String(form.get("contactName") ?? "").trim().slice(0, 100), email, String(form.get("contactPhone") ?? "").trim().slice(0, 40), String(form.get("travelNotes") ?? "").trim().slice(0, 1500), String(form.get("accommodationNotes") ?? "").trim().slice(0, 1500), String(form.get("giftMessage") ?? "").trim().slice(0, 800), giftUrl, now, event.id).run();
  } else if (step === 5) {
    const estimate = calculateWeddingEstimate(form.getAll("feature").map(String));
    const statements = [
      c.env.DB.prepare("DELETE FROM event_wedding_features WHERE event_id=?").bind(event.id),
      ...estimate.selected.map((key) => {
        const feature = weddingFeatureCatalog.find((item) => item.key === key)!;
        return c.env.DB.prepare("INSERT INTO event_wedding_features (event_id,feature_key,enabled,price_minor,catalog_version,updated_at) VALUES (?,?,?,?,?,?)")
          .bind(event.id, key, 1, feature.priceMinor, estimate.catalogVersion, now);
      }),
      c.env.DB.prepare("UPDATE event_wedding_profiles SET catalog_version=?,estimated_total_minor=?,currency=?,wizard_step=MAX(wizard_step,6),updated_at=? WHERE event_id=?")
        .bind(estimate.catalogVersion, estimate.totalMinor, estimate.currency, now, event.id),
      c.env.DB.prepare(`INSERT INTO event_experience_settings (event_id,rsvp_enabled,guestbook_enabled,comments_enabled,slideshow_enabled,guestbook_moderation,updated_at)
        VALUES (?,?,?,?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET rsvp_enabled=excluded.rsvp_enabled,guestbook_enabled=excluded.guestbook_enabled,comments_enabled=excluded.comments_enabled,slideshow_enabled=excluded.slideshow_enabled,updated_at=excluded.updated_at`)
        .bind(event.id, estimate.selected.includes("rsvp") ? 1 : 0, estimate.selected.includes("guestbook") ? 1 : 0, estimate.selected.includes("guestbook") ? 1 : 0, estimate.selected.includes("live_slideshow") ? 1 : 0, 1, now),
    ];
    await c.env.DB.batch(statements);
  } else if (step === 6) {
    await c.env.DB.prepare("UPDATE event_wedding_profiles SET wizard_completed_at=COALESCE(wizard_completed_at,?),publish_status='published',wizard_step=6,updated_at=? WHERE event_id=?")
      .bind(now, now, event.id).run();
    return c.redirect(`/dashboard/${event.code}?lang=${locale}#template`, 303);
  } else {
    return c.text("Invalid step", 400);
  }
  return c.redirect(`/dashboard/${event.code}/wedding/setup?lang=${locale}&step=${next}`, 303);
});
