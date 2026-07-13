import { Hono } from "hono";
import { sendEmail } from "./auth";
import { getEventRole, roleCan } from "./access";
import { normalizeLocale, type Locale } from "./i18n";
import { TRASH_RETENTION_MS } from "./config";
import type { Bindings, EventInvitationRow, EventMemberRow, EventRow, MediaRow } from "./domain";
import { getEvent, getMedia, purgeExpiredTrash } from "./repositories";
import { createOrReplaceInvitation, normalizeInviteRole } from "./invitations";
import { accountRoutes } from "./routes/account";
import { adminRoutes } from "./routes/admin";
import { publicRoutes } from "./routes/public";
import { currentUser } from "./session";
import { safeFileExtension, uploadValidationDetails, validateUploadFiles } from "./upload-policy";
import { cookieValue, esc, formatDateTime, formatEventDates, randomCode, sha256, sha256Bytes, validEventDate } from "./utils";
import { cards, galleryFilterControls, galleryFilterScript, lightboxMarkup } from "./views/media";
import { accountMenu, brandMark, logoutScript, page } from "./views/shared";
import QRCode from "qrcode";
import { parse as parseMetadata } from "exifr";

const app = new Hono<{ Bindings: Bindings }>();

app.route("/", publicRoutes);
app.route("/", accountRoutes);
app.route("/", adminRoutes);

const galleryCookieName = (code: string) => `memboux_gallery_${code.toLowerCase()}`;
const galleryAccessToken = (event: EventRow) => sha256(`gallery-access:${event.id}:${event.gallery_pin_hash}`);

app.post("/api/events", async (c) => {
  const data = await c.req.parseBody();
  const eventName = String(data.eventName ?? "").trim().slice(0, 100);
  if (!eventName) return c.text("Συμπλήρωσε το όνομα του event.", 400);
  const id = crypto.randomUUID();
  const token = crypto.randomUUID() + crypto.randomUUID();
  const tokenHash = await sha256(token);
  const now = Date.now();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      await c.env.DB.prepare("INSERT INTO events (id,code,eventName,admin_token_hash,created_at,expires_at) VALUES (?,?,?,?,?,?)").bind(id, code, eventName, tokenHash, now, now + 365 * 86400000).run();
      return c.redirect(`/dashboard/${code}?token=${encodeURIComponent(token)}`, 303);
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }
  return c.text("Δεν ήταν δυνατή η δημιουργία.", 500);
});

function shareIconButtons(guestUrl:string,eventName:string,locale:Locale){
  const shareText=locale==="el"?`Δες και πρόσθεσε στιγμές στο ${eventName}: ${guestUrl}`:`View and add moments to ${eventName}: ${guestUrl}`;
  const text=encodeURIComponent(shareText),url=encodeURIComponent(guestUrl);
  const icon=(body:string)=>`<svg viewBox="0 0 24 24" aria-hidden="true" class="h-5 w-5 fill-current">${body}</svg>`;
  const base="inline-flex h-11 w-11 items-center justify-center rounded-full text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#654534] focus:ring-offset-2";
  return `<div class="mt-5 flex flex-wrap justify-center gap-2">
    <a href="sms:?&body=${text}" class="${base} bg-[#334155] md:hidden" aria-label="Text message" title="Text message">${icon('<path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/>')}</a>
    <a href="viber://forward?text=${text}" class="${base} bg-[#7360f2]" aria-label="Viber" title="Viber">${icon('<path d="M12 2a9 9 0 0 0-7.7 13.7L3 22l6.4-1.5A9 9 0 1 0 12 2Zm4.7 13.2c-.3.8-1.6 1.5-2.3 1.6-.6.1-1.4.2-4.1-.9-3.5-1.5-5.8-5.1-6-5.3-.2-.3-1.4-1.9-1.4-3.6 0-1.7.9-2.6 1.2-2.9.3-.3.7-.4 1-.4h.7c.2 0 .5-.1.8.6l1.1 2.7c.1.3.1.6-.1.9l-.5.8c-.2.3-.4.5-.2.8.2.3.9 1.5 2 2.4 1.4 1.3 2.6 1.7 3 1.9.3.2.6.2.8-.1l1.1-1.3c.3-.3.6-.4.9-.2l2.5 1.2c.4.2.6.3.7.5.1.2.1.8-.2 1.6Z"/>')}</a>
    <a href="https://wa.me/?text=${text}" target="_blank" rel="noopener" class="${base} bg-[#25d366]" aria-label="WhatsApp" title="WhatsApp">${icon('<path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.8 14.1c-.2.7-1.3 1.3-1.9 1.4-.5.1-1.2.2-3.5-.8-3-1.3-4.9-4.3-5.1-4.5-.1-.2-1.2-1.6-1.2-3.1s.8-2.2 1-2.5c.3-.3.6-.3.8-.3h.6c.2 0 .4-.1.7.5l.9 2.3c.1.3.1.5-.1.7l-.4.7c-.2.2-.3.4-.1.7.2.3.8 1.3 1.7 2.1 1.2 1.1 2.2 1.4 2.5 1.6.3.1.5.1.7-.1l.9-1.1c.2-.3.5-.3.8-.2l2.1 1c.3.2.5.3.6.4.1.2.1.7-.1 1.3Z"/>')}</a>
    <button type="button" data-social-share data-title="${esc(eventName)}" data-text="${esc(shareText)}" data-url="${esc(guestUrl)}" onclick="navigator.share?navigator.share({title:this.dataset.title,text:this.dataset.text,url:this.dataset.url}).catch(()=>{}):navigator.clipboard.writeText(this.dataset.text)" class="${base} bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af]" aria-label="Instagram" title="Instagram">${icon('<path fill-rule="evenodd" d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7Zm5 3a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6ZM18.3 5.5a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z"/>')}</button>
    <a href="https://www.facebook.com/sharer/sharer.php?u=${url}" target="_blank" rel="noopener" class="${base} bg-[#1877f2]" aria-label="Facebook" title="Facebook">${icon('<path d="M14 8h3V4.2c-.5-.1-2.2-.2-4.1-.2C9 4 6.3 6.4 6.3 10.8V14H2v4h4.3v10h5.2V18h4.3l.7-4h-5v-2.8C11.5 9.5 12 8 14 8Z" transform="translate(3 -4) scale(.86)"/>')}</a>
    <button type="button" data-social-share data-title="${esc(eventName)}" data-text="${esc(shareText)}" data-url="${esc(guestUrl)}" onclick="navigator.share?navigator.share({title:this.dataset.title,text:this.dataset.text,url:this.dataset.url}).catch(()=>{}):navigator.clipboard.writeText(this.dataset.text)" class="${base} bg-black" aria-label="TikTok" title="TikTok">${icon('<path d="M14 3h3c.3 2 1.5 3.4 4 3.8v3.1a8.2 8.2 0 0 1-4-1.2V15a7 7 0 1 1-6-6.9v3.2a3.8 3.8 0 1 0 3 3.7V3Z"/>')}</button>
  </div>`;
}

