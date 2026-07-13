import { Hono, type Handler } from "hono";
import { createAuth } from "../auth";
import type { Bindings } from "../domain";
import { normalizeLocale, t } from "../i18n";
import { consumeRateLimit, tooManyRequests } from "../rate-limit";
import { currentUser } from "../session";
import { validPrivacyEmail, validPrivacyRequestType } from "../privacy-requests";
import { authPage } from "../views/auth";
import { privacyPolicyPage, privacyRequestPage, termsPage } from "../views/legal";
import { brandMark, page } from "../views/shared";

type AppEnvironment = { Bindings: Bindings };

export const publicRoutes = new Hono<AppEnvironment>();

publicRoutes.get("/health/live", (c) => {
  c.header("Cache-Control", "no-store");
  return c.json({ status: "ok" });
});

publicRoutes.get("/health/ready", async (c) => {
  c.header("Cache-Control", "no-store");
  try {
    const result = await c.env.DB.prepare("SELECT 1 AS ready").first<{
      ready: number;
    }>();
    if (result?.ready !== 1) return c.json({ status: "unavailable" }, 503);
    return c.json({ status: "ready" });
  } catch {
    return c.json({ status: "unavailable" }, 503);
  }
});

const authRateLimits: Record<string, { limit: number; windowMs: number }> = {
  "/api/auth/sign-in/email": { limit: 10, windowMs: 15 * 60_000 },
  "/api/auth/sign-up/email": { limit: 5, windowMs: 60 * 60_000 },
  "/api/auth/request-password-reset": { limit: 5, windowMs: 60 * 60_000 },
  "/api/auth/sign-in/social": { limit: 20, windowMs: 60 * 60_000 },
};

publicRoutes.use("/api/auth/*", async (c, next) => {
  const rule = c.req.method === "POST" ? authRateLimits[c.req.path] : undefined;
  if (rule) {
    const result = await consumeRateLimit(c.env.DB, c.req.raw, c.env.BETTER_AUTH_SECRET, {
      scope: `auth:${c.req.path}`,
      ...rule,
    });
    if (!result.allowed) return tooManyRequests(result);
  }
  await next();
});

publicRoutes.on(["GET", "POST"], "/api/auth/*", (c) => {
  const auth = createAuth(c.env, (promise) => c.executionCtx.waitUntil(promise));
  return auth.handler(c.req.raw);
});

publicRoutes.get("/", (c) => c.redirect("/en"));

const localizedHome: Handler<AppEnvironment> = async (c) => {
  const locale = normalizeLocale(new URL(c.req.url).pathname === "/en" ? "en" : "el");
  const m = t(locale);
  const user = await currentUser(c);
  if (user) return c.redirect(`/${locale}/account`);
  const accountActions = `<a href="/${locale}/login" class="rounded-xl border px-4 py-2 font-semibold">${m.login}</a><a href="/${locale}/register" class="rounded-xl bg-[#33251f] px-4 py-2 font-semibold text-white">${m.register}</a>`;
  return c.html(page("Memboux", `<main class="mx-auto flex min-h-screen max-w-5xl flex-col p-5"><nav class="flex items-center justify-between py-4">${brandMark(`/${locale}`, true)}<div class="flex items-center gap-2"><a href="/${locale === "el" ? "en" : "el"}" class="px-3 py-2 text-sm font-semibold">${locale === "el" ? "EN" : "EL"}</a>${accountActions}</div></nav><section class="flex flex-1 items-center py-16"><div class="max-w-3xl"><p class="font-semibold uppercase tracking-[.25em] text-[#765440]">Collecting Moments</p><h1 class="mt-4 text-5xl font-bold leading-tight md:text-7xl">${locale === "el" ? "Όλες οι στιγμές του event σας, σε ένα μέρος." : "Every moment from your event, all together."}</h1><p class="mt-6 max-w-2xl text-xl text-[#625750]">${locale === "el" ? "Δημιουργήστε το event σας, προσκαλέστε τους καλεσμένους και συγκεντρώστε φωτογραφίες και βίντεο σε μία ιδιωτική συλλογή." : "Create your event, invite your guests, and collect every photo and video in one private gallery."}</p><a href="/${locale}/${user ? "account" : "register"}" class="mt-8 inline-block rounded-xl bg-gradient-to-r from-[#8b6250] to-[#654534] px-7 py-4 font-semibold text-white">${user ? m.dashboard : m.createEvent}</a></div></section><footer class="flex flex-wrap gap-5 border-t py-6 text-sm text-[#625750]"><a href="/${locale}/privacy-policy">${locale === "el" ? "Απόρρητο" : "Privacy"}</a><a href="/${locale}/terms">${locale === "el" ? "Όροι" : "Terms"}</a><a href="/${locale}/privacy-request">${locale === "el" ? "Αίτημα δεδομένων" : "Data request"}</a></footer></main>`));
};
publicRoutes.get("/el", localizedHome);
publicRoutes.get("/en", localizedHome);

publicRoutes.get("/:locale{el|en}/privacy-policy", (c) => c.html(privacyPolicyPage(normalizeLocale(c.req.param("locale")))));
publicRoutes.get("/:locale{el|en}/terms", (c) => c.html(termsPage(normalizeLocale(c.req.param("locale")))));
publicRoutes.get("/:locale{el|en}/privacy-request", (c) => {
  const reference = /^[a-f0-9-]{36}$/i.test(c.req.query("reference") ?? "") ? c.req.query("reference")! : "";
  return c.html(privacyRequestPage(normalizeLocale(c.req.param("locale")), c.req.query("sent") === "1", reference));
});

