import type { Locale } from "./i18n";

export type CommerceProduct = {
  product_key: string;
  scope: "event" | "account";
  billing_model: "one_time" | "subscription";
  name_en: string;
  name_el: string;
  name_fr: string;
  name_de: string;
  name_es: string;
  name_it: string;
  description_en: string;
  description_el: string;
  description_fr: string;
  description_de: string;
  description_es: string;
  description_it: string;
  amount_minor: number;
  currency: string;
  media_limit: number | null;
  event_duration_days: number | null;
  guest_access_enabled: 0 | 1;
  original_downloads_enabled: 0 | 1;
  active: 0 | 1;
  checkout_enabled: 0 | 1;
  sort_order: number;
};

export type CommerceOrder = {
  id: string;
  user_id: string;
  event_id: string | null;
  status: "draft" | "awaiting_payment" | "paid" | "cancelled" | "expired" | "refunded";
  currency: string;
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  billing_provider: "none" | "stripe" | "manual";
  provider_checkout_id: string | null;
  provider_payment_id: string | null;
  paid_at: number | null;
  expires_at: number | null;
  created_at: number;
  updated_at: number;
};

export type CommerceLaunchSettings = {
  payments_enabled: 0 | 1;
  legal_entity_ready: 0 | 1;
  tax_registration_ready: 0 | 1;
  invoicing_ready: 0 | 1;
  refund_policy_ready: 0 | 1;
  sales_terms_ready: 0 | 1;
  stripe_account_ready: 0 | 1;
  updated_at: number;
};

export const commerceLaunchChecks = [
  ["legal_entity_ready", "Legal entity"],
  ["tax_registration_ready", "Tax registration"],
  ["invoicing_ready", "Invoicing"],
  ["refund_policy_ready", "Refund policy"],
  ["sales_terms_ready", "Sales terms"],
  ["stripe_account_ready", "Stripe account"],
] as const;

export async function getCommerceLaunchSettings(
  db: D1Database,
): Promise<CommerceLaunchSettings> {
  const row = await db.prepare(
    `SELECT payments_enabled,legal_entity_ready,tax_registration_ready,
            invoicing_ready,refund_policy_ready,sales_terms_ready,
            stripe_account_ready,updated_at
     FROM commerce_launch_settings WHERE id='global'`,
  ).first<CommerceLaunchSettings>();
  return row ?? {
    payments_enabled: 0,
    legal_entity_ready: 0,
    tax_registration_ready: 0,
    invoicing_ready: 0,
    refund_policy_ready: 0,
    sales_terms_ready: 0,
    stripe_account_ready: 0,
    updated_at: 0,
  };
}

export function commerceLaunchReady(settings: CommerceLaunchSettings) {
  return Boolean(
    settings.payments_enabled &&
      commerceLaunchChecks.every(([key]) => settings[key] === 1),
  );
}

export function commerceProductName(product: CommerceProduct, locale: Locale) {
  const value = product[`name_${locale}` as keyof CommerceProduct];
  return typeof value === "string" && value.trim() ? value : product.name_en;
}

export function commerceProductDescription(product: CommerceProduct, locale: Locale) {
  const value = product[`description_${locale}` as keyof CommerceProduct];
  return typeof value === "string" && value.trim()
    ? value
    : product.description_en;
}

