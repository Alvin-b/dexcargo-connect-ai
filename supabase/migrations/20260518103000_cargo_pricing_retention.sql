ALTER TYPE public.shipping_mode ADD VALUE IF NOT EXISTS 'special';

ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS cargo_type text NOT NULL DEFAULT 'general'
    CHECK (cargo_type IN ('general', 'special')),
  ADD COLUMN IF NOT EXISTS special_cargo_type text
    CHECK (special_cargo_type IS NULL OR special_cargo_type IN ('battery', 'phone', 'drone', 'chemical', 'perfume', 'liquid', 'magnet', 'other')),
  ADD COLUMN IF NOT EXISTS billing_unit text
    CHECK (billing_unit IS NULL OR billing_unit IN ('kg', 'cbm')),
  ADD COLUMN IF NOT EXISTS billable_quantity numeric(12,3),
  ADD COLUMN IF NOT EXISTS rate_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS total_charge numeric(12,2),
  ADD COLUMN IF NOT EXISTS pickup_retention_until timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_status text NOT NULL DEFAULT 'active'
    CHECK (archive_status IN ('active', 'archived', 'deleted'));

ALTER TABLE public.rates
  ADD COLUMN IF NOT EXISTS cargo_type text NOT NULL DEFAULT 'general'
    CHECK (cargo_type IN ('general', 'special')),
  ADD COLUMN IF NOT EXISTS special_cargo_type text
    CHECK (special_cargo_type IS NULL OR special_cargo_type IN ('battery', 'phone', 'drone', 'chemical', 'perfume', 'liquid', 'magnet', 'other')),
  ADD COLUMN IF NOT EXISTS billing_unit text
    CHECK (billing_unit IS NULL OR billing_unit IN ('kg', 'cbm')),
  ADD COLUMN IF NOT EXISTS special_handling_fee numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'package_clearance'
    CHECK (purpose IN ('package_clearance', 'deposit', 'adjustment')),
  ADD COLUMN IF NOT EXISTS initiated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

ALTER TABLE public.delivery_signatures
  ADD COLUMN IF NOT EXISTS retention_until timestamptz NOT NULL DEFAULT (now() + interval '7 months'),
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS signature_path text,
  ADD COLUMN IF NOT EXISTS signature_mime_type text,
  ADD COLUMN IF NOT EXISTS archive_status text NOT NULL DEFAULT 'active'
    CHECK (archive_status IN ('active', 'archived', 'deleted'));

CREATE INDEX IF NOT EXISTS idx_packages_cargo_type
  ON public.packages(cargo_type, special_cargo_type);

CREATE INDEX IF NOT EXISTS idx_packages_archive_status
  ON public.packages(archive_status, pickup_retention_until);

CREATE INDEX IF NOT EXISTS idx_delivery_signatures_retention
  ON public.delivery_signatures(archive_status, retention_until);

CREATE OR REPLACE FUNCTION public.archive_expired_delivery_records()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.delivery_signatures
  SET archive_status = 'archived',
      archived_at = now()
  WHERE archive_status = 'active'
    AND retention_until <= now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.packages
  SET archive_status = 'archived',
      archived_at = now()
  WHERE archive_status = 'active'
    AND pickup_retention_until IS NOT NULL
    AND pickup_retention_until <= now();

  RETURN v_count;
END $$;
