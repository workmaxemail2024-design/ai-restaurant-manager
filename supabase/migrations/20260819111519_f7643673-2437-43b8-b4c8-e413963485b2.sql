DO $$ BEGIN
  CREATE TYPE public.pay_type AS ENUM ('hourly', 'salary');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS pay_type public.pay_type NOT NULL DEFAULT 'hourly',
  ADD COLUMN IF NOT EXISTS annual_salary numeric;

DROP VIEW IF EXISTS public.staff_safe;

CREATE VIEW public.staff_safe AS
SELECT 
  id,
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
  created_at,
  updated_at,
  CASE WHEN public.user_is_manager_or_owner() THEN email ELSE NULL END as email,
  CASE WHEN public.user_is_manager_or_owner() THEN phone ELSE NULL END as phone,
  CASE WHEN public.user_is_manager_or_owner() THEN hourly_rate ELSE NULL END as hourly_rate,
  CASE WHEN public.user_is_manager_or_owner() THEN annual_salary ELSE NULL END as annual_salary
FROM public.staff;

GRANT SELECT ON public.staff_safe TO authenticated;