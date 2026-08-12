import { Hono } from "hono";
import { getEventRole, roleCan } from "../access";
import type { Bindings, EventRow } from "../domain";
import { resolveEventCover } from "../event-cover";
import { eventVerticalFor, verticalText, type EventVertical } from "../event-verticals";
import { normalizeLocale, type Locale } from "../i18n";
import { getEvent } from "../repositories";
import { currentUser } from "../session";
import { eventAccessAllows, getEventAccess } from "../event-access";
import { eventUiCopy, eventWizardCopy } from "../event-ui-copy";
import { mergeWizardFields, parseCustomFields, wizardFieldsFor } from "../event-wizard-schema";
import { hasGalleryAccess } from "../gallery-access";
import { existingMediaLikeVisitor, getGalleryMediaWithLikes, mediaLikeActorKey } from "../media-likes";
import { esc } from "../utils";
import { eventVerticalPreviewPage, type EventVerticalProfile } from "../views/event-vertical-preview";
import { eventHeader, logoutScript, page } from "../views/shared";

const themes = ["signature", "vivid", "editorial", "minimal"] as const;
type ThemeKey = typeof themes[number];

export function normalizeEventTheme(value: unknown): ThemeKey | null {
  return themes.includes(value as ThemeKey) ? value as ThemeKey : null;
}

const input = (label: string, name: string, value: string, options: { required?: boolean; type?: string; max?: number; placeholder?: string } = {}) =>
  `<label class="block text-sm font-semibold text-[#443653]">${esc(label)}<input name="${name}" value="${esc(value)}" ${options.required ? "required" : ""} type="${options.type ?? "text"}" maxlength="${options.max ?? 160}" placeholder="${esc(options.placeholder ?? "")}" class="mt-2 w-full rounded-xl border border-[#e2dcef] bg-white px-4 py-3 font-normal outline-none focus:border-[#8b5cf6] focus:ring-4 focus:ring-[#8b5cf6]/10"></label>`;
const area = (label: string, name: string, value: string, placeholder: string, max = 2000) =>
  `<label class="block text-sm font-semibold text-[#443653]">${esc(label)}<textarea name="${name}" maxlength="${max}" rows="6" placeholder="${esc(placeholder)}" class="mt-2 w-full rounded-xl border border-[#e2dcef] bg-white px-4 py-3 font-normal leading-6 outline-none focus:border-[#8b5cf6] focus:ring-4 focus:ring-[#8b5cf6]/10">${esc(value)}</textarea></label>`;

async function managedVerticalEvent(db: D1Database, code: string, userId: string) {
  const event = await getEvent(db, code);
  const vertical = eventVerticalFor(event?.event_type);
  if (!event || !vertical) return null;
  const role = await getEventRole(db, event.id, userId);
  return roleCan(role, "manage_event") ? { event, vertical } : null;
}

async function ensureProfile(db: D1Database, event: EventRow) {
  await db.prepare(`INSERT OR IGNORE INTO event_vertical_profiles
    (event_id,headline,host_name,wizard_step,updated_at) VALUES (?,?,?,?,?)`)
    .bind(event.id, event.eventName, event.eventName, 1, Date.now()).run();
  return db.prepare("SELECT * FROM event_vertical_profiles WHERE event_id=?")
    .bind(event.id).first<EventVerticalProfile>();
}