export function formatCommerceMoney(amountMinor: number, currency: string, locale: Locale) {
  const numberLocales: Record<Locale, string> = {
    en: "en-GB",
    el: "el-GR",
    fr: "fr-FR",
    de: "de-DE",
    es: "es-ES",
    it: "it-IT",
  };
  return new Intl.NumberFormat(numberLocales[locale], {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

export async function eventProducts(db: D1Database) {
  const rows = await db.prepare(
    "SELECT * FROM commerce_products WHERE scope='event' AND active=1 ORDER BY sort_order,amount_minor",
  ).all<CommerceProduct>();
  return rows.results;
}

export async function saveDraftEventOrder(
  db: D1Database,
  input: { userId: string; eventId: string; product: CommerceProduct; locale: Locale; now?: number },
) {
  const now = input.now ?? Date.now();
  const existing = await db.prepare(
    "SELECT id FROM commerce_orders WHERE user_id=? AND event_id=? AND status='draft'",
  ).bind(input.userId, input.eventId).first<{ id: string }>();
  const orderId = existing?.id ?? crypto.randomUUID();
  const itemId = crypto.randomUUID();
  const productName = commerceProductName(input.product, input.locale);
  const entitlementSnapshot = JSON.stringify({
    mediaLimit: input.product.media_limit,
    eventDurationDays: input.product.event_duration_days,
    guestAccessEnabled: Boolean(input.product.guest_access_enabled),
    guestUploadsEnabled: Boolean(input.product.guest_access_enabled),
    originalDownloadsEnabled: Boolean(input.product.original_downloads_enabled),
  });
  await db.batch([
    db.prepare(`INSERT INTO commerce_orders
      (id,user_id,event_id,status,currency,subtotal_minor,tax_minor,total_minor,billing_provider,created_at,updated_at)
      VALUES (?,?,?,'draft',?,?,0,?,'none',?,?)
      ON CONFLICT(id) DO UPDATE SET currency=excluded.currency,subtotal_minor=excluded.subtotal_minor,
        tax_minor=0,total_minor=excluded.total_minor,billing_provider='none',updated_at=excluded.updated_at`)
      .bind(orderId, input.userId, input.eventId, input.product.currency, input.product.amount_minor, input.product.amount_minor, now, now),
    db.prepare("DELETE FROM commerce_order_items WHERE order_id=?").bind(orderId),
    db.prepare(`INSERT INTO commerce_order_items
      (id,order_id,product_key,product_name,billing_model,unit_amount_minor,quantity,line_total_minor,currency,entitlement_snapshot,created_at)
      VALUES (?,?,?,?,?,?,1,?,?,?,?)`)
      .bind(itemId, orderId, input.product.product_key, productName, input.product.billing_model,
        input.product.amount_minor, input.product.amount_minor, input.product.currency, entitlementSnapshot, now),
  ]);
  return orderId;
}

type EventEntitlementSnapshot = {
  mediaLimit: number | null;
  eventDurationDays: number | null;
  guestAccessEnabled: boolean;
  guestUploadsEnabled?: boolean;
  originalDownloadsEnabled: boolean;
};

export type FulfillEventOrderResult =
  | { fulfilled: true; alreadyPaid: boolean; eventId: string; expiresAt: number | null }
  | { fulfilled: false; reason: "not_found" | "not_payable" | "invalid_entitlement" };

function validEntitlement(value: unknown): value is EventEntitlementSnapshot {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<EventEntitlementSnapshot>;
  return (
    (item.mediaLimit === null ||
      (Number.isInteger(item.mediaLimit) &&
        Number(item.mediaLimit) >= 0 &&
        Number(item.mediaLimit) <= 2_147_483_647)) &&
    (item.eventDurationDays === null ||
      (Number.isInteger(item.eventDurationDays) &&
        Number(item.eventDurationDays) >= 1 &&
        Number(item.eventDurationDays) <= 3_650)) &&
    typeof item.guestAccessEnabled === "boolean" &&
    (item.guestUploadsEnabled === undefined ||
      typeof item.guestUploadsEnabled === "boolean") &&
    typeof item.originalDownloadsEnabled === "boolean"
  );
}

export type ComplimentaryEventActivationResult =
  | { activated: true; eventId: string; mediaLimit: number; expiresAt: number | null }
  | { activated: false; reason: "not_found" | "not_eligible" | "invalid_entitlement" };

export async function activateComplimentaryEventOrder(
  db: D1Database,
  input: { orderId: string; userId: string; eventId: string; activatedAt?: number },
): Promise<ComplimentaryEventActivationResult> {
  const order = await db.prepare(
    `SELECT o.id,o.event_id,o.user_id,o.status,i.product_key,i.quantity,i.entitlement_snapshot
     FROM commerce_orders o
     JOIN commerce_order_items i ON i.order_id=o.id
     WHERE o.id=? AND o.event_id=? AND o.user_id=?`,
  ).bind(input.orderId, input.eventId, input.userId).first<{
    id: string;
    event_id: string;
    user_id: string;
    status: CommerceOrder["status"];
    product_key: string;
    quantity: number;
    entitlement_snapshot: string;
  }>();
  if (!order) return { activated: false, reason: "not_found" };
  if (order.status !== "draft" || order.quantity !== 1)
    return { activated: false, reason: "not_eligible" };

  let entitlement: unknown;
  try {
    entitlement = JSON.parse(order.entitlement_snapshot);
  } catch {
    return { activated: false, reason: "invalid_entitlement" };
  }
  if (!validEntitlement(entitlement))
    return { activated: false, reason: "invalid_entitlement" };

  const existingActivation = await db.prepare(
    `SELECT granted_media_limit,granted_expires_at
     FROM complimentary_event_activations
     WHERE event_id=? AND order_id=? AND entitlement_snapshot=?
       AND activation_reason='beta_self_service'`,
  ).bind(input.eventId, order.id, order.entitlement_snapshot).first<{
    granted_media_limit: number;
    granted_expires_at: number | null;
  }>();
  if (existingActivation) {
    return {
      activated: true,
      eventId: input.eventId,
      mediaLimit: existingActivation.granted_media_limit,
      expiresAt: existingActivation.granted_expires_at,
    };
  }

  const current = await db.prepare(
    `SELECT access_state,media_limit,guest_access_enabled,guest_uploads_enabled,
            original_downloads_enabled,expires_at
     FROM event_access WHERE event_id=?`,
  ).bind(input.eventId).first<{
    access_state: string;
    media_limit: number;
    guest_access_enabled: number;
    guest_uploads_enabled: number;
    original_downloads_enabled: number;
    expires_at: number | null;
  }>();
  const now = input.activatedAt ?? Date.now();
  const selectedLimit = entitlement.mediaLimit ?? 2_147_483_647;
  const mediaLimit = Math.max(current?.media_limit ?? 0, selectedLimit);
  const selectedExpiresAt = entitlement.eventDurationDays === null
    ? null
    : now + entitlement.eventDurationDays * 86_400_000;
  const expiresAt = current?.access_state === "unlocked" && current.expires_at === null
    ? null
    : selectedExpiresAt === null
      ? null
      : Math.max(current?.expires_at ?? 0, selectedExpiresAt);
  const guestAccess = Number(Boolean(
    current?.guest_access_enabled || entitlement.guestAccessEnabled,
  ));
  const guestUploads = Number(Boolean(
    current?.guest_uploads_enabled ||
      (entitlement.guestUploadsEnabled ?? entitlement.guestAccessEnabled),
  ));
  const originals = Number(Boolean(
    current?.original_downloads_enabled || entitlement.originalDownloadsEnabled,
  ));

  await db.batch([
    db.prepare(
      `INSERT INTO event_access (
         event_id,access_state,enforcement_state,media_limit,
         guest_access_enabled,guest_uploads_enabled,original_downloads_enabled,
         trial_started_at,trial_ends_at,unlocked_at,expires_at,created_at,updated_at
       ) VALUES (?,'unlocked','enforced',?,?,?,?,NULL,NULL,?,?,?,?)
       ON CONFLICT(event_id) DO UPDATE SET
         access_state='unlocked',enforcement_state='enforced',
         media_limit=excluded.media_limit,
         guest_access_enabled=excluded.guest_access_enabled,
         guest_uploads_enabled=excluded.guest_uploads_enabled,
         original_downloads_enabled=excluded.original_downloads_enabled,
         unlocked_at=COALESCE(event_access.unlocked_at,excluded.unlocked_at),
         expires_at=excluded.expires_at,updated_at=excluded.updated_at`,
    ).bind(
      input.eventId,
      mediaLimit,
      guestAccess,
      guestUploads,
      originals,
      now,
      expiresAt,
      now,
      now,
    ),
    db.prepare(
      `INSERT OR IGNORE INTO complimentary_event_activations
       (id,event_id,order_id,product_key,activated_by_user_id,entitlement_snapshot,
        granted_media_limit,granted_expires_at,activation_reason,created_at)
       VALUES (?,?,?,?,?,?,?,?,'beta_self_service',?)`,
    ).bind(
      crypto.randomUUID(),
      input.eventId,
      order.id,
      order.product_key,
      input.userId,
      order.entitlement_snapshot,
      mediaLimit,
      expiresAt,
      now,
    ),
  ]);
  return { activated: true, eventId: input.eventId, mediaLimit, expiresAt };
}

export async function fulfillEventOrder(
  db: D1Database,
  input: {
    orderId: string;
    provider: "stripe" | "manual";
    providerPaymentId: string;
    providerCheckoutId?: string | null;
    paidAt?: number;
  },
): Promise<FulfillEventOrderResult> {
  const order = await db.prepare(
    `SELECT o.id,o.event_id,o.status,o.billing_provider,o.provider_payment_id,
            i.quantity,i.entitlement_snapshot
     FROM commerce_orders o
     JOIN commerce_order_items i ON i.order_id=o.id
     WHERE o.id=?`,
  ).bind(input.orderId).first<{
    id: string;
    event_id: string | null;
    status: CommerceOrder["status"];
    billing_provider: CommerceOrder["billing_provider"];
    provider_payment_id: string | null;
    quantity: number;
    entitlement_snapshot: string;
  }>();
  if (!order?.event_id) return { fulfilled: false, reason: "not_found" };
  if (order.status === "paid") {
    if (
      order.billing_provider !== input.provider ||
      order.provider_payment_id !== input.providerPaymentId
    ) {
      return { fulfilled: false, reason: "not_payable" };
    }
    const access = await db.prepare(
      "SELECT expires_at FROM event_access WHERE event_id=?",
    ).bind(order.event_id).first<{ expires_at: number | null }>();
    return {
      fulfilled: true,
      alreadyPaid: true,
      eventId: order.event_id,
      expiresAt: access?.expires_at ?? null,
    };
  }
  if (order.status !== "awaiting_payment" || order.quantity !== 1) {
    return { fulfilled: false, reason: "not_payable" };
  }
  let entitlement: unknown;
  try {
    entitlement = JSON.parse(order.entitlement_snapshot);
  } catch {
    return { fulfilled: false, reason: "invalid_entitlement" };
  }
  if (!validEntitlement(entitlement)) {
    return { fulfilled: false, reason: "invalid_entitlement" };
  }
  const now = input.paidAt ?? Date.now();
  const expiresAt = entitlement.eventDurationDays === null
    ? null
    : now + entitlement.eventDurationDays * 86_400_000;
  const mediaLimit = entitlement.mediaLimit ?? 2_147_483_647;
  const guestAccess = entitlement.guestAccessEnabled ? 1 : 0;
  const guestUploads =
    (entitlement.guestUploadsEnabled ?? entitlement.guestAccessEnabled) ? 1 : 0;
  const originals = entitlement.originalDownloadsEnabled ? 1 : 0;
  await db.batch([
    db.prepare(
      `UPDATE commerce_orders
       SET status='paid',billing_provider=?,provider_checkout_id=?,
           provider_payment_id=?,paid_at=?,expires_at=?,updated_at=?
       WHERE id=? AND status='awaiting_payment'`,
    ).bind(
      input.provider,
      input.providerCheckoutId ?? null,
      input.providerPaymentId,
      now,
      expiresAt,
      now,
      order.id,
    ),
    db.prepare(
      `INSERT INTO event_access (
         event_id,access_state,enforcement_state,media_limit,
         guest_access_enabled,guest_uploads_enabled,original_downloads_enabled,
         trial_started_at,trial_ends_at,unlocked_at,expires_at,created_at,updated_at
       ) VALUES (?,'unlocked','enforced',?,?,?,?,NULL,NULL,?,?,?,?)
       ON CONFLICT(event_id) DO UPDATE SET
         access_state='unlocked',enforcement_state='enforced',
         media_limit=excluded.media_limit,
         guest_access_enabled=excluded.guest_access_enabled,
         guest_uploads_enabled=excluded.guest_uploads_enabled,
         original_downloads_enabled=excluded.original_downloads_enabled,
         unlocked_at=excluded.unlocked_at,expires_at=excluded.expires_at,
         updated_at=excluded.updated_at`,
    ).bind(
      order.event_id,
      mediaLimit,
      guestAccess,
      guestUploads,
      originals,
      now,
      expiresAt,
      now,
      now,
    ),
  ]);
  return {
    fulfilled: true,
    alreadyPaid: false,
    eventId: order.event_id,
    expiresAt,
  };
}