app.get("/dashboard/:code", async(c)=>{
  const locale=normalizeLocale(c.req.query("lang")??"en");const event=await getEvent(c.env.DB,c.req.param("code"));if(!event)return c.text(locale==="el"?"Το event δεν βρέθηκε.":"Event not found.",404);
  const user=await currentUser(c);if(!user)return c.redirect(`/${locale}/login`);
  const membership=await getEventRole(c.env.DB,event.id,user.id);if(!membership)return c.text("Forbidden",403);
  const canManageMedia=roleCan(membership,"manage_media");
  const items=await getMedia(c.env.DB,event.id);
  const guestUrl=`${new URL(c.req.url).origin}/gallery/${event.code}`;
  const shareText=locale==="el"?`Δες και πρόσθεσε στιγμές στο ${event.eventName}: ${guestUrl}`:`View and add moments to ${event.eventName}: ${guestUrl}`;
  const qrSvg=(await QRCode.toString(guestUrl,{type:"svg",width:220,margin:1,errorCorrectionLevel:"M"})).replace("<svg",'<svg class="block h-auto w-full max-w-full"');
  const sharePanel=`<section class="mb-7 rounded-3xl bg-white p-5 shadow-lg sm:p-7"><div class="grid items-center gap-6 md:grid-cols-[160px_minmax(0,1fr)]"><div class="mx-auto w-full max-w-[160px] rounded-2xl border bg-white p-3">${qrSvg}</div><div class="min-w-0"><p class="text-xs uppercase tracking-[.2em] text-[#765440]">${locale==="el"?"Κοινοποίηση event":"Share event"}</p><h2 class="mt-1 text-3xl">QR Code & link</h2><a href="${esc(guestUrl)}" target="_blank" class="mt-3 block break-all text-sm text-[#654534]">${esc(guestUrl)}</a><div class="mt-4 flex flex-col gap-2 sm:flex-row"><input id="guest-link" readonly value="${esc(guestUrl)}" class="min-w-0 flex-1 rounded-xl border px-4 py-3"><button id="copy-guest-link" class="rounded-xl bg-[#654534] px-5 py-3 text-white">${locale==="el"?"Αντιγραφή":"Copy link"}</button></div>${shareIconButtons(guestUrl,event.eventName,locale)}${event.gallery_pin_hash?`<p class="mt-3 text-xs text-[#625750]">🔒 ${locale==="el"?"Το gallery προστατεύεται με PIN.":"This gallery is PIN protected."}</p>`:""}</div></div></section>`;
  const ownerSelectionScript=`<script>const ownerSelect=document.getElementById('owner-select-media'),ownerDownload=document.getElementById('owner-download-selected'),ownerDelete=document.getElementById('owner-delete-selected'),ownerSelectors=[...document.querySelectorAll('.media-selector')],ownerSelected=()=>[...document.querySelectorAll('.media-select:checked')];let ownerMode=false;const ownerRefresh=()=>{document.querySelectorAll('.selectable-media').forEach(card=>{const checked=card.querySelector('.media-select')?.checked;card.classList.toggle('ring-4',!!checked);card.classList.toggle('ring-[#8b6250]',!!checked);card.classList.toggle('brightness-75',!!checked);const tick=card.querySelector('.selection-tick');if(tick){tick.classList.toggle('hidden',!checked);tick.classList.toggle('flex',!!checked)}});const count=ownerSelected().length;ownerDownload.textContent=${JSON.stringify(locale==="el"?"Λήψη επιλεγμένων":"Download selected")}+' ('+count+')';if(ownerDelete)ownerDelete.textContent=${JSON.stringify(locale==="el"?"Διαγραφή επιλεγμένων":"Delete selected")}+' ('+count+')'};ownerSelect.onclick=()=>{ownerMode=!ownerMode;ownerSelectors.forEach(x=>x.classList.toggle('hidden',!ownerMode));ownerDownload.classList.toggle('hidden',!ownerMode);if(ownerDelete)ownerDelete.classList.toggle('hidden',!ownerMode);ownerSelect.textContent=ownerMode?${JSON.stringify(locale==="el"?"Ακύρωση":"Cancel")}:${JSON.stringify(locale==="el"?"Επιλογή":"Select")};if(!ownerMode){document.querySelectorAll('.media-select').forEach(x=>x.checked=false);ownerRefresh()}};document.querySelectorAll('.media-select').forEach(x=>x.onchange=ownerRefresh);ownerDownload.onclick=()=>ownerSelected().forEach((box,i)=>setTimeout(()=>{const a=document.createElement('a');a.href=box.dataset.download;a.download='';a.click()},i*250));if(ownerDelete)ownerDelete.onclick=()=>{const ids=ownerSelected().map(x=>x.value);if(ids.length&&confirm(${JSON.stringify(locale==="el"?"Μεταφορά των επιλεγμένων στον κάδο;":"Move selected media to trash?")})){document.getElementById('owner-media-ids').value=ids.join(',');document.getElementById('owner-bulk-media').submit()}}<\/script>`;
  return c.html(page(event.eventName,`<header class="border-b bg-white"><div class="mx-auto flex max-w-6xl items-center justify-between gap-3 p-5">${brandMark(`/${locale}`,true)}${accountMenu(locale,user)}</div></header><main class="mx-auto max-w-6xl p-5 md:p-10"><section class="relative mb-8 text-center">${membership==="owner"?`<details class="absolute right-0 top-0 z-20 text-left"><summary class="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border bg-white text-2xl shadow-sm" aria-label="Event actions">⋯</summary><div class="absolute right-0 mt-1 w-44 rounded-2xl border bg-white p-2 shadow-xl"><a href="/dashboard/${event.code}/edit?lang=${locale}" class="block rounded-xl px-3 py-2 text-sm hover:bg-[#f6f1eb]">${locale==="el"?"Επεξεργασία event":"Edit event"}</a></div></details>`:""}<p class="text-xs uppercase tracking-[.25em] text-[#765440]">Collecting Moments</p><h1 class="mt-3 text-5xl md:text-6xl">${esc(event.eventName)}</h1><p class="mt-3 text-lg text-[#654534]">${esc(formatEventDates(event,locale))}</p></section>${sharePanel}<section class="rounded-3xl bg-white p-5 shadow-lg sm:p-7"><div class="mb-5 flex items-center justify-between"><div><h2 class="text-3xl">Gallery</h2>${galleryFilterControls(items,"owner-gallery",locale)}</div><div class="flex flex-wrap items-center justify-end gap-2"><span class="text-sm text-[#625750]">${items.length} ${locale==="el"?"αρχεία":"items"}</span><button id="owner-select-media" class="rounded-xl border px-3 py-2 text-sm">${locale==="el"?"Επιλογή":"Select"}</button><button id="owner-download-selected" class="hidden rounded-xl bg-[#654534] px-3 py-2 text-sm text-white">${locale==="el"?"Λήψη επιλεγμένων":"Download selected"}</button>${canManageMedia?`<button id="owner-delete-selected" class="hidden rounded-xl border border-red-200 px-3 py-2 text-sm text-red-700">${locale==="el"?"Διαγραφή επιλεγμένων":"Delete selected"}</button>`:""}</div></div><form id="owner-bulk-media" action="/api/account/events/${event.code}/media/bulk-trash" method="post"><input type="hidden" name="locale" value="${locale}"><input id="owner-media-ids" type="hidden" name="ids"></form>${items.length?`<div class="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">${cards(items,{lightbox:true,selectable:true,deferredSelection:true})}</div>`:`<p class="py-16 text-center text-[#625750]">${locale==="el"?"Δεν υπάρχουν φωτογραφίες ακόμη.":"No photos yet."}</p>`}</section></main><script>document.getElementById('copy-guest-link').onclick=()=>navigator.clipboard.writeText(document.getElementById('guest-link').value);document.querySelectorAll('[data-native-share]').forEach(button=>button.onclick=async()=>{if(navigator.share){try{await navigator.share({title:${JSON.stringify(event.eventName)},text:${JSON.stringify(shareText)},url:${JSON.stringify(guestUrl)}});return}catch(error){if(error.name==='AbortError')return}}await navigator.clipboard.writeText(${JSON.stringify(shareText)});alert(${JSON.stringify(locale==="el"?"Το link αντιγράφηκε. Άνοιξε την εφαρμογή και κάνε επικόλληση.":"Link copied. Open the app and paste it.")})<\/script>${ownerSelectionScript}${galleryFilterScript(items,"owner-gallery")}${lightboxMarkup(locale)}${logoutScript(locale)}`));
});