function stepContent(locale: Locale, event: EventRow, vertical: EventVertical, profile: EventVerticalProfile, step: number) {
  const w = eventWizardCopy[locale];
  const custom = parseCustomFields(profile.custom_fields_json);
  const tailored = (forStep: number) => wizardFieldsFor(vertical.type, forStep).map((field) =>
    input(field.label[locale], field.key, custom[field.key] ?? "", { max: field.max, placeholder: field.placeholder[locale] })).join("");
  if (step === 1) return `<div><p class="text-xs font-bold uppercase tracking-[.18em]" style="color:${vertical.accent}">${esc(verticalText(vertical.wizardSteps[0], locale))}</p><h2 class="mt-2 text-3xl">${esc(w.identityTitle)}</h2><p class="mt-2 text-sm leading-6 text-[#756b82]">${esc(w.identityText)}</p></div><div class="mt-7 grid gap-5">${input(w.headline, "headline", profile.headline, { required: true, max: 120, placeholder: event.eventName })}${input(w.host, "hostName", profile.host_name, { max: 120 })}${tailored(1)}${area(w.introduction, "introduction", profile.introduction, w.introductionPlaceholder, 600)}</div>`;
  if (step === 2) return `<div><p class="text-xs font-bold uppercase tracking-[.18em]" style="color:${vertical.accent}">${esc(verticalText(vertical.wizardSteps[1], locale))}</p><h2 class="mt-2 text-3xl">${esc(w.flowTitle)}</h2><p class="mt-2 text-sm leading-6 text-[#756b82]">${esc([event.event_start_date, event.event_end_date !== event.event_start_date ? event.event_end_date : "", event.location].filter(Boolean).join(" · "))}</p></div><div class="mt-7 grid gap-5">${tailored(2)}${area(w.scheduleMoments, "scheduleNotes", profile.schedule_notes, w.schedulePlaceholder)}</div>`;
  if (step === 3) {
    const ui = eventUiCopy[locale];
    const descriptions = { signature: ui.signatureDescription, vivid: ui.vividDescription, editorial: ui.editorialDescription, minimal: ui.minimalDescription };
    return `<div><p class="text-xs font-bold uppercase tracking-[.18em]" style="color:${vertical.accent}">${esc(verticalText(vertical.wizardSteps[2], locale))}</p><h2 class="mt-2 text-3xl">${esc(w.artTitle)}</h2></div><fieldset class="mt-7"><legend class="text-sm font-semibold">${esc(w.visualStyle)}</legend><div class="mt-3 grid gap-3 sm:grid-cols-2">${themes.map((theme) => `<label class="cursor-pointer rounded-2xl border p-4 transition has-[:checked]:border-[#7c3aed] has-[:checked]:bg-[#f5f0ff]"><input type="radio" name="themeKey" value="${theme}" ${profile.theme_key === theme ? "checked" : ""} class="sr-only"><strong class="block">${esc(ui[theme])}</strong><span class="mt-1 block text-sm text-[#756b82]">${esc(descriptions[theme])}</span></label>`).join("")}</div></fieldset><div class="mt-6">${area(w.storyLabel, "story", profile.story, w.storyPlaceholder)}</div>`;
  }
  return `<div><p class="text-xs font-bold uppercase tracking-[.18em]" style="color:${vertical.accent}">${esc(verticalText(vertical.wizardSteps[3], locale))}</p><h2 class="mt-2 text-3xl">${esc(w.reviewTitle)}</h2><p class="mt-2 text-sm leading-6 text-[#756b82]">${esc(w.reviewText)}</p></div><div class="mt-7 grid gap-5">${tailored(4)}${area(w.guestInfo, "guestNotes", profile.guest_notes, w.guestPlaceholder)}${input(w.contactEmail, "contactEmail", profile.contact_email, { type: "email", max: 254, placeholder: "info@example.com" })}<div class="flex items-start gap-3 rounded-2xl border border-[#d8e4df] bg-[#f5f8f6] p-4"><span aria-hidden="true" class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style="background:${vertical.accent}">✓</span><span><strong class="block">${esc(w.completeWizard)}</strong><span class="mt-1 block text-sm leading-6 text-[#756b82]">${esc(w.completeText)}</span></span></div></div>`;
}

