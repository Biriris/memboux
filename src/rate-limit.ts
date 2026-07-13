import { sha256 } from "./utils";

export type RateLimitOptions = {
  scope: string;
  limit: number;
  windowMs: number;
  now?: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

type RateLimitRow = {
  request_count: number;
  expires_at: number;
};

const clientAddress = (request: Request) =>
  request.headers.get("CF-Connecting-IP")?.trim() || "unknown";

export async function consumeRateLimit(
  db: D1Database,
  request: Request,
  secret: string,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const now = options.now ?? Date.now();
  const windowStartedAt = Math.floor(now / options.windowMs) * options.windowMs;
  const expiresAt = windowStartedAt + options.windowMs;
  const rateKey = await sha256(`${secret}\0${options.scope}\0${clientAddress(request)}`);
  const row = await db.prepare(`
    INSERT INTO request_rate_limits (rate_key, window_started_at, request_count, expires_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(rate_key) DO UPDATE SET
      request_count = CASE
        WHEN request_rate_limits.window_started_at = excluded.window_started_at
          THEN request_rate_limits.request_count + 1
        ELSE 1
      END,
      window_started_at = excluded.window_started_at,
      expires_at = excluded.expires_at
    RETURNING request_count, expires_at
  `).bind(rateKey, windowStartedAt, expiresAt).first<RateLimitRow>();

  if (!row) throw new Error("Rate limiter did not return a counter");
  return {
    allowed: row.request_count <= options.limit,
    limit: options.limit,
    remaining: Math.max(0, options.limit - row.request_count),
    retryAfterSeconds: Math.max(1, Math.ceil((row.expires_at - now) / 1000)),
  };
}

export function tooManyRequests(result: RateLimitResult, message = "Too many requests. Please try again later.") {
  return new Response(message, {
    status: 429,
    headers: {
      "Cache-Control": "private, no-store",
      "Retry-After": String(result.retryAfterSeconds),
      "X-RateLimit-Limit": String(result.limit),
      "X-RateLimit-Remaining": String(result.remaining),
    },
  });
}

export async function purgeExpiredRateLimits(db: D1Database, now = Date.now()) {
  return db.prepare(`
    DELETE FROM request_rate_limits
    WHERE rate_key IN (
      SELECT rate_key FROM request_rate_limits
      WHERE expires_at <= ?
      LIMIT 500
    )
  `).bind(now).run();
}
