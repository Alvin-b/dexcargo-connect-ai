
-- Immutable audit log of conversation assignment / handoff / escalation events
CREATE TABLE public.conversation_assignment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'assigned','reassigned','claimed','unassigned',
    'ai_disabled','ai_enabled','handoff','escalation'
  )),
  actor_id uuid,
  actor_display_name text,
  from_staff_id uuid,
  to_staff_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX conversation_assignment_events_conv_idx
  ON public.conversation_assignment_events(conversation_id, created_at DESC);
CREATE INDEX conversation_assignment_events_to_staff_idx
  ON public.conversation_assignment_events(to_staff_id, created_at DESC);

GRANT SELECT ON public.conversation_assignment_events TO authenticated;
GRANT ALL    ON public.conversation_assignment_events TO service_role;

ALTER TABLE public.conversation_assignment_events ENABLE ROW LEVEL SECURITY;

-- Staff can read events for their own conversations; admins read all.
CREATE POLICY "staff read own conv events" ON public.conversation_assignment_events
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR to_staff_id   = auth.uid()
    OR from_staff_id = auth.uid()
    OR actor_id      = auth.uid()
  );

-- No INSERT/UPDATE/DELETE policies — writes only via service_role (admin client).
-- This makes the log immutable from the client API surface.

-- Atomic, race-free assignment. Only succeeds if conversation is currently unassigned
-- OR the caller passes _expected_current matching the row. Returns assigned uuid or null.
CREATE OR REPLACE FUNCTION public.atomic_claim_conversation(
  _conversation_id uuid,
  _staff_id uuid,
  _expected_current uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigned uuid;
BEGIN
  UPDATE public.conversations
     SET assigned_staff_id = _staff_id,
         assigned_at = now()
   WHERE id = _conversation_id
     AND (
       (_expected_current IS NULL AND assigned_staff_id IS NULL)
       OR assigned_staff_id IS NOT DISTINCT FROM _expected_current
     )
  RETURNING assigned_staff_id INTO v_assigned;
  RETURN v_assigned;
END;
$$;
