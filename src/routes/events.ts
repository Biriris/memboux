import { Hono } from "hono";
import QRCode from "qrcode";
import { getEventRole, roleCan } from "../access";
import { sendEmail } from "../auth";
import { TRASH_RETENTION_MS } from "../config";
import type { Bindings, EventInvitationRow, EventMemberRow, MediaRow } from "../domain";
import { normalizeLocale } from "../i18n";
import { createOrReplaceInvitation, normalizeInviteRole } from "../invitations";
import { canInviteToEvent } from "../quotas";
import { getEvent, getMedia } from "../repositories";
import { currentUser } from "../session";
import { constantTimeEqual, esc, formatDateTime, formatEventDates, sha256, validEventDate } from "../utils";
import { bulkSelectionScript, cards, galleryFilterControls, galleryFilterScript, lightboxMarkup } from "../views/media";
import { shareIconButtons } from "../views/share";
import { eventHeader, accountMenu, brandMark, logoutScript, page } from "../views/shared";

export const eventRoutes = new Hono<{ Bindings: Bindings }>();

eventRoutes.get("/dashboard/:code", async(c)=>{
  const locale=normalizeLocale(c.req.query("lang")??"en");const event=await getEvent(c.env.DB,c.req.param("code"));if(!event)return c.text(locale==="el"?"Το event δεν βρέθηκε.":"Event not found.",404);
  const user=await currentUser(c);if(!user)return c.redirect(`/${locale}/login`);
  const membership=await getEventRole(c.env.DB,event.id,user.id);if(!membership)return c.text("Forbidden",403);
  const canManageMedia=roleCan(membership,"manage_media");
  const items=await getMedia(c.env.DB,event.id);
  const guestUrl=`${new URL(c.req.url).origin}/gallery/${event.code}`;
  const shareText=locale==="el"?`Δες και πρόσθεσε στιγμές στο ${event.eventName}: ${guestUrl}`:`View and add moments to ${event.eventName}: ${guestUrl}`;
  const qrSvg=(await QRCode.toString(guestUrl,{type:"svg",width:220,margin:1,errorCorrectionLevel:"M"})).replace("<svg",'<svg class="block h-auto w-full max-w-full"');
  const sharePanel=`<section class="mb-7 rounded-3xl bg-white p-5 shadow-lg sm:p-7"><div class="grid items-center gap-6 md:grid-cols-[160px_minmax(0,1fr)]"><div class="mx-auto w-full max-w-[160px] rounded-2xl border bg-white p-3">${qrSvg}</div><div class="min-w-0"><p class="text-xs uppercase tracking-[.2em] text-[#765440]">${locale==="el"?"Κοινοποίηση event":"Share event"}</p><h2 class="mt-1 text-3xl">QR Code & link</h2><a href="${esc(guestUrl)}" target="_blank" class="mt-3 block break-all text-sm text-[#654534]">${esc(guestUrl)}</a><div class="mt-4 flex flex-col gap-2 sm:flex-row"><input id="guest-link" readonly value="${esc(guestUrl)}" class="min-w-0 flex-1 rounded-xl border px-4 py-3"><button id="copy-guest-link" class="rounded-xl bg-[#654534] px-5 py-3 text-white">${locale==="el"?"Αντιγραφή":"Copy link"}</button></div>${shareIconButtons(guestUrl,event.eventName,locale)}${event.gallery_pin_hash?`<p class="mt-3 text-xs text-[#625750]">🔒 ${locale==="el"?"Το gallery προστατεύεται με PIN.":"This gallery is PIN protected."}</p>`:""}</div></div></section>`;
  const ownerSelectionScript = bulkSelectionScript({
    selectButtonId: "owner-select-media",
    cardSelector: ".selectable-media",
    selectorSelector: ".media-selector",
    checkboxSelector: ".media-select",
    tickSelector: ".selection-tick",
    selectText: locale === "el" ? "Επιλογή" : "Select",
    cancelText: locale === "el" ? "Ακύρωση" : "Cancel",
    actions: [
      {
        buttonId: "owner-download-selected",
        label: locale === "el" ? "Λήψη επιλεγμένων" : "Download selected",
        kind: "download",
      },
      {
        buttonId: "owner-delete-selected",
        label: locale === "el" ? "Διαγραφή επιλεγμένων" : "Delete selected",
        kind: "submit",
        formId: "owner-bulk-media",
        inputId: "owner-media-ids",
        confirmMessage: locale === "el" ? "Μεταφορά των επιλεγμένων στον κάδο;" : "Move selected media to trash?",
      },
    ],
  });
  return c.html(page(event.eventName,`<header class="border-b bg-white"><div class="mx-auto flex max-w-6xl items-center justify-between gap-3 p-5">${brandMark(`/${locale}`,true)}${accountMenu(locale,user)}</div></header><main class="mx-auto max-w-6xl p-5 md:p-10"><section class="relative mb-8 text-center">${membership==="owner"?`<details class="absolute right-0 top-0 z-20 text-left"><summary class="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border bg-white text-2xl shadow-sm" aria-label="Event actions">⋯</summary><div class="absolute right-0 mt-1 w-44 rounded-2xl border bg-white p-2 shadow-xl"><a href="/dashboard/${event.code}/edit?lang=${locale}" class="block rounded-xl px-3 py-2 text-sm hover:bg-[#f6f1eb]">${locale==="el"?"Επεξεργασία event":"Edit event"}</a></div></details>`:""}<p class="text-xs uppercase tracking-[.25em] text-[#765440]">Collecting Moments</p><h1 class="mt-3 text-5xl md:text-6xl">${esc(event.eventName)}</h1><p class="mt-3 text-lg text-[#654534]">${esc(formatEventDates(event,locale))}</p></section>${sharePanel}<section class="rounded-3xl bg-white p-5 shadow-lg sm:p-7"><div class="mb-5 flex items-center justify-between"><div><h2 class="text-3xl">Gallery</h2>${galleryFilterControls(items,"owner-gallery",locale)}</div><div class="flex flex-wrap items-center justify-end gap-2"><span class="text-sm text-[#625750]">${items.length} ${locale==="el"?"αρχεία":"items"}</span><button id="owner-select-media" class="rounded-xl border px-3 py-2 text-sm">${locale==="el"?"Επιλογή":"Select"}</button><button id="owner-download-selected" class="hidden rounded-xl bg-[#654534] px-3 py-2 text-sm text-white">${locale==="el"?"Λήψη επιλεγμένων":"Download selected"}</button>${canManageMedia?`<button id="owner-delete-selected" class="hidden rounded-xl border border-red-200 px-3 py-2 text-sm text-red-700">${locale==="el"?"Διαγραφή επιλεγμένων":"Delete selected"}</button>`:""}</div></div><form id="owner-bulk-media" action="/api/account/events/${event.code}/media/bulk-trash" method="post"><input type="hidden" name="locale" value="${locale}"><input id="owner-media-ids" type="hidden" name="ids"></form>${items.length?`<div class="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">${cards(items,{lightbox:true,selectable:true,deferredSelection:true})}</div>`:`<p class="py-16 text-center text-[#625750]">${locale==="el"?"Δεν υπάρχουν φωτογραφίες ακόμη.":"No photos yet."}</p>`}</section></main><script>document.getElementById('copy-guest-link').onclick=()=>navigator.clipboard.writeText(document.getElementById('guest-link').value);document.querySelectorAll('[data-native-share]').forEach(button=>button.onclick=async()=>{if(navigator.share){try{await navigator.share({title:${JSON.stringify(event.eventName)},text:${JSON.stringify(shareText)},url:${JSON.stringify(guestUrl)}});return}catch(error){if(error.name==='AbortError')return}}await navigator.clipboard.writeText(${JSON.stringify(shareText)});alert(${JSON.stringify(locale==="el"?"Το link αντιγράφηκε. Άνοιξε την εφαρμογή και κάνε επικόλληση.":"Link copied. Open the app and paste it.")})<\/script>${ownerSelectionScript}${galleryFilterScript(items,"owner-gallery")}${lightboxMarkup(locale)}${logoutScript(locale)}`));
});

