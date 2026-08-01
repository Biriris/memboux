import { Hono, type Context } from "hono";
import QRCode from "qrcode";
import { getEventRole, roleCan } from "../access";
import type { Bindings, EventRow } from "../domain";
import { eventAccessAllows, getEventAccess } from "../event-access";
import { hasGalleryAccess } from "../gallery-access";
import { normalizeLocale, type Locale } from "../i18n";
import { consumeRateLimit, tooManyRequests } from "../rate-limit";
import { getEvent } from "../repositories";
import { currentUser } from "../session";
import { esc, formatEventDates, sha256 } from "../utils";
import { eventHeader, page } from "../views/shared";
import { weddingThemeFor } from "../wedding-themes";

type ExperienceSettings = {
  rsvp_enabled: number;
  guestbook_enabled: number;
  comments_enabled: number;
  slideshow_enabled: number;
  guestbook_moderation: number;
};

const defaults: ExperienceSettings = {
  rsvp_enabled: 1,
  guestbook_enabled: 1,
  comments_enabled: 1,
  slideshow_enabled: 1,
  guestbook_moderation: 1,
};

async function settings(db: D1Database, eventId: string) {
  return (await db.prepare("SELECT * FROM event_experience_settings WHERE event_id=?")
    .bind(eventId).first<ExperienceSettings>()) ?? defaults;
}

const text = (locale: Locale, el: string, en: string) => locale === "el" ? el : en;

async function publicEvent(c: Context<{ Bindings: Bindings }>) {
  const event = await getEvent(c.env.DB, c.req.param("code") ?? "");
  if (!event) return { response: c.text("Event not found", 404) };
  if (Date.now() > event.expires_at) return { response: c.text("Event expired", 410) };
  if (event.event_type === "wedding") {
    const profile = await c.env.DB.prepare("SELECT publish_status FROM event_wedding_profiles WHERE event_id=?")
      .bind(event.id).first<{ publish_status: string }>();
    if (profile?.publish_status !== "published") {
      const user = await currentUser(c);
      if (!user || !roleCan(await getEventRole(c.env.DB, event.id, user.id), "view"))
        return { response: c.text("Event not found", 404) };
    }
  }
  const guestAccessAllowed = eventAccessAllows(await getEventAccess(c.env.DB, event.id), "guest_access");
  if (!guestAccessAllowed) {
    const user = await currentUser(c);
    if (!user || !roleCan(await getEventRole(c.env.DB, event.id, user.id), "view"))
      return { response: c.text("This event is not available to guests", 403) };
  }
  if (!(await hasGalleryAccess(c.req.raw, event))) {
    const user = await currentUser(c);
    if (!user || !(await getEventRole(c.env.DB, event.id, user.id)))
      return { response: c.text("Gallery access required", 401) };
  }
  return { event };
}

export const experienceRoutes = new Hono<{ Bindings: Bindings }>();

