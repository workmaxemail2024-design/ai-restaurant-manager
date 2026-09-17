# Revised migration: historical (date-aware) food costing

Not executed. Revised per your four points; everything else from the approved proposal is unchanged.

## Point 2 — audit of the existing `ingredient_prices` rows

There are exactly 2 rows today:

| ingredient | cost_price | created_at | current default cost |
|---|---|---|---|
| tester | 0.01 | 2026-08-19 | 0.01 |
| fish fillet | 0.00 | 2026-09-06 | 0.00 |

They are written by the ingredient create/edit path at the moment the record is saved. `created_at` is therefore an **insert timestamp**, not a business "price applicable from" date: nothing in the app ever let anyone state when a price started applying, and a price typed in on the 6th may well have been in force for weeks. They are also both scratch/zero values.

Conclusion: legacy rows are **not** treated as historically authoritative. They keep `source = 'legacy'`, are given `effective_date = created_at::date` so ordering still works, but the resolver classifies them as **fallback**, never `historical`. Only `source IN ('manual','purchase')` rows — created from now on with an explicit effective date — count as genuine dated history.

## Point 1 — frozen baseline, no live cost in historical lookups

`get_ingredient_cost_at_date` no longer calls `get_ingredient_base_cost`. The 1900-01-01 `seed_current` row stores the cost **as frozen at migration time** in `cost_per_base_unit`, and that stored number is the fallback. Changing an ingredient's price in October cannot move a September figure.

Lookup order:
1. latest `source IN ('manual','purchase')` row with `effective_date <= trading date` → `historical`
2. frozen `seed_current` / `legacy` row with `effective_date <= trading date` → `fallback`
3. otherwise `NULL` → `unknown`

Never a future price; never today's mutable ingredient cost.

To keep this true going forward, a trigger writes a dated `manual` history row whenever an ingredient's cost fields are inserted or changed — so new ingredients and every future price edit produce genuine dated history instead of relying on the frozen baseline.

## Point 3 — three separate qualities

Each sold line resolves to `historical` / `fallback` / `unknown`, and the resolvers aggregate all three separately:

- `recipe_coverage_pct` — revenue whose dish could be costed at all (historical + fallback)
- `historical_coverage_pct` — revenue costed from genuinely dated prices only
- `historical_food_cost`, `fallback_food_cost`, `estimated_food_cost`, `blended_food_cost`
- `historical_revenue`, `fallback_revenue`, `uncosted_revenue`
- `historical_quantity`, `fallback_quantity`, `uncosted_quantity`
- `missing_cost_dishes`, `fallback_priced_dishes`

So a day can read: "Food Cost €690 · 75% recipe-costed · 52% historically priced · €420 historical + €90 fallback + €180 estimated". 100% "actual" is only reachable when everything is historically priced.

## Point 4 — helper authorization

`get_ingredient_cost_at_date` and `calculate_dish_cost_at_date` are **not** granted to `authenticated`. They are internal, executed by the definer-owned daily/period resolvers, and granted to `service_role` only for backend use. Both also validate the row's `restaurant_id` against `get_user_restaurant_id()` unless the session is a trusted backend session, so a leaked grant would still not cross tenants. Only `get_daily_food_cost` / `get_period_food_cost` — which enforce restaurant and `user_can_access_location` — are exposed to `authenticated`.

## Full revised migration SQL

