import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { parse as parseMetadata } from "exifr";
import QRCode from "qrcode";
import { getEventRole, roleCan } from "../access";
import { UPLOAD_ACCEPT } from "../config";
import type { Bindings } from "../domain";
import { galleryAccessToken, galleryCookieName, hasGalleryAccess } from "../gallery-access";
import { localeNames, normalizeLocale, supportedLocales, type Locale } from "../i18n";
import { queueAutomaticCloudBackupsForEvent } from "../cloud-backups";
import { GUEST_UPLOAD_POLICY_VERSION } from "../privacy";
import { notifyEventMembersAboutUpload } from "../notifications";
import {
  existingMediaLikeVisitor,
  getGalleryMediaWithLikes,
  getOfficialMediaWithLikes,
  MEDIA_LIKE_COOKIE,
  MEDIA_LIKE_COOKIE_MAX_AGE,
  mediaLikeActorKey,
  mediaLikeVisitor,
  toggleMediaLike,
} from "../media-likes";
import { isCanonicalDuplicateConstraint, mediaCanonicalHash } from "../media-fingerprint";
import { getOrCreateMediaVariant, parseMediaVariant } from "../media-variants";
import { releaseStorage, reserveStorageForEvent } from "../quotas";
import { consumeRateLimit, tooManyRequests } from "../rate-limit";
import { getEvent } from "../repositories";
import { currentUser } from "../session";
import {
  safeFileExtension,
  uploadValidationDetails,
  validateUploadFiles,
} from "../upload-policy";
import {
  bulkSelectionScript,
  cards,
  galleryFilterControls,
  galleryFilterScript,
  lightboxMarkup,
  mediaLikeButton,
  mediaLikesScript,
} from "../views/media";
import { shareIconButtons } from "../views/share";
import { brandMark, page } from "../views/shared";
import { uploadLimitsCopy } from "../views/upload";
import { mediaCommentsOverlay, renderGuestParticipation, type GuestbookPreview, type GuestParticipationSettings } from "../views/experience";
import {
  constantTimeEqual,
  cookieValue,
  esc,
  formatEventDates,
  sha256,
  sha256Bytes,
} from "../utils";

export const galleryRoutes = new Hono<{ Bindings: Bindings }>();

function galleryLanguagePicker(code: string, locale: Locale, official = false) {
  const path = `/gallery/${encodeURIComponent(code)}${official ? "/official" : ""}`;
  return `<label class="sr-only" for="gallery-language">Language</label><select id="gallery-language" aria-label="Language" class="cursor-pointer rounded-full border border-[#d9e3df] bg-white/90 px-3 py-2 text-xs font-bold text-[#344941] shadow-sm" onchange="location.href=this.value">${supportedLocales.map((value) => `<option value="${path}?lang=${value}" ${value === locale ? "selected" : ""}>${localeNames[value]}</option>`).join("")}</select>`;
}

galleryRoutes.post("/gallery/:code/unlock", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);

  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  const requestedNext = String(body.next ?? "");
  const allowedNextPrefixes = [`/gallery/${event.code}`, `/wedding/${event.code}`];
  const next = allowedNextPrefixes.some((prefix) => requestedNext === prefix || requestedNext.startsWith(`${prefix}?`))
    ? requestedNext
    : `/gallery/${event.code}?lang=${locale}`;

  if (Date.now() > event.expires_at)
    return c.text(locale === "el" ? "Το event έχει λήξει." : "This event has expired.", 410);
  if (!event.gallery_pin_hash)
    return c.redirect(next, 303);

  const pinLimit = await consumeRateLimit(c.env.DB, c.req.raw, c.env.BETTER_AUTH_SECRET, {
    scope: `gallery-pin:${event.code}`,
    limit: 10,
    windowMs: 15 * 60_000,
  });
  if (!pinLimit.allowed)
    return tooManyRequests(
      pinLimit,
      locale === "el"
        ? "Πολλές προσπάθειες PIN. Δοκίμασε ξανά αργότερα."
        : "Too many PIN attempts. Please try again later.",
    );

  if (!constantTimeEqual(await sha256(String(body.pin ?? "")), event.gallery_pin_hash))
    return c.text(locale === "el" ? "Λάθος PIN" : "Incorrect PIN", 401);

  const token = await galleryAccessToken(event);
  const maxAge = Math.max(
    0,
    Math.min(2592000, Math.floor((event.expires_at - Date.now()) / 1000)),
  );
  return new Response(null, {
    status: 303,
    headers: {
      Location: next,
      "Set-Cookie": `${galleryCookieName(event.code)}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`,
    },
  });
});

