
-- ============ CLEAN UP OLD CHINA-ERA SURFACE ============
DROP TABLE IF EXISTS public.batch_packages CASCADE;
DROP TABLE IF EXISTS public.loading_batches CASCADE;
DROP TABLE IF EXISTS public.rates CASCADE;
DROP TABLE IF EXISTS public.countries CASCADE;

-- ============ ENUMS ============
DO $$ BEGIN CREATE TYPE public.pkg_status AS ENUM
  ('received','verified','awaiting_payment','paid','ready_for_collection','collected','cleared','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.pay_method AS ENUM ('mpesa_stk','mpesa_manual','cash','bank');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.pay_status AS ENUM ('pending','paid','failed','refunded','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.commission_trigger AS ENUM ('received','payment','delivery');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.commission_status AS ENUM ('pending','approved','paid','void');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.package_image_kind AS ENUM ('sticker','extra','proof_of_collection','qr');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ CUSTOMERS ============
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  whatsapp_number TEXT, national_id TEXT, email TEXT,
  default_address TEXT, city TEXT, notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY customers_staff_all ON public.customers FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE INDEX IF NOT EXISTS customers_phone_idx ON public.customers(phone);
CREATE INDEX IF NOT EXISTS customers_name_trgm ON public.customers USING gin (full_name gin_trgm_ops);

-- ============ DROP OLD DEPENDENTS then PACKAGES ============
DROP TABLE IF EXISTS public.package_events CASCADE;
DROP TABLE IF EXISTS public.package_status_history CASCADE;
DROP TABLE IF EXISTS public.package_images CASCADE;
DROP TABLE IF EXISTS public.deliveries CASCADE;
DROP TABLE IF EXISTS public.commissions CASCADE;
DROP TABLE IF EXISTS public.commission_rules CASCADE;
DROP TABLE IF EXISTS public.whatsapp_logs CASCADE;
DROP TABLE IF EXISTS public.warehouse_bins CASCADE;
DROP TABLE IF EXISTS public.warehouse_shelves CASCADE;
DROP TABLE IF EXISTS public.packages CASCADE;

CREATE TABLE public.packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_number TEXT NOT NULL UNIQUE,
  external_barcode TEXT,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  supplier TEXT, description TEXT, category TEXT,
  weight_kg NUMERIC(10,3),
  length_cm NUMERIC(8,2), width_cm NUMERIC(8,2), height_cm NUMERIC(8,2),
  courier TEXT, destination_city TEXT, special_notes TEXT,
  status public.pkg_status NOT NULL DEFAULT 'received',
  amount_due NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'KES',
  qr_code_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  barcode TEXT,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  shelf_id UUID,
  bin_code TEXT,
  intake_photo_url TEXT,
  ocr_payload JSONB,
  ocr_confidence NUMERIC(5,2),
  received_by_employee_id UUID REFERENCES public.employees(id),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ, ready_at TIMESTAMPTZ, collected_at TIMESTAMPTZ, cleared_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.packages TO authenticated;
GRANT ALL ON public.packages TO service_role;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY packages_staff_all ON public.packages FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE INDEX packages_status_idx ON public.packages(status);
CREATE INDEX packages_customer_idx ON public.packages(customer_id);
CREATE INDEX packages_received_at_idx ON public.packages(received_at DESC);
CREATE INDEX packages_tracking_trgm ON public.packages USING gin (tracking_number gin_trgm_ops);

-- ============ WAREHOUSE SHELVES / BINS ============
CREATE TABLE public.warehouse_shelves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  code TEXT NOT NULL, section TEXT, capacity INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(warehouse_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_shelves TO authenticated;
GRANT ALL ON public.warehouse_shelves TO service_role;
ALTER TABLE public.warehouse_shelves ENABLE ROW LEVEL SECURITY;
CREATE POLICY shelves_staff_read ON public.warehouse_shelves FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY shelves_admin_write ON public.warehouse_shelves FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.warehouse_bins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shelf_id UUID NOT NULL REFERENCES public.warehouse_shelves(id) ON DELETE CASCADE,
  code TEXT NOT NULL, is_occupied BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(shelf_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_bins TO authenticated;
GRANT ALL ON public.warehouse_bins TO service_role;
ALTER TABLE public.warehouse_bins ENABLE ROW LEVEL SECURITY;
CREATE POLICY bins_staff_read ON public.warehouse_bins FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY bins_admin_write ON public.warehouse_bins FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

ALTER TABLE public.packages ADD CONSTRAINT packages_shelf_fk FOREIGN KEY (shelf_id) REFERENCES public.warehouse_shelves(id) ON DELETE SET NULL;

-- ============ PACKAGE IMAGES ============
CREATE TABLE public.package_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  kind public.package_image_kind NOT NULL DEFAULT 'extra',
  url TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.package_images TO authenticated;
GRANT ALL ON public.package_images TO service_role;
ALTER TABLE public.package_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY package_images_staff_all ON public.package_images FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ============ STATUS HISTORY ============
CREATE TABLE public.package_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  from_status public.pkg_status,
  to_status public.pkg_status NOT NULL,
  notes TEXT,
  changed_by_employee_id UUID REFERENCES public.employees(id),
  changed_by_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.package_status_history TO authenticated;
GRANT ALL ON public.package_status_history TO service_role;
ALTER TABLE public.package_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY psh_staff_read ON public.package_status_history FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY psh_staff_insert ON public.package_status_history FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

-- ============ DELIVERIES ============
CREATE TABLE public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL UNIQUE REFERENCES public.packages(id) ON DELETE CASCADE,
  collected_by_name TEXT NOT NULL,
  collected_by_id_number TEXT,
  collected_by_phone TEXT,
  relationship_to_customer TEXT,
  signature_url TEXT,
  proof_photo_url TEXT,
  released_by_employee_id UUID REFERENCES public.employees(id),
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deliveries TO authenticated;
GRANT ALL ON public.deliveries TO service_role;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY deliveries_staff_all ON public.deliveries FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ============ COMMISSIONS ============
CREATE TABLE public.commission_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_role TEXT,
  scope_employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  trigger public.commission_trigger NOT NULL,
  percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  flat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_rules TO authenticated;
GRANT ALL ON public.commission_rules TO service_role;
ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY cr_staff_read ON public.commission_rules FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY cr_admin_write ON public.commission_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  package_id UUID REFERENCES public.packages(id) ON DELETE SET NULL,
  payment_id UUID,
  trigger public.commission_trigger NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  percentage NUMERIC(5,2),
  base_amount NUMERIC(12,2),
  status public.commission_status NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commissions TO authenticated;
GRANT ALL ON public.commissions TO service_role;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY commissions_staff_read ON public.commissions FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY commissions_admin_write ON public.commissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ WHATSAPP LOGS ============
CREATE TABLE public.whatsapp_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  package_id UUID REFERENCES public.packages(id) ON DELETE SET NULL,
  template TEXT NOT NULL,
  payload JSONB,
  status TEXT NOT NULL DEFAULT 'sent',
  provider_message_id TEXT,
  error TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.whatsapp_logs TO authenticated;
GRANT ALL ON public.whatsapp_logs TO service_role;
ALTER TABLE public.whatsapp_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY wa_staff_read ON public.whatsapp_logs FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY wa_staff_insert ON public.whatsapp_logs FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

-- ============ SETTINGS ============
CREATE TABLE IF NOT EXISTS public.settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY settings_staff_read ON public.settings FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY settings_admin_write ON public.settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ PAYMENTS reshape ============
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id);

-- ============ HELPER FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.is_valid_pkg_transition(_from public.pkg_status, _to public.pkg_status)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT (_from, _to) IN (
    ('received','verified'),('received','cancelled'),
    ('verified','awaiting_payment'),('verified','ready_for_collection'),('verified','cancelled'),
    ('awaiting_payment','paid'),('awaiting_payment','cancelled'),
    ('paid','ready_for_collection'),
    ('ready_for_collection','collected'),('ready_for_collection','awaiting_payment'),
    ('collected','cleared')
  ) OR _from = _to
$$;

CREATE OR REPLACE FUNCTION public.transition_package_status(
  _package_id UUID, _to public.pkg_status, _employee_id UUID, _notes TEXT DEFAULT NULL
) RETURNS public.packages
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_from public.pkg_status; v_pkg public.packages;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT status INTO v_from FROM public.packages WHERE id = _package_id FOR UPDATE;
  IF v_from IS NULL THEN RAISE EXCEPTION 'package not found'; END IF;
  IF NOT public.is_valid_pkg_transition(v_from, _to) THEN
    RAISE EXCEPTION 'invalid transition % -> %', v_from, _to;
  END IF;
  UPDATE public.packages SET
    status = _to,
    verified_at = CASE WHEN _to='verified' THEN now() ELSE verified_at END,
    ready_at = CASE WHEN _to='ready_for_collection' THEN now() ELSE ready_at END,
    collected_at = CASE WHEN _to='collected' THEN now() ELSE collected_at END,
    cleared_at = CASE WHEN _to='cleared' THEN now() ELSE cleared_at END,
    updated_at = now()
  WHERE id = _package_id RETURNING * INTO v_pkg;
  INSERT INTO public.package_status_history(package_id, from_status, to_status, notes, changed_by_employee_id, changed_by_user_id)
  VALUES (_package_id, v_from, _to, _notes, _employee_id, auth.uid());
  RETURN v_pkg;
END $$;
REVOKE EXECUTE ON FUNCTION public.transition_package_status(UUID, public.pkg_status, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_package_status(UUID, public.pkg_status, UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.award_commission(
  _package_id UUID, _employee_id UUID, _trigger public.commission_trigger,
  _base NUMERIC DEFAULT 0, _payment_id UUID DEFAULT NULL
) RETURNS public.commissions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rule public.commission_rules; v_amount NUMERIC := 0; v_row public.commissions; v_role TEXT;
BEGIN
  IF _employee_id IS NULL THEN RETURN NULL; END IF;
  SELECT role::text INTO v_role FROM public.employees WHERE id = _employee_id;
  SELECT * INTO v_rule FROM public.commission_rules
    WHERE trigger = _trigger AND active = true
      AND (scope_employee_id = _employee_id OR (scope_employee_id IS NULL AND (scope_role IS NULL OR scope_role = v_role)))
    ORDER BY (scope_employee_id IS NOT NULL) DESC, (scope_role IS NOT NULL) DESC LIMIT 1;
  IF v_rule.id IS NULL THEN RETURN NULL; END IF;
  v_amount := COALESCE(v_rule.flat_amount,0) + (COALESCE(_base,0) * COALESCE(v_rule.percentage,0) / 100.0);
  IF v_amount <= 0 THEN RETURN NULL; END IF;
  INSERT INTO public.commissions(employee_id, package_id, payment_id, trigger, amount, percentage, base_amount)
  VALUES (_employee_id, _package_id, _payment_id, _trigger, v_amount, v_rule.percentage, _base)
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;
REVOKE EXECUTE ON FUNCTION public.award_commission(UUID,UUID,public.commission_trigger,NUMERIC,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_commission(UUID,UUID,public.commission_trigger,NUMERIC,UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.on_package_created() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.package_status_history(package_id, from_status, to_status, notes, changed_by_employee_id, changed_by_user_id)
  VALUES (NEW.id, NULL, NEW.status, 'package created', NEW.received_by_employee_id, auth.uid());
  PERFORM public.award_commission(NEW.id, NEW.received_by_employee_id, 'received', 0, NULL);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_on_package_created ON public.packages;
CREATE TRIGGER trg_on_package_created AFTER INSERT ON public.packages
  FOR EACH ROW EXECUTE FUNCTION public.on_package_created();

DROP TRIGGER IF EXISTS trg_customers_updated ON public.customers;
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_packages_updated ON public.packages;
CREATE TRIGGER trg_packages_updated BEFORE UPDATE ON public.packages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_commrules_updated ON public.commission_rules;
CREATE TRIGGER trg_commrules_updated BEFORE UPDATE ON public.commission_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- default rules
INSERT INTO public.commission_rules(scope_role, trigger, percentage, flat_amount, active)
SELECT 'kenya_staff','received',0,0,true WHERE NOT EXISTS (SELECT 1 FROM public.commission_rules WHERE trigger='received' AND scope_role='kenya_staff');
INSERT INTO public.commission_rules(scope_role, trigger, percentage, flat_amount, active)
SELECT 'kenya_staff','payment',0,0,true WHERE NOT EXISTS (SELECT 1 FROM public.commission_rules WHERE trigger='payment' AND scope_role='kenya_staff');
INSERT INTO public.commission_rules(scope_role, trigger, percentage, flat_amount, active)
SELECT 'kenya_staff','delivery',0,0,true WHERE NOT EXISTS (SELECT 1 FROM public.commission_rules WHERE trigger='delivery' AND scope_role='kenya_staff');
