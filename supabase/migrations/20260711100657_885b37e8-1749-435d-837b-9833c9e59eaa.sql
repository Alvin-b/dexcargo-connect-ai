
ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS second_tracking_number TEXT,
  ADD COLUMN IF NOT EXISTS origin TEXT,
  ADD COLUMN IF NOT EXISTS route_code TEXT,
  ADD COLUMN IF NOT EXISTS chargeable_weight_kg NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS volume_m3 NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS pieces INT,
  ADD COLUMN IF NOT EXISTS nature_of_goods TEXT,
  ADD COLUMN IF NOT EXISTS payment_type TEXT,
  ADD COLUMN IF NOT EXISTS declared_value NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS declared_currency TEXT,
  ADD COLUMN IF NOT EXISTS shipping_method TEXT,
  ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS remark TEXT,
  ADD COLUMN IF NOT EXISTS cargo_type public.cargo_type,
  ADD COLUMN IF NOT EXISTS zone TEXT,
  ADD COLUMN IF NOT EXISTS rack TEXT,
  ADD COLUMN IF NOT EXISTS sales_rep_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sales_manager_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS packages_sales_rep_idx ON public.packages(sales_rep_employee_id);
CREATE INDEX IF NOT EXISTS packages_sales_manager_idx ON public.packages(sales_manager_employee_id);
CREATE INDEX IF NOT EXISTS packages_route_idx ON public.packages(route_code);
CREATE INDEX IF NOT EXISTS packages_second_tracking_idx ON public.packages(second_tracking_number);

CREATE OR REPLACE FUNCTION public.set_pkg_cargo_type()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.cargo_type IS NULL AND NEW.route_code IS NOT NULL THEN
    IF upper(NEW.route_code) LIKE 'HKG%' THEN NEW.cargo_type := 'special';
    ELSE NEW.cargo_type := 'general';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pkg_cargo_type ON public.packages;
CREATE TRIGGER trg_pkg_cargo_type BEFORE INSERT OR UPDATE OF route_code ON public.packages
FOR EACH ROW EXECUTE FUNCTION public.set_pkg_cargo_type();

ALTER TABLE public.package_images
  ADD COLUMN IF NOT EXISTS captured_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS gps_lat NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS gps_lng NUMERIC(10,7);

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('admin','staff','china_staff','kenya_staff','logistics_manager','sales_manager','sales_rep')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_valid_pkg_transition(_from pkg_status, _to pkg_status)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT (_from, _to) IN (
    ('received','verified'),('received','cancelled'),
    ('verified','awaiting_payment'),('verified','ready_for_collection'),('verified','cancelled'),
    ('awaiting_payment','paid'),('awaiting_payment','cancelled'),
    ('paid','ready_for_collection'),
    ('ready_for_collection','collected'),('ready_for_collection','awaiting_payment'),
    ('collected','cleared'),
    ('registered','arrived'),('registered','cancelled'),
    ('arrived','awaiting_pickup'),('arrived','reserved'),('arrived','cancelled'),
    ('reserved','awaiting_pickup'),('reserved','cancelled'),
    ('awaiting_pickup','awaiting_payment'),('awaiting_pickup','picked_up'),('awaiting_pickup','reserved'),
    ('awaiting_pickup','returned'),('awaiting_pickup','lost'),
    ('paid','picked_up'),
    ('picked_up','cleared'),
    ('received','registered'),('registered','received'),
    ('verified','arrived'),('arrived','verified'),
    ('ready_for_collection','awaiting_pickup'),('awaiting_pickup','ready_for_collection'),
    ('collected','picked_up'),('picked_up','collected')
  ) OR _from = _to
$$;