function wizardPage(locale: Locale, user: { name: string; email: string }, event: EventRow, vertical: EventVertical, profile: EventVerticalProfile, activeStep: number) {
  const w = eventWizardCopy[locale];
  const ui = eventUiCopy[locale];
  const steps = vertical.wizardSteps.map((label) => verticalText(label, locale));
  const progress = activeStep * 25;
  const unlocked = Math.max(profile.wizard_step, activeStep);
  const navigation = steps.map((label, index) => {
    const step = index + 1;
    const circle = step < activeStep ? "✓" : String(step);
    const classes = step === activeStep ? "bg-white text-[#2b174d]" : step < activeStep ? "bg-white/25 text-white" : "bg-black/10 text-white/60";
    return step <= unlocked ? `<a href="/dashboard/${esc(event.code)}/setup?lang=${locale}&step=${step}" class="flex min-w-[8rem] items-center gap-2 rounded-xl px-2 py-2 hover:bg-white/10"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${classes} text-xs font-bold">${circle}</span><span class="text-xs font-semibold">${esc(label)}</span></a>` : `<span class="flex min-w-[8rem] items-center gap-2 px-2 py-2 opacity-50"><span class="flex h-8 w-8 items-center justify-center rounded-full bg-black/10 text-xs">${step}</span><span class="text-xs">${esc(label)}</span></span>`;
  }).join("");
  const action = `/api/account/events/${encodeURIComponent(event.code)}/setup/${activeStep}`;
  const previous = activeStep > 1 ? `<a href="/dashboard/${esc(event.code)}/setup?lang=${locale}&step=${activeStep - 1}" class="rounded-xl border border-[#e2dcef] px-5 py-3 text-center font-semibold">${esc(w.back)}</a>` : "";
  const button = activeStep === 4 ? w.finishPreview : w.saveContinue;
  const previewUrl = `/event/${encodeURIComponent(event.code)}?lang=${locale}&preview=1`;
  const form = `<form id="event-setup-form" action="${action}" method="post"><input type="hidden" name="locale" value="${locale}">${stepContent(locale, event, vertical, profile, activeStep)}<div class="mt-8 flex flex-col-reverse justify-between gap-3 border-t border-[#e5ece9] pt-6 sm:flex-row">${previous}<button class="rounded-xl px-6 py-3 font-semibold text-white" style="background:${vertical.accent}">${esc(button)}</button></div><p id="autosave-status" role="status" aria-live="polite" class="mt-3 text-xs font-semibold text-[#7f7489]">${esc(w.autosave)}</p></form>`;
  const script = `<script>(()=>{const form=document.getElementById('event-setup-form'),status=document.getElementById('autosave-status'),preview=document.getElementById('event-preview-frame'),key='memboux-event-draft-${encodeURIComponent(event.code)}-${activeStep}',fields=[...form.querySelectorAll('input[name]:not([type=hidden]),textarea[name],select[name]')];try{const draft=JSON.parse(localStorage.getItem(key)||'null');if(draft)fields.forEach(field=>{if(!(field.name in draft))return;const value=draft[field.name];if(field.type==='checkbox'||field.type==='radio')field.checked=Array.isArray(value)&&value.includes(field.value);else field.value=String(value)});if(draft)status.textContent=${JSON.stringify(w.restored)}}catch{}const collect=()=>{const data={};fields.forEach(field=>{if(field.type==='checkbox'||field.type==='radio'){if(field.checked)(data[field.name]??=[]).push(field.value)}else data[field.name]=field.value});return data};let timer,inFlight=false,pending=null,submitting=false;const flush=async()=>{if(inFlight||!pending)return;const data=pending;pending=null;inFlight=true;status.textContent=${JSON.stringify(w.saving)};try{const response=await fetch('${action}/autosave',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,locale:${JSON.stringify(locale)}})});if(!response.ok)throw new Error();if(!pending&&!submitting){localStorage.removeItem(key);status.textContent=${JSON.stringify(w.saved)};if(preview?.src)preview.src=preview.dataset.src+'&v='+Date.now()}}catch{status.textContent=${JSON.stringify(w.protected)}}finally{inFlight=false;if(pending)flush()}};const save=()=>{pending=collect();localStorage.setItem(key,JSON.stringify(pending));clearTimeout(timer);status.textContent=${JSON.stringify(w.protected)};timer=setTimeout(flush,650)};fields.forEach(field=>{field.addEventListener('input',save);field.addEventListener('change',save)});form.addEventListener('submit',async event=>{event.preventDefault();clearTimeout(timer);submitting=true;pending=null;const draft=collect(),payload=new FormData(form),editable=fields.filter(field=>!field.disabled);localStorage.setItem(key,JSON.stringify(draft));const buttons=[...form.querySelectorAll('button[type="submit"],button:not([type])')];buttons.forEach(button=>button.disabled=true);editable.forEach(field=>field.disabled=true);form.setAttribute('aria-busy','true');status.textContent=${JSON.stringify(w.saving)};while(inFlight)await new Promise(resolve=>setTimeout(resolve,25));localStorage.setItem(key,JSON.stringify(draft));try{const response=await fetch(form.action,{method:'POST',credentials:'include',body:payload,redirect:'follow'}),target=new URL(response.url);if(!response.ok||!response.redirected||target.pathname.includes('/login'))throw new Error();localStorage.removeItem(key);location.assign(target.href)}catch{submitting=false;form.removeAttribute('aria-busy');status.textContent=${JSON.stringify(w.protected)};editable.forEach(field=>field.disabled=false);buttons.forEach(button=>button.disabled=false)}});const drawer=document.getElementById('event-preview-drawer'),stage=document.getElementById('event-preview-stage');document.querySelectorAll('[data-event-preview-open]').forEach(button=>button.addEventListener('click',()=>{drawer.hidden=false;document.body.style.overflow='hidden';if(!preview.src)preview.src=preview.dataset.src}));document.querySelector('[data-event-preview-close]').addEventListener('click',()=>{drawer.hidden=true;document.body.style.overflow=''});document.querySelectorAll('[data-preview-width]').forEach(button=>button.addEventListener('click',()=>{stage.style.maxWidth=button.dataset.previewWidth;document.querySelectorAll('[data-preview-width]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)))}))})()<\/script>`;
  const themeSelectionScript = `<script>(()=>{const preview=document.getElementById('event-preview-frame'),radios=[...document.querySelectorAll('input[name="themeKey"]')];if(!radios.length)return;const sync=(active,reload=false)=>{radios.forEach(radio=>{const card=radio.closest('label'),selected=radio===active;card?.setAttribute('aria-selected',String(selected));card?.classList.toggle('border-[#7c3aed]',selected);card?.classList.toggle('bg-[#f5f0ff]',selected);card?.classList.toggle('shadow-[0_0_0_1px_#7c3aed]',selected)});if(!preview||!active)return;const url=new URL(preview.dataset.src,location.origin);url.searchParams.set('theme',active.value);preview.dataset.src=url.pathname+url.search;if(reload&&preview.src)preview.src=preview.dataset.src+'&v='+Date.now()};radios.forEach(radio=>radio.addEventListener('change',()=>sync(radio,true)));const checked=radios.find(radio=>radio.checked);if(checked)sync(checked)})()<\/script>`;
  const drawer = `<section id="event-preview-drawer" hidden class="fixed inset-0 z-[250] bg-[#1d102f]/70 p-2 backdrop-blur-sm sm:p-5"><div class="mx-auto flex h-full max-w-[1500px] flex-col overflow-hidden rounded-[1.6rem] bg-[#f3effa]"><header class="flex items-center justify-between gap-3 border-b bg-white px-4 py-3"><strong>${esc(ui.responsivePreview)}</strong><div class="flex items-center gap-2"><div class="hidden rounded-xl bg-[#f3effa] p-1 sm:flex"><button type="button" data-preview-width="390px" class="rounded-lg px-3 py-1.5 text-xs font-bold">${esc(ui.mobile)}</button><button type="button" data-preview-width="820px" class="rounded-lg px-3 py-1.5 text-xs font-bold">${esc(ui.tablet)}</button><button type="button" data-preview-width="100%" aria-pressed="true" class="rounded-lg bg-white px-3 py-1.5 text-xs font-bold">${esc(ui.desktop)}</button></div><button type="button" data-event-preview-close class="rounded-xl bg-[#2b174d] px-3 py-2 text-xs font-bold text-white">${esc(ui.close)}</button></div></header><div class="min-h-0 flex-1 overflow-auto p-2 sm:p-5"><div id="event-preview-stage" class="mx-auto h-full max-w-full overflow-hidden rounded-xl bg-white shadow-xl transition-[max-width]"><iframe id="event-preview-frame" data-src="${previewUrl}" title="${esc(ui.eventPreview)}" class="h-full min-h-[70vh] w-full border-0"></iframe></div></div></div></section>`;
  return page(`${steps[activeStep - 1]} | Memboux`, `${eventHeader(locale, user, "")}<main class="min-h-[calc(100vh-4rem)] bg-[#f4f7f5] p-4 sm:p-6"><div class="mx-auto max-w-7xl"><div class="overflow-x-auto rounded-[1.5rem] px-3 py-3 text-white sm:px-5" style="background:${vertical.accent}"><div class="flex min-w-max items-center justify-between gap-3">${navigation}</div><div class="mx-2 mt-2 h-1 overflow-hidden rounded-full bg-black/15"><div class="h-full rounded-full bg-white" style="width:${progress}%"></div></div></div><div class="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]"><section class="rounded-[2rem] border border-[#e7e0f0] bg-white p-5 shadow-sm sm:p-8">${form}</section><aside class="h-fit rounded-[1.6rem] border border-[#e7e0f0] bg-white p-5 shadow-sm xl:sticky xl:top-5"><span class="text-3xl">${esc(vertical.symbol)}</span><p class="mt-4 text-xs font-bold uppercase tracking-[.18em]" style="color:${vertical.accent}">${esc(verticalText(vertical.eyebrow, locale))}</p><h1 class="mt-2 text-2xl">${esc(event.eventName)}</h1><p class="mt-3 text-sm leading-6 text-[#756b82]">${esc(w.previewHelp)}</p><button type="button" data-event-preview-open class="mt-5 w-full rounded-xl px-4 py-3 text-sm font-bold text-white" style="background:${vertical.accent}">${esc(w.openPreview)}</button><a href="/dashboard/${esc(event.code)}?lang=${locale}" class="mt-3 block text-center text-xs font-semibold text-[#756b82]">${esc(w.backWorkspace)}</a></aside></div></div></main>${drawer}${script}${themeSelectionScript}${logoutScript(locale)}`, { locale });
}

