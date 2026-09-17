-- 0. Re-runnability: lift history immutability for the duration of this migration
DROP TRIGGER IF EXISTS trg_ingredient_prices_immutable ON public.ingredient_prices;

-- 1. Effective dating + normalised cost on the EXISTING history table
ALTER TABLE public.ingredient_prices
  ADD COLUMN IF NOT EXISTS effective_date      date,
  ADD COLUMN IF NOT EXISTS cost_per_base_unit  numeric,
  ADD COLUMN IF NOT EXISTS base_unit           text,
  ADD COLUMN IF NOT EXISTS pack_size           numeric,
  ADD COLUMN IF NOT EXISTS pack_unit           text,
  ADD COLUMN IF NOT EXISTS cost_per_pack       numeric,
  ADD COLUMN IF NOT EXISTS source              text,
  ADD COLUMN IF NOT EXISTS revision            integer,
  ADD COLUMN IF NOT EXISTS note                text,
  ADD COLUMN IF NOT EXISTS created_by          uuid;

UPDATE public.ingredient_prices SET effective_date = created_at::date WHERE effective_date IS NULL;
UPDATE public.ingredient_prices SET source = 'legacy' WHERE source IS NULL;
UPDATE public.ingredient_prices SET revision = 0 WHERE revision IS NULL;

ALTER TABLE public.ingredient_prices
  ALTER COLUMN effective_date SET DEFAULT CURRENT_DATE,
  ALTER COLUMN effective_date SET NOT NULL,
  ALTER COLUMN source SET DEFAULT 'manual',
  ALTER COLUMN source SET NOT NULL,
  ALTER COLUMN revision SET DEFAULT 0,
  ALTER COLUMN revision SET NOT NULL;

ALTER TABLE public.ingredient_prices DROP CONSTRAINT IF EXISTS ingredient_prices_source_chk;
ALTER TABLE public.ingredient_prices ADD CONSTRAINT ingredient_prices_source_chk
  CHECK (source IN ('seed_current','legacy','manual','purchase','backdated'));

