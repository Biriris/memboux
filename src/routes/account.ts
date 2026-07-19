import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { getEventRole, roleCan } from "../access";
import { TRASH_RETENTION_MS } from "../config";
import type { Bindings, EventRow, MediaRow } from "../domain";
import { eventTypeFieldLabel, eventTypeOptions, isEventType } from "../event-types";
import { localeNames, normalizeLocale, supportedLocales, t, type Locale } from "../i18n";
import { listPendingInvitations } from "../invitations";
import { buildAccountExport, countActiveOwnedEvents } from "../account-data";
import { formatBytes, getUserEntitlement, releaseOwnedEvent, reserveOwnedEvent } from "../quotas";
import { permanentlyDeleteMedia, restoreDeletedMedia } from "../media-trash";
import { GooglePlacesError, PlaceInputError, resolveEventPlaceInput, resolveGooglePlace, searchGooglePlaces } from "../places";
import { consumeRateLimit, tooManyRequests } from "../rate-limit";
import { getEvent } from "../repositories";
import { currentSession, currentUser } from "../session";
import { esc, formatDateTime, formatEventDates, randomCode, sha256, validEventDate } from "../utils";
import { lightboxMarkup } from "../views/media";
import { eventPinDialog, renderEventPinControl } from "../views/event-pin";
import { locationPickerMarkup, locationPickerScript } from "../views/location-picker";
import { accountHeader, accountMenu, brandMark, eventHeader, logoutScript, page } from "../views/shared";

export { renderEventPinControl } from "../views/event-pin";

export const accountRoutes = new Hono<{ Bindings: Bindings }>();

accountRoutes.get("/api/account/locations/search", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ message: "Unauthorized" }, 401);
  const locale = normalizeLocale(c.req.query("locale") ?? "en");
  if (!c.env.GOOGLE_MAPS_API_KEY) {
    return c.json({ message: locale === "el" ? "Η αναζήτηση τοποθεσίας δεν έχει ενεργοποιηθεί ακόμη." : "Location search is not configured yet." }, 503);
  }
  const rate = await consumeRateLimit(c.env.DB, c.req.raw, c.env.BETTER_AUTH_SECRET, {
    scope: `place-search:${user.id}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed) return tooManyRequests(rate);
  try {
    const suggestions = await searchGooglePlaces(
      c.env.GOOGLE_MAPS_API_KEY,
      c.req.query("q") ?? "",
      locale,
      c.req.query("sessionToken"),
    );
    c.header("Cache-Control", "private, no-store");
    return c.json({ suggestions });
  } catch (error) {
    console.error(JSON.stringify({ event: "place_search_failed", userId: user.id, error: error instanceof Error ? error.message : String(error) }));
    const message = error instanceof GooglePlacesError && (error.status === 401 || error.status === 403)
      ? (locale === "el"
          ? "Το Google Places απέρριψε το key. Έλεγξε ότι είναι ενεργό το Places API (New), το billing και ότι το key δεν έχει περιορισμό Website/HTTP referrers."
          : "Google Places rejected the key. Check Places API (New), billing, and make sure the key is not restricted to Website/HTTP referrers.")
      : error instanceof GooglePlacesError && error.status === 429
        ? (locale === "el" ? "Το Google Places έφτασε προσωρινά το όριο αιτημάτων. Δοκίμασε ξανά σε λίγο." : "Google Places reached its request limit. Try again shortly.")
        : (locale === "el" ? "Η αναζήτηση τοποθεσίας απέτυχε προσωρινά." : "Location search is temporarily unavailable.");
    return c.json({ message }, 502);
  }
});

accountRoutes.get("/api/account/locations/resolve", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ message: "Unauthorized" }, 401);
  const locale = normalizeLocale(c.req.query("locale") ?? "en");
  if (!c.env.GOOGLE_MAPS_API_KEY) return c.json({ message: "Location search is not configured yet." }, 503);
  const rate = await consumeRateLimit(c.env.DB, c.req.raw, c.env.BETTER_AUTH_SECRET, {
    scope: `place-resolve:${user.id}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed) return tooManyRequests(rate);
  try {
    const place = await resolveGooglePlace(
      c.env.GOOGLE_MAPS_API_KEY,
      c.req.query("placeId") ?? "",
      locale,
      c.req.query("sessionToken"),
    );
    c.header("Cache-Control", "private, no-store");
    return c.json({ place });
  } catch (error) {
    console.error(JSON.stringify({ event: "place_resolve_failed", userId: user.id, error: error instanceof Error ? error.message : String(error) }));
    return c.json({ message: locale === "el" ? "Δεν ήταν δυνατή η εμφάνιση του σημείου στον χάρτη." : "Could not show this place on the map." }, 502);
  }
});

export function selectedEventCoverUrl(event: {
  code: string;
  cover_object_key: string | null;
  cover_updated_at: number | null;
}) {
  return event.cover_object_key
    ? `/event-cover/${encodeURIComponent(event.code)}?v=${event.cover_updated_at ?? 0}`
    : null;
}

export type AccountEventFilter = "all" | "owner" | "shared" | "professional" | "upcoming" | "past";

export function shouldShowProfessionalDashboardSection(
  hasActiveProfessionalProfile: boolean,
  filter: AccountEventFilter,
) {
  return hasActiveProfessionalProfile && filter !== "owner" && filter !== "shared";
}

export function professionalAssignmentHref(
  code: string,
  status: "invited" | "accepted",
  locale: Locale,
) {
  return status === "accepted"
    ? `/studio/events/${encodeURIComponent(code)}?lang=${locale}`
    : `/studio?lang=${locale}`;
}

export function eventAlbumPreviewHref(code: string, professional: boolean, locale: Locale) {
  const path = professional ? "official" : "";
  return `/gallery/${encodeURIComponent(code)}${path ? `/${path}` : ""}?lang=${locale}`;
}

export function renderDashboardSection(
  id: string,
  title: string,
  subtitle: string,
  content: string,
  empty: string,
) {
  return `<details id="${esc(id)}" open class="group/dashboard-section mt-10 scroll-mt-24"><summary class="flex cursor-pointer list-none items-end justify-between gap-4 rounded-2xl px-1 py-2 outline-none transition hover:bg-white/55 focus-visible:ring-2 focus-visible:ring-[#75a895]"><span><span class="block text-xs uppercase tracking-[.18em] text-[#2f6b5b]">${esc(subtitle)}</span><span class="mt-1 block text-3xl text-[#183c33]">${esc(title)}</span></span><span class="mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#dfe8e4] bg-white text-[#586c65] shadow-sm transition group-open/dashboard-section:rotate-180"><svg aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 9 6 6 6-6"/></svg></span></summary><div class="mt-3 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">${content || `<div class="rounded-2xl border border-dashed bg-white p-8 text-center text-sm text-[#65756f] sm:col-span-2 xl:col-span-3">${empty}</div>`}</div></details>`;
}

export function renderDashboardSubmenu(
  locale: Locale,
  visible: { owned: boolean; shared: boolean; studio: boolean },
) {
  const labels: Record<Locale, { owned: string; shared: string; studio: string; navigation: string }> = {
    en: { owned: "My events", shared: "Shared events", studio: "Memboux Studio albums", navigation: "Dashboard sections" },
    el: { owned: "Τα events μου", shared: "Κοινόχρηστα events", studio: "Albums Memboux Studio", navigation: "Ενότητες dashboard" },
    fr: { owned: "Mes événements", shared: "Événements partagés", studio: "Albums Memboux Studio", navigation: "Sections du tableau de bord" },
    de: { owned: "Meine Events", shared: "Geteilte Events", studio: "Memboux Studio-Alben", navigation: "Dashboard-Bereiche" },
    es: { owned: "Mis eventos", shared: "Eventos compartidos", studio: "Álbumes de Memboux Studio", navigation: "Secciones del panel" },
    it: { owned: "I miei eventi", shared: "Eventi condivisi", studio: "Album Memboux Studio", navigation: "Sezioni della dashboard" },
  };
  const copy = labels[locale];
  const items = [
    ...(visible.owned ? [{ id: "my-events", label: copy.owned, studio: false }] : []),
    ...(visible.shared ? [{ id: "shared-with-me", label: copy.shared, studio: false }] : []),
    ...(visible.studio ? [{ id: "official-photographer", label: copy.studio, studio: true }] : []),
  ];
  if (!items.length) return "";
  return `<nav data-dashboard-submenu aria-label="${esc(copy.navigation)}" class="sticky top-0 z-30 -mx-4 mt-6 border-y border-[#e4ece8] bg-[#f3f7f5]/95 px-4 py-3 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border sm:px-3"><div class="flex gap-1 overflow-x-auto">${items.map((item, index) => `<a data-dashboard-nav href="#${item.id}" aria-current="${index === 0 ? "page" : "false"}" class="whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold text-[#586c65] transition hover:bg-white hover:text-[#183c33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75a895]${item.studio ? " sm:ml-auto" : ""}">${esc(item.label)}</a>`).join("")}</div></nav><style>[data-dashboard-submenu] [data-dashboard-nav][aria-current="page"]{background:#fff;color:#183c33;box-shadow:0 1px 3px rgba(24,60,51,.12)}</style><script>(()=>{const nav=document.querySelector('[data-dashboard-submenu]');if(!nav)return;const links=[...nav.querySelectorAll('[data-dashboard-nav]')];const activate=id=>{links.forEach(link=>link.setAttribute('aria-current',link.hash==='#'+id?'page':'false'));const active=links.find(link=>link.getAttribute('aria-current')==='page');active?.scrollIntoView({block:'nearest',inline:'nearest'})};links.forEach(link=>link.addEventListener('click',()=>{const id=link.hash.slice(1),target=document.getElementById(id);if(target instanceof HTMLDetailsElement)target.open=true;activate(id)}));const initial=location.hash.slice(1);if(initial&&links.some(link=>link.hash==='#'+initial))activate(initial);if('IntersectionObserver'in window){const observer=new IntersectionObserver(entries=>{const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(visible)activate(visible.target.id)},{rootMargin:'-20% 0px -60% 0px',threshold:[0,.15,.4]});links.forEach(link=>{const target=document.getElementById(link.hash.slice(1));if(target)observer.observe(target)})}})()<\/script>`;
}

export function renderCreateEventTile(label: string, locale: Locale) {
  return `<button type="button" data-open-new-event aria-label="${esc(label)}" class="group overflow-hidden rounded-[1.75rem] border-2 border-dashed border-[#c9d8d2] bg-white/55 text-left transition duration-300 hover:-translate-y-1 hover:border-[#6fa18f] hover:bg-white hover:shadow-xl"><span class="flex aspect-[16/10] items-center justify-center bg-gradient-to-br from-[#f4f8f6] to-[#e9f1ed]"><span data-new-event-plus class="flex h-16 w-16 items-center justify-center rounded-full border border-[#dce7e2] bg-white text-[#2f6b5b] shadow-lg transition duration-300 group-hover:scale-110 group-hover:border-[#2f6b5b] group-hover:bg-[#2f6b5b] group-hover:text-white"><svg aria-hidden="true" viewBox="0 0 24 24" class="h-7 w-7 transition group-hover:stroke-white" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></span></span><span class="block p-5"><strong class="block text-2xl font-medium text-[#183c33]">${esc(label)}</strong><span class="mt-2 block text-sm leading-6 text-[#697a74]">${locale === "el" ? "Δημιούργησε ένα νέο ιδιωτικό album." : "Create a new private event album."}</span></span></button>`;
}

export function renderNewEventTypeField(locale: Locale) {
  const choices = eventTypeOptions(locale, "other").replace(" selected", "");
  const label = eventTypeFieldLabel(locale);
  return `<label class="md:col-span-2"><span class="mb-1 block text-sm font-medium">${esc(label)}</span><select name="eventType" required class="w-full cursor-pointer rounded-xl border px-4 py-3"><option value="" selected disabled>${esc(label)}</option>${choices}</select></label>`;
}

