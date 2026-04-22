CREATE TABLE IF NOT EXISTS public.social_publish_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.marketing_posts(id) ON DELETE CASCADE,
  platform social_platform NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  external_id TEXT,
  permalink TEXT,
  error TEXT,
  raw_response JSONB,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.social_publish_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff manage publish results"
ON public.social_publish_results
FOR ALL TO authenticated
USING (is_staff(auth.uid()))
WITH CHECK (is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_marketing_posts_scheduled
  ON public.marketing_posts (scheduled_for)
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_publish_results_post ON public.social_publish_results (post_id);