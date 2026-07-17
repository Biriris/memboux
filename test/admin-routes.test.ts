import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("admin route boundaries", () => {
  it("keeps the admin login page public", async () => {
    const response = await SELF.fetch("https://memboux.com/admin/login");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Memboux Admin");
    expect(html).toContain('/app-midnight.css');
  });

  it.each([
    "/admin",
    "/admin/events",
    "/admin/reported",
    "/admin/privacy-requests",
    "/admin/accounts",
    "/admin/users",
    "/admin/users/user-1",
    "/admin/readiness",
    "/admin/professionals",
    "/admin/trash",
    "/admin/events/ABC123",
  ])("redirects anonymous admin page %s", async (path) => {
    const response = await SELF.fetch(`https://memboux.com${path}`, {
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/admin/login");
  });

  it("rejects anonymous access to private admin media", async () => {
    const response = await SELF.fetch(
      "https://memboux.com/admin/media/11111111-1111-4111-8111-111111111111",
    );

    expect(response.status).toBe(401);
  });

  it("clears the admin cookie during logout", async () => {
    const response = await SELF.fetch("https://memboux.com/admin/logout", {
      method: "POST",
      headers: { Origin: "https://memboux.com" },
      redirect: "manual",
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin/login");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Strict");
  });
});
