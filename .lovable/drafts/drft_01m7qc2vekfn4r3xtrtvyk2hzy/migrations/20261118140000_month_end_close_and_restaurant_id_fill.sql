-- Month-end financial completion checklist (per location + month) and
-- future-only restaurant_id fill for staff / recipe lines. Additive only:
-- no existing rows are read-modified, no columns dropped or changed.

-- 1. Checklist table
CREATE TABLE public.month_end_closes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  period_month date NOT NULL,
  items jsonb NOT NULL DEFAULT '{}'::jsonb,
  confirmed_at timestamptz,
  confirmed_by uuid,
  reopened_reason text,
  confirmation_skipped text[],
  confirmation_limitations text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (location_id, period_month)
);
CREATE INDEX month_end_closes_restaurant_month_idx ON public.month_end_closes (restaurant_id, period_month);

-- Read for finance/report viewers; writes ONLY through save_month_end_close.
GRANT SELECT ON public.month_end_closes TO authenticated;
GRANT ALL ON public.month_end_closes TO service_role;
ALTER TABLE public.month_end_closes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance and report viewers read month-end closes" ON public.month_end_closes
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_restaurant(restaurant_id)
         AND public.user_can_access_location(location_id)
         AND (public.user_is_owner() OR public.user_has_permission('finance','view')
              OR public.user_has_permission('reports','view')));

-- 1b. Append-only history: every save/confirm/reopen keeps who, when, skipped items and limitations.
CREATE TABLE public.month_end_close_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  close_id uuid NOT NULL REFERENCES public.month_end_closes(id) ON DELETE RESTRICT,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  period_month date NOT NULL,
  action text NOT NULL CHECK (action IN ('save','confirm','reopen')),
  item_key text,
  item_status text,
  skipped_items text[],
  limitations text,
  reason text,
  items_snapshot jsonb NOT NULL,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX month_end_close_events_close_idx ON public.month_end_close_events (close_id, created_at);
GRANT SELECT ON public.month_end_close_events TO authenticated;
GRANT ALL ON public.month_end_close_events TO service_role;
ALTER TABLE public.month_end_close_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance and report viewers read month-end history" ON public.month_end_close_events
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_restaurant(restaurant_id)
         AND public.user_can_access_location(location_id)
         AND (public.user_is_owner() OR public.user_has_permission('finance','view')
              OR public.user_has_permission('reports','view')));
-- No INSERT/UPDATE/DELETE policies or grants: written only by save_month_end_close, never edited.

