import { Hono } from "hono";
import { createAuth, sendEmail, type AuthEnv } from "./auth";
import { normalizeLocale, t, type Locale } from "./i18n";
import QRCode from "qrcode";

type Bindings = AuthEnv & { MEDIA: R2Bucket; ADMIN_PASSWORD?: string };
type EventRow = { id: string; code: string; eventName: string; admin_token_hash: string; created_at: number; expires_at: number; status: "active" | "archived"; notes: string; updated_at: number | null; default_locale: Locale; event_start_date: string | null; event_end_date: string | null; deleted_at: number | null; purge_at: number | null };
type MediaRow = { id: string; event_id: string; object_key: string; media_type: "image" | "video"; content_type: string; uploaded_by: string; uploaded_at: number; size_bytes: number; title: string | null; deleted_at: number | null; purge_at: number | null };
type EventMemberRow = { user_id: string; name: string; email: string; role: "owner" | "editor" | "viewer"; created_at: number };
type EventInvitationRow = { id: string; email: string; role: "editor" | "viewer"; created_at: number; expires_at: number };

const app = new Hono<{ Bindings: Bindings }>();
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime"]);
const ADMIN_COOKIE = "memboux_admin";
const TRASH_RETENTION_MS = 30 * 86400000;

app.on(["GET", "POST"], "/api/auth/*", (c) => {
  const auth = createAuth(c.env, (promise) => c.executionCtx.waitUntil(promise));
  return auth.handler(c.req.raw);
});

