import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  processResendWebhook,
  verifyResendWebhook,
} from "../src/resend-webhooks";

const rawSecret = new TextEncoder().encode("memboux-webhook-test-secret");
const secret = `whsec_${btoa(String.fromCharCode(...rawSecret))}`;

async function signature(payload: string, id: string, timestamp: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    rawSecret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${id}.${timestamp}.${payload}`),
    ),
  );
  return `v1,${btoa(String.fromCharCode(...bytes))}`;
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DROP TABLE IF EXISTS resend_webhook_events"),
    env.DB.prepare("DROP TABLE IF EXISTS email_delivery_attempts"),
    env.DB.prepare("DROP TABLE IF EXISTS support_messages"),
    env.DB.prepare("DROP TABLE IF EXISTS support_conversations"),
    env.DB.prepare(`CREATE TABLE resend_webhook_events (
      svix_id TEXT PRIMARY KEY,event_type TEXT NOT NULL,provider_message_id TEXT NOT NULL,
      event_created_at INTEGER NOT NULL,received_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE email_delivery_attempts (
      id TEXT PRIMARY KEY,provider_message_id TEXT,delivery_outcome TEXT,delivery_event_at INTEGER
    )`),
    env.DB.prepare(`CREATE TABLE support_messages (
      id TEXT PRIMARY KEY,email_provider_message_id TEXT,email_delivery_status TEXT,
      email_delivery_outcome TEXT,email_delivery_event_at INTEGER
    )`),
    env.DB.prepare(`CREATE TABLE support_conversations (
      id TEXT PRIMARY KEY,notification_provider_message_id TEXT,
      notification_delivery_status TEXT,notification_delivery_outcome TEXT,
      notification_delivery_event_at INTEGER,notification_last_error TEXT
    )`),
    env.DB.prepare(
      "INSERT INTO email_delivery_attempts VALUES ('attempt','email-1','accepted',1)",
    ),
    env.DB.prepare(
      "INSERT INTO support_messages VALUES ('message','email-1','sent','accepted',1)",
    ),
    env.DB.prepare(
      "INSERT INTO support_conversations VALUES ('conversation','email-1','sent','accepted',1,NULL)",
    ),
  ]);
});

describe("Resend webhook security and delivery outcomes", () => {
  it("verifies the raw signed payload and rejects stale or altered requests", async () => {
    const payload = '{"type":"email.delivered"}';
    const id = "evt_123";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const validSignature = await signature(payload, id, timestamp);

    await expect(
      verifyResendWebhook({
        payload,
        svixId: id,
        svixTimestamp: timestamp,
        svixSignature: validSignature,
        secret,
      }),
    ).resolves.toBe(true);
    await expect(
      verifyResendWebhook({
        payload: `${payload} `,
        svixId: id,
        svixTimestamp: timestamp,
        svixSignature: validSignature,
        secret,
      }),
    ).resolves.toBe(false);
    await expect(
      verifyResendWebhook({
        payload,
        svixId: id,
        svixTimestamp: timestamp,
        svixSignature: validSignature,
        secret,
        now: Date.now() + 10 * 60_000,
      }),
    ).resolves.toBe(false);
  });

  it("updates the audit and helpdesk with a delivered outcome exactly once", async () => {
    const event = {
      type: "email.delivered",
      created_at: "2026-07-28T03:30:00.000Z",
      data: { email_id: "email-1" },
    };

    await expect(processResendWebhook(env, "evt_delivered", event)).resolves
      .toMatchObject({ processed: true, outcome: "delivered" });
    await expect(processResendWebhook(env, "evt_delivered", event)).resolves
      .toMatchObject({ processed: false, reason: "duplicate" });

    const message = await env.DB.prepare(
      "SELECT email_delivery_status,email_delivery_outcome FROM support_messages WHERE id='message'",
    ).first<{ email_delivery_status: string; email_delivery_outcome: string }>();
    expect(message).toEqual({
      email_delivery_status: "sent",
      email_delivery_outcome: "delivered",
    });
  });

  it("marks bounces as failed and keeps older out-of-order events from replacing them", async () => {
    await processResendWebhook(env, "evt_bounce", {
      type: "email.bounced",
      created_at: "2026-07-28T03:31:00.000Z",
      data: { email_id: "email-1" },
    });
    await processResendWebhook(env, "evt_old_delivered", {
      type: "email.delivered",
      created_at: "2026-07-28T03:30:00.000Z",
      data: { email_id: "email-1" },
    });

    const conversation = await env.DB.prepare(
      "SELECT notification_delivery_status,notification_delivery_outcome,notification_last_error FROM support_conversations WHERE id='conversation'",
    ).first<{
      notification_delivery_status: string;
      notification_delivery_outcome: string;
      notification_last_error: string;
    }>();
    expect(conversation).toEqual({
      notification_delivery_status: "failed",
      notification_delivery_outcome: "bounced",
      notification_last_error: "Resend reported email.bounced",
    });
  });
});