type ActivityNotification = {
  id: string;
  type: "invitation_accepted" | "media_uploaded";
  actor_user_id: string | null;
  actor_name: string | null;
  item_count: number;
  created_at: number;
  read_at: number | null;
  event_code: string | null;
  event_name: string | null;
};

function notificationTitle(notification: ActivityNotification, viewerId: string, locale: Locale) {
  const el = locale === "el";
  const isSelf = notification.actor_user_id === viewerId;
  const actor = notification.actor_name || (el ? "Κάποιος" : "Someone");
  if (notification.type === "invitation_accepted") {
    return isSelf
      ? (el ? "Αποδέχτηκες μια πρόσκληση" : "You accepted an invitation")
      : (el ? `${actor} αποδέχτηκε την πρόσκλησή σου` : `${actor} accepted your invitation`);
  }
  const itemLabel = el
    ? (notification.item_count === 1 ? "αρχείο" : "αρχεία")
    : (notification.item_count === 1 ? "item" : "items");
  return isSelf
    ? (el ? `Ανέβασες ${notification.item_count} ${itemLabel}` : `You uploaded ${notification.item_count} ${itemLabel}`)
    : (el ? `${actor} ανέβασε ${notification.item_count} ${itemLabel}` : `${actor} uploaded ${notification.item_count} ${itemLabel}`);
}

accountRoutes.get("/api/account/notifications/count", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ message: "Unauthorized" }, 401);
  const [invitations, unread] = await Promise.all([
    listPendingInvitations(c.env.DB, user, Date.now()),
    c.env.DB.prepare("SELECT COUNT(*) total FROM account_notifications WHERE user_id=? AND read_at IS NULL")
      .bind(user.id)
      .first<{ total: number }>(),
  ]);
  c.header("Cache-Control", "private, no-store");
  return c.json({ count: invitations.length + Number(unread?.total ?? 0) });
});

accountRoutes.get("/api/account/notifications/preview", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ message: "Unauthorized" }, 401);
  const locale = normalizeLocale(c.req.query("locale") ?? "en");
  const el = locale === "el";
  const [pending, activity, unread] = await Promise.all([
    listPendingInvitations(c.env.DB, user, Date.now()),
    c.env.DB.prepare(`SELECT n.id,n.type,n.actor_user_id,n.actor_name,n.item_count,n.created_at,n.read_at,
        e.code event_code,e.eventName event_name
      FROM account_notifications n
      LEFT JOIN events e ON e.id=n.event_id
      WHERE n.user_id=?
      ORDER BY n.created_at DESC LIMIT 6`)
      .bind(user.id)
      .all<ActivityNotification>(),
    c.env.DB.prepare("SELECT COUNT(*) total FROM account_notifications WHERE user_id=? AND read_at IS NULL")
      .bind(user.id)
      .first<{ total: number }>(),
  ]);
  const invitations = pending.slice(0, 3).map((invitation) => ({
    id: null,
    kind: "invitation",
    title: invitation.event_name,
    detail: el
      ? `${invitation.inviter_name} σε προσκάλεσε σε album`
      : `${invitation.inviter_name} invited you to an album`,
    href: `/${locale}/notifications`,
    unread: true,
  }));
  const notifications = activity.results.map((notification) => {
    return {
      id: notification.id,
      kind: notification.type,
      title: notificationTitle(notification, user.id, locale),
      detail: `${notification.event_name || "Memboux"} · ${formatDateTime(notification.created_at, locale)}`,
      href: notification.event_code
        ? `/dashboard/${encodeURIComponent(notification.event_code)}?lang=${locale}`
        : `/${locale}/account`,
      unread: notification.read_at === null,
    };
  });
  c.header("Cache-Control", "private, no-store");
  return c.json({
    count: pending.length + Number(unread?.total ?? 0),
    items: [...invitations, ...notifications].slice(0, 6),
    labels: {
      empty: el ? "Δεν υπάρχουν νέες ειδοποιήσεις." : "You’re all caught up.",
      error: el ? "Δεν ήταν δυνατή η φόρτωση." : "Could not load notifications.",
    },
  });
});

accountRoutes.get("/api/account/events/search", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ message: "Unauthorized" }, 401);
  const locale = normalizeLocale(c.req.query("locale") ?? "en");
  const query = (c.req.query("q") ?? "").trim().slice(0, 100);
  const pattern = `%${query}%`;
  const events = await c.env.DB.prepare(`SELECT e.*,em.role,
      SUM(CASE WHEN md.media_type='image' THEN 1 ELSE 0 END) image_count
    FROM event_members em
    JOIN events e ON e.id=em.event_id
    LEFT JOIN media md ON md.event_id=e.id AND md.deleted_at IS NULL AND md.reported_at IS NULL
    WHERE em.user_id=? AND e.deleted_at IS NULL
      AND (?='' OR e.eventName LIKE ? OR e.code LIKE ? OR e.location LIKE ?)
    GROUP BY e.id,em.role
    ORDER BY CASE WHEN ?='' THEN e.updated_at ELSE 0 END DESC,e.eventName COLLATE NOCASE ASC
    LIMIT 20`)
    .bind(user.id, query, pattern, pattern, pattern, query)
    .all<EventRow & { role: string; image_count: number }>();
  c.header("Cache-Control", "private, no-store");
  return c.json({
    events: events.results.map((event) => ({
      code: event.code,
      name: event.eventName,
      role: event.role,
      dates: formatEventDates(event, locale),
      imageCount: Number(event.image_count ?? 0),
    })),
  });
});

accountRoutes.get("/:locale{el|en|fr|de|es|it}/notifications", async (c) => {
  const locale = normalizeLocale(c.req.param("locale"));
  const user = await currentUser(c);
  if (!user) return c.redirect(`/${locale}/login`);
  const el = locale === "el";
  const requestedView = c.req.query("view");
  const view: "unread" | "read" | "history" = requestedView === "read" || requestedView === "history" ? requestedView : "unread";
  const [pending, activity] = await Promise.all([
    listPendingInvitations(c.env.DB, user, Date.now()),
    c.env.DB.prepare(`SELECT n.id,n.type,n.actor_user_id,n.actor_name,n.item_count,n.created_at,n.read_at,
        e.code event_code,e.eventName event_name
      FROM account_notifications n
      LEFT JOIN events e ON e.id=n.event_id
      WHERE n.user_id=?
      ORDER BY n.created_at DESC LIMIT 200`)
      .bind(user.id)
      .all<ActivityNotification>(),
  ]);
  const unreadCount = activity.results.filter((item) => item.read_at === null).length;
  const readCount = activity.results.length - unreadCount;
  const visibleActivity = activity.results.filter((item) => view === "history" || (view === "unread" ? item.read_at === null : item.read_at !== null));
  const pendingCards = pending.map((invitation) => `<article class="rounded-2xl border border-[#c8ddd5] bg-white p-5 shadow-sm"><div class="flex items-start justify-between gap-4"><div><p class="text-xs font-bold uppercase tracking-[.16em] text-[#2f6b5b]">${invitation.invitation_kind === "professional" ? "Professional invitation" : (el ? "Πρόσκληση album" : "Album invitation")}</p><h2 class="mt-2 text-2xl">${esc(invitation.event_name)}</h2><p class="mt-2 text-sm text-[#65756f]">${el ? `${esc(invitation.inviter_name)} σε προσκάλεσε` : `Invited by ${esc(invitation.inviter_name)}`}</p></div><span class="h-2.5 w-2.5 rounded-full bg-red-500"></span></div><div class="mt-5 flex gap-2"><form action="/api/account/invitations/${encodeURIComponent(invitation.id)}/accept" method="post" class="flex-1"><input type="hidden" name="locale" value="${locale}"><button class="w-full rounded-xl bg-[#2f6b5b] px-4 py-2.5 text-sm font-semibold text-white">${el ? "Αποδοχή" : "Accept"}</button></form><form action="/api/account/invitations/${encodeURIComponent(invitation.id)}/decline" method="post"><input type="hidden" name="locale" value="${locale}"><button class="rounded-xl border px-4 py-2.5 text-sm font-semibold">${el ? "Απόρριψη" : "Decline"}</button></form></div></article>`).join("");
  const activityCards = visibleActivity.map((notification) => {
    const message = esc(notificationTitle(notification, user.id, locale));
    const href = notification.event_code ? `/dashboard/${encodeURIComponent(notification.event_code)}?lang=${locale}` : `/${locale}/account`;
    const isUnread = notification.read_at === null;
    return `<article class="group flex items-start gap-3 rounded-2xl border ${isUnread ? "border-[#c8ddd5] bg-[#f8faf9]" : "border-[#e3ebe7] bg-white"} p-3 transition hover:shadow-md sm:p-4"><a href="${href}" ${isUnread ? `data-notification-id="${esc(notification.id)}"` : ""} class="flex min-w-0 flex-1 items-start gap-3 rounded-xl p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75a895]"><span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${notification.type === "invitation_accepted" ? "bg-emerald-50 text-emerald-700" : "bg-[#e8f3ee] text-[#255848]"}">${notification.type === "invitation_accepted" ? "✓" : "＋"}</span><span class="min-w-0 flex-1"><span class="flex items-start gap-2"><strong class="block flex-1 text-[#183c33]">${message}</strong>${isUnread ? `<span class="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" aria-label="${el ? "Μη αναγνωσμένη" : "Unread"}"></span>` : ""}</span><span class="mt-1 block truncate text-sm text-[#65756f]">${esc(notification.event_name || "Memboux")} · ${formatDateTime(notification.created_at, locale)}</span></span></a><form action="/api/account/notifications/${encodeURIComponent(notification.id)}/status" method="post" class="shrink-0"><input type="hidden" name="locale" value="${locale}"><input type="hidden" name="view" value="${view}"><input type="hidden" name="action" value="${isUnread ? "read" : "unread"}"><button class="rounded-full border border-[#d6e0dc] bg-white px-3 py-2 text-xs font-semibold text-[#485e56] hover:bg-[#f1f5f3]">${isUnread ? (el ? "Αναγνώστηκε" : "Mark read") : (el ? "Μη αναγνωσμένο" : "Mark unread")}</button></form></article>`;
  }).join("");
  const tab = (value: typeof view, label: string, count: number) => `<a href="/${locale}/notifications?view=${value}" aria-current="${view === value ? "page" : "false"}" class="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${view === value ? "bg-[#183c33] text-white shadow-sm" : "bg-white text-[#586c65] hover:bg-[#edf3f0]"}">${label}<span class="rounded-full ${view === value ? "bg-white/15" : "bg-[#edf3f0]"} px-2 py-0.5 text-[11px]">${count}</span></a>`;
  const empty = view === "unread"
    ? (el ? "Δεν έχεις μη αναγνωσμένες ειδοποιήσεις." : "You have no unread notifications.")
    : view === "read"
      ? (el ? "Δεν έχεις αναγνωσμένες ειδοποιήσεις ακόμη." : "You have no read notifications yet.")
      : (el ? "Δεν υπάρχει ιστορικό δραστηριότητας ακόμη." : "No notification history yet.");
  return c.html(page(el ? "Ειδοποιήσεις" : "Notifications", `${accountHeader(locale, user, pending.length + unreadCount)}<main class="mx-auto max-w-5xl p-5 md:p-10"><div class="flex flex-wrap items-end justify-between gap-4"><div><p class="page-kicker">Activity center</p><h1 class="page-title mt-2">${el ? "Ειδοποιήσεις" : "Notifications"}</h1><p class="page-subtitle mt-3">${el ? "Ένα οργανωμένο inbox για προσκλήσεις, uploads και δραστηριότητα των albums σου." : "A focused inbox for invitations, uploads, and album activity."}</p></div>${unreadCount ? `<form action="/api/account/notifications/read" method="post"><input type="hidden" name="locale" value="${locale}"><input type="hidden" name="view" value="${view}"><button class="rounded-xl border border-[#d6e0dc] bg-white px-4 py-2.5 text-sm font-semibold">${el ? "Όλα ως αναγνωσμένα" : "Mark all as read"}</button></form>` : ""}</div><nav aria-label="${el ? "Φίλτρα ειδοποιήσεων" : "Notification filters"}" class="mt-7 flex flex-wrap gap-2 rounded-2xl border border-[#dee7e3] bg-[#f3f7f5] p-2">${tab("unread", el ? "Μη αναγνωσμένα" : "Unread", unreadCount + pending.length)}${tab("read", el ? "Αναγνωσμένα" : "Read", readCount)}${tab("history", el ? "Ιστορικό" : "History", activity.results.length + pending.length)}</nav>${pendingCards && view !== "read" ? `<section class="mt-8"><h2 class="text-2xl">${el ? "Χρειάζονται απάντηση" : "Needs your response"}</h2><div class="mt-4 grid gap-4 md:grid-cols-2">${pendingCards}</div></section>` : ""}<section class="mt-8"><div class="flex items-center justify-between gap-3"><h2 class="text-2xl">${view === "history" ? (el ? "Ιστορικό δραστηριότητας" : "Activity history") : view === "read" ? (el ? "Αναγνωσμένα" : "Read") : (el ? "Νέα δραστηριότητα" : "New activity")}</h2><span class="text-sm font-semibold text-[#7b8a85]">${visibleActivity.length}</span></div><div class="mt-4 space-y-3">${activityCards || `<div class="rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-[#65756f]">${empty}</div>`}</div></section></main><script>document.querySelectorAll('[data-notification-id]').forEach(link=>link.addEventListener('click',()=>{fetch('/api/account/notifications/'+encodeURIComponent(link.dataset.notificationId)+'/read',{method:'POST',credentials:'include',keepalive:true}).catch(()=>{})}))<\/script>${logoutScript(locale)}`));
});

