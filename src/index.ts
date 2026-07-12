import { Hono } from "hono";
import { createAuth, type AuthEnv } from "./auth";
import { normalizeLocale, t, type Locale } from "./i18n";

type Bindings = AuthEnv & { MEDIA: R2Bucket; ADMIN_PASSWORD?: string };
type EventRow = { id: string; code: string; couple: string; admin_token_hash: string; created_at: number; expires_at: number; status: "active" | "archived"; notes: string; updated_at: number | null };
type MediaRow = { id: string; event_id: string; object_key: string; media_type: "image" | "video"; content_type: string; uploaded_by: string; uploaded_at: number; size_bytes: number };

const app = new Hono<{ Bindings: Bindings }>();
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime"]);
const ADMIN_COOKIE = "memboux_admin";

app.on(["GET", "POST"], "/api/auth/*", (c) => {
  const auth = createAuth(c.env, (promise) => c.executionCtx.waitUntil(promise));
  return auth.handler(c.req.raw);
});

const esc = (value: unknown) => String(value ?? "").replace(/[&<>'\"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" }[ch]!));
const randomCode = () => crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
const sha256 = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((b) => b.toString(16).padStart(2, "0")).join("");
const dateInput = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);
const formatDate = (timestamp: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium" }).format(new Date(timestamp));

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

function adminShell(title: string, content: string) {
  return page(`${title} – Memboux Admin`, `<header class="border-b bg-slate-950 text-white"><div class="mx-auto flex max-w-7xl items-center justify-between px-5 py-4"><a href="/admin" class="text-xl font-bold tracking-wide">Memboux Admin</a><form action="/admin/logout" method="post"><button class="rounded-lg border border-white/20 px-4 py-2 text-sm hover:bg-white/10">Αποσύνδεση</button></form></div></header>${content}`);
}

async function currentUser(c: { env: Bindings; req: { raw: Request } }) {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  return session?.user ?? null;
}

function authPage(locale: Locale, mode: "login" | "register") {
  const m = t(locale);
  const isRegister = mode === "register";
  return page(`${isRegister ? m.register : m.login} – Memboux`, `<main class="flex min-h-screen items-center justify-center p-5"><section class="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl"><div class="mb-7 flex items-center justify-between"><a href="/${locale}" class="text-xl font-bold">Memboux</a><a href="/${locale === "el" ? "en" : "el"}/${mode}" class="text-sm font-semibold text-violet-600">${locale === "el" ? "EN" : "EL"}</a></div><h1 class="text-3xl font-bold">${isRegister ? m.register : m.login}</h1><button id="google" class="mt-6 w-full rounded-xl border px-4 py-3 font-semibold hover:bg-slate-50">${m.continueGoogle}</button><div class="my-5 flex items-center gap-3 text-xs text-slate-400"><span class="h-px flex-1 bg-slate-200"></span>OR<span class="h-px flex-1 bg-slate-200"></span></div><form id="authForm" class="space-y-3">${isRegister ? `<input name="name" required maxlength="100" placeholder="${m.name}" class="w-full rounded-xl border px-4 py-3">` : ""}<input name="email" type="email" required autocomplete="email" placeholder="${m.email}" class="w-full rounded-xl border px-4 py-3"><input name="password" type="password" required minlength="10" autocomplete="${isRegister ? "new-password" : "current-password"}" placeholder="${m.password}" class="w-full rounded-xl border px-4 py-3"><p id="error" class="hidden rounded-xl bg-red-50 p-3 text-sm text-red-700"></p><button class="w-full rounded-xl bg-slate-950 py-3 font-semibold text-white">${isRegister ? m.register : m.login}</button></form>${!isRegister ? `<a href="/${locale}/forgot-password" class="mt-4 block text-center text-sm text-violet-600">${m.forgotPassword}</a>` : ""}<p class="mt-6 text-center text-sm text-slate-500">${isRegister ? m.hasAccount : m.noAccount} <a class="font-semibold text-violet-600" href="/${locale}/${isRegister ? "login" : "register"}">${isRegister ? m.login : m.register}</a></p></section></main><script>
const locale=${JSON.stringify(locale)};const error=document.getElementById('error');
document.getElementById('google').onclick=async()=>{const r=await fetch('/api/auth/sign-in/social',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'google',callbackURL:'/'+locale+'/account'})});const d=await r.json();if(d.url)location.href=d.url;else{error.textContent=d.message||${JSON.stringify(m.genericError)};error.classList.remove('hidden')}};
document.getElementById('authForm').onsubmit=async(e)=>{e.preventDefault();error.classList.add('hidden');const values=Object.fromEntries(new FormData(e.target));const r=await fetch('/api/auth/${isRegister ? "sign-up" : "sign-in"}/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...values,callbackURL:'/'+locale+'/account'})});const d=await r.json().catch(()=>({}));if(r.ok){location.href=${isRegister ? `'/${locale}/verify-email'` : `'/${locale}/account'`}}else{error.textContent=d.message||${JSON.stringify(m.genericError)};error.classList.remove('hidden')}};
<\/script>`);
}

function page(title: string, body: string) {
  return `<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><script src="https://cdn.tailwindcss.com"><\/script></head><body class="min-h-screen bg-gradient-to-br from-rose-50 via-white to-violet-50 text-slate-800">${body}</body></html>`;
}

async function getEvent(db: D1Database, code: string) {
  return db.prepare("SELECT * FROM events WHERE code = ?").bind(code.toUpperCase()).first<EventRow>();
}

async function getMedia(db: D1Database, eventId: string) {
  const result = await db.prepare("SELECT * FROM media WHERE event_id = ? ORDER BY uploaded_at DESC").bind(eventId).all<MediaRow>();
  return result.results;
}

function cards(items: MediaRow[]) {
  return items.map((m) => `<article class="overflow-hidden rounded-2xl bg-slate-100 shadow-sm"><div class="aspect-square">${m.media_type === "image" ? `<img src="/media/${encodeURIComponent(m.id)}" alt="Ανέβηκε από ${esc(m.uploaded_by)}" loading="lazy" class="h-full w-full object-cover">` : `<video src="/media/${encodeURIComponent(m.id)}" controls preload="metadata" class="h-full w-full object-cover"></video>`}</div><p class="px-4 py-3 text-sm text-slate-600">Από ${esc(m.uploaded_by)}</p></article>`).join("");
}

app.get("/", (c) => c.redirect("/el"));

const localizedHome = async (c: any) => {
  const locale = normalizeLocale(new URL(c.req.url).pathname === "/en" ? "en" : "el");
  const m = t(locale);
  const user = await currentUser(c);
  const accountActions = user
    ? `<span class="hidden text-sm text-slate-500 md:inline">${esc(user.name)}</span><a href="/${locale}/account" class="rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white">${m.dashboard}</a>`
    : `<a href="/${locale}/login" class="rounded-xl border px-4 py-2 font-semibold">${m.login}</a><a href="/${locale}/register" class="rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white">${m.register}</a>`;
  return c.html(page("Memboux", `<main class="mx-auto flex min-h-screen max-w-5xl flex-col p-5"><nav class="flex items-center justify-between py-4"><strong class="text-2xl">Memboux</strong><div class="flex items-center gap-2"><a href="/${locale === "el" ? "en" : "el"}" class="px-3 py-2 text-sm font-semibold">${locale === "el" ? "EN" : "EL"}</a>${accountActions}</div></nav><section class="flex flex-1 items-center py-16"><div class="max-w-3xl"><p class="font-semibold uppercase tracking-[.25em] text-rose-500">Memboux</p><h1 class="mt-4 text-5xl font-bold leading-tight md:text-7xl">${locale === "el" ? "Οι αναμνήσεις του γάμου σας, όλες μαζί." : "All your wedding memories, together."}</h1><p class="mt-6 max-w-2xl text-xl text-slate-500">${locale === "el" ? "Δημιουργήστε το event σας, προσκαλέστε τους καλεσμένους και συγκεντρώστε φωτογραφίες και βίντεο σε μία ιδιωτική συλλογή." : "Create your event, invite your guests, and collect every photo and video in one private gallery."}</p><a href="/${locale}/${user ? "account" : "register"}" class="mt-8 inline-block rounded-xl bg-gradient-to-r from-rose-500 to-violet-500 px-7 py-4 font-semibold text-white">${user ? m.dashboard : m.createEvent}</a></div></section></main>`));
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
  return c.html(page(m.verifyTitle, `<main class="flex min-h-screen items-center justify-center p-5"><section class="max-w-lg rounded-3xl bg-white p-10 text-center shadow-xl"><div class="text-5xl">✉️</div><h1 class="mt-5 text-3xl font-bold">${m.verifyTitle}</h1><p class="mt-3 text-slate-500">${m.verifyText}</p><a href="/${locale}/login" class="mt-7 inline-block rounded-xl bg-slate-950 px-6 py-3 font-semibold text-white">${m.login}</a></section></main>`));
});

app.get("/:locale{el|en}/forgot-password", (c) => {
  const locale = normalizeLocale(c.req.param("locale")); const m = t(locale);
  return c.html(page(m.forgotPassword, `<main class="flex min-h-screen items-center justify-center p-5"><section class="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl"><h1 class="text-3xl font-bold">${m.forgotPassword}</h1><form id="forgot" class="mt-6 space-y-3"><input name="email" type="email" required placeholder="${m.email}" class="w-full rounded-xl border px-4 py-3"><p id="message" class="hidden rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700"></p><button class="w-full rounded-xl bg-slate-950 py-3 font-semibold text-white">${locale === "el" ? "Αποστολή συνδέσμου" : "Send reset link"}</button></form></section></main><script>document.getElementById('forgot').onsubmit=async(e)=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.target));await fetch('/api/auth/request-password-reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...v,redirectTo:'/${locale}/reset-password'})});const m=document.getElementById('message');m.textContent=${JSON.stringify(locale === "el" ? "Αν υπάρχει λογαριασμός, στάλθηκε email επαναφοράς." : "If the account exists, a reset email has been sent.")};m.classList.remove('hidden')}<\/script>`));
});

app.get("/:locale{el|en}/reset-password", (c) => {
  const locale = normalizeLocale(c.req.param("locale")); const token = c.req.query("token") ?? "";
  return c.html(page(locale === "el" ? "Νέος κωδικός" : "New password", `<main class="flex min-h-screen items-center justify-center p-5"><section class="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl"><h1 class="text-3xl font-bold">${locale === "el" ? "Όρισε νέο κωδικό" : "Choose a new password"}</h1><form id="reset" class="mt-6 space-y-3"><input name="password" type="password" required minlength="10" autocomplete="new-password" placeholder="${locale === "el" ? "Νέος κωδικός" : "New password"}" class="w-full rounded-xl border px-4 py-3"><p id="message" class="hidden rounded-xl p-3 text-sm"></p><button class="w-full rounded-xl bg-slate-950 py-3 font-semibold text-white">${locale === "el" ? "Αποθήκευση" : "Save password"}</button></form></section></main><script>const token=${JSON.stringify(token)};document.getElementById('reset').onsubmit=async(e)=>{e.preventDefault();const password=new FormData(e.target).get('password');const r=await fetch('/api/auth/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({newPassword:password,token})});const m=document.getElementById('message');m.classList.remove('hidden');if(r.ok){m.classList.add('bg-emerald-50','text-emerald-700');m.textContent=${JSON.stringify(locale === "el" ? "Ο κωδικός άλλαξε. Μπορείς να συνδεθείς." : "Password updated. You can now sign in.")};setTimeout(()=>location.href='/${locale}/login',1200)}else{m.classList.add('bg-red-50','text-red-700');m.textContent=${JSON.stringify(locale === "el" ? "Ο σύνδεσμος δεν είναι έγκυρος ή έχει λήξει." : "This link is invalid or has expired.")}}<\/script>`));
});

app.get("/:locale{el|en}/account", async (c) => {
  const locale = normalizeLocale(c.req.param("locale")); const m = t(locale);
  const user = await currentUser(c);
  if (!user) return c.redirect(`/${locale}/login`);
  const events = await c.env.DB.prepare(`SELECT e.*, em.role, COUNT(md.id) media_count FROM event_members em JOIN events e ON e.id=em.event_id LEFT JOIN media md ON md.event_id=e.id WHERE em.user_id=? GROUP BY e.id, em.role ORDER BY e.created_at DESC`).bind(user.id).all<EventRow & { role: string; media_count: number }>();
  const list = events.results.map((event) => `<a href="/dashboard/${event.code}" class="rounded-2xl border bg-white p-5 shadow-sm"><p class="font-mono text-sm text-violet-600">${event.code}</p><h2 class="mt-1 text-xl font-bold">${esc(event.couple)}</h2><p class="mt-3 text-sm text-slate-500">${event.media_count} uploads · ${formatDate(event.expires_at)}</p></a>`).join("");
  return c.html(page(m.dashboard, `<header class="border-b bg-white"><div class="mx-auto flex max-w-6xl items-center justify-between p-5"><a href="/${locale}" class="text-xl font-bold">Memboux</a><div class="flex items-center gap-3"><span class="hidden text-sm text-slate-500 md:inline">${esc(user.email)}</span><button id="logout" class="rounded-xl border px-4 py-2 text-sm font-semibold">${m.logout}</button></div></div></header><main class="mx-auto max-w-6xl p-5 md:p-10"><div class="flex items-end justify-between"><div><p class="text-sm font-semibold uppercase tracking-[.2em] text-violet-600">Dashboard</p><h1 class="mt-1 text-4xl font-bold">${m.dashboard}</h1></div></div><form action="/api/account/events" method="post" class="mt-8 flex gap-3 rounded-2xl bg-white p-4 shadow-sm"><input type="hidden" name="locale" value="${locale}"><input name="couple" required maxlength="100" placeholder="${m.coupleNames}" class="min-w-0 flex-1 rounded-xl border px-4 py-3"><button class="rounded-xl bg-violet-600 px-5 font-semibold text-white">${m.createEvent}</button></form><div class="mt-6 grid gap-4 md:grid-cols-2">${list || `<div class="rounded-2xl bg-white p-10 text-center text-slate-500">${locale === "el" ? "Δεν έχεις events ακόμη." : "You don't have any events yet."}</div>`}</div></main><script>document.getElementById('logout').onclick=async()=>{await fetch('/api/auth/sign-out',{method:'POST'});location.href='/${locale}'}<\/script>`));
});

app.post("/api/account/events", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const body = await c.req.parseBody(); const couple = String(body.couple ?? "").trim().slice(0, 100); const locale = normalizeLocale(String(body.locale ?? "el"));
  if (!couple) return c.text("Missing couple", 400);
  const id = crypto.randomUUID(); const token = crypto.randomUUID() + crypto.randomUUID(); const tokenHash = await sha256(token); const now = Date.now();
  for (let attempt=0; attempt<5; attempt++) { const code=randomCode(); try { await c.env.DB.batch([c.env.DB.prepare("INSERT INTO events (id,code,couple,admin_token_hash,created_at,expires_at,status,notes,updated_at,default_locale) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id,code,couple,tokenHash,now,now+365*86400000,"active","",now,locale),c.env.DB.prepare("INSERT INTO event_members (event_id,user_id,role,created_at) VALUES (?,?,?,?)").bind(id,user.id,"owner",now)]); return c.redirect(`/${locale}/account`,303); } catch(error) { if(attempt===4) throw error; } }
  return c.text("Could not create event",500);
});

app.get("/admin/login", async (c) => {
  if (await isAdmin(c)) return c.redirect("/admin");
  const configured = Boolean(c.env.ADMIN_PASSWORD);
  return c.html(page("Admin Login – Memboux", `<main class="flex min-h-screen items-center justify-center p-5"><section class="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl"><p class="text-sm font-semibold uppercase tracking-[.2em] text-violet-600">Memboux Admin</p><h1 class="mt-2 text-3xl font-bold">Ιδιωτική διαχείριση</h1><p class="mt-2 text-slate-500">Πρόσβαση μόνο για τον διαχειριστή.</p>${configured ? `<form action="/admin/login" method="post" class="mt-7 space-y-3"><input name="password" type="password" required autocomplete="current-password" placeholder="Admin password" class="w-full rounded-xl border px-4 py-3"><button class="w-full rounded-xl bg-slate-950 py-3 font-semibold text-white">Σύνδεση</button></form>` : `<div class="mt-7 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Το ADMIN_PASSWORD δεν έχει ρυθμιστεί ακόμη στη Cloudflare.</div>`}</section></main>`));
});

app.post("/admin/login", async (c) => {
  const configured = c.env.ADMIN_PASSWORD;
  if (!configured) return c.text("Το admin password δεν έχει ρυθμιστεί.", 503);
  const body = await c.req.parseBody();
  if (String(body.password ?? "") !== configured) return c.html(page("Λάθος password", `<main class="flex min-h-screen items-center justify-center p-5"><section class="rounded-3xl bg-white p-8 text-center shadow-xl"><h1 class="text-2xl font-bold">Λάθος password</h1><a href="/admin/login" class="mt-5 inline-block text-violet-600">Δοκίμασε ξανά</a></section></main>`), 401);
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
  if (query) { sql += ` AND (e.couple LIKE ? OR e.code LIKE ?)`; binds.push(`%${query}%`, `%${query.toUpperCase()}%`); }
  if (status !== "all") { sql += ` AND e.status = ?`; binds.push(status); }
  sql += ` GROUP BY e.id ORDER BY CASE e.status WHEN 'active' THEN 0 ELSE 1 END, e.created_at DESC`;
  const result = await c.env.DB.prepare(sql).bind(...binds).all<EventRow & { media_count: number }>();
  const counts = await c.env.DB.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) active, SUM(CASE WHEN status='archived' THEN 1 ELSE 0 END) archived FROM events`).first<{ total: number; active: number; archived: number }>();
  const rows = result.results.map((event) => `<a href="/admin/events/${encodeURIComponent(event.code)}" class="grid gap-3 rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md md:grid-cols-[1fr_auto_auto_auto] md:items-center"><div><div class="flex flex-wrap items-center gap-2"><h2 class="text-lg font-bold">${esc(event.couple)}</h2><span class="rounded-full px-2 py-1 text-xs font-semibold ${event.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}">${event.status === "active" ? "Ενεργό" : "Αρχειοθετημένο"}</span></div><p class="mt-1 font-mono text-sm text-violet-600">${esc(event.code)}</p>${event.notes ? `<p class="mt-2 line-clamp-1 text-sm text-slate-500">${esc(event.notes)}</p>` : ""}</div><div class="text-sm text-slate-500"><strong class="block text-lg text-slate-900">${event.media_count}</strong>αρχεία</div><div class="text-sm text-slate-500"><strong class="block text-slate-900">${formatDate(event.created_at)}</strong>δημιουργία</div><div class="text-sm text-slate-500"><strong class="block text-slate-900">${formatDate(event.expires_at)}</strong>λήξη</div></a>`).join("");
  return c.html(adminShell("Βιβλιοθήκη", `<main class="mx-auto max-w-7xl p-5 md:p-10"><div class="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><p class="text-sm font-semibold uppercase tracking-[.2em] text-violet-600">Βιβλιοθήκη</p><h1 class="mt-1 text-4xl font-bold">Όλα τα events</h1><p class="mt-2 text-slate-500">${counts?.total ?? 0} συνολικά · ${counts?.active ?? 0} ενεργά · ${counts?.archived ?? 0} αρχειοθετημένα</p></div><a href="/" class="rounded-xl bg-violet-600 px-5 py-3 text-center font-semibold text-white">Νέο event</a></div><form class="mb-6 grid gap-3 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-[1fr_auto_auto]"><input name="q" value="${esc(query)}" placeholder="Αναζήτηση ονόματος ή κωδικού" class="rounded-xl border px-4 py-3"><select name="status" class="rounded-xl border px-4 py-3"><option value="all"${status === "all" ? " selected" : ""}>Όλα</option><option value="active"${status === "active" ? " selected" : ""}>Ενεργά</option><option value="archived"${status === "archived" ? " selected" : ""}>Αρχειοθετημένα</option></select><button class="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white">Φιλτράρισμα</button></form><div class="space-y-3">${rows || `<div class="rounded-2xl bg-white py-16 text-center text-slate-500">Δεν βρέθηκαν events.</div>`}</div></main>`));
});

app.get("/admin/events/:code", async (c) => {
  if (!await isAdmin(c)) return c.redirect("/admin/login");
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Το event δεν βρέθηκε.", 404);
  const items = await getMedia(c.env.DB, event.id);
  const guestUrl = `${new URL(c.req.url).origin}/gallery/${event.code}`;
  return c.html(adminShell(event.couple, `<main class="mx-auto max-w-7xl p-5 md:p-10"><a href="/admin" class="text-sm font-semibold text-violet-600">← Πίσω στη βιβλιοθήκη</a><div class="mt-5 grid gap-6 lg:grid-cols-[420px_1fr]"><section class="rounded-3xl bg-white p-6 shadow-lg"><div class="flex items-start justify-between gap-3"><div><p class="font-mono text-sm text-violet-600">${esc(event.code)}</p><h1 class="mt-1 text-3xl font-bold">${esc(event.couple)}</h1></div><span class="rounded-full px-3 py-1 text-xs font-semibold ${event.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}">${event.status === "active" ? "Ενεργό" : "Αρχειοθετημένο"}</span></div><form action="/admin/events/${encodeURIComponent(event.code)}/update" method="post" class="mt-7 space-y-4"><label class="block text-sm font-semibold">Ονόματα<input name="couple" required maxlength="100" value="${esc(event.couple)}" class="mt-1 w-full rounded-xl border px-4 py-3 font-normal"></label><label class="block text-sm font-semibold">Κατάσταση<select name="status" class="mt-1 w-full rounded-xl border px-4 py-3 font-normal"><option value="active"${event.status === "active" ? " selected" : ""}>Ενεργό</option><option value="archived"${event.status === "archived" ? " selected" : ""}>Αρχειοθετημένο</option></select></label><label class="block text-sm font-semibold">Ημερομηνία λήξης<input name="expires_at" type="date" required value="${dateInput(event.expires_at)}" class="mt-1 w-full rounded-xl border px-4 py-3 font-normal"></label><label class="block text-sm font-semibold">Εσωτερικές σημειώσεις<textarea name="notes" maxlength="2000" rows="6" class="mt-1 w-full rounded-xl border px-4 py-3 font-normal" placeholder="Πληροφορίες, συμφωνίες, εκκρεμότητες…">${esc(event.notes)}</textarea></label><button class="w-full rounded-xl bg-slate-950 py-3 font-semibold text-white">Αποθήκευση αλλαγών</button></form><div class="mt-5"><a href="${esc(guestUrl)}" target="_blank" class="block rounded-xl border px-4 py-3 text-center text-sm font-semibold">Άνοιγμα guest gallery</a></div></section><section class="rounded-3xl bg-white p-6 shadow-lg"><div class="mb-5 flex items-center justify-between"><div><p class="text-sm text-slate-500">Δημιουργήθηκε ${formatDate(event.created_at)}</p><h2 class="text-2xl font-bold">Αρχεία (${items.length})</h2></div></div>${items.length ? `<div class="grid grid-cols-2 gap-4 md:grid-cols-3">${cards(items)}</div>` : `<p class="py-16 text-center text-slate-500">Δεν υπάρχουν uploads.</p>`}</section></div></main>`));
});

app.post("/admin/events/:code/update", async (c) => {
  if (!await isAdmin(c)) return c.redirect("/admin/login");
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Το event δεν βρέθηκε.", 404);
  const body = await c.req.parseBody();
  const couple = String(body.couple ?? "").trim().slice(0, 100);
  const status = body.status === "archived" ? "archived" : "active";
  const notes = String(body.notes ?? "").trim().slice(0, 2000);
  const expiresAt = Date.parse(`${String(body.expires_at ?? "")}T23:59:59.999Z`);
  if (!couple || !Number.isFinite(expiresAt)) return c.text("Μη έγκυρα στοιχεία.", 400);
  await c.env.DB.prepare("UPDATE events SET couple=?, status=?, notes=?, expires_at=?, updated_at=? WHERE id=?").bind(couple, status, notes, expiresAt, Date.now(), event.id).run();
  return c.redirect(`/admin/events/${event.code}`, 303);
});

app.get("/", (c) => c.html(page("Memboux", `<main class="mx-auto flex min-h-screen max-w-lg items-center p-5"><section class="w-full rounded-3xl bg-white p-8 shadow-xl"><p class="mb-2 text-center text-sm font-semibold uppercase tracking-[.25em] text-rose-500">Memboux</p><h1 class="mb-3 text-center text-4xl font-bold">Οι αναμνήσεις σας, μαζί</h1><p class="mb-8 text-center text-slate-500">Δημιούργησε μια ιδιωτική συλλογή για τον γάμο σου.</p><form action="/api/events" method="post" class="space-y-3"><input name="couple" required maxlength="100" placeholder="π.χ. Μαρία & Νίκος" class="w-full rounded-xl border px-4 py-3"><button class="w-full rounded-xl bg-gradient-to-r from-rose-500 to-violet-500 py-3 font-semibold text-white">Δημιουργία εκδήλωσης</button></form><div class="my-7 border-t"></div><form id="join" class="space-y-3"><input id="code" required maxlength="6" placeholder="Κωδικός πρόσκλησης" class="w-full rounded-xl border px-4 py-3 uppercase"><button class="w-full rounded-xl bg-slate-700 py-3 font-semibold text-white">Είσοδος ως καλεσμένος</button></form></section></main><script>document.getElementById('join').addEventListener('submit',e=>{e.preventDefault();location.href='/gallery/'+document.getElementById('code').value.trim().toUpperCase()})<\/script>`)));

app.post("/api/events", async (c) => {
  const data = await c.req.parseBody();
  const couple = String(data.couple ?? "").trim().slice(0, 100);
  if (!couple) return c.text("Συμπλήρωσε τα ονόματα.", 400);
  const id = crypto.randomUUID();
  const token = crypto.randomUUID() + crypto.randomUUID();
  const tokenHash = await sha256(token);
  const now = Date.now();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      await c.env.DB.prepare("INSERT INTO events (id,code,couple,admin_token_hash,created_at,expires_at) VALUES (?,?,?,?,?,?)").bind(id, code, couple, tokenHash, now, now + 365 * 86400000).run();
      return c.redirect(`/dashboard/${code}?token=${encodeURIComponent(token)}`, 303);
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }
  return c.text("Δεν ήταν δυνατή η δημιουργία.", 500);
});

app.get("/dashboard/:code", async (c) => {
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
  return c.html(page(`${event.couple} – Διαχείριση`, `<main class="mx-auto max-w-6xl p-5 md:p-10"><section class="mb-6 rounded-3xl bg-white p-7 shadow-lg"><p class="text-sm font-semibold text-rose-500">ΙΔΙΩΤΙΚΗ ΔΙΑΧΕΙΡΙΣΗ</p><h1 class="mt-2 text-4xl font-bold">${esc(event.couple)}</h1><p class="mt-3">Κωδικός: <strong class="font-mono text-2xl text-violet-600">${esc(event.code)}</strong></p><p class="mt-5 text-sm text-slate-500">Φύλαξε το URL αυτής της σελίδας. Είναι το ιδιωτικό admin link σου.</p><div class="mt-5 flex gap-2"><input id="link" readonly value="${esc(guestUrl)}" class="min-w-0 flex-1 rounded-xl border px-4 py-3"><button id="copy" class="rounded-xl bg-slate-800 px-5 text-white">Αντιγραφή</button></div></section><section class="rounded-3xl bg-white p-7 shadow-lg"><h2 class="mb-5 text-2xl font-bold">Gallery (${items.length})</h2>${items.length ? `<div class="grid grid-cols-2 gap-4 md:grid-cols-3">${cards(items)}</div>` : `<p class="py-12 text-center text-slate-500">Δεν υπάρχουν uploads ακόμη.</p>`}</section></main><script>document.getElementById('copy').onclick=()=>navigator.clipboard.writeText(document.getElementById('link').value)<\/script>`));
});

app.get("/gallery/:code", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Η εκδήλωση δεν βρέθηκε.", 404);
  if (Date.now() > event.expires_at) return c.text("Η εκδήλωση έχει λήξει.", 410);
  const items = await getMedia(c.env.DB, event.id);
  return c.html(page(`${event.couple} – Gallery`, `<main class="mx-auto max-w-6xl p-5 md:p-10"><section class="mb-6 rounded-3xl bg-white p-7 text-center shadow-lg"><p class="text-sm font-semibold uppercase tracking-[.25em] text-rose-500">Memboux</p><h1 class="mt-2 text-4xl font-bold">${esc(event.couple)}</h1><p class="mt-2 text-slate-500">Μοιράσου τις αγαπημένες σου στιγμές</p><form action="/api/upload/${event.code}" method="post" enctype="multipart/form-data" class="mx-auto mt-7 max-w-xl space-y-3 text-left"><input name="name" maxlength="60" placeholder="Το όνομά σου" class="w-full rounded-xl border px-4 py-3"><input name="file" required type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" class="w-full rounded-xl border p-3"><p class="text-xs text-slate-500">Μέχρι 20 MB ανά αρχείο. Επίλεξε ένα αρχείο κάθε φορά.</p><button class="w-full rounded-xl bg-gradient-to-r from-rose-500 to-violet-500 py-3 font-semibold text-white">Ανέβασμα</button></form></section><section class="rounded-3xl bg-white p-7 shadow-lg"><h2 class="mb-5 text-2xl font-bold">Gallery (${items.length})</h2>${items.length ? `<div class="grid grid-cols-2 gap-4 md:grid-cols-3">${cards(items)}</div>` : `<p class="py-12 text-center text-slate-500">Γίνε ο πρώτος που θα ανεβάσει μια στιγμή!</p>`}</section></main>`));
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
    await c.env.DB.prepare("INSERT INTO media (id,event_id,object_key,media_type,content_type,uploaded_by,uploaded_at,size_bytes) VALUES (?,?,?,?,?,?,?,?)").bind(id, event.id, objectKey, file.type.startsWith("image/") ? "image" : "video", file.type, uploadedBy, Date.now(), file.size).run();
  } catch (error) {
    await c.env.MEDIA.delete(objectKey);
    throw error;
  }
  return c.redirect(`/gallery/${event.code}`, 303);
});

app.get("/media/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT object_key, content_type FROM media WHERE id = ?").bind(c.req.param("id")).first<{ object_key: string; content_type: string }>();
  if (!row) return c.text("Το αρχείο δεν βρέθηκε.", 404);
  const object = await c.env.MEDIA.get(row.object_key);
  if (!object) return c.text("Το αρχείο δεν βρέθηκε.", 404);
  const headers = new Headers({ "Content-Type": row.content_type, "Cache-Control": "public, max-age=31536000, immutable", "ETag": object.httpEtag, "X-Content-Type-Options": "nosniff" });
  return new Response(object.body, { headers });
});

app.onError((error, c) => {
  console.error(error);
  const host = new URL(c.req.url).hostname;
  if (host === "127.0.0.1" || host === "localhost") return c.text(error.stack ?? error.message, 500);
  return c.text("Παρουσιάστηκε προσωρινό σφάλμα.", 500);
});
export default app;
