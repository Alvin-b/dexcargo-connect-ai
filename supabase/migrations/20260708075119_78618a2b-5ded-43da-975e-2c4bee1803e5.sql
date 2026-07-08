
-- 1. Lock down SECURITY DEFINER function execution ----------------------------
-- Revoke default PUBLIC EXECUTE, then re-grant to the roles that need it.

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

REVOKE EXECUTE ON FUNCTION public.detect_left_behind(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.detect_left_behind(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.atomic_claim_conversation(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.atomic_claim_conversation(uuid, uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.issue_api_key(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.issue_api_key(uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.verify_api_key(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.verify_api_key(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.archive_expired_delivery_records() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.archive_expired_delivery_records() TO service_role;

REVOKE EXECUTE ON FUNCTION public.admin_register_employee(uuid, text, text, text, app_role, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_register_employee(uuid, text, text, text, app_role, uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.prune_rate_limit_hits() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.prune_rate_limit_hits() TO service_role;

-- 2. Notifications: allow clients to read their own notifications -------------

DROP POLICY IF EXISTS "client view notifications" ON public.notifications;
CREATE POLICY "client view notifications"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (
    audience IN ('all', 'client')
    OR EXISTS (
      SELECT 1
      FROM public.packages p
      JOIN public.clients c ON c.id = p.client_id
      WHERE p.id = notifications.package_id
        AND c.user_id = auth.uid()
    )
  );

-- 3. Realtime: enable RLS on realtime.messages and scope subscriptions --------
-- Staff may subscribe to any topic; clients only to topics prefixed with their user id
-- (e.g. "user:<uid>:*"). Postgres_changes subscriptions remain governed by
-- source-table SELECT policies.

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff can access all realtime topics" ON realtime.messages;
CREATE POLICY "staff can access all realtime topics"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff can publish to all realtime topics" ON realtime.messages;
CREATE POLICY "staff can publish to all realtime topics"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "user can access own realtime topic" ON realtime.messages;
CREATE POLICY "user can access own realtime topic"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() = 'user:' || auth.uid()::text
    OR realtime.topic() LIKE 'user:' || auth.uid()::text || ':%'
  );

DROP POLICY IF EXISTS "user can publish to own realtime topic" ON realtime.messages;
CREATE POLICY "user can publish to own realtime topic"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    realtime.topic() = 'user:' || auth.uid()::text
    OR realtime.topic() LIKE 'user:' || auth.uid()::text || ':%'
  );