app.get("/dashboard/:code/edit", async(c)=>{
  const locale=normalizeLocale(c.req.query("lang")??"en");const event=await getEvent(c.env.DB,c.req.param("code"));if(!event)return c.text("Event not found",404);const user=await currentUser(c);if(!user)return c.redirect(`/${locale}/login`);
  const owner=await getEventRole(c.env.DB,event.id,user.id);if(!roleCan(owner,"manage_event"))return c.text("Only the event owner can edit this event",403);
  const members=(await c.env.DB.prepare(`SELECT em.user_id,u.name,u.email,em.role,em.created_at FROM event_members em JOIN "user" u ON u.id=em.user_id WHERE em.event_id=? ORDER BY CASE em.role WHEN 'owner' THEN 0 ELSE 1 END,em.created_at`).bind(event.id).all<EventMemberRow>()).results;
  const invitations=(await c.env.DB.prepare("SELECT id,email,role,created_at,expires_at FROM event_invitations WHERE event_id=? AND accepted_at IS NULL AND expires_at>? ORDER BY created_at DESC").bind(event.id,Date.now()).all<EventInvitationRow>()).results;
  const removalRequests=(await c.env.DB.prepare("SELECT rr.id,rr.media_id,rr.requester_email,rr.reason,rr.created_at FROM media_removal_requests rr WHERE rr.event_id=? AND rr.status='pending' ORDER BY rr.created_at DESC").bind(event.id).all<{id:string;media_id:string;requester_email:string;reason:string;created_at:number}>()).results;
  const removalPanel=`<section class="mt-6 rounded-3xl bg-white p-6 shadow"><h2 class="text-3xl">${locale==="el"?"Αιτήματα αφαίρεσης":"Removal requests"} (${removalRequests.length})</h2><div class="mt-4 space-y-3">${removalRequests.map(request=>`<article class="rounded-2xl border p-4"><p class="text-sm text-[#625750]">${esc(request.requester_email)} · ${formatDateTime(request.created_at,locale)}</p><p class="mt-2">${esc(request.reason)}</p><div class="mt-3 flex gap-2"><form action="/api/account/events/${event.code}/removal/${request.id}/approve" method="post"><input type="hidden" name="locale" value="${locale}"><button class="rounded-xl bg-red-700 px-4 py-2 text-sm text-white">${locale==="el"?"Αφαίρεση φωτογραφίας":"Remove photo"}</button></form><form action="/api/account/events/${event.code}/removal/${request.id}/dismiss" method="post"><input type="hidden" name="locale" value="${locale}"><button class="rounded-xl border px-4 py-2 text-sm">${locale==="el"?"Απόρριψη":"Dismiss"}</button></form></div></article>`).join("")||`<p class="text-[#625750]">${locale==="el"?"Δεν υπάρχουν εκκρεμή αιτήματα.":"No pending requests."}</p>`}</div></section>`;
  const privacyPanel=`<section class="mt-6 rounded-3xl bg-white p-6 shadow"><h2 class="text-3xl">${locale==="el"?"Ιδιωτικότητα gallery":"Gallery privacy"}</h2><p class="mt-2 text-[#625750]">${event.gallery_pin_hash?(locale==="el"?"Το gallery προστατεύεται με PIN.":"The gallery is protected by a PIN."):(locale==="el"?"Δεν έχει οριστεί PIN.":"No PIN is currently set.")}</p><form action="/api/account/events/${event.code}/privacy" method="post" class="mt-4 flex flex-col gap-3 sm:flex-row"><input type="hidden" name="locale" value="${locale}"><input name="pin" inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" placeholder="4–8 digit PIN" class="min-w-0 flex-1 rounded-xl border px-4 py-3"><button name="action" value="set" class="rounded-xl bg-[#654534] px-5 py-3 text-white">${locale==="el"?"Ορισμός PIN":"Set PIN"}</button>${event.gallery_pin_hash?`<button name="action" value="remove" class="rounded-xl border border-red-200 px-5 py-3 text-red-700">${locale==="el"?"Αφαίρεση PIN":"Remove PIN"}</button>`:""}</form></section>`;
  const memberRows=members.map(member=>`<div class="flex items-center justify-between gap-3 rounded-2xl border p-4"><div class="min-w-0"><p class="truncate font-medium">${esc(member.name)}</p><p class="truncate text-sm text-[#625750]">${esc(member.email)}</p></div>${member.role==="owner"?`<span class="rounded-full bg-[#eee4dc] px-3 py-1 text-xs">Owner</span>`:`<div class="flex items-center gap-2"><span class="rounded-full bg-[#eee4dc] px-3 py-1 text-xs">${member.role==="editor"?(locale==="el"?"Διαχειριστής":"Manager"):(locale==="el"?"Θεατής":"Viewer")}</span><form action="/api/account/events/${event.code}/members/remove" method="post"><input type="hidden" name="userId" value="${esc(member.user_id)}"><input type="hidden" name="locale" value="${locale}"><button class="text-sm text-red-700">${locale==="el"?"Αφαίρεση":"Remove"}</button></form></div>`}</div>`).join("");
  const inviteRows=invitations.map(invite=>`<div class="flex items-center justify-between gap-3 rounded-2xl border border-dashed p-4"><div class="min-w-0"><p class="truncate">${esc(invite.email)}</p><p class="text-xs text-[#625750]">${locale==="el"?"Σε αναμονή":"Pending"} · ${invite.role==="editor"?(locale==="el"?"Διαχειριστής":"Manager"):(locale==="el"?"Θεατής":"Viewer")}</p></div><form action="/api/account/events/${event.code}/members/remove" method="post"><input type="hidden" name="invitationId" value="${invite.id}"><input type="hidden" name="locale" value="${locale}"><button class="text-sm text-red-700">${locale==="el"?"Ακύρωση":"Cancel"}</button></form></div>`).join("");
  return c.html(page(`${event.eventName} – Edit`,`<header class="border-b bg-white"><div class="mx-auto flex max-w-5xl items-center justify-between p-5">${brandMark(`/${locale}`,true)}${accountMenu(locale,user)}</div></header><main class="mx-auto max-w-5xl p-5 md:p-10"><div><p class="text-xs uppercase tracking-[.2em] text-[#6e4f3e]">Event settings</p><h1 class="text-4xl">${locale==="el"?"Επεξεργασία event":"Edit event"}</h1></div><section class="mt-6 rounded-3xl bg-white p-6 shadow"><h2 class="text-3xl">${locale==="el"?"Τίτλος και ημερομηνίες":"Title and dates"}</h2><form action="/api/account/events/${event.code}/details" method="post" class="mt-5 grid gap-4 md:grid-cols-2"><input type="hidden" name="locale" value="${locale}"><label class="md:col-span-2">${locale==="el"?"Τίτλος":"Title"}<input name="eventName" required maxlength="100" value="${esc(event.eventName)}" class="mt-1 w-full rounded-xl border px-4 py-3"></label><label>${locale==="el"?"Έναρξη":"Start date"}<input name="eventStartDate" type="date" required value="${esc(event.event_start_date||"")}" class="mt-1 w-full rounded-xl border px-4 py-3"></label><label>${locale==="el"?"Λήξη":"End date"}<input name="eventEndDate" type="date" value="${esc(event.event_end_date||"")}" class="mt-1 w-full rounded-xl border px-4 py-3"></label><button class="rounded-xl bg-[#654534] py-3 text-white md:col-span-2">${locale==="el"?"Αποθήκευση":"Save changes"}</button></form></section><section class="mt-6 rounded-3xl bg-white p-6 shadow"><div class="grid gap-8 md:grid-cols-2"><div><h2 class="text-3xl">${locale==="el"?"Συνεργάτες":"Collaborators"}</h2><div class="mt-4 space-y-3">${memberRows}${inviteRows}</div></div><div class="rounded-2xl bg-[#f8f3ee] p-5"><h2 class="text-3xl">${locale==="el"?"Πρόσκληση":"Invite people"}</h2><p class="mt-1 text-sm text-[#625750]">${locale==="el"?"Η πρόσκληση δίνει πρόσβαση μόνο σε αυτό το event.":"The invitation only grants access to this event."}</p><form action="/api/account/events/${event.code}/invite" method="post" class="mt-5 space-y-3"><input type="hidden" name="locale" value="${locale}"><input name="email" type="email" required placeholder="name@example.com" class="w-full rounded-xl border bg-white px-4 py-3"><label class="block text-sm">${locale==="el"?"Ρόλος":"Role"}<select name="role" class="mt-1 w-full rounded-xl border bg-white px-4 py-3"><option value="editor">${locale==="el"?"Διαχειριστής — μπορεί να ανεβάζει και να διαχειρίζεται αρχεία":"Manager — can upload and manage media"}</option><option value="viewer">${locale==="el"?"Θεατής — μόνο προβολή και λήψη":"Viewer — view and download only"}</option></select></label><button class="w-full rounded-xl bg-[#654534] py-3 text-white">${locale==="el"?"Αποστολή πρόσκλησης":"Send invitation"}</button></form></div></div></section>${privacyPanel}${removalPanel}</main>${logoutScript(locale)}`));
});

