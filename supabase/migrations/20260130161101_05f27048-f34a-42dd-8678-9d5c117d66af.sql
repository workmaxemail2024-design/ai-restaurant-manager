-- Drop and recreate staff_safe view to include new contract columns
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
  created_at,
  updated_at,
  CASE 
    WHEN public.user_is_manager_or_owner() THEN email
    ELSE NULL
  END as email,
  CASE 
    WHEN public.user_is_manager_or_owner() THEN phone
    ELSE NULL
  END as phone,
  CASE 
    WHEN public.user_is_manager_or_owner() THEN hourly_rate
    ELSE NULL
  END as hourly_rate
FROM public.staff;