eventRoutes.get("/dashboard/:code/edit", async(c)=>{
  const locale=normalizeLocale(c.req.query("lang")??"en");const event=await getEvent(c.env.DB,c.req.param("code"));if(!event)return c.text("Event not found",404);const user=await currentUser(c);if(!user)return c.redirect(`/${locale}/login`);
  const owner=await getEventRole(c.env.DB,event.id,user.id);if(!roleCan(owner,"manage_event"))return c.text("Only the event owner can edit this event",403);
  const members=(await c.env.DB.prepare(`SELECT em.user_id,u.name,u.email,em.role,em.created_at FROM event_members em JOIN "user" u ON u.id=em.user_id WHERE em.event_id=? ORDER BY CASE em.role WHEN 'owner' THEN 0 ELSE 1 END,em.created_at`).bind(event.id).all<EventMemberRow>()).results;
  const invitations=(await c.env.DB.prepare("SELECT id,email,role,created_at,expires_at FROM event_invitations WHERE event_id=? AND accepted_at IS NULL AND expires_at>? ORDER BY created_at DESC").bind(event.id,Date.now()).all<EventInvitationRow>()).results;
  const removalRequests=(await c.env.DB.prepare("SELECT rr.id,rr.media_id,rr.requester_email,rr.reason,rr.created_at FROM media_removal_requests rr WHERE rr.event_id=? AND rr.status='pending' ORDER BY rr.created_at DESC").bind(event.id).all<{id:string;media_id:string;requester_email:string;reason:string;created_at:number}>()).results;
  const removalPanel=`<section class="mt-6 rounded-3xl bg-white p-6 shadow"><h2 class="text-3xl">${locale==="el"?"Αιτήματα αφαίρεσης":"Removal requests"} (${removalRequests.length})</h2><div class="mt-4 space-y-3">${removalRequests.map(request=>`<article class="rounded-2xl border p-4"><p class="text-sm text-[#625750]">${esc(request.requester_email)} · ${formatDateTime(request.created_at,locale)}</p><p class="mt-2">${esc(request.reason)}</p><div class="mt-3 flex gap-2"><form action="/api/account/events/${event.code}/removal/${request.id}/approve" method="post"><input type="hidden" name="locale" value="${locale}"><button class="rounded-xl bg-red-700 px-4 py-2 text-sm text-white">${locale==="el"?"Αφαίρεση φωτογραφίας":"Remove photo"}</button></form><form action="/api/account/events/${event.code}/removal/${request.id}/dismiss" method="post"><input type="hidden" name="locale" value="${locale}"><button class="rounded-xl border px-4 py-2 text-sm">${locale==="el"?"Απόρριψη":"Dismiss"}</button></form></div></article>`).join("")||`<p class="text-[#625750]">${locale==="el"?"Δεν υπάρχουν εκκρεμή αιτήματα.":"No pending requests."}</p>`}</div></section>`;
  const privacyPanel=`<section class="mt-6 rounded-3xl bg-white p-6 shadow"><h2 class="text-3xl">${locale==="el"?"Ιδιωτικότητα gallery":"Gallery privacy"}</h2><p class="mt-2 text-[#625750]">${event.gallery_pin_hash?(locale==="el"?"Το gallery προστατεύεται με PIN.":"The gallery is protected by a PIN."):(locale==="el"?"Δεν έχει οριστεί PIN.":"No PIN is currently set.")}</p><form action="/api/account/events/${event.code}/privacy" method="post" class="mt-4 flex flex-col gap-3 sm:flex-row"><input type="hidden" name="locale" value="${locale}"><input name="pin" inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" placeholder="4–8 digit PIN" class="min-w-0 flex-1 rounded-xl border px-4 py-3"><button name="action" value="set" class="rounded-xl bg-[#654534] px-5 py-3 text-white">${locale==="el"?"Ορισμός PIN":"Set PIN"}</button>${event.gallery_pin_hash?`<button name="action" value="remove" class="rounded-xl border border-red-200 px-5 py-3 text-red-700">${locale==="el"?"Αφαίρεση PIN":"Remove PIN"}</button>`:""}</form></section>`;
  const memberRows=members.map(member=>`<div class="flex items-center justify-between gap-3 rounded-2xl border p-4"><div class="min-w-0"><p class="truncate font-medium">${esc(member.name)}</p><p class="truncate text-sm text-[#625750]">${esc(member.email)}</p></div>${member.role==="owner"?`<span class="rounded-full bg-[#eee4dc] px-3 py-1 text-xs">Owner</span>`:`<div class="flex items-center gap-2"><span class="rounded-full bg-[#eee4dc] px-3 py-1 text-xs">${member.role==="editor"?(locale==="el"?"Διαχειριστής":"Manager"):(locale==="el"?"Θεατής":"Viewer")}</span><form action="/api/account/events/${event.code}/members/remove" method="post"><input type="hidden" name="userId" value="${esc(member.user_id)}"><input type="hidden" name="locale" value="${locale}"><button class="text-sm text-red-700">${locale==="el"?"Αφαίρεση":"Remove"}</button></form></div>`}</div>`).join("");
  const inviteRows=invitations.map(invite=>`<div class="flex items-center justify-between gap-3 rounded-2xl border border-dashed p-4"><div class="min-w-0"><p class="truncate">${esc(invite.email)}</p><p class="text-xs text-[#625750]">${locale==="el"?"Σε αναμονή":"Pending"} · ${invite.role==="editor"?(locale==="el"?"Διαχειριστής":"Manager"):(locale==="el"?"Θεατής":"Viewer")}</p></div><form action="/api/account/events/${event.code}/members/remove" method="post"><input type="hidden" name="invitationId" value="${invite.id}"><input type="hidden" name="locale" value="${locale}"><button class="text-sm text-red-700">${locale==="el"?"Ακύρωση":"Cancel"}</button></form></div>`).join("");
  return c.html(page(`${event.eventName} – Edit`,`${eventHeader(locale,user,`<a href="/dashboard/${event.code}?lang=${locale}" class="rounded-lg border px-3 py-2 text-sm font-semibold">${locale==="el"?"Άνοιγμα":"Open"}</a>`)}<main class="mx-auto max-w-5xl p-4 sm:p-5 md:p-10"><div class="rounded-3xl bg-white p-6 shadow-lg sm:p-8"><p class="text-xs uppercase tracking-[.2em] text-[#6e4f3e]">Event settings</p><h1 class="mt-2 text-4xl">${locale==="el"?"Επεξεργασία event":"Edit event"}</h1><p class="mt-2 text-[#625750]">${esc(formatEventDates(event, locale))}</p></div><section class="mt-6 rounded-3xl bg-white p-6 shadow"><h2 class="text-3xl">${locale==="el"?"Τίτλος και ημερομηνίες":"Title and dates"}</h2><form action="/api/account/events/${event.code}/details" method="post" class="mt-5 grid gap-4 md:grid-cols-2"><input type="hidden" name="locale" value="${locale}"><label class="md:col-span-2">${locale==="el"?"Τίτλος":"Title"}<input name="eventName" required maxlength="100" value="${esc(event.eventName)}" class="mt-1 w-full rounded-xl border px-4 py-3"></label><label>${locale==="el"?"Έναρξη":"Start date"}<input name="eventStartDate" type="date" required value="${esc(event.event_start_date||"")}" class="mt-1 w-full rounded-xl border px-4 py-3"></label><label>${locale==="el"?"Λήξη":"End date"}<input name="eventEndDate" type="date" value="${esc(event.event_end_date||"")}" class="mt-1 w-full rounded-xl border px-4 py-3"></label><button class="rounded-xl bg-[#654534] py-3 text-white md:col-span-2">${locale==="el"?"Αποθήκευση":"Save changes"}</button></form></section><section class="mt-6 rounded-3xl bg-white p-6 shadow"><div class="grid gap-8 md:grid-cols-2"><div><h2 class="text-3xl">${locale==="el"?"Συνεργάτες":"Collaborators"}</h2><div class="mt-4 space-y-3">${memberRows}${inviteRows}</div></div><div class="rounded-2xl bg-[#f8f3ee] p-5"><h2 class="text-3xl">${locale==="el"?"Πρόσκληση":"Invite people"}</h2><p class="mt-1 text-sm text-[#625750]">${locale==="el"?"Η πρόσκληση δίνει πρόσβαση μόνο σε αυτό το event.":"The invitation only grants access to this event."}</p><form action="/api/account/events/${event.code}/invite" method="post" class="mt-5 space-y-3"><input type="hidden" name="locale" value="${locale}"><input name="email" type="email" required placeholder="name@example.com" class="w-full rounded-xl border bg-white px-4 py-3"><label class="block text-sm">${locale==="el"?"Ρόλος":"Role"}<select name="role" class="mt-1 w-full rounded-xl border bg-white px-4 py-3"><option value="editor">${locale==="el"?"Διαχειριστής — μπορεί να ανεβάζει και να διαχειρίζεται αρχεία":"Manager — can upload and manage media"}</option><option value="viewer">${locale==="el"?"Θεατής — μόνο προβολή και λήψη":"Viewer — view and download only"}</option></select></label><button class="w-full rounded-xl bg-[#654534] py-3 text-white">${locale==="el"?"Αποστολή πρόσκλησης":"Send invitation"}</button></form></div></div></section>${privacyPanel}${removalPanel}</main>${logoutScript(locale)}`));
});