app.get("/dashboard/:code/manage-legacy", async (c) => {
  const locale = normalizeLocale(c.req.query("lang") ?? "en");
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text(locale === "el" ? "Το event δεν βρέθηκε." : "Event not found.", 404);
  const token = c.req.query("token") ?? "";
  let allowed = Boolean(token && await sha256(token) === event.admin_token_hash);
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
  const teamPanel = canManageMembers ? `${detailsPanel}<section class="mb-6 rounded-3xl bg-white p-5 shadow-lg sm:p-7"><div class="grid gap-7 lg:grid-cols-[1fr_1fr]"><div><h2 class="text-2xl">${labels.team}</h2><div class="mt-4 space-y-3">${members.map((member) => `<div class="flex items-center justify-between gap-3 rounded-2xl border p-4"><div class="min-w-0"><p class="truncate font-medium">${esc(member.name)}</p><p class="truncate text-sm text-[#625750]">${esc(member.email)}</p></div>${member.role === "owner" ? `<span class="rounded-full bg-[#eee4dc] px-3 py-1 text-xs">Owner</span>` : `<form action="/api/account/events/${encodeURIComponent(event.code)}/members/remove" method="post"><input type="hidden" name="userId" value="${esc(member.user_id)}"><input type="hidden" name="locale" value="${locale}"><button class="text-sm font-medium text-red-700">${labels.remove}</button></form>`}</div>`).join("")}${invitations.map((invite) => `<div class="flex items-center justify-between gap-3 rounded-2xl border border-dashed p-4"><div class="min-w-0"><p class="truncate">${esc(invite.email)}</p><p class="text-xs text-[#625750]">${labels.pending}</p></div><form action="/api/account/events/${encodeURIComponent(event.code)}/members/remove" method="post"><input type="hidden" name="invitationId" value="${esc(invite.id)}"><input type="hidden" name="locale" value="${locale}"><button class="text-sm font-medium text-red-700">${labels.remove}</button></form></div>`).join("")}</div></div><div class="rounded-2xl bg-[#f8f3ee] p-5"><h2 class="text-2xl">${labels.invite}</h2><p class="mt-1 text-sm text-[#625750]">${labels.inviteHelp}</p><form action="/api/account/events/${encodeURIComponent(event.code)}/invite" method="post" class="mt-5 space-y-3"><input type="hidden" name="locale" value="${locale}"><input name="email" type="email" required maxlength="254" placeholder="name@example.com" class="w-full rounded-xl border bg-white px-4 py-3"><button class="w-full rounded-xl bg-[#654534] px-5 py-3 font-medium text-white">${labels.sendInvite}</button></form></div></div></section>` : "";
  return c.html(page(`${event.eventName} – ${labels.title}`, `<header class="border-b bg-white"><div class="mx-auto flex max-w-6xl items-center justify-between gap-3 p-4 sm:p-5">${brandMark(`/${locale}`, true)}<div class="flex items-center gap-2"><a href="/${locale}/account" class="rounded-lg bg-[#654534] px-3 py-2 text-sm font-semibold text-white sm:px-4">← ${labels.events}</a><a href="${toggleUrl}" class="rounded-lg border px-3 py-2 text-sm font-semibold">${otherLocale.toUpperCase()}</a></div></div></header><main class="mx-auto max-w-6xl p-4 sm:p-5 md:p-10"><section class="mb-6 rounded-3xl bg-white p-5 shadow-lg sm:p-7"><p class="text-sm font-semibold uppercase tracking-[.18em] text-[#765440]">${labels.title}</p><h1 class="mt-2 break-words text-3xl font-bold sm:text-4xl">${esc(event.eventName)}</h1><p class="mt-2 text-lg font-medium text-[#654534]">${esc(formatEventDates(event, locale))}</p><p class="mt-3">${labels.code}: <strong class="font-mono text-2xl text-[#654534]">${esc(event.code)}</strong></p><div class="mt-7 grid items-center gap-7 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]"><div class="mx-auto w-full max-w-[220px] overflow-hidden rounded-2xl border bg-white p-3">${qrSvg}</div><div class="min-w-0"><h2 class="text-xl font-bold">${labels.qr}</h2><p class="mt-2 text-sm text-[#625750]">${labels.qrHelp}</p><a href="${esc(guestUrl)}" target="_blank" class="mt-3 block max-w-full break-all text-sm font-semibold text-[#654534]">${esc(guestUrl)}</a><div class="mt-4 flex flex-col gap-2 sm:flex-row"><input id="link" readonly value="${esc(guestUrl)}" class="w-full min-w-0 flex-1 rounded-xl border px-4 py-3"><button id="copy" class="shrink-0 rounded-xl bg-[#4a3329] px-5 py-3 text-white">${labels.copy}</button></div></div></div></section>${teamPanel}<section class="rounded-3xl bg-white p-5 shadow-lg sm:p-7"><div class="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 class="text-2xl font-bold">${labels.gallery} (${items.length})</h2><div class="flex gap-2"><button id="download-selected" class="rounded-lg border px-3 py-2 text-sm">${locale==="el"?"Λήψη επιλεγμένων":"Download selected"}</button><button id="delete-selected" class="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700">${locale==="el"?"Διαγραφή επιλεγμένων":"Delete selected"}</button></div></div><form id="bulk-media" action="/api/account/events/${event.code}/media/bulk-trash" method="post"><input type="hidden" name="locale" value="${locale}"><input type="hidden" id="media-ids" name="ids">${items.length ? `<div class="grid grid-cols-2 gap-4 md:grid-cols-3">${cards(items,{code:event.code,locale,selectable:true,manage:true})}</div>` : `<p class="py-12 text-center text-[#625750]">${labels.empty}</p>`}</form></section></main><script>document.getElementById('copy').onclick=()=>navigator.clipboard.writeText(document.getElementById('link').value);const selected=()=>[...document.querySelectorAll('.media-select:checked')];document.getElementById('download-selected').onclick=()=>selected().forEach((box,i)=>setTimeout(()=>{const a=document.createElement('a');a.href=box.dataset.download;a.download='';a.click()},i*250));document.getElementById('delete-selected').onclick=()=>{const ids=selected().map(x=>x.value);if(!ids.length)return;if(confirm('Move selected media to trash?')){document.getElementById('media-ids').value=ids.join(',');document.getElementById('bulk-media').submit()}}<\/script>`));
});

