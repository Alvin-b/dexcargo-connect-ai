CREATE SEQUENCE IF NOT EXISTS public.dex_tracking_sequence START WITH 100000;

CREATE OR REPLACE FUNCTION public.generate_dex_tracking_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq bigint;
BEGIN
  v_seq := nextval('public.dex_tracking_sequence');
  RETURN 'DCX-' || to_char(now(), 'YYYY') || '-' || lpad((v_seq % 1000000)::text, 6, '0');
END $$;

GRANT EXECUTE ON FUNCTION public.generate_dex_tracking_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_dex_tracking_number() TO service_role;
