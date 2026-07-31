import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { fulfillEventOrder } from "../src/commerce";

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DROP TABLE IF EXISTS commerce_order_items"),
    env.DB.prepare("DROP TABLE IF EXISTS commerce_orders"),
    env.DB.prepare("DROP TABLE IF EXISTS event_access"),
    env.DB.prepare(`CREATE TABLE commerce_orders (
      id TEXT PRIMARY KEY,event_id TEXT,status TEXT,billing_provider TEXT,
      provider_checkout_id TEXT,provider_payment_id TEXT,paid_at INTEGER,
      expires_at INTEGER,updated_at INTEGER
    )`),
    env.DB.prepare(`CREATE UNIQUE INDEX idx_test_provider_payment
      ON commerce_orders(billing_provider,provider_payment_id)
      WHERE provider_payment_id IS NOT NULL`),
    env.DB.prepare(`CREATE TABLE commerce_order_items (
      id TEXT PRIMARY KEY,order_id TEXT,quantity INTEGER,entitlement_snapshot TEXT
    )`),
    env.DB.prepare(`CREATE TABLE event_access (
      event_id TEXT PRIMARY KEY,access_state TEXT,enforcement_state TEXT,
      media_limit INTEGER,guest_access_enabled INTEGER,guest_uploads_enabled INTEGER,
      original_downloads_enabled INTEGER,trial_started_at INTEGER,trial_ends_at INTEGER,
      unlocked_at INTEGER,expires_at INTEGER,created_at INTEGER,updated_at INTEGER
    )`),
  ]);
});

async function seedOrder(options: {
  id?: string;
  status?: string;
  snapshot?: string;
} = {}) {
  const id = options.id ?? "order-1";
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO commerce_orders VALUES (?,?,?,'none',NULL,NULL,NULL,NULL,?)",
    ).bind(id, `event-${id}`, options.status ?? "awaiting_payment", 1),
    env.DB.prepare("INSERT INTO commerce_order_items VALUES (?,?,1,?)").bind(
      `item-${id}`,
      id,
      options.snapshot ??
        JSON.stringify({
          mediaLimit: 500,
          eventDurationDays: 365,
          guestAccessEnabled: true,
          guestUploadsEnabled: true,
          originalDownloadsEnabled: true,
        }),
    ),
  ]);
  return id;
}

describe("provider-neutral event order fulfillment", () => {
  it("applies the immutable entitlement snapshot to exactly the purchased event", async () => {
    const orderId = await seedOrder();
    const paidAt = Date.UTC(2026, 6, 28);
    const result = await fulfillEventOrder(env.DB, {
      orderId,
      provider: "stripe",
      providerCheckoutId: "cs_1",
      providerPaymentId: "pi_1",
      paidAt,
    });

    expect(result).toEqual({
      fulfilled: true,
      alreadyPaid: false,
      eventId: "event-order-1",
      expiresAt: paidAt + 365 * 86_400_000,
    });
    expect(
      await env.DB.prepare(
        `SELECT access_state,enforcement_state,media_limit,guest_access_enabled,
                guest_uploads_enabled,original_downloads_enabled,unlocked_at,expires_at
         FROM event_access WHERE event_id='event-order-1'`,
      ).first(),
    ).toEqual({
      access_state: "unlocked",
      enforcement_state: "enforced",
      media_limit: 500,
      guest_access_enabled: 1,
      guest_uploads_enabled: 1,
      original_downloads_enabled: 1,
      unlocked_at: paidAt,
      expires_at: paidAt + 365 * 86_400_000,
    });
  });

  it("is idempotent for a replay of the same confirmed payment", async () => {
    const orderId = await seedOrder();
    const input = {
      orderId,
      provider: "stripe" as const,
      providerCheckoutId: "cs_replay",
      providerPaymentId: "pi_replay",
      paidAt: 10_000,
    };
    await fulfillEventOrder(env.DB, input);
    const replay = await fulfillEventOrder(env.DB, {
      ...input,
      paidAt: 20_000,
    });

    expect(replay).toMatchObject({ fulfilled: true, alreadyPaid: true });
    expect(
      await env.DB.prepare(
        "SELECT paid_at FROM commerce_orders WHERE id=?",
      ).bind(orderId).first(),
    ).toEqual({ paid_at: 10_000 });
  });

  it("rejects a different payment reference after fulfillment", async () => {
    const orderId = await seedOrder();
    await fulfillEventOrder(env.DB, {
      orderId,
      provider: "stripe",
      providerPaymentId: "pi_original",
    });

    await expect(
      fulfillEventOrder(env.DB, {
        orderId,
        provider: "stripe",
        providerPaymentId: "pi_different",
      }),
    ).resolves.toEqual({ fulfilled: false, reason: "not_payable" });
  });

  it("never unlocks a draft order or a malformed entitlement snapshot", async () => {
    const draft = await seedOrder({ id: "draft", status: "draft" });
    const malformed = await seedOrder({
      id: "malformed",
      snapshot: JSON.stringify({
        mediaLimit: -1,
        eventDurationDays: 365,
        guestAccessEnabled: true,
        originalDownloadsEnabled: true,
      }),
    });

    await expect(
      fulfillEventOrder(env.DB, {
        orderId: draft,
        provider: "stripe",
        providerPaymentId: "pi_draft",
      }),
    ).resolves.toEqual({ fulfilled: false, reason: "not_payable" });
    await expect(
      fulfillEventOrder(env.DB, {
        orderId: malformed,
        provider: "stripe",
        providerPaymentId: "pi_bad",
      }),
    ).resolves.toEqual({ fulfilled: false, reason: "invalid_entitlement" });
    expect(
      await env.DB.prepare("SELECT COUNT(*) total FROM event_access").first(),
    ).toEqual({ total: 0 });
  });
});

