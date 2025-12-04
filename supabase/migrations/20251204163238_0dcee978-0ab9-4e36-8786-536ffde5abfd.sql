-- Fix security definer warning on staff_safe view
DROP VIEW IF EXISTS public.staff_safe;

CREATE VIEW public.staff_safe
WITH (security_invoker = true) AS
SELECT
  id,
  first_name,
  last_name,
  role,
  status,
  location_id,
  restaurant_id,
  created_at,
  updated_at,
  captiva_operator_code,
  CASE WHEN public.user_is_manager_or_owner() THEN email ELSE NULL END AS email,
  CASE WHEN public.user_is_manager_or_owner() THEN phone ELSE NULL END AS phone,
  CASE WHEN public.user_is_manager_or_owner() THEN hourly_rate ELSE NULL END AS hourly_rate
FROM public.staff
WHERE public.user_belongs_to_restaurant(restaurant_id);