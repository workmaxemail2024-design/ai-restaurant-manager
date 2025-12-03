-- Create a function to check if user has POS admin permission
CREATE OR REPLACE FUNCTION public.user_has_pos_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_permission('pos', 'admin');
$$;

-- Drop existing RLS policies on pos_integrations that allow full access
DROP POLICY IF EXISTS "Tenant access to pos_integrations" ON public.pos_integrations;
DROP POLICY IF EXISTS "tenant_access_policy" ON public.pos_integrations;

-- Create new RLS policies with credential access restriction

-- Allow all authenticated restaurant members to SELECT but mask credentials
-- Users can see basic info (id, location_id, pos_provider, status, etc.)
CREATE POLICY "Users can view own restaurant POS integrations"
ON public.pos_integrations
FOR SELECT
USING (
  (restaurant_id IS NULL OR user_belongs_to_restaurant(restaurant_id))
);

-- Only users with POS admin permission can INSERT
CREATE POLICY "POS admins can create integrations"
ON public.pos_integrations
FOR INSERT
WITH CHECK (
  (restaurant_id IS NULL OR user_belongs_to_restaurant(restaurant_id))
  AND user_has_pos_admin()
);

-- Only users with POS admin permission can UPDATE
CREATE POLICY "POS admins can update integrations"
ON public.pos_integrations
FOR UPDATE
USING (
  (restaurant_id IS NULL OR user_belongs_to_restaurant(restaurant_id))
  AND user_has_pos_admin()
);

-- Only users with POS admin permission can DELETE
CREATE POLICY "POS admins can delete integrations"
ON public.pos_integrations
FOR DELETE
USING (
  (restaurant_id IS NULL OR user_belongs_to_restaurant(restaurant_id))
  AND user_has_pos_admin()
);

-- Create a secure view that masks credentials for non-admin users
CREATE OR REPLACE VIEW public.pos_integrations_safe AS
SELECT 
  id,
  location_id,
  pos_provider,
  status,
  last_sync_time,
  webhook_url,
  settings,
  restaurant_id,
  created_at,
  updated_at,
  CASE 
    WHEN user_has_pos_admin() THEN api_key 
    ELSE CASE WHEN api_key IS NOT NULL THEN '********' ELSE NULL END
  END as api_key,
  CASE 
    WHEN user_has_pos_admin() THEN api_secret 
    ELSE CASE WHEN api_secret IS NOT NULL THEN '********' ELSE NULL END
  END as api_secret
FROM public.pos_integrations;