function profilePatch(body: Record<string, unknown>, step: number) {
  const text = (key: string, max: number) => String(body[key] ?? "").trim().slice(0, max);
  if (step === 1) return { headline: text("headline", 120), host_name: text("hostName", 120), introduction: text("introduction", 600) };
  if (step === 2) return { schedule_notes: text("scheduleNotes", 2000) };
  if (step === 3) return { theme_key: themes.includes(body.themeKey as ThemeKey) ? body.themeKey as ThemeKey : "signature", story: text("story", 2000) };
  const contactEmail = text("contactEmail", 254).toLowerCase();
  return { guest_notes: text("guestNotes", 2000), contact_email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) ? contactEmail : "" };
}

async function savePatch(db: D1Database, eventId: string, vertical: EventVertical, step: number, body: Record<string, unknown>, complete: boolean) {
  const patch = profilePatch(body, step);
  const profile = await db.prepare("SELECT custom_fields_json FROM event_vertical_profiles WHERE event_id=?").bind(eventId).first<{ custom_fields_json: string }>();
  const entries = Object.entries({ ...patch, custom_fields_json: mergeWizardFields(vertical.type, step, body, profile?.custom_fields_json) });
  const nextStep = complete ? Math.min(4, step + 1) : step;
  const assignments = entries.map(([key]) => `${key}=?`).join(",");
  const publish = complete && step === 4;
  await db.prepare(`UPDATE event_vertical_profiles SET ${assignments},wizard_step=MAX(wizard_step,?),wizard_completed_at=${publish ? "COALESCE(wizard_completed_at,?)" : "wizard_completed_at"},publish_status=${publish ? "'published'" : "publish_status"},updated_at=? WHERE event_id=?`)
    .bind(...entries.map(([, value]) => value), nextStep, ...(publish ? [Date.now()] : []), Date.now(), eventId).run();
}