app.post("/api/account/events/:code/privacy",async(c)=>{
  const user=await currentUser(c);if(!user)return c.text("Unauthorized",401);const event=await getEvent(c.env.DB,c.req.param("code"));if(!event)return c.text("Event not found",404);
  if(!roleCan(await getEventRole(c.env.DB,event.id,user.id),"manage_event"))return c.text("Forbidden",403);
  const body=await c.req.parseBody();const locale=normalizeLocale(String(body.locale??event.default_locale));const action=String(body.action??"set");
  if(action==="remove") await c.env.DB.prepare("UPDATE events SET gallery_pin_hash=NULL,updated_at=? WHERE id=?").bind(Date.now(),event.id).run();
  else {const pin=String(body.pin??"");if(!/^\d{4,8}$/.test(pin))return c.text("PIN must contain 4–8 digits",400);await c.env.DB.prepare("UPDATE events SET gallery_pin_hash=?,updated_at=? WHERE id=?").bind(await sha256(pin),Date.now(),event.id).run();}
  return c.redirect(`/dashboard/${event.code}/edit?lang=${locale}`,303);
});

app.post("/api/account/events/:code/removal/:requestId/:action{approve|dismiss}", async(c)=>{
  const user=await currentUser(c);if(!user)return c.text("Unauthorized",401);
  const event=await getEvent(c.env.DB,c.req.param("code"));if(!event)return c.text("Event not found",404);
  if(!roleCan(await getEventRole(c.env.DB,event.id,user.id),"manage_event"))return c.text("Forbidden",403);
  const request=await c.env.DB.prepare("SELECT media_id FROM media_removal_requests WHERE id=? AND event_id=? AND status='pending'").bind(c.req.param("requestId"),event.id).first<{media_id:string}>();if(!request)return c.text("Request not found",404);
  const body=await c.req.parseBody();const locale=normalizeLocale(String(body.locale??event.default_locale));const now=Date.now();
  if(c.req.param("action")==="approve") await c.env.DB.batch([c.env.DB.prepare("UPDATE media SET deleted_at=?,purge_at=? WHERE id=? AND event_id=? AND deleted_at IS NULL").bind(now,now+TRASH_RETENTION_MS,request.media_id,event.id),c.env.DB.prepare("UPDATE media_removal_requests SET status='resolved',resolved_at=? WHERE id=?").bind(now,c.req.param("requestId"))]);
  else await c.env.DB.prepare("UPDATE media_removal_requests SET status='dismissed',resolved_at=? WHERE id=?").bind(now,c.req.param("requestId")).run();
  return c.redirect(`/dashboard/${event.code}/edit?lang=${locale}`,303);
});

