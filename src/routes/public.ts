import { Hono, type Handler } from "hono";
import { setCookie } from "hono/cookie";
import { createAuth, facebookAuthEnabled } from "../auth";
import type { Bindings } from "../domain";
import { detectLocale, normalizeLocale, supportedLocales, t, type Locale } from "../i18n";
import { consumeRateLimit, tooManyRequests } from "../rate-limit";
import { currentUser } from "../session";
import { validPrivacyEmail, validPrivacyRequestType } from "../privacy-requests";
import { authPage } from "../views/auth";
import { homePage } from "../views/home";
import { cookiePolicyPage, privacyPolicyPage, privacyRequestPage, termsPage } from "../views/legal";
import { brandMark, page } from "../views/shared";
import { cookieValue } from "../utils";

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

publicRoutes.get("/robots.txt", (c) => {
  c.header("Content-Type", "text/plain; charset=utf-8");
  c.header("Cache-Control", "public, max-age=3600");
  return c.body(`User-agent: *
Allow: /en$
Allow: /el$
Allow: /fr$
Allow: /de$
Allow: /es$
Allow: /it$
Disallow: /api/
Disallow: /admin/
Disallow: /dashboard/
Disallow: /gallery/
Disallow: /studio/
Disallow: /en/account
Disallow: /el/account
Disallow: /en/profile
Disallow: /el/profile
Disallow: /en/security
Disallow: /el/security
Disallow: /en/plan
Disallow: /el/plan
Disallow: /en/trash
Disallow: /el/trash

Sitemap: https://memboux.com/sitemap.xml
`);
});

