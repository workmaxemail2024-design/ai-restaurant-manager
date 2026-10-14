
-- ============ Columns on existing tables ============
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS delivery_date date,
  ADD COLUMN IF NOT EXISTS received_by uuid;
ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS received_quantity numeric,
  ADD COLUMN IF NOT EXISTS received_unit_cost numeric;
ALTER TABLE public.stock_adjustments
  ADD COLUMN IF NOT EXISTS effective_date date,
  ADD COLUMN IF NOT EXISTS movement_id uuid;
ALTER TABLE public.stock_counts
  ADD COLUMN IF NOT EXISTS effective_at timestamptz;

-- ============ Ledger table ============
CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  movement_type text NOT NULL CHECK (movement_type IN ('opening_balance','receipt','waste','spoilage','damage','theft','staff_meal','other','count_correction','count_rebase','manual_correction','reversal')),
  quantity numeric NOT NULL CHECK (quantity <> 0),
  effective_at timestamptz NOT NULL,
  effective_date date NOT NULL,
  unit_cost numeric CHECK (unit_cost IS NULL OR unit_cost >= 0),
  cost_source text NOT NULL CHECK (cost_source IN ('dated_history','receipt_line','unknown','pre_ledger','inherited')),
  source_type text NOT NULL CHECK (source_type IN ('opening','purchase_order','adjustment','stock_count','reversal','rebase','manual')),
  source_id uuid,
  source_line_id uuid,
  reverses_movement_id uuid REFERENCES public.stock_movements(id) ON DELETE RESTRICT,
  rebase_of_movement_id uuid REFERENCES public.stock_movements(id) ON DELETE RESTRICT,
  anchor_count_id uuid,
  reason text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant read stock_movements" ON public.stock_movements FOR SELECT TO authenticated
  USING (public.user_belongs_to_restaurant(restaurant_id));
CREATE POLICY "Location scope restrict" ON public.stock_movements AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.user_can_access_location(location_id));

CREATE UNIQUE INDEX stock_movements_source_line_uq ON public.stock_movements(source_type, source_line_id)
  WHERE source_line_id IS NOT NULL AND movement_type NOT IN ('count_rebase','reversal');
CREATE UNIQUE INDEX stock_movements_reverses_uq ON public.stock_movements(reverses_movement_id) WHERE reverses_movement_id IS NOT NULL;
CREATE INDEX stock_movements_item_time_idx ON public.stock_movements(ingredient_id, location_id, effective_at);
CREATE INDEX stock_movements_rest_date_idx ON public.stock_movements(restaurant_id, effective_date);

CREATE OR REPLACE FUNCTION public.stock_movements_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF public.is_trusted_backend_session() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'Stock movements are permanent. Use a reversal instead.' USING ERRCODE = '42501';
END; $$;
CREATE TRIGGER trg_stock_movements_immutable BEFORE UPDATE OR DELETE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.stock_movements_immutable();

CREATE OR REPLACE FUNCTION public.stock_movements_tenant_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.locations WHERE id = NEW.location_id AND restaurant_id = NEW.restaurant_id) THEN
    RAISE EXCEPTION 'Location does not belong to this restaurant';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ingredients WHERE id = NEW.ingredient_id AND restaurant_id = NEW.restaurant_id) THEN
    RAISE EXCEPTION 'Item does not belong to this restaurant';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_stock_movements_tenant BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.stock_movements_tenant_check();

