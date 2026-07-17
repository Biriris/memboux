import { describe, expect, it } from "vitest";
import { accountMenu, brandMark, eventHeader, googleIcon, logoutScript, page } from "../src/views/shared";

describe("shared views", () => {
  it("renders the production stylesheet and escapes the page title", () => {
    const html = page(`Memboux <script>alert("x")</script>`, "<main>safe body</main>");

    expect(html).toContain('family=Manrope:wght@200..800&display=swap');
    expect(html).toContain('<link rel="stylesheet" href="/app-midnight.css?v=20260717-1">');
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

  it("shows pending album invitations in the dashboard header", () => {
    const html = eventHeader("en", { name: "Alex", email: "alex@example.com" }, "", 3);

    expect(html).toContain('href="/en/account#invitations"');
    expect(html).toContain('aria-label="Invitations"');
    expect(html).toContain(">3</span>");
  });

  it("renders escaped account data and localized menu labels", () => {
    const english = accountMenu("en", { name: `<Admin>`, email: `a&b@example.com` });
    const greek = accountMenu("el", { name: "Κώστας", email: "user@example.com" });

    expect(english).toContain("&lt;Admin&gt;");
    expect(english).toContain("a&amp;b@example.com");
    expect(english).toContain("My events");
    expect(english).toContain("Workspace");
    expect(english).toContain("Cloud &amp; plan");
    expect(english).toContain("Plan &amp; usage");
    expect(english).toContain('aria-label="Account menu"');
    expect(english).not.toContain('role="menu"');
    expect(english).not.toContain("▦");
    expect(greek).toContain("Τα events μου");
    expect(greek).toContain("Χώρος εργασίας");
    expect(greek).toContain("Αντίγραφα ασφαλείας");
    expect(greek).toContain("Αποσύνδεση");
  });

  it("shows invitation count inside the organized account navigation", () => {
    const html = accountMenu("en", { name: "Alex", email: "alex@example.com" }, 12);

    expect(html).toContain('href="/en/account#invitations"');
    expect(html).toContain(">12</span>");
    expect(html).toContain('href="/en/backups"');
    expect(html).toContain('href="/en/security"');
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
