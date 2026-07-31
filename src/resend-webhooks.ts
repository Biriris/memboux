import type { Bindings } from "./domain";

export type EmailDeliveryOutcome =
  | "accepted"
  | "delivered"
  | "delayed"
  | "bounced"
  | "complained"
  | "failed";

type ResendEvent = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
  };
};

const eventOutcomes: Record<string, EmailDeliveryOutcome> = {
  "email.sent": "accepted",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
};

function decodeBase64(value: string) {
  const decoded = atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function sameBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export async function verifyResendWebhook(options: {
  payload: string;
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
  secret: string;
  now?: number;
}) {
  const timestamp = Number(options.svixTimestamp);
  const now = options.now ?? Date.now();
  if (
    !options.svixId ||
    !Number.isInteger(timestamp) ||
    Math.abs(now - timestamp * 1_000) > 5 * 60_000
  ) {
    return false;
  }
  const encodedSecret = options.secret.startsWith("whsec_")
    ? options.secret.slice(6)
    : options.secret;
  let secret: Uint8Array;
  try {
    secret = decodeBase64(encodedSecret);
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = `${options.svixId}.${options.svixTimestamp}.${options.payload}`;
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed)),
  );
  return options.svixSignature.split(/\s+/).some((candidate) => {
    const [version, signature] = candidate.split(",", 2);
    if (version !== "v1" || !signature) return false;
    try {
      return sameBytes(expected, decodeBase64(signature));
    } catch {
      return false;
    }
  });
}

export async function processResendWebhook(
  env: Pick<Bindings, "DB">,
  svixId: string,
  rawEvent: ResendEvent,
) {
  const outcome = rawEvent.type ? eventOutcomes[rawEvent.type] : undefined;
  const providerMessageId = rawEvent.data?.email_id?.trim();
  const eventAt = rawEvent.created_at
    ? Date.parse(rawEvent.created_at)
    : Number.NaN;
  if (!outcome || !providerMessageId || !Number.isFinite(eventAt)) {
    return { processed: false, reason: "ignored_event" } as const;
  }
  const stored = await env.DB.prepare(
    `INSERT OR IGNORE INTO resend_webhook_events
      (svix_id,event_type,provider_message_id,event_created_at,received_at)
     VALUES (?,?,?,?,?)`,
  )
    .bind(svixId, rawEvent.type, providerMessageId, eventAt, Date.now())
    .run();
  if (!stored.meta.changes) {
    return { processed: false, reason: "duplicate" } as const;
  }
  const failed = ["bounced", "complained", "failed"].includes(outcome);
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE email_delivery_attempts
       SET delivery_outcome=?,delivery_event_at=?
       WHERE provider_message_id=?
         AND (delivery_event_at IS NULL OR delivery_event_at<=?)`,
    ).bind(outcome, eventAt, providerMessageId, eventAt),
    env.DB.prepare(
      `UPDATE support_messages
       SET email_delivery_outcome=?,email_delivery_event_at=?,
           email_delivery_status=CASE WHEN ? THEN 'failed' ELSE 'sent' END
       WHERE email_provider_message_id=?
         AND (email_delivery_event_at IS NULL OR email_delivery_event_at<=?)`,
    ).bind(outcome, eventAt, failed ? 1 : 0, providerMessageId, eventAt),
    env.DB.prepare(
      `UPDATE support_conversations
       SET notification_delivery_outcome=?,notification_delivery_event_at=?,
           notification_delivery_status=CASE WHEN ? THEN 'failed' ELSE 'sent' END,
           notification_last_error=CASE WHEN ? THEN ? ELSE NULL END
       WHERE notification_provider_message_id=?
         AND (notification_delivery_event_at IS NULL OR notification_delivery_event_at<=?)`,
    ).bind(
      outcome,
      eventAt,
      failed ? 1 : 0,
      failed ? 1 : 0,
      failed ? `Resend reported email.${outcome}` : null,
      providerMessageId,
      eventAt,
    ),
  ]);
  return { processed: true, outcome } as const;
}

