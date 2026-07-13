import { describe, expect, it } from "vitest";
import { accountMenu, brandMark, googleIcon, logoutScript, page } from "../src/views/shared";

describe("shared views", () => {
  it("renders the production stylesheet and escapes the page title", () => {
    const html = page(`Memboux <script>alert("x")</script>`, "<main>safe body</main>");

    expect(html).toContain('<link rel="stylesheet" href="/app.css">');
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

  it("keeps the brand destination inside the authenticated account", () => {
    expect(brandMark("/en")).toContain('href="/en/account"');
    expect(brandMark("/admin")).toContain('href="/admin"');
  });

  it("renders escaped account data and localized menu labels", () => {
    const english = accountMenu("en", { name: `<Admin>`, email: `a&b@example.com` });
    const greek = accountMenu("el", { name: "Κώστας", email: "user@example.com" });

    expect(english).toContain("&lt;Admin&gt;");
    expect(english).toContain("a&amp;b@example.com");
    expect(english).toContain("My events");
    expect(greek).toContain("Τα events μου");
    expect(greek).toContain("Αποσύνδεση");
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
