
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS sender_name text,
  ADD COLUMN IF NOT EXISTS sender_phone text;

CREATE INDEX IF NOT EXISTS idx_packages_sender_phone ON public.packages (sender_phone);
CREATE INDEX IF NOT EXISTS idx_packages_tracking_number ON public.packages (tracking_number);
CREATE INDEX IF NOT EXISTS idx_packages_sender_name_trgm ON public.packages USING gin (lower(sender_name) gin_trgm_ops);
