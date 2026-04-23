
ALTER TABLE public.packages REPLICA IDENTITY FULL;
ALTER TABLE public.package_events REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.packages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.package_events;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