experienceRoutes.post("/api/gallery/:code/rsvp", async (c) => {
  const body = await c.req.parseBody();
  const invitationToken = String(body.invitationToken ?? "").trim();
  let invitedGuest: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    plus_one_limit: number;
  } | null = null;
  let event: EventRow;
  if (invitationToken) {
    const invitedEvent = await getEvent(c.env.DB, c.req.param("code") ?? "");
    if (!invitedEvent || !["wedding", "baptism"].includes(invitedEvent.event_type ?? "")) return c.text("Invitation not found", 404);
    if (Date.now() > invitedEvent.expires_at) return c.text("Invitation expired", 410);
    event = invitedEvent;
    const [profile, access, guest] = await Promise.all([
      c.env.DB.prepare(`SELECT publish_status FROM ${event.event_type === "wedding" ? "event_wedding_profiles" : "event_vertical_profiles"} WHERE event_id=?`)
        .bind(event.id).first<{ publish_status: string }>(),
      getEventAccess(c.env.DB, event.id),
      c.env.DB.prepare(`SELECT id,first_name,last_name,email,plus_one_limit
        FROM event_wedding_guests WHERE event_id=? AND invitation_token_hash=?`)
        .bind(event.id, await sha256(invitationToken)).first<{
          id: string; first_name: string; last_name: string; email: string; plus_one_limit: number;
        }>(),
    ]);
    if (!guest || profile?.publish_status !== "published" || !eventAccessAllows(access, "guest_access"))
      return c.text("Invitation not available", 404);
    invitedGuest = guest;
  } else {
    const result = await publicEvent(c);
    if (result.response) return result.response;
    event = result.event!;
    if (["wedding", "baptism"].includes(event.event_type ?? "")) {
      return c.text(text(normalizeLocale(String(body.locale ?? event.default_locale)), "Το RSVP γίνεται μόνο από την προσωπική πρόσκληση.", "RSVP is available only through the personal invitation."), 403);
    }
  }
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  if (!(await settings(c.env.DB, event.id)).rsvp_enabled) return c.text("RSVP is disabled", 403);
  const limit = await consumeRateLimit(c.env.DB, c.req.raw, c.env.BETTER_AUTH_SECRET, {
    scope: `rsvp:${event.id}`, limit: 8, windowMs: 15 * 60_000,
  });
  if (!limit.allowed) return tooManyRequests(limit);
  const name = invitedGuest
    ? `${invitedGuest.first_name} ${invitedGuest.last_name}`.trim().slice(0, 80)
    : String(body.name ?? "").trim().slice(0, 80);
  const email = invitedGuest
    ? (invitedGuest.email || `invite+${invitedGuest.id}@memboux.invalid`)
    : String(body.email ?? "").trim().toLowerCase().slice(0, 254);
  const response = String(body.response ?? "");
  const guestCount = Math.min(invitedGuest ? 1 + invitedGuest.plus_one_limit : 20, Math.max(1, Number(body.guestCount) || 1));
  const dietary = String(body.dietaryNotes ?? "").trim().slice(0, 300);
  const message = String(body.message ?? "").trim().slice(0, 500);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !["yes", "no", "maybe"].includes(response)) {
    return c.text(text(locale, "Έλεγξε τα στοιχεία του RSVP.", "Check your RSVP details."), 400);
  }
  const now = Date.now();
  let releaseSeat = invitedGuest ? response === "no" : false;
  if (invitedGuest) {
    const seating = await c.env.DB.prepare(`SELECT t.capacity,COALESCE(SUM(other.party_size),0) assigned_elsewhere
      FROM event_wedding_seat_assignments current
      JOIN event_wedding_tables t ON t.id=current.table_id AND t.event_id=?
      LEFT JOIN event_wedding_seat_assignments occupied ON occupied.table_id=t.id AND occupied.guest_id<>current.guest_id
      LEFT JOIN event_wedding_guests other ON other.id=occupied.guest_id
      WHERE current.guest_id=? GROUP BY t.id`).bind(event.id, invitedGuest.id).first<{ capacity: number; assigned_elsewhere: number }>();
    releaseSeat ||= Boolean(seating && seating.assigned_elsewhere + guestCount > seating.capacity);
  }
  const existingInvitedRsvp = invitedGuest
    ? await c.env.DB.prepare("SELECT id FROM event_rsvps WHERE wedding_guest_id=? AND event_id=?")
      .bind(invitedGuest.id, event.id).first<{ id: string }>()
    : null;
  const rsvpStatement = existingInvitedRsvp
    ? c.env.DB.prepare(`UPDATE event_rsvps SET name=?,response=?,guest_count=?,dietary_notes=?,message=?,updated_at=?
      WHERE id=? AND event_id=?`).bind(name, response, guestCount, dietary, message, now, existingInvitedRsvp.id, event.id)
    : c.env.DB.prepare(`INSERT INTO event_rsvps
      (id,event_id,name,email,response,guest_count,dietary_notes,message,created_at,updated_at,wedding_guest_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(event_id,email) DO UPDATE SET
      name=excluded.name,response=excluded.response,guest_count=excluded.guest_count,
      dietary_notes=excluded.dietary_notes,message=excluded.message,updated_at=excluded.updated_at,
      wedding_guest_id=excluded.wedding_guest_id`)
      .bind(crypto.randomUUID(), event.id, name, email, response, guestCount, dietary, message, now, now, invitedGuest?.id ?? null);
  await c.env.DB.batch([
    rsvpStatement,
    ...(invitedGuest ? [c.env.DB.prepare(`UPDATE event_wedding_guests
      SET rsvp_status=?,party_size=?,dietary_notes=?,updated_at=? WHERE id=? AND event_id=?`)
      .bind(response, guestCount, dietary, now, invitedGuest.id, event.id)] : []),
    ...(releaseSeat && invitedGuest ? [c.env.DB.prepare("DELETE FROM event_wedding_seat_assignments WHERE guest_id=?").bind(invitedGuest.id)] : []),
  ]);
  if (invitedGuest) {
    return c.redirect(`/event/${event.code}/invite/${encodeURIComponent(invitationToken)}?lang=${locale}&rsvp=sent`, 303);
  }
  const destination = event.event_type === "wedding" ? `/wedding/${event.code}` : `/gallery/${event.code}`;
  return c.redirect(`${destination}?lang=${locale}&rsvp=sent#participate`, 303);
});

