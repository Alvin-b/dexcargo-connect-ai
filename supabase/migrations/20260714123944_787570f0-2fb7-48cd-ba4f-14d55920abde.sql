
-- Mobile app releases
CREATE TABLE IF NOT EXISTS public.mobile_app_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL CHECK (platform IN ('android','ios')),
  channel text NOT NULL DEFAULT 'stable',
  version_name text NOT NULL,
  version_code integer NOT NULL,
  release_notes text,
  download_url text NOT NULL,
  checksum_sha256 text,
  mandatory boolean NOT NULL DEFAULT false,
  min_supported_version_code integer NOT NULL DEFAULT 1,
  published boolean NOT NULL DEFAULT true,
  published_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, channel, version_code)
);
CREATE INDEX IF NOT EXISTS idx_mobile_releases_lookup
  ON public.mobile_app_releases(platform, channel, published, version_code DESC);

GRANT SELECT ON public.mobile_app_releases TO anon, authenticated;
GRANT INSERT, UPDATE ON public.mobile_app_releases TO authenticated;
GRANT ALL ON public.mobile_app_releases TO service_role;

ALTER TABLE public.mobile_app_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "releases_public_read_published"
  ON public.mobile_app_releases FOR SELECT
  USING (published = true);

CREATE POLICY "releases_admin_read_all"
  ON public.mobile_app_releases FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "releases_admin_insert"
  ON public.mobile_app_releases FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "releases_admin_update"
  ON public.mobile_app_releases FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_mobile_releases_updated
  BEFORE UPDATE ON public.mobile_app_releases
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Payment notifications
CREATE TYPE public.payment_evidence_type AS ENUM ('image','text');
CREATE TYPE public.payment_notification_status AS ENUM ('pending','linked');

CREATE SEQUENCE IF NOT EXISTS public.payment_notification_seq;

CREATE TABLE public.payment_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_number text NOT NULL UNIQUE,
  evidence_type public.payment_evidence_type NOT NULL,
  image_url text,
  text_content text,
  note text,
  reported_amount numeric(14,2),
  reported_currency text DEFAULT 'KES',
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  status public.payment_notification_status NOT NULL DEFAULT 'pending',
  linked_at timestamptz,
  linked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (evidence_type = 'image' AND image_url IS NOT NULL)
    OR (evidence_type = 'text' AND text_content IS NOT NULL)
  )
);
CREATE INDEX idx_paynotif_status ON public.payment_notifications(status, uploaded_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.payment_notifications TO authenticated;
GRANT ALL ON public.payment_notifications TO service_role;

ALTER TABLE public.payment_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "paynotif_staff_read"
  ON public.payment_notifications FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "paynotif_admin_insert"
  ON public.payment_notifications FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') AND uploaded_by = auth.uid());

CREATE POLICY "paynotif_staff_update_status"
  ON public.payment_notifications FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE TRIGGER trg_paynotif_updated
  BEFORE UPDATE ON public.payment_notifications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.assign_payment_notification_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.notification_number IS NULL OR NEW.notification_number = '' THEN
    NEW.notification_number := 'PN-' || to_char(now(),'YYYYMMDD') || '-' ||
      lpad(nextval('public.payment_notification_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_paynotif_number
  BEFORE INSERT ON public.payment_notifications
  FOR EACH ROW EXECUTE FUNCTION public.assign_payment_notification_number();

-- Allocations
CREATE TABLE public.payment_notification_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_notification_id uuid NOT NULL REFERENCES public.payment_notifications(id) ON DELETE RESTRICT,
  package_id uuid NOT NULL REFERENCES public.packages(id) ON DELETE RESTRICT,
  tracking_number text NOT NULL,
  allocated_amount numeric(14,2),
  allocated_currency text DEFAULT 'KES',
  notes text,
  linked_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  linked_by_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_notification_id, package_id)
);
CREATE INDEX idx_paynotif_alloc_pkg ON public.payment_notification_allocations(package_id);
CREATE INDEX idx_paynotif_alloc_notif ON public.payment_notification_allocations(payment_notification_id);

GRANT SELECT, INSERT ON public.payment_notification_allocations TO authenticated;
GRANT ALL ON public.payment_notification_allocations TO service_role;

ALTER TABLE public.payment_notification_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "paynotif_alloc_staff_read"
  ON public.payment_notification_allocations FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "paynotif_alloc_staff_insert"
  ON public.payment_notification_allocations FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND linked_by = auth.uid());
