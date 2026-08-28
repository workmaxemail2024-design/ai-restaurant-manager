-- =========================================================
-- Pilot Hardening Stage 1: Authorization & Tenant Security
-- =========================================================

-- ---------- Helper functions ----------

CREATE OR REPLACE FUNCTION public.user_is_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((public.get_user_permissions()->>'full_access')::boolean, false);
$$;

CREATE OR REPLACE FUNCTION public.restaurant_has_members(_restaurant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_restaurants WHERE restaurant_id = _restaurant_id);
$$;

-- Extract the owning restaurant id from a documents storage object path
-- Expected layout: restaurant/<restaurant_uuid>/location/<x>/document/<id>/<filename>
CREATE OR REPLACE FUNCTION public.storage_doc_restaurant_id(_name text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  parts text[];
BEGIN
  IF _name IS NULL THEN RETURN NULL; END IF;
  parts := string_to_array(_name, '/');
  IF COALESCE(array_length(parts, 1), 0) < 2 OR parts[1] <> 'restaurant' THEN
    RETURN NULL;
  END IF;
  BEGIN
    RETURN parts[2]::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
END;
$$;

-- ---------- B1: storage tenant isolation ----------

DROP POLICY IF EXISTS "Users can view documents from their restaurant" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload documents to their restaurant" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete documents from their restaurant" ON storage.objects;
DROP POLICY IF EXISTS "Users can update documents from their restaurant" ON storage.objects;

CREATE POLICY "documents_tenant_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND public.user_belongs_to_restaurant(public.storage_doc_restaurant_id(name))
);

CREATE POLICY "documents_tenant_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND public.user_belongs_to_restaurant(public.storage_doc_restaurant_id(name))
);

CREATE POLICY "documents_tenant_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'documents'
  AND public.user_belongs_to_restaurant(public.storage_doc_restaurant_id(name))
)
WITH CHECK (
  bucket_id = 'documents'
  AND public.user_belongs_to_restaurant(public.storage_doc_restaurant_id(name))
);

CREATE POLICY "documents_tenant_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'documents'
  AND public.user_belongs_to_restaurant(public.storage_doc_restaurant_id(name))
);

-- ---------- B2: roles ----------

DROP POLICY IF EXISTS "Tenant access to roles" ON public.roles;

CREATE POLICY "roles_member_select" ON public.roles
FOR SELECT TO authenticated
USING (public.user_belongs_to_restaurant(restaurant_id));

CREATE POLICY "roles_admin_insert" ON public.roles
FOR INSERT TO authenticated
WITH CHECK (
  public.user_belongs_to_restaurant(restaurant_id)
  AND public.user_has_permission('settings', 'admin')
);

CREATE POLICY "roles_admin_update" ON public.roles
FOR UPDATE TO authenticated
USING (
  public.user_belongs_to_restaurant(restaurant_id)
  AND public.user_has_permission('settings', 'admin')
)
WITH CHECK (
  public.user_belongs_to_restaurant(restaurant_id)
  AND public.user_has_permission('settings', 'admin')
);

CREATE POLICY "roles_admin_delete" ON public.roles
FOR DELETE TO authenticated
USING (
  public.user_belongs_to_restaurant(restaurant_id)
  AND public.user_has_permission('settings', 'admin')
  AND COALESCE(is_system_role, false) = false
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.roles TO authenticated;
GRANT ALL ON public.roles TO service_role;

-- ---------- B2: user_restaurants (membership / ownership) ----------

DROP POLICY IF EXISTS "Users can view their linkages" ON public.user_restaurants;
DROP POLICY IF EXISTS "Users can insert their linkages" ON public.user_restaurants;
DROP POLICY IF EXISTS "Users can update their linkages" ON public.user_restaurants;

CREATE POLICY "membership_select" ON public.user_restaurants
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR (public.user_belongs_to_restaurant(restaurant_id) AND public.user_has_permission('settings', 'admin'))
);

-- Bootstrap of a brand-new restaurant (no members yet) OR an admin adding a member
CREATE POLICY "membership_insert" ON public.user_restaurants
FOR INSERT TO authenticated
WITH CHECK (
  (user_id = auth.uid() AND NOT public.restaurant_has_members(restaurant_id))
  OR (public.user_belongs_to_restaurant(restaurant_id) AND public.user_has_permission('settings', 'admin'))
);

