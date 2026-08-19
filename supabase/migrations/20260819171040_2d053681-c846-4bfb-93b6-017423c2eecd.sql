ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS department text;

ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_department_check;
ALTER TABLE public.staff ADD CONSTRAINT staff_department_check
  CHECK (department IS NULL OR department IN ('floor','kitchen','management','other'));

DROP VIEW IF EXISTS public.staff_safe;
CREATE VIEW public.staff_safe
WITH (security_invoker = true)
AS
SELECT id,
    restaurant_id,
    location_id,
    first_name,
    last_name,
    role,
    status,
    captiva_operator_code,
    contract_type,
    max_hours_per_week,
    min_hours_per_week,
    pay_type,
    department,
    created_at,
    updated_at,
    CASE WHEN user_is_manager_or_owner() THEN email ELSE NULL::text END AS email,
    CASE WHEN user_is_manager_or_owner() THEN phone ELSE NULL::text END AS phone,
    CASE WHEN user_is_manager_or_owner() THEN hourly_rate ELSE NULL::numeric END AS hourly_rate,
    CASE WHEN user_is_manager_or_owner() THEN annual_salary ELSE NULL::numeric END AS annual_salary
FROM public.staff;

GRANT SELECT ON public.staff_safe TO authenticated;
GRANT ALL ON public.staff_safe TO service_role;