publicRoutes.get("/sitemap.xml", (c) => {
  c.header("Content-Type", "application/xml; charset=utf-8");
  c.header("Cache-Control", "public, max-age=3600");
  const alternates = supportedLocales.map((locale) => `<xhtml:link rel="alternate" hreflang="${locale}" href="https://memboux.com/${locale}"/>`).join("");
  const urls = supportedLocales.map((locale) => `<url><loc>https://memboux.com/${locale}</loc>${alternates}<xhtml:link rel="alternate" hreflang="x-default" href="https://memboux.com/en"/></url>`).join("\n  ");
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  ${urls}
</urlset>`);
});

const authRateLimits: Record<string, { limit: number; windowMs: number }> = {
  "/api/auth/sign-in/email": { limit: 10, windowMs: 15 * 60_000 },
  "/api/auth/sign-up/email": { limit: 5, windowMs: 60 * 60_000 },
  "/api/auth/send-verification-email": { limit: 5, windowMs: 60 * 60_000 },
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

publicRoutes.get("/", (c) => {
  const cookieLocale = cookieValue(c.req.raw, "memboux_locale");
  if (cookieLocale && supportedLocales.includes(cookieLocale as Locale)) {
    return c.redirect(`/${cookieLocale}`);
  }
  // Detect locale from visitor's country via Cloudflare geolocation (c.req.raw.cf?.country)
  const country = (c.req.raw as any).cf?.country ?? null;
  const detected = detectLocale(country);
  return c.redirect(`/${detected}`);
});

const localizedHome: Handler<AppEnvironment> = async (c) => {
  const locale = normalizeLocale(new URL(c.req.url).pathname.split("/")[1]);
  setCookie(c, "memboux_locale", locale, { path: "/", maxAge: 31_536_000, sameSite: "Lax", secure: true });
  const user = await currentUser(c);
  if (user) return c.redirect(`/${locale}/account`);
  return c.html(homePage(locale));
};
publicRoutes.get("/el", localizedHome);
publicRoutes.get("/en", localizedHome);
publicRoutes.get("/fr", localizedHome);
publicRoutes.get("/de", localizedHome);
publicRoutes.get("/es", localizedHome);
publicRoutes.get("/it", localizedHome);

publicRoutes.get("/:locale{el|en|fr|de|es|it}/privacy-policy", (c) => c.html(privacyPolicyPage(normalizeLocale(c.req.param("locale")))));
publicRoutes.get("/:locale{el|en|fr|de|es|it}/cookie-policy", (c) => c.html(cookiePolicyPage(normalizeLocale(c.req.param("locale")))));
publicRoutes.get("/:locale{el|en|fr|de|es|it}/terms", (c) => c.html(termsPage(normalizeLocale(c.req.param("locale")))));
publicRoutes.get("/:locale{el|en|fr|de|es|it}/privacy-request", (c) => {
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

publicRoutes.get("/:locale{el|en|fr|de|es|it}/login", async (c) => {
  const locale = normalizeLocale(c.req.param("locale"));
  const requestedRedirect = c.req.query("redirect") ?? "";
  const redirectTo = /^\/(?!\/)[^\\\r\n]*$/.test(requestedRedirect) ? requestedRedirect : `/${locale}/account`;
  if (await currentUser(c)) return c.redirect(redirectTo);
  return c.html(authPage(locale, "login", redirectTo, { facebook: facebookAuthEnabled(c.env) }));
});
publicRoutes.get("/:locale{el|en|fr|de|es|it}/register", async (c) => {
  const locale = normalizeLocale(c.req.param("locale"));
  const requestedRedirect = c.req.query("redirect") ?? "";
  const redirectTo = /^\/(?!\/)[^\\\r\n]*$/.test(requestedRedirect) ? requestedRedirect : `/${locale}/account`;
  if (await currentUser(c)) return c.redirect(redirectTo);
  return c.html(authPage(locale, "register", redirectTo, { facebook: facebookAuthEnabled(c.env) }));
});

publicRoutes.get("/:locale{el|en|fr|de|es|it}/verify-email", (c) => {
  const locale = normalizeLocale(c.req.param("locale"));
  const el = locale === "el";
  const sentMessage = el
    ? "Αν το email ανήκει σε μη επιβεβαιωμένο λογαριασμό, στάλθηκε νέος σύνδεσμος. Έλεγξε Inbox, Spam και Promotions."
    : "If this email belongs to an unverified account, a new link was sent. Check Inbox, Spam, and Promotions.";
  const failedMessage = el
    ? "Η αποστολή απέτυχε προσωρινά. Δοκίμασε ξανά σε λίγο."
    : "Sending failed temporarily. Please try again shortly.";
  return c.html(page(el ? "Έλεγξε το email σου" : "Check your email", `<main class="min-h-screen bg-[#f4f8f6] p-4 sm:p-6"><section class="mx-auto flex min-h-[calc(100vh-2rem)] max-w-5xl items-center justify-center"><div class="w-full overflow-hidden rounded-[2rem] border border-[#dbe6e1] bg-white shadow-[0_30px_100px_rgba(24,60,51,.13)]"><header class="flex items-center justify-between border-b border-[#e2ebe7] px-6 py-5 sm:px-10">${brandMark(`/${locale}`, true)}<a href="/${locale === "el" ? "en" : "el"}/verify-email" class="rounded-full border px-3 py-2 text-xs font-semibold text-[#255848]">${el ? "EN" : "EL"}</a></header><div class="grid lg:grid-cols-[1.05fr_.95fr]"><div class="p-7 sm:p-12"><span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e8f3ee] text-2xl">✉</span><p class="mt-8 text-xs font-semibold uppercase tracking-[.2em] text-[#2f6b5b]">${el ? "Ένα τελευταίο βήμα" : "One last step"}</p><h1 class="mt-3 text-4xl font-medium tracking-[-.03em] text-[#172d27] sm:text-5xl">${el ? "Έλεγξε το email σου" : "Check your email"}</h1><p class="mt-4 max-w-xl text-base leading-7 text-[#65756f]">${el ? "Στείλαμε τις σωστές οδηγίες για τον λογαριασμό σου. Ο σύνδεσμος επιβεβαίωσης λήγει σε μία ώρα." : "We sent the right next step for your account. Verification links expire after one hour."}</p><div id="email-summary" class="mt-6 hidden rounded-2xl bg-[#f6faf8] p-4"><p class="text-xs uppercase tracking-[.15em] text-[#65756f]">Email</p><strong id="masked-email" class="mt-1 block break-all text-[#183c33]"></strong></div><div class="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><strong>${el ? "Έχεις ήδη λογαριασμό ή χρησιμοποίησες Google;" : "Already registered or used Google?"}</strong><p class="mt-1">${el ? "Συνδέσου αντί να κάνεις νέα εγγραφή. Για λόγους προστασίας προσωπικών δεδομένων η εγγραφή δείχνει την ίδια επιτυχία, αλλά ένας ήδη επιβεβαιωμένος λογαριασμός δεν λαμβάνει δεύτερο verification link." : "Sign in instead of registering again. For privacy, sign-up shows the same success state, but an already verified account does not receive another verification link."}</p><a href="/${locale}/login" class="mt-3 inline-block font-semibold text-amber-950 underline">${el ? "Μετάβαση στη σύνδεση" : "Go to sign in"}</a></div></div><aside class="border-t bg-[#f6faf8] p-7 sm:p-12 lg:border-l lg:border-t-0"><h2 class="text-2xl font-medium text-[#183c33]">${el ? "Δεν ήρθε email;" : "Didn't receive it?"}</h2><ol class="mt-4 space-y-2 text-sm leading-6 text-[#65756f]"><li>1. ${el ? "Έλεγξε Spam/Junk και Promotions." : "Check Spam/Junk and Promotions."}</li><li>2. ${el ? "Βεβαιώσου ότι το email γράφτηκε σωστά." : "Make sure the email address is correct."}</li><li>3. ${el ? "Περίμενε ένα λεπτό και κάνε επαναποστολή." : "Wait a minute, then resend."}</li></ol><form id="resend-verification" class="mt-7 space-y-3"><label class="block text-sm font-medium text-[#354c44]">Email<input id="verification-email" name="email" type="email" required maxlength="254" autocomplete="email" class="mt-1.5 w-full rounded-2xl border border-[#ccd9d4] bg-white px-4 py-3.5 outline-none focus:border-[#3f7d6c] focus:ring-4 focus:ring-[#3f7d6c]/10"></label><button id="resend-button" class="w-full rounded-2xl bg-[#2f6b5b] px-6 py-3.5 font-semibold text-white disabled:cursor-wait disabled:opacity-60">${el ? "Επαναποστολή email" : "Resend verification email"}</button><p id="resend-message" role="status" aria-live="polite" class="hidden rounded-2xl p-3.5 text-sm leading-6"></p></form><div class="mt-6 flex flex-wrap gap-4 text-sm"><a href="/${locale}/register" class="font-semibold text-[#255848]">${el ? "Αλλαγή email" : "Change email"}</a><a href="/${locale}/forgot-password" class="font-semibold text-[#255848]">${el ? "Ξέχασα τον κωδικό" : "Forgot password"}</a></div></aside></div></div></section></main><script>const emailInput=document.getElementById('verification-email'),emailSummary=document.getElementById('email-summary'),maskedEmail=document.getElementById('masked-email'),resendForm=document.getElementById('resend-verification'),resendButton=document.getElementById('resend-button'),resendMessage=document.getElementById('resend-message'),storedEmail=sessionStorage.getItem('membouxVerificationEmail')||'';const maskEmail=(email)=>{const parts=email.split('@');if(parts.length!==2)return email;const local=parts[0];return (local.length<3?local[0]+'*':local.slice(0,2)+'***'+local.slice(-1))+'@'+parts[1]};if(storedEmail){emailInput.value=storedEmail;maskedEmail.textContent=maskEmail(storedEmail);emailSummary.classList.remove('hidden')}resendForm.onsubmit=async(event)=>{event.preventDefault();if(!resendForm.reportValidity())return;resendButton.disabled=true;resendMessage.classList.add('hidden');try{const response=await fetch('/api/auth/send-verification-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:emailInput.value.trim().toLowerCase(),callbackURL:'/${locale}/account'})});resendMessage.classList.remove('hidden');resendMessage.className=response.ok?'rounded-2xl bg-emerald-50 p-3.5 text-sm leading-6 text-emerald-700':'rounded-2xl bg-red-50 p-3.5 text-sm leading-6 text-red-700';resendMessage.textContent=response.ok?${JSON.stringify(sentMessage)}:${JSON.stringify(failedMessage)}}catch{resendMessage.className='rounded-2xl bg-red-50 p-3.5 text-sm leading-6 text-red-700';resendMessage.textContent=${JSON.stringify(failedMessage)};resendMessage.classList.remove('hidden')}finally{resendButton.disabled=false}}<\/script>`));
});