accountRoutes.post("/api/account/notifications/:id/read", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  await c.env.DB.prepare("UPDATE account_notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?")
    .bind(Date.now(), c.req.param("id"), user.id)
    .run();
  return c.body(null, 204);
});

accountRoutes.post("/api/account/notifications/:id/status", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? "en"));
  const view = body.view === "read" || body.view === "history" ? body.view : "unread";
  const readAt = body.action === "unread" ? null : Date.now();
  await c.env.DB.prepare("UPDATE account_notifications SET read_at=? WHERE id=? AND user_id=?")
    .bind(readAt, c.req.param("id"), user.id)
    .run();
  return c.redirect(`/${locale}/notifications?view=${view}`, 303);
});

accountRoutes.post("/api/account/notifications/read", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? "en"));
  await c.env.DB.prepare("UPDATE account_notifications SET read_at=? WHERE user_id=? AND read_at IS NULL")
    .bind(Date.now(), user.id)
    .run();
  if (c.req.header("Accept")?.includes("application/json")) {
    const pending = await listPendingInvitations(c.env.DB, user, Date.now());
    c.header("Cache-Control", "private, no-store");
    return c.json({ count: pending.length });
  }
  const view = body.view === "read" || body.view === "history" ? body.view : "unread";
  return c.redirect(`/${locale}/notifications?view=${view}`, 303);
});

accountRoutes.get("/:locale{el|en|fr|de|es|it}/settings", async (c) => {
  const locale = normalizeLocale(c.req.param("locale"));
  const user = await currentUser(c);
  if (!user) return c.redirect(`/${locale}/login`);
  const copy = {
    en: { eyebrow: "Account", title: "Settings", intro: "Manage your profile, security, storage and privacy from one place.", profile: "Profile", profileText: "Personal details and professional profile.", security: "Security", securityText: "Password, sessions and connected devices.", backups: "Cloud backups", backupsText: "Google Drive, Dropbox and automatic sync.", plan: "Plan & usage", planText: "Subscription, storage and account limits.", privacy: "Privacy & data", privacyText: "Export your data and manage account deletion.", trash: "Trash", trashText: "Restore events and media before permanent deletion.", language: "App language", languageText: "Your choice is saved on this device.", open: "Open" },
    el: { eyebrow: "Λογαριασμός", title: "Ρυθμίσεις", intro: "Διαχειρίσου προφίλ, ασφάλεια, αποθήκευση και απόρρητο από ένα σημείο.", profile: "Προφίλ", profileText: "Προσωπικά στοιχεία και επαγγελματικό προφίλ.", security: "Ασφάλεια", securityText: "Κωδικός πρόσβασης, sessions και συνδεδεμένες συσκευές.", backups: "Cloud backups", backupsText: "Google Drive, Dropbox και αυτόματος συγχρονισμός.", plan: "Πλάνο & χρήση", planText: "Συνδρομή, αποθηκευτικός χώρος και όρια λογαριασμού.", privacy: "Απόρρητο & δεδομένα", privacyText: "Εξαγωγή δεδομένων και διαχείριση διαγραφής λογαριασμού.", trash: "Κάδος", trashText: "Επαναφορά events και φωτογραφιών πριν την οριστική διαγραφή.", language: "Γλώσσα εφαρμογής", languageText: "Η επιλογή αποθηκεύεται σε αυτή τη συσκευή.", open: "Άνοιγμα" },
    fr: { eyebrow: "Compte", title: "Paramètres", intro: "Gérez votre profil, la sécurité, le stockage et la confidentialité au même endroit.", profile: "Profil", profileText: "Informations personnelles et profil professionnel.", security: "Sécurité", securityText: "Mot de passe, sessions et appareils connectés.", backups: "Sauvegardes cloud", backupsText: "Google Drive, Dropbox et synchronisation automatique.", plan: "Forfait et utilisation", planText: "Abonnement, stockage et limites du compte.", privacy: "Confidentialité et données", privacyText: "Exportez vos données et gérez la suppression du compte.", trash: "Corbeille", trashText: "Restaurez événements et photos avant leur suppression définitive.", language: "Langue de l’application", languageText: "Votre choix est enregistré sur cet appareil.", open: "Ouvrir" },
    de: { eyebrow: "Konto", title: "Einstellungen", intro: "Verwalte Profil, Sicherheit, Speicher und Datenschutz an einem Ort.", profile: "Profil", profileText: "Persönliche Angaben und professionelles Profil.", security: "Sicherheit", securityText: "Passwort, Sitzungen und verbundene Geräte.", backups: "Cloud-Backups", backupsText: "Google Drive, Dropbox und automatische Synchronisierung.", plan: "Tarif und Nutzung", planText: "Abonnement, Speicher und Kontolimits.", privacy: "Datenschutz und Daten", privacyText: "Daten exportieren und Kontolöschung verwalten.", trash: "Papierkorb", trashText: "Events und Fotos vor der endgültigen Löschung wiederherstellen.", language: "App-Sprache", languageText: "Deine Auswahl wird auf diesem Gerät gespeichert.", open: "Öffnen" },
    es: { eyebrow: "Cuenta", title: "Ajustes", intro: "Gestiona tu perfil, seguridad, almacenamiento y privacidad desde un solo lugar.", profile: "Perfil", profileText: "Datos personales y perfil profesional.", security: "Seguridad", securityText: "Contraseña, sesiones y dispositivos conectados.", backups: "Copias en la nube", backupsText: "Google Drive, Dropbox y sincronización automática.", plan: "Plan y uso", planText: "Suscripción, almacenamiento y límites de la cuenta.", privacy: "Privacidad y datos", privacyText: "Exporta tus datos y gestiona la eliminación de la cuenta.", trash: "Papelera", trashText: "Restaura eventos y fotos antes de su eliminación definitiva.", language: "Idioma de la aplicación", languageText: "Tu elección se guarda en este dispositivo.", open: "Abrir" },
    it: { eyebrow: "Account", title: "Impostazioni", intro: "Gestisci profilo, sicurezza, spazio e privacy da un unico posto.", profile: "Profilo", profileText: "Dati personali e profilo professionale.", security: "Sicurezza", securityText: "Password, sessioni e dispositivi collegati.", backups: "Backup cloud", backupsText: "Google Drive, Dropbox e sincronizzazione automatica.", plan: "Piano e utilizzo", planText: "Abbonamento, spazio e limiti dell’account.", privacy: "Privacy e dati", privacyText: "Esporta i dati e gestisci l’eliminazione dell’account.", trash: "Cestino", trashText: "Ripristina eventi e foto prima dell’eliminazione definitiva.", language: "Lingua dell’app", languageText: "La scelta viene salvata su questo dispositivo.", open: "Apri" },
  }[locale];
  const icons = {
    profile: '<path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/>',
    security: '<path d="M12 3 5 6v5c0 4.7 2.8 8.1 7 10 4.2-1.9 7-5.3 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
    backups: '<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.3 8.1 5 5 0 0 0 7 18Z"/><path d="m9 13 3-3 3 3M12 10v7"/>',
    plan: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h3"/>',
    privacy: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
    trash: '<path d="M4 7h16M9 3h6l1 4H8l1-4ZM7 7l1 14h8l1-14M10 11v6M14 11v6"/>',
  } as const;
  const settingsCard = (href: string, icon: keyof typeof icons, title: string, description: string) => `<a href="${href}" class="group flex min-h-40 cursor-pointer flex-col rounded-3xl border border-[#dde7e2] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#bfd5cc] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#397765] sm:p-6"><span class="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e9f2ee] text-[#2b6253]"><svg aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[icon]}</svg></span><h2 class="mt-5 text-xl font-semibold text-[#183c33]">${esc(title)}</h2><p class="mt-2 flex-1 text-sm leading-6 text-[#697a74]">${esc(description)}</p><span class="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#2b6253]">${esc(copy.open)} <span aria-hidden="true" class="transition group-hover:translate-x-1">→</span></span></a>`;
  const languageOption = (value: Locale) => `<button name="locale" value="${value}" class="flex w-full items-center justify-between gap-4 rounded-2xl border ${locale === value ? "border-[#397765] bg-[#f1f6f3]" : "border-[#dce6e1] bg-white"} p-5 text-left hover:border-[#8cb7a6]"><span><strong class="block text-lg text-[#183c33]">${localeNames[value]}</strong><span class="mt-1 block text-sm uppercase tracking-[.12em] text-[#697a74]">${value}</span></span><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${locale === value ? "border-[#397765] bg-[#397765] text-white" : "border-[#cadad3] text-transparent"}">✓</span></button>`;
  return c.html(page(copy.title, `${accountHeader(locale, user)}<main class="mx-auto max-w-5xl p-5 pb-14 md:p-10"><div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p class="page-kicker">${esc(copy.eyebrow)}</p><h1 class="page-title mt-2">${esc(copy.title)}</h1><p class="page-subtitle mt-3 max-w-2xl">${esc(copy.intro)}</p></div><div class="flex min-w-0 items-center gap-3 rounded-2xl border border-[#dde7e2] bg-white px-4 py-3 shadow-sm"><span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#304c43] font-semibold text-white">${esc((user.name.trim().slice(0, 1) || "M").toUpperCase())}</span><span class="min-w-0"><strong class="block max-w-52 truncate text-sm text-[#183c33]">${esc(user.name)}</strong><span class="block max-w-52 truncate text-xs text-[#697a74]">${esc(user.email)}</span></span></div></div><section aria-label="${esc(copy.title)}" class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">${settingsCard(`/${locale}/profile`, "profile", copy.profile, copy.profileText)}${settingsCard(`/${locale}/security`, "security", copy.security, copy.securityText)}${settingsCard(`/${locale}/backups`, "backups", copy.backups, copy.backupsText)}${settingsCard(`/${locale}/plan`, "plan", copy.plan, copy.planText)}${settingsCard(`/${locale}/privacy`, "privacy", copy.privacy, copy.privacyText)}${settingsCard(`/${locale}/trash`, "trash", copy.trash, copy.trashText)}</section><section class="mt-6 rounded-3xl border border-[#dde7e2] bg-white p-6 shadow-sm sm:p-8"><div class="flex items-center gap-4"><span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e9f2ee] text-xl text-[#2b6253]">文</span><div><h2 class="text-2xl">${esc(copy.language)}</h2><p class="mt-1 text-sm text-[#697a74]">${esc(copy.languageText)}</p></div></div><form action="/api/account/settings/language" method="post" class="mt-6 grid gap-3 sm:grid-cols-2">${supportedLocales.map(languageOption).join("")}</form></section></main>${logoutScript(locale)}`));
});

