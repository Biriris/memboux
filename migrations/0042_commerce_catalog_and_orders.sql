CREATE TABLE IF NOT EXISTS commerce_products (
  product_key TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('event','account')),
  billing_model TEXT NOT NULL CHECK (billing_model IN ('one_time','subscription')),
  name_en TEXT NOT NULL,
  name_el TEXT NOT NULL,
  description_en TEXT NOT NULL,
  description_el TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'EUR' CHECK (length(currency)=3),
  media_limit INTEGER,
  event_duration_days INTEGER,
  guest_access_enabled INTEGER NOT NULL DEFAULT 1 CHECK (guest_access_enabled IN (0,1)),
  original_downloads_enabled INTEGER NOT NULL DEFAULT 1 CHECK (original_downloads_enabled IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  checkout_enabled INTEGER NOT NULL DEFAULT 0 CHECK (checkout_enabled IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS commerce_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  event_id TEXT REFERENCES events(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('draft','awaiting_payment','paid','cancelled','expired','refunded')),
  currency TEXT NOT NULL CHECK (length(currency)=3),
  subtotal_minor INTEGER NOT NULL CHECK (subtotal_minor >= 0),
  tax_minor INTEGER NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
  billing_provider TEXT NOT NULL DEFAULT 'none' CHECK (billing_provider IN ('none','stripe','manual')),
  provider_checkout_id TEXT,
  provider_payment_id TEXT,
  paid_at INTEGER,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS commerce_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,
  product_key TEXT NOT NULL REFERENCES commerce_products(product_key) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  billing_model TEXT NOT NULL CHECK (billing_model IN ('one_time','subscription')),
  unit_amount_minor INTEGER NOT NULL CHECK (unit_amount_minor >= 0),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  line_total_minor INTEGER NOT NULL CHECK (line_total_minor >= 0),
  currency TEXT NOT NULL CHECK (length(currency)=3),
  entitlement_snapshot TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_commerce_one_draft_per_event
ON commerce_orders(user_id,event_id)
WHERE status='draft';

CREATE INDEX IF NOT EXISTS idx_commerce_orders_user
ON commerce_orders(user_id,created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_commerce_provider_checkout
ON commerce_orders(billing_provider,provider_checkout_id)
WHERE provider_checkout_id IS NOT NULL;

INSERT OR IGNORE INTO commerce_products (
  product_key,scope,billing_model,name_en,name_el,description_en,description_el,
  amount_minor,currency,media_limit,event_duration_days,guest_access_enabled,
  original_downloads_enabled,active,checkout_enabled,sort_order,created_at,updated_at
) VALUES
('event_pass','event','one_time','Event Pass','Event Pass',
 'Unlock one event for guests, uploads and original downloads.',
 'Ξεκλείδωσε ένα event για καλεσμένους, uploads και λήψεις πρωτοτύπων.',
 1900,'EUR',500,365,1,1,1,0,10,unixepoch()*1000,unixepoch()*1000),
('event_plus','event','one_time','Event Plus','Event Plus',
 'Extended event capacity for larger celebrations and professional delivery.',
 'Μεγαλύτερη χωρητικότητα για μεγάλες εκδηλώσεις και επαγγελματική παράδοση.',
 3900,'EUR',2000,730,1,1,1,0,20,unixepoch()*1000,unixepoch()*1000);