experienceRoutes.post("/api/gallery/:code/guestbook", async (c) => {
  const result = await publicEvent(c);
  if (result.response) return result.response;
  const event = result.event!;
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  const eventSettings = await settings(c.env.DB, event.id);
  if (!eventSettings.guestbook_enabled) return c.text("Guestbook is disabled", 403);
  const limit = await consumeRateLimit(c.env.DB, c.req.raw, c.env.BETTER_AUTH_SECRET, {
    scope: `guestbook:${event.id}`, limit: 6, windowMs: 15 * 60_000,
  });
  if (!limit.allowed) return tooManyRequests(limit);
  const name = String(body.name ?? "").trim().slice(0, 80);
  const message = String(body.message ?? "").trim().slice(0, 800);
  if (!name || message.length < 2) return c.text(text(locale, "Συμπλήρωσε όνομα και μήνυμα.", "Add your name and message."), 400);
  await c.env.DB.prepare("INSERT INTO event_guestbook_entries (id,event_id,author_name,message,status,created_at) VALUES (?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), event.id, name, message, eventSettings.guestbook_moderation ? "pending" : "approved", Date.now()).run();
  const destination = event.event_type === "wedding" ? `/wedding/${event.code}` : `/gallery/${event.code}`;
  return c.redirect(`${destination}?lang=${locale}&guestbook=sent#participate`, 303);
});

experienceRoutes.get("/api/gallery/:code/media/:mediaId/comments", async (c) => {
  const result = await publicEvent(c);
  if (result.response) return result.response;
  const event = result.event!;
  if (!(await settings(c.env.DB, event.id)).comments_enabled) return c.json({ comments: [] });
  const media = await c.env.DB.prepare("SELECT id FROM media WHERE id=? AND event_id=? AND deleted_at IS NULL AND reported_at IS NULL")
    .bind(c.req.param("mediaId"), event.id).first();
  if (!media) return c.json({ message: "Media not found" }, 404);
  const rows = await c.env.DB.prepare("SELECT id,author_name,message,created_at FROM media_comments WHERE media_id=? AND status='approved' ORDER BY created_at ASC LIMIT 100")
    .bind(c.req.param("mediaId")).all();
  c.header("Cache-Control", "private, no-store");
  return c.json({ comments: rows.results });
});

experienceRoutes.post("/api/gallery/:code/media/:mediaId/comments", async (c) => {
  const result = await publicEvent(c);
  if (result.response) return result.response;
  const event = result.event!;
  if (!(await settings(c.env.DB, event.id)).comments_enabled) return c.json({ message: "Comments are disabled" }, 403);
  const limit = await consumeRateLimit(c.env.DB, c.req.raw, c.env.BETTER_AUTH_SECRET, {
    scope: `comment:${event.id}`, limit: 12, windowMs: 15 * 60_000,
  });
  if (!limit.allowed) return tooManyRequests(limit);
  const media = await c.env.DB.prepare("SELECT id FROM media WHERE id=? AND event_id=? AND deleted_at IS NULL AND reported_at IS NULL")
    .bind(c.req.param("mediaId"), event.id).first();
  if (!media) return c.json({ message: "Media not found" }, 404);
  const body: { name?: string; message?: string } = await c.req.json<{ name?: string; message?: string }>().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 80);
  const message = String(body.message ?? "").trim().slice(0, 500);
  if (!name || message.length < 1) return c.json({ message: "Name and comment are required" }, 400);
  const createdAt = Date.now();
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO media_comments (id,event_id,media_id,author_name,message,status,created_at) VALUES (?,?,?,?,?,'approved',?)")
    .bind(id, event.id, c.req.param("mediaId"), name, message, createdAt).run();
  return c.json({ comment: { id, author_name: name, message, created_at: createdAt } }, 201);
});

