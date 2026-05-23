ALTER TYPE public.package_status ADD VALUE IF NOT EXISTS 'cleared';

CREATE INDEX IF NOT EXISTS idx_packages_clearance_queue
  ON public.packages(status, payment_status, arrived_at DESC);

