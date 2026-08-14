import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { activateComplimentaryEventOrder, fulfillEventOrder } from "../src/commerce";

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DROP TABLE IF EXISTS commerce_order_items"),
    env.DB.prepare("DROP TABLE IF EXISTS commerce_orders"),
    env.DB.prepare("DROP TABLE IF EXISTS complimentary_event_activations"),
    env.DB.prepare("DROP TABLE IF EXISTS event_access"),
    env.DB.prepare(`CREATE TABLE commerce_orders (
      id TEXT PRIMARY KEY,user_id TEXT,event_id TEXT,status TEXT,billing_provider TEXT,
      provider_checkout_id TEXT,provider_payment_id TEXT,paid_at INTEGER,
      expires_at INTEGER,updated_at INTEGER
    )`),
    env.DB.prepare(`CREATE UNIQUE INDEX idx_test_provider_payment
      ON commerce_orders(billing_provider,provider_payment_id)
      WHERE provider_payment_id IS NOT NULL`),
    env.DB.prepare(`CREATE TABLE commerce_order_items (
      id TEXT PRIMARY KEY,order_id TEXT,product_key TEXT,quantity INTEGER,entitlement_snapshot TEXT
    )`),
    env.DB.prepare(`CREATE TABLE event_access (
      event_id TEXT PRIMARY KEY,access_state TEXT,enforcement_state TEXT,
      plan_key TEXT,
      media_limit INTEGER,album_limit INTEGER,guest_access_enabled INTEGER,guest_uploads_enabled INTEGER,
      original_downloads_enabled INTEGER,
      upload_window_days INTEGER,upload_window_started_at INTEGER,upload_window_ends_at INTEGER,
      premium_activated_at INTEGER,
      unlocked_at INTEGER,expires_at INTEGER,created_at INTEGER,updated_at INTEGER,
      media_uploads_consumed INTEGER NOT NULL DEFAULT 0
    )`),
    env.DB.prepare(`CREATE TABLE complimentary_event_activations (
      id TEXT PRIMARY KEY,event_id TEXT,order_id TEXT,product_key TEXT,
      activated_by_user_id TEXT,entitlement_snapshot TEXT,granted_media_limit INTEGER,
      granted_expires_at INTEGER,activation_reason TEXT,created_at INTEGER,
      UNIQUE(event_id,order_id,entitlement_snapshot,activation_reason)
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
      `INSERT INTO commerce_orders
       (id,user_id,event_id,status,billing_provider,provider_checkout_id,
        provider_payment_id,paid_at,expires_at,updated_at)
       VALUES (?,'user-1',?,?,'none',NULL,NULL,NULL,NULL,?)`,
    ).bind(id, `event-${id}`, options.status ?? "awaiting_payment", 1),
    env.DB.prepare("INSERT INTO commerce_order_items VALUES (?,?,'event_plus',1,?)").bind(
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

describe("complimentary beta event activation", () => {
  it("upgrades an active Free event immediately", async () => {
    const orderId = await seedOrder({ status: "draft" });
    await env.DB.prepare(
      `INSERT INTO event_access
       (event_id,access_state,enforcement_state,plan_key,media_limit,guest_access_enabled,
        guest_uploads_enabled,original_downloads_enabled,
        unlocked_at,expires_at,created_at,updated_at)
       VALUES ('event-order-1','free','enforced','event_free',50,1,1,1,NULL,NULL,100,100)`,
    ).run();

    const result = await activateComplimentaryEventOrder(env.DB, {
      orderId,
      userId: "user-1",
      eventId: "event-order-1",
      activatedAt: 150,
    });

    expect(result.activated).toBe(true);
    expect(await env.DB.prepare(
      "SELECT access_state,media_limit,original_downloads_enabled,unlocked_at FROM event_access WHERE event_id='event-order-1'",
    ).first()).toEqual({
      access_state: "unlocked",
      media_limit: 500,
      original_downloads_enabled: 1,
      unlocked_at: 150,
    });
  });

  it("unlocks the selected draft without recording a payment and writes an audit record", async () => {
    const orderId = await seedOrder({ status: "draft" });
    const activatedAt = Date.UTC(2026, 7, 1);

    const result = await activateComplimentaryEventOrder(env.DB, {
      orderId,
      userId: "user-1",
      eventId: "event-order-1",
      activatedAt,
    });

    expect(result).toEqual({
      activated: true,
      eventId: "event-order-1",
      mediaLimit: 500,
      expiresAt: activatedAt + 365 * 86_400_000,
    });
    expect(await env.DB.prepare(
      `SELECT access_state,media_limit,guest_access_enabled,guest_uploads_enabled,
              original_downloads_enabled,media_uploads_consumed
       FROM event_access WHERE event_id='event-order-1'`,
    ).first()).toEqual({
      access_state: "unlocked",
      media_limit: 500,
      guest_access_enabled: 1,
      guest_uploads_enabled: 1,
      original_downloads_enabled: 1,
      media_uploads_consumed: 0,
    });
    expect(await env.DB.prepare(
      `SELECT order_id,product_key,activated_by_user_id,granted_media_limit,
              activation_reason FROM complimentary_event_activations`,
    ).first()).toEqual({
      order_id: orderId,
      product_key: "event_plus",
      activated_by_user_id: "user-1",
      granted_media_limit: 500,
      activation_reason: "beta_self_service",
    });
    expect(await env.DB.prepare(
      "SELECT status,billing_provider,provider_payment_id,paid_at FROM commerce_orders WHERE id=?",
    ).bind(orderId).first()).toEqual({
      status: "draft",
      billing_provider: "none",
      provider_payment_id: null,
      paid_at: null,
    });
  });

  it("never lowers an existing unlocked entitlement and is audit-idempotent", async () => {
    const orderId = await seedOrder({ status: "draft" });
    await env.DB.prepare(
      `INSERT INTO event_access
       (event_id,access_state,enforcement_state,plan_key,media_limit,guest_access_enabled,
        guest_uploads_enabled,original_downloads_enabled,unlocked_at,expires_at,created_at,updated_at)
       VALUES ('event-order-1','unlocked','enforced','event_plus',2000,1,1,1,1,NULL,1,1)`,
    ).run();
    const input = { orderId, userId: "user-1", eventId: "event-order-1", activatedAt: 10_000 };

    await activateComplimentaryEventOrder(env.DB, input);
    await activateComplimentaryEventOrder(env.DB, { ...input, activatedAt: 20_000 });

    expect(await env.DB.prepare(
      "SELECT media_limit,expires_at FROM event_access WHERE event_id='event-order-1'",
    ).first()).toEqual({ media_limit: 2000, expires_at: null });
    expect(await env.DB.prepare(
      "SELECT COUNT(*) total FROM complimentary_event_activations",
    ).first()).toEqual({ total: 1 });
  });

  it("rejects another user's draft and malformed entitlements", async () => {
    const draft = await seedOrder({ id: "draft", status: "draft" });
    const malformed = await seedOrder({ id: "bad", status: "draft", snapshot: "{}" });

    await expect(activateComplimentaryEventOrder(env.DB, {
      orderId: draft,
      userId: "user-2",
      eventId: "event-draft",
    })).resolves.toEqual({ activated: false, reason: "not_found" });
    await expect(activateComplimentaryEventOrder(env.DB, {
      orderId: malformed,
      userId: "user-1",
      eventId: "event-bad",
    })).resolves.toEqual({ activated: false, reason: "invalid_entitlement" });
  });
});
