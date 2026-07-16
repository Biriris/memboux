import { t, type Locale } from "../i18n";
import { brandMark, googleIcon, page } from "./shared";

export function authPage(locale: Locale, mode: "login" | "register") {
  const m = t(locale);
  const isRegister = mode === "register";
  const el = locale === "el";
  const copy = {
    eyebrow: isRegister ? (el ? "Δημιούργησε τον χώρο σου" : "Create your space") : (el ? "Καλώς ήρθες ξανά" : "Welcome back"),
    title: isRegister ? (el ? "Ξεκίνα να συλλέγεις στιγμές" : "Start collecting moments") : m.login,
    subtitle: isRegister
      ? (el ? "Ένας ιδιωτικός χώρος για κάθε event, με εσένα στον έλεγχο." : "A private space for every event, with you in control.")
      : (el ? "Συνδέσου για να δεις και να διαχειριστείς τα events σου." : "Sign in to view and manage your events."),
    divider: el ? "ή με email" : "or with email",
    confirmPassword: el ? "Επιβεβαίωση κωδικού" : "Confirm password",
    show: el ? "Εμφάνιση" : "Show",
    hide: el ? "Απόκρυψη" : "Hide",
    passwordHint: el ? "Χρησιμοποίησε τουλάχιστον 10 χαρακτήρες." : "Use at least 10 characters.",
    passwordMismatch: el ? "Οι κωδικοί δεν ταιριάζουν." : "Passwords do not match.",
    termsStart: el ? "Συμφωνώ με τους" : "I agree to the",
    terms: el ? "Όρους χρήσης" : "Terms of use",
    and: el ? "και την" : "and the",
    privacy: el ? "Πολιτική απορρήτου" : "Privacy policy",
    socialConsent: el ? "Συνεχίζοντας, αποδέχεσαι τους Όρους και την Πολιτική απορρήτου." : "By continuing, you agree to the Terms and Privacy policy.",
    secure: el ? "Ιδιωτικά galleries" : "Private galleries",
    secureText: el ? "Μόνο οι άνθρωποι που επιλέγεις έχουν πρόσβαση." : "Only the people you choose can access them.",
    simple: el ? "Χωρίς περίπλοκο setup" : "No complicated setup",
    simpleText: el ? "Δημιούργησε event, μοιράσου το link και ξεκίνα." : "Create an event, share the link, and start collecting.",
    together: el ? "Όλες οι στιγμές μαζί" : "Every moment together",
    togetherText: el ? "Φωτογραφίες και βίντεο από όλους, σε ένα μέρος." : "Photos and videos from everyone, in one place.",
    rateLimit: el ? "Πολλές προσπάθειες. Δοκίμασε ξανά αργότερα." : "Too many attempts. Please try again later.",
  };

  const feature = (icon: string, title: string, description: string) => `<li class="flex gap-4"><span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-lg">${icon}</span><span><strong class="block text-sm text-white">${title}</strong><span class="mt-1 block text-sm leading-6 text-white/65">${description}</span></span></li>`;

  return page(
    `${isRegister ? m.register : m.login} – Memboux`,
    `<main class="min-h-screen bg-[#f4f6fb] p-4 sm:p-6 lg:flex lg:items-center lg:justify-center">
      <section class="mx-auto grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-[#dbe2f0] bg-white shadow-[0_30px_100px_rgba(30,41,59,.13)] lg:min-h-[720px] lg:grid-cols-[.9fr_1.1fr]">
        <aside class="relative hidden overflow-hidden bg-[#172033] p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div class="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[#4f46e5]/25 blur-3xl"></div>
          <div class="relative"><div class="[&_span]:text-white">${brandMark(`/${locale}`, true)}</div><p class="mt-16 text-xs font-semibold uppercase tracking-[.25em] text-[#a5b4fc]">Collecting moments</p><h2 class="mt-4 max-w-md text-5xl font-medium leading-[1.08]">${isRegister ? (el ? "Κάθε event αξίζει τον δικό του χώρο." : "Every event deserves its own space.") : (el ? "Οι στιγμές σου σε περιμένουν." : "Your moments are waiting.")}</h2></div>
          <ul class="relative mt-12 space-y-6">${feature("◇", copy.secure, copy.secureText)}${feature("＋", copy.simple, copy.simpleText)}${feature("✦", copy.together, copy.togetherText)}</ul>
        </aside>
        <div class="flex flex-col p-6 sm:p-10 lg:p-14">
          <div class="flex items-center justify-between lg:justify-end"><div class="lg:hidden">${brandMark(`/${locale}`, true)}</div><a href="/${locale === "el" ? "en" : "el"}/${mode}" class="rounded-full border border-[#dbe2f0] px-3 py-2 text-xs font-semibold text-[#4338ca]">${locale === "el" ? "EN" : "EL"}</a></div>
          <div class="mx-auto my-auto w-full max-w-md py-8">
            <p class="text-xs font-semibold uppercase tracking-[.2em] text-[#4f46e5]">${copy.eyebrow}</p>
            <h1 class="mt-3 text-4xl font-medium tracking-[-.03em] text-[#111827] sm:text-5xl">${copy.title}</h1>
            <p class="mt-4 text-base leading-7 text-[#64748b]">${copy.subtitle}</p>
            <button id="google" type="button" class="mt-8 flex w-full items-center justify-center gap-3 rounded-2xl border border-[#dbe2f0] bg-white px-4 py-3.5 font-semibold text-[#172033] shadow-sm transition hover:border-[#818cf8] hover:bg-[#f8faff] disabled:cursor-wait disabled:opacity-60">${googleIcon()}<span>${m.continueGoogle}</span></button>
            ${isRegister ? `<p class="mt-2 text-center text-[11px] leading-5 text-[#94a3b8]">${copy.socialConsent}</p>` : ""}
            <div class="my-6 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[.12em] text-[#94a3b8]"><span class="h-px flex-1 bg-[#e2e8f0]"></span>${copy.divider}<span class="h-px flex-1 bg-[#e2e8f0]"></span></div>
            <form id="authForm" class="space-y-4" novalidate>
              ${isRegister ? `<label class="block text-sm font-medium text-[#334155]">${m.name}<input name="name" required minlength="2" maxlength="100" autocomplete="name" class="mt-1.5 w-full rounded-2xl border border-[#cbd5e1] px-4 py-3.5 outline-none transition focus:border-[#6366f1] focus:ring-4 focus:ring-[#6366f1]/10"></label>` : ""}
              <label class="block text-sm font-medium text-[#334155]">${m.email}<input name="email" type="email" required maxlength="254" autocomplete="email" inputmode="email" class="mt-1.5 w-full rounded-2xl border border-[#cbd5e1] px-4 py-3.5 outline-none transition focus:border-[#6366f1] focus:ring-4 focus:ring-[#6366f1]/10"></label>
              <label class="block text-sm font-medium text-[#334155]">${m.password}<span class="relative mt-1.5 block"><input id="password" name="password" type="password" required minlength="10" maxlength="128" autocomplete="${isRegister ? "new-password" : "current-password"}" class="w-full rounded-2xl border border-[#cbd5e1] px-4 py-3.5 pr-24 outline-none transition focus:border-[#6366f1] focus:ring-4 focus:ring-[#6366f1]/10"><button id="toggle-password" type="button" class="absolute inset-y-0 right-3 my-auto h-9 rounded-xl px-3 text-xs font-semibold text-[#4f46e5]">${copy.show}</button></span></label>
              ${isRegister ? `<div><div class="h-1.5 overflow-hidden rounded-full bg-[#e2e8f0]"><span id="password-strength" class="block h-full w-0 rounded-full transition-all"></span></div><p id="password-hint" class="mt-2 text-xs text-[#64748b]">${copy.passwordHint}</p></div><label class="block text-sm font-medium text-[#334155]">${copy.confirmPassword}<input id="confirm-password" name="confirmPassword" type="password" required minlength="10" maxlength="128" autocomplete="new-password" class="mt-1.5 w-full rounded-2xl border border-[#cbd5e1] px-4 py-3.5 outline-none transition focus:border-[#6366f1] focus:ring-4 focus:ring-[#6366f1]/10"></label><label class="flex items-start gap-3 rounded-2xl bg-[#f8faff] p-4 text-sm leading-6 text-[#475569]"><input id="terms" name="terms" type="checkbox" required class="mt-1 h-4 w-4 shrink-0 accent-[#4f46e5]"><span>${copy.termsStart} <a href="/${locale}/terms" target="_blank" class="font-semibold text-[#4338ca]">${copy.terms}</a> ${copy.and} <a href="/${locale}/privacy-policy" target="_blank" class="font-semibold text-[#4338ca]">${copy.privacy}</a>.</span></label>` : ""}
              <p id="error" role="alert" aria-live="polite" class="hidden rounded-2xl bg-red-50 p-3.5 text-sm text-red-700"></p>
              <button id="submit-auth" class="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#172033] px-5 py-4 font-semibold text-white transition hover:bg-[#27334a] disabled:cursor-wait disabled:opacity-65"><span>${isRegister ? m.register : m.login}</span><span aria-hidden="true">→</span></button>
            </form>
            ${!isRegister ? `<a href="/${locale}/forgot-password" class="mt-4 block text-center text-sm font-semibold text-[#4338ca]">${m.forgotPassword}</a>` : ""}
            <p class="mt-7 text-center text-sm text-[#64748b]">${isRegister ? m.hasAccount : m.noAccount} <a class="font-semibold text-[#4338ca]" href="/${locale}/${isRegister ? "login" : "register"}">${isRegister ? m.login : m.register}</a></p>
          </div>
        </div>
      </section>
    </main>
    <script>
      const locale=${JSON.stringify(locale)},isRegister=${JSON.stringify(isRegister)},errorBox=document.getElementById('error'),authForm=document.getElementById('authForm'),submitButton=document.getElementById('submit-auth'),googleButton=document.getElementById('google'),passwordInput=document.getElementById('password'),togglePassword=document.getElementById('toggle-password');
      const showError=(message)=>{errorBox.textContent=message;errorBox.classList.remove('hidden')};
      const setBusy=(button,busy)=>{button.disabled=busy;button.setAttribute('aria-busy',String(busy))};
      togglePassword.onclick=()=>{const show=passwordInput.type==='password';passwordInput.type=show?'text':'password';const confirmInput=document.getElementById('confirm-password');if(confirmInput)confirmInput.type=show?'text':'password';togglePassword.textContent=show?${JSON.stringify(copy.hide)}:${JSON.stringify(copy.show)}};
      if(isRegister){const strength=document.getElementById('password-strength'),hint=document.getElementById('password-hint');passwordInput.addEventListener('input',()=>{const value=passwordInput.value;let score=0;if(value.length>=10)score++;if(value.length>=14)score++;if(/[a-z]/i.test(value)&&/\d/.test(value))score++;if(/[^a-z0-9]/i.test(value))score++;strength.style.width=(score*25)+'%';strength.style.background=score<2?'#ef4444':score<4?'#f59e0b':'#10b981';hint.textContent=value.length<10?${JSON.stringify(copy.passwordHint)}:(score<3?${JSON.stringify(el ? "Καλός κωδικός — μπορείς να τον ενισχύσεις." : "Good password — you can make it stronger.")}:${JSON.stringify(el ? "Ισχυρός κωδικός." : "Strong password.")})})}
      googleButton.onclick=async()=>{errorBox.classList.add('hidden');setBusy(googleButton,true);try{const response=await fetch('/api/auth/sign-in/social',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'google',callbackURL:'/'+locale+'/account'})});const data=await response.json().catch(()=>({}));if(data.url){location.href=data.url;return}showError(data.message||${JSON.stringify(m.genericError)})}catch{showError(${JSON.stringify(m.genericError)})}finally{setBusy(googleButton,false)}};
      authForm.onsubmit=async(event)=>{event.preventDefault();errorBox.classList.add('hidden');if(!authForm.reportValidity())return;const form=new FormData(authForm),email=String(form.get('email')||'').trim().toLowerCase(),password=String(form.get('password')||'');if(isRegister&&password!==String(form.get('confirmPassword')||'')){showError(${JSON.stringify(copy.passwordMismatch)});document.getElementById('confirm-password').focus();return}setBusy(submitButton,true);try{const payload={email,password,callbackURL:'/'+locale+'/account'};if(isRegister)payload.name=String(form.get('name')||'').trim();const response=await fetch('/api/auth/'+(isRegister?'sign-up':'sign-in')+'/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await response.json().catch(()=>({}));if(response.ok){if(isRegister){sessionStorage.setItem('membouxVerificationEmail',email);sessionStorage.setItem('membouxRegistrationName',String(payload.name||''));location.href='/'+locale+'/verify-email?source=signup'}else{location.href='/'+locale+'/account'}return}if(!isRegister&&response.status===403&&data.code==='EMAIL_NOT_VERIFIED'){sessionStorage.setItem('membouxVerificationEmail',email);location.href='/'+locale+'/verify-email?source=signin';return}showError(response.status===429?${JSON.stringify(copy.rateLimit)}:(data.message||${JSON.stringify(m.genericError)}))}catch{showError(${JSON.stringify(m.genericError)})}finally{setBusy(submitButton,false)}};
    <\/script>`,
  );
}