-- 2. Save / confirm / reopen (Owner or Finance Edit; tenant + location checked).
-- p_action: 'save' (merge one item), 'confirm', 'reopen'.
CREATE OR REPLACE FUNCTION public.save_month_end_close(
  p_restaurant_id uuid, p_location_id uuid, p_period_month date,
  p_action text, p_item_key text DEFAULT NULL, p_item_status text DEFAULT NULL,
  p_note text DEFAULT NULL, p_reason text DEFAULT NULL,
  p_acknowledge_skipped boolean DEFAULT false, p_limitations text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_month date := date_trunc('month', p_period_month)::date;
  v_row public.month_end_closes;
  v_keys text[] := ARRAY['sales','payroll','supplier_invoices','expenses','overheads','stock_count','daily_review'];
  v_k text; v_s text;
  v_skipped text[] := ARRAY[]::text[];
  v_fin_skipped text[] := ARRAY[]::text[];
BEGIN
  PERFORM public.expense_finance_guard(p_restaurant_id);
  PERFORM public.expense_location_guard(p_restaurant_id, p_location_id, '');

  INSERT INTO public.month_end_closes (restaurant_id, location_id, period_month, updated_by)
  VALUES (p_restaurant_id, p_location_id, v_month, auth.uid())
  ON CONFLICT (location_id, period_month) DO NOTHING;
  SELECT * INTO v_row FROM public.month_end_closes
   WHERE location_id = p_location_id AND period_month = v_month FOR UPDATE;
  IF v_row.restaurant_id IS DISTINCT FROM p_restaurant_id THEN
    RAISE EXCEPTION 'Not authorized for this restaurant' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'save' THEN
    IF v_row.confirmed_at IS NOT NULL THEN
      RAISE EXCEPTION 'This month is confirmed — reopen it with a reason first' USING ERRCODE = '42501';
    END IF;
    IF p_item_key IS NULL OR NOT (p_item_key = ANY (v_keys)) THEN RAISE EXCEPTION 'Unknown checklist item'; END IF;
    IF p_item_status NOT IN ('todo','done','waiting','skipped') THEN RAISE EXCEPTION 'Invalid status'; END IF;
    IF p_item_key = 'sales' AND p_item_status = 'skipped' THEN RAISE EXCEPTION 'Sales cannot be skipped'; END IF;
    UPDATE public.month_end_closes
       SET items = items || jsonb_build_object(p_item_key, jsonb_build_object('status', p_item_status, 'note', NULLIF(btrim(p_note), ''))),
           updated_at = now(), updated_by = auth.uid()
     WHERE id = v_row.id;
  ELSIF p_action = 'confirm' THEN
    IF v_row.confirmed_at IS NOT NULL THEN RETURN v_row.id; END IF;
    FOREACH v_k IN ARRAY v_keys LOOP
      v_s := v_row.items -> v_k ->> 'status';
      IF v_s IS NULL OR v_s NOT IN ('done','skipped') THEN
        RAISE EXCEPTION 'Not ready for review: "%" is not done or skipped', v_k USING ERRCODE = '22023';
      END IF;
      IF v_s = 'skipped' THEN
        v_skipped := v_skipped || v_k;
        IF v_k IN ('payroll','supplier_invoices','expenses','overheads','stock_count') THEN v_fin_skipped := v_fin_skipped || v_k; END IF;
      END IF;
    END LOOP;
    IF cardinality(v_fin_skipped) > 0 AND (NOT coalesce(p_acknowledge_skipped, false) OR NULLIF(btrim(p_limitations), '') IS NULL) THEN
      RAISE EXCEPTION 'Skipped financial information (%) must be acknowledged with a note on limitations', array_to_string(v_fin_skipped, ', ') USING ERRCODE = '22023';
    END IF;
    UPDATE public.month_end_closes SET confirmed_at = now(), confirmed_by = auth.uid(),
           confirmation_skipped = v_skipped, confirmation_limitations = NULLIF(btrim(p_limitations), ''),
           updated_at = now(), updated_by = auth.uid()
     WHERE id = v_row.id;
  ELSIF p_action = 'reopen' THEN
    IF NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Give a reason to reopen this month'; END IF;
    IF v_row.confirmed_at IS NULL THEN RAISE EXCEPTION 'This month is not confirmed'; END IF;
    -- The previous confirmation (who, when, skipped, limitations) stays in month_end_close_events.
    UPDATE public.month_end_closes SET confirmed_at = NULL, confirmed_by = NULL, confirmation_skipped = NULL,
           confirmation_limitations = NULL, reopened_reason = p_reason,
           updated_at = now(), updated_by = auth.uid()
     WHERE id = v_row.id;
  ELSE
    RAISE EXCEPTION 'Unknown action';
  END IF;

  SELECT * INTO v_row FROM public.month_end_closes WHERE id = v_row.id;
  INSERT INTO public.month_end_close_events (close_id, restaurant_id, location_id, period_month, action, item_key, item_status,
    skipped_items, limitations, reason, items_snapshot, actor)
  VALUES (v_row.id, p_restaurant_id, p_location_id, v_month, p_action, p_item_key, p_item_status,
    CASE WHEN p_action = 'confirm' THEN v_skipped END, CASE WHEN p_action = 'confirm' THEN NULLIF(btrim(p_limitations), '') END,
    NULLIF(btrim(p_reason), ''), v_row.items, auth.uid());

  PERFORM public.log_audit_event(p_restaurant_id, 'month_end_close_' || p_action,
    'Month-end checklist ' || p_action || ' for ' || to_char(v_month, 'YYYY-MM'),
    jsonb_build_object('close_id', v_row.id, 'location_id', p_location_id, 'item', p_item_key, 'status', p_item_status, 'reason', p_reason, 'skipped', v_skipped, 'limitations', p_limitations));
  RETURN v_row.id;
END $$;
REVOKE ALL ON FUNCTION public.save_month_end_close(uuid, uuid, date, text, text, text, text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_month_end_close(uuid, uuid, date, text, text, text, text, text, boolean, text) TO authenticated;

-- 3. Future-only restaurant_id fill (never overwrites a supplied value, never touches existing rows).
CREATE OR REPLACE FUNCTION public.fill_staff_restaurant_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.restaurant_id IS NULL AND NEW.location_id IS NOT NULL THEN
    SELECT restaurant_id INTO NEW.restaurant_id FROM public.locations WHERE id = NEW.location_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_fill_staff_restaurant_id BEFORE INSERT ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.fill_staff_restaurant_id();

CREATE OR REPLACE FUNCTION public.fill_dish_ingredient_restaurant_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.restaurant_id IS NULL THEN
    SELECT restaurant_id INTO NEW.restaurant_id FROM public.dishes WHERE id = NEW.dish_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_fill_dish_ingredient_restaurant_id BEFORE INSERT ON public.dish_ingredients
  FOR EACH ROW EXECUTE FUNCTION public.fill_dish_ingredient_restaurant_id();
REVOKE ALL ON FUNCTION public.fill_staff_restaurant_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fill_dish_ingredient_restaurant_id() FROM PUBLIC, anon, authenticated;
