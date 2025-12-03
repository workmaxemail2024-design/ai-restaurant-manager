-- Create helper function to check if user is manager or owner
CREATE OR REPLACE FUNCTION public.user_is_manager_or_owner()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_restaurants ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND ur.is_default = true
      AND (
        r.name IN ('Owner', 'Manager')
        OR (r.permissions->>'full_access')::boolean = true
      )
  )
$$;

-- Create a safe view for staff that hides PII from non-managers
CREATE OR REPLACE VIEW public.staff_safe AS
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
FROM public.staff s
WHERE s.restaurant_id IS NULL OR public.user_belongs_to_restaurant(s.restaurant_id);

-- Grant access to the view
GRANT SELECT ON public.staff_safe TO authenticated;

-- Create a function to check if user can view POS credentials (admin only)
CREATE OR REPLACE FUNCTION public.user_can_view_pos_credentials()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_restaurants ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND ur.is_default = true
      AND (
        (r.permissions->>'full_access')::boolean = true
        OR (r.permissions->'pos'->>'admin')::boolean = true
      )
  )
$$;

-- Create a safe view for POS integrations that masks credentials
CREATE OR REPLACE VIEW public.pos_integrations_safe AS
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
FROM public.pos_integrations
WHERE restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id);

-- Grant access to the view
GRANT SELECT ON public.pos_integrations_safe TO authenticated;