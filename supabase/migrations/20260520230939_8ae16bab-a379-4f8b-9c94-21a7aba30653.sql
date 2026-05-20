
-- Idempotency keys: dedupe mobile-app retries on critical mutations
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  key text NOT NULL,
  response_status int NOT NULL,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint, key)
);
CREATE INDEX IF NOT EXISTS idx_idem_created_at ON public.idempotency_keys(created_at);
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff view idempotency" ON public.idempotency_keys
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- Rate limit hits: sliding-window counter
CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  id bigserial PRIMARY KEY,
  bucket text NOT NULL,
  hit_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rlh_bucket_time ON public.rate_limit_hits(bucket, hit_at DESC);
ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin view rate limits" ON public.rate_limit_hits
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));

-- Atomic rate-limit check + record
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _bucket text,
  _max int,
  _window_seconds int
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM public.rate_limit_hits
   WHERE bucket = _bucket
     AND hit_at > now() - make_interval(secs => _window_seconds);
  IF v_count >= _max THEN
    RETURN false;
  END IF;
  INSERT INTO public.rate_limit_hits(bucket) VALUES (_bucket);
  RETURN true;
END;
$$;

-- Cleanup of old rows (cron will call it)
CREATE OR REPLACE FUNCTION public.prune_rate_limit_hits() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v int;
BEGIN
  DELETE FROM public.rate_limit_hits WHERE hit_at < now() - INTERVAL '1 hour';
  GET DIAGNOSTICS v = ROW_COUNT;
  DELETE FROM public.idempotency_keys WHERE created_at < now() - INTERVAL '24 hours';
  RETURN v;
END $$;

-- Schedule prune hourly
SELECT cron.unschedule('prune-rate-limit-hits') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'prune-rate-limit-hits'
);
SELECT cron.schedule('prune-rate-limit-hits','15 * * * *',$$SELECT public.prune_rate_limit_hits();$$);
