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
});
