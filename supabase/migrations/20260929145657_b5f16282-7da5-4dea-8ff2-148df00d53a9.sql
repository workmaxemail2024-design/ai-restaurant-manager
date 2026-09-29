ALTER TABLE public.dishes
  ADD COLUMN base_dish_id uuid NULL REFERENCES public.dishes(id) ON DELETE RESTRICT,
  ADD COLUMN recipe_multiplier numeric NULL;
CREATE INDEX IF NOT EXISTS idx_dishes_base_dish_id ON public.dishes(base_dish_id);

ALTER TABLE public.dish_ingredients
  ADD COLUMN cost_mode text NOT NULL DEFAULT 'inventory',
  ADD COLUMN manual_line_cost numeric NULL,
  ADD COLUMN manual_cost_effective_from date NULL,
  ADD COLUMN manual_cost_set_by uuid NULL,
  ADD COLUMN manual_cost_set_at timestamptz NULL;
ALTER TABLE public.dish_ingredients ADD CONSTRAINT dish_ingredients_cost_mode_chk CHECK (cost_mode IN ('inventory','manual'));

CREATE OR REPLACE FUNCTION public.assert_dish_access(p_dish_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rest uuid;
BEGIN
  IF public.is_trusted_backend_session() THEN RETURN; END IF;
  SELECT restaurant_id INTO v_rest FROM public.dishes WHERE id = p_dish_id;
  IF v_rest IS NULL THEN RETURN; END IF;
  IF v_rest IS DISTINCT FROM public.get_user_restaurant_id() THEN
    RAISE EXCEPTION 'not authorized for this dish';
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.assert_dish_access(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.recipe_lines_for_dish(p_dish_id uuid)
RETURNS TABLE(line_id uuid, ingredient_id uuid, quantity numeric, unit text, cost_mode text,
              manual_line_cost numeric, manual_cost_effective_from date, source_dish_id uuid, factor numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cur uuid := p_dish_id; v_factor numeric := 1; v_base uuid; v_mult numeric; v_direct boolean; i int := 0;
BEGIN
  PERFORM public.assert_dish_access(p_dish_id);
  LOOP
    SELECT d.base_dish_id, d.recipe_multiplier, d.use_direct_cost INTO v_base, v_mult, v_direct FROM public.dishes d WHERE d.id = v_cur;
    EXIT WHEN v_base IS NULL;
    i := i + 1;
    IF i > 5 OR v_mult IS NULL OR v_mult <= 0 THEN RETURN; END IF;
    v_factor := v_factor * v_mult; v_cur := v_base;
  END LOOP;
  IF v_cur <> p_dish_id AND v_direct IS TRUE THEN RETURN; END IF;
  RETURN QUERY SELECT di.id, di.ingredient_id, di.quantity * v_factor, di.unit, di.cost_mode,
    CASE WHEN di.manual_line_cost IS NULL THEN NULL ELSE di.manual_line_cost * v_factor END,
    di.manual_cost_effective_from, v_cur, v_factor
  FROM public.dish_ingredients di WHERE di.dish_id = v_cur;
END; $$;
REVOKE ALL ON FUNCTION public.recipe_lines_for_dish(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recipe_lines_for_dish(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.validate_dish_recipe_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b RECORD; v_cur uuid; i int := 0;
BEGIN
  IF NEW.base_dish_id IS NULL THEN NEW.recipe_multiplier := NULL; RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.base_dish_id IS NOT DISTINCT FROM OLD.base_dish_id
     AND NEW.recipe_multiplier IS NOT DISTINCT FROM OLD.recipe_multiplier THEN RETURN NEW; END IF;
  IF NEW.recipe_multiplier IS NULL OR NEW.recipe_multiplier <= 0 THEN RAISE EXCEPTION 'Recipe multiplier must be greater than 0'; END IF;
  IF NEW.base_dish_id = NEW.id THEN RAISE EXCEPTION 'A dish cannot be based on itself'; END IF;
  SELECT restaurant_id, archived_at, merged_into_id INTO b FROM public.dishes WHERE id = NEW.base_dish_id;
  IF NOT FOUND OR b.restaurant_id IS DISTINCT FROM NEW.restaurant_id THEN RAISE EXCEPTION 'Base dish must belong to the same restaurant'; END IF;
  IF b.archived_at IS NOT NULL OR b.merged_into_id IS NOT NULL THEN RAISE EXCEPTION 'Base dish is archived or merged'; END IF;
  v_cur := NEW.base_dish_id;
  WHILE v_cur IS NOT NULL LOOP
    i := i + 1;
    IF v_cur = NEW.id THEN RAISE EXCEPTION 'Circular recipe link is not allowed'; END IF;
    IF i > 5 THEN RAISE EXCEPTION 'Recipe links can be at most 5 levels deep'; END IF;
    SELECT base_dish_id INTO v_cur FROM public.dishes WHERE id = v_cur;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.dish_ingredients WHERE dish_id = NEW.id) THEN
    RAISE EXCEPTION 'Remove this dish''s own recipe lines before linking it to another dish'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_validate_dish_recipe_link BEFORE INSERT OR UPDATE OF base_dish_id, recipe_multiplier ON public.dishes
  FOR EACH ROW EXECUTE FUNCTION public.validate_dish_recipe_link();

CREATE OR REPLACE FUNCTION public.guard_dish_ingredient_line()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.dishes WHERE id = NEW.dish_id AND base_dish_id IS NOT NULL) THEN
    RAISE EXCEPTION 'This dish uses a linked recipe. Convert it to its own recipe before editing ingredients.';
  END IF;
  IF NEW.cost_mode = 'manual' THEN
    IF NEW.manual_line_cost IS NULL OR NEW.manual_line_cost < 0 THEN RAISE EXCEPTION 'Manual line cost must be 0 or more'; END IF;
    IF NEW.manual_cost_effective_from IS NULL THEN NEW.manual_cost_effective_from := CURRENT_DATE; END IF;
  END IF;
  IF NEW.manual_cost_effective_from IS NOT NULL AND NEW.manual_cost_effective_from > CURRENT_DATE THEN
    RAISE EXCEPTION 'Manual cost effective date cannot be in the future';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.manual_line_cost IS DISTINCT FROM OLD.manual_line_cost
     OR NEW.manual_cost_effective_from IS DISTINCT FROM OLD.manual_cost_effective_from THEN
    IF NEW.manual_line_cost IS NOT NULL THEN NEW.manual_cost_set_by := auth.uid(); NEW.manual_cost_set_at := now(); END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_guard_dish_ingredient_line BEFORE INSERT OR UPDATE ON public.dish_ingredients
  FOR EACH ROW EXECUTE FUNCTION public.guard_dish_ingredient_line();

CREATE OR REPLACE FUNCTION public.relink_on_dish_merge()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.merged_into_id IS NOT NULL AND OLD.merged_into_id IS NULL THEN
    UPDATE public.dishes SET base_dish_id = NEW.merged_into_id WHERE base_dish_id = NEW.id AND id <> NEW.merged_into_id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_relink_on_dish_merge AFTER UPDATE OF merged_into_id ON public.dishes
  FOR EACH ROW EXECUTE FUNCTION public.relink_on_dish_merge();

CREATE OR REPLACE FUNCTION public.convert_linked_recipe(p_dish_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_rest uuid; v_n int;
BEGIN
  SELECT restaurant_id INTO v_rest FROM public.dishes WHERE id = p_dish_id AND base_dish_id IS NOT NULL;
  IF v_rest IS NULL THEN RAISE EXCEPTION 'Dish is not linked or not accessible'; END IF;
  CREATE TEMP TABLE _cl_lines ON COMMIT DROP AS SELECT * FROM public.recipe_lines_for_dish(p_dish_id);
  UPDATE public.dishes SET base_dish_id = NULL, recipe_multiplier = NULL WHERE id = p_dish_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not allowed to edit this dish'; END IF;
  INSERT INTO public.dish_ingredients (dish_id, ingredient_id, quantity, unit, restaurant_id, needs_unit_review,
                                       cost_mode, manual_line_cost, manual_cost_effective_from)
    SELECT p_dish_id, l.ingredient_id, l.quantity, l.unit, v_rest, false, l.cost_mode, l.manual_line_cost, l.manual_cost_effective_from
    FROM _cl_lines l;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  DROP TABLE IF EXISTS _cl_lines;
  RETURN v_n;
END; $$;
REVOKE ALL ON FUNCTION public.convert_linked_recipe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_linked_recipe(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.calculate_dish_cost(p_dish_id uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_use_direct boolean; v_direct numeric; v_count integer := 0; v_total numeric := 0; v_qty numeric; r RECORD;
BEGIN
  PERFORM public.assert_dish_access(p_dish_id);
  SELECT use_direct_cost, direct_cost INTO v_use_direct, v_direct FROM public.dishes WHERE id = p_dish_id;
  IF v_use_direct IS TRUE THEN
    IF v_direct IS NULL OR v_direct <= 0 THEN RETURN NULL; END IF;
    RETURN ROUND(v_direct, 2);
  END IF;
  FOR r IN SELECT * FROM public.recipe_lines_for_dish(p_dish_id) LOOP
    v_count := v_count + 1;
    IF r.cost_mode = 'manual' AND r.manual_line_cost IS NOT NULL THEN
      v_total := v_total + r.manual_line_cost;
    ELSE
      v_qty := public.convert_recipe_qty(r.ingredient_id, r.quantity, r.unit);
      IF v_qty IS NULL THEN RETURN NULL; END IF;
      v_total := v_total + v_qty * public.get_ingredient_base_cost(r.ingredient_id);
    END IF;
  END LOOP;
  IF v_count = 0 THEN RETURN NULL; END IF;
  RETURN ROUND(v_total, 2);
END; $function$;

CREATE OR REPLACE FUNCTION public.calculate_dish_cost_at_date(p_dish_id uuid, p_date date)
RETURNS TABLE (cost numeric, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_use_direct boolean; v_direct numeric; v_rest uuid; v_caller uuid;
  v_total numeric := 0; v_count integer := 0;
  v_qty numeric; v_line numeric; v_hist boolean; v_all_hist boolean := true; r RECORD;
BEGIN
  SELECT use_direct_cost, direct_cost, restaurant_id INTO v_use_direct, v_direct, v_rest FROM public.dishes WHERE id = p_dish_id;
  IF v_rest IS NULL THEN RETURN QUERY SELECT NULL::numeric, 'unknown'; RETURN; END IF;
  IF NOT public.is_trusted_backend_session() THEN
    v_caller := public.get_user_restaurant_id();
    IF v_caller IS NULL OR v_caller <> v_rest THEN RAISE EXCEPTION 'not authorized for this dish'; END IF;
  END IF;
  IF v_use_direct IS TRUE THEN
    IF v_direct IS NULL OR v_direct <= 0 THEN RETURN QUERY SELECT NULL::numeric, 'unknown'; RETURN; END IF;
    RETURN QUERY SELECT ROUND(v_direct, 2), 'fallback'; RETURN;
  END IF;
  FOR r IN SELECT * FROM public.recipe_lines_for_dish(p_dish_id) LOOP
    v_count := v_count + 1;
    IF r.cost_mode = 'manual' AND r.manual_line_cost IS NOT NULL
       AND r.manual_cost_effective_from IS NOT NULL AND p_date >= r.manual_cost_effective_from THEN
      v_all_hist := false;
      v_total := v_total + r.manual_line_cost;
    ELSE
      v_qty := public.convert_recipe_qty(r.ingredient_id, r.quantity, r.unit);
      IF v_qty IS NULL THEN RETURN QUERY SELECT NULL::numeric, 'unknown'; RETURN; END IF;
      SELECT c.cost, c.is_historical INTO v_line, v_hist FROM public.get_ingredient_cost_at_date(r.ingredient_id, p_date) c;
      IF v_line IS NULL THEN RETURN QUERY SELECT NULL::numeric, 'unknown'; RETURN; END IF;
      IF NOT v_hist THEN v_all_hist := false; END IF;
      v_total := v_total + v_qty * v_line;
    END IF;
  END LOOP;
  IF v_count = 0 THEN RETURN QUERY SELECT NULL::numeric, 'unknown'; RETURN; END IF;
  RETURN QUERY SELECT ROUND(v_total,2), CASE WHEN v_all_hist THEN 'historical' ELSE 'fallback' END;
END; $$;

CREATE OR REPLACE FUNCTION public.calculate_dish_margin(p_dish_id uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_price numeric; v_cost numeric;
BEGIN
  PERFORM public.assert_dish_access(p_dish_id);
  SELECT selling_price INTO v_price FROM public.dishes WHERE id = p_dish_id;
  v_cost := public.calculate_dish_cost(p_dish_id);
  IF v_cost IS NULL OR v_price IS NULL OR v_price <= 0 THEN RETURN NULL; END IF;
  RETURN ROUND(((v_price - v_cost) / v_price) * 100, 2);
END; $$;

CREATE OR REPLACE FUNCTION public.get_theoretical_usage_impl(p_location_id uuid DEFAULT NULL::uuid, p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date)
 RETURNS TABLE(ingredient_id uuid, ingredient_name text, base_unit text, quantity_used numeric, cost numeric, dishes_sold numeric, usage_source text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH sold AS (
    SELECT s.dish_id, SUM(s.quantity) AS qty FROM public.sales s
    WHERE s.restaurant_id = public.get_user_restaurant_id()
      AND (p_location_id IS NULL OR s.location_id = p_location_id)
      AND (p_start IS NULL OR s.sale_date >= p_start)
      AND (p_end   IS NULL OR s.sale_date <= p_end)
    GROUP BY s.dish_id
  ), lines AS (
    SELECT i.id AS ing_id, i.name AS ing_name, public.get_ingredient_cost_unit(i.id) AS cost_unit,
      so.qty AS sold,
      public.convert_recipe_qty(i.id, rl.quantity, rl.unit) AS conv,
      CASE WHEN rl.cost_mode = 'manual' AND rl.manual_line_cost IS NOT NULL
             THEN so.qty * rl.manual_line_cost
           WHEN public.convert_recipe_qty(i.id, rl.quantity, rl.unit) IS NULL THEN NULL
           ELSE so.qty * public.convert_recipe_qty(i.id, rl.quantity, rl.unit) * public.get_ingredient_base_cost(i.id)
      END AS line_cost
    FROM sold so
    CROSS JOIN LATERAL public.recipe_lines_for_dish(so.dish_id) rl
    JOIN public.ingredients i ON i.id = rl.ingredient_id
  )
  SELECT ing_id, ing_name, COALESCE(cost_unit, 'unknown'),
    CASE WHEN bool_or(conv IS NULL) THEN NULL ELSE SUM(sold * conv)::numeric END,
    CASE WHEN bool_or(line_cost IS NULL) THEN NULL ELSE SUM(line_cost)::numeric END,
    SUM(sold)::numeric,
    CASE WHEN bool_or(conv IS NULL) THEN 'recipe_needs_review' ELSE 'recipe' END
  FROM lines GROUP BY ing_id, ing_name, cost_unit
  UNION ALL
  SELECT i.id, i.name, COALESCE(public.get_ingredient_cost_unit(i.id), 'each'),
    SUM(s.quantity)::numeric, (SUM(s.quantity) * public.get_ingredient_base_cost(i.id))::numeric,
    SUM(s.quantity)::numeric, 'direct_sale'
  FROM public.sales s JOIN public.ingredients i ON i.linked_dish_id = s.dish_id
  WHERE i.item_type = 'direct_sale'
    AND s.restaurant_id = public.get_user_restaurant_id()
    AND (p_location_id IS NULL OR s.location_id = p_location_id)
    AND (p_start IS NULL OR s.sale_date >= p_start)
    AND (p_end   IS NULL OR s.sale_date <= p_end)
  GROUP BY i.id, i.name
  ORDER BY 4 DESC NULLS FIRST;
$function$;

CREATE OR REPLACE FUNCTION public.recipe_qty_in_stock_unit(p_ingredient_id uuid, p_quantity numeric, p_unit text)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p_quantity IS NULL OR public.normalize_unit(p_unit) IS NULL
      OR public.normalize_unit(p_unit) IS DISTINCT FROM public.normalize_unit(i.unit::text)
      OR COALESCE(public.unit_factor(i.unit::text), 0) = 0 THEN NULL
    ELSE p_quantity * public.unit_factor(p_unit) / public.unit_factor(i.unit::text) END
  FROM public.ingredients i WHERE i.id = p_ingredient_id;
$$;
REVOKE ALL ON FUNCTION public.recipe_qty_in_stock_unit(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recipe_qty_in_stock_unit(uuid, numeric, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reduce_stock_on_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE r RECORD; v_q numeric;
BEGIN
  FOR r IN SELECT * FROM public.recipe_lines_for_dish(NEW.dish_id) LOOP
    v_q := public.recipe_qty_in_stock_unit(r.ingredient_id, r.quantity, r.unit);
    IF v_q IS NULL THEN
      INSERT INTO public.pos_sync_logs(location_id, restaurant_id, pos_provider, event_type, status, message, details)
      VALUES (NEW.location_id, NEW.restaurant_id, 'internal', 'stock_unit_mismatch', 'warning',
              'Recipe unit incompatible with stock unit; stock not reduced',
              jsonb_build_object('sale_id', NEW.id, 'ingredient_id', r.ingredient_id, 'unit', r.unit));
    ELSE
      UPDATE public.stock_levels sl SET quantity = GREATEST(0, sl.quantity - v_q * NEW.quantity), updated_at = now()
      WHERE sl.ingredient_id = r.ingredient_id AND sl.location_id = NEW.location_id;
    END IF;
  END LOOP;
  RETURN NEW;
END; $function$;