experienceRoutes.get("/api/gallery/:code/slideshow-feed", async (c) => {
  const result = await publicEvent(c);
  if (result.response) return result.response;
  const event = result.event!;
  if (!(await settings(c.env.DB, event.id)).slideshow_enabled) return c.json({ message: "Slideshow is disabled" }, 403);
  const rows = await c.env.DB.prepare(`SELECT id,media_type,uploaded_by,uploaded_at,captured_at FROM media
    WHERE event_id=? AND media_type='image' AND deleted_at IS NULL AND reported_at IS NULL
    ORDER BY COALESCE(captured_at,uploaded_at),uploaded_at LIMIT 1000`).bind(event.id).all<{
      id: string; media_type: "image"; uploaded_by: string; uploaded_at: number; captured_at: number | null;
    }>();
  c.header("Cache-Control", "private, no-store");
  return c.json({ event: { name: event.eventName }, items: rows.results.map((item) => ({ ...item, url: `/media/${encodeURIComponent(item.id)}` })) });
});

experienceRoutes.get("/gallery/:code/slideshow", async (c) => {
  const result = await publicEvent(c);
  if (result.response) return result.response;
  const event = result.event!;
  const locale = normalizeLocale(c.req.query("lang") ?? event.default_locale);
  const empty = text(locale, "Περιμένουμε την πρώτη στιγμή…", "Waiting for the first moment…");
  return c.html(page(`${event.eventName} – Live slideshow`, `<main class="h-dvh overflow-hidden bg-[#080b12] text-white"><header class="absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-5 py-5 sm:px-8"><div><p class="text-[10px] font-bold uppercase tracking-[.22em] text-white/60">Memboux · Live</p><h1 class="mt-1 text-xl font-semibold sm:text-2xl">${esc(event.eventName)}</h1></div><div class="flex items-center gap-3"><span id="live-status" class="rounded-full border border-emerald-300/30 bg-emerald-400/15 px-3 py-1.5 text-xs font-bold text-emerald-200">● LIVE</span><a href="/gallery/${event.code}?lang=${locale}" class="rounded-full bg-white/10 px-4 py-2 text-sm backdrop-blur">${text(locale, "Gallery", "Gallery")}</a></div></header><section id="slideshow" class="relative flex h-full items-center justify-center"><p id="slideshow-empty" class="text-center text-xl text-white/65">${empty}</p></section><footer class="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-5 py-5 text-xs text-white/55 sm:px-8"><span id="slide-counter">0 / 0</span><span>${text(locale, "Νέες λήψεις εμφανίζονται αυτόματα", "New uploads appear automatically")}</span></footer></main><script>(()=>{const root=document.getElementById('slideshow'),counter=document.getElementById('slide-counter'),empty=document.getElementById('slideshow-empty');let items=[],index=0,signature='',timer;const render=()=>{if(!items.length){empty?.classList.remove('hidden');counter.textContent='0 / 0';return}empty?.classList.add('hidden');const item=items[index%items.length],node=document.createElement('img');node.src=item.url;node.className='absolute inset-0 h-full w-full object-contain opacity-0 transition-opacity duration-1000';node.onload=()=>requestAnimationFrame(()=>node.classList.remove('opacity-0'));root.querySelectorAll('img').forEach(old=>{old.classList.add('opacity-0');setTimeout(()=>old.remove(),1000)});root.append(node);requestAnimationFrame(()=>node.classList.remove('opacity-0'));counter.textContent=(index+1)+' / '+items.length;clearTimeout(timer);timer=setTimeout(next,6000)};function next(){if(!items.length)return;index=(index+1)%items.length;render()}const refresh=async()=>{try{const response=await fetch('/api/gallery/${event.code}/slideshow-feed',{credentials:'include'}),data=await response.json();const nextItems=data.items||[],nextSignature=nextItems.map(item=>item.id).join(',');if(nextSignature!==signature){const current=items[index]?.id;items=nextItems;signature=nextSignature;index=Math.max(0,items.findIndex(item=>item.id===current));render()}}catch{}};refresh();setInterval(refresh,3000);document.addEventListener('keydown',event=>{if(event.key==='ArrowRight')next();if(event.key==='ArrowLeft'){index=(index-1+items.length)%items.length;render()}if(event.key==='f')document.documentElement.requestFullscreen?.()})})()<\/script>`, { locale }));
});

