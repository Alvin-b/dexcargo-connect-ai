
-- 1. Enum extension
ALTER TYPE shipping_mode ADD VALUE IF NOT EXISTS 'special';

-- 2. Packages: missing columns
ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS cargo_type text DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS special_cargo_type text,
  ADD COLUMN IF NOT EXISTS billing_unit text,
  ADD COLUMN IF NOT EXISTS billable_quantity numeric(10,4),
  ADD COLUMN IF NOT EXISTS total_charge numeric(12,2),
  ADD COLUMN IF NOT EXISTS rate_amount numeric(12,2);

-- 3. Rates: missing columns
ALTER TABLE public.rates
  ADD COLUMN IF NOT EXISTS cargo_type text DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS special_cargo_type text,
  ADD COLUMN IF NOT EXISTS billing_unit text;

-- 4. Payments: purpose column
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS purpose text DEFAULT 'package_clearance';

-- 5. Clients: consent + first_seen
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS consent_data_retention boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz DEFAULT now();

-- 6. Audit logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  resource_type text,
  resource_id text,
  metadata jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff view audit logs" ON public.audit_logs;
CREATE POLICY "staff view audit logs" ON public.audit_logs
  FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);

-- 7. Push tokens
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ios','android','web')),
  device_label text,
  last_used_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users manage own tokens" ON public.push_tokens;
CREATE POLICY "users manage own tokens" ON public.push_tokens
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "staff view tokens" ON public.push_tokens;
CREATE POLICY "staff view tokens" ON public.push_tokens
  FOR SELECT TO authenticated USING (is_staff(auth.uid()));

-- 8. Archive function: clears heavy/PII data from old records, keeps the rows
CREATE OR REPLACE FUNCTION public.archive_expired_delivery_records()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_signatures int := 0;
  v_callbacks int := 0;
BEGIN
  -- Purge raw M-Pesa callbacks older than 90 days
  UPDATE public.payments
     SET raw_callback = NULL
   WHERE raw_callback IS NOT NULL
     AND created_at < now() - INTERVAL '90 days';
  GET DIAGNOSTICS v_callbacks = ROW_COUNT;

  -- Purge signature image URLs older than 12 months (row retained for history)
  UPDATE public.delivery_signatures
     SET signature_url = ''
   WHERE signature_url <> ''
     AND created_at < now() - INTERVAL '12 months';
  GET DIAGNOSTICS v_signatures = ROW_COUNT;

  RETURN v_signatures + v_callbacks;
END;
$$;

-- 9. Indexes for hot paths
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_packages_payment_status ON public.packages(payment_status);
CREATE INDEX IF NOT EXISTS idx_packages_status ON public.packages(status);
CREATE INDEX IF NOT EXISTS idx_notifications_audience ON public.notifications(audience, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON public.conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_package_events_pkg ON public.package_events(package_id, created_at DESC);

-- 10. Realtime publication: add the tables clients/staff want live
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='package_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.package_events;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='payments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
  END IF;
END $$;
