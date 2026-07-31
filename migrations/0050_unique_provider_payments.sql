CREATE UNIQUE INDEX IF NOT EXISTS idx_commerce_provider_payment
ON commerce_orders(billing_provider,provider_payment_id)
WHERE provider_payment_id IS NOT NULL;