```sql
-- =========================================================
-- Historical food costing: additive only. No drops. Re-runnable.
-- =========================================================

-- 1. Effective dating + normalised cost on the EXISTING history table
ALTER TABLE public.ingredient_prices
  ADD COLUMN IF NOT EXISTS effective_date      date,
  ADD COLUMN IF NOT EXISTS cost_per_base_unit  numeric,
  ADD COLUMN IF NOT EXISTS base_unit           text,
  ADD COLUMN IF NOT EXISTS pack_size           numeric,
  ADD COLUMN IF NOT EXISTS pack_unit           text,
  ADD COLUMN IF NOT EXISTS cost_per_pack       numeric,
  ADD COLUMN IF NOT EXISTS source              text;

UPDATE public.ingredient_prices SET effective_date = created_at::date WHERE effective_date IS NULL;
UPDATE public.ingredient_prices SET source = 'legacy' WHERE source IS NULL;

ALTER TABLE public.ingredient_prices
  ALTER COLUMN effective_date SET DEFAULT CURRENT_DATE,
  ALTER COLUMN effective_date SET NOT NULL,
  ALTER COLUMN source SET DEFAULT 'manual',
  ALTER COLUMN source SET NOT NULL;

ALTER TABLE public.ingredient_prices DROP CONSTRAINT IF EXISTS ingredient_prices_source_chk;
ALTER TABLE public.ingredient_prices ADD CONSTRAINT ingredient_prices_source_chk
  CHECK (source IN ('seed_current','legacy','manual','purchase'));

ALTER TABLE public.ingredient_prices DROP CONSTRAINT IF EXISTS ingredient_prices_base_cost_chk;
ALTER TABLE public.ingredient_prices ADD CONSTRAINT ingredient_prices_base_cost_chk
  CHECK (cost_per_base_unit IS NULL OR cost_per_base_unit >= 0);

CREATE INDEX IF NOT EXISTS idx_ingredient_prices_lookup
  ON public.ingredient_prices (ingredient_id, effective_date DESC, created_at DESC);

-- 2. Backfill normalised cost on pre-existing (legacy) rows. NULL stays NULL.
UPDATE public.ingredient_prices p
   SET cost_per_base_unit = CASE
         WHEN p.cost_price IS NULL OR p.cost_price <= 0 THEN NULL
         ELSE p.cost_price / NULLIF(public.unit_factor(i.unit::text), 0) END,
       base_unit = public.get_ingredient_cost_unit(i.id)
  FROM public.ingredients i
 WHERE i.id = p.ingredient_id AND p.cost_per_base_unit IS NULL;

-- 3. Freeze today's effective cost as the open-ended baseline (value stored, not recomputed)
INSERT INTO public.ingredient_prices
  (ingredient_id, restaurant_id, cost_price, effective_date,
   cost_per_base_unit, base_unit, pack_size, pack_unit, cost_per_pack, source)
SELECT i.id, i.restaurant_id, COALESCE(i.default_cost_price, 0), DATE '1900-01-01',
       NULLIF(public.get_ingredient_base_cost(i.id), 0),   -- 0 means unknown -> NULL
       public.get_ingredient_cost_unit(i.id),
       i.pack_size, i.pack_unit, i.cost_per_pack, 'seed_current'
  FROM public.ingredients i
 WHERE NOT EXISTS (SELECT 1 FROM public.ingredient_prices p
                    WHERE p.ingredient_id = i.id AND p.source = 'seed_current');

-- 4. Future price changes create genuine dated history (also covers new ingredients)
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
  IF v_base IS NULL THEN RETURN NEW; END IF;   -- unknown stays unknown, never 0

  INSERT INTO public.ingredient_prices
    (ingredient_id, restaurant_id, cost_price, effective_date, cost_per_base_unit,
     base_unit, pack_size, pack_unit, cost_per_pack, source)
  VALUES (NEW.id, NEW.restaurant_id, COALESCE(NEW.default_cost_price, 0), CURRENT_DATE,
          v_base, public.get_ingredient_cost_unit(NEW.id),
          NEW.pack_size, NEW.pack_unit, NEW.cost_per_pack, 'manual');
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_ingredient_price_history ON public.ingredients;
CREATE TRIGGER trg_ingredient_price_history
AFTER INSERT OR UPDATE ON public.ingredients
FOR EACH ROW EXECUTE FUNCTION public.record_ingredient_price_history();

-- 5. Date-aware ingredient cost: dated history -> frozen baseline -> unknown
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

  -- genuine dated history only
  SELECT p.cost_per_base_unit INTO v_cost
    FROM public.ingredient_prices p
   WHERE p.ingredient_id = p_ingredient_id
     AND p.effective_date <= COALESCE(p_date, CURRENT_DATE)
     AND p.cost_per_base_unit IS NOT NULL
     AND p.source IN ('manual','purchase')
   ORDER BY p.effective_date DESC, p.created_at DESC LIMIT 1;
  IF v_cost IS NOT NULL THEN RETURN QUERY SELECT v_cost, true; RETURN; END IF;

  -- frozen baseline (seed_current / legacy) - stable value, never the live cost
  SELECT p.cost_per_base_unit INTO v_cost
    FROM public.ingredient_prices p
   WHERE p.ingredient_id = p_ingredient_id
     AND p.effective_date <= COALESCE(p_date, CURRENT_DATE)
     AND p.cost_per_base_unit IS NOT NULL
     AND p.source IN ('seed_current','legacy')
   ORDER BY p.effective_date DESC, p.created_at DESC LIMIT 1;

  RETURN QUERY SELECT v_cost, false;   -- may be NULL = unknown
END; $$;

-- 6. Date-aware dish cost -> historical | fallback | unknown
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
    RETURN QUERY SELECT ROUND(v_direct, 2), 'fallback'; RETURN;  -- no dated history
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

-- 7. Shared daily resolver
CREATE OR REPLACE FUNCTION public.get_daily_food_cost(
  p_location_id uuid, p_start date, p_end date, p_estimate_pct numeric DEFAULT 30
) RETURNS TABLE (
  sale_date               date,
  total_revenue           numeric,
  historical_food_cost    numeric,
  fallback_food_cost      numeric,
  actual_food_cost        numeric,   -- historical + fallback
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

-- 8. Shared period resolver (identical contract, one row)
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

-- 9. Grants: low-level helpers are internal, not exposed to end users
REVOKE ALL ON FUNCTION public.get_ingredient_cost_at_date(uuid, date) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.calculate_dish_cost_at_date(uuid, date) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION
  public.get_ingredient_cost_at_date(uuid, date),
  public.calculate_dish_cost_at_date(uuid, date)
TO service_role;

GRANT EXECUTE ON FUNCTION
  public.get_daily_food_cost(uuid, date, date, numeric),
  public.get_period_food_cost(uuid, date, date, numeric)
TO authenticated, service_role;
```