experienceRoutes.get("/dashboard/:code/engagement", async (c) => {
  const locale = normalizeLocale(c.req.query("lang") ?? "en");
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  const user = await currentUser(c);
  if (!user) return c.redirect(`/${locale}/login`);
  if (!roleCan(await getEventRole(c.env.DB, event.id, user.id), "manage_event")) return c.text("Forbidden", 403);
  const [rsvps, guestbook, comments, eventSettings, weddingFeatures] = await Promise.all([
    c.env.DB.prepare(`SELECT r.*,g.email wedding_guest_email,g.phone wedding_guest_phone
      FROM event_rsvps r LEFT JOIN event_wedding_guests g ON g.id=r.wedding_guest_id
      WHERE r.event_id=? ORDER BY r.updated_at DESC`).bind(event.id).all<any>(),
    c.env.DB.prepare("SELECT * FROM event_guestbook_entries WHERE event_id=? ORDER BY created_at DESC").bind(event.id).all<any>(),
    c.env.DB.prepare("SELECT c.*,m.media_type FROM media_comments c JOIN media m ON m.id=c.media_id WHERE c.event_id=? ORDER BY c.created_at DESC LIMIT 200").bind(event.id).all<any>(),
    settings(c.env.DB, event.id),
    event.event_type === "wedding"
      ? c.env.DB.prepare("SELECT feature_key FROM event_wedding_features WHERE event_id=? AND enabled=1").bind(event.id).all<{ feature_key: string }>()
      : Promise.resolve({ results: [] as { feature_key: string }[] }),
  ]);
  const selectedFeatures = new Set(weddingFeatures.results.map((row) => row.feature_key));
  const option = (name: keyof ExperienceSettings, label: string, requiredFeature?: string) => {
    const available = event.event_type !== "wedding" || !requiredFeature || selectedFeatures.has(requiredFeature);
    return `<label class="flex items-center justify-between gap-3 rounded-xl border border-[#e2e9e6] ${available ? "bg-white" : "bg-[#f5f3f7] text-[#91889a]"} px-4 py-3"><span class="text-sm font-semibold">${label}${available ? "" : ` · ${text(locale, "δεν είναι στο πακέτο", "not in package")}`}</span><input type="checkbox" name="${name}" value="1" ${available && eventSettings[name] ? "checked" : ""} ${available ? "" : "disabled"} class="h-5 w-5"></label>`;
  };
  const responseLabel = (value: string) => value === "yes" ? "Yes" : value === "maybe" ? "Maybe" : "No";
  const guestRows = guestbook.results.map((row: any) => `<article class="rounded-2xl border border-[#e2e9e6] bg-white p-4"><div class="flex items-start justify-between gap-3"><div><p class="font-semibold">${esc(row.author_name)}</p><p class="mt-2 text-sm leading-6 text-[#746a80]">${esc(row.message)}</p></div><span class="rounded-full bg-[#f6f2fc] px-2.5 py-1 text-[10px] font-bold uppercase">${esc(row.status)}</span></div><div class="mt-3 flex gap-2"><form action="/api/account/events/${event.code}/guestbook/${row.id}/status" method="post"><input type="hidden" name="locale" value="${locale}"><button name="status" value="approved" class="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">Approve</button></form><form action="/api/account/events/${event.code}/guestbook/${row.id}/status" method="post"><input type="hidden" name="locale" value="${locale}"><button name="status" value="hidden" class="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">Hide</button></form></div></article>`).join("");
  const rsvpRows = rsvps.results.map((row: any) => `<tr class="border-t"><td class="px-4 py-3"><strong>${esc(row.name)}</strong><br><span class="text-xs text-[#807588]">${esc(row.wedding_guest_email || row.wedding_guest_phone || row.email)}</span></td><td class="px-4 py-3">${responseLabel(row.response)}</td><td class="px-4 py-3">${row.guest_count}</td><td class="px-4 py-3 text-sm text-[#746a80]">${esc(row.dietary_notes || row.message || "–")}</td></tr>`).join("");
  const commentRows = comments.results.map((row: any) => `<article class="flex items-start gap-3 rounded-2xl border border-[#e2e9e6] bg-white p-4"><img src="/media/${encodeURIComponent(row.media_id)}" alt="" class="h-16 w-16 rounded-xl object-cover"><div class="min-w-0 flex-1"><p class="font-semibold">${esc(row.author_name)}</p><p class="mt-1 text-sm text-[#746a80]">${esc(row.message)}</p></div>${row.status === "approved" ? `<form action="/api/account/events/${event.code}/comments/${row.id}/hide" method="post"><input type="hidden" name="locale" value="${locale}"><button class="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">Hide</button></form>` : `<span class="text-xs font-bold text-[#9aaba4]">Hidden</span>`}</article>`).join("");
  const body = `${eventHeader(locale, { name: user.name ?? user.email, email: user.email })}<main class="mx-auto max-w-7xl p-4 sm:p-6 lg:p-10"><div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><a href="/dashboard/${event.code}?lang=${locale}" class="text-sm font-semibold text-[#6d28d9]">← ${text(locale, "Πίσω στο event", "Back to event")}</a><p class="mt-5 text-xs font-bold uppercase tracking-[.18em] text-[#7c3aed]">Engagement</p><h1 class="mt-2 text-4xl">${esc(event.eventName)}</h1></div><a href="/gallery/${event.code}/slideshow?lang=${locale}" target="_blank" class="rounded-xl bg-[#2b174d] px-5 py-3 text-center text-sm font-semibold text-white">${text(locale, "Έναρξη live slideshow", "Launch live slideshow")}</a></div><section class="mt-6 grid gap-4 lg:grid-cols-[.8fr_1.2fr]"><form action="/api/account/events/${event.code}/experience-settings" method="post" class="rounded-[2rem] border bg-[#f7f3ff] p-5 sm:p-6"><input type="hidden" name="locale" value="${locale}"><h2 class="text-2xl">${text(locale, "Ρυθμίσεις εμπειρίας", "Experience settings")}</h2><div class="mt-4 grid gap-2">${option("rsvp_enabled", "RSVP", "rsvp")}${option("guestbook_enabled", "Guestbook", "guestbook")}${option("comments_enabled", "Comments", "guestbook")}${option("slideshow_enabled", "Live slideshow", "live_slideshow")}${option("guestbook_moderation", text(locale, "Έγκριση guestbook πριν τη δημοσίευση", "Approve guestbook before publishing"), "guestbook")}</div>${event.event_type === "wedding" ? `<a href="/dashboard/${event.code}/wedding/setup?lang=${locale}&amp;step=5" class="mt-3 inline-flex text-xs font-bold text-[#6d28d9]">${text(locale, "Διαχείριση λειτουργιών και τιμών →", "Manage features and pricing →")}</a>` : ""}<button class="mt-4 w-full rounded-xl bg-[#7c3aed] px-4 py-3 font-semibold text-white">${text(locale, "Αποθήκευση", "Save settings")}</button></form><section class="overflow-hidden rounded-[2rem] border bg-white"><div class="p-5 sm:p-6"><h2 class="text-2xl">RSVP <span class="text-[#929f9a]">(${rsvps.results.length})</span></h2></div><div class="overflow-x-auto"><table class="w-full min-w-[650px] text-left"><thead class="bg-[#f8f5ff] text-xs uppercase text-[#7a7085]"><tr><th class="px-4 py-3">Guest</th><th class="px-4 py-3">Answer</th><th class="px-4 py-3">People</th><th class="px-4 py-3">Notes</th></tr></thead><tbody>${rsvpRows || `<tr><td colspan="4" class="px-5 py-10 text-center text-[#807588]">${text(locale, "Δεν υπάρχουν απαντήσεις ακόμη.", "No responses yet.")}</td></tr>`}</tbody></table></div></section></section><section class="mt-6 grid gap-6 lg:grid-cols-2"><div class="rounded-[2rem] border bg-[#f8f5ff] p-5 sm:p-6"><h2 class="text-2xl">Guestbook <span class="text-[#929f9a]">(${guestbook.results.length})</span></h2><div class="mt-4 grid gap-3">${guestRows || `<p class="rounded-2xl bg-white p-6 text-center text-[#807588]">${text(locale, "Κανένα μήνυμα ακόμη.", "No messages yet.")}</p>`}</div></div><div class="rounded-[2rem] border bg-[#f8f5ff] p-5 sm:p-6"><h2 class="text-2xl">Comments <span class="text-[#929f9a]">(${comments.results.length})</span></h2><div class="mt-4 grid gap-3">${commentRows || `<p class="rounded-2xl bg-white p-6 text-center text-[#807588]">${text(locale, "Κανένα σχόλιο ακόμη.", "No comments yet.")}</p>`}</div></div></section></main>`;
  const directoryEvent = ["wedding", "baptism"].includes(event.event_type ?? "");
  const organizedBody = directoryEvent
    ? body
      .replace("<main ", `<style>[data-directory-engagement]>section{display:none}[data-directory-engagement]>form label:first-child{display:none}</style><main `)
      .replace('<section class="mt-6 grid gap-4 lg:grid-cols-[.8fr_1.2fr]">', '<section data-directory-engagement class="mt-6 grid gap-4">')
      .replace("</div><section data-directory-engagement", `</div><p class="mt-4 rounded-2xl border border-[#d9caeb] bg-white p-4 text-sm text-[#65566f]">${text(locale, "Οι προσκλήσεις και όλες οι απαντήσεις RSVP διαχειρίζονται πλέον στην ενιαία λίστα καλεσμένων.", "Invitations and all RSVP responses are now managed in the unified guest directory.")} <a class="font-bold text-[#6d28d9]" href="/dashboard/${event.code}/wedding/guests?lang=${locale}">${text(locale, "Άνοιγμα λίστας →", "Open guest directory →")}</a></p><section data-directory-engagement`)
    : body;
  return c.html(page(`${event.eventName} – Engagement`, organizedBody, { locale }));
});