publicRoutes.get("/:locale{el|en|fr|de|es|it}/forgot-password", (c) => {
  const locale = normalizeLocale(c.req.param("locale")); const m = t(locale);
  return c.html(page(m.forgotPassword, `<main class="flex min-h-screen items-center justify-center p-5"><section class="w-full max-w-md rounded-3xl border border-[#dbe6e1] bg-white/95 p-8 shadow-[0_24px_70px_rgba(47,107,91,.12)]"><h1 class="text-3xl font-bold">${m.forgotPassword}</h1><form id="forgot" class="mt-6 space-y-3"><input name="email" type="email" required placeholder="${m.email}" class="w-full rounded-xl border px-4 py-3"><p id="message" class="hidden rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700"></p><button class="w-full rounded-xl bg-[#183c33] py-3 font-semibold text-white">${locale === "el" ? "Αποστολή συνδέσμου" : "Send reset link"}</button></form></section></main><script>document.getElementById('forgot').onsubmit=async(e)=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.target));await fetch('/api/auth/request-password-reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...v,redirectTo:'/${locale}/reset-password'})});const m=document.getElementById('message');m.textContent=${JSON.stringify(locale === "el" ? "Αν υπάρχει λογαριασμός, στάλθηκε email επαναφοράς." : "If the account exists, a reset email has been sent.")};m.classList.remove('hidden')}<\/script>`));
});

