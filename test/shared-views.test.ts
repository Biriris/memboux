import { describe, expect, it } from "vitest";
import { accountMenu, brandMark, eventHeader, googleIcon, logoutScript, page, settingsBackLink } from "../src/views/shared";

describe("shared views", () => {
  it("renders the production stylesheet and escapes the page title", () => {
    const html = page(`Memboux <script>alert("x")</script>`, "<main>safe body</main>");

    expect(html).toContain('family=Manrope:wght@200..800&display=swap');
    expect(html).toContain('<link rel="stylesheet" href="/app-midnight.css?v=20260718-1">');
    expect(html).toContain('<meta name="theme-color" content="#183c33">');
    expect(html).toContain("Memboux &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).not.toContain("cdn.tailwindcss.com");
    expect(html).toContain('name="robots" content="noindex,nofollow,noarchive"');
  });

  it("renders indexable multilingual SEO metadata only when explicitly enabled", () => {
    const html = page("Memboux", "<main>Home</main>", {
      locale: "el",
      description: "Ιδιωτικά galleries για events",
      canonical: "https://memboux.com/el",
      alternates: { en: "https://memboux.com/en", el: "https://memboux.com/el" },
      index: true,
      structuredData: { "@type": "WebApplication" },
    });

    expect(html).toContain('<html lang="el">');
    expect(html).toContain('content="index,follow,max-image-preview:large"');
    expect(html).toContain('<link rel="canonical" href="https://memboux.com/el">');
    expect(html).toContain('hreflang="en"');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('type="application/ld+json"');
  });

  it("keeps the brand destination contextual", () => {
    expect(brandMark("/en")).toContain('href="/en"');
    expect(brandMark("/en/account")).toContain('href="/en/account"');
    expect(brandMark("/admin")).toContain('href="/admin"');
    expect(eventHeader("en", { name: "Alex", email: "alex@example.com" })).toContain('href="/en/account"');
  });

  it("renders a localized back link on every settings subsection", () => {
    const labels = {
      en: "Back to settings",
      el: "Πίσω στις ρυθμίσεις",
      fr: "Retour aux paramètres",
      de: "Zurück zu den Einstellungen",
      es: "Volver a ajustes",
      it: "Torna alle impostazioni",
    } as const;

    for (const [locale, label] of Object.entries(labels)) {
      const link = settingsBackLink(locale as keyof typeof labels);
      expect(link).toContain(`href="/${locale}/settings"`);
      expect(link).toContain(`>${label}</span>`);
      expect(link).toContain("data-settings-back");
    }

    const subsectionMarkers = [
      'id="professional-enabled"',
      'id="revoke-sessions"',
      'id="delete-account"',
      "Account capacity",
      "/api/cloud/google/connect",
      'id="owner-trash-select"',
    ];
    for (const marker of subsectionMarkers) {
      const subsection = page("Settings subsection", `<header></header><main class="content"><span ${marker.startsWith("id=") ? marker : ""}>${marker}</span></main>`, { locale: "en" });
      expect(subsection).toContain('<main class="content"><a data-settings-back');
    }
    const settingsHub = page("Settings", '<header></header><main class="content"><h1>Settings</h1></main>', { locale: "en" });
    const connectedBackups = page("Cloud backups", '<header></header><main class="content"><form action="/api/cloud/google/disconnect"></form></main>', { locale: "en", settingsBack: true });
    expect(connectedBackups).toContain('<main class="content"><a data-settings-back');
    expect(settingsHub).not.toContain("data-settings-back");
  });

  it("shows pending album invitations in the dashboard header", () => {
    const html = eventHeader("en", { name: "Alex", email: "alex@example.com" }, "", 3);

    expect(html).toContain('href="/en/notifications?view=history"');
    expect(html).toContain("Notifications");
    expect(html).toContain("data-notification-bell");
    expect(html).toContain("data-notification-menu");
    expect(html).toContain("/api/account/notifications/preview?locale=");
    expect(html).toContain("data-notification-read-all");
    expect(html).toContain("setInterval");
    expect(html).toContain("cache:'no-store'");
    expect(html).toContain(">3</span>");
    expect(html).toContain("bg-[#ef4444]");
    expect(html).toContain("data-account-notification-count");
    expect(html).not.toContain('title="Invitations"');
    expect(html).not.toContain('href="/el/account"');
  });

  it("installs one global outside-click dismissal behavior", () => {
    const html = page("Memboux", "<details open><summary>Menu</summary></details><dialog open>Modal</dialog>");

    expect(html).toContain("window.__membouxOutsideDismiss");
    expect(html).toContain("details[open]");
    expect(html).toContain('details[open]:not([class~="group/dashboard-section"])');
    expect(html).toContain("target instanceof HTMLDialogElement&&target.open");
  });

  it("installs brickwall layout behavior only on media pages", () => {
    const gallery = page("Gallery", '<div><article class="memboux-media-card"></article></div>');
    const plain = page("Plain", "<main>No media</main>");

    expect(gallery).toContain("window.__membouxBrickwall");
    expect(plain).not.toContain("window.__membouxBrickwall");
  });

  it("renders escaped account data and localized menu labels", () => {
    const english = accountMenu("en", { name: `<Admin>`, email: `a&b@example.com` });
    const greek = accountMenu("el", { name: "Κώστας", email: "user@example.com" });

    expect(english).toContain("&lt;Admin&gt;");
    expect(english).toContain("a&amp;b@example.com");
    expect(english).toContain("My events");
    expect(english).toContain("Memboux Studio");
    expect(english).toContain("Settings");
    expect(english).toContain('href="/en/settings"');
    expect(english).toContain('aria-label="Account menu"');
    expect(english).not.toContain('role="menu"');
    expect(english).not.toContain('href="/en/notifications"');
    expect(english).not.toContain('href="/en/profile"');
    expect(english).not.toContain('href="/en/security"');
    expect(english).not.toContain('href="/en/backups"');
    expect(english).not.toContain('href="/en/plan"');
    expect(english).not.toContain('href="/en/privacy"');
    expect(english).not.toContain('href="/en/trash"');
    expect(english).not.toContain("▦");
    expect(greek).toContain("Τα events μου");
    expect(greek).toContain("Ρυθμίσεις");
    expect(greek).toContain("Αποσύνδεση");
  });

  it("keeps notifications in the bell instead of duplicating them in the account menu", () => {
    const html = accountMenu("en", { name: "Alex", email: "alex@example.com" }, 12);

    expect(html).not.toContain('href="/en/notifications"');
    expect(html).not.toContain('data-account-notification-item');
    expect(html).toContain('href="/en/account"');
    expect(html).toContain('href="/studio?lang=en"');
    expect(html).toContain('href="/en/settings"');
    expect(html).toContain("data-logout");
  });

  it("keeps the sign-out request credentialed and locale-aware", () => {
    const script = logoutScript("el");

    expect(script).toContain("credentials:'include'");
    expect(script).toContain("location.replace('/el')");
  });

  it("renders the official multicolor Google mark", () => {
    const icon = googleIcon();

    expect(icon).toContain("#4285F4");
    expect(icon).toContain("#34A853");
    expect(icon).toContain("#FBBC05");
    expect(icon).toContain("#EA4335");
  });
});
