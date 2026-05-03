-- Loading batches (Friday-style FIFO sessions)
CREATE TABLE public.loading_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code text UNIQUE NOT NULL,
  origin_warehouse text NOT NULL DEFAULT 'china',
  destination_warehouse text NOT NULL DEFAULT 'kenya',
  loading_date date NOT NULL,
  cutoff_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active', -- active | closed | cancelled
  expected_total int NOT NULL DEFAULT 0,
  loaded_total int NOT NULL DEFAULT 0,
  left_behind_total int NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_loading_batches_status ON public.loading_batches(status);
CREATE INDEX idx_loading_batches_date ON public.loading_batches(loading_date DESC);

ALTER TABLE public.loading_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage loading_batches" ON public.loading_batches
  TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
CREATE TRIGGER t_loading_batches_upd BEFORE UPDATE ON public.loading_batches
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Packages within a batch
CREATE TABLE public.batch_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.loading_batches(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  loaded_by uuid,
  notes text,
  UNIQUE (batch_id, package_id)
);
CREATE INDEX idx_batch_packages_batch ON public.batch_packages(batch_id);
CREATE INDEX idx_batch_packages_package ON public.batch_packages(package_id);

ALTER TABLE public.batch_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage batch_packages" ON public.batch_packages
  TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

-- Notifications (left-behind alerts, irregular arrivals, system events)
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL, -- left_behind | irregular_arrival | system | info
  severity text NOT NULL DEFAULT 'info', -- info | warning | critical
  audience text NOT NULL DEFAULT 'all', -- china | kenya | all
  title text NOT NULL,
  body text,
  data jsonb,
  package_id uuid REFERENCES public.packages(id) ON DELETE SET NULL,
  batch_id uuid REFERENCES public.loading_batches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_created ON public.notifications(created_at DESC);
CREATE INDEX idx_notifications_audience ON public.notifications(audience);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff view notifications" ON public.notifications
  FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY "staff insert notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));

-- Per-user read state
CREATE TABLE public.notification_reads (
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user manages own reads" ON public.notification_reads
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Helper: detect left-behind packages for a batch and create a notification
CREATE OR REPLACE FUNCTION public.detect_left_behind(_batch_id uuid)
RETURNS TABLE(package_id uuid, tracking_number text, days_in_warehouse int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamptz;
  v_origin text;
  v_count int;
BEGIN
  SELECT cutoff_at, origin_warehouse INTO v_cutoff, v_origin
    FROM loading_batches WHERE id = _batch_id;

  RETURN QUERY
  SELECT p.id, p.tracking_number,
         GREATEST(0, EXTRACT(DAY FROM (now() - p.received_at))::int) AS days_in_warehouse
  FROM packages p
  WHERE p.received_at IS NOT NULL
    AND p.received_at <= v_cutoff
    AND p.status = 'received_in_china'::package_status
    AND NOT EXISTS (
      SELECT 1 FROM batch_packages bp WHERE bp.package_id = p.id
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    INSERT INTO notifications (type, severity, audience, title, body, batch_id, data)
    VALUES (
      'left_behind', 'warning', 'china',
      v_count || ' package(s) left behind in batch',
      'Packages received before the cutoff were not loaded.',
      _batch_id,
      jsonb_build_object('count', v_count)
    );
    UPDATE loading_batches SET left_behind_total = v_count WHERE id = _batch_id;
  END IF;
END $$;