
CREATE OR REPLACE FUNCTION public.finance_guard(p_restaurant_id uuid, p_payments boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_trusted_backend_session() THEN RETURN; END IF;
  IF auth.uid() IS NULL OR NOT public.user_belongs_to_restaurant(p_restaurant_id)
     OR public.get_user_restaurant_id() IS DISTINCT FROM p_restaurant_id THEN
    RAISE EXCEPTION 'Not authorized for this restaurant' USING ERRCODE = '42501';
  END IF;
  IF p_payments THEN
    IF NOT (public.user_is_owner() OR public.user_has_permission('finance','edit')) THEN
      RAISE EXCEPTION 'Recording supplier payments needs Owner or Finance Edit permission' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public.can_edit_inventory() THEN
    RAISE EXCEPTION 'You need Inventory Edit permission for supplier invoices' USING ERRCODE = '42501';
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.finance_guard(uuid, boolean) FROM PUBLIC, anon, authenticated;