galleryRoutes.get("/gallery/:code/cover", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if (Date.now() > event.expires_at) return c.text("Event expired", 410);
  if (!(await hasGalleryAccess(c.req.raw, event))) return c.text("Gallery access required", 401);
  const cover = await c.env.DB.prepare("SELECT object_key,content_type FROM event_covers WHERE event_id=?")
    .bind(event.id)
    .first<{ object_key: string; content_type: string }>();
  if (!cover) return c.text("Cover not found", 404);
  const object = await c.env.MEDIA.get(cover.object_key);
  if (!object) return c.text("Cover not found", 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": cover.content_type,
      "Cache-Control": "private, max-age=3600",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

galleryRoutes.get("/gallery/:code", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Η εκδήλωση δεν βρέθηκε.", 404);

  const locale = normalizeLocale(c.req.query("lang") ?? event.default_locale);
  const otherLocale = locale === "el" ? "en" : "el";
  const guestUrl = `${new URL(c.req.url).origin}/gallery/${event.code}`;

  if (Date.now() > event.expires_at) return c.text("Η εκδήλωση έχει λήξει.", 410);
  if (event.event_type === "wedding")
    return c.redirect(`/wedding/${encodeURIComponent(event.code)}?lang=${locale}`, 302);

  if (!(await hasGalleryAccess(c.req.raw, event))) {
    return c.html(
      page(
        event.eventName,
        `<main class="flex min-h-screen items-center justify-center p-5"><section class="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl"><div class="flex items-center justify-between">${brandMark("/", true)}<a href="/gallery/${event.code}?lang=${otherLocale}" class="rounded-xl border px-3 py-2 text-sm">${otherLocale.toUpperCase()}</a></div><h1 class="mt-7 text-4xl">${locale === "el" ? "Ιδιωτική gallery" : "Private gallery"}</h1><p class="mt-2 text-[#65756f]">${locale === "el" ? "Βάλε το PIN του event για να δεις τη gallery και να ανεβάσεις φωτογραφίες." : "Enter the event PIN to view the gallery and upload photos."}</p><form action="/gallery/${encodeURIComponent(event.code)}/unlock" method="post" class="mt-6 space-y-3"><input type="hidden" name="locale" value="${locale}"><input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" required autofocus placeholder="PIN" class="w-full rounded-xl border px-4 py-3 text-center text-xl tracking-[.3em]"><button class="w-full rounded-xl bg-[#2f6b5b] px-5 py-3 text-white">${locale === "el" ? "Άνοιγμα gallery" : "Open gallery"}</button></form></section></main>`,
      ),
      401,
    );
  }

  const likeVisitor = existingMediaLikeVisitor(c.req.raw);
  const likeActorKey = likeVisitor
    ? await mediaLikeActorKey(c.env.BETTER_AUTH_SECRET, likeVisitor)
    : "";
  const qrOptions = { type: "svg" as const, width: 220, margin: 1, errorCorrectionLevel: "M" as const };
  const [allMedia, officialResult, guestQrRaw, cover, guestbookResult, experienceSettings] = await Promise.all([
    getGalleryMediaWithLikes(c.env.DB, event.id, likeActorKey),
    c.env.DB.prepare(
      `SELECT COUNT(*) total FROM official_album_items o JOIN media m ON m.id=o.media_id
       WHERE o.event_id=? AND m.media_type='image' AND m.deleted_at IS NULL AND m.reported_at IS NULL`,
    ).bind(event.id).first<{ total: number }>(),
    QRCode.toString(guestUrl, qrOptions),
    c.env.DB.prepare("SELECT updated_at FROM event_covers WHERE event_id=?")
      .bind(event.id)
      .first<{ updated_at: number }>(),
    c.env.DB.prepare("SELECT author_name,message,created_at FROM event_guestbook_entries WHERE event_id=? AND status='approved' ORDER BY created_at DESC LIMIT 6")
      .bind(event.id)
      .all<GuestbookPreview>()
      .catch(() => ({ results: [] as GuestbookPreview[] })),
    c.env.DB.prepare("SELECT rsvp_enabled,guestbook_enabled,comments_enabled FROM event_experience_settings WHERE event_id=?")
      .bind(event.id)
      .first<GuestParticipationSettings>()
      .catch(() => null),
  ]);
  const items = allMedia.filter((item) => item.origin !== "official");
  const photoItems = items.filter((item) => item.media_type === "image");
  const officialCount = officialResult?.total ?? 0;
  const guestQrSvg = guestQrRaw.replace("<svg", '<svg class="block h-auto w-full max-w-full"');
  const selectionScript = bulkSelectionScript({
    selectButtonId: "select-media",
    cardSelector: ".selectable-media",
    selectorSelector: ".media-selector",
    checkboxSelector: ".media-select",
    tickSelector: ".selection-tick",
    selectText: locale === "el" ? "Επιλογή" : "Select",
    cancelText: locale === "el" ? "Ακύρωση" : "Cancel",
    actions: [
      {
        buttonId: "download-selected",
        label: locale === "el" ? "Λήψη επιλεγμένων" : "Download selected",
        kind: "download",
      },
    ],
  });

  return c.html(
    page(
      `${event.eventName} – Gallery`,
      `<main class="guest-album-page mx-auto max-w-7xl p-4 sm:p-6 lg:p-10">
        <header class="guest-album-topbar flex items-center justify-between px-1 py-2">${brandMark("/", true)}${galleryLanguagePicker(event.code, locale)}</header>
        <section class="guest-event-hero relative mt-4 overflow-hidden rounded-[2rem] bg-[#183c33] px-6 py-9 text-white sm:px-10 sm:py-12 lg:px-14 lg:py-16">
          ${cover ? `<img src="/gallery/${encodeURIComponent(event.code)}/cover?v=${cover.updated_at}" alt="" class="absolute inset-0 h-full w-full object-cover"><div class="absolute inset-0 bg-gradient-to-r from-[#172d27]/95 via-[#183c33]/80 to-[#183c33]/45"></div>` : ""}
          <div class="relative">
            <p class="text-xs font-bold uppercase tracking-[.22em] text-[#c8ddd5]">${locale === "el" ? "Ιδιωτικό event album" : "Private event album"}</p>
            <h1 class="mt-3 max-w-4xl text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">${esc(event.eventName)}</h1>
            <p class="mt-4 text-sm font-semibold text-[#c8ddd5] sm:text-base">${esc(formatEventDates(event, locale))}</p>
            ${event.location ? `<p class="mt-2 text-sm text-white/75">${esc(event.location)}</p>` : ""}
            <p class="mt-4 max-w-2xl text-sm leading-7 text-white/80 sm:text-base">${locale === "el" ? "Μοιράσου όσα είδες και έζησες. Οι αυθόρμητες στιγμές όλων συγκεντρώνονται σε ένα ιδιωτικό album." : "Share what you saw and lived. Everyone’s candid moments come together in one private album."}</p>
            <div class="mt-7 flex flex-col gap-3 sm:flex-row"><a href="#guest-upload" class="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-[#183c33] shadow-lg"><svg aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 16V4M7 9l5-5 5 5M5 14v5h14v-5"/></svg>${locale === "el" ? "Πρόσθεσε στιγμές" : "Add your moments"}</a><a href="#guest-moments" class="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm">${locale === "el" ? "Δες το gallery" : "Explore gallery"}</a></div>
          </div>
        </section>
        <div class="mt-6 grid items-stretch gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(19rem,.75fr)]">
          <section id="guest-upload" class="gallery-upload-card scroll-mt-6 rounded-[2rem] border border-[#dee7e3] bg-white p-5 shadow-sm sm:p-8">
            <div class="flex items-start gap-4"><span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#e9f2ee] text-[#2f6b5b]"><svg aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 16V4M7 9l5-5 5 5M5 14v5h14v-5"/></svg></span><div><p class="text-xs font-bold uppercase tracking-[.18em] text-[#2f6b5b]">${locale === "el" ? "Guest uploads" : "Guest uploads"}</p><h2 class="mt-1 text-3xl">${locale === "el" ? "Πρόσθεσε τις στιγμές σου" : "Add your moments"}</h2><p class="mt-2 text-sm leading-6 text-[#687a74]">${locale === "el" ? "Χωρίς εφαρμογή και χωρίς εγγραφή. Επίλεξε πολλές φωτογραφίες μαζί." : "No app and no account required. Select multiple photos at once."}</p></div></div>
            <form data-multi-upload action="/api/upload/${event.code}" method="post" enctype="multipart/form-data" class="gallery-upload mt-6 space-y-3 text-left"><input type="hidden" name="locale" value="${locale}"><input name="name" maxlength="60" placeholder="${locale === "el" ? "Το όνομά σου" : "Your name"}" class="w-full rounded-xl border px-4 py-3"><input name="file" required multiple type="file" accept="${UPLOAD_ACCEPT}" class="w-full rounded-xl border p-3"><p class="text-xs text-[#65756f]">${uploadLimitsCopy(locale)}</p><section id="guest-upload-confirmation" aria-labelledby="guest-upload-confirmation-title" class="rounded-2xl border border-[#dfe8e4] bg-[#f1f6f3] p-4 text-sm text-[#4a6159]"><div class="flex items-center gap-2"><svg aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5 shrink-0 text-[#2b6253]" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg><strong id="guest-upload-confirmation-title" class="font-semibold text-[#2b443c]">${locale === "el" ? "Απόρρητο και επιβεβαίωση" : "Privacy and confirmation"}</strong></div><p class="mt-3 leading-6">${locale === "el" ? "Το περιεχόμενο θα αποθηκευτεί στην ιδιωτική συλλογή αυτού του event. Μπορείς να ζητήσεις αφαίρεση οποιαδήποτε στιγμή." : "Your content will be stored in this event’s private gallery. You can request removal at any time."}</p><label class="mt-3 flex cursor-pointer items-start gap-3 rounded-xl bg-white/75 p-3"><input name="upload_confirmation" value="accepted" required type="checkbox" class="mt-1 h-4 w-4 shrink-0"><span>${locale === "el" ? "Επιβεβαιώνω ότι έχω δικαίωμα να ανεβάσω αυτό το περιεχόμενο και ότι δεν παραβιάζει παράνομα την ιδιωτικότητα ή τα δικαιώματα άλλων." : "I confirm that I am entitled to upload this content and that it does not unlawfully infringe the privacy or rights of others."}</span></label></section><button class="w-full rounded-xl bg-[#2f6b5b] py-3.5 font-bold text-white shadow-lg shadow-indigo-950/10">${locale === "el" ? "Ανέβασμα στο album" : "Upload to album"}</button></form>
          </section>
          <aside class="guest-share-card flex flex-col rounded-[2rem] border border-[#dee7e3] bg-[#f0f5f2] p-5 sm:p-7">
            <div class="flex items-center justify-between gap-3"><div><p class="text-xs font-bold uppercase tracking-[.18em] text-[#2f6b5b]">QR & Share</p><h2 class="mt-1 text-2xl">${locale === "el" ? "Κάλεσε και άλλους" : "Invite more guests"}</h2></div><span class="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#586c65]">${locale === "el" ? "Χωρίς app" : "No app"}</span></div>
            <div class="mx-auto mt-5 w-full max-w-[180px] overflow-hidden rounded-[1.4rem] border border-[#d9e3df] bg-white p-3 shadow-sm" aria-label="${locale === "el" ? "QR code του guest album" : "Guest album QR code"}">${guestQrSvg}</div>
            <p class="mt-4 text-center text-sm leading-6 text-[#687a74]">${locale === "el" ? "Σκάναρε από άλλο κινητό για άμεση πρόσβαση και uploads." : "Scan from another phone for instant access and uploads."}</p>
            ${shareIconButtons(guestUrl, event.eventName, locale, false)}
            <button id="copy-guest-link" type="button" data-copy-label="${locale === "el" ? "Αντιγραφή link" : "Copy link"}" data-copied-label="${locale === "el" ? "Το link αντιγράφηκε" : "Link copied"}" class="mt-4 w-full rounded-xl border border-[#d3e2dc] bg-white px-4 py-3 text-sm font-semibold text-[#344941]">${locale === "el" ? "Αντιγραφή link" : "Copy link"}</button>
          </aside>
        </div>
        <section class="official-album-teaser mt-6 overflow-hidden rounded-[2rem] border border-[#dee7e3] bg-white shadow-sm"><a href="/gallery/${event.code}/official?lang=${locale}" class="group grid min-h-[18rem] lg:grid-cols-[minmax(0,1fr)_minmax(22rem,.9fr)]"><div class="flex flex-col justify-center p-6 sm:p-9 lg:p-12"><p class="text-xs font-bold uppercase tracking-[.2em] text-[#2f6b5b]">${locale === "el" ? "Επίσημη συλλογή" : "Official collection"}</p><h2 class="mt-3 text-4xl text-[#183c33]">${locale === "el" ? "Το official album" : "The official album"}</h2><p class="mt-3 max-w-xl text-sm leading-7 text-[#687a74]">${locale === "el" ? "Μια ξεχωριστή, επιμελημένη αφήγηση με το υλικό του επαγγελματία και τις καλύτερες επιλεγμένες στιγμές." : "A separate, curated story combining the professional collection with the finest selected moments."}</p><span class="mt-6 inline-flex w-fit items-center gap-2 rounded-xl bg-[#183c33] px-5 py-3 text-sm font-semibold text-white">${officialCount ? (locale === "el" ? `Προβολή ${officialCount} επιλεγμένων` : `View ${officialCount} curated moments`) : (locale === "el" ? "Δες την προεπισκόπηση" : "View collection")}<span aria-hidden="true" class="transition group-hover:translate-x-1">→</span></span></div><div class="relative min-h-64 overflow-hidden bg-gradient-to-br from-[#2a4139] via-[#2b6253] to-[#b5d0c5]"><div class="absolute inset-0 opacity-50" style="background:radial-gradient(circle at 72% 28%,rgba(200,221,213,.55),transparent 24%),radial-gradient(circle at 30% 76%,rgba(117,168,149,.35),transparent 28%)"></div><div class="absolute inset-0 flex items-center justify-center"><span class="flex h-36 w-36 items-center justify-center rounded-full border border-white/15 bg-white/5 backdrop-blur-sm"><img src="/brand/memboux-icon.png" alt="" class="h-24 w-24 opacity-40 brightness-0 invert transition duration-500 group-hover:scale-110"></span></div><div class="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent"></div><span class="absolute bottom-5 left-5 rounded-full border border-white/20 bg-black/25 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">Memboux Studio</span></div></a></section>
        <section id="guest-moments" class="guest-gallery mt-6 scroll-mt-6 rounded-[2rem] border border-[#dee7e3] bg-white p-5 shadow-sm sm:p-8"><div class="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p class="text-xs font-bold uppercase tracking-[.18em] text-[#2f6b5b]">Guest moments</p><h2 class="mt-1 text-3xl">Gallery</h2>${galleryFilterControls(photoItems, "guest-gallery", locale)}</div><div class="flex flex-wrap gap-2"><button id="select-media" class="rounded-xl border px-4 py-2 text-sm font-semibold">${locale === "el" ? "Επιλογή" : "Select"}</button><button id="download-selected" class="hidden rounded-xl bg-[#2f6b5b] px-4 py-2 text-sm font-semibold text-white">${locale === "el" ? "Λήψη επιλεγμένων" : "Download selected"}</button></div></div>${photoItems.length ? `<div data-gallery-grid="guest-gallery" class="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">${cards(photoItems, { selectable: true, deferredSelection: true, lightbox: true, reportCode: event.code, locale, likes: true })}</div>` : `<div class="rounded-3xl border border-dashed border-[#cfdbd6] bg-[#f8faf9] px-6 py-16 text-center"><p class="text-2xl">${locale === "el" ? "Η πρώτη στιγμή περιμένει εσένα" : "The first moment is yours"}</p><a href="#guest-upload" class="mt-4 inline-flex rounded-xl bg-[#183c33] px-5 py-3 text-sm font-semibold text-white">${locale === "el" ? "Πρόσθεσε φωτογραφίες" : "Add photos"}</a></div>`}</section>
        ${renderGuestParticipation(event.code, guestbookResult.results, locale, experienceSettings ?? undefined)}
      </main>${galleryFilterScript(photoItems, "guest-gallery")}${lightboxMarkup(locale, true)}${experienceSettings?.comments_enabled === 0 ? "" : mediaCommentsOverlay(event.code, locale)}${selectionScript}${mediaLikesScript(event.code, locale)}<script>(()=>{const button=document.getElementById('copy-guest-link');button?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(${JSON.stringify(guestUrl)});button.textContent=button.dataset.copiedLabel;setTimeout(()=>button.textContent=button.dataset.copyLabel,1800)}catch{}})})()<\/script>`,
      { locale },
    ),
  );
});

galleryRoutes.post("/api/gallery/:code/media/:mediaId/like", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.json({ message: "Event not found" }, 404);
  if (Date.now() > event.expires_at)
    return c.json({ message: "Event expired" }, 410);
  if (!(await hasGalleryAccess(c.req.raw, event))) {
    const user = await currentUser(c);
    if (!user || !(await getEventRole(c.env.DB, event.id, user.id)))
      return c.json({ message: "Gallery access required" }, 401);
  }

  const limit = await consumeRateLimit(c.env.DB, c.req.raw, c.env.BETTER_AUTH_SECRET, {
    scope: `media-like:${event.id}`,
    limit: 180,
    windowMs: 60_000,
  });
  if (!limit.allowed)
    return tooManyRequests(limit, "Too many reactions. Please try again shortly.");

  const existingVisitor = existingMediaLikeVisitor(c.req.raw);
  const visitor = existingVisitor ?? mediaLikeVisitor(c.req.raw);
  const actorKey = await mediaLikeActorKey(c.env.BETTER_AUTH_SECRET, visitor);
  const result = await toggleMediaLike(
    c.env.DB,
    event.id,
    c.req.param("mediaId"),
    actorKey,
  );
  if (!result) return c.json({ message: "Photo not found" }, 404);

  if (!existingVisitor) {
    setCookie(c, MEDIA_LIKE_COOKIE, visitor, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      maxAge: MEDIA_LIKE_COOKIE_MAX_AGE,
    });
  }
  c.header("Cache-Control", "private, no-store");
  return c.json(result);
});