accountRoutes.post("/api/account/settings/language", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? "en"));
  setCookie(c, "memboux_locale", locale, {
    path: "/",
    secure: true,
    sameSite: "Lax",
    maxAge: 365 * 24 * 60 * 60,
  });
  return c.redirect(`/${locale}/settings`, 303);
});

accountRoutes.get("/:locale{el|en|fr|de|es|it}/profile-legacy", async(c)=>{
  const locale=normalizeLocale(c.req.param("locale"));const user=await currentUser(c);if(!user)return c.redirect(`/${locale}/login`);
  return c.html(page(locale==="el"?"Προφίλ":"Profile",`${accountHeader(locale,user)}<main class="mx-auto max-w-4xl p-5 md:p-10"><a href="/${locale}/account" class="text-sm text-[#2f6b5b]">← ${locale==="el"?"Τα events μου":"My events"}</a><div class="mt-5 grid gap-6 md:grid-cols-[220px_1fr]"><aside class="rounded-3xl bg-[#183c33] p-6 text-white"><div class="flex h-20 w-20 items-center justify-center rounded-full bg-white/15 text-3xl">${esc(user.name.slice(0,1).toUpperCase())}</div><h1 class="mt-4 text-3xl">${locale==="el"?"Προφίλ":"Profile"}</h1><p class="mt-1 break-all text-sm text-white/65">${esc(user.email)}</p></aside><section class="rounded-3xl bg-white p-6 shadow"><h2 class="text-3xl">${locale==="el"?"Προσωπικά στοιχεία":"Personal details"}</h2><p class="mt-1 text-sm text-[#65756f]">${locale==="el"?"Τα στοιχεία που εμφανίζονται στον λογαριασμό σου.":"The details displayed on your account."}</p><form id="profile-form" class="mt-6 space-y-4"><label class="block text-sm font-medium">${locale==="el"?"Ονοματεπώνυμο":"Full name"}<input name="name" required maxlength="100" value="${esc(user.name)}" class="mt-1 w-full rounded-xl border px-4 py-3"></label><label class="block text-sm font-medium">Email<input value="${esc(user.email)}" disabled class="mt-1 w-full rounded-xl border bg-[#f1f6f3] px-4 py-3 text-[#65756f]"></label><p id="profile-message" class="hidden rounded-xl p-3 text-sm"></p><button class="rounded-xl bg-[#2f6b5b] px-6 py-3 text-white">${locale==="el"?"Αποθήκευση αλλαγών":"Save changes"}</button></form></section></div></main><script>document.getElementById('profile-form').onsubmit=async e=>{e.preventDefault();const message=document.getElementById('profile-message');const name=new FormData(e.target).get('name');const response=await fetch('/api/auth/update-user',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});message.classList.remove('hidden');if(response.ok){message.className='rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700';message.textContent=${JSON.stringify(locale==="el"?"Το προφίλ ενημερώθηκε.":"Profile updated.")};setTimeout(()=>location.reload(),700)}else{const data=await response.json().catch(()=>({}));message.className='rounded-xl bg-red-50 p-3 text-sm text-red-700';message.textContent=data.message||${JSON.stringify(locale==="el"?"Η ενημέρωση απέτυχε.":"Update failed.")}}}<\/script>${logoutScript(locale)}`));
});

accountRoutes.get("/:locale{el|en|fr|de|es|it}/profile", async (c) => {
  const locale = normalizeLocale(c.req.param("locale"));
  const user = await currentUser(c);
  if (!user) return c.redirect(`/${locale}/login`);
  const el = locale === "el";
  const [professional, subscription] = await Promise.all([
    c.env.DB.prepare("SELECT business_name,bio,website,status FROM professional_profiles WHERE user_id=?")
      .bind(user.id)
      .first<{ business_name: string; bio: string; website: string | null; status: "active" | "suspended" }>(),
    c.env.DB.prepare("SELECT plan_key,status,billing_interval,current_period_end FROM account_subscriptions WHERE user_id=?")
      .bind(user.id)
      .first<{ plan_key: string; status: string; billing_interval: string; current_period_end: number | null }>(),
  ]);
  const isProfessional = professional?.status === "active";
  const planLabel = subscription
    ? `${subscription.plan_key} · ${subscription.status}${subscription.billing_interval !== "none" ? ` · ${subscription.billing_interval}` : ""}`
    : (el ? "Professional Beta · χωρίς χρέωση" : "Professional Beta · free during beta");
  return c.html(page(el ? "Προφίλ" : "Profile", `${accountHeader(locale, user)}<main class="mx-auto max-w-5xl p-5 md:p-10"><div><p class="page-kicker">Identity &amp; work</p><h1 class="page-title mt-2">${el ? "Το προφίλ σου" : "Your profile"}</h1><p class="page-subtitle mt-3">${el ? "Διαχειρίσου τα προσωπικά στοιχεία και την επαγγελματική σου παρουσία." : "Manage your personal details and professional presence."}</p></div><div class="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"><div class="space-y-6"><section class="rounded-[1.75rem] border border-[#dee7e3] bg-white p-6 shadow-sm"><div class="flex items-center gap-4"><span class="flex h-14 w-14 items-center justify-center rounded-full bg-[#183c33] text-xl font-semibold text-white">${esc(user.name.slice(0, 1).toUpperCase())}</span><div><h2 class="text-2xl">${el ? "Προσωπικά στοιχεία" : "Personal details"}</h2><p class="text-sm text-[#65756f]">${esc(user.email)}</p></div></div><form id="profile-form" class="mt-6 space-y-4"><label class="block text-sm font-semibold text-[#344941]">${el ? "Ονοματεπώνυμο" : "Full name"}<input name="name" required maxlength="100" value="${esc(user.name)}" class="mt-2 w-full rounded-xl border px-4 py-3 font-normal"></label><p id="profile-message" class="hidden rounded-xl p-3 text-sm"></p><button class="rounded-xl bg-[#183c33] px-6 py-3 font-semibold text-white">${el ? "Αποθήκευση" : "Save details"}</button></form></section><section class="rounded-[1.75rem] border border-[#d5e6df] bg-white p-6 shadow-sm"><div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p class="text-xs font-bold uppercase tracking-[.18em] text-[#2f6b5b]">Memboux Professional</p><h2 class="mt-2 text-3xl">${el ? "Επαγγελματικό προφίλ" : "Professional profile"}</h2><p class="mt-2 max-w-xl text-sm leading-6 text-[#65756f]">${el ? "Για φωτογράφους και δημιουργούς που διαχειρίζονται official albums μέσω του Studio." : "For photographers and creators who manage official albums through Studio."}</p></div><span class="inline-flex h-fit rounded-full ${isProfessional ? "bg-emerald-50 text-emerald-800" : "bg-[#f1f5f3] text-[#65756f]"} px-3 py-1.5 text-xs font-bold">${isProfessional ? (el ? "Ενεργό" : "Active") : (el ? "Ανενεργό" : "Inactive")}</span></div><form action="/api/account/profile/professional" method="post" class="mt-6 space-y-4"><input type="hidden" name="locale" value="${locale}"><label class="flex items-start gap-3 rounded-2xl bg-[#f5f9f7] p-4"><input id="professional-enabled" name="enabled" value="true" type="checkbox" ${isProfessional ? "checked" : ""} class="mt-1 h-5 w-5"><span><strong class="block text-[#183c33]">${el ? "Είμαι Professional" : "I am a Professional"}</strong><span class="mt-1 block text-sm text-[#65756f]">${el ? "Ενεργοποιεί το Studio profile και professional invitations." : "Enables your Studio profile and professional invitations."}</span></span></label><div id="professional-fields" class="grid gap-4"><label class="text-sm font-semibold text-[#344941]">${el ? "Επωνυμία / επαγγελματικό όνομα" : "Business or professional name"}<input name="businessName" maxlength="100" value="${esc(professional?.business_name ?? user.name)}" class="mt-2 w-full rounded-xl border px-4 py-3 font-normal"></label><label class="text-sm font-semibold text-[#344941]">Website<input name="website" type="url" maxlength="300" value="${esc(professional?.website ?? "")}" placeholder="https://" class="mt-2 w-full rounded-xl border px-4 py-3 font-normal"></label><label class="text-sm font-semibold text-[#344941]">Bio<textarea name="bio" maxlength="1000" rows="4" class="mt-2 w-full rounded-xl border px-4 py-3 font-normal">${esc(professional?.bio ?? "")}</textarea></label></div><button class="rounded-xl bg-[#2f6b5b] px-6 py-3 font-semibold text-white">${el ? "Αποθήκευση Professional profile" : "Save Professional profile"}</button></form></section></div><aside class="h-fit rounded-[1.75rem] bg-[#183c33] p-6 text-white shadow-xl"><p class="text-xs font-bold uppercase tracking-[.18em] text-[#a9c9bc]">Professional plan</p><h2 class="mt-3 text-2xl">${esc(planLabel)}</h2><p class="mt-4 text-sm leading-6 text-white/65">${el ? "Η μηνιαία συνδρομή δεν χρεώνεται ακόμη. Η υποδομή plan και billing είναι έτοιμη και θα ενεργοποιηθεί όταν οριστούν η τιμή και το Stripe." : "Monthly billing is not active yet. Plan and billing infrastructure is ready for pricing and Stripe activation."}</p><ul class="mt-6 space-y-3 text-sm text-white/80"><li>✓ Studio workspace</li><li>✓ Official albums</li><li>✓ Professional invitations</li><li>✓ Cloud backup support</li></ul></aside></div></main><script>document.getElementById('profile-form').onsubmit=async event=>{event.preventDefault();const message=document.getElementById('profile-message'),name=new FormData(event.target).get('name'),response=await fetch('/api/auth/update-user',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});message.classList.remove('hidden');message.className=response.ok?'rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700':'rounded-xl bg-red-50 p-3 text-sm text-red-700';message.textContent=response.ok?${JSON.stringify(el ? "Το προφίλ ενημερώθηκε." : "Profile updated.")}:${JSON.stringify(el ? "Η ενημέρωση απέτυχε." : "Update failed.")};if(response.ok)setTimeout(()=>location.reload(),600)}</script>${logoutScript(locale)}`));
});

accountRoutes.post("/api/account/profile/professional", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? "en"));
  const enabled = body.enabled === "true";
  const existing = await c.env.DB.prepare("SELECT slug FROM professional_profiles WHERE user_id=?")
    .bind(user.id)
    .first<{ slug: string }>();
  if (!enabled) {
    if (existing) await c.env.DB.prepare("UPDATE professional_profiles SET status='suspended',updated_at=? WHERE user_id=?").bind(Date.now(), user.id).run();
    return c.redirect(`/${locale}/profile`, 303);
  }
  const businessName = String(body.businessName ?? "").trim().slice(0, 100);
  const bio = String(body.bio ?? "").trim().slice(0, 1000);
  const websiteInput = String(body.website ?? "").trim().slice(0, 300);
  if (!businessName) return c.text(locale === "el" ? "Συμπλήρωσε επαγγελματικό όνομα." : "Enter a professional name.", 400);
  let website: string | null = null;
  if (websiteInput) {
    try {
      const parsed = new URL(websiteInput);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error("protocol");
      website = parsed.toString();
    } catch {
      return c.text(locale === "el" ? "Έλεγξε το website URL." : "Check the website URL.", 400);
    }
  }
  const now = Date.now();
  const base = businessName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "professional";
  const slug = existing?.slug ?? `${base}-${user.id.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase()}`;
  await c.env.DB.prepare(`INSERT INTO professional_profiles
    (user_id,business_name,slug,bio,website,status,created_at,updated_at)
    VALUES (?,?,?,?,?,'active',?,?)
    ON CONFLICT(user_id) DO UPDATE SET business_name=excluded.business_name,bio=excluded.bio,
      website=excluded.website,status='active',updated_at=excluded.updated_at`)
    .bind(user.id, businessName, slug, bio, website, now, now)
    .run();
  return c.redirect(`/${locale}/profile`, 303);
});