eventRoutes.get("/dashboard/:code/manage-legacy", async (c) => {
  const locale = normalizeLocale(c.req.query("lang") ?? "en");
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text(locale === "el" ? "Το event δεν βρέθηκε." : "Event not found.", 404);
  const token = c.req.query("token") ?? "";
  let allowed = Boolean(token && constantTimeEqual(await sha256(token), event.admin_token_hash));
  const user = await currentUser(c);
  const membership = user ? await getEventRole(c.env.DB, event.id, user.id) : null;
  if (!allowed) allowed = Boolean(membership);
  if (!allowed) return c.text(locale === "el" ? "Δεν έχεις πρόσβαση σε αυτή τη διαχείριση." : "You do not have access to this dashboard.", 403);
  const items = await getMedia(c.env.DB, event.id);
  const canManageMembers = roleCan(membership, "manage_members");
  const members = canManageMembers ? (await c.env.DB.prepare(`SELECT em.user_id,u.name,u.email,em.role,em.created_at FROM event_members em JOIN "user" u ON u.id=em.user_id WHERE em.event_id=? ORDER BY CASE em.role WHEN 'owner' THEN 0 ELSE 1 END, em.created_at`).bind(event.id).all<EventMemberRow>()).results : [];
  const invitations = canManageMembers ? (await c.env.DB.prepare("SELECT id,email,role,created_at,expires_at FROM event_invitations WHERE event_id=? AND accepted_at IS NULL AND expires_at>? ORDER BY created_at DESC").bind(event.id, Date.now()).all<EventInvitationRow>()).results : [];
  const guestUrl = `${new URL(c.req.url).origin}/gallery/${event.code}`;
  const qrSvg = (await QRCode.toString(guestUrl, { type: "svg", width: 256, margin: 1, errorCorrectionLevel: "M" }))
    .replace("<svg", '<svg class="block h-auto w-full max-w-full"');
  const labels = locale === "el" ? {
    title: "Διαχείριση event", code: "Κωδικός", qr: "QR Code καλεσμένων",
    qrHelp: "Οι καλεσμένοι σκανάρουν το QR και ανοίγουν απευθείας το gallery του event.",
    copy: "Αντιγραφή", empty: "Δεν υπάρχουν uploads ακόμη.", gallery: "Gallery", events: "Τα events μου",
    team: "Συνεργάτες", invite: "Πρόσκληση συνεργάτη", inviteHelp: "Ο συνεργάτης θα μπορεί να διαχειρίζεται μόνο αυτό το event.", sendInvite: "Αποστολή πρόσκλησης", pending: "Σε αναμονή", remove: "Αφαίρεση",
    eventDates: "Ημερομηνίες event", startDate: "Έναρξη", endDate: "Λήξη (προαιρετικά)", saveDates: "Αποθήκευση στοιχείων",
  } : {
    title: "Event Dashboard", code: "Event code", qr: "Guest gallery QR code",
    qrHelp: "Guests can scan this QR code to open the event gallery directly.",
    copy: "Copy link", empty: "No uploads yet.", gallery: "Gallery", events: "My Events",
    team: "Collaborators", invite: "Invite a collaborator", inviteHelp: "The collaborator will only be able to manage this event.", sendInvite: "Send invitation", pending: "Pending", remove: "Remove",
    eventDates: "Event dates", startDate: "Start date", endDate: "End date (optional)", saveDates: "Save details",
  };
  const otherLocale = locale === "el" ? "en" : "el";
  const toggleUrl = `/dashboard/${event.code}?lang=${otherLocale}${token ? `&token=${encodeURIComponent(token)}` : ""}`;
  const detailsPanel = canManageMembers ? `<section id="event-details" class="mb-6 rounded-3xl bg-white p-5 shadow-lg sm:p-7"><h2 class="text-2xl">${labels.eventDates}</h2><form action="/api/account/events/${encodeURIComponent(event.code)}/details" method="post" class="mt-4 grid gap-3 md:grid-cols-2"><input type="hidden" name="locale" value="${locale}"><label class="md:col-span-2"><span class="mb-1 block text-sm font-medium">${locale === "el" ? "Όνομα event" : "Event name"}</span><input name="eventName" required maxlength="100" value="${esc(event.eventName)}" class="w-full rounded-xl border px-4 py-3"></label><label><span class="mb-1 block text-sm font-medium">${labels.startDate}</span><input name="eventStartDate" type="date" required value="${esc(event.event_start_date ?? "")}" class="w-full rounded-xl border px-4 py-3"></label><label><span class="mb-1 block text-sm font-medium">${labels.endDate}</span><input name="eventEndDate" type="date" value="${esc(event.event_end_date ?? "")}" class="w-full rounded-xl border px-4 py-3"></label><button class="rounded-xl bg-[#654534] px-5 py-3 font-medium text-white md:col-span-2">${labels.saveDates}</button></form></section>` : "";
  let teamPanel = canManageMembers ? `${detailsPanel}<section class="mb-6 rounded-3xl bg-white p-5 shadow-lg sm:p-7"><div class="grid gap-7 lg:grid-cols-[1fr_1fr]"><div><h2 class="text-2xl">${labels.team}</h2><div class="mt-4 space-y-3">${members.map((member) => `<div class="flex items-center justify-between gap-3 rounded-2xl border p-4"><div class="min-w-0"><p class="truncate font-medium">${esc(member.name)}</p><p class="truncate text-sm text-[#625750]">${esc(member.email)}</p></div>${member.role === "owner" ? `<span class="rounded-full bg-[#eee4dc] px-3 py-1 text-xs">Owner</span>` : `<form action="/api/account/events/${encodeURIComponent(event.code)}/members/remove" method="post"><input type="hidden" name="userId" value="${esc(member.user_id)}"><input type="hidden" name="locale" value="${locale}"><button class="text-sm font-medium text-red-700">${labels.remove}</button></form>`}</div>`).join("")}${invitations.map((invite) => `<div class="flex items-center justify-between gap-3 rounded-2xl border border-dashed p-4"><div class="min-w-0"><p class="truncate">${esc(invite.email)}</p><p class="text-xs text-[#625750]">${labels.pending}</p></div><form action="/api/account/events/${encodeURIComponent(event.code)}/members/remove" method="post"><input type="hidden" name="invitationId" value="${esc(invite.id)}"><input type="hidden" name="locale" value="${locale}"><button class="text-sm font-medium text-red-700">${labels.remove}</button></form></div>`).join("")}</div></div><div class="rounded-2xl bg-[#f8f3ee] p-5"><h2 class="text-2xl">${labels.invite}</h2><p class="mt-1 text-sm text-[#625750]">${labels.inviteHelp}</p><form action="/api/account/events/${encodeURIComponent(event.code)}/invite" method="post" class="mt-5 space-y-3"><input type="hidden" name="locale" value="${locale}"><input name="email" type="email" required maxlength="254" placeholder="name@example.com" class="w-full rounded-xl border bg-white px-4 py-3"><button class="w-full rounded-xl bg-[#654534] px-5 py-3 font-medium text-white">${labels.sendInvite}</button></form></div></div></section>` : "";
  const professionalPanel=canManageMembers?`<section class="mb-6 rounded-3xl bg-[#33251f] p-6 text-white shadow-lg"><p class="text-xs uppercase tracking-[.2em] text-white/60">Memboux Studio</p><div class="mt-2 flex flex-wrap items-center justify-between gap-4"><div><h2 class="text-2xl">${locale==="el"?"Official photographer":"Official photographer"}</h2><p class="mt-1 text-sm text-white/70">${locale==="el"?"Ανάθεσε επαγγελματία για το official album.":"Assign a professional to curate the official album."}</p></div><a href="/dashboard/${event.code}/professional?lang=${locale}" class="rounded-xl bg-white px-5 py-3 text-sm text-[#33251f]">${locale==="el"?"Διαχείριση":"Manage"}</a></div></section>`:"";
  teamPanel+=professionalPanel;
  return c.html(page(`${event.eventName} – ${labels.title}`, `<header class="border-b bg-white"><div class="mx-auto flex max-w-6xl items-center justify-between gap-3 p-4 sm:p-5">${brandMark(`/${locale}`, true)}<div class="flex items-center gap-2"><a href="${toggleUrl}" class="rounded-lg border px-3 py-2 text-sm font-semibold">${otherLocale.toUpperCase()}</a></div></div></header><main class="mx-auto max-w-6xl p-4 sm:p-5 md:p-10"><section class="mb-6 rounded-3xl bg-white p-5 shadow-lg sm:p-7"><p class="text-sm font-semibold uppercase tracking-[.18em] text-[#765440]">${labels.title}</p><h1 class="mt-2 break-words text-3xl font-bold sm:text-4xl">${esc(event.eventName)}</h1><p class="mt-2 text-lg font-medium text-[#654534]">${esc(formatEventDates(event, locale))}</p><p class="mt-3">${labels.code}: <strong class="font-mono text-2xl text-[#654534]">${esc(event.code)}</strong></p><div class="mt-7 grid items-center gap-7 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]"><div class="mx-auto w-full max-w-[220px] overflow-hidden rounded-2xl border bg-white p-3">${qrSvg}</div><div class="min-w-0"><h2 class="text-xl font-bold">${labels.qr}</h2><p class="mt-2 text-sm text-[#625750]">${labels.qrHelp}</p><a href="${esc(guestUrl)}" target="_blank" class="mt-3 block max-w-full break-all text-sm font-semibold text-[#654534]">${esc(guestUrl)}</a><div class="mt-4 flex flex-col gap-2 sm:flex-row"><input id="link" readonly value="${esc(guestUrl)}" class="w-full min-w-0 flex-1 rounded-xl border px-4 py-3"><button id="copy" class="shrink-0 rounded-xl bg-[#4a3329] px-5 py-3 text-white">${labels.copy}</button></div></div></div></section>${teamPanel}<section class="rounded-3xl bg-white p-5 shadow-lg sm:p-7"><div class="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 class="text-2xl font-bold">${labels.gallery} (${items.length})</h2><div class="flex gap-2"><button id="download-selected" class="rounded-lg border px-3 py-2 text-sm">${locale==="el"?"Λήψη επιλεγμένων":"Download selected"}</button><button id="delete-selected" class="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700">${locale==="el"?"Διαγραφή επιλεγμένων":"Delete selected"}</button></div></div><form id="bulk-media" action="/api/account/events/${event.code}/media/bulk-trash" method="post"><input type="hidden" name="locale" value="${locale}"><input type="hidden" id="media-ids" name="ids">${items.length ? `<div class="grid grid-cols-2 gap-4 md:grid-cols-3">${cards(items,{code:event.code,locale,selectable:true,manage:true})}</div>` : `<p class="py-12 text-center text-[#625750]">${labels.empty}</p>`}</form></section></main><script>document.getElementById('copy').onclick=()=>navigator.clipboard.writeText(document.getElementById('link').value);const selected=()=>[...document.querySelectorAll('.media-select:checked')];document.getElementById('download-selected').onclick=()=>selected().forEach((box,i)=>setTimeout(()=>{const a=document.createElement('a');a.href=box.dataset.download;a.download='';a.click()},i*250));document.getElementById('delete-selected').onclick=()=>{const ids=selected().map(x=>x.value);if(!ids.length)return;if(confirm('Move selected media to trash?')){document.getElementById('media-ids').value=ids.join(',');document.getElementById('bulk-media').submit()}}<\/script>`));
});

