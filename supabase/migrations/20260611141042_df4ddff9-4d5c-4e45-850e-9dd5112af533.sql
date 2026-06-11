
-- countries
CREATE TABLE public.countries (
  code text PRIMARY KEY,                 -- ISO-2, e.g. CN, KE
  name text NOT NULL,
  currency text NOT NULL DEFAULT 'KES',
  phone_prefix text,
  role text NOT NULL DEFAULT 'destination', -- 'origin' | 'destination' | 'both'
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.countries TO authenticated;
GRANT ALL ON public.countries TO service_role;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read countries" ON public.countries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage countries" ON public.countries
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE TRIGGER t_countries_upd BEFORE UPDATE ON public.countries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- warehouses
CREATE TABLE public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,             -- e.g. CN-GZ-01, KE-NBO-01
  country_code text NOT NULL REFERENCES public.countries(code) ON DELETE RESTRICT,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'destination', -- 'origin' | 'destination'
  city text,
  address text,
  contact_name text,
  contact_phone text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.warehouses TO authenticated;
GRANT ALL ON public.warehouses TO service_role;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read warehouses" ON public.warehouses
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage warehouses" ON public.warehouses
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE INDEX idx_warehouses_country ON public.warehouses(country_code);
CREATE TRIGGER t_warehouses_upd BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- seed
INSERT INTO public.countries (code, name, currency, phone_prefix, role) VALUES
  ('CN', 'China', 'CNY', '+86', 'origin'),
  ('KE', 'Kenya', 'KES', '+254', 'destination')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.warehouses (code, country_code, name, role, city) VALUES
  ('CN-GZ-01', 'CN', 'Guangzhou Consolidation', 'origin', 'Guangzhou'),
  ('KE-NBO-01', 'KE', 'Nairobi Distribution', 'destination', 'Nairobi')
ON CONFLICT (code) DO NOTHING;
