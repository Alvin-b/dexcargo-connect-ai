
ALTER FUNCTION public.touch_updated_at() SET search_path = public;

DROP POLICY IF EXISTS "public read package photos" ON storage.objects;
CREATE POLICY "public read package photos by path" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'package-photos');
