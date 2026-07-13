import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("public Worker routes", () => {
  it("redirects the root URL to the English homepage", async () => {
    const response = await SELF.fetch("https://memboux.com/", { redirect: "manual" });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/en");
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
