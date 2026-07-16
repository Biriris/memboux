import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("global security middleware", () => {
  it("permanently redirects production HTTP requests to the same HTTPS URL", async () => {
    const response = await SELF.fetch("http://memboux.com/gallery/ABC123?lang=el", {
      redirect: "manual",
    });

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://memboux.com/gallery/ABC123?lang=el");
  });

  it("adds production browser security headers to HTML responses", async () => {
    const response = await SELF.fetch("https://memboux.com/en");

    expect(response.status).toBe(200);
    expect(response.headers.get("strict-transport-security")).toContain("includeSubDomains");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(response.headers.get("permissions-policy")).toContain("camera=()");
    expect(response.headers.get("permissions-policy")).toContain("geolocation=()");
    expect(response.headers.get("permissions-policy")).toContain("microphone=()");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.has("x-powered-by")).toBe(false);
  });

  it("rejects unsafe form requests from another origin", async () => {
    const response = await SELF.fetch("https://memboux.com/admin/logout", {
      method: "POST",
      headers: {
        Origin: "https://attacker.example",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "",
      redirect: "manual",
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects form requests without browser origin metadata", async () => {
    const response = await SELF.fetch("https://memboux.com/admin/logout", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "",
      redirect: "manual",
    });

    expect(response.status).toBe(403);
  });

  it("allows same-origin form requests", async () => {
    const response = await SELF.fetch("https://memboux.com/admin/logout", {
      method: "POST",
      headers: {
        Origin: "https://memboux.com",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "",
      redirect: "manual",
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin/login");
  });

  it("does not expose cross-origin API access", async () => {
    const response = await SELF.fetch("https://memboux.com/api/account/events", {
      method: "POST",
      headers: {
        Origin: "https://attacker.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ eventName: "Blocked" }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});