-- ============ Lock down direct writes to stock state ============
CREATE POLICY "Ledger-only insert" ON public.stock_levels AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_trusted_backend_session());
CREATE POLICY "Ledger-only update" ON public.stock_levels AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.is_trusted_backend_session());
CREATE POLICY "Ledger-only delete" ON public.stock_levels AS RESTRICTIVE FOR DELETE TO authenticated USING (public.is_trusted_backend_session());
CREATE POLICY "Ledger-only insert" ON public.stock_adjustments AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_trusted_backend_session());
CREATE POLICY "Ledger-only update" ON public.stock_adjustments AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.is_trusted_backend_session());
CREATE POLICY "Ledger-only delete" ON public.stock_adjustments AS RESTRICTIVE FOR DELETE TO authenticated USING (public.is_trusted_backend_session());
CREATE POLICY "Ledger-only insert" ON public.stock_counts AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_trusted_backend_session());
CREATE POLICY "Ledger-only update" ON public.stock_counts AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.is_trusted_backend_session());
CREATE POLICY "Ledger-only delete" ON public.stock_counts AS RESTRICTIVE FOR DELETE TO authenticated USING (public.is_trusted_backend_session());
CREATE POLICY "Ledger-only insert" ON public.stock_count_lines AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_trusted_backend_session());
CREATE POLICY "Ledger-only update" ON public.stock_count_lines AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.is_trusted_backend_session());
CREATE POLICY "Ledger-only delete" ON public.stock_count_lines AS RESTRICTIVE FOR DELETE TO authenticated USING (public.is_trusted_backend_session());