galleryRoutes.get("/gallery/:code/official", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  const locale = normalizeLocale(c.req.query("lang") ?? event.default_locale);
  if (Date.now() > event.expires_at) return c.text("Event expired", 410);
  if (!(await hasGalleryAccess(c.req.raw, event)))
    return c.redirect(`/gallery/${event.code}?lang=${locale}`);
  const otherLocale = locale === "el" ? "en" : "el";
  const likeVisitor = existingMediaLikeVisitor(c.req.raw);
  const likeActorKey = likeVisitor
    ? await mediaLikeActorKey(c.env.BETTER_AUTH_SECRET, likeVisitor)
    : "";
  const [officialItems, curator] = await Promise.all([
    getOfficialMediaWithLikes(c.env.DB, event.id, likeActorKey),
    c.env.DB.prepare(
      `SELECT p.business_name FROM event_professional_assignments a
       JOIN professional_profiles p ON p.user_id=a.professional_user_id
       WHERE a.event_id=? AND a.status='accepted' ORDER BY a.accepted_at DESC LIMIT 1`,
    ).bind(event.id).first<{ business_name: string }>().catch(() => null),
  ]);
  const items = officialItems.filter((item) => item.media_type === "image");
  const featured = items[0];
  const featuredMedia = featured
    ? `<button type="button" class="lightbox-item group block h-full min-h-[20rem] w-full overflow-hidden" data-src="/media/${encodeURIComponent(featured.id)}" data-type="${featured.media_type}" data-uploader="${esc(featured.uploaded_by)}"${featured.media_type === "image" ? ` data-media-id="${esc(featured.id)}" data-like-count="${Number(featured.like_count ?? 0)}" data-liked="${Boolean(featured.viewer_liked)}"` : ""}>${featured.media_type === "image" ? `<img src="/media/${encodeURIComponent(featured.id)}" alt="" class="h-full w-full object-cover transition duration-700 group-hover:scale-[1.025]">` : `<video src="/media/${encodeURIComponent(featured.id)}" muted playsinline preload="metadata" class="h-full w-full object-cover"></video>`}</button>`
    : `<div class="flex min-h-[20rem] items-center justify-center bg-gradient-to-br from-[#2a4139] via-[#2b6253] to-[#b5d0c5]"><img src="/brand/memboux-icon.png" alt="" class="h-28 w-28 opacity-25 brightness-0 invert"></div>`;
  return c.html(
    page(
      `${event.eventName} – Official album`,
      `<main class="official-album-page mx-auto max-w-7xl p-4 sm:p-6 lg:p-10"><header class="flex items-center justify-between px-1 py-2">${brandMark("/", true)}<div class="flex items-center gap-2"><a href="/gallery/${event.code}/official?lang=${otherLocale}" class="rounded-full border border-[#d9e3df] bg-white px-4 py-2 text-xs font-bold tracking-[.12em]">${otherLocale.toUpperCase()}</a><a href="/gallery/${event.code}?lang=${locale}" class="rounded-full bg-[#183c33] px-4 py-2 text-xs font-semibold text-white">${locale === "el" ? "Guest moments" : "Guest moments"}</a></div></header><section class="mt-4 grid overflow-hidden rounded-[2.25rem] border border-[#dee7e3] bg-white shadow-sm lg:grid-cols-[minmax(0,.85fr)_minmax(28rem,1.15fr)]"><div class="flex flex-col justify-center p-7 sm:p-10 lg:p-14"><p class="text-xs font-bold uppercase tracking-[.22em] text-[#2f6b5b]">${locale === "el" ? "Επίσημη συλλογή" : "Official collection"}</p><h1 class="mt-3 text-4xl leading-tight sm:text-5xl">${esc(event.eventName)}</h1><p class="mt-4 font-semibold text-[#2f6b5b]">${esc(formatEventDates(event, locale))}</p>${event.location ? `<p class="mt-2 text-sm text-[#687a74]">${esc(event.location)}</p>` : ""}<p class="mt-5 max-w-xl text-sm leading-7 text-[#687a74]">${locale === "el" ? "Μια προσεκτικά επιμελημένη αφήγηση του event, ξεχωριστή από τις αυθόρμητες στιγμές των guests." : "A carefully curated story of the event, presented separately from the guests’ candid moments."}</p><div class="mt-7 flex items-center gap-3"><span class="flex h-10 w-10 items-center justify-center rounded-full bg-[#e9f2ee] text-[#2f6b5b]">✦</span><div><p class="text-xs uppercase tracking-[.14em] text-[#8b9994]">${locale === "el" ? "Επιμέλεια" : "Curated by"}</p><p class="font-semibold text-[#2b443c]">${esc(curator?.business_name ?? "Memboux Studio")}</p></div></div></div><div class="relative min-h-[20rem] bg-[#183c33]">${featuredMedia}${featured ? `<span class="pointer-events-none absolute right-5 top-5 rounded-full border border-white/20 bg-black/30 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">${locale === "el" ? "Άνοιγμα" : "Open"}</span>${mediaLikeButton(featured, locale, "absolute bottom-5 left-5 z-30")}` : ""}</div></section><section class="mt-6 rounded-[2rem] border border-[#dee7e3] bg-white p-5 shadow-sm sm:p-8"><div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p class="text-xs font-bold uppercase tracking-[.18em] text-[#2f6b5b]">${locale === "el" ? "Η επίσημη ιστορία" : "The official story"}</p><h2 class="mt-1 text-3xl">${locale === "el" ? "Επιλεγμένες στιγμές" : "Curated moments"}</h2></div><span class="text-sm font-semibold text-[#7b8a85]">${items.length} ${locale === "el" ? "στιγμές" : "moments"}</span></div>${items.length > 1 ? `<div class="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">${cards(items.slice(1), { lightbox: true, locale, likes: true })}</div>` : items.length ? `<p class="mt-6 rounded-2xl bg-[#f7faf8] p-5 text-sm text-[#687a74]">${locale === "el" ? "Η πρώτη επιλεγμένη στιγμή εμφανίζεται επάνω." : "The first curated moment is featured above."}</p>` : `<div class="mt-6 rounded-3xl border border-dashed border-[#cfdbd6] bg-[#f8faf9] px-6 py-16 text-center"><p class="text-2xl">${locale === "el" ? "Η επίσημη συλλογή ετοιμάζεται" : "The official collection is being prepared"}</p><p class="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#687a74]">${locale === "el" ? "Το επιλεγμένο υλικό του επαγγελματία θα εμφανιστεί εδώ μόλις δημοσιευτεί." : "The professional’s selected media will appear here as soon as it is published."}</p></div>`}</section></main>${lightboxMarkup(locale, true)}${mediaCommentsOverlay(event.code, locale)}${mediaLikesScript(event.code, locale)}`,
      { locale },
    ),
  );
});