const esc = (value: unknown) => String(value ?? "").replace(/[&<>'\"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" }[ch]!));
const randomCode = () => crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
const sha256 = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((b) => b.toString(16).padStart(2, "0")).join("");
const dateInput = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);
const formatDate = (timestamp: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium" }).format(new Date(timestamp));
const formatDateTime = (timestamp: number, locale: Locale) => new Intl.DateTimeFormat(locale === "el" ? "el-GR" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
const validEventDate = (value: unknown) => {
  const date = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
};
const formatEventDates = (event: EventRow, locale: Locale) => {
  if (!event.event_start_date) return locale === "el" ? "Δεν ορίστηκε ημερομηνία" : "Date not set";
  const formatter = new Intl.DateTimeFormat(locale === "el" ? "el-GR" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const start = formatter.format(new Date(`${event.event_start_date}T00:00:00Z`));
  if (!event.event_end_date || event.event_end_date === event.event_start_date) return start;
  const end = formatter.format(new Date(`${event.event_end_date}T00:00:00Z`));
  return `${start} – ${end}`;
};

async function adminSession(password: string) {
  return sha256(`memboux-admin-session:${password}`);
}

async function isAdmin(c: { env: Bindings; req: { header(name: string): string | undefined } }) {
  const password = c.env.ADMIN_PASSWORD;
  if (!password) return false;
  const cookie = c.req.header("Cookie") ?? "";
  const value = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${ADMIN_COOKIE}=`))?.slice(ADMIN_COOKIE.length + 1);
  return Boolean(value && value === await adminSession(password));
}

function brandMark(href: string, compact = false, light = false) {
  return `<a href="${href}" class="inline-flex items-center gap-3 ${light ? "text-white" : "text-[#624938]"}"><img src="/brand/memboux-icon.png" alt="" width="48" height="48" class="${compact ? "h-9 w-9" : "h-11 w-11"} object-contain ${light ? "brightness-0 invert" : ""}"><span class="leading-none"><strong class="block font-serif ${compact ? "text-xl" : "text-2xl"} tracking-wide">Memboux</strong><span class="mt-1 block text-[9px] font-semibold uppercase tracking-[.22em] opacity-75">Collect All Moments</span></span></a>`;
}

function accountMenu(locale: Locale, user: { name: string; email: string }) {
  return `<div class="group relative"><button class="flex items-center gap-2 rounded-xl border px-3 py-2"><span class="flex h-8 w-8 items-center justify-center rounded-full bg-[#eadfd6] font-medium">${esc(user.name.slice(0, 1).toUpperCase())}</span><span class="hidden max-w-36 truncate text-sm md:block">${esc(user.name)}</span><span class="text-xs">⌄</span></button><div class="invisible absolute right-0 z-30 mt-2 w-60 translate-y-1 rounded-2xl border bg-white p-2 opacity-0 shadow-xl transition group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100"><p class="truncate px-3 py-2 text-xs text-[#776a63]">${esc(user.email)}</p><a href="/${locale}/account" class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-[#f7f3ed]"><span>▦</span>${locale === "el" ? "Τα events μου" : "My events"}</a><a href="/${locale}/profile" class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-[#f7f3ed]"><span>○</span>${locale === "el" ? "Προφίλ" : "Profile"}</a><a href="/${locale}/security" class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-[#f7f3ed]"><span>◇</span>${locale === "el" ? "Ασφάλεια" : "Security"}</a><a href="/${locale}/trash" class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-[#f7f3ed]"><span>♲</span>${locale === "el" ? "Κάδος" : "Trash"}</a><button data-logout class="mt-1 w-full border-t rounded-xl px-3 py-3 text-left text-sm text-red-700 hover:bg-red-50">${locale === "el" ? "Αποσύνδεση" : "Sign out"}</button></div></div>`;
}

const logoutScript = (locale: Locale) => `<script>document.querySelectorAll('[data-logout]').forEach(button=>button.onclick=async()=>{button.disabled=true;const response=await fetch('/api/auth/sign-out',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:'{}'});if(response.ok)location.replace('/${locale}');else button.disabled=false})<\/script>`;

function googleIcon() {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5 shrink-0"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.32 2.98-7.41Z"/><path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.64-2.42l-3.24-2.53c-.9.6-2.05.96-3.4.96-2.61 0-4.82-1.77-5.61-4.14H3.04v2.62A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.87A6 6 0 0 1 6.08 12c0-.65.11-1.28.31-1.87V7.51H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.49l3.35-2.62Z"/><path fill="#EA4335" d="M12 5.99c1.47 0 2.79.5 3.83 1.5l2.88-2.88A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.96 5.51l3.35 2.62C7.18 7.76 9.39 5.99 12 5.99Z"/></svg>`;
}

function adminShell(title: string, content: string) {
  return page(`${title} – Memboux Admin`, `<header class="border-b bg-[#2f241f] text-white"><div class="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">${brandMark("/admin", true, true)}<form action="/admin/logout" method="post"><button class="rounded-lg border border-white/20 px-4 py-2 text-sm hover:bg-white/10">Αποσύνδεση</button></form></div></header>${content}`);
}

async function currentUser(c: { env: Bindings; req: { raw: Request } }) {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  return session?.user ?? null;
}

function authPage(locale: Locale, mode: "login" | "register") {
  const m = t(locale);
  const isRegister = mode === "register";
  return page(`${isRegister ? m.register : m.login} – Memboux`, `<main class="flex min-h-screen items-center justify-center p-5"><section class="w-full max-w-md rounded-3xl border border-[#e6d8ce] bg-white/95 p-8 shadow-[0_24px_70px_rgba(71,50,40,.12)]"><div class="mb-7 flex items-center justify-between">${brandMark(`/${locale}`, true)}<a href="/${locale === "el" ? "en" : "el"}/${mode}" class="text-sm font-medium text-[#8a654f]">${locale === "el" ? "EN" : "EL"}</a></div><h1 class="text-4xl">${isRegister ? m.register : m.login}</h1><button id="google" class="mt-6 flex w-full items-center justify-center gap-3 rounded-xl border border-[#d8cec7] bg-white px-4 py-3 font-medium shadow-sm transition hover:border-[#b99c8a] hover:bg-[#fcfaf7]">${googleIcon()}<span>${m.continueGoogle}</span></button><div class="my-5 flex items-center gap-3 text-xs text-slate-400"><span class="h-px flex-1 bg-slate-200"></span>OR<span class="h-px flex-1 bg-slate-200"></span></div><form id="authForm" class="space-y-3">${isRegister ? `<input name="name" required maxlength="100" placeholder="${m.name}" class="w-full rounded-xl border px-4 py-3">` : ""}<input name="email" type="email" required autocomplete="email" placeholder="${m.email}" class="w-full rounded-xl border px-4 py-3"><input name="password" type="password" required minlength="10" autocomplete="${isRegister ? "new-password" : "current-password"}" placeholder="${m.password}" class="w-full rounded-xl border px-4 py-3"><p id="error" class="hidden rounded-xl bg-red-50 p-3 text-sm text-red-700"></p><button class="w-full rounded-xl bg-[#2f241f] py-3 font-semibold text-white">${isRegister ? m.register : m.login}</button></form>${!isRegister ? `<a href="/${locale}/forgot-password" class="mt-4 block text-center text-sm text-[#8a654f]">${m.forgotPassword}</a>` : ""}<p class="mt-6 text-center text-sm text-[#776a63]">${isRegister ? m.hasAccount : m.noAccount} <a class="font-semibold text-[#8a654f]" href="/${locale}/${isRegister ? "login" : "register"}">${isRegister ? m.login : m.register}</a></p></section></main><script>
const locale=${JSON.stringify(locale)};const error=document.getElementById('error');
document.getElementById('google').onclick=async()=>{const r=await fetch('/api/auth/sign-in/social',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'google',callbackURL:'/'+locale+'/account'})});const d=await r.json();if(d.url)location.href=d.url;else{error.textContent=d.message||${JSON.stringify(m.genericError)};error.classList.remove('hidden')}};
document.getElementById('authForm').onsubmit=async(e)=>{e.preventDefault();error.classList.add('hidden');const values=Object.fromEntries(new FormData(e.target));const r=await fetch('/api/auth/${isRegister ? "sign-up" : "sign-in"}/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...values,callbackURL:'/'+locale+'/account'})});const d=await r.json().catch(()=>({}));if(r.ok){location.href=${isRegister ? `'/${locale}/verify-email'` : `'/${locale}/account'`}}else{error.textContent=d.message||${JSON.stringify(m.genericError)};error.classList.remove('hidden')}};
<\/script>`);
}

function page(title: string, body: string) {
  return `<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f7f3ed"><meta name="description" content="Memboux – Collect All Moments"><link rel="icon" type="image/png" href="/brand/memboux-icon.png"><link rel="apple-touch-icon" href="/brand/memboux-icon.png"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600&family=Montserrat:wght@300;400;500;600&display=swap" rel="stylesheet"><title>${esc(title)}</title><script src="https://cdn.tailwindcss.com"><\/script><style>:root{--ivory:#f7f3ed;--champagne:#d8c3b3;--taupe:#a98770;--espresso:#3b2a23;--muted:#776a63}html{background:var(--ivory)}body{font-family:'Montserrat',sans-serif;font-weight:300;letter-spacing:.01em;color:var(--espresso)}h1,h2,h3,.font-serif{font-family:'Cormorant Garamond',serif;font-weight:400;letter-spacing:-.015em}strong{font-weight:500}button,input,select,textarea{font:inherit}button{letter-spacing:.025em}</style></head><body class="min-h-screen bg-gradient-to-br from-[#f7f3ed] via-[#fffdf9] to-[#eadfd6] text-[#3b2a23]">${body}</body></html>`;
}

async function getEvent(db: D1Database, code: string, includeDeleted = false) {
  return db.prepare(`SELECT * FROM events WHERE code = ?${includeDeleted ? "" : " AND deleted_at IS NULL"}`).bind(code.toUpperCase()).first<EventRow>();
}

async function getMedia(db: D1Database, eventId: string, includeDeleted = false) {
  const result = await db.prepare(`SELECT * FROM media WHERE event_id = ?${includeDeleted ? "" : " AND deleted_at IS NULL"} ORDER BY uploaded_at DESC`).bind(eventId).all<MediaRow>();
  return result.results;
}

async function purgeExpiredTrash(env: Bindings) {
  const now = Date.now();
  const expiredMedia = await env.DB.prepare("SELECT id,object_key FROM media WHERE purge_at IS NOT NULL AND purge_at<=? LIMIT 100").bind(now).all<{ id: string; object_key: string }>();
  if (expiredMedia.results.length) {
    await env.MEDIA.delete(expiredMedia.results.map((item) => item.object_key));
    await env.DB.batch(expiredMedia.results.map((item) => env.DB.prepare("DELETE FROM media WHERE id=?").bind(item.id)));
  }
  const expiredEvents = await env.DB.prepare("SELECT id FROM events WHERE purge_at IS NOT NULL AND purge_at<=? LIMIT 25").bind(now).all<{ id: string }>();
  for (const event of expiredEvents.results) {
    const objects = await env.DB.prepare("SELECT object_key FROM media WHERE event_id=?").bind(event.id).all<{ object_key: string }>();
    if (objects.results.length) await env.MEDIA.delete(objects.results.map((item) => item.object_key));
    await env.DB.prepare("DELETE FROM events WHERE id=?").bind(event.id).run();
  }
}

function cards(items: MediaRow[], options?: { code?: string; locale?: Locale; selectable?: boolean; manage?: boolean }) {
  return items.map((m) => {
    const media = m.media_type === "image" ? `<img src="/media/${encodeURIComponent(m.id)}" alt="${esc(m.title || m.uploaded_by)}" loading="lazy" class="h-full w-full object-cover">` : `<video src="/media/${encodeURIComponent(m.id)}" controls preload="metadata" class="h-full w-full object-cover"></video>`;
    const content = options?.manage && options.code ? `<a href="/dashboard/${encodeURIComponent(options.code)}/media/${encodeURIComponent(m.id)}?lang=${options.locale ?? "en"}" class="block aspect-square">${media}</a>` : `<a href="/media/${encodeURIComponent(m.id)}" target="_blank" class="block aspect-square">${media}</a>`;
    return `<article class="relative overflow-hidden rounded-2xl bg-[#f7f3ed] shadow-sm">${options?.selectable ? `<label class="absolute left-3 top-3 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/95 shadow"><input type="checkbox" class="media-select h-4 w-4" value="${esc(m.id)}" data-download="/media/${encodeURIComponent(m.id)}?download=1"></label>` : ""}${content}<div class="px-4 py-3"><p class="truncate text-sm font-medium">${esc(m.title || m.uploaded_by)}</p><p class="mt-1 text-xs text-[#776a63]">${esc(m.uploaded_by)}</p></div></article>`;
  }).join("");
}

app.get("/", (c) => c.redirect("/en"));

const localizedHome = async (c: any) => {
  const locale = normalizeLocale(new URL(c.req.url).pathname === "/en" ? "en" : "el");
  const m = t(locale);
  const user = await currentUser(c);
  const accountActions = user
    ? `<span class="hidden text-sm text-[#776a63] md:inline">${esc(user.name)}</span><a href="/${locale}/account" class="rounded-xl bg-[#2f241f] px-4 py-2 font-semibold text-white">${m.dashboard}</a>`
    : `<a href="/${locale}/login" class="rounded-xl border px-4 py-2 font-semibold">${m.login}</a><a href="/${locale}/register" class="rounded-xl bg-[#2f241f] px-4 py-2 font-semibold text-white">${m.register}</a>`;
  return c.html(page("Memboux", `<main class="mx-auto flex min-h-screen max-w-5xl flex-col p-5"><nav class="flex items-center justify-between py-4">${brandMark(`/${locale}`, true)}<div class="flex items-center gap-2"><a href="/${locale === "el" ? "en" : "el"}" class="px-3 py-2 text-sm font-semibold">${locale === "el" ? "EN" : "EL"}</a>${accountActions}</div></nav><section class="flex flex-1 items-center py-16"><div class="max-w-3xl"><p class="font-semibold uppercase tracking-[.25em] text-[#9b725c]">Collect All Moments</p><h1 class="mt-4 text-5xl font-bold leading-tight md:text-7xl">${locale === "el" ? "Όλες οι στιγμές του event σας, σε ένα μέρος." : "Every moment from your event, all together."}</h1><p class="mt-6 max-w-2xl text-xl text-[#776a63]">${locale === "el" ? "Δημιουργήστε το event σας, προσκαλέστε τους καλεσμένους και συγκεντρώστε φωτογραφίες και βίντεο σε μία ιδιωτική συλλογή." : "Create your event, invite your guests, and collect every photo and video in one private gallery."}</p><a href="/${locale}/${user ? "account" : "register"}" class="mt-8 inline-block rounded-xl bg-gradient-to-r from-[#caa58f] to-[#76533d] px-7 py-4 font-semibold text-white">${user ? m.dashboard : m.createEvent}</a></div></section></main>`));
};
app.get("/el", localizedHome);
app.get("/en", localizedHome);

app.get("/:locale{el|en}/login", async (c) => {
  const locale = normalizeLocale(c.req.param("locale"));
  if (await currentUser(c)) return c.redirect(`/${locale}/account`);
  return c.html(authPage(locale, "login"));
});
app.get("/:locale{el|en}/register", async (c) => {
  const locale = normalizeLocale(c.req.param("locale"));
  if (await currentUser(c)) return c.redirect(`/${locale}/account`);
  return c.html(authPage(locale, "register"));
});

app.get("/:locale{el|en}/verify-email", (c) => {
  const locale = normalizeLocale(c.req.param("locale")); const m = t(locale);
  return c.html(page(m.verifyTitle, `<main class="flex min-h-screen items-center justify-center p-5"><section class="max-w-lg rounded-3xl bg-white p-10 text-center shadow-xl"><div class="text-5xl">✉️</div><h1 class="mt-5 text-3xl font-bold">${m.verifyTitle}</h1><p class="mt-3 text-[#776a63]">${m.verifyText}</p><a href="/${locale}/login" class="mt-7 inline-block rounded-xl bg-[#2f241f] px-6 py-3 font-semibold text-white">${m.login}</a></section></main>`));
});

app.get("/:locale{el|en}/forgot-password", (c) => {
  const locale = normalizeLocale(c.req.param("locale")); const m = t(locale);
  return c.html(page(m.forgotPassword, `<main class="flex min-h-screen items-center justify-center p-5"><section class="w-full max-w-md rounded-3xl border border-[#e6d8ce] bg-white/95 p-8 shadow-[0_24px_70px_rgba(71,50,40,.12)]"><h1 class="text-3xl font-bold">${m.forgotPassword}</h1><form id="forgot" class="mt-6 space-y-3"><input name="email" type="email" required placeholder="${m.email}" class="w-full rounded-xl border px-4 py-3"><p id="message" class="hidden rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700"></p><button class="w-full rounded-xl bg-[#2f241f] py-3 font-semibold text-white">${locale === "el" ? "Αποστολή συνδέσμου" : "Send reset link"}</button></form></section></main><script>document.getElementById('forgot').onsubmit=async(e)=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.target));await fetch('/api/auth/request-password-reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...v,redirectTo:'/${locale}/reset-password'})});const m=document.getElementById('message');m.textContent=${JSON.stringify(locale === "el" ? "Αν υπάρχει λογαριασμός, στάλθηκε email επαναφοράς." : "If the account exists, a reset email has been sent.")};m.classList.remove('hidden')}<\/script>`));
});

app.get("/:locale{el|en}/reset-password", (c) => {
  const locale = normalizeLocale(c.req.param("locale")); const token = c.req.query("token") ?? "";
  return c.html(page(locale === "el" ? "Νέος κωδικός" : "New password", `<main class="flex min-h-screen items-center justify-center p-5"><section class="w-full max-w-md rounded-3xl border border-[#e6d8ce] bg-white/95 p-8 shadow-[0_24px_70px_rgba(71,50,40,.12)]"><h1 class="text-3xl font-bold">${locale === "el" ? "Όρισε νέο κωδικό" : "Choose a new password"}</h1><form id="reset" class="mt-6 space-y-3"><input name="password" type="password" required minlength="10" autocomplete="new-password" placeholder="${locale === "el" ? "Νέος κωδικός" : "New password"}" class="w-full rounded-xl border px-4 py-3"><p id="message" class="hidden rounded-xl p-3 text-sm"></p><button class="w-full rounded-xl bg-[#2f241f] py-3 font-semibold text-white">${locale === "el" ? "Αποθήκευση" : "Save password"}</button></form></section></main><script>const token=${JSON.stringify(token)};document.getElementById('reset').onsubmit=async(e)=>{e.preventDefault();const password=new FormData(e.target).get('password');const r=await fetch('/api/auth/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({newPassword:password,token})});const m=document.getElementById('message');m.classList.remove('hidden');if(r.ok){m.classList.add('bg-emerald-50','text-emerald-700');m.textContent=${JSON.stringify(locale === "el" ? "Ο κωδικός άλλαξε. Μπορείς να συνδεθείς." : "Password updated. You can now sign in.")};setTimeout(()=>location.href='/${locale}/login',1200)}else{m.classList.add('bg-red-50','text-red-700');m.textContent=${JSON.stringify(locale === "el" ? "Ο σύνδεσμος δεν είναι έγκυρος ή έχει λήξει." : "This link is invalid or has expired.")}}<\/script>`));
});

app.get("/:locale{el|en}/profile", async(c)=>{
  const locale=normalizeLocale(c.req.param("locale"));const user=await currentUser(c);if(!user)return c.redirect(`/${locale}/login`);
  return c.html(page(locale==="el"?"Προφίλ":"Profile",`<header class="border-b bg-white"><div class="mx-auto flex max-w-4xl items-center justify-between p-5">${brandMark(`/${locale}`,true)}${accountMenu(locale,user)}</div></header><main class="mx-auto max-w-4xl p-5 md:p-10"><a href="/${locale}/account" class="text-sm text-[#76533d]">← ${locale==="el"?"Τα events μου":"My events"}</a><div class="mt-5 grid gap-6 md:grid-cols-[220px_1fr]"><aside class="rounded-3xl bg-[#2f241f] p-6 text-white"><div class="flex h-20 w-20 items-center justify-center rounded-full bg-white/15 text-3xl">${esc(user.name.slice(0,1).toUpperCase())}</div><h1 class="mt-4 text-3xl">${locale==="el"?"Προφίλ":"Profile"}</h1><p class="mt-1 break-all text-sm text-white/65">${esc(user.email)}</p></aside><section class="rounded-3xl bg-white p-6 shadow"><h2 class="text-3xl">${locale==="el"?"Προσωπικά στοιχεία":"Personal details"}</h2><p class="mt-1 text-sm text-[#776a63]">${locale==="el"?"Τα στοιχεία που εμφανίζονται στον λογαριασμό σου.":"The details displayed on your account."}</p><form id="profile-form" class="mt-6 space-y-4"><label class="block text-sm font-medium">${locale==="el"?"Ονοματεπώνυμο":"Full name"}<input name="name" required maxlength="100" value="${esc(user.name)}" class="mt-1 w-full rounded-xl border px-4 py-3"></label><label class="block text-sm font-medium">Email<input value="${esc(user.email)}" disabled class="mt-1 w-full rounded-xl border bg-[#f7f3ed] px-4 py-3 text-[#776a63]"></label><p id="profile-message" class="hidden rounded-xl p-3 text-sm"></p><button class="rounded-xl bg-[#76533d] px-6 py-3 text-white">${locale==="el"?"Αποθήκευση αλλαγών":"Save changes"}</button></form></section></div></main><script>document.getElementById('profile-form').onsubmit=async e=>{e.preventDefault();const message=document.getElementById('profile-message');const name=new FormData(e.target).get('name');const response=await fetch('/api/auth/update-user',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});message.classList.remove('hidden');if(response.ok){message.className='rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700';message.textContent=${JSON.stringify(locale==="el"?"Το προφίλ ενημερώθηκε.":"Profile updated.")};setTimeout(()=>location.reload(),700)}else{const data=await response.json().catch(()=>({}));message.className='rounded-xl bg-red-50 p-3 text-sm text-red-700';message.textContent=data.message||${JSON.stringify(locale==="el"?"Η ενημέρωση απέτυχε.":"Update failed.")}}}<\/script>${logoutScript(locale)}`));
});

app.get("/:locale{el|en}/security", async(c)=>{
  const locale=normalizeLocale(c.req.param("locale"));const user=await currentUser(c);if(!user)return c.redirect(`/${locale}/login`);
  const credential=await c.env.DB.prepare("SELECT 1 FROM account WHERE userId=? AND providerId='credential'").bind(user.id).first();
  const sessions=await c.env.DB.prepare("SELECT COUNT(*) total FROM session WHERE userId=? AND expiresAt>?").bind(user.id,Date.now()).first<{total:number}>();
  return c.html(page(locale==="el"?"Ασφάλεια":"Security",`<header class="border-b bg-white"><div class="mx-auto flex max-w-4xl items-center justify-between p-5">${brandMark(`/${locale}`,true)}${accountMenu(locale,user)}</div></header><main class="mx-auto max-w-4xl p-5 md:p-10"><a href="/${locale}/account" class="text-sm text-[#76533d]">← ${locale==="el"?"Τα events μου":"My events"}</a><div class="mt-5 grid gap-6"><section class="rounded-3xl bg-white p-6 shadow"><div class="flex items-start justify-between gap-4"><div><p class="text-xs uppercase tracking-[.2em] text-[#8a654f]">Security</p><h1 class="text-4xl">${locale==="el"?"Κωδικός πρόσβασης":"Password"}</h1></div><span class="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700">${locale==="el"?"Προστατευμένος λογαριασμός":"Protected account"}</span></div>${credential?`<form id="password-form" class="mt-6 grid gap-4"><input name="currentPassword" type="password" required autocomplete="current-password" placeholder="${locale==="el"?"Τρέχων κωδικός":"Current password"}" class="rounded-xl border px-4 py-3"><input name="newPassword" type="password" required minlength="10" autocomplete="new-password" placeholder="${locale==="el"?"Νέος κωδικός (τουλάχιστον 10 χαρακτήρες)":"New password (at least 10 characters)"}" class="rounded-xl border px-4 py-3"><label class="flex items-center gap-3 text-sm"><input name="revokeOtherSessions" type="checkbox" checked class="h-4 w-4">${locale==="el"?"Αποσύνδεση από τις άλλες συσκευές":"Sign out other devices"}</label><p id="password-message" class="hidden rounded-xl p-3 text-sm"></p><button class="rounded-xl bg-[#76533d] px-6 py-3 text-white">${locale==="el"?"Αλλαγή κωδικού":"Change password"}</button></form>`:`<div class="mt-6 rounded-2xl bg-[#f7f3ed] p-5"><p>${locale==="el"?"Ο λογαριασμός σου χρησιμοποιεί σύνδεση Google. Μπορείς να δημιουργήσεις κωδικό μέσω της επαναφοράς κωδικού.":"Your account uses Google sign-in. You can create a password through password reset."}</p><a href="/${locale}/forgot-password" class="mt-3 inline-block font-medium text-[#76533d]">${locale==="el"?"Δημιουργία κωδικού":"Create password"}</a></div>`}</section><section class="rounded-3xl bg-white p-6 shadow"><h2 class="text-3xl">${locale==="el"?"Ενεργές συνδέσεις":"Active sessions"}</h2><p class="mt-2 text-[#776a63]">${sessions?.total??1} ${locale==="el"?"ενεργές συνδέσεις στον λογαριασμό.":"active account sessions."}</p><button id="revoke-sessions" class="mt-4 rounded-xl border px-5 py-3">${locale==="el"?"Αποσύνδεση άλλων συσκευών":"Sign out other devices"}</button><p id="session-message" class="mt-3 hidden text-sm text-emerald-700"></p></section></div></main><script>${credential?`document.getElementById('password-form').onsubmit=async e=>{e.preventDefault();const form=new FormData(e.target);const response=await fetch('/api/auth/change-password',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword:form.get('currentPassword'),newPassword:form.get('newPassword'),revokeOtherSessions:form.get('revokeOtherSessions')==='on'})});const message=document.getElementById('password-message');message.classList.remove('hidden');message.className=response.ok?'rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700':'rounded-xl bg-red-50 p-3 text-sm text-red-700';message.textContent=response.ok?${JSON.stringify(locale==="el"?"Ο κωδικός άλλαξε επιτυχώς.":"Password changed successfully.")}:${JSON.stringify(locale==="el"?"Έλεγξε τον τρέχοντα κωδικό και δοκίμασε ξανά.":"Check your current password and try again.")}};`:""}document.getElementById('revoke-sessions').onclick=async()=>{const response=await fetch('/api/auth/revoke-other-sessions',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:'{}'});if(response.ok){const message=document.getElementById('session-message');message.textContent=${JSON.stringify(locale==="el"?"Οι άλλες συνδέσεις τερματίστηκαν.":"Other sessions signed out.")};message.classList.remove('hidden')}}<\/script>${logoutScript(locale)}`));
});

app.get("/:locale{el|en}/account", async (c) => {
  const locale = normalizeLocale(c.req.param("locale")); const m = t(locale);
  const user = await currentUser(c);
  if (!user) return c.redirect(`/${locale}/login`);
  await purgeExpiredTrash(c.env);
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT OR IGNORE INTO event_members (event_id,user_id,role,created_at) SELECT event_id,?,role,? FROM event_invitations WHERE lower(email)=lower(?) AND accepted_at IS NULL AND expires_at>?`).bind(user.id,now,user.email,now),
    c.env.DB.prepare(`UPDATE event_invitations SET accepted_at=? WHERE lower(email)=lower(?) AND accepted_at IS NULL AND expires_at>?`).bind(now,user.email,now),
  ]);
  const query = (c.req.query("q") ?? "").trim().slice(0,100);
  const filter = ["all","owner","shared","upcoming","past"].includes(c.req.query("filter") ?? "") ? c.req.query("filter")! : "all";
  const sort = ["date_asc","date_desc","name_asc","name_desc","created_desc"].includes(c.req.query("sort") ?? "") ? c.req.query("sort")! : "date_desc";
  let where = "em.user_id=? AND e.deleted_at IS NULL"; const bindings: unknown[] = [user.id];
  if(query){where += " AND (e.eventName LIKE ? OR e.code LIKE ?)";bindings.push(`%${query}%`,`%${query}%`)}
  if(filter==="owner") where += " AND em.role='owner'";
  if(filter==="shared") where += " AND em.role!='owner'";
  const today = new Date().toISOString().slice(0,10);
  if(filter==="upcoming"){where += " AND COALESCE(e.event_end_date,e.event_start_date)>=?";bindings.push(today)}
  if(filter==="past"){where += " AND COALESCE(e.event_end_date,e.event_start_date)<?";bindings.push(today)}
  const order = sort==="date_asc" ? "COALESCE(e.event_start_date,'9999') ASC" : sort==="name_asc" ? "e.eventName COLLATE NOCASE ASC" : sort==="name_desc" ? "e.eventName COLLATE NOCASE DESC" : sort==="created_desc" ? "e.created_at DESC" : "COALESCE(e.event_start_date,'0000') DESC";
  const events = await c.env.DB.prepare(`SELECT e.*,em.role,COUNT(md.id) media_count FROM event_members em JOIN events e ON e.id=em.event_id LEFT JOIN media md ON md.event_id=e.id AND md.deleted_at IS NULL WHERE ${where} GROUP BY e.id,em.role ORDER BY ${order}`).bind(...bindings).all<EventRow & {role:string;media_count:number}>();
  const eventCards = events.results.map(event=>`<article class="rounded-2xl border bg-white p-5 shadow-sm"><div class="flex items-start justify-between gap-3"><div><p class="font-mono text-sm text-[#8a654f]">${esc(event.code)}</p><h2 class="mt-1 text-2xl">${esc(event.eventName)}</h2></div><span class="rounded-full bg-[#f1e8e1] px-2.5 py-1 text-xs">${event.role==="owner"?(locale==="el"?"Ιδιοκτήτης":"Owner"):(locale==="el"?"Συνεργάτης":"Collaborator")}</span></div><p class="mt-2 text-sm font-medium text-[#76533d]">${esc(formatEventDates(event,locale))}</p><p class="mt-2 text-sm text-[#776a63]">${event.media_count} uploads</p><div class="mt-4 flex flex-wrap gap-2"><a href="/dashboard/${event.code}?lang=${locale}" class="rounded-lg bg-[#76533d] px-4 py-2 text-sm text-white">${locale==="el"?"Άνοιγμα":"Open"}</a>${event.role==="owner"?`<a href="/dashboard/${event.code}?lang=${locale}#event-details" class="rounded-lg border px-4 py-2 text-sm">Edit</a><form action="/api/account/events/${event.code}/trash" method="post" onsubmit="return confirm('${locale==="el"?"Μεταφορά του event στον κάδο;":"Move this event to trash?"}')"><input type="hidden" name="locale" value="${locale}"><button class="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700">${locale==="el"?"Διαγραφή":"Delete"}</button></form>`:""}</div></article>`).join("");
  const filterLabel = locale==="el"?{all:"Όλα",owner:"Δικά μου",shared:"Κοινόχρηστα",upcoming:"Επερχόμενα",past:"Παλαιότερα"}:{all:"All",owner:"Owned",shared:"Shared",upcoming:"Upcoming",past:"Past"};
  return c.html(page(m.dashboard,`<header class="border-b bg-white"><div class="mx-auto flex max-w-6xl items-center justify-between p-5">${brandMark(`/${locale}`,true)}${accountMenu(locale,user)}</div></header><main class="mx-auto max-w-6xl p-5 md:p-10"><div class="flex flex-wrap items-end justify-between gap-3"><div><p class="text-sm uppercase tracking-[.2em] text-[#8a654f]">Dashboard</p><h1 class="text-4xl">${m.dashboard}</h1></div><a href="/${locale}/trash" class="rounded-xl border px-4 py-2">🗑 ${locale==="el"?"Κάδος":"Trash"}</a><button id="open-new-event" class="rounded-xl bg-[#76533d] px-4 py-2 text-white">＋ ${m.createEvent}</button></div><form method="get" class="mt-6 grid gap-3 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-[1fr_auto_auto_auto]"><input name="q" value="${esc(query)}" placeholder="${locale==="el"?"Αναζήτηση event":"Search events"}" class="rounded-xl border px-4 py-3"><select name="filter" class="rounded-xl border px-4 py-3">${Object.entries(filterLabel).map(([v,l])=>`<option value="${v}"${filter===v?" selected":""}>${l}</option>`).join("")}</select><select name="sort" class="rounded-xl border px-4 py-3"><option value="date_desc"${sort==="date_desc"?" selected":""}>${locale==="el"?"Νεότερη ημερομηνία":"Newest date"}</option><option value="date_asc"${sort==="date_asc"?" selected":""}>${locale==="el"?"Παλαιότερη ημερομηνία":"Oldest date"}</option><option value="name_asc"${sort==="name_asc"?" selected":""}>A → Z</option><option value="name_desc"${sort==="name_desc"?" selected":""}>Z → A</option><option value="created_desc"${sort==="created_desc"?" selected":""}>${locale==="el"?"Πρόσφατα albums":"Recently created"}</option></select><button class="rounded-xl bg-[#2f241f] px-5 text-white">${locale==="el"?"Εφαρμογή":"Apply"}</button></form><div class="mt-6 grid gap-4 md:grid-cols-2">${eventCards||`<div class="rounded-2xl bg-white p-10 text-center text-[#776a63]">${locale==="el"?"Δεν βρέθηκαν events.":"No events found."}</div>`}</div></main><dialog id="new-event" class="w-[min(92vw,600px)] rounded-3xl border-0 bg-white p-0 shadow-2xl backdrop:bg-[#2f241f]/60"><div class="p-6 sm:p-8"><div class="flex items-center justify-between"><div><p class="text-xs uppercase tracking-[.2em] text-[#8a654f]">Memboux</p><h2 class="text-3xl">${m.createEvent}</h2></div><button type="button" id="close-new-event" class="flex h-10 w-10 items-center justify-center rounded-full border text-xl">×</button></div><form action="/api/account/events" method="post" class="mt-6 grid gap-4 md:grid-cols-2"><input type="hidden" name="locale" value="${locale}"><label class="md:col-span-2"><span class="mb-1 block text-sm font-medium">${m.eventName}</span><input name="eventName" required maxlength="100" placeholder="${m.eventName}" class="w-full rounded-xl border px-4 py-3"></label><label class="text-sm">${locale==="el"?"Ημερομηνία έναρξης":"Start date"}<input name="eventStartDate" type="date" required class="mt-1 w-full rounded-xl border px-4 py-3"></label><label class="text-sm">${locale==="el"?"Ημερομηνία λήξης (προαιρετικά)":"End date (optional)"}<input name="eventEndDate" type="date" class="mt-1 w-full rounded-xl border px-4 py-3"></label><button class="rounded-xl bg-[#76533d] py-3 font-medium text-white md:col-span-2">${m.createEvent}</button></form></div></dialog><script>const newEventDialog=document.getElementById('new-event');document.getElementById('open-new-event').onclick=()=>newEventDialog.showModal();document.getElementById('close-new-event').onclick=()=>newEventDialog.close();newEventDialog.onclick=e=>{if(e.target===newEventDialog)newEventDialog.close()}<\/script>${logoutScript(locale)}`));
});

app.get("/:locale{el|en}/account-legacy", async (c) => {
  const locale = normalizeLocale(c.req.param("locale")); const m = t(locale);
  const user = await currentUser(c);
  if (!user) return c.redirect(`/${locale}/login`);
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT OR IGNORE INTO event_members (event_id,user_id,role,created_at)
      SELECT event_id, ?, role, ? FROM event_invitations
      WHERE lower(email)=lower(?) AND accepted_at IS NULL AND expires_at>?`).bind(user.id, now, user.email, now),
    c.env.DB.prepare(`UPDATE event_invitations SET accepted_at=?
      WHERE lower(email)=lower(?) AND accepted_at IS NULL AND expires_at>?`).bind(now, user.email, now),
  ]);
  const events = await c.env.DB.prepare(`SELECT e.*, em.role, COUNT(md.id) media_count FROM event_members em JOIN events e ON e.id=em.event_id LEFT JOIN media md ON md.event_id=e.id WHERE em.user_id=? GROUP BY e.id, em.role ORDER BY e.created_at DESC`).bind(user.id).all<EventRow & { role: string; media_count: number }>();
  const list = events.results.map((event) => `<a href="/dashboard/${event.code}?lang=${locale}" class="rounded-2xl border bg-white p-5 shadow-sm"><div class="flex items-start justify-between gap-3"><p class="font-mono text-sm text-[#8a654f]">${event.code}</p><span class="rounded-full bg-[#f1e8e1] px-2.5 py-1 text-xs font-medium text-[#76533d]">${event.role === "owner" ? (locale === "el" ? "Ιδιοκτήτης" : "Owner") : (locale === "el" ? "Συνεργάτης" : "Collaborator")}</span></div><h2 class="mt-1 text-xl font-bold">${esc(event.eventName)}</h2><p class="mt-2 text-sm font-medium text-[#76533d]">${esc(formatEventDates(event, locale))}</p><p class="mt-2 text-sm text-[#776a63]">${event.media_count} uploads</p></a>`).join("");
  return c.html(page(m.dashboard, `<header class="border-b bg-white"><div class="mx-auto flex max-w-6xl items-center justify-between p-5">${brandMark(`/${locale}`, true)}<div class="flex items-center gap-3"><span class="hidden text-sm text-[#776a63] md:inline">${esc(user.email)}</span><button id="logout" class="rounded-xl border px-4 py-2 text-sm font-semibold">${m.logout}</button></div></div></header><main class="mx-auto max-w-6xl p-5 md:p-10"><div class="flex items-end justify-between"><div><p class="text-sm font-semibold uppercase tracking-[.2em] text-[#8a654f]">Dashboard</p><h1 class="mt-1 text-4xl font-bold">${m.dashboard}</h1></div></div><form action="/api/account/events" method="post" class="mt-8 grid gap-3 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-2"><input type="hidden" name="locale" value="${locale}"><label class="md:col-span-2"><span class="mb-1 block text-sm font-medium">${m.eventName}</span><input name="eventName" required maxlength="100" placeholder="${m.eventName}" class="w-full rounded-xl border px-4 py-3"></label><label><span class="mb-1 block text-sm font-medium">${locale === "el" ? "Ημερομηνία έναρξης" : "Start date"}</span><input name="eventStartDate" type="date" required class="w-full rounded-xl border px-4 py-3"></label><label><span class="mb-1 block text-sm font-medium">${locale === "el" ? "Ημερομηνία λήξης (προαιρετικά)" : "End date (optional)"}</span><input name="eventEndDate" type="date" class="w-full rounded-xl border px-4 py-3"></label><button class="rounded-xl bg-[#8a654f] px-5 py-3 font-semibold text-white md:col-span-2">${m.createEvent}</button></form><div class="mt-6 grid gap-4 md:grid-cols-2">${list || `<div class="rounded-2xl bg-white p-10 text-center text-[#776a63]">${locale === "el" ? "Δεν έχεις events ακόμη." : "You don't have any events yet."}</div>`}</div></main><script>const logoutButton=document.getElementById('logout');logoutButton.onclick=async()=>{logoutButton.disabled=true;const response=await fetch('/api/auth/sign-out',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok){logoutButton.disabled=false;alert(${JSON.stringify(locale === "el" ? "Η αποσύνδεση απέτυχε. Δοκίμασε ξανά." : "Sign out failed. Please try again.")});return}location.replace('/${locale}')}<\/script>`));
});