accountRoutes.get("/:locale{el|en|fr|de|es|it}/security", async(c)=>{
  const locale=normalizeLocale(c.req.param("locale"));const user=await currentUser(c);if(!user)return c.redirect(`/${locale}/login`);
  const credential=await c.env.DB.prepare("SELECT 1 FROM account WHERE userId=? AND providerId='credential'").bind(user.id).first();
  const sessions=await c.env.DB.prepare("SELECT COUNT(*) total FROM session WHERE userId=? AND expiresAt>?").bind(user.id,Date.now()).first<{total:number}>();
  return c.html(page(locale==="el"?"Ασφάλεια":"Security",`${accountHeader(locale,user)}<main class="mx-auto max-w-4xl p-5 md:p-10"><a href="/${locale}/account" class="text-sm text-[#2f6b5b]">← ${locale==="el"?"Τα events μου":"My events"}</a><div class="mt-5 grid gap-6"><section class="rounded-3xl bg-white p-6 shadow"><div class="flex items-start justify-between gap-4"><div><p class="text-xs uppercase tracking-[.2em] text-[#255848]">Security</p><h1 class="text-4xl">${locale==="el"?"Κωδικός πρόσβασης":"Password"}</h1></div><span class="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700">${locale==="el"?"Προστατευμένος λογαριασμός":"Protected account"}</span></div>${credential?`<form id="password-form" class="mt-6 grid gap-4"><input name="currentPassword" type="password" required autocomplete="current-password" placeholder="${locale==="el"?"Τρέχων κωδικός":"Current password"}" class="rounded-xl border px-4 py-3"><input name="newPassword" type="password" required minlength="10" autocomplete="new-password" placeholder="${locale==="el"?"Νέος κωδικός (τουλάχιστον 10 χαρακτήρες)":"New password (at least 10 characters)"}" class="rounded-xl border px-4 py-3"><label class="flex items-center gap-3 text-sm"><input name="revokeOtherSessions" type="checkbox" checked class="h-4 w-4">${locale==="el"?"Αποσύνδεση από τις άλλες συσκευές":"Sign out other devices"}</label><p id="password-message" class="hidden rounded-xl p-3 text-sm"></p><button class="rounded-xl bg-[#2f6b5b] px-6 py-3 text-white">${locale==="el"?"Αλλαγή κωδικού":"Change password"}</button></form>`:`<div class="mt-6 rounded-2xl bg-[#f1f6f3] p-5"><p>${locale==="el"?"Ο λογαριασμός σου χρησιμοποιεί σύνδεση Google. Μπορείς να δημιουργήσεις κωδικό μέσω της επαναφοράς κωδικού.":"Your account uses Google sign-in. You can create a password through password reset."}</p><a href="/${locale}/forgot-password" class="mt-3 inline-block font-medium text-[#2f6b5b]">${locale==="el"?"Δημιουργία κωδικού":"Create password"}</a></div>`}</section><section class="rounded-3xl bg-white p-6 shadow"><h2 class="text-3xl">${locale==="el"?"Ενεργές συνδέσεις":"Active sessions"}</h2><p class="mt-2 text-[#65756f]">${sessions?.total??1} ${locale==="el"?"ενεργές συνδέσεις στον λογαριασμό.":"active account sessions."}</p><button id="revoke-sessions" class="mt-4 rounded-xl border px-5 py-3">${locale==="el"?"Αποσύνδεση άλλων συσκευών":"Sign out other devices"}</button><p id="session-message" class="mt-3 hidden text-sm text-emerald-700"></p></section></div></main><script>${credential?`document.getElementById('password-form').onsubmit=async e=>{e.preventDefault();const form=new FormData(e.target);const response=await fetch('/api/auth/change-password',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword:form.get('currentPassword'),newPassword:form.get('newPassword'),revokeOtherSessions:form.get('revokeOtherSessions')==='on'})});const message=document.getElementById('password-message');message.classList.remove('hidden');message.className=response.ok?'rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700':'rounded-xl bg-red-50 p-3 text-sm text-red-700';message.textContent=response.ok?${JSON.stringify(locale==="el"?"Ο κωδικός άλλαξε επιτυχώς.":"Password changed successfully.")}:${JSON.stringify(locale==="el"?"Έλεγξε τον τρέχοντα κωδικό και δοκίμασε ξανά.":"Check your current password and try again.")}};`:""}document.getElementById('revoke-sessions').onclick=async()=>{const response=await fetch('/api/account/security/revoke-other-sessions',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:'{}'});if(response.ok){const message=document.getElementById('session-message');message.textContent=${JSON.stringify(locale==="el"?"Οι άλλες συνδέσεις τερματίστηκαν.":"Other sessions signed out.")};message.classList.remove('hidden')}}<\/script>${logoutScript(locale)}`));
});

accountRoutes.post("/api/account/security/revoke-other-sessions", async (c) => {
  const session = await currentSession(c);
  if (!session) return c.json({ message: "Unauthorized" }, 401);
  const result = await c.env.DB.prepare("DELETE FROM session WHERE userId=? AND id<>?").bind(session.user.id, session.session.id).run();
  return c.json({ status: true, revoked: result.meta.changes });
});

accountRoutes.get("/api/account/export", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ message: "Unauthorized" }, 401);
  const data = await buildAccountExport(c.env.DB, user.id);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), { headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="memboux-account-export-${date}.json"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  }});
});

accountRoutes.get("/api/account/deletion-eligibility", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ message: "Unauthorized" }, 401);
  const activeOwnedEvents = await countActiveOwnedEvents(c.env.DB, user.id);
  return c.json({ eligible: activeOwnedEvents === 0, activeOwnedEvents });
});

accountRoutes.get("/:locale{el|en|fr|de|es|it}/privacy", async (c) => {
  const locale = normalizeLocale(c.req.param("locale"));
  const user = await currentUser(c);
  if (!user) return c.redirect(`/${locale}/login`);
  const el = locale === "el";
  return c.html(page(el ? "Απόρρητο & δεδομένα" : "Privacy & data", `${accountHeader(locale,user)}<main class="mx-auto max-w-4xl p-5 md:p-10"><p class="text-xs uppercase tracking-[.2em] text-[#255848]">Privacy center</p><h1 class="mt-2 text-4xl">${el ? "Τα δεδομένα σου" : "Your data"}</h1><p class="mt-3 max-w-2xl text-[#65756f]">${el ? "Κατέβασε αντίγραφο των στοιχείων σου ή ξεκίνησε επαληθευμένη διαγραφή." : "Download a copy of your information or start verified deletion."}</p><div class="mt-7 grid gap-5"><section class="rounded-3xl bg-white p-6 shadow"><h2 class="text-2xl">${el ? "Εξαγωγή δεδομένων" : "Data export"}</h2><p class="mt-2 text-sm text-[#65756f]">${el ? "Περιλαμβάνει προφίλ, συνδέσεις, παρόχους login χωρίς μυστικά, event memberships και προσκλήσεις." : "Includes your profile, sessions, sign-in providers without secrets, event memberships and invitations."}</p><a href="/api/account/export" class="mt-4 inline-block rounded-xl bg-[#2f6b5b] px-5 py-3 text-white">${el ? "Λήψη JSON" : "Download JSON"}</a></section><section class="rounded-3xl border border-red-200 bg-white p-6 shadow"><h2 class="text-2xl text-red-800">${el ? "Διαγραφή λογαριασμού" : "Delete account"}</h2><p class="mt-2 text-sm text-[#65756f]">${el ? "Η διαγραφή είναι οριστική και ολοκληρώνεται από σύνδεσμο email. Πρώτα πρέπει να διαγράψεις ή να μεταβιβάσεις τα ενεργά events που σου ανήκουν." : "Deletion is permanent and completes through an email link. First delete or transfer every active event you own."}</p><button id="delete-account" class="mt-4 rounded-xl border border-red-300 px-5 py-3 text-red-800">${el ? "Αίτημα διαγραφής" : "Request deletion"}</button><p id="delete-message" class="mt-3 hidden rounded-xl p-3 text-sm"></p></section></div></main><script>document.getElementById('delete-account').onclick=async()=>{const button=document.getElementById('delete-account'),message=document.getElementById('delete-message');button.disabled=true;message.classList.remove('hidden');const check=await fetch('/api/account/deletion-eligibility',{credentials:'include'});const eligibility=await check.json().catch(()=>({}));if(!check.ok){message.className='mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700';message.textContent=${JSON.stringify(el ? "Δεν ήταν δυνατός ο έλεγχος." : "Could not check eligibility.")};button.disabled=false;return}if(!eligibility.eligible){message.className='mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800';message.textContent=${JSON.stringify(el ? "Ενεργά events που σου ανήκουν: " : "Active events you own: ")}+eligibility.activeOwnedEvents;button.disabled=false;return}if(!confirm(${JSON.stringify(el ? "Να σταλεί email επιβεβαίωσης;" : "Send the confirmation email?")})){button.disabled=false;return}const response=await fetch('/api/auth/delete-user',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({callbackURL:'/${locale}'})});const data=await response.json().catch(()=>({}));message.className=response.ok?'mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700':'mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700';message.textContent=response.ok?${JSON.stringify(el ? "Στάλθηκε email επιβεβαίωσης." : "Confirmation email sent.")}:(data.message||${JSON.stringify(el ? "Το αίτημα απέτυχε." : "Request failed.")});button.disabled=false}</script>${logoutScript(locale)}`));
});

accountRoutes.get("/:locale{el|en|fr|de|es|it}/plan", async (c) => {
  const locale=normalizeLocale(c.req.param("locale"));const user=await currentUser(c);if(!user)return c.redirect(`/${locale}/login`);
  const entitlement=await getUserEntitlement(c.env.DB,user.id);const eventCount=await c.env.DB.prepare("SELECT COUNT(*) total FROM event_members em JOIN events e ON e.id=em.event_id WHERE em.user_id=? AND em.role='owner' AND e.deleted_at IS NULL").bind(user.id).first<{total:number}>();
  const storagePercent=Math.min(100,Math.round(entitlement.usedBytes/entitlement.storageLimitBytes*100));const el=locale==="el";
  return c.html(page(el?"Plan & χρήση":"Plan & usage",`${accountHeader(locale,user)}<main class="mx-auto max-w-4xl p-5 md:p-10"><p class="text-xs uppercase tracking-[.2em] text-[#255848]">Account capacity</p><h1 class="mt-2 text-4xl">${el?"Plan και χρήση":"Plan and usage"}</h1><section class="mt-7 rounded-3xl bg-white p-6 shadow"><div class="flex items-center justify-between"><div><p class="text-sm text-[#65756f]">${el?"Τρέχον plan":"Current plan"}</p><h2 class="text-3xl capitalize">${esc(entitlement.planKey)}</h2></div><span class="rounded-full bg-[#e8f3ee] px-4 py-2 text-sm">Beta</span></div><div class="mt-7 grid gap-5 md:grid-cols-2"><div class="rounded-2xl bg-[#f6faf8] p-5"><p class="text-sm text-[#65756f]">Storage</p><p class="mt-1 text-2xl">${formatBytes(entitlement.usedBytes)} / ${formatBytes(entitlement.storageLimitBytes)}</p><div class="mt-3 h-2 overflow-hidden rounded-full bg-white"><div class="h-full bg-[#356f5e]" style="width:${storagePercent}%"></div></div><p class="mt-2 text-xs text-[#65756f]">${el?"Ο κάδος μετρά μέχρι την οριστική διαγραφή.":"Trash counts until permanent deletion."}</p></div><div class="rounded-2xl bg-[#f6faf8] p-5"><p class="text-sm text-[#65756f]">Events</p><p class="mt-1 text-2xl">${eventCount?.total??0} / ${entitlement.eventLimit}</p><p class="mt-2 text-xs text-[#65756f]">${el?`Έως ${entitlement.memberLimit} συνεργάτες ανά event.`:`Up to ${entitlement.memberLimit} collaborators per event.`}</p></div></div><p class="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">${el?"Το Beta plan είναι προσωρινό και χωρίς χρέωση. Οι εμπορικές τιμές δεν έχουν ενεργοποιηθεί.":"The Beta plan is temporary and free of charge. Commercial pricing is not active."}</p></section></main>${logoutScript(locale)}`));
});

