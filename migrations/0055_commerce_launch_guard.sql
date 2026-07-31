CREATE TABLE IF NOT EXISTS commerce_launch_settings (
  id TEXT PRIMARY KEY CHECK (id = 'global'),
  payments_enabled INTEGER NOT NULL DEFAULT 0 CHECK (payments_enabled IN (0,1)),
  legal_entity_ready INTEGER NOT NULL DEFAULT 0 CHECK (legal_entity_ready IN (0,1)),
  tax_registration_ready INTEGER NOT NULL DEFAULT 0 CHECK (tax_registration_ready IN (0,1)),
  invoicing_ready INTEGER NOT NULL DEFAULT 0 CHECK (invoicing_ready IN (0,1)),
  refund_policy_ready INTEGER NOT NULL DEFAULT 0 CHECK (refund_policy_ready IN (0,1)),
  sales_terms_ready INTEGER NOT NULL DEFAULT 0 CHECK (sales_terms_ready IN (0,1)),
  stripe_account_ready INTEGER NOT NULL DEFAULT 0 CHECK (stripe_account_ready IN (0,1)),
  updated_at INTEGER NOT NULL,
  updated_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL
);

INSERT OR IGNORE INTO commerce_launch_settings (
  id,payments_enabled,legal_entity_ready,tax_registration_ready,invoicing_ready,
  refund_policy_ready,sales_terms_ready,stripe_account_ready,updated_at
) VALUES ('global',0,0,0,0,0,0,0,unixepoch()*1000);

CREATE TRIGGER IF NOT EXISTS commerce_orders_block_payment_insert
BEFORE INSERT ON commerce_orders
WHEN NEW.status = 'awaiting_payment'
  AND COALESCE((
    SELECT payments_enabled
      AND legal_entity_ready
      AND tax_registration_ready
      AND invoicing_ready
      AND refund_policy_ready
      AND sales_terms_ready
      AND stripe_account_ready
    FROM commerce_launch_settings WHERE id='global'
  ), 0) != 1
BEGIN
  SELECT RAISE(ABORT, 'commerce_launch_not_ready');
END;

CREATE TRIGGER IF NOT EXISTS commerce_orders_block_payment_transition
BEFORE UPDATE OF status ON commerce_orders
WHEN OLD.status != 'awaiting_payment'
  AND NEW.status = 'awaiting_payment'
  AND COALESCE((
    SELECT payments_enabled
      AND legal_entity_ready
      AND tax_registration_ready
      AND invoicing_ready
      AND refund_policy_ready
      AND sales_terms_ready
      AND stripe_account_ready
    FROM commerce_launch_settings WHERE id='global'
  ), 0) != 1
BEGIN
  SELECT RAISE(ABORT, 'commerce_launch_not_ready');
END;
