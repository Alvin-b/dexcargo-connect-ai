-- Idempotency: prevent duplicate M-Pesa receipts being processed twice
CREATE UNIQUE INDEX IF NOT EXISTS payments_mpesa_receipt_unique
  ON public.payments (mpesa_receipt)
  WHERE mpesa_receipt IS NOT NULL;

-- Fast lookup for callback handler
CREATE INDEX IF NOT EXISTS payments_checkout_request_id_idx
  ON public.payments (checkout_request_id);

-- Push token lookups by user (for fan-out sends)
CREATE INDEX IF NOT EXISTS push_tokens_user_id_idx
  ON public.push_tokens (user_id);

-- Prevent duplicate (user, token) rows
CREATE UNIQUE INDEX IF NOT EXISTS push_tokens_user_token_unique
  ON public.push_tokens (user_id, token);