accountRoutes.get("/:locale{el|en|fr|de|es|it}/account", async (c) => {
  const locale = normalizeLocale(c.req.param("locale"));
  const m = t(locale);
  const user = await currentUser(c);
  if (!user) return c.redirect(`/${locale}/login`);
  const now = Date.now();
  const [pendingInvitations, unreadNotifications, professionalProfile] = await Promise.all([
    listPendingInvitations(c.env.DB, user, now),
    c.env.DB.prepare("SELECT COUNT(*) total FROM account_notifications WHERE user_id=? AND read_at IS NULL")
      .bind(user.id)
      .first<{ total: number }>(),
    c.env.DB.prepare("SELECT user_id FROM professional_profiles WHERE user_id=? AND status='active'")
      .bind(user.id)
      .first<{ user_id: string }>(),
  ]);
  const notificationCount = pendingInvitations.length + Number(unreadNotifications?.total ?? 0);
  const filter = ["all", "owner", "shared", "professional", "upcoming", "past"].includes(
    c.req.query("filter") ?? "",
  )
    ? c.req.query("filter")! as AccountEventFilter
    : "all" as AccountEventFilter;
  const sort = [
    "date_asc",
    "date_desc",
    "name_asc",
    "name_desc",
    "created_desc",
  ].includes(c.req.query("sort") ?? "")
    ? c.req.query("sort")!
    : "date_desc";
  let where = "em.user_id=? AND e.deleted_at IS NULL";
  const bindings: unknown[] = [user.id];
  if (filter === "owner") where += " AND em.role='owner'";
  if (filter === "shared") where += " AND em.role!='owner'";
  if (filter === "professional") where += " AND 0";
  let professionalWhere = "a.professional_user_id=? AND a.status IN ('invited','accepted') AND e.deleted_at IS NULL";
  const professionalBindings: unknown[] = [user.id];
  if (filter === "owner" || filter === "shared") professionalWhere += " AND 0";
  const today = new Date().toISOString().slice(0, 10);
  if (filter === "upcoming") {
    where += " AND COALESCE(e.event_end_date,e.event_start_date)>=?";
    bindings.push(today);
    professionalWhere += " AND COALESCE(e.event_end_date,e.event_start_date)>=?";
    professionalBindings.push(today);
  }
  if (filter === "past") {
    where += " AND COALESCE(e.event_end_date,e.event_start_date)<?";
    bindings.push(today);
    professionalWhere += " AND COALESCE(e.event_end_date,e.event_start_date)<?";
    professionalBindings.push(today);
  }
  const order =
    sort === "date_asc"
      ? "COALESCE(e.event_start_date,'9999') ASC"
      : sort === "name_asc"
        ? "e.eventName COLLATE NOCASE ASC"
        : sort === "name_desc"
          ? "e.eventName COLLATE NOCASE DESC"
          : sort === "created_desc"
            ? "e.created_at DESC"
            : "COALESCE(e.event_start_date,'0000') DESC";
  type DashboardEvent = EventRow & {
    role: string;
    image_count: number;
    cover_object_key: string | null;
    cover_updated_at: number | null;
    assignment_status?: "invited" | "accepted";
  };
  const [events, professionalEvents] = await Promise.all([
    c.env.DB.prepare(
      `SELECT e.*,em.role,
        SUM(CASE WHEN md.media_type='image' THEN 1 ELSE 0 END) image_count,
        ec.object_key cover_object_key,ec.updated_at cover_updated_at
      FROM event_members em JOIN events e ON e.id=em.event_id
      LEFT JOIN media md ON md.event_id=e.id AND md.deleted_at IS NULL AND md.reported_at IS NULL
      LEFT JOIN event_covers ec ON ec.event_id=e.id
      WHERE ${where} GROUP BY e.id,em.role ORDER BY ${order}`,
    )
      .bind(...bindings)
      .all<DashboardEvent>(),
    professionalProfile
      ? c.env.DB.prepare(
          `SELECT e.*,'professional' role,a.status assignment_status,
            SUM(CASE WHEN md.media_type='image' THEN 1 ELSE 0 END) image_count,
            ec.object_key cover_object_key,ec.updated_at cover_updated_at
          FROM event_professional_assignments a
          JOIN events e ON e.id=a.event_id
          LEFT JOIN media md ON md.event_id=e.id AND md.deleted_at IS NULL AND md.reported_at IS NULL
          LEFT JOIN event_covers ec ON ec.event_id=e.id
          WHERE ${professionalWhere}
          GROUP BY e.id,a.status ORDER BY ${order}`,
        )
          .bind(...professionalBindings)
          .all<DashboardEvent>()
      : Promise.resolve({ results: [] as DashboardEvent[] }),
  ]);
  const renderEventCard = (event: DashboardEvent) => {
    const professional = event.role === "professional";
    const assignmentStatus = event.assignment_status ?? "accepted";
    const cover = professional && assignmentStatus !== "accepted" ? null : selectedEventCoverUrl(event);
    const href = professional
      ? professionalAssignmentHref(event.code, assignmentStatus, locale)
      : `/dashboard/${event.code}?lang=${locale}`;
    const previewHref = eventAlbumPreviewHref(event.code, professional, locale);
    const roleLabel = professional
      ? assignmentStatus === "accepted"
        ? (locale === "el" ? "Επίσημος φωτογράφος" : "Official photographer")
        : (locale === "el" ? "Αναμονή αποδοχής" : "Awaiting acceptance")
      : event.role === "owner" ? (locale === "el" ? "Ιδιοκτήτης" : "Owner") : event.role === "viewer" ? (locale === "el" ? "Θεατής" : "Viewer") : locale === "el" ? "Διαχειριστής" : "Manager";
    const ownerActions = event.role === "owner" ? `<div class="absolute right-3 top-3 z-20 flex items-start gap-2">${renderEventPinControl(event, locale)}<details class="relative"><summary class="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border border-white/20 bg-black/35 text-2xl text-white shadow-sm backdrop-blur-md hover:bg-black/50" aria-label="Event actions">⋯</summary><div class="absolute right-0 mt-2 w-44 rounded-2xl border bg-white p-2 text-[#183c33] shadow-xl"><a href="/dashboard/${event.code}?lang=${locale}#settings" class="block rounded-xl px-3 py-2 text-sm hover:bg-[#f1f6f3]">${locale === "el" ? "Επεξεργασία" : "Edit"}</a><form action="/api/account/events/${event.code}/trash" method="post" onsubmit="return confirm('${locale === "el" ? "Μεταφορά του event στον κάδο;" : "Move this event to trash?"}')"><input type="hidden" name="locale" value="${locale}"><button class="w-full rounded-xl px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50">${locale === "el" ? "Διαγραφή" : "Delete"}</button></form></div></details></div>` : "";
    const location = event.location ? `<p class="mt-2 flex items-center gap-1.5 truncate text-sm text-[#697a74]"><svg aria-hidden="true" viewBox="0 0 24 24" class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg><span class="truncate">${esc(event.location)}</span></p>` : "";
    return `<article class="group relative overflow-hidden rounded-[1.75rem] border border-[#dee7e3] bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl"><div class="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-[#24483d] via-[#2f6b5b] to-[#85ad9e]"><a href="${href}" aria-label="${locale === "el" ? "Άνοιγμα event" : "Open event"}: ${esc(event.eventName)}" class="absolute inset-0">${cover ? `<img src="${cover}" alt="" loading="lazy" class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]">` : `<div class="absolute inset-0 flex items-center justify-center text-6xl text-white/40">✦</div>`}<div class="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/10"></div><span class="absolute bottom-4 left-4 rounded-full border border-white/20 bg-black/35 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md">${roleLabel}</span>${cover ? `<span class="absolute bottom-4 right-4 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#255848]">Cover</span>` : ""}</a><a href="${previewHref}" target="_blank" rel="noopener" class="absolute left-1/2 top-1/2 z-10 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-white/35 bg-black/30 px-4 py-2.5 text-sm font-semibold text-white opacity-0 shadow-lg backdrop-blur-md transition hover:bg-black/45 focus-visible:opacity-100 group-hover:opacity-100"><svg aria-hidden="true" viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>${locale === "el" ? "Preview album" : "Preview album"}</a></div><a href="${href}" class="block p-5"><h2 class="truncate text-2xl text-[#183c33]">${esc(event.eventName)}</h2><p class="mt-2 text-sm font-semibold text-[#2f6b5b]">${esc(formatEventDates(event, locale))}</p>${location}<div class="mt-4 flex items-center gap-4 border-t border-[#edf3f0] pt-4 text-xs font-medium text-[#65756f]"><span>${event.image_count} ${locale === "el" ? "εικόνες" : "images"}</span></div></a>${ownerActions}</article>`;
  };
  const createEventTile = renderCreateEventTile(m.createEvent, locale);
  const ownedCards = createEventTile + events.results
    .filter((event) => event.role === "owner")
    .map(renderEventCard)
    .join("");
  const sharedCards = events.results
    .filter((event) => event.role !== "owner")
    .map(renderEventCard)
    .join("");
  const professionalCards = professionalEvents.results.map(renderEventCard).join("");
  const section = (
    id: string,
    title: string,
    subtitle: string,
    content: string,
    empty: string,
  ) => renderDashboardSection(id, title, subtitle, content, empty);
  const invitationCards = pendingInvitations
    .map(
      (invitation) =>
        `<article class="rounded-2xl border border-[#c8ddd5] bg-white p-5 shadow-sm"><div class="flex items-start justify-between gap-4"><div class="min-w-0"><p class="text-xs uppercase tracking-[.16em] text-[#2f6b5b]">${locale === "el" ? "Πρόσκληση album" : "Album invitation"}</p><h3 class="mt-2 truncate text-2xl">${esc(invitation.event_name)}</h3><p class="mt-2 text-sm text-[#65756f]">${locale === "el" ? `${esc(invitation.inviter_name)} σε προσκάλεσε` : `Invited by ${esc(invitation.inviter_name)}`} · ${invitation.role === "viewer" ? (locale === "el" ? "Θεατής" : "Viewer") : locale === "el" ? "Διαχειριστής" : "Manager"}</p></div><span class="rounded-full bg-[#e8f3ee] px-3 py-1 text-xs text-[#255848]">${locale === "el" ? "Νέα" : "New"}</span></div><div class="mt-5 flex flex-col gap-2 sm:flex-row"><form action="/api/account/invitations/${encodeURIComponent(invitation.id)}/accept" method="post" class="flex-1"><input type="hidden" name="locale" value="${locale}"><button class="w-full rounded-xl bg-[#2f6b5b] px-5 py-3 text-sm font-semibold text-white">${locale === "el" ? "Αποδοχή" : "Accept"}</button></form><form action="/api/account/invitations/${encodeURIComponent(invitation.id)}/decline" method="post"><input type="hidden" name="locale" value="${locale}"><button class="w-full rounded-xl border px-5 py-3 text-sm font-semibold text-[#4a6159]">${locale === "el" ? "Απόρριψη" : "Decline"}</button></form></div></article>`,
    )
    .join("");
  const invitationContent = pendingInvitations.length
    ? section(
        "invitations",
        locale === "el" ? "Προσκλήσεις" : "Invitations",
        locale === "el"
          ? "Χρειάζονται την απάντησή σου"
          : "Waiting for your response",
        invitationCards,
        "",
      )
    : `<div id="invitations"></div>`;
  const ownedSection = section(
    "my-events",
    locale === "el" ? "Τα events μου" : "My events",
    locale === "el" ? "Albums που σου ανήκουν" : "Albums you own",
    ownedCards,
    locale === "el"
      ? "Δεν βρέθηκαν δικά σου events."
      : "No owned events found.",
  );
  const showOwnedSection = filter !== "shared" && filter !== "professional";
  const showSharedSection = filter !== "owner" && filter !== "professional";
  const showProfessionalSection = shouldShowProfessionalDashboardSection(Boolean(professionalProfile), filter);
  const professionalSection = showProfessionalSection
    ? section(
        "official-photographer",
        locale === "el" ? "Albums Memboux Studio" : "Memboux Studio albums",
        locale === "el" ? "Events όπου είσαι ο επίσημος φωτογράφος" : "Events where you are the official photographer",
        professionalCards,
        locale === "el" ? "Δεν έχεις ακόμη αναθέσεις ως επίσημος φωτογράφος." : "No official-photographer assignments yet.",
      )
    : "";
  const sharedSection = section(
    "shared-with-me",
    locale === "el" ? "Μοιρασμένα μαζί μου" : "Shared with me",
    locale === "el"
      ? "Πρόσβαση από άλλους owners"
      : "Access granted by other owners",
    sharedCards,
    locale === "el"
      ? "Δεν υπάρχουν κοινόχρηστα albums."
      : "No shared albums yet.",
  );
  const standardEventSections = `${showOwnedSection ? ownedSection : ""}${showSharedSection ? sharedSection : ""}`;
  const dashboardSubmenu = renderDashboardSubmenu(locale, {
    owned: showOwnedSection,
    shared: showSharedSection,
    studio: showProfessionalSection,
  });
  const invitationSection = `${dashboardSubmenu}${invitationContent}`;
  const newEventLocationEnhancement = `<template id="new-event-type-template">${renderNewEventTypeField(locale)}</template><template id="new-event-location-template">${locationPickerMarkup({ id: "new-event-location", locale })}</template><script>document.addEventListener('DOMContentLoaded',()=>{const input=document.querySelector('#new-event input[name="location"]'),locationTemplate=document.getElementById('new-event-location-template'),typeTemplate=document.getElementById('new-event-type-template');if(input&&typeTemplate)input.closest('label')?.before(typeTemplate.content.cloneNode(true));if(input&&locationTemplate)input.replaceWith(locationTemplate.content.cloneNode(true))},{once:true})<\/script>${locationPickerScript(locale)}`;
  const eventSections = `${standardEventSections}${professionalSection}${eventPinDialog(locale)}${newEventLocationEnhancement}`;
  const filterLabel =
    locale === "el"
      ? {
          all: "Όλα",
          owner: "Δικά μου",
          shared: "Κοινόχρηστα",
          professional: "Επίσημος φωτογράφος",
          upcoming: "Επερχόμενα",
          past: "Παλαιότερα",
        }
      : {
          all: "All",
          owner: "Owned",
          shared: "Shared",
          professional: "Official photographer",
          upcoming: "Upcoming",
          past: "Past",
        };
  const searchAction = `<button id="open-event-search" type="button" aria-label="${locale === "el" ? "Αναζήτηση events" : "Search events"}" title="${locale === "el" ? "Αναζήτηση events" : "Search events"}" class="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white hover:bg-white/10"><svg aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg></button><dialog id="event-search" aria-labelledby="event-search-title" class="fixed left-1/2 top-1/2 m-0 max-h-[92dvh] w-[min(94vw,680px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border-0 bg-white p-0 text-[#183c33] shadow-2xl"><div class="border-b border-[#dee7e3] p-5 sm:p-6"><div class="flex items-center justify-between gap-4"><div><p class="text-xs font-bold uppercase tracking-[.18em] text-[#2f6b5b]">Memboux</p><h2 id="event-search-title" class="mt-1 text-2xl">${locale === "el" ? "Αναζήτηση events" : "Search events"}</h2></div><button id="close-event-search" type="button" aria-label="${locale === "el" ? "Κλείσιμο" : "Close"}" class="flex h-10 w-10 items-center justify-center rounded-full border border-[#d6e0dc] text-xl">×</button></div><label class="relative mt-5 block"><svg aria-hidden="true" viewBox="0 0 24 24" class="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#7b8a85]" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input id="event-search-input" type="search" autocomplete="off" placeholder="${locale === "el" ? "Όνομα event…" : "Event name…"}" class="w-full rounded-2xl border border-[#d6e0dc] bg-[#f8faf9] py-3 pl-12 pr-4 text-base"></label></div><div id="event-search-results" role="status" aria-live="polite" class="max-h-[60dvh] overflow-y-auto p-3 sm:p-4"><p class="p-6 text-center text-sm text-[#697a74]">${locale === "el" ? "Άνοιξε την αναζήτηση για να δεις τα πρόσφατα events." : "Open search to see your recent events."}</p></div></dialog><script>(()=>{const dialog=document.getElementById('event-search'),open=document.getElementById('open-event-search'),close=document.getElementById('close-event-search'),input=document.getElementById('event-search-input'),results=document.getElementById('event-search-results'),locale=${JSON.stringify(locale)},labels=${JSON.stringify({ empty: locale === "el" ? "Δεν βρέθηκαν events." : "No events found.", error: locale === "el" ? "Η αναζήτηση δεν είναι διαθέσιμη αυτή τη στιγμή." : "Search is unavailable right now.", owner: locale === "el" ? "Ιδιοκτήτης" : "Owner", viewer: locale === "el" ? "Θεατής" : "Viewer", editor: locale === "el" ? "Διαχειριστής" : "Manager", images: locale === "el" ? "εικόνες" : "images" })};let timer,request=0;const render=events=>{results.replaceChildren();if(!events.length){const empty=document.createElement('p');empty.className='p-8 text-center text-sm text-[#697a74]';empty.textContent=labels.empty;results.append(empty);return}events.forEach(event=>{const link=document.createElement('a');link.href='/dashboard/'+encodeURIComponent(event.code)+'?lang='+locale;link.className='flex items-center justify-between gap-4 rounded-2xl p-4 outline-none hover:bg-[#f4f8f6] focus-visible:bg-[#e9f2ee]';const content=document.createElement('span');content.className='min-w-0';const name=document.createElement('strong');name.className='block truncate text-base font-semibold text-[#183c33]';name.textContent=event.name;const meta=document.createElement('span');meta.className='mt-1 block truncate text-xs text-[#697a74]';meta.textContent=event.dates+' · '+event.imageCount+' '+labels.images;const role=document.createElement('span');role.className='shrink-0 rounded-full bg-[#e9f2ee] px-3 py-1 text-xs font-semibold text-[#2b6253]';role.textContent=labels[event.role]||event.role;content.append(name,meta);link.append(content,role);results.append(link)})};const search=async()=>{const current=++request;results.innerHTML='<p class="p-6 text-center text-sm text-[#697a74]">…</p>';try{const response=await fetch('/api/account/events/search?locale='+locale+'&q='+encodeURIComponent(input.value.trim()),{credentials:'include'}),data=await response.json();if(current!==request)return;if(!response.ok)throw new Error();render(data.events||[])}catch{if(current!==request)return;results.innerHTML='';const error=document.createElement('p');error.className='p-8 text-center text-sm text-red-700';error.textContent=labels.error;results.append(error)}};open.addEventListener('click',()=>{dialog.showModal();requestAnimationFrame(()=>input.focus());search()});close.addEventListener('click',()=>dialog.close());dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(search,180)})})()<\/script>`;
  return c.html(
    page(
      m.dashboard,
      `${eventHeader(locale, user, "", notificationCount, searchAction)}<main class="mx-auto max-w-6xl p-5 md:p-10"><div class="flex flex-wrap items-end justify-between gap-3"><div><p class="text-sm uppercase tracking-[.2em] text-[#255848]">Dashboard</p><h1 class="text-4xl">${m.dashboard}</h1></div></div>${invitationSection}<form method="get" aria-label="${locale === "el" ? "Φίλτρα και ταξινόμηση events" : "Event filters and sorting"}" class="event-sort-toolbar mt-6 flex flex-wrap items-center justify-end gap-2 text-xs text-[#697a74]"><label class="inline-flex items-center gap-2 rounded-full border border-[#dfe8e4] bg-white/70 py-1.5 pl-3 pr-1.5 shadow-sm"><span>${locale === "el" ? "Προβολή" : "View"}</span><select name="filter" aria-label="${locale === "el" ? "Φίλτρο events" : "Event filter"}" class="min-h-0 rounded-full border-0 bg-[#f3f7f5] px-3 py-1.5 text-xs font-semibold text-[#344941] outline-none">${Object.entries(
        filterLabel,
      )
        .map(
          ([v, l]) =>
            `<option value="${v}"${filter === v ? " selected" : ""}>${l}</option>`,
        )
        .join(
          "",
        )}</select></label><label class="inline-flex items-center gap-2 rounded-full border border-[#dfe8e4] bg-white/70 py-1.5 pl-3 pr-1.5 shadow-sm"><span>${locale === "el" ? "Σειρά" : "Sort"}</span><select name="sort" aria-label="${locale === "el" ? "Ταξινόμηση events" : "Sort events"}" class="min-h-0 rounded-full border-0 bg-[#f3f7f5] px-3 py-1.5 text-xs font-semibold text-[#344941] outline-none"><option value="date_desc"${sort === "date_desc" ? " selected" : ""}>${locale === "el" ? "Νεότερα" : "Newest"}</option><option value="date_asc"${sort === "date_asc" ? " selected" : ""}>${locale === "el" ? "Παλαιότερα" : "Oldest"}</option><option value="name_asc"${sort === "name_asc" ? " selected" : ""}>A → Z</option><option value="name_desc"${sort === "name_desc" ? " selected" : ""}>Z → A</option><option value="created_desc"${sort === "created_desc" ? " selected" : ""}>${locale === "el" ? "Πρόσφατη δημιουργία" : "Recently created"}</option></select></label><button class="inline-flex min-h-9 items-center rounded-full border border-[#d6e0dc] bg-white px-3 py-2 text-xs font-semibold text-[#485e56] shadow-sm hover:bg-[#f4f8f6]">${locale === "el" ? "Εφαρμογή" : "Apply"}</button></form>${eventSections}</main><dialog id="new-event" class="fixed left-1/2 top-1/2 m-0 flex max-h-[92dvh] w-[min(92vw,600px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border-0 bg-white p-0 shadow-2xl backdrop:bg-[#183c33]/60"><div class="max-h-[92dvh] overflow-y-auto p-6 sm:p-8"><div class="flex items-center justify-between gap-4"><div><p class="text-xs uppercase tracking-[.2em] text-[#255848]">Memboux</p><h2 class="text-3xl">${m.createEvent}</h2></div><button type="button" id="close-new-event" class="flex h-10 w-10 items-center justify-center rounded-full border text-xl">×</button></div><form action="/api/account/events" method="post" class="mt-6 grid gap-4 md:grid-cols-2"><input type="hidden" name="locale" value="${locale}"><label class="md:col-span-2"><span class="mb-1 block text-sm font-medium">${m.eventName}</span><input name="eventName" required maxlength="100" placeholder="${m.eventName}" class="w-full rounded-xl border px-4 py-3"></label><label class="md:col-span-2"><span class="mb-1 block text-sm font-medium">${locale === "el" ? "Τοποθεσία (προαιρετικά)" : "Location (optional)"}</span><input name="location" maxlength="160" autocomplete="off" placeholder="${locale === "el" ? "π.χ. Σαντορίνη, Ελλάδα" : "e.g. Santorini, Greece"}" class="w-full rounded-xl border px-4 py-3"></label><label class="text-sm">${locale === "el" ? "Ημερομηνία έναρξης" : "Start date"}<input name="eventStartDate" type="date" required class="mt-1 w-full rounded-xl border px-4 py-3"></label><label class="text-sm">${locale === "el" ? "Ημερομηνία λήξης (προαιρετικά)" : "End date (optional)"}<input name="eventEndDate" type="date" class="mt-1 w-full rounded-xl border px-4 py-3"></label><button class="rounded-xl bg-[#2f6b5b] py-3 font-medium text-white md:col-span-2">${m.createEvent}</button></form></div></dialog><script>const newEventDialog=document.getElementById('new-event');document.querySelectorAll('[data-open-new-event]').forEach(button=>button.addEventListener('click',()=>newEventDialog.showModal()));document.getElementById('close-new-event').onclick=()=>newEventDialog.close();newEventDialog.onclick=e=>{if(e.target===newEventDialog)newEventDialog.close()}<\/script>${logoutScript(locale)}`,
    ),
  );
});