publicRoutes.get("/:locale{el|en|fr|de|es|it}/reset-password", (c) => {
  const locale = normalizeLocale(c.req.param("locale")); const token = c.req.query("token") ?? "";
  return c.html(page(locale === "el" ? "Νέος κωδικός" : "New password", `<main class="flex min-h-screen items-center justify-center p-5"><section class="w-full max-w-md rounded-3xl border border-[#dbe6e1] bg-white/95 p-8 shadow-[0_24px_70px_rgba(47,107,91,.12)]"><h1 class="text-3xl font-bold">${locale === "el" ? "Όρισε νέο κωδικό" : "Choose a new password"}</h1><form id="reset" class="mt-6 space-y-3"><input name="password" type="password" required minlength="10" autocomplete="new-password" placeholder="${locale === "el" ? "Νέος κωδικός" : "New password"}" class="w-full rounded-xl border px-4 py-3"><p id="message" class="hidden rounded-xl p-3 text-sm"></p><button class="w-full rounded-xl bg-[#183c33] py-3 font-semibold text-white">${locale === "el" ? "Αποθήκευση" : "Save password"}</button></form></section></main><script>const token=${JSON.stringify(token)};document.getElementById('reset').onsubmit=async(e)=>{e.preventDefault();const password=new FormData(e.target).get('password');const r=await fetch('/api/auth/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({newPassword:password,token})});const m=document.getElementById('message');m.classList.remove('hidden');if(r.ok){m.classList.add('bg-emerald-50','text-emerald-700');m.textContent=${JSON.stringify(locale === "el" ? "Ο κωδικός άλλαξε. Μπορείς να συνδεθείς." : "Password updated. You can now sign in.")};setTimeout(()=>location.href='/${locale}/login',1200)}else{m.classList.add('bg-red-50','text-red-700');m.textContent=${JSON.stringify(locale === "el" ? "Ο σύνδεσμος δεν είναι έγκυρος ή έχει λήξει." : "This link is invalid or has expired.")}}<\/script>`));
});