publicRoutes.post("/api/privacy/requests", async (c) => {
  const limit = await consumeRateLimit(c.env.DB, c.req.raw, c.env.BETTER_AUTH_SECRET, { scope: "privacy-request", limit: 3, windowMs: 60 * 60_000 });
  if (!limit.allowed) return tooManyRequests(limit);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? "en"));
  const email = String(body.email ?? "").trim().toLowerCase();
  const requestType = String(body.requestType ?? "");
  const details = String(body.details ?? "").trim();
  if (!validPrivacyEmail(email) || !validPrivacyRequestType(requestType) || details.length < 20 || details.length > 2000) {
    return c.text(locale === "el" ? "Έλεγξε τα στοιχεία του αιτήματος." : "Check the request details.", 400);
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO privacy_requests (id,email,request_type,details,status,created_at) VALUES (?,?,?,?,'pending',?)")
    .bind(id, email, requestType, details, Date.now()).run();
  return c.redirect(`/${locale}/privacy-request?sent=1&reference=${encodeURIComponent(id)}`, 303);
});

publicRoutes.get("/:locale{el|en}/login", async (c) => {
  const locale = normalizeLocale(c.req.param("locale"));
  if (await currentUser(c)) return c.redirect(`/${locale}/account`);
  return c.html(authPage(locale, "login"));
});
publicRoutes.get("/:locale{el|en}/register", async (c) => {
  const locale = normalizeLocale(c.req.param("locale"));
  if (await currentUser(c)) return c.redirect(`/${locale}/account`);
  return c.html(authPage(locale, "register"));
});

publicRoutes.get("/:locale{el|en}/verify-email", (c) => {
  const locale = normalizeLocale(c.req.param("locale")); const m = t(locale);
  return c.html(page(m.verifyTitle, `<main class="flex min-h-screen items-center justify-center p-5"><section class="max-w-lg rounded-3xl bg-white p-10 text-center shadow-xl"><div class="text-5xl">✉️</div><h1 class="mt-5 text-3xl font-bold">${m.verifyTitle}</h1><p class="mt-3 text-[#625750]">${m.verifyText}</p><a href="/${locale}/login" class="mt-7 inline-block rounded-xl bg-[#33251f] px-6 py-3 font-semibold text-white">${m.login}</a></section></main>`));
});

publicRoutes.get("/:locale{el|en}/forgot-password", (c) => {
  const locale = normalizeLocale(c.req.param("locale")); const m = t(locale);
  return c.html(page(m.forgotPassword, `<main class="flex min-h-screen items-center justify-center p-5"><section class="w-full max-w-md rounded-3xl border border-[#ddd0c6] bg-white/95 p-8 shadow-[0_24px_70px_rgba(71,50,40,.12)]"><h1 class="text-3xl font-bold">${m.forgotPassword}</h1><form id="forgot" class="mt-6 space-y-3"><input name="email" type="email" required placeholder="${m.email}" class="w-full rounded-xl border px-4 py-3"><p id="message" class="hidden rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700"></p><button class="w-full rounded-xl bg-[#33251f] py-3 font-semibold text-white">${locale === "el" ? "Αποστολή συνδέσμου" : "Send reset link"}</button></form></section></main><script>document.getElementById('forgot').onsubmit=async(e)=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.target));await fetch('/api/auth/request-password-reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...v,redirectTo:'/${locale}/reset-password'})});const m=document.getElementById('message');m.textContent=${JSON.stringify(locale === "el" ? "Αν υπάρχει λογαριασμός, στάλθηκε email επαναφοράς." : "If the account exists, a reset email has been sent.")};m.classList.remove('hidden')}<\/script>`));
});

publicRoutes.get("/:locale{el|en}/reset-password", (c) => {
  const locale = normalizeLocale(c.req.param("locale")); const token = c.req.query("token") ?? "";
  return c.html(page(locale === "el" ? "Νέος κωδικός" : "New password", `<main class="flex min-h-screen items-center justify-center p-5"><section class="w-full max-w-md rounded-3xl border border-[#ddd0c6] bg-white/95 p-8 shadow-[0_24px_70px_rgba(71,50,40,.12)]"><h1 class="text-3xl font-bold">${locale === "el" ? "Όρισε νέο κωδικό" : "Choose a new password"}</h1><form id="reset" class="mt-6 space-y-3"><input name="password" type="password" required minlength="10" autocomplete="new-password" placeholder="${locale === "el" ? "Νέος κωδικός" : "New password"}" class="w-full rounded-xl border px-4 py-3"><p id="message" class="hidden rounded-xl p-3 text-sm"></p><button class="w-full rounded-xl bg-[#33251f] py-3 font-semibold text-white">${locale === "el" ? "Αποθήκευση" : "Save password"}</button></form></section></main><script>const token=${JSON.stringify(token)};document.getElementById('reset').onsubmit=async(e)=>{e.preventDefault();const password=new FormData(e.target).get('password');const r=await fetch('/api/auth/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({newPassword:password,token})});const m=document.getElementById('message');m.classList.remove('hidden');if(r.ok){m.classList.add('bg-emerald-50','text-emerald-700');m.textContent=${JSON.stringify(locale === "el" ? "Ο κωδικός άλλαξε. Μπορείς να συνδεθείς." : "Password updated. You can now sign in.")};setTimeout(()=>location.href='/${locale}/login',1200)}else{m.classList.add('bg-red-50','text-red-700');m.textContent=${JSON.stringify(locale === "el" ? "Ο σύνδεσμος δεν είναι έγκυρος ή έχει λήξει." : "This link is invalid or has expired.")}}<\/script>`));
});
