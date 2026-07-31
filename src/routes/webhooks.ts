import { Hono } from "hono";
import type { Bindings } from "../domain";
import {
  processResendWebhook,
  verifyResendWebhook,
} from "../resend-webhooks";

export const webhookRoutes = new Hono<{ Bindings: Bindings }>();

webhookRoutes.post("/api/webhooks/resend", async (c) => {
  const secret = c.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) return c.text("Webhook is not configured", 503);
  const svixId = c.req.header("svix-id") ?? "";
  const svixTimestamp = c.req.header("svix-timestamp") ?? "";
  const svixSignature = c.req.header("svix-signature") ?? "";
  const payload = await c.req.text();
  const verified = await verifyResendWebhook({
    payload,
    svixId,
    svixTimestamp,
    svixSignature,
    secret,
  });
  if (!verified) return c.text("Invalid webhook signature", 400);
  let event: unknown;
  try {
    event = JSON.parse(payload) as unknown;
  } catch {
    return c.text("Invalid payload", 400);
  }
  if (!event || typeof event !== "object") return c.text("Invalid payload", 400);
  const result = await processResendWebhook(
    c.env,
    svixId,
    event as Parameters<typeof processResendWebhook>[2],
  );
  return c.json({ received: true, ...result });
});