export const eventSetupRoutes = new Hono<{ Bindings: Bindings }>();

eventSetupRoutes.get("/dashboard/:code/setup", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.redirect(`/en/login?redirect=${encodeURIComponent(c.req.path)}`);
  const managed = await managedVerticalEvent(c.env.DB, c.req.param("code"), user.id);
  if (!managed) return c.notFound();
  const profile = await ensureProfile(c.env.DB, managed.event);
  if (!profile) return c.text("Could not create event profile", 500);
  const locale = normalizeLocale(c.req.query("lang") ?? managed.event.default_locale);
  const requested = Number(c.req.query("step") ?? profile.wizard_step);
  const step = Math.max(1, Math.min(Math.max(profile.wizard_step, 1), Number.isInteger(requested) ? requested : 1, 4));
  return c.html(wizardPage(locale, user, managed.event, managed.vertical, profile, step));
});

eventSetupRoutes.post("/api/account/events/:code/setup/:step", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const managed = await managedVerticalEvent(c.env.DB, c.req.param("code"), user.id);
  if (!managed) return c.notFound();
  const step = Number(c.req.param("step"));
  if (!Number.isInteger(step) || step < 1 || step > 4) return c.text("Invalid step", 400);
  await ensureProfile(c.env.DB, managed.event);
  const body = Object.fromEntries(Object.entries(await c.req.parseBody()).map(([key, value]) => [key, value]));
  await savePatch(c.env.DB, managed.event.id, managed.vertical, step, body, true);
  const locale = normalizeLocale(String(body.locale ?? managed.event.default_locale));
  if (step === 4) return c.redirect(`/event/${managed.event.code}?lang=${locale}&preview=1`, 303);
  return c.redirect(`/dashboard/${managed.event.code}/setup?lang=${locale}&step=${step + 1}`, 303);
});