app.post("/api/account/events/:code/details", async (c) => {
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

app.post("/api/account/events/:code/invite", async (c) => {
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

app.post("/api/account/events/:code/members/remove", async (c) => {
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

app.get("/dashboard/:code/media/:id", async(c)=>{
  const locale=normalizeLocale(c.req.query("lang")??"en"); const user=await currentUser(c); if(!user) return c.redirect(`/${locale}/login`);
  const event=await getEvent(c.env.DB,c.req.param("code")); if(!event) return c.text("Event not found",404);
  if(!roleCan(await getEventRole(c.env.DB,event.id,user.id),"view"))return c.text("Forbidden",403);
  const media=await c.env.DB.prepare("SELECT * FROM media WHERE id=? AND event_id=? AND deleted_at IS NULL").bind(c.req.param("id"),event.id).first<MediaRow>(); if(!media) return c.text("Media not found",404);
  const preview=media.media_type==="image"?`<img src="/media/${media.id}" class="max-h-[70vh] w-full rounded-2xl object-contain bg-black">`:`<video src="/media/${media.id}" controls class="max-h-[70vh] w-full rounded-2xl bg-black"></video>`;
  const chronologicalDate=media.captured_at??media.uploaded_at;
  return c.html(page(event.eventName,`<header class="border-b bg-white"><div class="mx-auto flex max-w-5xl items-center justify-between p-5">${brandMark(`/${locale}`,true)}${accountMenu(locale,user)}</div></header><main class="mx-auto max-w-5xl p-5 md:p-10"><a href="/dashboard/${event.code}?lang=${locale}" class="text-sm text-[#654534]">← ${locale==="el"?"Πίσω στο event":"Back to event"}</a><div class="mt-5 grid gap-6 lg:grid-cols-[1fr_320px]"><div>${preview}</div><aside class="rounded-2xl bg-white p-5 shadow"><p class="text-sm text-[#625750]">${locale==="el"?"Ημερομηνία":"Date"}: ${formatDateTime(chronologicalDate,locale)}</p><a href="/media/${media.id}?download=1" class="mt-5 block rounded-xl bg-[#654534] px-4 py-3 text-center text-white">↓ ${locale==="el"?"Λήψη":"Download"}</a><form action="/api/account/events/${event.code}/media/${media.id}/trash" method="post" class="mt-3" onsubmit="return confirm('Move this media to trash?')"><input type="hidden" name="locale" value="${locale}"><button class="w-full rounded-xl border border-red-200 px-4 py-3 text-red-700">${locale==="el"?"Μεταφορά στον κάδο":"Move to trash"}</button></form></aside></div></main>${lightboxMarkup(locale)}${logoutScript(locale)}`));
});

app.post("/api/account/events/:code/media/:id/rename", async(c)=>{
  const user=await currentUser(c);if(!user)return c.text("Unauthorized",401);const event=await getEvent(c.env.DB,c.req.param("code"));if(!event)return c.text("Event not found",404);
  if(!roleCan(await getEventRole(c.env.DB,event.id,user.id),"manage_media"))return c.text("Forbidden",403);
  const body=await c.req.parseBody();const locale=normalizeLocale(String(body.locale??event.default_locale));const title=String(body.title??"").trim().slice(0,120);if(!title)return c.text("Missing title",400);
  await c.env.DB.prepare("UPDATE media SET title=? WHERE id=? AND event_id=? AND deleted_at IS NULL").bind(title,c.req.param("id"),event.id).run();return c.redirect(`/dashboard/${event.code}/media/${c.req.param("id")}?lang=${locale}`,303);
});

app.post("/api/account/events/:code/media/:id/trash", async(c)=>{
  const user=await currentUser(c);if(!user)return c.text("Unauthorized",401);const event=await getEvent(c.env.DB,c.req.param("code"));if(!event)return c.text("Event not found",404);
  if(!roleCan(await getEventRole(c.env.DB,event.id,user.id),"manage_media"))return c.text("Forbidden",403);
  const body=await c.req.parseBody();const locale=normalizeLocale(String(body.locale??event.default_locale));const now=Date.now();await c.env.DB.prepare("UPDATE media SET deleted_at=?,purge_at=? WHERE id=? AND event_id=?").bind(now,now+TRASH_RETENTION_MS,c.req.param("id"),event.id).run();return c.redirect(`/dashboard/${event.code}?lang=${locale}`,303);
});

app.post("/api/account/events/:code/media/bulk-trash", async(c)=>{
  const user=await currentUser(c);if(!user)return c.text("Unauthorized",401);const event=await getEvent(c.env.DB,c.req.param("code"));if(!event)return c.text("Event not found",404);
  if(!roleCan(await getEventRole(c.env.DB,event.id,user.id),"manage_media"))return c.text("Forbidden",403);
  const body=await c.req.parseBody();const locale=normalizeLocale(String(body.locale??event.default_locale));const ids=String(body.ids??"").split(",").filter(id=>/^[a-f0-9-]{36}$/i.test(id)).slice(0,100);const now=Date.now();if(ids.length)await c.env.DB.batch(ids.map(id=>c.env.DB.prepare("UPDATE media SET deleted_at=?,purge_at=? WHERE id=? AND event_id=? AND deleted_at IS NULL").bind(now,now+TRASH_RETENTION_MS,id,event.id)));return c.redirect(`/dashboard/${event.code}?lang=${locale}`,303);
});

app.post("/api/account/events/:code/media/:id/restore", async(c)=>{
  const user=await currentUser(c);if(!user)return c.text("Unauthorized",401);const event=await getEvent(c.env.DB,c.req.param("code"),true);if(!event)return c.text("Event not found",404);
  if(!roleCan(await getEventRole(c.env.DB,event.id,user.id),"manage_media"))return c.text("Forbidden",403);
  const body=await c.req.parseBody();const locale=normalizeLocale(String(body.locale??event.default_locale));await c.env.DB.prepare("UPDATE media SET deleted_at=NULL,purge_at=NULL WHERE id=? AND event_id=?").bind(c.req.param("id"),event.id).run();return c.redirect(`/${locale}/trash`,303);
});

app.get("/dashboard-legacy/:code", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Η εκδήλωση δεν βρέθηκε.", 404);
  const token = c.req.query("token") ?? "";
  let allowed = Boolean(token && await sha256(token) === event.admin_token_hash);
  if (!allowed) {
    const user = await currentUser(c);
    if (user) allowed = roleCan(await getEventRole(c.env.DB,event.id,user.id),"view");
  }
  if (!allowed) return c.text("Δεν έχεις πρόσβαση σε αυτή τη διαχείριση.", 403);
  const items = await getMedia(c.env.DB, event.id);
  const guestUrl = `${new URL(c.req.url).origin}/gallery/${event.code}`;
  const qrSvg = (await QRCode.toString(guestUrl, { type: "svg", width: 256, margin: 1, errorCorrectionLevel: "M" }))
    .replace("<svg", '<svg class="block h-auto w-full max-w-full"');
  return c.html(page(`${event.eventName} – Διαχείριση`, `<main class="mx-auto max-w-6xl p-4 sm:p-5 md:p-10"><section class="mb-6 rounded-3xl bg-white p-5 shadow-lg sm:p-7"><p class="text-sm font-semibold text-[#765440]">ΙΔΙΩΤΙΚΗ ΔΙΑΧΕΙΡΙΣΗ</p><h1 class="mt-2 break-words text-3xl font-bold sm:text-4xl">${esc(event.eventName)}</h1><p class="mt-3">Κωδικός: <strong class="font-mono text-2xl text-[#6e4f3e]">${esc(event.code)}</strong></p><div class="mt-7 grid items-center gap-7 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]"><div class="mx-auto w-full max-w-[220px] overflow-hidden rounded-2xl border bg-white p-3">${qrSvg}</div><div class="min-w-0"><h2 class="text-xl font-bold">QR Code καλεσμένων</h2><p class="mt-2 text-sm text-[#625750]">Οι καλεσμένοι σκανάρουν το QR και ανοίγουν απευθείας το gallery του event.</p><a href="${esc(guestUrl)}" target="_blank" class="mt-3 block max-w-full break-all text-sm font-semibold text-[#6e4f3e]">${esc(guestUrl)}</a><div class="mt-4 flex flex-col gap-2 sm:flex-row"><input id="link" readonly value="${esc(guestUrl)}" class="w-full min-w-0 flex-1 rounded-xl border px-4 py-3"><button id="copy" class="shrink-0 rounded-xl bg-[#4a3329] px-5 py-3 text-white">Αντιγραφή</button></div></div></div></section><section class="rounded-3xl bg-white p-5 shadow-lg sm:p-7"><h2 class="mb-5 text-2xl font-bold">Gallery (${items.length})</h2>${items.length ? `<div class="grid grid-cols-2 gap-4 md:grid-cols-3">${cards(items)}</div>` : `<p class="py-12 text-center text-[#625750]">Δεν υπάρχουν uploads ακόμη.</p>`}</section></main><script>document.getElementById('copy').onclick=()=>navigator.clipboard.writeText(document.getElementById('link').value)<\/script>`));
});

app.post("/gallery/:code/unlock",async(c)=>{
  const event=await getEvent(c.env.DB,c.req.param("code"));if(!event)return c.text("Event not found",404);const body=await c.req.parseBody();const locale=normalizeLocale(String(body.locale??event.default_locale));if(!event.gallery_pin_hash)return c.redirect(`/gallery/${event.code}?lang=${locale}`,303);
  if(await sha256(String(body.pin??""))!==event.gallery_pin_hash)return c.text(locale==="el"?"Λάθος PIN":"Incorrect PIN",401);
  const token=await galleryAccessToken(event);return new Response(null,{status:303,headers:{Location:`/gallery/${event.code}?lang=${locale}`,"Set-Cookie":`${galleryCookieName(event.code)}=${token}; Path=/gallery/${event.code}; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`}});
});

app.get("/gallery/:code", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Η εκδήλωση δεν βρέθηκε.", 404);
  const locale=normalizeLocale(c.req.query("lang")??event.default_locale);const otherLocale=locale==="el"?"en":"el";
  const guestUrl=`${new URL(c.req.url).origin}/gallery/${event.code}`;
  if (Date.now() > event.expires_at) return c.text("Η εκδήλωση έχει λήξει.", 410);
  if(event.gallery_pin_hash && cookieValue(c.req.raw,galleryCookieName(event.code))!==await galleryAccessToken(event)) return c.html(page(event.eventName,`<main class="flex min-h-screen items-center justify-center p-5"><section class="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl"><div class="flex items-center justify-between">${brandMark("/",true)}<a href="/gallery/${event.code}?lang=${otherLocale}" class="rounded-xl border px-3 py-2 text-sm">${otherLocale.toUpperCase()}</a></div><h1 class="mt-7 text-4xl">${locale==="el"?"Ιδιωτική gallery":"Private gallery"}</h1><p class="mt-2 text-[#625750]">${locale==="el"?"Βάλε το PIN του event για να δεις τη gallery και να ανεβάσεις φωτογραφίες ή βίντεο.":"Enter the event PIN to view the gallery and upload photos or videos."}</p><form action="/gallery/${encodeURIComponent(event.code)}/unlock" method="post" class="mt-6 space-y-3"><input type="hidden" name="locale" value="${locale}"><input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" required autofocus placeholder="PIN" class="w-full rounded-xl border px-4 py-3 text-center text-xl tracking-[.3em]"><button class="w-full rounded-xl bg-[#654534] px-5 py-3 text-white">${locale==="el"?"Άνοιγμα gallery":"Open gallery"}</button></form></section></main>`),401);
  const items = await getMedia(c.env.DB, event.id);
  return c.html(page(`${event.eventName} – Gallery`, `<main class="mx-auto max-w-6xl p-5 md:p-10"><section class="mb-6 rounded-3xl bg-white p-7 text-center shadow-lg"><div class="mb-4 flex items-center justify-between">${brandMark("/", true)}<a href="/gallery/${event.code}?lang=${otherLocale}" class="rounded-xl border px-3 py-2 text-sm">${otherLocale.toUpperCase()}</a></div><h1 class="mt-2 text-4xl font-bold">${esc(event.eventName)}</h1><p class="mt-2 font-medium text-[#654534]">${esc(formatEventDates(event,locale))}</p><p class="mt-2 text-[#625750]">${locale==="el"?"Μοιράσου τις αγαπημένες σου στιγμές":"Share your favorite moments"}</p>${shareIconButtons(guestUrl,event.eventName,locale)}<form action="/api/upload/${event.code}" method="post" enctype="multipart/form-data" class="gallery-upload mx-auto mt-7 max-w-xl space-y-3 text-left"><input type="hidden" name="locale" value="${locale}"><input name="name" maxlength="60" placeholder="${locale==="el"?"Το όνομά σου":"Your name"}" class="w-full rounded-xl border px-4 py-3"><input name="file" required multiple type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" class="w-full rounded-xl border p-3"><p class="text-xs text-[#625750]">${locale==="el"?"Επίλεξε έως 20 φωτογραφίες ή βίντεο μαζί · έως 20 MB ανά αρχείο και 80 MB συνολικά.":"Select up to 20 photos or videos · 20 MB per file and 80 MB total."}</p><div class="rounded-2xl bg-[#f6f1eb] p-4 text-sm text-[#51453f]"><p>${locale==="el"?"Το περιεχόμενο θα αποθηκευτεί στην ιδιωτική συλλογή αυτού του event. Μπορείς να ζητήσεις αφαίρεση οποιαδήποτε στιγμή.":"Your content will be stored in this event’s private gallery. You can request removal at any time."}</p><label class="mt-3 flex items-start gap-3"><input name="upload_confirmation" value="accepted" required type="checkbox" class="mt-1 h-4 w-4 shrink-0"><span>${locale==="el"?"Επιβεβαιώνω ότι έχω δικαίωμα να ανεβάσω αυτό το περιεχόμενο και ότι δεν παραβιάζει παράνομα την ιδιωτικότητα ή τα δικαιώματα άλλων.":"I confirm that I am entitled to upload this content and that it does not unlawfully infringe the privacy or rights of others."}</span></label></div><button class="w-full rounded-xl bg-gradient-to-r from-[#8b6250] to-[#654534] py-3 font-semibold text-white">${locale==="el"?"Ανέβασμα":"Upload"}</button></form></section><section class="rounded-3xl bg-white p-7 shadow-lg"><div class="mb-5 flex items-center justify-between gap-3"><div><h2 class="text-2xl font-bold">Gallery (${items.length})</h2>${galleryFilterControls(items,"guest-gallery",locale)}</div><div class="flex gap-2"><button id="select-media" class="rounded-xl border px-4 py-2 text-sm">${locale==="el"?"Επιλογή":"Select"}</button><button id="download-selected" class="hidden rounded-xl bg-[#654534] px-4 py-2 text-sm text-white">${locale==="el"?"Λήψη επιλεγμένων":"Download selected"}</button></div></div>${items.length ? `<div class="grid grid-cols-2 gap-4 md:grid-cols-3">${cards(items,{selectable:true,deferredSelection:true,lightbox:true,reportCode:event.code,locale})}</div>` : `<p class="py-12 text-center text-[#625750]">${locale==="el"?"Γίνε ο πρώτος που θα ανεβάσει μια στιγμή!":"Be the first to upload a moment!"}</p>`}</section></main>${galleryFilterScript(items,"guest-gallery")}${lightboxMarkup(locale)}<script>const selectButton=document.getElementById('select-media'),downloadButton=document.getElementById('download-selected'),selectors=[...document.querySelectorAll('.media-selector')],selected=()=>[...document.querySelectorAll('.media-select:checked')];let selectionMode=false;const refreshSelection=()=>{document.querySelectorAll('.selectable-media').forEach(card=>{const checked=card.querySelector('.media-select')?.checked;card.classList.toggle('ring-4',!!checked);card.classList.toggle('ring-[#8b6250]',!!checked);card.classList.toggle('brightness-75',!!checked);const tick=card.querySelector('.selection-tick');if(tick){tick.classList.toggle('hidden',!checked);tick.classList.toggle('flex',!!checked)}});downloadButton.textContent=${JSON.stringify(locale==="el"?"Λήψη επιλεγμένων":"Download selected")}+' ('+selected().length+')'};selectButton.onclick=()=>{selectionMode=!selectionMode;selectors.forEach(selector=>selector.classList.toggle('hidden',!selectionMode));downloadButton.classList.toggle('hidden',!selectionMode);selectButton.textContent=selectionMode?${JSON.stringify(locale==="el"?"Ακύρωση":"Cancel")}:${JSON.stringify(locale==="el"?"Επιλογή":"Select")};if(!selectionMode){document.querySelectorAll('.media-select').forEach(box=>box.checked=false);refreshSelection()}};document.querySelectorAll('.media-select').forEach(box=>box.onchange=refreshSelection);downloadButton.onclick=()=>selected().forEach((box,i)=>setTimeout(()=>{const a=document.createElement('a');a.href=box.dataset.download;a.download='';a.click()},i*250))<\/script>`));
});

app.get("/gallery/:code/removal/:mediaId", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  const media = await c.env.DB.prepare("SELECT id FROM media WHERE id=? AND event_id=? AND deleted_at IS NULL").bind(c.req.param("mediaId"), event.id).first();
  if (!media) return c.text("Media not found", 404);
  return c.html(page("Request removal", `<main class="mx-auto flex min-h-screen max-w-xl items-center p-5"><section class="w-full rounded-3xl bg-white p-7 shadow-xl">${brandMark("/",true)}<p class="mt-7 text-xs uppercase tracking-[.2em] text-[#6e4f3e]">Privacy request</p><h1 class="mt-2 text-4xl">Request photo removal</h1><p class="mt-3 text-[#625750]">Use this form if you appear in this content or believe it infringes your privacy or rights. The event owner will receive the request for review.</p><form action="/gallery/${encodeURIComponent(event.code)}/removal/${encodeURIComponent(c.req.param("mediaId"))}" method="post" class="mt-6 space-y-4"><label class="block">Email<input name="email" type="email" required maxlength="254" class="mt-1 w-full rounded-xl border px-4 py-3"></label><label class="block">Reason<textarea name="reason" required minlength="10" maxlength="1000" rows="5" class="mt-1 w-full rounded-xl border px-4 py-3"></textarea></label><button class="w-full rounded-xl bg-[#654534] px-5 py-3 text-white">Submit removal request</button></form></section></main>`));
});

app.post("/gallery/:code/removal/:mediaId", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  const media = await c.env.DB.prepare("SELECT id FROM media WHERE id=? AND event_id=? AND deleted_at IS NULL").bind(c.req.param("mediaId"), event.id).first();
  if (!media) return c.text("Media not found", 404);
  const body = await c.req.parseBody();
  const email = String(body.email ?? "").trim().toLowerCase().slice(0,254);
  const reason = String(body.reason ?? "").trim().slice(0,1000);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || reason.length < 10) return c.text("Check your email and reason.",400);
  const reportedAt=Date.now();
  await c.env.DB.batch([c.env.DB.prepare("INSERT INTO media_removal_requests (id,media_id,event_id,requester_email,reason,status,created_at) VALUES (?,?,?,?,?,'pending',?)").bind(crypto.randomUUID(),c.req.param("mediaId"),event.id,email,reason,reportedAt),c.env.DB.prepare("UPDATE media SET reported_at=? WHERE id=? AND event_id=? AND deleted_at IS NULL").bind(reportedAt,c.req.param("mediaId"),event.id)]);
  return c.html(page("Request received", `<main class="flex min-h-screen items-center justify-center p-5"><section class="max-w-lg rounded-3xl bg-white p-8 text-center shadow-xl"><h1 class="text-4xl">Request received</h1><p class="mt-3 text-[#625750]">Your removal request was recorded and will be reviewed by the event owner.</p><a href="/gallery/${encodeURIComponent(event.code)}" class="mt-6 inline-block rounded-xl bg-[#654534] px-5 py-3 text-white">Back to gallery</a></section></main>`));
});

app.post("/api/upload/:code", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Η εκδήλωση δεν βρέθηκε.", 404);
  if (Date.now() > event.expires_at) return c.text("Η εκδήλωση έχει λήξει.", 410);
  if(event.gallery_pin_hash && cookieValue(c.req.raw,galleryCookieName(event.code))!==await galleryAccessToken(event)) return c.text("Gallery PIN required",401);
  const form = await c.req.formData();
  const locale=normalizeLocale(String(form.get("locale")??event.default_locale));
  if (form.get("upload_confirmation") !== "accepted") return c.text("Απαιτείται επιβεβαίωση πριν από το upload.", 400);
  const uploadedBy = String(form.get("name") ?? "Ανώνυμος").trim().slice(0, 60) || "Ανώνυμος";
  const files=form.getAll("file").filter((value):value is File=>value instanceof File&&value.size>0);
  const validationError=validateUploadFiles(files);
  if(validationError){const detail=uploadValidationDetails(validationError,locale);return new Response(detail.message,{status:detail.status});}
  const uploadedKeys:string[]=[];
  try{
    for(const file of files){
      const id=crypto.randomUUID();
      const extension=safeFileExtension(file.name);
      const objectKey=`${event.id}/${id}.${extension}`;
      const bytes=await file.arrayBuffer();const contentHash=await sha256Bytes(bytes);if(await c.env.DB.prepare("SELECT 1 FROM media WHERE event_id=? AND content_hash=? AND deleted_at IS NULL").bind(event.id,contentHash).first())continue;
      let capturedAt:number|null=null;
      if(file.type.startsWith("image/"))try{const metadata=await parseMetadata(bytes,["DateTimeOriginal","CreateDate","ModifyDate"]);const value=metadata?.DateTimeOriginal??metadata?.CreateDate??metadata?.ModifyDate;const parsed=value instanceof Date?value.getTime():new Date(value).getTime();if(Number.isFinite(parsed)&&parsed>0&&parsed<=Date.now()+86400000)capturedAt=parsed;}catch{/* No readable metadata. */}
      await c.env.MEDIA.put(objectKey,bytes,{httpMetadata:{contentType:file.type,cacheControl:"public, max-age=31536000, immutable"}});uploadedKeys.push(objectKey);
      await c.env.DB.prepare("INSERT INTO media (id,event_id,object_key,media_type,content_type,uploaded_by,uploaded_at,captured_at,content_hash,size_bytes,title) VALUES (?,?,?,?,?,?,?,?,?,?,NULL)").bind(id,event.id,objectKey,file.type.startsWith("image/")?"image":"video",file.type,uploadedBy,Date.now(),capturedAt,contentHash,file.size).run();
    }
  }catch(error){if(uploadedKeys.length)await c.env.MEDIA.delete(uploadedKeys);if(uploadedKeys.length)await c.env.DB.batch(uploadedKeys.map(key=>c.env.DB.prepare("DELETE FROM media WHERE object_key=?").bind(key)));throw error;}
  return c.redirect(`/gallery/${event.code}?lang=${locale}`, 303);
});

