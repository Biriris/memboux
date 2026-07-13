import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { consumeRateLimit, purgeExpiredRateLimits, tooManyRequests } from "../src/rate-limit";

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DROP TABLE IF EXISTS request_rate_limits"),
    env.DB.prepare(`CREATE TABLE request_rate_limits (
      rate_key TEXT PRIMARY KEY,
      window_started_at INTEGER NOT NULL,
      request_count INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`),
  ]);
});

const request = (ip: string) => new Request("https://memboux.com/gallery/ABC123", {
  headers: { "CF-Connecting-IP": ip },
});

describe("D1 rate limiter", () => {
  it("enforces a fixed-window limit atomically", async () => {
    const options = { scope: "gallery-pin:ABC123", limit: 2, windowMs: 60_000, now: 120_000 };

    expect((await consumeRateLimit(env.DB, request("192.0.2.1"), "secret", options)).allowed).toBe(true);
    expect((await consumeRateLimit(env.DB, request("192.0.2.1"), "secret", options)).remaining).toBe(0);
    const blocked = await consumeRateLimit(env.DB, request("192.0.2.1"), "secret", options);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  it("separates clients and action scopes", async () => {
    const base = { limit: 1, windowMs: 60_000, now: 120_000 };
    await consumeRateLimit(env.DB, request("192.0.2.1"), "secret", { ...base, scope: "upload:ABC123" });

    expect((await consumeRateLimit(env.DB, request("192.0.2.2"), "secret", { ...base, scope: "upload:ABC123" })).allowed).toBe(true);
    expect((await consumeRateLimit(env.DB, request("192.0.2.1"), "secret", { ...base, scope: "report:ABC123" })).allowed).toBe(true);
  });

  it("resets the counter in a new time window", async () => {
    const first = { scope: "admin-login", limit: 1, windowMs: 60_000, now: 120_000 };
    await consumeRateLimit(env.DB, request("192.0.2.1"), "secret", first);
    expect((await consumeRateLimit(env.DB, request("192.0.2.1"), "secret", first)).allowed).toBe(false);

    const reset = await consumeRateLimit(env.DB, request("192.0.2.1"), "secret", { ...first, now: 180_000 });
    expect(reset.allowed).toBe(true);
    expect(reset.remaining).toBe(0);
  });

  it("stores only a keyed hash instead of the client IP", async () => {
    await consumeRateLimit(env.DB, request("203.0.113.24"), "private-secret", {
      scope: "upload:ABC123",
      limit: 1,
      windowMs: 60_000,
      now: 120_000,
    });
    const row = await env.DB.prepare("SELECT rate_key FROM request_rate_limits").first<{ rate_key: string }>();

    expect(row?.rate_key).toMatch(/^[a-f0-9]{64}$/);
    expect(row?.rate_key).not.toContain("203.0.113.24");
  });

  it("returns retry metadata and purges expired counters", async () => {
    const result = await consumeRateLimit(env.DB, request("192.0.2.1"), "secret", {
      scope: "report:ABC123",
      limit: 0,
      windowMs: 60_000,
      now: 120_000,
    });
    const response = tooManyRequests(result);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(response.headers.get("cache-control")).toBe("private, no-store");

    await purgeExpiredRateLimits(env.DB, 180_000);
    expect((await env.DB.prepare("SELECT COUNT(*) total FROM request_rate_limits").first<{ total: number }>())?.total).toBe(0);
  });
});
