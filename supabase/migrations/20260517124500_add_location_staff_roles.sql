ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'china_staff';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'kenya_staff';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS staff_location text
    CHECK (staff_location IS NULL OR staff_location IN ('china', 'kenya', 'admin')),
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_profiles_staff_location
  ON public.profiles(staff_location);

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('admin', 'staff', 'china_staff', 'kenya_staff')
  )
$$;
