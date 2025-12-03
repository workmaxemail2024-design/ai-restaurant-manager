-- Drop existing views and recreate with SECURITY INVOKER pattern
DROP VIEW IF EXISTS public.staff_safe;
DROP VIEW IF EXISTS public.pos_integrations_safe;

-- Recreate staff_safe view with proper security
CREATE VIEW public.staff_safe 
WITH (security_invoker = true)
AS
SELECT 
  s.id,
  s.location_id,
  s.first_name,
  s.last_name,
  s.role,
  s.status,
  s.created_at,
  s.updated_at,
  s.restaurant_id,
  CASE WHEN public.user_is_manager_or_owner() THEN s.email ELSE NULL END AS email,
  CASE WHEN public.user_is_manager_or_owner() THEN s.phone ELSE NULL END AS phone,
  CASE WHEN public.user_is_manager_or_owner() THEN s.hourly_rate ELSE 0 END AS hourly_rate
FROM public.staff s;

-- Grant access to the view
GRANT SELECT ON public.staff_safe TO authenticated;

-- Recreate pos_integrations_safe view with proper security
CREATE VIEW public.pos_integrations_safe 
WITH (security_invoker = true)
AS
SELECT 
  id,
  location_id,
  pos_provider,
  status,
  last_sync_time,
  webhook_url,
  settings,
  created_at,
  updated_at,
  restaurant_id,
  CASE WHEN public.user_can_view_pos_credentials() THEN api_key ELSE '********' END AS api_key,
  CASE WHEN public.user_can_view_pos_credentials() THEN api_secret ELSE '********' END AS api_secret
FROM public.pos_integrations;

-- Grant access to the view
GRANT SELECT ON public.pos_integrations_safe TO authenticated;