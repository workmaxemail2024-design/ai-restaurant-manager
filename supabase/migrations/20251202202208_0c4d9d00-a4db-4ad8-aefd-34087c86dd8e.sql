-- Create roles table for custom RBAC
CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  permissions jsonb NOT NULL DEFAULT '{}',
  is_system_role boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, name)
);

-- Enable RLS on roles
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

-- RLS policy for roles
CREATE POLICY "Tenant access to roles"
ON public.roles
AS RESTRICTIVE
FOR ALL
USING (public.user_belongs_to_restaurant(restaurant_id))
WITH CHECK (public.user_belongs_to_restaurant(restaurant_id));

-- Add role_id to user_restaurants (keep old role column temporarily for migration)
ALTER TABLE public.user_restaurants ADD COLUMN role_id uuid REFERENCES public.roles(id);

-- Create index for performance
CREATE INDEX idx_roles_restaurant_id ON public.roles(restaurant_id);
CREATE INDEX idx_user_restaurants_role_id ON public.user_restaurants(role_id);

-- Function to get user's role_id for current restaurant
CREATE OR REPLACE FUNCTION public.get_user_role_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role_id FROM public.user_restaurants 
  WHERE user_id = auth.uid() AND is_default = true
  LIMIT 1
$$;

-- Function to get user's permissions for current restaurant
CREATE OR REPLACE FUNCTION public.get_user_permissions()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(r.permissions, '{}'::jsonb)
  FROM public.user_restaurants ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = auth.uid() AND ur.is_default = true
  LIMIT 1
$$;

-- Function to check if user has specific permission
CREATE OR REPLACE FUNCTION public.user_has_permission(p_resource text, p_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_perms jsonb;
  resource_perms jsonb;
BEGIN
  -- Get user permissions
  SELECT COALESCE(r.permissions, '{}'::jsonb) INTO user_perms
  FROM public.user_restaurants ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = auth.uid() AND ur.is_default = true
  LIMIT 1;
  
  -- If no permissions found, deny
  IF user_perms IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check for full_access (owner/super-admin)
  IF (user_perms->>'full_access')::boolean = true THEN
    RETURN true;
  END IF;
  
  -- Get resource permissions
  resource_perms := user_perms->p_resource;
  
  IF resource_perms IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check specific action
  IF p_action = 'admin' THEN
    RETURN COALESCE((resource_perms->>'admin')::boolean, false);
  ELSIF p_action = 'edit' THEN
    RETURN COALESCE((resource_perms->>'edit')::boolean, false) OR COALESCE((resource_perms->>'admin')::boolean, false);
  ELSIF p_action = 'view' THEN
    RETURN COALESCE((resource_perms->>'view')::boolean, false) OR COALESCE((resource_perms->>'edit')::boolean, false) OR COALESCE((resource_perms->>'admin')::boolean, false);
  END IF;
  
  RETURN false;
END;
$$;

-- Function to create default roles for a restaurant
CREATE OR REPLACE FUNCTION public.create_default_roles(p_restaurant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Owner role (full access)
  INSERT INTO public.roles (restaurant_id, name, description, is_system_role, permissions)
  VALUES (
    p_restaurant_id,
    'Owner',
    'Full access to all features',
    true,
    '{
      "full_access": true,
      "dashboard": {"view": true, "edit": true, "admin": true},
      "staff": {"view": true, "edit": true, "admin": true},
      "menu": {"view": true, "edit": true, "admin": true},
      "inventory": {"view": true, "edit": true, "admin": true},
      "purchase_orders": {"view": true, "edit": true, "admin": true},
      "reports": {"view": true, "edit": true, "admin": true},
      "analytics": {"view": true, "edit": true, "admin": true},
      "ai_features": {"view": true, "edit": true, "admin": true},
      "pos": {"view": true, "edit": true, "admin": true},
      "settings": {"view": true, "edit": true, "admin": true},
      "automation": {"view": true, "edit": true, "admin": true},
      "finance": {"view": true, "edit": true, "admin": true},
      "locations": {"view": true, "edit": true, "admin": true}
    }'::jsonb
  );
  
  -- Manager role
  INSERT INTO public.roles (restaurant_id, name, description, is_system_role, permissions)
  VALUES (
    p_restaurant_id,
    'Manager',
    'Management access with limited admin features',
    true,
    '{
      "dashboard": {"view": true, "edit": true, "admin": false},
      "staff": {"view": true, "edit": true, "admin": false},
      "menu": {"view": true, "edit": true, "admin": false},
      "inventory": {"view": true, "edit": true, "admin": false},
      "purchase_orders": {"view": true, "edit": true, "admin": false},
      "reports": {"view": true, "edit": false, "admin": false},
      "analytics": {"view": true, "edit": false, "admin": false},
      "ai_features": {"view": true, "edit": false, "admin": false},
      "pos": {"view": true, "edit": false, "admin": false},
      "settings": {"view": false, "edit": false, "admin": false},
      "automation": {"view": true, "edit": false, "admin": false},
      "finance": {"view": true, "edit": false, "admin": false},
      "locations": {"view": true, "edit": false, "admin": false}
    }'::jsonb
  );
  
  -- Staff role
  INSERT INTO public.roles (restaurant_id, name, description, is_system_role, permissions)
  VALUES (
    p_restaurant_id,
    'Staff',
    'Basic staff access',
    true,
    '{
      "dashboard": {"view": true, "edit": false, "admin": false},
      "staff": {"view": true, "edit": false, "admin": false},
      "menu": {"view": true, "edit": false, "admin": false},
      "inventory": {"view": true, "edit": false, "admin": false},
      "purchase_orders": {"view": false, "edit": false, "admin": false},
      "reports": {"view": false, "edit": false, "admin": false},
      "analytics": {"view": false, "edit": false, "admin": false},
      "ai_features": {"view": false, "edit": false, "admin": false},
      "pos": {"view": false, "edit": false, "admin": false},
      "settings": {"view": false, "edit": false, "admin": false},
      "automation": {"view": false, "edit": false, "admin": false},
      "finance": {"view": false, "edit": false, "admin": false},
      "locations": {"view": true, "edit": false, "admin": false}
    }'::jsonb
  );
END;
$$;

-- Add updated_at trigger for roles
CREATE TRIGGER update_roles_updated_at
BEFORE UPDATE ON public.roles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();