eventRoutes.post("/api/account/events/:code/privacy",async(c)=>{
  const user=await currentUser(c);if(!user)return c.text("Unauthorized",401);const event=await getEvent(c.env.DB,c.req.param("code"));if(!event)return c.text("Event not found",404);
  if(!roleCan(await getEventRole(c.env.DB,event.id,user.id),"manage_event"))return c.text("Forbidden",403);
  const body=await c.req.parseBody();const locale=normalizeLocale(String(body.locale??event.default_locale));const action=String(body.action??"set");
  if(action==="remove") await c.env.DB.prepare("UPDATE events SET gallery_pin_hash=NULL,updated_at=? WHERE id=?").bind(Date.now(),event.id).run();
  else {const pin=String(body.pin??"");if(!/^\d{4,8}$/.test(pin))return c.text("PIN must contain 4–8 digits",400);await c.env.DB.prepare("UPDATE events SET gallery_pin_hash=?,updated_at=? WHERE id=?").bind(await sha256(pin),Date.now(),event.id).run();}
  return c.redirect(`/dashboard/${event.code}/edit?lang=${locale}`,303);
});

eventRoutes.post("/api/account/events/:code/removal/:requestId/:action{approve|dismiss}", async(c)=>{
  const user=await currentUser(c);if(!user)return c.text("Unauthorized",401);
  const event=await getEvent(c.env.DB,c.req.param("code"));if(!event)return c.text("Event not found",404);
  if(!roleCan(await getEventRole(c.env.DB,event.id,user.id),"manage_event"))return c.text("Forbidden",403);
  const request=await c.env.DB.prepare("SELECT media_id FROM media_removal_requests WHERE id=? AND event_id=? AND status='pending'").bind(c.req.param("requestId"),event.id).first<{media_id:string}>();if(!request)return c.text("Request not found",404);
  const body=await c.req.parseBody();const locale=normalizeLocale(String(body.locale??event.default_locale));const now=Date.now();
  if(c.req.param("action")==="approve") await c.env.DB.batch([c.env.DB.prepare("UPDATE media SET deleted_at=?,purge_at=? WHERE id=? AND event_id=? AND deleted_at IS NULL").bind(now,now+TRASH_RETENTION_MS,request.media_id,event.id),c.env.DB.prepare("UPDATE media_removal_requests SET status='resolved',resolved_at=? WHERE id=?").bind(now,c.req.param("requestId"))]);
  else await c.env.DB.prepare("UPDATE media_removal_requests SET status='dismissed',resolved_at=? WHERE id=?").bind(now,c.req.param("requestId")).run();
  return c.redirect(`/dashboard/${event.code}/edit?lang=${locale}`,303);
});

