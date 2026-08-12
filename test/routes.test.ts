import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { eventVerticals } from "../src/event-verticals";

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

  it("exposes a secret-safe email readiness check", async () => {
    const response = await SELF.fetch("https://memboux.com/health/email");
    const body = await response.json<{
      status: string;
      checkedAt: number;
      outboundConfigured: boolean;
      deliveryTrackingConfigured: boolean;
      dns: Record<string, string>;
    }>();

    expect([200, 503]).toContain(response.status);
    expect(["ready", "action_required"]).toContain(body.status);
    expect(body.checkedAt).toBeTypeOf("number");
    expect(body.outboundConfigured).toBeTypeOf("boolean");
    expect(body.deliveryTrackingConfigured).toBeTypeOf("boolean");
    expect(Object.keys(body.dns).sort()).toEqual(["dkim", "dmarc", "mx", "spf"]);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(body)).not.toContain("whsec_");
    expect(JSON.stringify(body)).not.toContain("re_");
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
    expect(homeHtml).toContain("Don’t leave your memories on everyone else’s phone.");
    expect(homeHtml).toContain("Why Memboux exists");
    expect(homeHtml).toContain("Photos and videos from everyone");
    expect(greekHomeHtml).toContain("Μην αφήσεις τις αναμνήσεις σου στα κινητά των άλλων.");
    expect(greekHomeHtml).toContain("Γιατί υπάρχει το Memboux");
    expect(greekHomeHtml).toContain("Φωτογραφίες και βίντεο από όλους");

    const login = await SELF.fetch("https://memboux.com/en/login");
    expect(await login.text()).toContain('content="noindex,nofollow,noarchive"');
  });

  it("renders the indexable wedding landing and its creation funnel", async () => {
    const response = await SELF.fetch("https://memboux.com/el/wedding");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Η κοινή μνήμη του γάμου σας");
    expect(html).toContain("φωτογραφίες και βίντεο από κάθε καλεσμένο");
    expect(html).toContain('href="/el/register?redirect=');
    expect(html).toContain('<link rel="canonical" href="https://memboux.com/el/wedding">');
    expect(html).toContain('content="index,follow,max-image-preview:large"');
    expect(html).toContain('"@type":"SoftwareApplication"');
  });

  it.each([
    ["fr", "Votre mariage à travers les yeux de tous ceux qui y étaient."],
    ["de", "Eure Hochzeit durch die Augen aller, die dabei waren."],
    ["es", "Vuestra boda desde la mirada de todos los que estuvieron allí."],
    ["it", "Il vostro matrimonio attraverso gli occhi di tutti."],
  ])("uses native flagship Wedding messaging in %s", async (locale, headline) => {
    const response = await SELF.fetch(`https://memboux.com/${locale}/wedding`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain(`lang="${locale}"`);
    expect(html).toContain(headline);
    expect(html).not.toContain("Your wedding through the eyes of everyone who was there.");
  });

  it("renders specialized event landing pages and rejects unknown verticals", async () => {
    const response = await SELF.fetch("https://memboux.com/el/events/birthday");
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('<link rel="canonical" href="https://memboux.com/el/events/birthday">');
    expect(html).toContain("create%3Dbirthday");
    expect(html).toContain("37 ημέρες");

    const unknown = await SELF.fetch("https://memboux.com/en/events/unknown");
    expect(unknown.status).toBe(404);

    const sitemap = await SELF.fetch("https://memboux.com/sitemap.xml");
    expect(await sitemap.text()).toContain("https://memboux.com/en/events/corporate");
  });

  it("serves interactive pre-creation demos without authentication", async () => {
    const demo = await SELF.fetch("https://memboux.com/el/events/trip/preview");
    const demoHtml = await demo.text();
    expect(demo.status).toBe(200);
    expect(demoHtml).toContain('data-demo-theme="editorial"');
    expect(demoHtml).toContain('data-demo-width="390px"');
    expect(demoHtml).toContain('content="noindex,nofollow,noarchive"');

    const frame = await SELF.fetch("https://memboux.com/el/events/trip/demo-frame?theme=editorial");
    const frameHtml = await frame.text();
    expect(frame.status).toBe(200);
    expect(frameHtml).toContain('data-event-preview="trip"');
    expect(frameHtml).toContain('data-event-theme="editorial"');
    expect(frame.headers.get("content-security-policy")).toContain("frame-ancestors 'self'");

    const wedding = await SELF.fetch("https://memboux.com/en/wedding/preview");
    const weddingHtml = await wedding.text();
    expect(wedding.status).toBe(200);
    expect(weddingHtml.match(/data-wedding-demo-theme=/g)).toHaveLength(15);

    const weddingFrame = await SELF.fetch("https://memboux.com/en/wedding/demo-frame?theme=nocturne");
    expect(await weddingFrame.text()).toContain('data-wedding-theme="nocturne"');
  });

  it("serves every preview language without losing the selected theme", async () => {
    for (const locale of ["en", "el", "fr", "de", "es", "it"]) {
      const event = await SELF.fetch(`https://memboux.com/${locale}/events/bachelor/preview?theme=vivid`);
      expect(event.status).toBe(200);
      const eventHtml = await event.text();
      expect(eventHtml).toContain(`/${locale}/events/bachelor/demo-frame?theme=vivid`);
      expect(eventHtml).toContain("/fr/events/bachelor/preview?theme=vivid");

      const wedding = await SELF.fetch(`https://memboux.com/${locale}/wedding/preview?theme=nocturne`);
      expect(wedding.status).toBe(200);
      const weddingHtml = await wedding.text();
      expect(weddingHtml).toContain(`/${locale}/wedding/demo-frame?theme=nocturne`);
      expect(weddingHtml).toContain("/it/wedding/preview?theme=nocturne");
    }
  });

  it("serves the complete event-type × locale preview matrix without fallback corruption", async () => {
    const locales = ["en", "el", "fr", "de", "es", "it"] as const;
    const latinLocales = new Set(["fr", "de", "es", "it"]);
    const mojibake = /[\u039e\u039f\u0393]|\u03b2[\u20ac\u2122\u2019]/;

    for (const locale of locales) {
      const eventChecks = await Promise.all(eventVerticals.map(async (vertical) => {
        const [preview, frame] = await Promise.all([
          SELF.fetch(`https://memboux.com/${locale}/events/${vertical.type}/preview?theme=vivid`),
          SELF.fetch(`https://memboux.com/${locale}/events/${vertical.type}/demo-frame?theme=vivid`),
        ]);
        return {
          vertical,
          preview,
          frame,
          previewHtml: await preview.text(),
          frameHtml: await frame.text(),
        };
      }));

      for (const check of eventChecks) {
        expect(check.preview.status).toBe(200);
        expect(check.frame.status).toBe(200);
        expect(check.previewHtml).toContain(`<html lang="${locale}">`);
        expect(check.frameHtml).toContain(`<html lang="${locale}">`);
        expect(check.previewHtml).toContain(
          `/${locale}/events/${check.vertical.type}/demo-frame?theme=vivid`,
        );
        for (const targetLocale of locales) {
          expect(check.previewHtml).toContain(
            `/${targetLocale}/events/${check.vertical.type}/preview?theme=vivid`,
          );
        }
        expect(check.frameHtml).toContain(
          `data-event-preview="${check.vertical.type}"`,
        );
        expect(check.frameHtml).toContain('data-event-theme="vivid"');
        expect(check.previewHtml).not.toContain("\uFFFD");
        expect(check.frameHtml).not.toContain("\uFFFD");
        if (latinLocales.has(locale)) {
          expect(check.previewHtml).not.toMatch(mojibake);
          expect(check.frameHtml).not.toMatch(mojibake);
        }
      }

      const [weddingPreview, weddingFrame] = await Promise.all([
        SELF.fetch(`https://memboux.com/${locale}/wedding/preview?theme=nocturne`),
        SELF.fetch(`https://memboux.com/${locale}/wedding/demo-frame?theme=nocturne`),
      ]);
      const [weddingPreviewHtml, weddingFrameHtml] = await Promise.all([
        weddingPreview.text(),
        weddingFrame.text(),
      ]);
      expect(weddingPreview.status).toBe(200);
      expect(weddingFrame.status).toBe(200);
      expect(weddingPreviewHtml).toContain(`/${locale}/wedding/demo-frame?theme=nocturne`);
      expect(weddingFrameHtml).toContain('data-wedding-theme="nocturne"');
      for (const targetLocale of locales) {
        expect(weddingPreviewHtml).toContain(
          `/${targetLocale}/wedding/preview?theme=nocturne`,
        );
      }
    }
  }, 15_000);

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
    ["/en", "Don’t leave your memories on everyone else’s phone."],
    ["/el", "Μην αφήσεις τις αναμνήσεις σου στα κινητά των άλλων."],
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
    expect(html).toContain("No app required");
    expect(html).toContain("Memboux Studio");
    expect(html).toContain("Your next big event starts here.");
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
