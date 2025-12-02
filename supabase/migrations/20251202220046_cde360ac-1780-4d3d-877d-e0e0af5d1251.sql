-- Create ensure_user_restaurant function
CREATE OR REPLACE FUNCTION public.ensure_user_restaurant()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_restaurant_id uuid;
  v_restaurant_name text;
  v_role_id uuid;
  v_permissions jsonb;
  v_existing record;
BEGIN
  -- Get current user id
  v_user_id := auth.uid();
  
  -- If no authenticated user, return null
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Check if user already has a restaurant linkage
  SELECT ur.restaurant_id, ur.role_id, r.name as restaurant_name
  INTO v_existing
  FROM public.user_restaurants ur
  JOIN public.restaurants r ON r.id = ur.restaurant_id
  WHERE ur.user_id = v_user_id
  ORDER BY ur.is_default DESC, ur.created_at ASC
  LIMIT 1;
  
  IF v_existing IS NOT NULL THEN
    -- User already has a restaurant, return existing data
    v_restaurant_id := v_existing.restaurant_id;
    v_restaurant_name := v_existing.restaurant_name;
    v_role_id := v_existing.role_id;
    v_permissions := public.get_user_permissions();
    
    RETURN jsonb_build_object(
      'restaurant_id', v_restaurant_id,
      'restaurant_name', v_restaurant_name,
      'role_id', v_role_id,
      'permissions', v_permissions
    );
  END IF;
  
  -- No restaurant found, create one
  INSERT INTO public.restaurants (name, owner_email)
  VALUES ('My First Restaurant', (SELECT email FROM auth.users WHERE id = v_user_id))
  RETURNING id, name INTO v_restaurant_id, v_restaurant_name;
  
  -- Create default roles for the restaurant
  PERFORM public.create_default_roles(v_restaurant_id);
  
  -- Get the Owner role
  SELECT id INTO v_role_id
  FROM public.roles
  WHERE restaurant_id = v_restaurant_id
    AND name = 'Owner'
  LIMIT 1;
  
  -- Link user to restaurant with Owner role
  INSERT INTO public.user_restaurants (user_id, restaurant_id, role, role_id, is_default)
  VALUES (v_user_id, v_restaurant_id, 'owner', v_role_id, true);
  
  -- Create default automation rules
  PERFORM public.create_default_automation_rules(v_restaurant_id);
  
  -- Create default location
  INSERT INTO public.locations (name, restaurant_id)
  VALUES ('Main Location', v_restaurant_id);
  
  -- Get permissions (now that user_restaurants row exists)
  v_permissions := public.get_user_permissions();
  
  RETURN jsonb_build_object(
    'restaurant_id', v_restaurant_id,
    'restaurant_name', v_restaurant_name,
    'role_id', v_role_id,
    'permissions', v_permissions
  );
END;
$$;