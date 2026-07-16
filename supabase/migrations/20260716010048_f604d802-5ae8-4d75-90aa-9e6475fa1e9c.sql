
-- 1. Revoke EXECUTE from anon/public on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.admin_register_employee(uuid, text, text, text, app_role, uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.archive_expired_delivery_records() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.atomic_claim_conversation(uuid, uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.award_commission(uuid, uuid, commission_trigger, numeric, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.detect_left_behind(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.issue_api_key(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.prune_rate_limit_hits() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.transition_package_status(uuid, pkg_status, uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.verify_api_key(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM anon, public;

-- 2. Set search_path on is_valid_pkg_transition
ALTER FUNCTION public.is_valid_pkg_transition(pkg_status, pkg_status) SET search_path = public;

-- 3. Restrict warehouses SELECT to staff
DROP POLICY IF EXISTS "authenticated read warehouses" ON public.warehouses;
CREATE POLICY "staff read warehouses" ON public.warehouses
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