## Effect on 1 Sep 2026 at apply time

0 of 416 dishes have a recipe or direct cost, so every line is `unknown`: historical €0, fallback €0, estimated €719.54, blended €719.54, food cost 30.00%, recipe coverage 0%, historical coverage 0%, 85 dishes missing cost — exactly what Reports shows today. Nothing moves.

## Rollback

```sql
DROP TRIGGER IF EXISTS trg_ingredient_price_history ON public.ingredients;
DROP FUNCTION IF EXISTS public.record_ingredient_price_history();
DROP FUNCTION IF EXISTS public.get_period_food_cost(uuid, date, date, numeric);
DROP FUNCTION IF EXISTS public.get_daily_food_cost(uuid, date, date, numeric);
DROP FUNCTION IF EXISTS public.calculate_dish_cost_at_date(uuid, date);
DROP FUNCTION IF EXISTS public.get_ingredient_cost_at_date(uuid, date);
DELETE FROM public.ingredient_prices WHERE source = 'seed_current';
-- added columns/constraints/index may be left in place harmlessly, or dropped individually
```

## Verification after it runs (before any UI change)

- columns, constraint, index and both triggers exist; `ingredient_prices` has one `seed_current` row per ingredient and the 2 legacy rows untouched
- `get_period_food_cost` for 1–17 Sep returns revenue identical to current Reports, 0% coverage, 30% blended
- add one recipe with a dated price → that day's historical coverage rises, earlier untouched days unchanged
- change an ingredient price today → September figures byte-identical
- `get_ingredient_cost_at_date` rejected for a signed-in user (not granted); resolvers still work