accountRoutes.get("/:locale{el|en|fr|de|es|it}/account-legacy", async (c) => {
  const locale = normalizeLocale(c.req.param("locale")); const m = t(locale);
  const user = await currentUser(c);
  if (!user) return c.redirect(`/${locale}/login`);
  const events = await c.env.DB.prepare(`SELECT e.*, em.role, COUNT(md.id) media_count FROM event_members em JOIN events e ON e.id=em.event_id LEFT JOIN media md ON md.event_id=e.id AND md.media_type='image' WHERE em.user_id=? GROUP BY e.id, em.role ORDER BY e.created_at DESC`).bind(user.id).all<EventRow & { role: string; media_count: number }>();
  const list = events.results.map((event) => `<a href="/dashboard/${event.code}?lang=${locale}" class="rounded-2xl border bg-white p-5 shadow-sm"><div class="flex items-start justify-between gap-3"><span class="rounded-full bg-[#e8f3ee] px-2.5 py-1 text-xs font-medium text-[#2f6b5b]">${event.role === "owner" ? (locale === "el" ? "Ιδιοκτήτης" : "Owner") : (locale === "el" ? "Συνεργάτης" : "Collaborator")}</span></div><h2 class="mt-1 text-xl font-bold">${esc(event.eventName)}</h2><p class="mt-2 text-sm font-medium text-[#2f6b5b]">${esc(formatEventDates(event, locale))}</p><p class="mt-2 text-sm text-[#65756f]">${event.media_count} ${locale === "el" ? "φωτογραφίες" : "photos"}</p></a>`).join("");
  return c.html(page(m.dashboard, `<header class="border-b bg-white"><div class="mx-auto flex max-w-6xl items-center justify-between p-5">${brandMark(`/${locale}`, true)}<div class="flex items-center gap-3"><span class="hidden text-sm text-[#65756f] md:inline">${esc(user.email)}</span><button id="logout" class="rounded-xl border px-4 py-2 text-sm font-semibold">${m.logout}</button></div></div></header><main class="mx-auto max-w-6xl p-5 md:p-10"><div class="flex items-end justify-between"><div><p class="text-sm font-semibold uppercase tracking-[.2em] text-[#255848]">Dashboard</p><h1 class="mt-1 text-4xl font-bold">${m.dashboard}</h1></div></div><form action="/api/account/events" method="post" class="mt-8 grid gap-3 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-2"><input type="hidden" name="locale" value="${locale}"><label class="md:col-span-2"><span class="mb-1 block text-sm font-medium">${m.eventName}</span><input name="eventName" required maxlength="100" placeholder="${m.eventName}" class="w-full rounded-xl border px-4 py-3"></label><label><span class="mb-1 block text-sm font-medium">${locale === "el" ? "Ημερομηνία έναρξης" : "Start date"}</span><input name="eventStartDate" type="date" required class="w-full rounded-xl border px-4 py-3"></label><label><span class="mb-1 block text-sm font-medium">${locale === "el" ? "Ημερομηνία λήξης (προαιρετικά)" : "End date (optional)"}</span><input name="eventEndDate" type="date" class="w-full rounded-xl border px-4 py-3"></label><button class="rounded-xl bg-[#255848] px-5 py-3 font-semibold text-white md:col-span-2">${m.createEvent}</button></form><div class="mt-6 grid gap-4 md:grid-cols-2">${list || `<div class="rounded-2xl bg-white p-10 text-center text-[#65756f]">${locale === "el" ? "Δεν έχεις events ακόμη." : "You don't have any events yet."}</div>`}</div></main><script>const logoutButton=document.getElementById('logout');logoutButton.onclick=async()=>{logoutButton.disabled=true;const response=await fetch('/api/auth/sign-out',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok){logoutButton.disabled=false;alert(${JSON.stringify(locale === "el" ? "Η αποσύνδεση απέτυχε. Δοκίμασε ξανά." : "Sign out failed. Please try again.")});return}location.replace('/${locale}')}<\/script>`));
});

