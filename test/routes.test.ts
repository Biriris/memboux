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
  });

  it("renders canonical multilingual SEO on homepages and noindex on login", async () => {
    const home = await SELF.fetch("https://memboux.com/en");
    const homeHtml = await home.text();
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
    ["/en", "Every moment from your event"],
    ["/el", "Όλες οι στιγμές του event"],
    ["/en/login", "Continue with Google"],
    ["/el/register", "Συνέχεια με Google"],
    ["/en/verify-email", "Check your email"],
    ["/el/forgot-password", "Αποστολή συνδέσμου"],
    ["/en/reset-password?token=test-token", "Choose a new password"],
    ["/en/privacy-policy", "Privacy policy"],
    ["/el/terms", "Όροι χρήσης"],
    ["/en/privacy-request", "Exercise your rights"],
  ])("renders public route %s", async (path, expectedText) => {
    const response = await SELF.fetch(`https://memboux.com${path}`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain(expectedText);
    expect(html).toContain('/app.css');
  });

  it("keeps the Better Auth session endpoint mounted", async () => {
    const response = await SELF.fetch("https://memboux.com/api/auth/get-session");

    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });
});
