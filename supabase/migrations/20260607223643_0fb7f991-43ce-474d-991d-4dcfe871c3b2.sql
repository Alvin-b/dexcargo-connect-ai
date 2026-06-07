
-- 1) Lock down SECURITY DEFINER functions: revoke from PUBLIC/anon, grant only where needed.
REVOKE ALL ON FUNCTION public.issue_api_key(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_api_key(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.verify_api_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_api_key(text) TO service_role;

REVOKE ALL ON FUNCTION public.atomic_claim_conversation(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_claim_conversation(uuid, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.detect_left_behind(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.detect_left_behind(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.archive_expired_delivery_records() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_expired_delivery_records() TO service_role;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.prune_rate_limit_hits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_rate_limit_hits() TO service_role;

-- has_role and is_staff are used inside RLS policies; keep them callable by authenticated users
-- but block anon/public from probing roles directly.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;

-- 2) Remove broad storage listing policy on package-photos.
-- Files remain reachable via their public URLs because the bucket is public,
-- but anonymous clients can no longer enumerate the bucket via the storage API.
DROP POLICY IF EXISTS "public read package photos by path" ON storage.objects;

-- Allow staff to list/read package photos via the API for the dashboard.
CREATE POLICY "staff read package photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'package-photos' AND public.is_staff(auth.uid()));