ALTER TABLE public.ingredient_prices DROP CONSTRAINT IF EXISTS ingredient_prices_base_cost_chk;
ALTER TABLE public.ingredient_prices ADD CONSTRAINT ingredient_prices_base_cost_chk
  CHECK (cost_per_base_unit IS NULL OR cost_per_base_unit >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ingredient_prices_effective_revision
  ON public.ingredient_prices (ingredient_id, effective_date, revision);

CREATE INDEX IF NOT EXISTS idx_ingredient_prices_lookup
  ON public.ingredient_prices (ingredient_id, effective_date DESC, revision DESC, created_at DESC);

-- 2. Backfill normalised cost on pre-existing (legacy) rows. NULL stays NULL.
UPDATE public.ingredient_prices p
   SET cost_per_base_unit = CASE
         WHEN p.cost_price IS NULL OR p.cost_price <= 0 THEN NULL
         ELSE p.cost_price / NULLIF(public.unit_factor(i.unit::text), 0) END,
       base_unit = public.get_ingredient_cost_unit(i.id)
  FROM public.ingredients i
 WHERE i.id = p.ingredient_id AND p.cost_per_base_unit IS NULL;

-- 3. Freeze today's effective cost as the open-ended baseline (stored value, never recomputed)
INSERT INTO public.ingredient_prices
  (ingredient_id, restaurant_id, cost_price, effective_date, revision,
   cost_per_base_unit, base_unit, pack_size, pack_unit, cost_per_pack, source)
SELECT i.id, i.restaurant_id, COALESCE(i.default_cost_price, 0), DATE '1900-01-01', 0,
       NULLIF(public.get_ingredient_base_cost(i.id), 0),
       public.get_ingredient_cost_unit(i.id),
       i.pack_size, i.pack_unit, i.cost_per_pack, 'seed_current'
  FROM public.ingredients i
 WHERE NOT EXISTS (SELECT 1 FROM public.ingredient_prices p
                    WHERE p.ingredient_id = i.id AND p.source = 'seed_current');

-- 4. Shared insert helper: next revision for that ingredient/date
CREATE OR REPLACE FUNCTION public.insert_ingredient_price_row(
  p_ingredient_id uuid, p_effective_date date, p_source text,
  p_cost_price numeric, p_cost_per_base_unit numeric,
  p_pack_size numeric, p_pack_unit text, p_cost_per_pack numeric,
  p_note text DEFAULT NULL, p_created_by uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rev integer; v_rest uuid; v_id uuid;
BEGIN
  SELECT restaurant_id INTO v_rest FROM public.ingredients WHERE id = p_ingredient_id;
  SELECT COALESCE(MAX(revision), -1) + 1 INTO v_rev
    FROM public.ingredient_prices
   WHERE ingredient_id = p_ingredient_id AND effective_date = p_effective_date;

  INSERT INTO public.ingredient_prices
    (ingredient_id, restaurant_id, cost_price, effective_date, revision,
     cost_per_base_unit, base_unit, pack_size, pack_unit, cost_per_pack,
     source, note, created_by)
  VALUES (p_ingredient_id, v_rest, COALESCE(p_cost_price, 0), p_effective_date, v_rev,
          p_cost_per_base_unit, public.get_ingredient_cost_unit(p_ingredient_id),
          p_pack_size, p_pack_unit, p_cost_per_pack, p_source, p_note, p_created_by)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.insert_ingredient_price_row(uuid, date, text, numeric, numeric, numeric, text, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_ingredient_price_row(uuid, date, text, numeric, numeric, numeric, text, numeric, text, uuid) TO service_role;

-- 5. Ordinary cost edits create a dated history row effective today
CREATE OR REPLACE FUNCTION public.record_ingredient_price_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_base numeric;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.default_cost_price IS NOT DISTINCT FROM OLD.default_cost_price
     AND NEW.cost_per_pack      IS NOT DISTINCT FROM OLD.cost_per_pack
     AND NEW.pack_size          IS NOT DISTINCT FROM OLD.pack_size
     AND NEW.pack_unit          IS NOT DISTINCT FROM OLD.pack_unit
     AND NEW.unit               IS NOT DISTINCT FROM OLD.unit
  THEN RETURN NEW; END IF;

  v_base := NULLIF(public.get_ingredient_base_cost(NEW.id), 0);
  IF v_base IS NULL THEN RETURN NEW; END IF;

  PERFORM public.insert_ingredient_price_row(
    NEW.id, CURRENT_DATE, 'manual', COALESCE(NEW.default_cost_price, 0), v_base,
    NEW.pack_size, NEW.pack_unit, NEW.cost_per_pack, NULL, auth.uid());
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_ingredient_price_history ON public.ingredients;
CREATE TRIGGER trg_ingredient_price_history
AFTER INSERT OR UPDATE ON public.ingredients
FOR EACH ROW EXECUTE FUNCTION public.record_ingredient_price_history();

-- 6. Explicit backdated price entry (owner / manager), always a NEW row
CREATE OR REPLACE FUNCTION public.add_ingredient_price(
  p_ingredient_id uuid,
  p_effective_date date,
  p_cost_per_pack numeric DEFAULT NULL,
  p_pack_size numeric DEFAULT NULL,
  p_pack_unit text DEFAULT NULL,
  p_unit_cost numeric DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rest uuid; v_base numeric; v_factor numeric; v_id uuid; v_src text;
BEGIN
  SELECT restaurant_id INTO v_rest FROM public.ingredients WHERE id = p_ingredient_id;
  IF v_rest IS NULL THEN RAISE EXCEPTION 'ingredient not found'; END IF;
  IF v_rest <> COALESCE(public.get_user_restaurant_id(), '00000000-0000-0000-0000-000000000000'::uuid)
     OR NOT public.user_is_manager_or_owner() THEN
    RAISE EXCEPTION 'not authorized to add ingredient price history';
  END IF;
  IF p_effective_date IS NULL THEN RAISE EXCEPTION 'effective date is required'; END IF;
  IF p_effective_date > CURRENT_DATE THEN RAISE EXCEPTION 'effective date cannot be in the future'; END IF;

  IF p_cost_per_pack IS NOT NULL AND p_pack_size IS NOT NULL AND p_pack_size > 0 THEN
    v_factor := public.unit_factor(COALESCE(p_pack_unit,
                  (SELECT pack_unit FROM public.ingredients WHERE id = p_ingredient_id)));
    v_base := p_cost_per_pack / (p_pack_size * NULLIF(COALESCE(v_factor, 1), 0));
  ELSIF p_unit_cost IS NOT NULL THEN
    v_base := p_unit_cost / NULLIF(public.unit_factor(
                (SELECT unit::text FROM public.ingredients WHERE id = p_ingredient_id)), 0);
  END IF;

  IF v_base IS NULL OR v_base <= 0 THEN RAISE EXCEPTION 'a positive cost is required'; END IF;

  v_src := CASE WHEN p_effective_date < CURRENT_DATE THEN 'backdated' ELSE 'manual' END;

  v_id := public.insert_ingredient_price_row(
            p_ingredient_id, p_effective_date, v_src,
            COALESCE(p_unit_cost, v_base), v_base,
            p_pack_size, p_pack_unit, p_cost_per_pack, p_note, auth.uid());

  PERFORM public.log_audit_event(v_rest, 'ingredient_price_history_added',
    'Ingredient price recorded effective ' || p_effective_date::text,
    jsonb_build_object('ingredient_id', p_ingredient_id, 'price_id', v_id,
                       'effective_date', p_effective_date, 'cost_per_base_unit', v_base,
                       'source', v_src, 'note', p_note));
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.add_ingredient_price(uuid, date, numeric, numeric, text, numeric, text) TO authenticated, service_role;

-- 7. Date-aware ingredient cost: dated history -> frozen baseline -> unknown
CREATE OR REPLACE FUNCTION public.get_ingredient_cost_at_date(
  p_ingredient_id uuid, p_date date
) RETURNS TABLE (cost numeric, is_historical boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cost numeric; v_rest uuid; v_caller uuid;
BEGIN
  SELECT restaurant_id INTO v_rest FROM public.ingredients WHERE id = p_ingredient_id;
  IF v_rest IS NULL THEN RETURN QUERY SELECT NULL::numeric, false; RETURN; END IF;
  IF NOT public.is_trusted_backend_session() THEN
    v_caller := public.get_user_restaurant_id();
    IF v_caller IS NULL OR v_caller <> v_rest THEN
      RAISE EXCEPTION 'not authorized for this ingredient';
    END IF;
  END IF;

  SELECT p.cost_per_base_unit INTO v_cost
    FROM public.ingredient_prices p
   WHERE p.ingredient_id = p_ingredient_id
     AND p.effective_date <= COALESCE(p_date, CURRENT_DATE)
     AND p.cost_per_base_unit IS NOT NULL
     AND p.source IN ('manual','purchase','backdated')
   ORDER BY p.effective_date DESC, p.revision DESC, p.created_at DESC LIMIT 1;
  IF v_cost IS NOT NULL THEN RETURN QUERY SELECT v_cost, true; RETURN; END IF;

  SELECT p.cost_per_base_unit INTO v_cost
    FROM public.ingredient_prices p
   WHERE p.ingredient_id = p_ingredient_id
     AND p.effective_date <= COALESCE(p_date, CURRENT_DATE)
     AND p.cost_per_base_unit IS NOT NULL
     AND p.source IN ('seed_current','legacy')
   ORDER BY p.effective_date DESC, p.revision DESC, p.created_at DESC LIMIT 1;

  RETURN QUERY SELECT v_cost, false;
END; $$;

-- 8. Date-aware dish cost -> historical | fallback | unknown
CREATE OR REPLACE FUNCTION public.calculate_dish_cost_at_date(
  p_dish_id uuid, p_date date
) RETURNS TABLE (cost numeric, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_use_direct boolean; v_direct numeric; v_rest uuid; v_caller uuid;
  v_total numeric := 0; v_count integer := 0;
  v_qty numeric; v_line numeric; v_hist boolean; v_all_hist boolean := true; r RECORD;
BEGIN
  SELECT use_direct_cost, direct_cost, restaurant_id
    INTO v_use_direct, v_direct, v_rest FROM public.dishes WHERE id = p_dish_id;
  IF v_rest IS NULL THEN RETURN QUERY SELECT NULL::numeric, 'unknown'; RETURN; END IF;
  IF NOT public.is_trusted_backend_session() THEN
    v_caller := public.get_user_restaurant_id();
    IF v_caller IS NULL OR v_caller <> v_rest THEN
      RAISE EXCEPTION 'not authorized for this dish';
    END IF;
  END IF;

  IF v_use_direct IS TRUE THEN
    IF v_direct IS NULL OR v_direct <= 0 THEN
      RETURN QUERY SELECT NULL::numeric, 'unknown'; RETURN; END IF;
    RETURN QUERY SELECT ROUND(v_direct, 2), 'fallback'; RETURN;
  END IF;

  FOR r IN SELECT ingredient_id, quantity, unit FROM public.dish_ingredients WHERE dish_id = p_dish_id
  LOOP
    v_count := v_count + 1;
    v_qty := public.convert_recipe_qty(r.ingredient_id, r.quantity, r.unit);
    IF v_qty IS NULL THEN RETURN QUERY SELECT NULL::numeric, 'unknown'; RETURN; END IF;
    SELECT c.cost, c.is_historical INTO v_line, v_hist
      FROM public.get_ingredient_cost_at_date(r.ingredient_id, p_date) c;
    IF v_line IS NULL THEN RETURN QUERY SELECT NULL::numeric, 'unknown'; RETURN; END IF;
    IF NOT v_hist THEN v_all_hist := false; END IF;
    v_total := v_total + v_qty * v_line;
  END LOOP;

  IF v_count = 0 THEN RETURN QUERY SELECT NULL::numeric, 'unknown'; RETURN; END IF;
  RETURN QUERY SELECT ROUND(v_total,2), CASE WHEN v_all_hist THEN 'historical' ELSE 'fallback' END;
END; $$;

-- 9. Shared daily resolver
CREATE OR REPLACE FUNCTION public.get_daily_food_cost(
  p_location_id uuid, p_start date, p_end date, p_estimate_pct numeric DEFAULT 30
) RETURNS TABLE (
  sale_date               date,
  total_revenue           numeric,
  historical_food_cost    numeric,
  fallback_food_cost      numeric,
  actual_food_cost        numeric,
  estimated_food_cost     numeric,
  blended_food_cost       numeric,
  food_cost_pct           numeric,
  recipe_coverage_pct     numeric,
  historical_coverage_pct numeric,
  historical_revenue      numeric,
  fallback_revenue        numeric,
  uncosted_revenue        numeric,
  historical_quantity     numeric,
  fallback_quantity       numeric,
  uncosted_quantity       numeric,
  missing_cost_dishes     integer,
  fallback_priced_dishes  integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH priced AS (
    SELECT s.sale_date, s.dish_id, s.quantity::numeric AS qty,
           s.total_price::numeric AS revenue, c.cost, c.status
      FROM public.sales s
      CROSS JOIN LATERAL public.calculate_dish_cost_at_date(s.dish_id, s.sale_date) c
     WHERE s.restaurant_id = public.get_user_restaurant_id()
       AND (p_location_id IS NULL OR s.location_id = p_location_id)
       AND public.user_can_access_location(s.location_id)
       AND (p_start IS NULL OR s.sale_date >= p_start)
       AND (p_end   IS NULL OR s.sale_date <= p_end)
  ), agg AS (
    SELECT sale_date,
      SUM(revenue) AS total_revenue,
      COALESCE(SUM(cost*qty) FILTER (WHERE status='historical'),0) AS hist_cost,
      COALESCE(SUM(cost*qty) FILTER (WHERE status='fallback'),0)   AS fb_cost,
      COALESCE(SUM(revenue)  FILTER (WHERE status='historical'),0) AS hist_rev,
      COALESCE(SUM(revenue)  FILTER (WHERE status='fallback'),0)   AS fb_rev,
      COALESCE(SUM(revenue)  FILTER (WHERE status='unknown'),0)    AS unc_rev,
      COALESCE(SUM(qty)      FILTER (WHERE status='historical'),0) AS hist_qty,
      COALESCE(SUM(qty)      FILTER (WHERE status='fallback'),0)   AS fb_qty,
      COALESCE(SUM(qty)      FILTER (WHERE status='unknown'),0)    AS unc_qty,
      COUNT(DISTINCT dish_id) FILTER (WHERE status='unknown')      AS missing_dishes,
      COUNT(DISTINCT dish_id) FILTER (WHERE status='fallback')     AS fb_dishes
    FROM priced GROUP BY sale_date
  )
  SELECT sale_date,
    ROUND(total_revenue,2), ROUND(hist_cost,2), ROUND(fb_cost,2),
    ROUND(hist_cost+fb_cost,2),
    ROUND(unc_rev*p_estimate_pct/100,2),
    ROUND(hist_cost+fb_cost+unc_rev*p_estimate_pct/100,2),
    CASE WHEN total_revenue>0 THEN ROUND((hist_cost+fb_cost+unc_rev*p_estimate_pct/100)/total_revenue*100,2) END,
    CASE WHEN total_revenue>0 THEN ROUND((hist_rev+fb_rev)/total_revenue*100,2) END,
    CASE WHEN total_revenue>0 THEN ROUND(hist_rev/total_revenue*100,2) END,
    ROUND(hist_rev,2), ROUND(fb_rev,2), ROUND(unc_rev,2),
    hist_qty, fb_qty, unc_qty,
    missing_dishes::integer, fb_dishes::integer
  FROM agg ORDER BY sale_date;
$$;

-- 10. Shared period resolver
CREATE OR REPLACE FUNCTION public.get_period_food_cost(
  p_location_id uuid, p_start date, p_end date, p_estimate_pct numeric DEFAULT 30
) RETURNS TABLE (
  total_revenue           numeric,
  historical_food_cost    numeric,
  fallback_food_cost      numeric,
  actual_food_cost        numeric,
  estimated_food_cost     numeric,
  blended_food_cost       numeric,
  food_cost_pct           numeric,
  recipe_coverage_pct     numeric,
  historical_coverage_pct numeric,
  historical_revenue      numeric,
  fallback_revenue        numeric,
  uncosted_revenue        numeric,
  historical_quantity     numeric,
  fallback_quantity       numeric,
  uncosted_quantity       numeric,
  missing_cost_dishes     integer,
  fallback_priced_dishes  integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH priced AS (
    SELECT s.dish_id, s.quantity::numeric AS qty, s.total_price::numeric AS revenue, c.cost, c.status
      FROM public.sales s
      CROSS JOIN LATERAL public.calculate_dish_cost_at_date(s.dish_id, s.sale_date) c
     WHERE s.restaurant_id = public.get_user_restaurant_id()
       AND (p_location_id IS NULL OR s.location_id = p_location_id)
       AND public.user_can_access_location(s.location_id)
       AND (p_start IS NULL OR s.sale_date >= p_start)
       AND (p_end   IS NULL OR s.sale_date <= p_end)
  ), agg AS (
    SELECT SUM(revenue) AS total_revenue,
      COALESCE(SUM(cost*qty) FILTER (WHERE status='historical'),0) AS hist_cost,
      COALESCE(SUM(cost*qty) FILTER (WHERE status='fallback'),0)   AS fb_cost,
      COALESCE(SUM(revenue)  FILTER (WHERE status='historical'),0) AS hist_rev,
      COALESCE(SUM(revenue)  FILTER (WHERE status='fallback'),0)   AS fb_rev,
      COALESCE(SUM(revenue)  FILTER (WHERE status='unknown'),0)    AS unc_rev,
      COALESCE(SUM(qty)      FILTER (WHERE status='historical'),0) AS hist_qty,
      COALESCE(SUM(qty)      FILTER (WHERE status='fallback'),0)   AS fb_qty,
      COALESCE(SUM(qty)      FILTER (WHERE status='unknown'),0)    AS unc_qty,
      COUNT(DISTINCT dish_id) FILTER (WHERE status='unknown')      AS missing_dishes,
      COUNT(DISTINCT dish_id) FILTER (WHERE status='fallback')     AS fb_dishes
    FROM priced
  )
  SELECT ROUND(COALESCE(total_revenue,0),2), ROUND(hist_cost,2), ROUND(fb_cost,2),
    ROUND(hist_cost+fb_cost,2), ROUND(unc_rev*p_estimate_pct/100,2),
    ROUND(hist_cost+fb_cost+unc_rev*p_estimate_pct/100,2),
    CASE WHEN total_revenue>0 THEN ROUND((hist_cost+fb_cost+unc_rev*p_estimate_pct/100)/total_revenue*100,2) END,
    CASE WHEN total_revenue>0 THEN ROUND((hist_rev+fb_rev)/total_revenue*100,2) END,
    CASE WHEN total_revenue>0 THEN ROUND(hist_rev/total_revenue*100,2) END,
    ROUND(hist_rev,2), ROUND(fb_rev,2), ROUND(unc_rev,2),
    hist_qty, fb_qty, unc_qty, missing_dishes::integer, fb_dishes::integer
  FROM agg;
$$;

-- 11. Grants: low-level helpers internal only
REVOKE ALL ON FUNCTION public.get_ingredient_cost_at_date(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calculate_dish_cost_at_date(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.get_ingredient_cost_at_date(uuid, date),
  public.calculate_dish_cost_at_date(uuid, date)
TO service_role;

GRANT EXECUTE ON FUNCTION
  public.get_daily_food_cost(uuid, date, date, numeric),
  public.get_period_food_cost(uuid, date, date, numeric)
TO authenticated, service_role;

-- 12. Restore immutability LAST, after all backfill/seed work
CREATE OR REPLACE FUNCTION public.protect_ingredient_price_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_trusted_backend_session() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'ingredient price history is immutable - add a new dated entry instead';
END; $$;

DROP TRIGGER IF EXISTS trg_ingredient_prices_immutable ON public.ingredient_prices;
CREATE TRIGGER trg_ingredient_prices_immutable
BEFORE UPDATE OR DELETE ON public.ingredient_prices
FOR EACH ROW EXECUTE FUNCTION public.protect_ingredient_price_history();