eventSetupRoutes.post("/api/account/events/:code/setup/:step/autosave", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ message: "Unauthorized" }, 401);
  const managed = await managedVerticalEvent(c.env.DB, c.req.param("code"), user.id);
  if (!managed) return c.json({ message: "Not found" }, 404);
  const step = Number(c.req.param("step"));
  if (!Number.isInteger(step) || step < 1 || step > 4) return c.json({ message: "Invalid step" }, 400);
  await ensureProfile(c.env.DB, managed.event);
  const body = await c.req.json<Record<string, unknown>>();
  await savePatch(c.env.DB, managed.event.id, managed.vertical, step, body, false);
  return c.json({ status: true, savedAt: Date.now() });
});

eventSetupRoutes.get("/event/:code", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  const vertical = eventVerticalFor(event?.event_type);
  if (!event || !vertical) return c.notFound();
  const profile = await c.env.DB.prepare("SELECT * FROM event_vertical_profiles WHERE event_id=?").bind(event.id).first<EventVerticalProfile>();
  if (!profile) return c.notFound();
  const user = await currentUser(c);
  const manager = Boolean(user && roleCan(await getEventRole(c.env.DB, event.id, user.id), "manage_event"));
  const preview = c.req.query("preview") === "1";
  if (profile.publish_status !== "published" && !manager) return c.notFound();
  if (preview && !manager) return c.notFound();
  const access = await getEventAccess(c.env.DB, event.id);
  if (!manager) {
    if (!eventAccessAllows(access, "guest_access")) return c.text("Event access is not active", 403);
    if (!(await hasGalleryAccess(c.req.raw, event)))
      return c.redirect(`/gallery/${encodeURIComponent(event.code)}?lang=${normalizeLocale(c.req.query("lang") ?? event.default_locale)}`, 302);
  }
  const previewTheme = manager && preview ? normalizeEventTheme(c.req.query("theme")) : null;
  const renderedProfile = previewTheme ? { ...profile, theme_key: previewTheme } : profile;
  const likeVisitor = existingMediaLikeVisitor(c.req.raw);
  const likeActorKey = likeVisitor
    ? await mediaLikeActorKey(c.env.BETTER_AUTH_SECRET, likeVisitor)
    : "";
  const [galleryItems, cover] = await Promise.all([
    getGalleryMediaWithLikes(c.env.DB, event.id, likeActorKey),
    resolveEventCover(c.env.DB, event.id),
  ]);
  const guestItems = galleryItems.filter((item) => item.origin !== "official");
  return c.html(eventVerticalPreviewPage(
    normalizeLocale(c.req.query("lang") ?? event.default_locale),
    event,
    vertical,
    renderedProfile,
    manager && preview,
    { guestExperienceOpen: eventAccessAllows(access, "guest_access"), guestItems, coverUpdatedAt: cover?.updated_at ?? null },
  ));
});