galleryRoutes.get("/gallery/:code/removal/:mediaId", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if (!(await hasGalleryAccess(c.req.raw, event)))
    return c.text("Gallery PIN required", 401);
  const media = await c.env.DB.prepare(
    "SELECT id FROM media WHERE id=? AND event_id=? AND deleted_at IS NULL",
  )
    .bind(c.req.param("mediaId"), event.id)
    .first();
  if (!media) return c.text("Media not found", 404);

  return c.html(
    page(
      "Request removal",
      `<main class="mx-auto flex min-h-screen max-w-xl items-center p-5"><section class="w-full rounded-3xl bg-white p-7 shadow-xl">${brandMark("/", true)}<p class="mt-7 text-xs uppercase tracking-[.2em] text-[#255848]">Privacy request</p><h1 class="mt-2 text-4xl">Request photo removal</h1><p class="mt-3 text-[#65756f]">Use this form if you appear in this content or believe it infringes your privacy or rights. The event owner will receive the request for review.</p><form action="/gallery/${encodeURIComponent(event.code)}/removal/${encodeURIComponent(c.req.param("mediaId"))}" method="post" class="mt-6 space-y-4"><label class="block">Email<input name="email" type="email" required maxlength="254" class="mt-1 w-full rounded-xl border px-4 py-3"></label><label class="block">Reason<textarea name="reason" required minlength="10" maxlength="1000" rows="5" class="mt-1 w-full rounded-xl border px-4 py-3"></textarea></label><button class="w-full rounded-xl bg-[#2f6b5b] px-5 py-3 text-white">Submit removal request</button></form></section></main>`,
    ),
  );
});