app.get("/media/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT m.object_key,m.content_type,m.media_type,m.captured_at,m.uploaded_at,m.event_id,e.code,e.gallery_pin_hash FROM media m JOIN events e ON e.id=m.event_id WHERE m.id=? AND m.deleted_at IS NULL AND m.reported_at IS NULL AND e.deleted_at IS NULL").bind(c.req.param("id")).first<{ object_key: string; content_type: string; media_type: "image" | "video"; captured_at: number | null; uploaded_at: number; event_id:string; code:string; gallery_pin_hash:string|null }>();
  if (!row) return c.text("Το αρχείο δεν βρέθηκε.", 404);
  if(row.gallery_pin_hash){const expected=await sha256(`gallery-access:${row.event_id}:${row.gallery_pin_hash}`);if(cookieValue(c.req.raw,galleryCookieName(row.code))!==expected){const user=await currentUser(c);if(!user||!roleCan(await getEventRole(c.env.DB,row.event_id,user.id),"view"))return c.text("Private media",401);}}
  const object = await c.env.MEDIA.get(row.object_key);
  if (!object) return c.text("Το αρχείο δεν βρέθηκε.", 404);
  const headers = new Headers({ "Content-Type": row.content_type, "Cache-Control": "public, max-age=31536000, immutable", "ETag": object.httpEtag, "X-Content-Type-Options": "nosniff" });
  if (c.req.query("download") === "1") {
    const extension = row.content_type.split("/")[1]?.replace("jpeg", "jpg").replace("quicktime", "mov") || (row.media_type === "image" ? "jpg" : "mp4");
    const date = new Date(row.captured_at ?? row.uploaded_at).toISOString().slice(0, 10);
    headers.set("Content-Disposition", `attachment; filename="memboux-${date}.${extension}"`);
  }
  return new Response(object.body, { headers });
});

app.onError((error, c) => {
  console.error(error);
  const host = new URL(c.req.url).hostname;
  if (host === "127.0.0.1" || host === "localhost") return c.text(error.stack ?? error.message, 500);
  return c.text("Παρουσιάστηκε προσωρινό σφάλμα.", 500);
});
export default {
  fetch: app.fetch,
  scheduled(_controller: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(purgeExpiredTrash(env));
  },
};
