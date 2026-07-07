
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='package_status' AND e.enumlabel='awaiting_payment') THEN
    ALTER TYPE package_status ADD VALUE 'awaiting_payment';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='package_status' AND e.enumlabel='paid') THEN
    ALTER TYPE package_status ADD VALUE 'paid';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='package_status' AND e.enumlabel='ready_for_collection') THEN
    ALTER TYPE package_status ADD VALUE 'ready_for_collection';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='package_status' AND e.enumlabel='released') THEN
    ALTER TYPE package_status ADD VALUE 'released';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='package_status' AND e.enumlabel='cleared') THEN
    ALTER TYPE package_status ADD VALUE 'cleared';
  END IF;
END $$;

CREATE SEQUENCE IF NOT EXISTS public.employee_code_seq START 1;

CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role app_role NOT NULL DEFAULT 'staff',
  branch_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deactivated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
GRANT USAGE ON SEQUENCE public.employee_code_seq TO authenticated, service_role;

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff can read employees" ON public.employees;
CREATE POLICY "staff can read employees"
  ON public.employees FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "self can read own employee row" ON public.employees;
CREATE POLICY "self can read own employee row"
  ON public.employees FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "admins manage employees" ON public.employees;
CREATE POLICY "admins manage employees"
  ON public.employees FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP TRIGGER IF EXISTS trg_employees_updated_at ON public.employees;
CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.assign_employee_code()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.employee_code IS NULL OR NEW.employee_code = '' THEN
    NEW.employee_code := 'DEX-' || lpad(nextval('public.employee_code_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_employees_assign_code ON public.employees;
CREATE TRIGGER trg_employees_assign_code
  BEFORE INSERT ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.assign_employee_code();

-- Backfill: one employees row per staff user (highest-priority role)
INSERT INTO public.employees (user_id, full_name, email, phone, role, status)
SELECT
  u.id,
  COALESCE(p.display_name, u.email, 'Unnamed'),
  COALESCE(u.email, ''),
  p.phone,
  (SELECT ur.role
     FROM public.user_roles ur
    WHERE ur.user_id = u.id
      AND ur.role IN ('admin','staff','kenya_staff','china_staff')
    ORDER BY CASE ur.role
      WHEN 'admin' THEN 1
      WHEN 'kenya_staff' THEN 2
      WHEN 'china_staff' THEN 3
      WHEN 'staff' THEN 4
      ELSE 5 END
    LIMIT 1),
  CASE WHEN COALESCE(p.is_active, true) THEN 'active' ELSE 'suspended' END
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = u.id
    AND ur.role IN ('admin','staff','kenya_staff','china_staff')
)
AND NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.user_id = u.id);

ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS intake_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS ocr_payload JSONB,
  ADD COLUMN IF NOT EXISTS ocr_confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS received_by_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS released_by_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recipient_name TEXT,
  ADD COLUMN IF NOT EXISTS recipient_id_number TEXT,
  ADD COLUMN IF NOT EXISTS recipient_phone TEXT,
  ADD COLUMN IF NOT EXISTS mpesa_code TEXT,
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_packages_mpesa_code ON public.packages(mpesa_code) WHERE mpesa_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_packages_status_v2 ON public.packages(status);
CREATE INDEX IF NOT EXISTS idx_packages_received_by ON public.packages(received_by_employee_id);
CREATE INDEX IF NOT EXISTS idx_packages_released_by ON public.packages(released_by_employee_id);

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS method TEXT CHECK (method IN ('mpesa','cash','bank','other')),
  ADD COLUMN IF NOT EXISTS mpesa_code TEXT,
  ADD COLUMN IF NOT EXISTS recorded_by_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_payments_mpesa_code ON public.payments(mpesa_code) WHERE mpesa_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.admin_register_employee(
  _user_id UUID,
  _full_name TEXT,
  _email TEXT,
  _phone TEXT,
  _role app_role,
  _branch_id UUID DEFAULT NULL,
  _notes TEXT DEFAULT NULL
) RETURNS public.employees
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_row public.employees;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'only admins can register employees';
  END IF;

  INSERT INTO public.user_roles(user_id, role)
  VALUES (_user_id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.employees (user_id, full_name, email, phone, role, branch_id, notes, created_by)
  VALUES (_user_id, _full_name, _email, _phone, _role, _branch_id, _notes, auth.uid())
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.admin_register_employee(UUID,TEXT,TEXT,TEXT,app_role,UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_register_employee(UUID,TEXT,TEXT,TEXT,app_role,UUID,TEXT) TO authenticated, service_role;
