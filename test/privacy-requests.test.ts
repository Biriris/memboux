import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE privacy_requests (
      id TEXT PRIMARY KEY,email TEXT NOT NULL,request_type TEXT NOT NULL,
      details TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,resolved_at INTEGER
    )`),
    env.DB.prepare(`CREATE TABLE request_rate_limits (
      rate_key TEXT PRIMARY KEY,window_started_at INTEGER NOT NULL,
      request_count INTEGER NOT NULL,expires_at INTEGER NOT NULL
    )`),
  ]);
});

describe("public privacy requests", () => {
  it("validates request fields", async () => {
    const response = await SELF.fetch("https://memboux.com/api/privacy/requests", {
      method: "POST", headers: { Origin: "https://memboux.com" },
      body: new URLSearchParams({ locale: "en", email: "invalid", requestType: "access", details: "too short" }),
    });
    expect(response.status).toBe(400);
  });

  it("records a valid request and returns a reference", async () => {
    const response = await SELF.fetch("https://memboux.com/api/privacy/requests", {
      method: "POST",
      headers: { Origin: "https://memboux.com", "CF-Connecting-IP": "203.0.113.91" },
      body: new URLSearchParams({ locale: "en", email: "Person@Example.com", requestType: "access", details: "Please provide a copy of the data connected to my account." }),
      redirect: "manual",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toMatch(/^\/en\/privacy-request\?sent=1&reference=[a-f0-9-]{36}$/i);
    const row = await env.DB.prepare("SELECT email,request_type,status FROM privacy_requests").first<{email:string;request_type:string;status:string}>();
    expect(row).toEqual({ email: "person@example.com", request_type: "access", status: "pending" });
  });
});