eventRoutes.post("/api/account/events/:code/details", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if (!roleCan(await getEventRole(c.env.DB, event.id, user.id), "manage_event")) return c.text("Only the event owner can update event details", 403);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  const eventName = String(body.eventName ?? "").trim().slice(0, 100);
  const eventStartDate = validEventDate(body.eventStartDate);
  const eventEndDate = body.eventEndDate ? validEventDate(body.eventEndDate) : eventStartDate;
  if (!eventName || !eventStartDate || !eventEndDate || eventEndDate < eventStartDate) return c.text(locale === "el" ? "Έλεγξε το όνομα και τις ημερομηνίες του event." : "Check the event name and dates.", 400);
  await c.env.DB.prepare("UPDATE events SET eventName=?,event_start_date=?,event_end_date=?,updated_at=? WHERE id=?").bind(eventName, eventStartDate, eventEndDate, Date.now(), event.id).run();
  return c.redirect(`/dashboard/${event.code}/edit?lang=${locale}`, 303);
});

eventRoutes.post("/api/account/events/:code/invite", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if (!roleCan(await getEventRole(c.env.DB, event.id, user.id), "manage_members")) return c.text("Only the event owner can invite collaborators", 403);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 254);
  const role = normalizeInviteRole(body.role);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.text("Invalid email", 400);
  if (email === user.email.toLowerCase()) return c.text(locale === "el" ? "Είσαι ήδη ο ιδιοκτήτης αυτού του event." : "You already own this event.", 400);
  if(!(await canInviteToEvent(c.env.DB,event.id)).allowed)return c.text(locale==="el"?"Έφτασες το όριο συνεργατών του plan σου.":"You reached your plan collaborator limit.",409);
  const existingUser = await c.env.DB.prepare(`SELECT id FROM "user" WHERE lower(email)=lower(?)`).bind(email).first<{ id: string }>();
  if (existingUser) {
    const existingMember = await c.env.DB.prepare("SELECT 1 FROM event_members WHERE event_id=? AND user_id=?").bind(event.id, existingUser.id).first();
    if (existingMember) return c.redirect(`/dashboard/${event.code}/edit?lang=${locale}`, 303);
  }
  const invitationId = crypto.randomUUID();
  const now = Date.now();
  await createOrReplaceInvitation(c.env.DB,{id:invitationId,eventId:event.id,email,role,invitedBy:user.id,createdAt:now,expiresAt:now+14*86400000});
  const accountUrl = `https://memboux.com/${locale}/account`;
  const subject = locale === "el" ? `Πρόσκληση στο event ${event.eventName}` : `Invitation to ${event.eventName}`;
  const roleLabel=locale==="el"?(role==="editor"?"διαχειριστής":"θεατής"):(role==="editor"?"manager":"viewer");
  const text = locale === "el"
    ? `${user.name} σε προσκάλεσε ως ${roleLabel} στο event «${event.eventName}» στο Memboux. Συνδέσου με αυτό το email: ${accountUrl}`
    : `${user.name} invited you as a ${roleLabel} to “${event.eventName}” on Memboux. Sign in with this email: ${accountUrl}`;
  await sendEmail(c.env, {
    to: email,
    subject,
    text,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#2b211d"><h1 style="font-family:Georgia,serif">Memboux</h1><p>${esc(text)}</p><p><a href="${accountUrl}" style="display:inline-block;background:#654534;color:white;padding:12px 20px;border-radius:10px;text-decoration:none">${locale === "el" ? "Αποδοχή πρόσκλησης" : "Accept invitation"}</a></p><p style="color:#625750;font-size:13px">${locale === "el" ? "Η πρόσκληση λήγει σε 14 ημέρες και αφορά μόνο αυτό το event." : "This invitation expires in 14 days and only grants access to this event."}</p></div>`,
  });
  return c.redirect(`/dashboard/${event.code}/edit?lang=${locale}`, 303);
});

eventRoutes.post("/api/account/events/:code/members/remove", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  if (!roleCan(await getEventRole(c.env.DB, event.id, user.id), "manage_members")) return c.text("Only the event owner can remove collaborators", 403);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  const userId = String(body.userId ?? "");
  const invitationId = String(body.invitationId ?? "");
  if (userId) await c.env.DB.prepare("DELETE FROM event_members WHERE event_id=? AND user_id=? AND role!='owner'").bind(event.id, userId).run();
  if (invitationId) await c.env.DB.prepare("DELETE FROM event_invitations WHERE id=? AND event_id=?").bind(invitationId, event.id).run();
  return c.redirect(`/dashboard/${event.code}/edit?lang=${locale}`, 303);
});