app.post("/api/account/events", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const body = await c.req.parseBody(); const eventName = String(body.eventName ?? "").trim().slice(0, 100); const locale = normalizeLocale(String(body.locale ?? "el"));
  const eventStartDate = validEventDate(body.eventStartDate);
  const eventEndDate = body.eventEndDate ? validEventDate(body.eventEndDate) : eventStartDate;
  if (!eventName || !eventStartDate || !eventEndDate || eventEndDate < eventStartDate) return c.text(locale === "el" ? "Έλεγξε το όνομα και τις ημερομηνίες του event." : "Check the event name and dates.", 400);
  const id = crypto.randomUUID(); const token = crypto.randomUUID() + crypto.randomUUID(); const tokenHash = await sha256(token); const now = Date.now();
  for (let attempt=0; attempt<5; attempt++) { const code=randomCode(); try { await c.env.DB.batch([c.env.DB.prepare("INSERT INTO events (id,code,eventName,admin_token_hash,created_at,expires_at,status,notes,updated_at,default_locale,event_start_date,event_end_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,code,eventName,tokenHash,now,now+365*86400000,"active","",now,locale,eventStartDate,eventEndDate),c.env.DB.prepare("INSERT INTO event_members (event_id,user_id,role,created_at) VALUES (?,?,?,?)").bind(id,user.id,"owner",now)]); return c.redirect(`/${locale}/account`,303); } catch(error) { if(attempt===4) throw error; } }
  return c.text("Could not create event",500);
});

app.post("/api/account/events/:code/trash", async (c) => {
  const user=await currentUser(c); if(!user) return c.text("Unauthorized",401);
  const event=await getEvent(c.env.DB,c.req.param("code")); if(!event) return c.text("Event not found",404);
  const owner=await c.env.DB.prepare("SELECT 1 FROM event_members WHERE event_id=? AND user_id=? AND role='owner'").bind(event.id,user.id).first(); if(!owner) return c.text("Forbidden",403);
  const body=await c.req.parseBody(); const locale=normalizeLocale(String(body.locale??event.default_locale)); const now=Date.now();
  await c.env.DB.prepare("UPDATE events SET deleted_at=?,purge_at=?,updated_at=? WHERE id=?").bind(now,now+TRASH_RETENTION_MS,now,event.id).run();
  return c.redirect(`/${locale}/account`,303);
});

app.post("/api/account/events/:code/restore", async (c) => {
  const user=await currentUser(c); if(!user) return c.text("Unauthorized",401);
  const event=await getEvent(c.env.DB,c.req.param("code"),true); if(!event) return c.text("Event not found",404);
  const owner=await c.env.DB.prepare("SELECT 1 FROM event_members WHERE event_id=? AND user_id=? AND role='owner'").bind(event.id,user.id).first(); if(!owner) return c.text("Forbidden",403);
  const body=await c.req.parseBody(); const locale=normalizeLocale(String(body.locale??event.default_locale));
  await c.env.DB.prepare("UPDATE events SET deleted_at=NULL,purge_at=NULL,updated_at=? WHERE id=?").bind(Date.now(),event.id).run();
  return c.redirect(`/${locale}/trash`,303);
});

app.get("/:locale{el|en}/trash", async(c)=>{
  const locale=normalizeLocale(c.req.param("locale")); const user=await currentUser(c); if(!user) return c.redirect(`/${locale}/login`);
  await purgeExpiredTrash(c.env);
  const events=await c.env.DB.prepare(`SELECT e.* FROM events e JOIN event_members em ON em.event_id=e.id WHERE em.user_id=? AND em.role='owner' AND e.deleted_at IS NOT NULL ORDER BY e.purge_at`).bind(user.id).all<EventRow>();
  const media=await c.env.DB.prepare(`SELECT md.*,e.eventName,e.code FROM media md JOIN events e ON e.id=md.event_id JOIN event_members em ON em.event_id=e.id WHERE em.user_id=? AND em.role IN ('owner','editor') AND md.deleted_at IS NOT NULL AND e.deleted_at IS NULL ORDER BY md.purge_at`).bind(user.id).all<MediaRow & {eventName:string;code:string}>();
  const eventRows=events.results.map(e=>`<div class="flex flex-col gap-3 rounded-2xl border bg-white p-5 sm:flex-row sm:items-center sm:justify-between"><div><span class="text-xs uppercase text-[#8a654f]">Event</span><h2 class="text-2xl">${esc(e.eventName)}</h2><p class="text-sm text-red-700">${locale==="el"?"Οριστική διαγραφή":"Permanent deletion"}: ${formatDateTime(e.purge_at!,locale)}</p></div><form action="/api/account/events/${e.code}/restore" method="post"><input type="hidden" name="locale" value="${locale}"><button class="rounded-xl border px-4 py-2">${locale==="el"?"Επαναφορά":"Restore"}</button></form></div>`).join("");
  const mediaRows=media.results.map(m=>`<div class="flex items-center gap-4 rounded-2xl border bg-white p-4"><div class="flex h-20 w-20 items-center justify-center rounded-xl bg-[#eadfd6] text-2xl">${m.media_type==="image"?"▧":"▶"}</div><div class="min-w-0 flex-1"><p class="truncate font-medium">${esc(m.title||m.uploaded_by)}</p><p class="truncate text-xs text-[#776a63]">${esc(m.eventName)}</p><p class="text-xs text-red-700">${locale==="el"?"Οριστική διαγραφή":"Permanent deletion"}: ${formatDateTime(m.purge_at!,locale)}</p></div><form action="/api/account/events/${m.code}/media/${m.id}/restore" method="post"><input type="hidden" name="locale" value="${locale}"><button class="rounded-xl border px-3 py-2 text-sm">${locale==="el"?"Επαναφορά":"Restore"}</button></form></div>`).join("");
  return c.html(page(locale==="el"?"Κάδος":"Trash",`<header class="border-b bg-white"><div class="mx-auto flex max-w-5xl items-center justify-between p-5">${brandMark(`/${locale}`,true)}${accountMenu(locale,user)}</div></header><main class="mx-auto max-w-5xl p-5 md:p-10"><a href="/${locale}/account" class="text-sm text-[#76533d]">← ${locale==="el"?"Τα events μου":"My events"}</a><h1 class="mt-4 text-4xl">${locale==="el"?"Κάδος":"Trash"}</h1><p class="mt-2 text-[#776a63]">${locale==="el"?"Τα στοιχεία διαγράφονται οριστικά 30 ημέρες μετά τη μεταφορά τους εδώ.":"Items are permanently deleted 30 days after being moved here."}</p><h2 class="mt-8 text-2xl">Events</h2><div class="mt-3 space-y-3">${eventRows||`<p class="rounded-2xl bg-white p-6 text-[#776a63]">${locale==="el"?"Δεν υπάρχουν διαγραμμένα events.":"No deleted events."}</p>`}</div><h2 class="mt-8 text-2xl">Media</h2><div class="mt-3 grid gap-3 md:grid-cols-2">${mediaRows||`<p class="rounded-2xl bg-white p-6 text-[#776a63]">${locale==="el"?"Δεν υπάρχουν διαγραμμένες φωτογραφίες.":"No deleted media."}</p>`}</div></main>${logoutScript(locale)}`));
});

app.get("/admin/login", async (c) => {
  if (await isAdmin(c)) return c.redirect("/admin");
  const configured = Boolean(c.env.ADMIN_PASSWORD);
  return c.html(page("Admin Login – Memboux", `<main class="flex min-h-screen items-center justify-center p-5"><section class="w-full max-w-md rounded-3xl border border-[#e6d8ce] bg-white/95 p-8 shadow-[0_24px_70px_rgba(71,50,40,.12)]"><p class="text-sm font-semibold uppercase tracking-[.2em] text-[#8a654f]">Memboux Admin</p><h1 class="mt-2 text-3xl font-bold">Ιδιωτική διαχείριση</h1><p class="mt-2 text-[#776a63]">Πρόσβαση μόνο για τον διαχειριστή.</p>${configured ? `<form action="/admin/login" method="post" class="mt-7 space-y-3"><input name="password" type="password" required autocomplete="current-password" placeholder="Admin password" class="w-full rounded-xl border px-4 py-3"><button class="w-full rounded-xl bg-[#2f241f] py-3 font-semibold text-white">Σύνδεση</button></form>` : `<div class="mt-7 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Το ADMIN_PASSWORD δεν έχει ρυθμιστεί ακόμη στη Cloudflare.</div>`}</section></main>`));
});

app.post("/admin/login", async (c) => {
  const configured = c.env.ADMIN_PASSWORD;
  if (!configured) return c.text("Το admin password δεν έχει ρυθμιστεί.", 503);
  const body = await c.req.parseBody();
  if (String(body.password ?? "") !== configured) return c.html(page("Λάθος password", `<main class="flex min-h-screen items-center justify-center p-5"><section class="rounded-3xl bg-white p-8 text-center shadow-xl"><h1 class="text-2xl font-bold">Λάθος password</h1><a href="/admin/login" class="mt-5 inline-block text-[#8a654f]">Δοκίμασε ξανά</a></section></main>`), 401);
  c.header("Set-Cookie", `${ADMIN_COOKIE}=${await adminSession(configured)}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`);
  return c.redirect("/admin", 303);
});

app.post("/admin/logout", (c) => {
  c.header("Set-Cookie", `${ADMIN_COOKIE}=; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
  return c.redirect("/admin/login", 303);
});

app.get("/admin", async (c) => {
  if (!await isAdmin(c)) return c.redirect("/admin/login");
  const query = (c.req.query("q") ?? "").trim().slice(0, 100);
  const status = c.req.query("status") === "archived" ? "archived" : c.req.query("status") === "active" ? "active" : "all";
  let sql = `SELECT e.*, COUNT(m.id) AS media_count FROM events e LEFT JOIN media m ON m.event_id=e.id WHERE 1=1`;
  const binds: string[] = [];
  if (query) { sql += ` AND (e.eventName LIKE ? OR e.code LIKE ?)`; binds.push(`%${query}%`, `%${query.toUpperCase()}%`); }
  if (status !== "all") { sql += ` AND e.status = ?`; binds.push(status); }
  sql += ` GROUP BY e.id ORDER BY CASE e.status WHEN 'active' THEN 0 ELSE 1 END, e.created_at DESC`;
  const result = await c.env.DB.prepare(sql).bind(...binds).all<EventRow & { media_count: number }>();
  const counts = await c.env.DB.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) active, SUM(CASE WHEN status='archived' THEN 1 ELSE 0 END) archived FROM events`).first<{ total: number; active: number; archived: number }>();
  const rows = result.results.map((event) => `<a href="/admin/events/${encodeURIComponent(event.code)}" class="grid gap-3 rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md md:grid-cols-[1fr_auto_auto_auto] md:items-center"><div><div class="flex flex-wrap items-center gap-2"><h2 class="text-lg font-bold">${esc(event.eventName)}</h2><span class="rounded-full px-2 py-1 text-xs font-semibold ${event.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-[#665a54]"}">${event.status === "active" ? "Ενεργό" : "Αρχειοθετημένο"}</span></div><p class="mt-1 font-mono text-sm text-[#8a654f]">${esc(event.code)}</p>${event.notes ? `<p class="mt-2 line-clamp-1 text-sm text-[#776a63]">${esc(event.notes)}</p>` : ""}</div><div class="text-sm text-[#776a63]"><strong class="block text-lg text-[#3b2a23]">${event.media_count}</strong>αρχεία</div><div class="text-sm text-[#776a63]"><strong class="block text-[#3b2a23]">${formatDate(event.created_at)}</strong>δημιουργία</div><div class="text-sm text-[#776a63]"><strong class="block text-[#3b2a23]">${formatDate(event.expires_at)}</strong>λήξη</div></a>`).join("");
  return c.html(adminShell("Βιβλιοθήκη", `<main class="mx-auto max-w-7xl p-5 md:p-10"><div class="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><p class="text-sm font-semibold uppercase tracking-[.2em] text-[#8a654f]">Βιβλιοθήκη</p><h1 class="mt-1 text-4xl font-bold">Όλα τα events</h1><p class="mt-2 text-[#776a63]">${counts?.total ?? 0} συνολικά · ${counts?.active ?? 0} ενεργά · ${counts?.archived ?? 0} αρχειοθετημένα</p></div><a href="/" class="rounded-xl bg-[#8a654f] px-5 py-3 text-center font-semibold text-white">Νέο event</a></div><form class="mb-6 grid gap-3 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-[1fr_auto_auto]"><input name="q" value="${esc(query)}" placeholder="Αναζήτηση ονόματος ή κωδικού" class="rounded-xl border px-4 py-3"><select name="status" class="rounded-xl border px-4 py-3"><option value="all"${status === "all" ? " selected" : ""}>Όλα</option><option value="active"${status === "active" ? " selected" : ""}>Ενεργά</option><option value="archived"${status === "archived" ? " selected" : ""}>Αρχειοθετημένα</option></select><button class="rounded-xl bg-[#3b2a23] px-5 py-3 font-semibold text-white">Φιλτράρισμα</button></form><div class="space-y-3">${rows || `<div class="rounded-2xl bg-white py-16 text-center text-[#776a63]">Δεν βρέθηκαν events.</div>`}</div></main>`));
});

app.get("/admin/events/:code", async (c) => {
  if (!await isAdmin(c)) return c.redirect("/admin/login");
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Το event δεν βρέθηκε.", 404);
  const items = await getMedia(c.env.DB, event.id);
  const guestUrl = `${new URL(c.req.url).origin}/gallery/${event.code}`;
  return c.html(adminShell(event.eventName, `<main class="mx-auto max-w-7xl p-5 md:p-10"><a href="/admin" class="text-sm font-medium text-[#8a654f]">← Πίσω στη βιβλιοθήκη</a><div class="mt-5 grid gap-6 lg:grid-cols-[420px_1fr]"><section class="rounded-3xl bg-white p-6 shadow-lg"><div class="flex items-start justify-between gap-3"><div><p class="font-mono text-sm text-[#8a654f]">${esc(event.code)}</p><h1 class="mt-1 text-3xl font-bold">${esc(event.eventName)}</h1></div><span class="rounded-full px-3 py-1 text-xs font-semibold ${event.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-[#665a54]"}">${event.status === "active" ? "Ενεργό" : "Αρχειοθετημένο"}</span></div><form action="/admin/events/${encodeURIComponent(event.code)}/update" method="post" class="mt-7 space-y-4"><label class="block text-sm font-semibold">Όνομα event<input name="eventName" required maxlength="100" value="${esc(event.eventName)}" class="mt-1 w-full rounded-xl border px-4 py-3 font-normal"></label><label class="block text-sm font-semibold">Κατάσταση<select name="status" class="mt-1 w-full rounded-xl border px-4 py-3 font-normal"><option value="active"${event.status === "active" ? " selected" : ""}>Ενεργό</option><option value="archived"${event.status === "archived" ? " selected" : ""}>Αρχειοθετημένο</option></select></label><label class="block text-sm font-semibold">Ημερομηνία λήξης<input name="expires_at" type="date" required value="${dateInput(event.expires_at)}" class="mt-1 w-full rounded-xl border px-4 py-3 font-normal"></label><label class="block text-sm font-semibold">Εσωτερικές σημειώσεις<textarea name="notes" maxlength="2000" rows="6" class="mt-1 w-full rounded-xl border px-4 py-3 font-normal" placeholder="Πληροφορίες, συμφωνίες, εκκρεμότητες…">${esc(event.notes)}</textarea></label><button class="w-full rounded-xl bg-[#2f241f] py-3 font-semibold text-white">Αποθήκευση αλλαγών</button></form><div class="mt-5"><a href="${esc(guestUrl)}" target="_blank" class="block rounded-xl border px-4 py-3 text-center text-sm font-semibold">Άνοιγμα guest gallery</a></div></section><section class="rounded-3xl bg-white p-6 shadow-lg"><div class="mb-5 flex items-center justify-between"><div><p class="text-sm text-[#776a63]">Δημιουργήθηκε ${formatDate(event.created_at)}</p><h2 class="text-2xl font-bold">Αρχεία (${items.length})</h2></div></div>${items.length ? `<div class="grid grid-cols-2 gap-4 md:grid-cols-3">${cards(items)}</div>` : `<p class="py-16 text-center text-[#776a63]">Δεν υπάρχουν uploads.</p>`}</section></div></main>`));
});

app.post("/admin/events/:code/update", async (c) => {
  if (!await isAdmin(c)) return c.redirect("/admin/login");
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Το event δεν βρέθηκε.", 404);
  const body = await c.req.parseBody();
  const eventName = String(body.eventName ?? "").trim().slice(0, 100);
  const status = body.status === "archived" ? "archived" : "active";
  const notes = String(body.notes ?? "").trim().slice(0, 2000);
  const expiresAt = Date.parse(`${String(body.expires_at ?? "")}T23:59:59.999Z`);
  if (!eventName || !Number.isFinite(expiresAt)) return c.text("Μη έγκυρα στοιχεία.", 400);
  await c.env.DB.prepare("UPDATE events SET eventName=?, status=?, notes=?, expires_at=?, updated_at=? WHERE id=?").bind(eventName, status, notes, expiresAt, Date.now(), event.id).run();
  return c.redirect(`/admin/events/${event.code}`, 303);
});

app.get("/", (c) => c.html(page("Memboux", `<main class="mx-auto flex min-h-screen max-w-lg items-center p-5"><section class="w-full rounded-3xl bg-white p-8 shadow-xl"><p class="mb-2 text-center text-sm font-semibold uppercase tracking-[.25em] text-[#a77d66]">Memboux</p><h1 class="mb-3 text-center text-4xl font-bold">Οι αναμνήσεις σας, μαζί</h1><p class="mb-8 text-center text-[#776a63]">Δημιούργησε μια ιδιωτική συλλογή για το event σου.</p><form action="/api/events" method="post" class="space-y-3"><input name="eventName" required maxlength="100" placeholder="π.χ. Summer Party 2026" class="w-full rounded-xl border px-4 py-3"><button class="w-full rounded-xl bg-gradient-to-r from-[#caa58f] to-[#76533d] py-3 font-semibold text-white">Δημιουργία εκδήλωσης</button></form><div class="my-7 border-t"></div><form id="join" class="space-y-3"><input id="code" required maxlength="6" placeholder="Κωδικός πρόσκλησης" class="w-full rounded-xl border px-4 py-3 uppercase"><button class="w-full rounded-xl bg-[#5a4438] py-3 font-semibold text-white">Είσοδος ως καλεσμένος</button></form></section></main><script>document.getElementById('join').addEventListener('submit',e=>{e.preventDefault();location.href='/gallery/'+document.getElementById('code').value.trim().toUpperCase()})<\/script>`)));

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

app.get("/dashboard/:code", async (c) => {
  const locale = normalizeLocale(c.req.query("lang") ?? "en");
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text(locale === "el" ? "Το event δεν βρέθηκε." : "Event not found.", 404);
  const token = c.req.query("token") ?? "";
  let allowed = Boolean(token && await sha256(token) === event.admin_token_hash);
  const user = await currentUser(c);
  const membership = user ? await c.env.DB.prepare("SELECT role FROM event_members WHERE event_id=? AND user_id=?").bind(event.id, user.id).first<{ role: "owner" | "editor" | "viewer" }>() : null;
  if (!allowed) allowed = Boolean(membership);
  if (!allowed) return c.text(locale === "el" ? "Δεν έχεις πρόσβαση σε αυτή τη διαχείριση." : "You do not have access to this dashboard.", 403);
  const items = await getMedia(c.env.DB, event.id);
  const canManageMembers = membership?.role === "owner";
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
  const detailsPanel = canManageMembers ? `<section id="event-details" class="mb-6 rounded-3xl bg-white p-5 shadow-lg sm:p-7"><h2 class="text-2xl">${labels.eventDates}</h2><form action="/api/account/events/${encodeURIComponent(event.code)}/details" method="post" class="mt-4 grid gap-3 md:grid-cols-2"><input type="hidden" name="locale" value="${locale}"><label class="md:col-span-2"><span class="mb-1 block text-sm font-medium">${locale === "el" ? "Όνομα event" : "Event name"}</span><input name="eventName" required maxlength="100" value="${esc(event.eventName)}" class="w-full rounded-xl border px-4 py-3"></label><label><span class="mb-1 block text-sm font-medium">${labels.startDate}</span><input name="eventStartDate" type="date" required value="${esc(event.event_start_date ?? "")}" class="w-full rounded-xl border px-4 py-3"></label><label><span class="mb-1 block text-sm font-medium">${labels.endDate}</span><input name="eventEndDate" type="date" value="${esc(event.event_end_date ?? "")}" class="w-full rounded-xl border px-4 py-3"></label><button class="rounded-xl bg-[#76533d] px-5 py-3 font-medium text-white md:col-span-2">${labels.saveDates}</button></form></section>` : "";
  const teamPanel = canManageMembers ? `${detailsPanel}<section class="mb-6 rounded-3xl bg-white p-5 shadow-lg sm:p-7"><div class="grid gap-7 lg:grid-cols-[1fr_1fr]"><div><h2 class="text-2xl">${labels.team}</h2><div class="mt-4 space-y-3">${members.map((member) => `<div class="flex items-center justify-between gap-3 rounded-2xl border p-4"><div class="min-w-0"><p class="truncate font-medium">${esc(member.name)}</p><p class="truncate text-sm text-[#776a63]">${esc(member.email)}</p></div>${member.role === "owner" ? `<span class="rounded-full bg-[#f1e8e1] px-3 py-1 text-xs">Owner</span>` : `<form action="/api/account/events/${encodeURIComponent(event.code)}/members/remove" method="post"><input type="hidden" name="userId" value="${esc(member.user_id)}"><input type="hidden" name="locale" value="${locale}"><button class="text-sm font-medium text-red-700">${labels.remove}</button></form>`}</div>`).join("")}${invitations.map((invite) => `<div class="flex items-center justify-between gap-3 rounded-2xl border border-dashed p-4"><div class="min-w-0"><p class="truncate">${esc(invite.email)}</p><p class="text-xs text-[#776a63]">${labels.pending}</p></div><form action="/api/account/events/${encodeURIComponent(event.code)}/members/remove" method="post"><input type="hidden" name="invitationId" value="${esc(invite.id)}"><input type="hidden" name="locale" value="${locale}"><button class="text-sm font-medium text-red-700">${labels.remove}</button></form></div>`).join("")}</div></div><div class="rounded-2xl bg-[#faf6f1] p-5"><h2 class="text-2xl">${labels.invite}</h2><p class="mt-1 text-sm text-[#776a63]">${labels.inviteHelp}</p><form action="/api/account/events/${encodeURIComponent(event.code)}/invite" method="post" class="mt-5 space-y-3"><input type="hidden" name="locale" value="${locale}"><input name="email" type="email" required maxlength="254" placeholder="name@example.com" class="w-full rounded-xl border bg-white px-4 py-3"><button class="w-full rounded-xl bg-[#76533d] px-5 py-3 font-medium text-white">${labels.sendInvite}</button></form></div></div></section>` : "";
  return c.html(page(`${event.eventName} – ${labels.title}`, `<header class="border-b bg-white"><div class="mx-auto flex max-w-6xl items-center justify-between gap-3 p-4 sm:p-5">${brandMark(`/${locale}`, true)}<div class="flex items-center gap-2"><a href="/${locale}/account" class="rounded-lg bg-[#76533d] px-3 py-2 text-sm font-semibold text-white sm:px-4">← ${labels.events}</a><a href="${toggleUrl}" class="rounded-lg border px-3 py-2 text-sm font-semibold">${otherLocale.toUpperCase()}</a></div></div></header><main class="mx-auto max-w-6xl p-4 sm:p-5 md:p-10"><section class="mb-6 rounded-3xl bg-white p-5 shadow-lg sm:p-7"><p class="text-sm font-semibold uppercase tracking-[.18em] text-[#9b725c]">${labels.title}</p><h1 class="mt-2 break-words text-3xl font-bold sm:text-4xl">${esc(event.eventName)}</h1><p class="mt-2 text-lg font-medium text-[#76533d]">${esc(formatEventDates(event, locale))}</p><p class="mt-3">${labels.code}: <strong class="font-mono text-2xl text-[#76533d]">${esc(event.code)}</strong></p><div class="mt-7 grid items-center gap-7 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]"><div class="mx-auto w-full max-w-[220px] overflow-hidden rounded-2xl border bg-white p-3">${qrSvg}</div><div class="min-w-0"><h2 class="text-xl font-bold">${labels.qr}</h2><p class="mt-2 text-sm text-[#776a63]">${labels.qrHelp}</p><a href="${esc(guestUrl)}" target="_blank" class="mt-3 block max-w-full break-all text-sm font-semibold text-[#76533d]">${esc(guestUrl)}</a><div class="mt-4 flex flex-col gap-2 sm:flex-row"><input id="link" readonly value="${esc(guestUrl)}" class="w-full min-w-0 flex-1 rounded-xl border px-4 py-3"><button id="copy" class="shrink-0 rounded-xl bg-[#4b382e] px-5 py-3 text-white">${labels.copy}</button></div></div></div></section>${teamPanel}<section class="rounded-3xl bg-white p-5 shadow-lg sm:p-7"><div class="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 class="text-2xl font-bold">${labels.gallery} (${items.length})</h2><div class="flex gap-2"><button id="download-selected" class="rounded-lg border px-3 py-2 text-sm">${locale==="el"?"Λήψη επιλεγμένων":"Download selected"}</button><button id="delete-selected" class="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700">${locale==="el"?"Διαγραφή επιλεγμένων":"Delete selected"}</button></div></div><form id="bulk-media" action="/api/account/events/${event.code}/media/bulk-trash" method="post"><input type="hidden" name="locale" value="${locale}"><input type="hidden" id="media-ids" name="ids">${items.length ? `<div class="grid grid-cols-2 gap-4 md:grid-cols-3">${cards(items,{code:event.code,locale,selectable:true,manage:true})}</div>` : `<p class="py-12 text-center text-[#776a63]">${labels.empty}</p>`}</form></section></main><script>document.getElementById('copy').onclick=()=>navigator.clipboard.writeText(document.getElementById('link').value);const selected=()=>[...document.querySelectorAll('.media-select:checked')];document.getElementById('download-selected').onclick=()=>selected().forEach((box,i)=>setTimeout(()=>{const a=document.createElement('a');a.href=box.dataset.download;a.download='';a.click()},i*250));document.getElementById('delete-selected').onclick=()=>{const ids=selected().map(x=>x.value);if(!ids.length)return;if(confirm('Move selected media to trash?')){document.getElementById('media-ids').value=ids.join(',');document.getElementById('bulk-media').submit()}}<\/script>`));
});

app.post("/api/account/events/:code/details", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  const owner = await c.env.DB.prepare("SELECT 1 FROM event_members WHERE event_id=? AND user_id=? AND role='owner'").bind(event.id, user.id).first();
  if (!owner) return c.text("Only the event owner can update event details", 403);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  const eventName = String(body.eventName ?? "").trim().slice(0, 100);
  const eventStartDate = validEventDate(body.eventStartDate);
  const eventEndDate = body.eventEndDate ? validEventDate(body.eventEndDate) : eventStartDate;
  if (!eventName || !eventStartDate || !eventEndDate || eventEndDate < eventStartDate) return c.text(locale === "el" ? "Έλεγξε το όνομα και τις ημερομηνίες του event." : "Check the event name and dates.", 400);
  await c.env.DB.prepare("UPDATE events SET eventName=?,event_start_date=?,event_end_date=?,updated_at=? WHERE id=?").bind(eventName, eventStartDate, eventEndDate, Date.now(), event.id).run();
  return c.redirect(`/dashboard/${event.code}?lang=${locale}`, 303);
});

app.post("/api/account/events/:code/invite", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  const owner = await c.env.DB.prepare("SELECT 1 FROM event_members WHERE event_id=? AND user_id=? AND role='owner'").bind(event.id, user.id).first();
  if (!owner) return c.text("Only the event owner can invite collaborators", 403);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.text("Invalid email", 400);
  if (email === user.email.toLowerCase()) return c.text(locale === "el" ? "Είσαι ήδη ο ιδιοκτήτης αυτού του event." : "You already own this event.", 400);
  const existingUser = await c.env.DB.prepare(`SELECT id FROM "user" WHERE lower(email)=lower(?)`).bind(email).first<{ id: string }>();
  if (existingUser) {
    const existingMember = await c.env.DB.prepare("SELECT 1 FROM event_members WHERE event_id=? AND user_id=?").bind(event.id, existingUser.id).first();
    if (existingMember) return c.redirect(`/dashboard/${event.code}?lang=${locale}`, 303);
  }
  const invitationId = crypto.randomUUID();
  const now = Date.now();
  await c.env.DB.prepare(`INSERT INTO event_invitations (id,event_id,email,role,invited_by,created_at,expires_at,accepted_at)
    VALUES (?,?,?,?,?,?,?,NULL)
    ON CONFLICT(event_id,email) DO UPDATE SET id=excluded.id,role=excluded.role,invited_by=excluded.invited_by,created_at=excluded.created_at,expires_at=excluded.expires_at,accepted_at=NULL`)
    .bind(invitationId, event.id, email, "editor", user.id, now, now + 14 * 86400000).run();
  const accountUrl = `https://memboux.com/${locale}/account`;
  const subject = locale === "el" ? `Πρόσκληση στο event ${event.eventName}` : `Invitation to ${event.eventName}`;
  const text = locale === "el"
    ? `${user.name} σε προσκάλεσε να διαχειριστείς το event «${event.eventName}» στο Memboux. Συνδέσου με αυτό το email: ${accountUrl}`
    : `${user.name} invited you to manage “${event.eventName}” on Memboux. Sign in with this email: ${accountUrl}`;
  await sendEmail(c.env, {
    to: email,
    subject,
    text,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#3b2a23"><h1 style="font-family:Georgia,serif">Memboux</h1><p>${esc(text)}</p><p><a href="${accountUrl}" style="display:inline-block;background:#76533d;color:white;padding:12px 20px;border-radius:10px;text-decoration:none">${locale === "el" ? "Αποδοχή πρόσκλησης" : "Accept invitation"}</a></p><p style="color:#776a63;font-size:13px">${locale === "el" ? "Η πρόσκληση λήγει σε 14 ημέρες και αφορά μόνο αυτό το event." : "This invitation expires in 14 days and only grants access to this event."}</p></div>`,
  });
  return c.redirect(`/dashboard/${event.code}?lang=${locale}`, 303);
});

app.post("/api/account/events/:code/members/remove", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  const owner = await c.env.DB.prepare("SELECT 1 FROM event_members WHERE event_id=? AND user_id=? AND role='owner'").bind(event.id, user.id).first();
  if (!owner) return c.text("Only the event owner can remove collaborators", 403);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  const userId = String(body.userId ?? "");
  const invitationId = String(body.invitationId ?? "");
  if (userId) await c.env.DB.prepare("DELETE FROM event_members WHERE event_id=? AND user_id=? AND role!='owner'").bind(event.id, userId).run();
  if (invitationId) await c.env.DB.prepare("DELETE FROM event_invitations WHERE id=? AND event_id=?").bind(invitationId, event.id).run();
  return c.redirect(`/dashboard/${event.code}?lang=${locale}`, 303);
});

app.get("/dashboard/:code/media/:id", async(c)=>{
  const locale=normalizeLocale(c.req.query("lang")??"en"); const user=await currentUser(c); if(!user) return c.redirect(`/${locale}/login`);
  const event=await getEvent(c.env.DB,c.req.param("code")); if(!event) return c.text("Event not found",404);
  const member=await c.env.DB.prepare("SELECT role FROM event_members WHERE event_id=? AND user_id=?").bind(event.id,user.id).first<{role:string}>(); if(!member) return c.text("Forbidden",403);
  const media=await c.env.DB.prepare("SELECT * FROM media WHERE id=? AND event_id=? AND deleted_at IS NULL").bind(c.req.param("id"),event.id).first<MediaRow>(); if(!media) return c.text("Media not found",404);
  const preview=media.media_type==="image"?`<img src="/media/${media.id}" class="max-h-[70vh] w-full rounded-2xl object-contain bg-black">`:`<video src="/media/${media.id}" controls class="max-h-[70vh] w-full rounded-2xl bg-black"></video>`;
  return c.html(page(media.title||event.eventName,`<header class="border-b bg-white"><div class="mx-auto flex max-w-5xl items-center justify-between p-5">${brandMark(`/${locale}`,true)}${accountMenu(locale,user)}</div></header><main class="mx-auto max-w-5xl p-5 md:p-10"><a href="/dashboard/${event.code}?lang=${locale}" class="text-sm text-[#76533d]">← ${locale==="el"?"Πίσω στο event":"Back to event"}</a><div class="mt-5 grid gap-6 lg:grid-cols-[1fr_320px]"><div>${preview}</div><aside class="rounded-2xl bg-white p-5 shadow"><h1 class="break-words text-3xl">${esc(media.title||media.uploaded_by)}</h1><p class="mt-2 text-sm text-[#776a63]">${esc(media.uploaded_by)} · ${formatDateTime(media.uploaded_at,locale)}</p><a href="/media/${media.id}?download=1" class="mt-5 block rounded-xl bg-[#76533d] px-4 py-3 text-center text-white">↓ ${locale==="el"?"Λήψη":"Download"}</a><form action="/api/account/events/${event.code}/media/${media.id}/rename" method="post" class="mt-4 space-y-2"><input type="hidden" name="locale" value="${locale}"><label class="text-sm">${locale==="el"?"Όνομα φωτογραφίας":"Media title"}<input name="title" required maxlength="120" value="${esc(media.title||"")}" class="mt-1 w-full rounded-xl border px-4 py-3"></label><button class="w-full rounded-xl border px-4 py-3">${locale==="el"?"Μετονομασία":"Rename"}</button></form><form action="/api/account/events/${event.code}/media/${media.id}/trash" method="post" class="mt-3" onsubmit="return confirm('Move this media to trash?')"><input type="hidden" name="locale" value="${locale}"><button class="w-full rounded-xl border border-red-200 px-4 py-3 text-red-700">${locale==="el"?"Μεταφορά στον κάδο":"Move to trash"}</button></form></aside></div></main>${logoutScript(locale)}`));
});

app.post("/api/account/events/:code/media/:id/rename", async(c)=>{
  const user=await currentUser(c);if(!user)return c.text("Unauthorized",401);const event=await getEvent(c.env.DB,c.req.param("code"));if(!event)return c.text("Event not found",404);
  const member=await c.env.DB.prepare("SELECT role FROM event_members WHERE event_id=? AND user_id=? AND role IN ('owner','editor')").bind(event.id,user.id).first();if(!member)return c.text("Forbidden",403);
  const body=await c.req.parseBody();const locale=normalizeLocale(String(body.locale??event.default_locale));const title=String(body.title??"").trim().slice(0,120);if(!title)return c.text("Missing title",400);
  await c.env.DB.prepare("UPDATE media SET title=? WHERE id=? AND event_id=? AND deleted_at IS NULL").bind(title,c.req.param("id"),event.id).run();return c.redirect(`/dashboard/${event.code}/media/${c.req.param("id")}?lang=${locale}`,303);
});

app.post("/api/account/events/:code/media/:id/trash", async(c)=>{
  const user=await currentUser(c);if(!user)return c.text("Unauthorized",401);const event=await getEvent(c.env.DB,c.req.param("code"));if(!event)return c.text("Event not found",404);
  const member=await c.env.DB.prepare("SELECT 1 FROM event_members WHERE event_id=? AND user_id=? AND role IN ('owner','editor')").bind(event.id,user.id).first();if(!member)return c.text("Forbidden",403);
  const body=await c.req.parseBody();const locale=normalizeLocale(String(body.locale??event.default_locale));const now=Date.now();await c.env.DB.prepare("UPDATE media SET deleted_at=?,purge_at=? WHERE id=? AND event_id=?").bind(now,now+TRASH_RETENTION_MS,c.req.param("id"),event.id).run();return c.redirect(`/dashboard/${event.code}?lang=${locale}`,303);
});

app.post("/api/account/events/:code/media/bulk-trash", async(c)=>{
  const user=await currentUser(c);if(!user)return c.text("Unauthorized",401);const event=await getEvent(c.env.DB,c.req.param("code"));if(!event)return c.text("Event not found",404);
  const member=await c.env.DB.prepare("SELECT 1 FROM event_members WHERE event_id=? AND user_id=? AND role IN ('owner','editor')").bind(event.id,user.id).first();if(!member)return c.text("Forbidden",403);
  const body=await c.req.parseBody();const locale=normalizeLocale(String(body.locale??event.default_locale));const ids=String(body.ids??"").split(",").filter(id=>/^[a-f0-9-]{36}$/i.test(id)).slice(0,100);const now=Date.now();if(ids.length)await c.env.DB.batch(ids.map(id=>c.env.DB.prepare("UPDATE media SET deleted_at=?,purge_at=? WHERE id=? AND event_id=? AND deleted_at IS NULL").bind(now,now+TRASH_RETENTION_MS,id,event.id)));return c.redirect(`/dashboard/${event.code}?lang=${locale}`,303);
});

app.post("/api/account/events/:code/media/:id/restore", async(c)=>{
  const user=await currentUser(c);if(!user)return c.text("Unauthorized",401);const event=await getEvent(c.env.DB,c.req.param("code"),true);if(!event)return c.text("Event not found",404);
  const member=await c.env.DB.prepare("SELECT 1 FROM event_members WHERE event_id=? AND user_id=? AND role IN ('owner','editor')").bind(event.id,user.id).first();if(!member)return c.text("Forbidden",403);
  const body=await c.req.parseBody();const locale=normalizeLocale(String(body.locale??event.default_locale));await c.env.DB.prepare("UPDATE media SET deleted_at=NULL,purge_at=NULL WHERE id=? AND event_id=?").bind(c.req.param("id"),event.id).run();return c.redirect(`/${locale}/trash`,303);
});

app.get("/dashboard-legacy/:code", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Η εκδήλωση δεν βρέθηκε.", 404);
  const token = c.req.query("token") ?? "";
  let allowed = Boolean(token && await sha256(token) === event.admin_token_hash);
  if (!allowed) {
    const user = await currentUser(c);
    if (user) allowed = Boolean(await c.env.DB.prepare("SELECT 1 FROM event_members WHERE event_id=? AND user_id=?").bind(event.id, user.id).first());
  }
  if (!allowed) return c.text("Δεν έχεις πρόσβαση σε αυτή τη διαχείριση.", 403);
  const items = await getMedia(c.env.DB, event.id);
  const guestUrl = `${new URL(c.req.url).origin}/gallery/${event.code}`;
  const qrSvg = (await QRCode.toString(guestUrl, { type: "svg", width: 256, margin: 1, errorCorrectionLevel: "M" }))
    .replace("<svg", '<svg class="block h-auto w-full max-w-full"');
  return c.html(page(`${event.eventName} – Διαχείριση`, `<main class="mx-auto max-w-6xl p-4 sm:p-5 md:p-10"><section class="mb-6 rounded-3xl bg-white p-5 shadow-lg sm:p-7"><p class="text-sm font-semibold text-[#a77d66]">ΙΔΙΩΤΙΚΗ ΔΙΑΧΕΙΡΙΣΗ</p><h1 class="mt-2 break-words text-3xl font-bold sm:text-4xl">${esc(event.eventName)}</h1><p class="mt-3">Κωδικός: <strong class="font-mono text-2xl text-[#8a654f]">${esc(event.code)}</strong></p><div class="mt-7 grid items-center gap-7 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]"><div class="mx-auto w-full max-w-[220px] overflow-hidden rounded-2xl border bg-white p-3">${qrSvg}</div><div class="min-w-0"><h2 class="text-xl font-bold">QR Code καλεσμένων</h2><p class="mt-2 text-sm text-[#776a63]">Οι καλεσμένοι σκανάρουν το QR και ανοίγουν απευθείας το gallery του event.</p><a href="${esc(guestUrl)}" target="_blank" class="mt-3 block max-w-full break-all text-sm font-semibold text-[#8a654f]">${esc(guestUrl)}</a><div class="mt-4 flex flex-col gap-2 sm:flex-row"><input id="link" readonly value="${esc(guestUrl)}" class="w-full min-w-0 flex-1 rounded-xl border px-4 py-3"><button id="copy" class="shrink-0 rounded-xl bg-[#4b382e] px-5 py-3 text-white">Αντιγραφή</button></div></div></div></section><section class="rounded-3xl bg-white p-5 shadow-lg sm:p-7"><h2 class="mb-5 text-2xl font-bold">Gallery (${items.length})</h2>${items.length ? `<div class="grid grid-cols-2 gap-4 md:grid-cols-3">${cards(items)}</div>` : `<p class="py-12 text-center text-[#776a63]">Δεν υπάρχουν uploads ακόμη.</p>`}</section></main><script>document.getElementById('copy').onclick=()=>navigator.clipboard.writeText(document.getElementById('link').value)<\/script>`));
});

app.get("/gallery/:code", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Η εκδήλωση δεν βρέθηκε.", 404);
  if (Date.now() > event.expires_at) return c.text("Η εκδήλωση έχει λήξει.", 410);
  const items = await getMedia(c.env.DB, event.id);
  return c.html(page(`${event.eventName} – Gallery`, `<main class="mx-auto max-w-6xl p-5 md:p-10"><section class="mb-6 rounded-3xl bg-white p-7 text-center shadow-lg"><div class="mb-4 flex justify-center">${brandMark("/", true)}</div><h1 class="mt-2 text-4xl font-bold">${esc(event.eventName)}</h1><p class="mt-2 font-medium text-[#76533d]">${esc(formatEventDates(event, event.default_locale))}</p><p class="mt-2 text-[#776a63]">Μοιράσου τις αγαπημένες σου στιγμές</p><form action="/api/upload/${event.code}" method="post" enctype="multipart/form-data" class="mx-auto mt-7 max-w-xl space-y-3 text-left"><input name="name" maxlength="60" placeholder="Το όνομά σου" class="w-full rounded-xl border px-4 py-3"><input name="file" required type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" class="w-full rounded-xl border p-3"><p class="text-xs text-[#776a63]">Μέχρι 20 MB ανά αρχείο. Επίλεξε ένα αρχείο κάθε φορά.</p><button class="w-full rounded-xl bg-gradient-to-r from-[#caa58f] to-[#76533d] py-3 font-semibold text-white">Ανέβασμα</button></form></section><section class="rounded-3xl bg-white p-7 shadow-lg"><div class="mb-5 flex items-center justify-between gap-3"><h2 class="text-2xl font-bold">Gallery (${items.length})</h2><button id="download-selected" class="rounded-xl border px-4 py-2 text-sm">Download selected</button></div>${items.length ? `<div class="grid grid-cols-2 gap-4 md:grid-cols-3">${cards(items,{selectable:true})}</div>` : `<p class="py-12 text-center text-[#776a63]">Γίνε ο πρώτος που θα ανεβάσει μια στιγμή!</p>`}</section></main><script>const selected=()=>[...document.querySelectorAll('.media-select:checked')];document.getElementById('download-selected').onclick=()=>selected().forEach((box,i)=>setTimeout(()=>{const a=document.createElement('a');a.href=box.dataset.download;a.download='';a.click()},i*250))<\/script>`));
});

app.post("/api/upload/:code", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Η εκδήλωση δεν βρέθηκε.", 404);
  if (Date.now() > event.expires_at) return c.text("Η εκδήλωση έχει λήξει.", 410);
  const form = await c.req.formData();
  const file = form.get("file");
  const uploadedBy = String(form.get("name") ?? "Ανώνυμος").trim().slice(0, 60) || "Ανώνυμος";
  if (!(file instanceof File)) return c.text("Δεν επιλέχθηκε αρχείο.", 400);
  if (!ALLOWED_TYPES.has(file.type)) return c.text("Μη υποστηριζόμενος τύπος αρχείου.", 415);
  if (file.size > MAX_FILE_SIZE) return c.text("Το αρχείο ξεπερνά τα 20 MB.", 413);
  const id = crypto.randomUUID();
  const extension = file.name.includes(".") ? file.name.split(".").pop()!.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) : "bin";
  const objectKey = `${event.id}/${id}.${extension}`;
  await c.env.MEDIA.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" } });
  try {
    const title = file.name.replace(/\.[^.]+$/, "").trim().slice(0, 120) || uploadedBy;
    await c.env.DB.prepare("INSERT INTO media (id,event_id,object_key,media_type,content_type,uploaded_by,uploaded_at,size_bytes,title) VALUES (?,?,?,?,?,?,?,?,?)").bind(id, event.id, objectKey, file.type.startsWith("image/") ? "image" : "video", file.type, uploadedBy, Date.now(), file.size, title).run();
  } catch (error) {
    await c.env.MEDIA.delete(objectKey);
    throw error;
  }
  return c.redirect(`/gallery/${event.code}`, 303);
});

app.get("/media/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT object_key,content_type,title FROM media WHERE id=? AND deleted_at IS NULL").bind(c.req.param("id")).first<{ object_key: string; content_type: string; title: string | null }>();
  if (!row) return c.text("Το αρχείο δεν βρέθηκε.", 404);
  const object = await c.env.MEDIA.get(row.object_key);
  if (!object) return c.text("Το αρχείο δεν βρέθηκε.", 404);
  const headers = new Headers({ "Content-Type": row.content_type, "Cache-Control": "public, max-age=31536000, immutable", "ETag": object.httpEtag, "X-Content-Type-Options": "nosniff" });
  if (c.req.query("download") === "1") headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent((row.title || "memboux-media").replace(/[\r\n]/g, ""))}`);
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
