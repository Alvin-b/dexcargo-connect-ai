
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'logistics_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales_rep';

ALTER TYPE public.pkg_status ADD VALUE IF NOT EXISTS 'registered';
ALTER TYPE public.pkg_status ADD VALUE IF NOT EXISTS 'arrived';
ALTER TYPE public.pkg_status ADD VALUE IF NOT EXISTS 'awaiting_pickup';
ALTER TYPE public.pkg_status ADD VALUE IF NOT EXISTS 'reserved';
ALTER TYPE public.pkg_status ADD VALUE IF NOT EXISTS 'picked_up';
ALTER TYPE public.pkg_status ADD VALUE IF NOT EXISTS 'returned';
ALTER TYPE public.pkg_status ADD VALUE IF NOT EXISTS 'lost';

ALTER TYPE public.package_image_kind ADD VALUE IF NOT EXISTS 'package';
ALTER TYPE public.package_image_kind ADD VALUE IF NOT EXISTS 'damage';
ALTER TYPE public.package_image_kind ADD VALUE IF NOT EXISTS 'pickup';
ALTER TYPE public.package_image_kind ADD VALUE IF NOT EXISTS 'delivery';
ALTER TYPE public.package_image_kind ADD VALUE IF NOT EXISTS 'signature';

DO $$ BEGIN
  CREATE TYPE public.cargo_type AS ENUM ('general', 'special');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
