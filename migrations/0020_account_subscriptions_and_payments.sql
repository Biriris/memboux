CREATE TABLE IF NOT EXISTS account_subscriptions (
  user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  plan_key TEXT NOT NULL CHECK (plan_key IN ('beta','pro','studio','custom')),
  status TEXT NOT NULL CHECK (status IN ('none','trialing','active','past_due','canceled','complimentary')),
  billing_provider TEXT NOT NULL CHECK (billing_provider IN ('none','manual','stripe')),
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('none','month','year','one_time')),
  amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (amount_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'EUR' CHECK (length(currency) = 3),
  external_customer_id TEXT,
  external_subscription_id TEXT,
  started_at INTEGER,
  current_period_end INTEGER,
  canceled_at INTEGER,
  last_payment_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS account_payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('manual','stripe')),
  status TEXT NOT NULL CHECK (status IN ('paid','refunded','failed')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'EUR' CHECK (length(currency) = 3),
  provider_payment_id TEXT,
  note TEXT,
  paid_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_account_subscriptions_status
ON account_subscriptions(status, plan_key);

CREATE INDEX IF NOT EXISTS idx_account_payments_user_paid
ON account_payments(user_id, paid_at DESC, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_payments_provider_id
ON account_payments(provider, provider_payment_id)
WHERE provider_payment_id IS NOT NULL;