experienceRoutes.post("/api/account/events/:code/experience-settings", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  const user = await currentUser(c);
  if (!user || !roleCan(await getEventRole(c.env.DB, event.id, user.id), "manage_event")) return c.text("Forbidden", 403);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? "en"));
  const value = (key: string) => body[key] === "1" ? 1 : 0;
  const selectedFeatures = event.event_type === "wedding"
    ? new Set((await c.env.DB.prepare("SELECT feature_key FROM event_wedding_features WHERE event_id=? AND enabled=1")
      .bind(event.id).all<{ feature_key: string }>()).results.map((row) => row.feature_key))
    : null;
  const enabled = (key: string, requiredFeature?: string) =>
    value(key) && (!selectedFeatures || !requiredFeature || selectedFeatures.has(requiredFeature)) ? 1 : 0;
  await c.env.DB.prepare(`INSERT INTO event_experience_settings (event_id,rsvp_enabled,guestbook_enabled,comments_enabled,slideshow_enabled,guestbook_moderation,updated_at)
    VALUES (?,?,?,?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET rsvp_enabled=excluded.rsvp_enabled,guestbook_enabled=excluded.guestbook_enabled,comments_enabled=excluded.comments_enabled,slideshow_enabled=excluded.slideshow_enabled,guestbook_moderation=excluded.guestbook_moderation,updated_at=excluded.updated_at`)
    .bind(event.id, enabled("rsvp_enabled", "rsvp"), enabled("guestbook_enabled", "guestbook"), enabled("comments_enabled", "guestbook"), enabled("slideshow_enabled", "live_slideshow"), enabled("guestbook_moderation", "guestbook"), Date.now()).run();
  return c.redirect(`/dashboard/${event.code}/engagement?lang=${locale}`, 303);
});

