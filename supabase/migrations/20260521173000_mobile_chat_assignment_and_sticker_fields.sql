ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS external_barcode text,
  ADD COLUMN IF NOT EXISTS route_code text,
  ADD COLUMN IF NOT EXISTS piece_count integer,
  ADD COLUMN IF NOT EXISTS shipper_name text,
  ADD COLUMN IF NOT EXISTS shipper_phone text,
  ADD COLUMN IF NOT EXISTS shipper_company text,
  ADD COLUMN IF NOT EXISTS shipper_address text,
  ADD COLUMN IF NOT EXISTS consignee_company text,
  ADD COLUMN IF NOT EXISTS consignee_address text,
  ADD COLUMN IF NOT EXISTS chargeable_weight_kg numeric,
  ADD COLUMN IF NOT EXISTS payment_type text,
  ADD COLUMN IF NOT EXISTS declared_amount numeric,
  ADD COLUMN IF NOT EXISTS declared_currency text,
  ADD COLUMN IF NOT EXISTS insurance_charge numeric,
  ADD COLUMN IF NOT EXISTS other_charge numeric,
  ADD COLUMN IF NOT EXISTS freight_charge numeric,
  ADD COLUMN IF NOT EXISTS origin_total_charge numeric,
  ADD COLUMN IF NOT EXISTS origin_currency text,
  ADD COLUMN IF NOT EXISTS remark text;

CREATE INDEX IF NOT EXISTS idx_packages_external_barcode ON public.packages(external_barcode);
CREATE INDEX IF NOT EXISTS idx_packages_remark ON public.packages(remark);

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS assigned_staff_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_conversations_assigned_staff ON public.conversations(assigned_staff_id, last_message_at DESC);

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS staff_display_name text;

DROP POLICY IF EXISTS "staff manage conv" ON public.conversations;
DROP POLICY IF EXISTS "staff manage messages" ON public.messages;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'conversations'
      AND policyname = 'admin manage conversations'
  ) THEN
    CREATE POLICY "admin manage conversations"
      ON public.conversations
      FOR ALL
      TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'conversations'
      AND policyname = 'assigned staff manage conversations'
  ) THEN
    CREATE POLICY "assigned staff manage conversations"
      ON public.conversations
      FOR ALL
      TO authenticated
      USING (assigned_staff_id = auth.uid())
      WITH CHECK (assigned_staff_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'messages'
      AND policyname = 'admin manage messages'
  ) THEN
    CREATE POLICY "admin manage messages"
      ON public.messages
      FOR ALL
      TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'messages'
      AND policyname = 'assigned staff manage messages'
  ) THEN
    CREATE POLICY "assigned staff manage messages"
      ON public.messages
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.conversations c
          WHERE c.id = conversation_id
            AND c.assigned_staff_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.conversations c
          WHERE c.id = conversation_id
            AND c.assigned_staff_id = auth.uid()
        )
      );
  END IF;
END $$;

