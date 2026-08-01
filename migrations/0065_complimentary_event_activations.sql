CREATE TABLE IF NOT EXISTS complimentary_event_activations (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL REFERENCES commerce_orders(id) ON DELETE RESTRICT,
  product_key TEXT NOT NULL REFERENCES commerce_products(product_key) ON DELETE RESTRICT,
  activated_by_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  entitlement_snapshot TEXT NOT NULL,
  granted_media_limit INTEGER NOT NULL CHECK (granted_media_limit >= 0),
  granted_expires_at INTEGER,
  activation_reason TEXT NOT NULL DEFAULT 'beta_self_service'
    CHECK (activation_reason IN ('beta_self_service','admin_complimentary')),
  created_at INTEGER NOT NULL,
  UNIQUE (event_id,order_id,entitlement_snapshot,activation_reason)
);

CREATE INDEX IF NOT EXISTS idx_complimentary_event_activations_event
ON complimentary_event_activations(event_id,created_at DESC);
