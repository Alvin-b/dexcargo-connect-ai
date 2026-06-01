-- conversations: staff assignment
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS assigned_staff_id uuid,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_conv_assigned_staff ON public.conversations(assigned_staff_id);

-- messages: author tracking
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS staff_display_name text;

-- payments: verification + audit
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS initiated_by uuid;

-- packages: full shipping-label data
ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS qr_payload jsonb,
  ADD COLUMN IF NOT EXISTS external_barcode text,
  ADD COLUMN IF NOT EXISTS route_code text,
  ADD COLUMN IF NOT EXISTS remark text,
  ADD COLUMN IF NOT EXISTS arrived_at timestamptz,
  ADD COLUMN IF NOT EXISTS current_location text,
  ADD COLUMN IF NOT EXISTS shipper_name text,
  ADD COLUMN IF NOT EXISTS shipper_phone text,
  ADD COLUMN IF NOT EXISTS shipper_company text,
  ADD COLUMN IF NOT EXISTS shipper_address text,
  ADD COLUMN IF NOT EXISTS consignee_company text,
  ADD COLUMN IF NOT EXISTS consignee_address text,
  ADD COLUMN IF NOT EXISTS chargeable_weight_kg numeric(12,3),
  ADD COLUMN IF NOT EXISTS piece_count integer,
  ADD COLUMN IF NOT EXISTS declared_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS declared_currency text,
  ADD COLUMN IF NOT EXISTS payment_type text,
  ADD COLUMN IF NOT EXISTS insurance_charge numeric(12,2),
  ADD COLUMN IF NOT EXISTS other_charge numeric(12,2),
  ADD COLUMN IF NOT EXISTS freight_charge numeric(12,2),
  ADD COLUMN IF NOT EXISTS origin_total_charge numeric(12,2),
  ADD COLUMN IF NOT EXISTS origin_currency text;

CREATE INDEX IF NOT EXISTS idx_packages_external_barcode ON public.packages(external_barcode);
CREATE INDEX IF NOT EXISTS idx_packages_remark ON public.packages(remark);
CREATE INDEX IF NOT EXISTS idx_packages_qr_payload_gin ON public.packages USING gin(qr_payload);