accountRoutes.post("/api/account/events", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const body = await c.req.parseBody(); const eventName = String(body.eventName ?? "").trim().slice(0, 100); const locale = normalizeLocale(String(body.locale ?? "el"));
  const eventType = body.eventType;
  const eventStartDate = validEventDate(body.eventStartDate);
  const eventEndDate = body.eventEndDate ? validEventDate(body.eventEndDate) : eventStartDate;
  const wantsJson = c.req.header("Accept")?.includes("application/json") ?? false;
  const invalidMessage = locale === "el" ? "Έλεγξε το όνομα και τις ημερομηνίες του event." : "Check the event name and dates.";
  const invalidTypeMessage = locale === "el" ? "Επίλεξε έγκυρο είδος event." : "Choose a valid event type.";
  const limitMessage = locale === "el" ? "Έφτασες το όριο events του plan σου." : "You reached your plan event limit.";
  const failureMessage = locale === "el" ? "Δεν μπόρεσα να δημιουργήσω το event. Δοκίμασε ξανά." : "Could not create the event. Please try again.";
  if (!isEventType(eventType)) {
    return wantsJson ? c.json({ message: invalidTypeMessage }, 400) : c.text(invalidTypeMessage, 400);
  }
  if (!eventName || !eventStartDate || !eventEndDate || eventEndDate < eventStartDate) {
    return wantsJson ? c.json({ message: invalidMessage }, 400) : c.text(invalidMessage, 400);
  }
  let eventPlace;
  try {
    eventPlace = await resolveEventPlaceInput({
      apiKey: c.env.GOOGLE_MAPS_API_KEY,
      location: body.location,
      placeId: body.locationPlaceId,
      latitude: body.locationLat,
      longitude: body.locationLng,
      clearLocation: body.clearLocation,
      sessionToken: body.locationSessionToken,
      locale,
    });
  } catch (error) {
    const unavailable = error instanceof PlaceInputError && error.reason === "unavailable";
    const message = unavailable
      ? (locale === "el" ? "Η υπηρεσία τοποθεσίας δεν είναι διαθέσιμη τώρα. Δοκίμασε ξανά." : "Location service is unavailable right now. Please try again.")
      : (locale === "el" ? "Επίλεξε την τοποθεσία από τα αποτελέσματα αναζήτησης." : "Choose the location from the search results.");
    return wantsJson ? c.json({ message }, unavailable ? 503 : 400) : c.text(message, unavailable ? 503 : 400);
  }

  const requestId = c.req.header("cf-ray") ?? crypto.randomUUID();
  let quotaReserved = false;
  try {
    quotaReserved = await reserveOwnedEvent(c.env.DB,user.id);
    if (!quotaReserved) return wantsJson ? c.json({ message: limitMessage }, 409) : c.text(limitMessage, 409);
    const now = Date.now();
    for (let attempt=0; attempt<5; attempt++) {
      const id = crypto.randomUUID();
      const code = randomCode();
      const tokenHash = await sha256(crypto.randomUUID() + crypto.randomUUID());
      try {
      await c.env.DB.batch([
        c.env.DB.prepare("INSERT INTO events (id,code,couple,eventName,admin_token_hash,created_at,expires_at,status,notes,updated_at,default_locale,event_start_date,event_end_date,event_type,location,location_place_id,location_lat,location_lng,location_provider) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,code,eventName,eventName,tokenHash,now,now+365*86400000,"active","",now,locale,eventStartDate,eventEndDate,eventType,eventPlace.location,eventPlace.location_place_id,eventPlace.location_lat,eventPlace.location_lng,eventPlace.location_provider),
        c.env.DB.prepare("INSERT INTO event_members (event_id,user_id,role,created_at) VALUES (?,?,?,?)").bind(id,user.id,"owner",now)
      ]);
        const redirect = eventType === "wedding"
          ? `/dashboard/${code}/wedding/setup?lang=${locale}`
          : `/dashboard/${code}?lang=${locale}#template`;
        return wantsJson ? c.json({ status: true, code, redirect }, 201) : c.redirect(redirect,303);
      } catch(error) {
        const message = error instanceof Error ? error.message : String(error);
        const codeCollision = /UNIQUE constraint failed:\s*events\.code/i.test(message);
        if (!codeCollision || attempt === 4) throw error;
      }
    }
    throw new Error("Event code generation exhausted");
  } catch(error) {
    if (quotaReserved) {
      try {
        await releaseOwnedEvent(c.env.DB,user.id);
      } catch(releaseError) {
        console.error(JSON.stringify({ event:"create_event_quota_release_failed", requestId, userId:user.id, error:releaseError instanceof Error?releaseError.message:String(releaseError) }));
      }
    }
    console.error(JSON.stringify({ event:"create_event_failed", requestId, userId:user.id, error:error instanceof Error?error.message:String(error) }));
    return wantsJson ? c.json({ message: failureMessage, requestId }, 500) : c.text(failureMessage,500);
  }
});

accountRoutes.post("/api/account/events/:code/trash", async (c) => {
  const user=await currentUser(c); if(!user) return c.text("Unauthorized",401);
  const event=await getEvent(c.env.DB,c.req.param("code")); if(!event) return c.text("Event not found",404);
  if(!roleCan(await getEventRole(c.env.DB,event.id,user.id),"manage_event"))return c.text("Forbidden",403);
  const body=await c.req.parseBody(); const locale=normalizeLocale(String(body.locale??event.default_locale)); const now=Date.now();
  const result=await c.env.DB.prepare("UPDATE events SET deleted_at=?,purge_at=?,updated_at=? WHERE id=? AND deleted_at IS NULL").bind(now,now+TRASH_RETENTION_MS,now,event.id).run();if(result.meta.changes)await releaseOwnedEvent(c.env.DB,user.id);
  return c.redirect(`/${locale}/account`,303);
});

accountRoutes.post("/api/account/events/:code/restore", async (c) => {
  const user=await currentUser(c); if(!user) return c.text("Unauthorized",401);
  const event=await getEvent(c.env.DB,c.req.param("code"),true); if(!event) return c.text("Event not found",404);
  if(!roleCan(await getEventRole(c.env.DB,event.id,user.id),"manage_event"))return c.text("Forbidden",403);
  const body=await c.req.parseBody(); const locale=normalizeLocale(String(body.locale??event.default_locale));
  if(!event.deleted_at)return c.redirect(`/${locale}/account`,303);if(!await reserveOwnedEvent(c.env.DB,user.id))return c.text(locale==="el"?"Έφτασες το όριο events του plan σου.":"You reached your plan event limit.",409);
  const result=await c.env.DB.prepare("UPDATE events SET deleted_at=NULL,purge_at=NULL,updated_at=? WHERE id=? AND deleted_at IS NOT NULL").bind(Date.now(),event.id).run();if(!result.meta.changes)await releaseOwnedEvent(c.env.DB,user.id);
  return c.redirect(`/${locale}/trash`,303);
});