galleryRoutes.post("/gallery/:code/removal/:mediaId", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if (!(await hasGalleryAccess(c.req.raw, event)))
    return c.text("Gallery PIN required", 401);
  const media = await c.env.DB.prepare(
    "SELECT id FROM media WHERE id=? AND event_id=? AND deleted_at IS NULL",
  )
    .bind(c.req.param("mediaId"), event.id)
    .first();
  if (!media) return c.text("Media not found", 404);

  const reportLimit = await consumeRateLimit(c.env.DB, c.req.raw, c.env.BETTER_AUTH_SECRET, {
    scope: `removal-report:${event.code}`,
    limit: 5,
    windowMs: 60 * 60_000,
  });
  if (!reportLimit.allowed) return tooManyRequests(reportLimit);

  const body = await c.req.parseBody();
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 254);
  const reason = String(body.reason ?? "").trim().slice(0, 1000);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || reason.length < 10)
    return c.text("Check your email and reason.", 400);

  const reportedAt = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO media_removal_requests (id,media_id,event_id,requester_email,reason,status,created_at) VALUES (?,?,?,?,?,'pending',?)",
    ).bind(crypto.randomUUID(), c.req.param("mediaId"), event.id, email, reason, reportedAt),
    c.env.DB.prepare("UPDATE media SET reported_at=? WHERE id=? AND event_id=? AND deleted_at IS NULL").bind(reportedAt, c.req.param("mediaId"), event.id),
  ]);

  return c.html(
    page(
      "Request received",
      `<main class="flex min-h-screen items-center justify-center p-5"><section class="max-w-lg rounded-3xl bg-white p-8 text-center shadow-xl"><h1 class="text-4xl">Request received</h1><p class="mt-3 text-[#65756f]">Your removal request was recorded and will be reviewed by the event owner.</p><a href="/gallery/${encodeURIComponent(event.code)}" class="mt-6 inline-block rounded-xl bg-[#2f6b5b] px-5 py-3 text-white">Back to gallery</a></section></main>`,
    ),
  );
});

