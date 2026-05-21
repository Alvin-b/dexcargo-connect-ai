CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'system_settings'
      AND policyname = 'staff read system settings'
  ) THEN
    CREATE POLICY "staff read system settings"
      ON public.system_settings
      FOR SELECT
      TO authenticated
      USING (public.is_staff(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'system_settings'
      AND policyname = 'admins manage system settings'
  ) THEN
    CREATE POLICY "admins manage system settings"
      ON public.system_settings
      FOR ALL
      TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END $$;

DROP TRIGGER IF EXISTS t_system_settings_upd ON public.system_settings;
CREATE TRIGGER t_system_settings_upd
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.system_settings (key, value)
VALUES
  ('company_profile', jsonb_build_object(
    'company_name', 'DEX Cargo',
    'support_phone', '0725 053202',
    'support_whatsapp', '254725053202',
    'email', '',
    'address', 'Kivi Milimani Apartments, Nairobi',
    'hours', 'Open daily, closes 5 pm',
    'website', ''
  )),
  ('operations', jsonb_build_object(
    'default_origin', 'China',
    'default_destination', 'Kenya',
    'loading_day', 'Friday',
    'default_currency', 'KES',
    'left_behind_alerts', true
  )),
  ('pickup_policy', jsonb_build_object(
    'retention_months', 7,
    'keep_customer_history', true,
    'require_signature', true,
    'allow_cash_payment', true,
    'allow_mpesa_payment', true
  ))
ON CONFLICT (key) DO NOTHING;