-- Self update is allowed only for the default-restaurant flag (enforced by trigger below)
CREATE POLICY "membership_update" ON public.user_restaurants
FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR (public.user_belongs_to_restaurant(restaurant_id) AND public.user_has_permission('settings', 'admin'))
)
WITH CHECK (
  user_id = auth.uid()
  OR (public.user_belongs_to_restaurant(restaurant_id) AND public.user_has_permission('settings', 'admin'))
);

CREATE POLICY "membership_delete" ON public.user_restaurants
FOR DELETE TO authenticated
USING (
  public.user_belongs_to_restaurant(restaurant_id)
  AND public.user_has_permission('settings', 'admin')
  AND user_id <> auth.uid()
);

CREATE OR REPLACE FUNCTION public.enforce_membership_authorization()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- service_role / SECURITY DEFINER bootstrap paths have no auth.uid()
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.user_belongs_to_restaurant(NEW.restaurant_id)
     AND public.user_has_permission('settings', 'admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id <> auth.uid() OR public.restaurant_has_members(NEW.restaurant_id) THEN
      RAISE EXCEPTION 'Not authorised to create this restaurant membership' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE by a non-admin: only their own row, only the default flag
  IF OLD.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorised to modify another user membership' USING ERRCODE = '42501';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id
     OR NEW.role_id IS DISTINCT FROM OLD.role_id
     OR NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Not authorised to change role or restaurant assignment' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_membership_authorization ON public.user_restaurants;
CREATE TRIGGER trg_enforce_membership_authorization
BEFORE INSERT OR UPDATE ON public.user_restaurants
FOR EACH ROW EXECUTE FUNCTION public.enforce_membership_authorization();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_restaurants TO authenticated;
GRANT ALL ON public.user_restaurants TO service_role;

-- ---------- B2: restaurants ----------

DROP POLICY IF EXISTS "Users can update their restaurants" ON public.restaurants;

CREATE POLICY "restaurants_admin_update" ON public.restaurants
FOR UPDATE TO authenticated
USING (public.user_belongs_to_restaurant(id) AND public.user_has_permission('settings', 'admin'))
WITH CHECK (public.user_belongs_to_restaurant(id) AND public.user_has_permission('settings', 'admin'));

-- ---------- B2: staff + pay fields ----------

DROP POLICY IF EXISTS "tenant_access_policy" ON public.staff;
DROP POLICY IF EXISTS "Tenant access to staff" ON public.staff;

CREATE POLICY "staff_privileged_select" ON public.staff
FOR SELECT TO authenticated
USING (
  restaurant_id IS NOT NULL
  AND public.user_belongs_to_restaurant(restaurant_id)
  AND (public.user_is_manager_or_owner() OR public.user_has_permission('staff', 'admin'))
);

CREATE POLICY "staff_edit_insert" ON public.staff
FOR INSERT TO authenticated
WITH CHECK (
  public.user_belongs_to_restaurant(restaurant_id)
  AND public.user_has_permission('staff', 'edit')
);

CREATE POLICY "staff_edit_update" ON public.staff
FOR UPDATE TO authenticated
USING (
  public.user_belongs_to_restaurant(restaurant_id)
  AND public.user_has_permission('staff', 'edit')
)
WITH CHECK (
  public.user_belongs_to_restaurant(restaurant_id)
  AND public.user_has_permission('staff', 'edit')
);

CREATE POLICY "staff_admin_delete" ON public.staff
FOR DELETE TO authenticated
USING (
  public.user_belongs_to_restaurant(restaurant_id)
  AND public.user_has_permission('staff', 'admin')
);

CREATE OR REPLACE FUNCTION public.enforce_staff_pay_authorization()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.user_has_permission('staff', 'admin') OR public.user_has_permission('finance', 'admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.hourly_rate, 0) <> 0 OR NEW.annual_salary IS NOT NULL THEN
      RAISE EXCEPTION 'Not authorised to set staff pay details' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.hourly_rate IS DISTINCT FROM OLD.hourly_rate
     OR NEW.annual_salary IS DISTINCT FROM OLD.annual_salary
     OR NEW.pay_type IS DISTINCT FROM OLD.pay_type THEN
    RAISE EXCEPTION 'Not authorised to change staff pay details' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_staff_pay_authorization ON public.staff;
CREATE TRIGGER trg_enforce_staff_pay_authorization
BEFORE INSERT OR UPDATE ON public.staff
FOR EACH ROW EXECUTE FUNCTION public.enforce_staff_pay_authorization();

-- staff_safe keeps working for everyone else (security_invoker view needs base access,
-- so recreate it as a security definer view that enforces tenancy itself)
DROP VIEW IF EXISTS public.staff_safe;
CREATE VIEW public.staff_safe AS
SELECT s.id,
    s.restaurant_id,
    s.location_id,
    s.first_name,
    s.last_name,
    s.role,
    s.status,
    s.captiva_operator_code,
    s.contract_type,
    s.max_hours_per_week,
    s.min_hours_per_week,
    s.pay_type,
    s.department,
    s.created_at,
    s.updated_at,
    CASE WHEN public.user_is_manager_or_owner() THEN s.email ELSE NULL::text END AS email,
    CASE WHEN public.user_is_manager_or_owner() THEN s.phone ELSE NULL::text END AS phone,
    CASE WHEN public.user_is_manager_or_owner() THEN s.hourly_rate ELSE NULL::numeric END AS hourly_rate,
    CASE WHEN public.user_is_manager_or_owner() THEN s.annual_salary ELSE NULL::numeric END AS annual_salary
FROM public.staff s
WHERE public.user_belongs_to_restaurant(s.restaurant_id);

GRANT SELECT ON public.staff_safe TO authenticated;
GRANT ALL ON public.staff_safe TO service_role;

-- ---------- B2: POS credentials ----------

DROP POLICY IF EXISTS "Users can view own restaurant POS integrations" ON public.pos_integrations;

CREATE POLICY "pos_integrations_admin_select" ON public.pos_integrations
FOR SELECT TO authenticated
USING (
  public.user_belongs_to_restaurant(restaurant_id)
  AND public.user_can_view_pos_credentials()
);

DROP VIEW IF EXISTS public.pos_integrations_safe;
CREATE VIEW public.pos_integrations_safe AS
SELECT p.id,
    p.restaurant_id,
    p.location_id,
    p.pos_provider,
    p.status,
    p.webhook_url,
    p.last_sync_time,
    p.last_tested_at,
    p.last_test_status,
    p.last_test_error,
    p.last_sync_attempt_at,
    p.last_successful_sync_at,
    p.last_sync_status,
    p.last_sync_error,
    p.created_at,
    p.updated_at,
    (p.api_key IS NOT NULL) AS has_api_key,
    (p.api_secret IS NOT NULL) AS has_api_secret
FROM public.pos_integrations p
WHERE public.user_belongs_to_restaurant(p.restaurant_id);

GRANT SELECT ON public.pos_integrations_safe TO authenticated;
GRANT ALL ON public.pos_integrations_safe TO service_role;

-- ---------- B2: overheads (financial administration) ----------
-- These four policies were granted to PUBLIC with qual `true` => cross-tenant read/write hole.
DROP POLICY IF EXISTS "service_role_can_read_overheads" ON public.overheads;
DROP POLICY IF EXISTS "service_role_can_insert_overheads" ON public.overheads;
DROP POLICY IF EXISTS "service_role_can_update_overheads" ON public.overheads;
DROP POLICY IF EXISTS "service_role_can_delete_overheads" ON public.overheads;
DROP POLICY IF EXISTS "Tenant access to overheads" ON public.overheads;

CREATE POLICY "overheads_member_select" ON public.overheads
FOR SELECT TO authenticated
USING (public.user_belongs_to_restaurant(restaurant_id));

CREATE POLICY "overheads_finance_insert" ON public.overheads
FOR INSERT TO authenticated
WITH CHECK (
  public.user_belongs_to_restaurant(restaurant_id)
  AND public.user_has_permission('finance', 'edit')
);

CREATE POLICY "overheads_finance_update" ON public.overheads
FOR UPDATE TO authenticated
USING (
  public.user_belongs_to_restaurant(restaurant_id)
  AND public.user_has_permission('finance', 'edit')
)
WITH CHECK (
  public.user_belongs_to_restaurant(restaurant_id)
  AND public.user_has_permission('finance', 'edit')
);

CREATE POLICY "overheads_finance_delete" ON public.overheads
FOR DELETE TO authenticated
USING (
  public.user_belongs_to_restaurant(restaurant_id)
  AND public.user_has_permission('finance', 'edit')
);

CREATE POLICY "overheads_service_role_all" ON public.overheads
FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------- B2: destructive dish / product actions ----------

DROP POLICY IF EXISTS "tenant_access_policy" ON public.dishes;
DROP POLICY IF EXISTS "Tenant access to dishes" ON public.dishes;

CREATE POLICY "dishes_member_select" ON public.dishes
FOR SELECT TO authenticated
USING (restaurant_id IS NULL OR public.user_belongs_to_restaurant(restaurant_id));

CREATE POLICY "dishes_edit_insert" ON public.dishes
FOR INSERT TO authenticated
WITH CHECK (
  public.user_belongs_to_restaurant(restaurant_id)
  AND public.user_has_permission('menu', 'edit')
);

CREATE POLICY "dishes_edit_update" ON public.dishes
FOR UPDATE TO authenticated
USING (
  public.user_belongs_to_restaurant(restaurant_id)
  AND public.user_has_permission('menu', 'edit')
)
WITH CHECK (
  public.user_belongs_to_restaurant(restaurant_id)
  AND public.user_has_permission('menu', 'edit')
);

CREATE POLICY "dishes_admin_delete" ON public.dishes
FOR DELETE TO authenticated
USING (
  public.user_belongs_to_restaurant(restaurant_id)
  AND public.user_has_permission('menu', 'admin')
);

DROP POLICY IF EXISTS "Tenant delete external_pos_items" ON public.external_pos_items;
CREATE POLICY "external_pos_items_admin_delete" ON public.external_pos_items
FOR DELETE TO authenticated
USING (
  public.user_belongs_to_restaurant(restaurant_id)
  AND public.user_has_permission('menu', 'admin')
);

-- ---------- B2 + B8: audit logs ----------

DROP POLICY IF EXISTS "Tenant access to audit_logs" ON public.audit_logs;

CREATE POLICY "audit_logs_privileged_select" ON public.audit_logs
FOR SELECT TO authenticated
USING (
  public.user_belongs_to_restaurant(restaurant_id)
  AND public.user_is_manager_or_owner()
);

CREATE POLICY "audit_logs_service_role_all" ON public.audit_logs
FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

-- ---------- B2 + B8: notifications ----------

DROP POLICY IF EXISTS "Tenant access to notifications" ON public.notifications;

CREATE POLICY "notifications_member_select" ON public.notifications
FOR SELECT TO authenticated
USING (public.user_belongs_to_restaurant(restaurant_id));

CREATE POLICY "notifications_member_update" ON public.notifications
FOR UPDATE TO authenticated
USING (public.user_belongs_to_restaurant(restaurant_id))
WITH CHECK (public.user_belongs_to_restaurant(restaurant_id));

CREATE POLICY "notifications_member_delete" ON public.notifications
FOR DELETE TO authenticated
USING (public.user_belongs_to_restaurant(restaurant_id));

CREATE POLICY "notifications_service_role_all" ON public.notifications
FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE INSERT ON public.notifications FROM authenticated;
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

-- ---------- B8: harden SECURITY DEFINER helpers ----------

CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_restaurant_id uuid,
  p_event_type text,
  p_description text,
  p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_audit_id uuid;
BEGIN
  IF p_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'restaurant_id is required' USING ERRCODE = '22023';
  END IF;

  -- Callers authenticated as a user may only log against their own restaurant.
  IF auth.uid() IS NOT NULL AND NOT public.user_belongs_to_restaurant(p_restaurant_id) THEN
    RAISE EXCEPTION 'Not authorised to log events for this restaurant' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.audit_logs (restaurant_id, user_id, event_type, description, data)
  VALUES (p_restaurant_id, auth.uid(), p_event_type, p_description, COALESCE(p_data, '{}'::jsonb))
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_notification(
  p_restaurant_id uuid,
  p_title text,
  p_message text,
  p_type text DEFAULT 'info'::text,
  p_user_id uuid DEFAULT NULL::uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_notification_id uuid;
BEGIN
  IF p_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'restaurant_id is required' USING ERRCODE = '22023';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.user_belongs_to_restaurant(p_restaurant_id) THEN
    RAISE EXCEPTION 'Not authorised to create notifications for this restaurant' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.notifications (restaurant_id, user_id, type, title, message, metadata)
  VALUES (p_restaurant_id, p_user_id, p_type, p_title, p_message, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_audit_event(uuid, text, text, jsonb) FROM anon;