galleryRoutes.post("/api/upload/:code", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Η εκδήλωση δεν βρέθηκε.", 404);
  if (Date.now() > event.expires_at) return c.text("Η εκδήλωση έχει λήξει.", 410);
  if (!(await hasGalleryAccess(c.req.raw, event)))
    return c.text("Gallery PIN required", 401);
  const uploaderUser = await currentUser(c);

  const uploadLimit = await consumeRateLimit(c.env.DB, c.req.raw, c.env.BETTER_AUTH_SECRET, {
    scope: `gallery-upload:${event.code}`,
    limit: 30,
    windowMs: 60 * 60_000,
  });
  if (!uploadLimit.allowed) return tooManyRequests(uploadLimit);

  const form = await c.req.formData();
  const locale = normalizeLocale(String(form.get("locale") ?? event.default_locale));
  if (form.get("upload_confirmation") !== "accepted")
    return c.text("Απαιτείται επιβεβαίωση πριν από το upload.", 400);

  const uploadedBy = String(form.get("name") ?? "Ανώνυμος").trim().slice(0, 60) || "Ανώνυμος";
  const files = form.getAll("file").filter((value): value is File => value instanceof File && value.size > 0);
  const validationError = validateUploadFiles(files);
  if (validationError) {
    const detail = uploadValidationDetails(validationError, locale);
    return new Response(detail.message, { status: detail.status });
  }

  const uploadedKeys: string[] = [];
  let reservedBytes = 0;
  let reservationOwner: string | null = null;

  try {
    for (const file of files) {
      const id = crypto.randomUUID();
      const extension = safeFileExtension(file.name);
      const objectKey = `${event.id}/${id}.${extension}`;
      const bytes = await file.arrayBuffer();
      const contentHash = await sha256Bytes(bytes);
      const canonicalHash = await mediaCanonicalHash(bytes, file.type, contentHash);
      if (
        await c.env.DB.prepare("SELECT 1 FROM media WHERE event_id=? AND deleted_at IS NULL AND (content_hash=? OR canonical_hash=?)")
          .bind(event.id, contentHash, canonicalHash)
          .first()
      ) {
        continue;
      }

      const reservation = await reserveStorageForEvent(c.env.DB, event.id, file.size);
      if (!reservation.allowed) throw new Error("storage_quota_exceeded");
      reservationOwner = reservation.ownerId;
      reservedBytes += file.size;

      let capturedAt: number | null = null;
      if (file.type.startsWith("image/")) {
        try {
          const metadata = await parseMetadata(bytes, ["DateTimeOriginal", "CreateDate", "ModifyDate"]);
          const value = metadata?.DateTimeOriginal ?? metadata?.CreateDate ?? metadata?.ModifyDate;
          const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
          if (Number.isFinite(parsed) && parsed > 0 && parsed <= Date.now() + 86400000) capturedAt = parsed;
        } catch {
          /* No readable metadata. */
        }
      }

      await c.env.MEDIA.put(objectKey, bytes, {
        httpMetadata: { contentType: file.type, cacheControl: "private, no-store" },
      });
      uploadedKeys.push(objectKey);
      const uploadedAt = Date.now();
      try {
        await c.env.DB.prepare(
          "INSERT INTO media (id,event_id,object_key,media_type,content_type,uploaded_by,uploaded_at,captured_at,content_hash,canonical_hash,size_bytes,title,upload_consent_at,upload_policy_version,uploaded_by_user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL,?,?,?)",
        ).bind(
          id,
          event.id,
          objectKey,
          file.type.startsWith("image/") ? "image" : "video",
          file.type,
          uploadedBy,
          uploadedAt,
          capturedAt,
          contentHash,
          canonicalHash,
          file.size,
          uploadedAt,
          GUEST_UPLOAD_POLICY_VERSION,
          uploaderUser?.id ?? null,
        ).run();
      } catch (error) {
        if (!isCanonicalDuplicateConstraint(error)) throw error;
        await c.env.MEDIA.delete(objectKey);
        uploadedKeys.pop();
        await releaseStorage(c.env.DB, reservation.ownerId, file.size);
        reservedBytes -= file.size;
      }
    }
  } catch (error) {
    if (uploadedKeys.length) await c.env.MEDIA.delete(uploadedKeys);
    if (uploadedKeys.length)
      await c.env.DB.batch(uploadedKeys.map((key) => c.env.DB.prepare("DELETE FROM media WHERE object_key=?").bind(key)));
    await releaseStorage(c.env.DB, reservationOwner, reservedBytes);
    if (error instanceof Error && error.message.includes("storage_quota_exceeded"))
      return c.text(locale === "el" ? "Το όριο χώρου του event συμπληρώθηκε." : "The event storage quota was reached.", 413);
    throw error;
  }

  if (uploadedKeys.length) {
    await notifyEventMembersAboutUpload(c.env.DB, {
      eventId: event.id,
      actorUserId: uploaderUser?.id ?? null,
      actorName: uploaderUser?.name ?? uploadedBy,
      itemCount: uploadedKeys.length,
    });
    c.executionCtx.waitUntil(
      queueAutomaticCloudBackupsForEvent(c.env, event.id).catch((error) => {
        console.error(JSON.stringify({
          event: "drive_upload_sync_failed",
          eventId: event.id,
          error: error instanceof Error ? error.message.slice(0, 300) : "unknown",
        }));
      }),
    );
  }

  if (c.req.header("Accept")?.includes("application/json"))
    return c.json({ ok: true, uploaded: uploadedKeys.length });
  return c.redirect(`/gallery/${event.code}?lang=${locale}`, 303);
});

