import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("account route boundaries", () => {
  it.each([
    "/en/profile",
    "/en/security",
    "/en/account",
    "/en/account-legacy",
    "/en/trash",
  ])("redirects anonymous page requests from %s to login", async (path) => {
    const response = await SELF.fetch(`https://memboux.com${path}`, {
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/en/login");
  });

  it.each([
    ["/api/account/security/revoke-other-sessions", {}],
    ["/api/account/events", { eventName: "Test", locale: "en" }],
    ["/api/account/events/ABC123/trash", { locale: "en" }],
    ["/api/account/events/ABC123/restore", { locale: "en" }],
    ["/api/account/trash/restore", { ids: "" }],
  ])("rejects anonymous mutation %s", async (path, body) => {
    const response = await SELF.fetch(`https://memboux.com${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      redirect: "manual",
    });

    expect(response.status).toBe(401);
  });

  it("protects deleted media previews", async () => {
    const response = await SELF.fetch(
      "https://memboux.com/account/trash/media/11111111-1111-4111-8111-111111111111",
    );

    expect(response.status).toBe(401);
  });
});
