-- Delivery signatures table
CREATE TABLE IF NOT EXISTS public.delivery_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL,
  signer_name text NOT NULL,
  signer_phone text,
  signature_url text NOT NULL,
  payment_method text NOT NULL DEFAULT 'cash',
  amount_paid numeric,
  currency text DEFAULT 'KES',
  payment_id uuid,
  notes text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_signatures_package ON public.delivery_signatures(package_id);

ALTER TABLE public.delivery_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff manage delivery signatures"
ON public.delivery_signatures
FOR ALL
TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "client view own delivery signatures"
ON public.delivery_signatures
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.packages p
  JOIN public.clients c ON c.id = p.client_id
  WHERE p.id = delivery_signatures.package_id AND c.user_id = auth.uid()
));

-- Private signatures storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('signatures', 'signatures', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "staff upload signatures"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'signatures' AND public.is_staff(auth.uid()));

CREATE POLICY "staff read signatures"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'signatures' AND public.is_staff(auth.uid()));

CREATE POLICY "staff delete signatures"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'signatures' AND public.is_staff(auth.uid()));