galleryRoutes.get("/media/:id", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT m.object_key,m.content_type,m.media_type,m.captured_at,m.uploaded_at,m.event_id,e.code,e.gallery_pin_hash FROM media m JOIN events e ON e.id=m.event_id WHERE m.id=? AND m.deleted_at IS NULL AND m.reported_at IS NULL AND e.deleted_at IS NULL",
  )
    .bind(c.req.param("id"))
    .first<{
      object_key: string;
      content_type: string;
      media_type: "image" | "video";
      captured_at: number | null;
      uploaded_at: number;
      event_id: string;
      code: string;
      gallery_pin_hash: string | null;
    }>();
  if (!row) return c.text("Το αρχείο δεν βρέθηκε.", 404);

  if (row.gallery_pin_hash) {
    const expected = await sha256(`gallery-access:${row.event_id}:${row.gallery_pin_hash}`);
    if (!constantTimeEqual(cookieValue(c.req.raw, galleryCookieName(row.code)) ?? "", expected)) {
      const user = await currentUser(c);
      if (!user || !roleCan(await getEventRole(c.env.DB, row.event_id, user.id), "view"))
        return c.text("Private media", 401);
    }
  }

  const variant = c.req.query("download") === "1" || row.media_type !== "image"
    ? null
    : parseMediaVariant(c.req.query("variant"));
  let object: R2ObjectBody | null = null;
  let transformed = false;
  if (variant) {
    try {
      const result = await getOrCreateMediaVariant(c.env, row.object_key, variant);
      object = result?.object ?? null;
      transformed = Boolean(object && object.key !== row.object_key);
    } catch (error) {
      console.error(JSON.stringify({
        event: "image_variant_failed",
        mediaId: c.req.param("id"),
        variant,
        error: error instanceof Error ? error.message.slice(0, 300) : "unknown",
      }));
    }
  }
  object ??= await c.env.MEDIA.get(row.object_key);
  if (!object) return c.text("Το αρχείο δεν βρέθηκε.", 404);

  const headers = new Headers({
    "Content-Type": transformed ? "image/webp" : row.content_type,
    "Cache-Control": transformed ? "private, max-age=31536000, immutable" : "private, no-store",
    ETag: object.httpEtag,
    "X-Content-Type-Options": "nosniff",
  });

  if (c.req.query("download") === "1") {
    const extension =
      row.content_type.split("/")[1]?.replace("jpeg", "jpg").replace("quicktime", "mov") ||
      (row.media_type === "image" ? "jpg" : "mp4");
    const date = new Date(row.captured_at ?? row.uploaded_at).toISOString().slice(0, 10);
    headers.set("Content-Disposition", `attachment; filename="memboux-${date}.${extension}"`);
  }

  return new Response(object.body, { headers });
});
