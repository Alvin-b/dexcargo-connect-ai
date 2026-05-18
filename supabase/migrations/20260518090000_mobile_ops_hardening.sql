ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS language_preference text NOT NULL DEFAULT 'en'
    CHECK (language_preference IN ('en', 'zh'));

ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS qr_payload jsonb,
  ADD COLUMN IF NOT EXISTS loaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS arrived_at timestamptz,
  ADD COLUMN IF NOT EXISTS cleared_at timestamptz,
  ADD COLUMN IF NOT EXISTS current_location text,
  ADD COLUMN IF NOT EXISTS loading_batch_id uuid REFERENCES public.loading_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'failed', 'cancelled')),
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS released_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_packages_received_status
  ON public.packages(status, received_at);

CREATE INDEX IF NOT EXISTS idx_packages_loading_batch
  ON public.packages(loading_batch_id);

CREATE INDEX IF NOT EXISTS idx_packages_payment_status
  ON public.packages(payment_status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'delivery_signatures_package_id_fkey'
  ) THEN
    ALTER TABLE public.delivery_signatures
      ADD CONSTRAINT delivery_signatures_package_id_fkey
      FOREIGN KEY (package_id) REFERENCES public.packages(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'delivery_signatures_payment_id_fkey'
  ) THEN
    ALTER TABLE public.delivery_signatures
      ADD CONSTRAINT delivery_signatures_payment_id_fkey
      FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE SET NULL;
  END IF;
END $$;