-- Receiving fields on purchase orders can only be set by the receiving functions
CREATE OR REPLACE FUNCTION public.guard_po_receiving_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF public.is_trusted_backend_session() OR current_setting('app.ledger_write', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.received_at IS NOT NULL OR NEW.status IN ('received','completed') OR NEW.delivery_date IS NOT NULL THEN
      RAISE EXCEPTION 'Use Receive delivery to mark goods as received' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.received_at IS DISTINCT FROM OLD.received_at
     OR NEW.delivery_date IS DISTINCT FROM OLD.delivery_date
     OR NEW.received_by IS DISTINCT FROM OLD.received_by
     OR (NEW.status IS DISTINCT FROM OLD.status AND (NEW.status IN ('received','completed') OR OLD.status IN ('received','completed'))) THEN
    RAISE EXCEPTION 'Use Receive delivery to mark goods as received' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_guard_po_receiving BEFORE INSERT OR UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_po_receiving_fields();

CREATE OR REPLACE FUNCTION public.guard_po_item_receiving_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF public.is_trusted_backend_session() OR current_setting('app.ledger_write', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.received_quantity IS NOT NULL OR NEW.received_unit_cost IS NOT NULL THEN
      RAISE EXCEPTION 'Received quantities are set by Receive delivery' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.received_quantity IS DISTINCT FROM OLD.received_quantity OR NEW.received_unit_cost IS DISTINCT FROM OLD.received_unit_cost THEN
      RAISE EXCEPTION 'Received quantities are set by Receive delivery' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') AND EXISTS (SELECT 1 FROM public.purchase_orders WHERE id = OLD.purchase_order_id AND received_at IS NOT NULL) THEN
    RAISE EXCEPTION 'This delivery is already received; use a stock reversal instead' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
CREATE TRIGGER trg_guard_po_item_receiving BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_po_item_receiving_fields();

-- Retire the dormant purchase trigger so receipts only enter through the ledger
DROP TRIGGER IF EXISTS trigger_update_stock_on_purchase ON public.purchase_orders;

-- ============ Helpers ============
CREATE OR REPLACE FUNCTION public.ledger_effective_at(p_date date, p_end_of_day boolean DEFAULT false)
RETURNS timestamptz LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE WHEN p_date IS NULL OR p_date >= CURRENT_DATE THEN now()
              WHEN p_end_of_day THEN (p_date::timestamp + time '23:00') AT TIME ZONE 'UTC'
              ELSE (p_date::timestamp + time '12:00') AT TIME ZONE 'UTC' END
$$;

CREATE OR REPLACE FUNCTION public.ledger_stock_unit_cost(p_ingredient_id uuid, p_date date)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_base numeric; v_unit text; v_f numeric;
BEGIN
  SELECT unit::text INTO v_unit FROM public.ingredients WHERE id = p_ingredient_id;
  SELECT cost INTO v_base FROM public.get_ingredient_cost_at_date(p_ingredient_id, p_date);
  v_f := public.unit_factor(v_unit);
  IF v_base IS NULL OR v_f IS NULL THEN RETURN NULL; END IF;
  RETURN v_base * v_f;
END; $$;

CREATE OR REPLACE FUNCTION public.ledger_balance_at(p_ingredient_id uuid, p_location_id uuid, p_at timestamptz)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(quantity), 0) FROM public.stock_movements
   WHERE ingredient_id = p_ingredient_id AND location_id = p_location_id AND effective_at <= p_at
$$;

CREATE OR REPLACE FUNCTION public.ledger_guard(p_restaurant_id uuid, p_location_id uuid, p_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_trusted_backend_session() THEN RETURN; END IF;
  IF auth.uid() IS NULL OR NOT public.user_belongs_to_restaurant(p_restaurant_id) THEN
    RAISE EXCEPTION 'Not authorized for this restaurant' USING ERRCODE = '42501';
  END IF;
  IF public.get_user_restaurant_id() IS DISTINCT FROM p_restaurant_id THEN
    RAISE EXCEPTION 'Switch to this restaurant before changing its stock' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_edit_inventory() THEN
    RAISE EXCEPTION 'You need Inventory Edit permission to change stock' USING ERRCODE = '42501';
  END IF;
  IF NOT public.user_can_access_location(p_location_id) THEN
    RAISE EXCEPTION 'No access to this location' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.locations WHERE id = p_location_id AND restaurant_id = p_restaurant_id) THEN
    RAISE EXCEPTION 'Location does not belong to this restaurant';
  END IF;
  IF p_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Stock movements cannot be dated in the future';
  END IF;
  PERFORM public.assert_day_open(p_restaurant_id, p_location_id, p_date);
END; $$;

-- Core writer: inserts the movement, keeps stock_levels = ledger sum, re-anchors later counts.
CREATE OR REPLACE FUNCTION public.ledger_apply_movement(
  p_restaurant_id uuid, p_location_id uuid, p_ingredient_id uuid, p_type text, p_qty numeric,
  p_at timestamptz, p_unit_cost numeric, p_cost_source text, p_source_type text,
  p_source_id uuid, p_source_line_id uuid, p_reverses uuid, p_reason text, p_own_count_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_anchor record; v_rebase uuid;
BEGIN
  IF p_qty IS NULL OR p_qty = 0 THEN RETURN NULL; END IF;
  INSERT INTO public.stock_movements(restaurant_id, location_id, ingredient_id, movement_type, quantity,
    effective_at, effective_date, unit_cost, cost_source, source_type, source_id, source_line_id,
    reverses_movement_id, reason, anchor_count_id)
  VALUES (p_restaurant_id, p_location_id, p_ingredient_id, p_type, p_qty,
    p_at, (p_at AT TIME ZONE 'UTC')::date, p_unit_cost, p_cost_source, p_source_type, p_source_id, p_source_line_id,
    p_reverses, p_reason, p_own_count_id)
  RETURNING id INTO v_id;

  INSERT INTO public.stock_levels(ingredient_id, location_id, quantity, restaurant_id, updated_at)
  VALUES (p_ingredient_id, p_location_id, p_qty, p_restaurant_id, now())
  ON CONFLICT (ingredient_id, location_id)
  DO UPDATE SET quantity = public.stock_levels.quantity + EXCLUDED.quantity, updated_at = now();

  -- Re-anchor: the earliest later count for this item keeps its counted balance.
  IF p_type NOT IN ('count_rebase','opening_balance') THEN
    SELECT c.id, c.effective_at INTO v_anchor
      FROM public.stock_count_lines l JOIN public.stock_counts c ON c.id = l.count_id
     WHERE l.ingredient_id = p_ingredient_id AND c.location_id = p_location_id
       AND c.effective_at IS NOT NULL
       AND (CASE WHEN p_own_count_id IS NOT NULL THEN c.effective_at > p_at AND c.id <> p_own_count_id
                 ELSE c.effective_at >= p_at END)
     ORDER BY c.effective_at ASC, c.created_at ASC LIMIT 1;
    IF FOUND THEN
      INSERT INTO public.stock_movements(restaurant_id, location_id, ingredient_id, movement_type, quantity,
        effective_at, effective_date, unit_cost, cost_source, source_type, source_id, rebase_of_movement_id,
        anchor_count_id, reason)
      VALUES (p_restaurant_id, p_location_id, p_ingredient_id, 'count_rebase', -p_qty,
        v_anchor.effective_at, (v_anchor.effective_at AT TIME ZONE 'UTC')::date, p_unit_cost, 'inherited',
        'rebase', v_anchor.id, v_id, v_anchor.id,
        'Auto-adjusted: an earlier-dated entry was recorded after this count')
      RETURNING id INTO v_rebase;
      UPDATE public.stock_levels SET quantity = quantity - p_qty, updated_at = now()
       WHERE ingredient_id = p_ingredient_id AND location_id = p_location_id;
    END IF;
  END IF;
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.ledger_apply_movement(uuid,uuid,uuid,text,numeric,timestamptz,numeric,text,text,uuid,uuid,uuid,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ledger_guard(uuid,uuid,date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ledger_balance_at(uuid,uuid,timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ledger_stock_unit_cost(uuid,date) FROM PUBLIC, anon;

-- ============ Public write functions ============
CREATE OR REPLACE FUNCTION public.record_stock_adjustment(
  p_ingredient_id uuid, p_location_id uuid, p_adjustment_type text, p_quantity numeric,
  p_effective_date date, p_reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rest uuid; v_mov uuid; v_adj uuid; v_type text; v_at timestamptz; v_date date;
BEGIN
  SELECT restaurant_id INTO v_rest FROM public.ingredients WHERE id = p_ingredient_id;
  IF v_rest IS NULL THEN RAISE EXCEPTION 'Item not found'; END IF;
  v_date := COALESCE(p_effective_date, CURRENT_DATE);
  PERFORM public.ledger_guard(v_rest, p_location_id, v_date);
  IF p_adjustment_type NOT IN ('waste','spoilage','theft','damage','other','correction','staff_meal') THEN
    RAISE EXCEPTION 'Unknown adjustment type %', p_adjustment_type;
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;
  v_type := CASE p_adjustment_type WHEN 'correction' THEN 'manual_correction' ELSE p_adjustment_type END;
  v_at := public.ledger_effective_at(v_date);
  INSERT INTO public.stock_adjustments(ingredient_id, location_id, restaurant_id, adjustment_type, quantity, reason, adjusted_by, effective_date)
  VALUES (p_ingredient_id, p_location_id, v_rest,
          CASE WHEN p_adjustment_type = 'staff_meal' THEN 'other' ELSE p_adjustment_type END,
          p_quantity, p_reason, auth.uid()::text, v_date)
  RETURNING id INTO v_adj;
  v_mov := public.ledger_apply_movement(v_rest, p_location_id, p_ingredient_id, v_type, -p_quantity, v_at,
    public.ledger_stock_unit_cost(p_ingredient_id, v_date),
    CASE WHEN public.ledger_stock_unit_cost(p_ingredient_id, v_date) IS NULL THEN 'unknown' ELSE 'dated_history' END,
    'adjustment', v_adj, v_adj, NULL, p_reason);
  UPDATE public.stock_adjustments SET movement_id = v_mov WHERE id = v_adj;
  RETURN v_mov;
END; $$;

CREATE OR REPLACE FUNCTION public.set_stock_quantity(
  p_ingredient_id uuid, p_location_id uuid, p_new_quantity numeric, p_reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rest uuid; v_cur numeric; v_delta numeric;
BEGIN
  SELECT restaurant_id INTO v_rest FROM public.ingredients WHERE id = p_ingredient_id;
  IF v_rest IS NULL THEN RAISE EXCEPTION 'Item not found'; END IF;
  PERFORM public.ledger_guard(v_rest, p_location_id, CURRENT_DATE);
  IF p_new_quantity IS NULL THEN RAISE EXCEPTION 'Enter a quantity'; END IF;
  SELECT COALESCE(quantity, 0) INTO v_cur FROM public.stock_levels WHERE ingredient_id = p_ingredient_id AND location_id = p_location_id;
  v_delta := p_new_quantity - COALESCE(v_cur, 0);
  RETURN public.ledger_apply_movement(v_rest, p_location_id, p_ingredient_id, 'manual_correction', v_delta, now(),
    public.ledger_stock_unit_cost(p_ingredient_id, CURRENT_DATE),
    CASE WHEN public.ledger_stock_unit_cost(p_ingredient_id, CURRENT_DATE) IS NULL THEN 'unknown' ELSE 'dated_history' END,
    'manual', NULL, NULL, NULL, COALESCE(p_reason, 'Stock level set manually'));
END; $$;

CREATE OR REPLACE FUNCTION public.submit_stock_count(
  p_location_id uuid, p_count_date date, p_scope_type text, p_scope_value text, p_notes text, p_lines jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rest uuid; v_count uuid; v_at timestamptz; l jsonb; v_ing uuid; v_counted numeric;
        v_expected numeric; v_line uuid; v_mov uuid; v_diff numeric; v_cost numeric;
BEGIN
  SELECT restaurant_id INTO v_rest FROM public.locations WHERE id = p_location_id;
  IF v_rest IS NULL THEN RAISE EXCEPTION 'Location not found'; END IF;
  PERFORM public.ledger_guard(v_rest, p_location_id, COALESCE(p_count_date, CURRENT_DATE));
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN RAISE EXCEPTION 'Add at least one counted item'; END IF;
  PERFORM set_config('app.ledger_write', 'on', true);
  v_at := public.ledger_effective_at(COALESCE(p_count_date, CURRENT_DATE), true);
  INSERT INTO public.stock_counts(restaurant_id, location_id, count_date, scope_type, scope_value, status, notes, effective_at)
  VALUES (v_rest, p_location_id, COALESCE(p_count_date, CURRENT_DATE), COALESCE(p_scope_type,'all'), p_scope_value, 'submitted', p_notes, v_at)
  RETURNING id INTO v_count;
  FOR l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_ing := public.import_juuid(l->'ingredient_id');
    v_counted := public.import_jnum(l->'counted_quantity');
    IF v_ing IS NULL OR v_counted IS NULL THEN RAISE EXCEPTION 'Each counted line needs an item and quantity'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ingredients WHERE id = v_ing AND restaurant_id = v_rest) THEN RAISE EXCEPTION 'Item not in this restaurant'; END IF;
    v_expected := public.ledger_balance_at(v_ing, p_location_id, v_at);
    INSERT INTO public.stock_count_lines(count_id, ingredient_id, location_id, restaurant_id, expected_quantity, counted_quantity)
    VALUES (v_count, v_ing, p_location_id, v_rest, v_expected, v_counted) RETURNING id INTO v_line;
    v_diff := v_counted - v_expected;
    IF v_diff <> 0 THEN
      v_cost := public.ledger_stock_unit_cost(v_ing, COALESCE(p_count_date, CURRENT_DATE));
      v_mov := public.ledger_apply_movement(v_rest, p_location_id, v_ing, 'count_correction', v_diff, v_at,
        v_cost, CASE WHEN v_cost IS NULL THEN 'unknown' ELSE 'dated_history' END,
        'stock_count', v_count, v_line, NULL, 'Stock count ' || COALESCE(p_count_date, CURRENT_DATE)::text, v_count);
      INSERT INTO public.stock_adjustments(ingredient_id, location_id, restaurant_id, adjustment_type, quantity, reason, count_id, adjusted_by, effective_date, movement_id)
      VALUES (v_ing, p_location_id, v_rest, 'count', abs(v_diff),
        'Stock count ' || COALESCE(p_count_date, CURRENT_DATE)::text || COALESCE(' — ' || NULLIF(p_notes,''), ''),
        v_count, auth.uid()::text, COALESCE(p_count_date, CURRENT_DATE), v_mov);
    END IF;
  END LOOP;
  RETURN v_count;
END; $$;

CREATE OR REPLACE FUNCTION public.receive_purchase_order(
  p_purchase_order_id uuid, p_delivery_date date, p_lines jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_po record; l jsonb; v_item record; v_qty numeric; v_cost numeric; v_at timestamptz; v_n int := 0;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_purchase_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
  IF p_delivery_date IS NULL THEN RAISE EXCEPTION 'Enter the date the goods physically arrived'; END IF;
  PERFORM public.ledger_guard(v_po.restaurant_id, v_po.location_id, p_delivery_date);
  IF v_po.received_at IS NOT NULL OR v_po.status IN ('received','completed') THEN
    RAISE EXCEPTION 'This delivery has already been received' USING ERRCODE = '23505';
  END IF;
  IF v_po.status = 'cancelled' THEN RAISE EXCEPTION 'This order is cancelled'; END IF;
  IF jsonb_typeof(p_lines) <> 'array' THEN RAISE EXCEPTION 'Malformed delivery lines'; END IF;
  PERFORM set_config('app.ledger_write', 'on', true);
  v_at := public.ledger_effective_at(p_delivery_date);
  FOR l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    SELECT * INTO v_item FROM public.purchase_order_items
     WHERE id = public.import_juuid(l->'item_id') AND purchase_order_id = p_purchase_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Delivery line does not belong to this order'; END IF;
    v_qty := public.import_jnum(l->'received_quantity');
    v_cost := public.import_jnum(l->'unit_cost');
    IF v_qty IS NULL OR v_qty < 0 THEN RAISE EXCEPTION 'Received quantity must be zero or more'; END IF;
    IF v_cost IS NOT NULL AND v_cost < 0 THEN RAISE EXCEPTION 'Unit cost cannot be negative'; END IF;
    UPDATE public.purchase_order_items SET received_quantity = v_qty, received_unit_cost = v_cost WHERE id = v_item.id;
    IF v_qty > 0 THEN
      PERFORM public.ledger_apply_movement(v_po.restaurant_id, v_po.location_id, v_item.ingredient_id, 'receipt', v_qty, v_at,
        v_cost, CASE WHEN v_cost IS NULL THEN 'unknown' ELSE 'receipt_line' END,
        'purchase_order', p_purchase_order_id, v_item.id, NULL, 'Delivery received');
      v_n := v_n + 1;
    END IF;
  END LOOP;
  UPDATE public.purchase_orders SET status = 'received', received_at = now(), delivery_date = p_delivery_date,
         received_by = auth.uid() WHERE id = p_purchase_order_id;
  PERFORM public.log_audit_event(v_po.restaurant_id, 'inventory_correction', 'Delivery received',
    jsonb_build_object('purchase_order_id', p_purchase_order_id, 'delivery_date', p_delivery_date, 'lines', v_n));
  RETURN p_purchase_order_id;
END; $$;

CREATE OR REPLACE FUNCTION public.receive_direct_delivery(
  p_supplier_id uuid, p_location_id uuid, p_delivery_date date, p_lines jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rest uuid; v_po uuid; l jsonb; v_ing uuid; v_qty numeric; v_lines jsonb := '[]'::jsonb; v_item uuid;
BEGIN
  SELECT restaurant_id INTO v_rest FROM public.locations WHERE id = p_location_id;
  IF v_rest IS NULL THEN RAISE EXCEPTION 'Location not found'; END IF;
  PERFORM public.ledger_guard(v_rest, p_location_id, COALESCE(p_delivery_date, CURRENT_DATE));
  IF p_supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = p_supplier_id AND restaurant_id = v_rest) THEN
    RAISE EXCEPTION 'Supplier not in this restaurant';
  END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN RAISE EXCEPTION 'Add at least one delivered item'; END IF;
  INSERT INTO public.purchase_orders(supplier_id, location_id, restaurant_id, order_date, status)
  VALUES (p_supplier_id, p_location_id, v_rest, p_delivery_date, 'pending') RETURNING id INTO v_po;
  FOR l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_ing := public.import_juuid(l->'ingredient_id');
    v_qty := public.import_jnum(l->'quantity');
    IF v_ing IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'Each line needs an item and a quantity above zero'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ingredients WHERE id = v_ing AND restaurant_id = v_rest) THEN RAISE EXCEPTION 'Item not in this restaurant'; END IF;
    INSERT INTO public.purchase_order_items(purchase_order_id, ingredient_id, quantity, cost_price, restaurant_id)
    VALUES (v_po, v_ing, v_qty, COALESCE(public.import_jnum(l->'unit_cost'), 0), v_rest) RETURNING id INTO v_item;
    v_lines := v_lines || jsonb_build_object('item_id', v_item, 'received_quantity', v_qty, 'unit_cost', l->'unit_cost');
  END LOOP;
  PERFORM public.receive_purchase_order(v_po, p_delivery_date, v_lines);
  RETURN v_po;
END; $$;

CREATE OR REPLACE FUNCTION public.reverse_stock_movement(p_movement_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; v_id uuid;
BEGIN
  SELECT * INTO o FROM public.stock_movements WHERE id = p_movement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movement not found'; END IF;
  PERFORM public.ledger_guard(o.restaurant_id, o.location_id, o.effective_date);
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'Give a reason for the reversal'; END IF;
  IF o.movement_type IN ('count_rebase','count_correction','reversal','opening_balance') THEN
    RAISE EXCEPTION 'This entry cannot be reversed. Record a new stock count instead.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.stock_movements WHERE reverses_movement_id = p_movement_id) THEN
    RAISE EXCEPTION 'This entry has already been reversed' USING ERRCODE = '23505';
  END IF;
  v_id := public.ledger_apply_movement(o.restaurant_id, o.location_id, o.ingredient_id, 'reversal', -o.quantity, o.effective_at,
    o.unit_cost, 'inherited', 'reversal', o.id, NULL, o.id, p_reason);
  PERFORM public.log_audit_event(o.restaurant_id, 'inventory_correction', 'Stock entry reversed',
    jsonb_build_object('movement_id', o.id, 'reversal_id', v_id, 'reason', p_reason, 'quantity', o.quantity, 'type', o.movement_type));
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.stock_ledger_drift(p_restaurant_id uuid)
RETURNS TABLE(ingredient_id uuid, location_id uuid, stock_level numeric, ledger_total numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH l AS (SELECT ingredient_id, location_id, SUM(quantity) q FROM public.stock_movements WHERE restaurant_id = p_restaurant_id GROUP BY 1,2),
       s AS (SELECT ingredient_id, location_id, quantity q FROM public.stock_levels WHERE restaurant_id = p_restaurant_id
             OR location_id IN (SELECT id FROM public.locations WHERE restaurant_id = p_restaurant_id))
  SELECT COALESCE(s.ingredient_id, l.ingredient_id), COALESCE(s.location_id, l.location_id), COALESCE(s.q,0), COALESCE(l.q,0)
    FROM s FULL JOIN l ON l.ingredient_id = s.ingredient_id AND l.location_id = s.location_id
   WHERE COALESCE(s.q,0) <> COALESCE(l.q,0)
     AND (public.is_trusted_backend_session() OR public.user_belongs_to_restaurant(p_restaurant_id))
$$;

REVOKE ALL ON FUNCTION public.record_stock_adjustment(uuid,uuid,text,numeric,date,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_stock_quantity(uuid,uuid,numeric,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_stock_count(uuid,date,text,text,text,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid,date,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.receive_direct_delivery(uuid,uuid,date,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reverse_stock_movement(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stock_ledger_drift(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_stock_adjustment(uuid,uuid,text,numeric,date,text),
  public.set_stock_quantity(uuid,uuid,numeric,text), public.submit_stock_count(uuid,date,text,text,text,jsonb),
  public.receive_purchase_order(uuid,date,jsonb), public.receive_direct_delivery(uuid,uuid,date,jsonb),
  public.reverse_stock_movement(uuid,text), public.stock_ledger_drift(uuid),
  public.ledger_balance_at(uuid,uuid,timestamptz), public.ledger_stock_unit_cost(uuid,date) TO authenticated;

-- ============ Opening balance backfill (no invented history) ============
INSERT INTO public.stock_movements(restaurant_id, location_id, ingredient_id, movement_type, quantity, effective_at, effective_date,
  unit_cost, cost_source, source_type, source_id, reason, created_by)
SELECT COALESCE(sl.restaurant_id, loc.restaurant_id), sl.location_id, sl.ingredient_id, 'opening_balance', sl.quantity,
       now(), CURRENT_DATE, NULL, 'pre_ledger', 'opening', sl.id, 'Stock on hand when the ledger started', NULL
  FROM public.stock_levels sl JOIN public.locations loc ON loc.id = sl.location_id
 WHERE sl.quantity <> 0
   AND NOT EXISTS (SELECT 1 FROM public.stock_movements m WHERE m.source_type = 'opening' AND m.source_id = sl.id);
