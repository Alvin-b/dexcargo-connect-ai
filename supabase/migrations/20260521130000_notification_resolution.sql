ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid,
  ADD COLUMN IF NOT EXISTS resolution_notes text;

CREATE INDEX IF NOT EXISTS idx_notifications_resolved_at ON public.notifications(resolved_at);
