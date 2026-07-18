
-- Kenya-only: retire china_staff, kenya_staff, generic 'staff' roles; drop staff_location; recognize only new roles.

-- 1) Reassign existing user_roles rows to new roles
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT user_id, 'sales_rep'::public.app_role
  FROM public.user_roles
 WHERE role::text IN ('kenya_staff','staff')
ON CONFLICT (user_id, role) DO NOTHING;

DELETE FROM public.user_roles WHERE role::text IN ('china_staff','kenya_staff','staff');

-- 2) Drop obsolete profile column
ALTER TABLE public.profiles DROP COLUMN IF EXISTS staff_location;

-- 3) Update is_staff() to recognize only current roles
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('admin','sales_manager','logistics_manager','sales_rep')
  )
$function$;

-- 4) Migrate old notification audiences
UPDATE public.notifications SET audience='all' WHERE audience IN ('china','kenya');
