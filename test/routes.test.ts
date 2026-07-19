import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("public Worker routes", () => {
  it("exposes dependency-free liveness and D1 readiness checks", async () => {
    const live = await SELF.fetch("https://memboux.com/health/live");
    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ status: "ok" });
    expect(live.headers.get("cache-control")).toBe("no-store");

    const ready = await SELF.fetch("https://memboux.com/health/ready");
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ status: "ready" });
    expect(ready.headers.get("cache-control")).toBe("no-store");
  });

  it("redirects the root URL to the English homepage", async () => {
    const response = await SELF.fetch("https://memboux.com/", { redirect: "manual" });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/en");
  });

  it("publishes robots and sitemap files while excluding private routes", async () => {
    const robots = await SELF.fetch("https://memboux.com/robots.txt");
    const robotsText = await robots.text();
    expect(robots.status).toBe(200);
    expect(robotsText).toContain("Disallow: /gallery/");
    expect(robotsText).toContain("Sitemap: https://memboux.com/sitemap.xml");

    const sitemap = await SELF.fetch("https://memboux.com/sitemap.xml");
    const sitemapText = await sitemap.text();
    expect(sitemap.status).toBe(200);
    expect(sitemap.headers.get("content-type")).toContain("application/xml");
    expect(sitemapText).toContain("https://memboux.com/en");
    expect(sitemapText).toContain('hreflang="el"');
    expect(sitemapText).toContain('hreflang="fr"');
    expect(sitemapText).toContain('hreflang="de"');
    expect(sitemapText).toContain('hreflang="es"');
    expect(sitemapText).toContain('hreflang="it"');
  });

  it("renders canonical multilingual SEO on homepages and noindex on login", async () => {
    const home = await SELF.fetch("https://memboux.com/en");
    const homeHtml = await home.text();
    const greekHome = await SELF.fetch("https://memboux.com/el");
    const greekHomeHtml = await greekHome.text();
    expect(homeHtml).toContain('data-page="home" data-locale="en"');
    expect(greekHomeHtml).toContain('data-page="home" data-locale="el"');
    expect(homeHtml).toContain('<link rel="canonical" href="https://memboux.com/en">');
    expect(homeHtml).toContain('hreflang="x-default"');
    expect(homeHtml).toContain('property="og:title"');
    expect(homeHtml).toContain('content="index,follow,max-image-preview:large"');

    const login = await SELF.fetch("https://memboux.com/en/login");
    expect(await login.text()).toContain('content="noindex,nofollow,noarchive"');
  });

  it("returns 404 for an unknown route", async () => {
    const response = await SELF.fetch("https://memboux.com/route-that-does-not-exist");

    expect(response.status).toBe(404);
  });

  it.each([
    ["fr", "Rassemblez chaque moment. Gardez-le à vous.", "Français"],
    ["de", "Sammle jeden Moment. Behalte ihn für dich.", "Deutsch"],
    ["es", "Reúne cada momento. Hazlo tuyo.", "Español"],
    ["it", "Raccogli ogni momento. Tienilo per te.", "Italiano"],
  ])("fully localizes the %s homepage and exposes every language", async (locale, hero, languageName) => {
    const response = await SELF.fetch(`https://memboux.com/${locale}`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(`memboux_locale=${locale}`);
    expect(html).toContain(`<html lang="${locale}">`);
    expect(html).toContain(hero);
    expect(html).toContain(languageName);
    expect(html).toContain('href="/en"');
    expect(html).toContain('href="/el"');
    expect(html).toContain('href="/fr"');
    expect(html).toContain('href="/de"');
    expect(html).toContain('href="/es"');
    expect(html).toContain('href="/it"');
    expect(html).toContain(`property="og:locale" content="${locale === "fr" ? "fr_FR" : locale === "de" ? "de_DE" : locale === "es" ? "es_ES" : "it_IT"}"`);
  });

  it("publishes transparent Google Drive data-use terms in both languages", async () => {
    const englishPrivacy = await (await SELF.fetch("https://memboux.com/en/privacy-policy")).text();
    const greekTerms = await (await SELF.fetch("https://memboux.com/el/terms")).text();

    expect(englishPrivacy).toContain("Google Sign-In and personal Drive backups");
    expect(englishPrivacy).toContain("drive.file");
    expect(englishPrivacy).toContain("Google API Services User Data Policy");
    expect(englishPrivacy).toContain("Limited Use requirements");
    expect(greekTerms).toContain("Προαιρετικά Google Drive backups");
  });

  it.each([
    ["/en", "Collect every moment. Keep it yours."],
    ["/el", "Συγκέντρωσε κάθε στιγμή. Κράτησέ τη δική σου."],
    ["/en/login", "Continue with Google"],
    ["/el/register", "Συνέχεια με Google"],
    ["/en/verify-email", "Check your email"],
    ["/el/forgot-password", "Αποστολή συνδέσμου"],
    ["/en/reset-password?token=test-token", "Choose a new password"],
    ["/en/privacy-policy", "Privacy policy"],
    ["/en/cookie-policy", "Essential cookies"],
    ["/el/terms", "Όροι χρήσης"],
    ["/en/privacy-request", "Exercise your rights"],
  ])("renders public route %s", async (path, expectedText) => {
    const response = await SELF.fetch(`https://memboux.com${path}`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain(expectedText);
    expect(html).toContain('/app-midnight.css');
  });

  it("keeps the Better Auth session endpoint mounted", async () => {
    const response = await SELF.fetch("https://memboux.com/api/auth/get-session");

    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });

  it("renders the complete bilingual commercial homepage", async () => {
    const response = await SELF.fetch("https://memboux.com/en");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('id="how-it-works"');
    expect(html).toContain('id="features"');
    expect(html).toContain('id="privacy"');
    expect(html).toContain("No guest app required");
    expect(html).toContain("Memboux Studio");
    expect(html).toContain("Create your first event gallery.");
    expect(html).toContain('/en/register');
    expect(html).toContain('/el');
  });

  it("offers verification email resend without placing the email in the URL", async () => {
    const response = await SELF.fetch("https://memboux.com/en/verify-email");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('id="resend-verification"');
    expect(html).toContain("Resend verification email");
    expect(html).toContain("membouxVerificationEmail");
    expect(html).not.toContain("?email=");
  });

  it("renders a complete modern registration form", async () => {
    const response = await SELF.fetch("https://memboux.com/en/register");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('autocomplete="name"');
    expect(html).toContain('name="confirmPassword"');
    expect(html).toContain('id="password-strength"');
    expect(html).toContain('maxlength="128"');
    expect(html).toContain('id="terms"');
    expect(html).toContain('/en/privacy-policy');
    expect(html).toContain('/en/terms');
    expect(html).toContain("membouxRegistrationName");
  });

  it("returns users to a safe album invitation after authentication", async () => {
    const response = await SELF.fetch("https://memboux.com/en/login?redirect=%2Finvite%2Fsafe-token%3Flang%3Den");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('postAuthRedirect="/invite/safe-token?lang=en"');
    expect(html).not.toContain("https://phishing.example");
  });

  it("explains the privacy-safe existing-account registration outcome", async () => {
    const response = await SELF.fetch("https://memboux.com/en/verify-email");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Already registered or used Google?");
    expect(html).toContain("an already verified account does not receive another verification link");
    expect(html).toContain('/en/forgot-password');
  });
});