experienceRoutes.post("/api/account/events/:code/guestbook/:id/status", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  const user = await currentUser(c);
  if (!user || !roleCan(await getEventRole(c.env.DB, event.id, user.id), "manage_event")) return c.text("Forbidden", 403);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? "en"));
  const status = body.status === "approved" ? "approved" : "hidden";
  await c.env.DB.prepare("UPDATE event_guestbook_entries SET status=?,moderated_at=? WHERE id=? AND event_id=?")
    .bind(status, Date.now(), c.req.param("id"), event.id).run();
  return c.redirect(`/dashboard/${event.code}/engagement?lang=${locale}`, 303);
});

experienceRoutes.post("/api/account/events/:code/comments/:id/hide", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  const user = await currentUser(c);
  if (!user || !roleCan(await getEventRole(c.env.DB, event.id, user.id), "manage_event")) return c.text("Forbidden", 403);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? "en"));
  await c.env.DB.prepare("UPDATE media_comments SET status='hidden' WHERE id=? AND event_id=?").bind(c.req.param("id"), event.id).run();
  return c.redirect(`/dashboard/${event.code}/engagement?lang=${locale}`, 303);
});

experienceRoutes.get("/dashboard/:code/qr-templates", async (c) => {
  const locale = normalizeLocale(c.req.query("lang") ?? "en");
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  const user = await currentUser(c);
  if (!user) return c.redirect(`/${locale}/login`);
  if (!roleCan(await getEventRole(c.env.DB, event.id, user.id), "manage_event")) return c.text("Forbidden", 403);
  const weddingProfile = event.event_type === "wedding"
    ? await c.env.DB.prepare("SELECT template_key,accent_color FROM event_wedding_profiles WHERE event_id=?")
      .bind(event.id).first<{ template_key: string; accent_color: string | null }>()
    : null;
  const weddingTheme = weddingProfile ? weddingThemeFor(weddingProfile.template_key) : null;
  const palette = weddingTheme?.palette ?? (["#2b174d", "#c8b7e8", "#f8f5ff"] as const);
  const accent = weddingProfile?.accent_color ?? weddingTheme?.defaultAccent ?? "#7c3aed";
  const guestUrl = `${new URL(c.req.url).origin}/gallery/${event.code}`;
  const qr = (await QRCode.toString(guestUrl, { type: "svg", width: 520, margin: 1, errorCorrectionLevel: "H" })).replace("<svg", '<svg class="h-auto w-full"');
  const card = (theme: string, eyebrow: string, subtitle: string, _legacyClasses: string) => {
    const variant = theme === "Midnight"
      ? { background: palette[0], color: palette[2], border: accent }
      : theme === "Botanical"
        ? { background: palette[1], color: palette[0], border: accent }
        : theme === "Modern"
          ? { background: `linear-gradient(145deg,${palette[2]},${palette[1]})`, color: palette[0], border: accent }
          : { background: palette[2], color: palette[0], border: palette[1] };
    return `<article data-qr-card class="qr-print-card relative aspect-[5/7] overflow-hidden rounded-[2rem] border p-8 shadow-xl" style="background:${esc(variant.background)};color:${esc(variant.color)};border-color:${esc(variant.border)}"><div class="flex h-full flex-col items-center justify-between text-center"><div><p class="text-[10px] font-bold uppercase tracking-[.28em] opacity-70">${eyebrow}</p><h2 class="mt-4 text-4xl leading-tight">${esc(event.eventName)}</h2><p class="mt-3 text-sm opacity-70">${esc(formatEventDates(event, locale))}</p></div><div class="w-[68%] rounded-[1.75rem] bg-white p-4 text-black shadow-lg">${qr}</div><div><p class="text-xl">${subtitle}</p><p class="mt-3 text-xs opacity-65">memboux.com · ${esc(event.code)}</p><p class="mt-2 text-[9px] font-bold uppercase tracking-[.24em] opacity-55">${esc(weddingTheme?.name[locale] ?? theme)}</p></div></div></article>`;
  };
  const body = `${eventHeader(locale, { name: user.name ?? user.email, email: user.email })}<main class="mx-auto max-w-7xl p-4 sm:p-6 lg:p-10"><div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><a href="/dashboard/${event.code}?lang=${locale}" class="text-sm font-semibold text-[#6d28d9]">← ${text(locale, "Πίσω στο event", "Back to event")}</a><p class="mt-5 text-xs font-bold uppercase tracking-[.18em] text-[#7c3aed]">QR Studio</p><h1 class="mt-2 text-4xl">${text(locale, "Έτοιμα QR templates", "Ready-to-print QR templates")}</h1><p class="mt-3 max-w-2xl text-sm leading-6 text-[#756b82]">${text(locale, "Διάλεξε σχέδιο και εκτύπωσέ το για τραπέζια, είσοδο ή προσκλήσεις.", "Choose a design and print it for tables, entrances or invitations.")}</p></div><button id="print-qr" class="rounded-xl bg-[#2b174d] px-5 py-3 font-semibold text-white">${text(locale, "Εκτύπωση επιλεγμένου", "Print selected")}</button></div><div class="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">${card("Minimal", "Scan · Share · Remember", text(locale, "Σκανάρισε & μοιράσου", "Scan & share"), "bg-[#fffdf8] text-[#3e342e] ring-1 ring-[#d9c8ba]")}${card("Midnight", "Private event gallery", text(locale, "Μοιράσου τη στιγμή", "Share the moment"), "bg-[#2b174d] text-white")}${card("Botanical", "Collecting moments", text(locale, "Άφησε μια ανάμνηση", "Leave a memory"), "bg-[#dce9df] text-[#243d31]")}${card("Modern", "Memboux live", text(locale, "Ανέβασε εδώ", "Upload here"), "bg-[#dbeae4] text-[#294c41]")}</div></main><style>@media print{body{background:white!important}.app-shell-header,main>div:first-child{display:none!important}main{padding:0!important}.qr-print-card{display:none!important;box-shadow:none!important;border-radius:0!important}.qr-print-card[data-selected="true"]{display:block!important;width:148mm;height:210mm;margin:auto}}</style><script>(()=>{const cards=[...document.querySelectorAll('[data-qr-card]')];const select=card=>cards.forEach(item=>{item.dataset.selected=String(item===card);item.classList.toggle('ring-4',item===card);item.classList.toggle('ring-[#7c3aed]',item===card)});cards.forEach(card=>{card.classList.add('cursor-pointer');card.onclick=()=>select(card)});select(cards[0]);document.getElementById('print-qr').onclick=()=>window.print()})()<\/script>`;
  const themedBody = body.replace("</style>", `.qr-print-card[data-selected="true"]{box-shadow:0 0 0 4px ${esc(accent)},0 24px 60px #1c102033}</style>`);
  return c.html(page(`${event.eventName} – QR Studio`, themedBody, { locale }));
});
