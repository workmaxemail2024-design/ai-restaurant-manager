-- 1. Invitation: name + multiple locations
ALTER TABLE public.restaurant_invites ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.restaurant_invites ADD COLUMN IF NOT EXISTS location_ids uuid[];

-- 2. Membership active flag (all existing memberships become active)
ALTER TABLE public.user_restaurants ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 3. Active-aware helpers (same signatures; unchanged behaviour for active members)
CREATE OR REPLACE FUNCTION public.user_belongs_to_restaurant(_restaurant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_restaurants
    WHERE user_id = auth.uid() AND restaurant_id = _restaurant_id AND is_active
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_permissions()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(r.permissions, '{}'::jsonb)
  FROM public.user_restaurants ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = auth.uid() AND ur.is_default = true AND ur.is_active
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.user_has_permission(p_resource text, p_action text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  user_perms jsonb;
  resource_perms jsonb;
BEGIN
  SELECT COALESCE(r.permissions, '{}'::jsonb) INTO user_perms
  FROM public.user_restaurants ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = auth.uid() AND ur.is_default = true AND ur.is_active
  LIMIT 1;

  IF user_perms IS NULL THEN
    RETURN false;
  END IF;

  IF (user_perms->>'full_access')::boolean = true THEN
    RETURN true;
  END IF;

  resource_perms := user_perms->p_resource;
  IF resource_perms IS NULL THEN
    RETURN false;
  END IF;

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

-- 4. Login resolution: deactivated membership is an explicit denial;
--    invite acceptance grants every location on the invitation
CREATE OR REPLACE FUNCTION public.ensure_user_restaurant()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text; v_confirmed timestamptz;
  v_restaurant_id uuid; v_role_id uuid; v_is_active boolean;
  v_invite public.restaurant_invites%ROWTYPE;
  v_loc uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error','no_user');
  END IF;

  PERFORM public.sync_own_profile();
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  -- Any active membership wins
  SELECT ur.restaurant_id, ur.role_id INTO v_restaurant_id, v_role_id
  FROM public.user_restaurants ur
  WHERE ur.user_id = v_user_id AND ur.is_active
  ORDER BY ur.is_default DESC, ur.created_at
  LIMIT 1;

  IF v_restaurant_id IS NOT NULL THEN
    RETURN jsonb_build_object('restaurant_id', v_restaurant_id, 'role_id', v_role_id,
                              'permissions', public.get_user_permissions());
  END IF;

  -- No active membership, but an existing (deactivated) one: explicit denial.
  -- Never create a restaurant or accept an invite to bypass deactivation.
  IF EXISTS (SELECT 1 FROM public.user_restaurants ur WHERE ur.user_id = v_user_id) THEN
    RETURN jsonb_build_object(
      'error', 'Your access to this workspace has been disabled. Please contact the owner.',
      'membership_inactive', true
    );
  END IF;

  SELECT lower(trim(u.email)), u.email_confirmed_at INTO v_email, v_confirmed
  FROM auth.users u WHERE u.id = v_user_id;

  IF v_email IS NOT NULL THEN
    PERFORM public.expire_stale_invites(v_email);
  END IF;

  IF v_email IS NOT NULL AND v_confirmed IS NOT NULL THEN
    SELECT * INTO v_invite FROM public.restaurant_invites i
    WHERE lower(trim(i.email)) = v_email AND i.status = 'pending' AND i.expires_at > now()
    ORDER BY i.created_at
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_invite.id IS NOT NULL THEN
    INSERT INTO public.user_restaurants (user_id, restaurant_id, role, role_id, is_default)
    VALUES (v_user_id, v_invite.restaurant_id, v_invite.role, v_invite.role_id, true);

    IF v_invite.location_id IS NOT NULL THEN
      INSERT INTO public.user_location_access (user_id, restaurant_id, location_id, created_by)
      VALUES (v_user_id, v_invite.restaurant_id, v_invite.location_id, v_invite.invited_by)
      ON CONFLICT DO NOTHING;
    END IF;

    IF v_invite.location_ids IS NOT NULL THEN
      FOREACH v_loc IN ARRAY v_invite.location_ids LOOP
        IF EXISTS (SELECT 1 FROM public.locations l
                    WHERE l.id = v_loc AND l.restaurant_id = v_invite.restaurant_id) THEN
          INSERT INTO public.user_location_access (user_id, restaurant_id, location_id, created_by)
          VALUES (v_user_id, v_invite.restaurant_id, v_loc, v_invite.invited_by)
          ON CONFLICT DO NOTHING;
        END IF;
      END LOOP;
    END IF;

    UPDATE public.restaurant_invites
      SET status = 'accepted', accepted_at = now(), accepted_by = v_user_id
      WHERE id = v_invite.id;

    RETURN jsonb_build_object('restaurant_id', v_invite.restaurant_id, 'role_id', v_invite.role_id,
                              'joined_via_invite', true, 'permissions', public.get_user_permissions());
  END IF;

  INSERT INTO public.restaurants (name) VALUES ('My First Restaurant')
  RETURNING id INTO v_restaurant_id;
  PERFORM public.create_default_roles(v_restaurant_id);
  SELECT id INTO v_role_id FROM public.roles
   WHERE restaurant_id = v_restaurant_id AND name = 'Owner' LIMIT 1;
  INSERT INTO public.user_restaurants (user_id, restaurant_id, role, role_id, is_default)
  VALUES (v_user_id, v_restaurant_id, 'owner', v_role_id, true);

  RETURN jsonb_build_object('restaurant_id', v_restaurant_id, 'role_id', v_role_id,
                            'permissions', public.get_user_permissions());
END; $$;

-- 5. Last-owner lockout guard
CREATE OR REPLACE FUNCTION public.guard_last_active_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_remaining int;
BEGIN
  IF NOT COALESCE(OLD.is_active, true)
     OR NOT EXISTS (
       SELECT 1 FROM public.roles r
       WHERE r.id = OLD.role_id AND (r.permissions->>'full_access')::boolean IS TRUE
     ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.is_active
     AND NEW.role_id IS NOT DISTINCT FROM OLD.role_id
     AND NEW.restaurant_id IS NOT DISTINCT FROM OLD.restaurant_id THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_remaining
  FROM public.user_restaurants ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.restaurant_id = OLD.restaurant_id
    AND ur.is_active
    AND ur.id <> OLD.id
    AND (r.permissions->>'full_access')::boolean IS TRUE;

  IF v_remaining = 0 THEN
    RAISE EXCEPTION 'Cannot deactivate, remove or demote the last owner of this restaurant'
      USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_guard_last_active_owner ON public.user_restaurants;
CREATE TRIGGER trg_guard_last_active_owner
BEFORE UPDATE OR DELETE ON public.user_restaurants
FOR EACH ROW EXECUTE FUNCTION public.guard_last_active_owner();

-- 6. Owner role keeps full access
CREATE OR REPLACE FUNCTION public.protect_owner_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF COALESCE(OLD.is_system_role, false) AND OLD.name = 'Owner' THEN
    NEW.name := OLD.name;
    NEW.permissions := OLD.permissions;
    NEW.is_system_role := true;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_protect_owner_role ON public.roles;
CREATE TRIGGER trg_protect_owner_role
BEFORE UPDATE ON public.roles
FOR EACH ROW EXECUTE FUNCTION public.protect_owner_role();