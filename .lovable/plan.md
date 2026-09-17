# Migration proposal: historical (date-aware) food costing

Nothing has been executed. This is the exact SQL for review. No application code changes in this step — the Reports 30% path and the 50% financial-summary threshold stay exactly as they are until you approve the follow-up code phase.

## Existing schema being reused

- `ingredient_prices` (`id, ingredient_id, cost_price, created_at, restaurant_id`) — reused as **the** price history. Two RLS policies already exist (`tenant_filter(restaurant_id)` and `restaurant_id IS NULL OR user_belongs_to_restaurant(...)`); unchanged.
- `ingredients` — `pack_size, pack_unit, cost_per_pack, default_cost_price, unit`.
- `dishes` — `selling_price, direct_cost, use_direct_cost`.
- `dish_ingredients` — `ingredient_id, quantity, unit`.
- `sales` — read only.
- Existing helpers reused unchanged: `normalize_unit`, `unit_factor`, `get_ingredient_cost_unit`, `convert_recipe_qty`, `get_ingredient_base_cost`, `get_user_restaurant_id`, `user_can_access_location`.

Untouched: `sales`, `pos_sales_import`, `pos_daily_summaries`, Products Sold / Sales Summary data, reconciliation, canonical revenue, duplicate protection, closed-day and location security.

## Direct-cost dishes — proposed treatment

`dishes.direct_cost` has no history. A current direct cost must not be presented as historically accurate. Proposal for this migration: a direct-cost dish is costed at its current `direct_cost`, but the line is flagged `fallback`, never `historical`. So its money counts in "actual cost", while the day is labelled "partly estimated" rather than "Actual". Full accuracy for direct-cost dishes needs a dated `dish_cost_history`; the resolver's `status` contract already accommodates it, so it can be added later without changing any consumer.

## Full migration SQL

```sql
-- =========================================================
-- Historical food costing: additive only. No drops.
-- Safe to re-run.
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

UPDATE public.ingredient_prices
   SET effective_date = created_at::date
 WHERE effective_date IS NULL;

UPDATE public.ingredient_prices
   SET source = 'legacy'
 WHERE source IS NULL;

ALTER TABLE public.ingredient_prices
  ALTER COLUMN effective_date SET DEFAULT CURRENT_DATE,
  ALTER COLUMN effective_date SET NOT NULL,
  ALTER COLUMN source SET DEFAULT 'manual',
  ALTER COLUMN source SET NOT NULL;

-- source vocabulary: 'seed_current' | 'legacy' | 'manual' | 'purchase'
ALTER TABLE public.ingredient_prices
  DROP CONSTRAINT IF EXISTS ingredient_prices_source_chk;
ALTER TABLE public.ingredient_prices
  ADD CONSTRAINT ingredient_prices_source_chk
  CHECK (source IN ('seed_current','legacy','manual','purchase'));

-- cost must never be negative; NULL stays NULL (unknown), never coerced to 0
ALTER TABLE public.ingredient_prices
  DROP CONSTRAINT IF EXISTS ingredient_prices_base_cost_chk;
ALTER TABLE public.ingredient_prices
  ADD CONSTRAINT ingredient_prices_base_cost_chk
  CHECK (cost_per_base_unit IS NULL OR cost_per_base_unit >= 0);

CREATE INDEX IF NOT EXISTS idx_ingredient_prices_lookup
  ON public.ingredient_prices (ingredient_id, effective_date DESC, created_at DESC);

-- 2. Backfill normalised cost on pre-existing rows.
--    Legacy rows stored cost_price against the ingredient's purchase unit.
UPDATE public.ingredient_prices p
   SET cost_per_base_unit =
         CASE
           WHEN p.cost_price IS NULL OR p.cost_price <= 0 THEN NULL
           ELSE p.cost_price / NULLIF(public.unit_factor(i.unit::text), 0)
         END,
       base_unit = public.get_ingredient_cost_unit(i.id)
  FROM public.ingredients i
 WHERE i.id = p.ingredient_id
   AND p.cost_per_base_unit IS NULL;

-- 3. Seed today's effective cost as the open-ended historical baseline,
--    so NO existing Report / Dashboard / historical figure moves on apply.
INSERT INTO public.ingredient_prices
  (ingredient_id, restaurant_id, cost_price, effective_date,
   cost_per_base_unit, base_unit, pack_size, pack_unit, cost_per_pack, source)
SELECT i.id,
       i.restaurant_id,
       COALESCE(i.default_cost_price, 0),
       DATE '1900-01-01',
       NULLIF(public.get_ingredient_base_cost(i.id), 0),   -- 0 means unknown -> NULL
       public.get_ingredient_cost_unit(i.id),
       i.pack_size, i.pack_unit, i.cost_per_pack,
       'seed_current'
  FROM public.ingredients i
 WHERE NOT EXISTS (
         SELECT 1 FROM public.ingredient_prices p
          WHERE p.ingredient_id = i.id
            AND p.source = 'seed_current'
       );

-- 4. Date-aware ingredient cost
CREATE OR REPLACE FUNCTION public.get_ingredient_cost_at_date(
  p_ingredient_id uuid,
  p_date date
) RETURNS TABLE (cost numeric, is_historical boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cost numeric;
BEGIN
  SELECT p.cost_per_base_unit
    INTO v_cost
    FROM public.ingredient_prices p
   WHERE p.ingredient_id = p_ingredient_id
     AND p.effective_date <= COALESCE(p_date, CURRENT_DATE)
     AND p.cost_per_base_unit IS NOT NULL
     AND p.source <> 'seed_current'
   ORDER BY p.effective_date DESC, p.created_at DESC
   LIMIT 1;

  IF v_cost IS NOT NULL THEN
    RETURN QUERY SELECT v_cost, true;      -- genuine dated history
    RETURN;
  END IF;

  -- seeded baseline / current cost: usable but NOT historical
  SELECT NULLIF(public.get_ingredient_base_cost(p_ingredient_id), 0) INTO v_cost;
  RETURN QUERY SELECT v_cost, false;       -- v_cost may be NULL = unknown
END; $$;

-- 5. Date-aware dish cost
CREATE OR REPLACE FUNCTION public.calculate_dish_cost_at_date(
  p_dish_id uuid,
  p_date date
) RETURNS TABLE (cost numeric, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_use_direct boolean; v_direct numeric;
  v_total numeric := 0; v_count integer := 0;
  v_qty numeric; v_line numeric; v_hist boolean;
  v_all_historical boolean := true;
  r RECORD;
BEGIN
  SELECT use_direct_cost, direct_cost INTO v_use_direct, v_direct
    FROM public.dishes WHERE id = p_dish_id;

  IF v_use_direct IS TRUE THEN
    IF v_direct IS NULL OR v_direct <= 0 THEN
      RETURN QUERY SELECT NULL::numeric, 'unknown'; RETURN;
    END IF;
    -- direct cost has no dated history: usable, never "historical"
    RETURN QUERY SELECT ROUND(v_direct, 2), 'fallback'; RETURN;
  END IF;

  FOR r IN SELECT ingredient_id, quantity, unit
             FROM public.dish_ingredients WHERE dish_id = p_dish_id
  LOOP
    v_count := v_count + 1;
    v_qty := public.convert_recipe_qty(r.ingredient_id, r.quantity, r.unit);
    IF v_qty IS NULL THEN
      RETURN QUERY SELECT NULL::numeric, 'unknown'; RETURN;   -- unknown, not zero
    END IF;
    SELECT c.cost, c.is_historical INTO v_line, v_hist
      FROM public.get_ingredient_cost_at_date(r.ingredient_id, p_date) c;
    IF v_line IS NULL THEN
      RETURN QUERY SELECT NULL::numeric, 'unknown'; RETURN;   -- unknown, not zero
    END IF;
    IF NOT v_hist THEN v_all_historical := false; END IF;
    v_total := v_total + v_qty * v_line;
  END LOOP;

  IF v_count = 0 THEN
    RETURN QUERY SELECT NULL::numeric, 'unknown'; RETURN;
  END IF;

  RETURN QUERY SELECT ROUND(v_total, 2),
                      CASE WHEN v_all_historical THEN 'historical' ELSE 'fallback' END;
END; $$;

-- 6. Shared daily resolver
CREATE OR REPLACE FUNCTION public.get_daily_food_cost(
  p_location_id uuid,
  p_start date,
  p_end date,
  p_estimate_pct numeric DEFAULT 30
) RETURNS TABLE (
  sale_date            date,
  total_revenue        numeric,
  actual_food_cost     numeric,
  estimated_food_cost  numeric,
  blended_food_cost    numeric,
  food_cost_pct        numeric,
  coverage_pct         numeric,
  costed_revenue       numeric,
  uncosted_revenue     numeric,
  costed_quantity      numeric,
  uncosted_quantity    numeric,
  missing_cost_dishes  integer,
  has_fallback_pricing boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH priced AS (
    SELECT s.sale_date,
           s.dish_id,
           s.quantity::numeric   AS qty,
           s.total_price::numeric AS revenue,
           c.cost, c.status
      FROM public.sales s
      CROSS JOIN LATERAL public.calculate_dish_cost_at_date(s.dish_id, s.sale_date) c
     WHERE s.restaurant_id = public.get_user_restaurant_id()
       AND (p_location_id IS NULL OR s.location_id = p_location_id)
       AND public.user_can_access_location(s.location_id)
       AND (p_start IS NULL OR s.sale_date >= p_start)
       AND (p_end   IS NULL OR s.sale_date <= p_end)
  ), agg AS (
    SELECT sale_date,
           SUM(revenue)                                               AS total_revenue,
           COALESCE(SUM(cost * qty) FILTER (WHERE cost IS NOT NULL),0) AS actual_cost,
           COALESCE(SUM(revenue)    FILTER (WHERE cost IS NOT NULL),0) AS costed_rev,
           COALESCE(SUM(revenue)    FILTER (WHERE cost IS NULL),0)     AS uncosted_rev,
           COALESCE(SUM(qty)        FILTER (WHERE cost IS NOT NULL),0) AS costed_qty,
           COALESCE(SUM(qty)        FILTER (WHERE cost IS NULL),0)     AS uncosted_qty,
           COUNT(DISTINCT dish_id)  FILTER (WHERE cost IS NULL)        AS missing_dishes,
           bool_or(status = 'fallback')                                AS any_fallback
      FROM priced GROUP BY sale_date
  )
  SELECT sale_date,
         ROUND(total_revenue,2),
         ROUND(actual_cost,2),
         ROUND(uncosted_rev * p_estimate_pct / 100, 2),
         ROUND(actual_cost + uncosted_rev * p_estimate_pct / 100, 2),
         CASE WHEN total_revenue > 0
              THEN ROUND((actual_cost + uncosted_rev * p_estimate_pct/100)
                         / total_revenue * 100, 2) END,
         CASE WHEN total_revenue > 0
              THEN ROUND(costed_rev / total_revenue * 100, 2) END,
         ROUND(costed_rev,2), ROUND(uncosted_rev,2),
         costed_qty, uncosted_qty,
         missing_dishes::integer,
         COALESCE(any_fallback,false)
    FROM agg ORDER BY sale_date;
$$;

-- 7. Shared period resolver (same contract, one row)
CREATE OR REPLACE FUNCTION public.get_period_food_cost(
  p_location_id uuid,
  p_start date,
  p_end date,
  p_estimate_pct numeric DEFAULT 30
) RETURNS TABLE (
  total_revenue        numeric,
  actual_food_cost     numeric,
  estimated_food_cost  numeric,
  blended_food_cost    numeric,
  food_cost_pct        numeric,
  coverage_pct         numeric,
  costed_revenue       numeric,
  uncosted_revenue     numeric,
  costed_quantity      numeric,
  uncosted_quantity    numeric,
  missing_cost_dishes  integer,
  has_fallback_pricing boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH priced AS (
    SELECT s.dish_id, s.quantity::numeric AS qty, s.total_price::numeric AS revenue,
           c.cost, c.status
      FROM public.sales s
      CROSS JOIN LATERAL public.calculate_dish_cost_at_date(s.dish_id, s.sale_date) c
     WHERE s.restaurant_id = public.get_user_restaurant_id()
       AND (p_location_id IS NULL OR s.location_id = p_location_id)
       AND public.user_can_access_location(s.location_id)
       AND (p_start IS NULL OR s.sale_date >= p_start)
       AND (p_end   IS NULL OR s.sale_date <= p_end)
  ), agg AS (
    SELECT SUM(revenue) AS total_revenue,
           COALESCE(SUM(cost*qty) FILTER (WHERE cost IS NOT NULL),0) AS actual_cost,
           COALESCE(SUM(revenue)  FILTER (WHERE cost IS NOT NULL),0) AS costed_rev,
           COALESCE(SUM(revenue)  FILTER (WHERE cost IS NULL),0)     AS uncosted_rev,
           COALESCE(SUM(qty)      FILTER (WHERE cost IS NOT NULL),0) AS costed_qty,
           COALESCE(SUM(qty)      FILTER (WHERE cost IS NULL),0)     AS uncosted_qty,
           COUNT(DISTINCT dish_id) FILTER (WHERE cost IS NULL)       AS missing_dishes,
           bool_or(status='fallback')                                AS any_fallback
      FROM priced
  )
  SELECT ROUND(COALESCE(total_revenue,0),2),
         ROUND(actual_cost,2),
         ROUND(uncosted_rev*p_estimate_pct/100,2),
         ROUND(actual_cost + uncosted_rev*p_estimate_pct/100,2),
         CASE WHEN total_revenue>0 THEN ROUND((actual_cost+uncosted_rev*p_estimate_pct/100)/total_revenue*100,2) END,
         CASE WHEN total_revenue>0 THEN ROUND(costed_rev/total_revenue*100,2) END,
         ROUND(costed_rev,2), ROUND(uncosted_rev,2),
         costed_qty, uncosted_qty, missing_dishes::integer, COALESCE(any_fallback,false)
    FROM agg;
$$;

GRANT EXECUTE ON FUNCTION
  public.get_ingredient_cost_at_date(uuid, date),
  public.calculate_dish_cost_at_date(uuid, date),
  public.get_daily_food_cost(uuid, date, date, numeric),
  public.get_period_food_cost(uuid, date, date, numeric)
TO authenticated, service_role;
```

## Before / after on a September day

`2026-09-01`, Rudy's: 85 product lines, 235 items, €2,398.45. Currently 0 of 416 dishes have a recipe or direct cost.

**Immediately after this migration (no recipes yet):** every line returns `cost = NULL`, so `actual = €0.00`, `uncosted_revenue = €2,398.45`, `estimated = €719.54`, `blended = €719.54`, `food_cost_pct = 30.00`, `coverage_pct = 0.00`, `missing_cost_dishes = 85`. Identical to what Reports shows today — nothing moves.

**After recipes are added for dishes worth €1,800 of that day, priced from history:** `actual = €510.00`, `uncosted_revenue = €598.45`, `estimated = €179.54`, `blended = €689.54`, `food_cost_pct = 28.75`, `coverage_pct = 75.05`, `missing_cost_dishes` drops accordingly. No POS re-import.

**If an ingredient price is then changed today** with `effective_date = today`, 1 Sep is unaffected — the lookup only ever takes `effective_date <= sale_date`.

## Security implications

- All four functions are `SECURITY DEFINER STABLE` with `search_path = public`, and every read of `sales` is filtered by `restaurant_id = get_user_restaurant_id()` **and** `user_can_access_location(location_id)`, so non-Owner location scoping is enforced inside the function, not just by the caller.
- `ingredient_prices` RLS is unchanged; new columns inherit the existing tenant policies. Seed rows copy `ingredients.restaurant_id`, so tenant isolation holds.
- No service-role bypass, no new table, no policy change, no grant widening beyond executing the four new functions.

## Rollback SQL

```sql
DROP FUNCTION IF EXISTS public.get_period_food_cost(uuid, date, date, numeric);
DROP FUNCTION IF EXISTS public.get_daily_food_cost(uuid, date, date, numeric);
DROP FUNCTION IF EXISTS public.calculate_dish_cost_at_date(uuid, date);
DROP FUNCTION IF EXISTS public.get_ingredient_cost_at_date(uuid, date);
DELETE FROM public.ingredient_prices WHERE source = 'seed_current';
ALTER TABLE public.ingredient_prices
  DROP CONSTRAINT IF EXISTS ingredient_prices_source_chk,
  DROP CONSTRAINT IF EXISTS ingredient_prices_base_cost_chk;
DROP INDEX IF EXISTS public.idx_ingredient_prices_lookup;
-- columns can be left in place harmlessly, or dropped:
-- ALTER TABLE public.ingredient_prices
--   DROP COLUMN effective_date, DROP COLUMN cost_per_base_unit, DROP COLUMN base_unit,
--   DROP COLUMN pack_size, DROP COLUMN pack_unit, DROP COLUMN cost_per_pack, DROP COLUMN source;
```

Because no application path is changed in this step, rollback needs no code revert.

## Tests to run after applying

1. Re-run the migration — confirm it completes unchanged (idempotent).
2. `get_period_food_cost(NULL,'2026-09-01','2026-09-30')` — confirm blended = 30% of revenue, coverage 0, and the figure matches what Reports shows today.
3. `get_daily_food_cost` for 1, 11, 16 Sep — confirm each day's revenue matches the current Reports revenue exactly.
4. On scratch data: add a recipe with prices dated 20 Aug, re-run — coverage and actual rise, revenue unchanged, status `historical`.
5. Add a price dated today, re-run September — no change; re-run today's date — changed.
6. Set an ingredient's cost to NULL/0 — the dish returns `unknown`, its revenue goes to uncosted, never €0 cost.
7. A dish with a recipe line in an unconvertible unit — returns `unknown`, not a partial cost.
8. A direct-cost dish — costed, `has_fallback_pricing = true`.
9. Query as a location-scoped (non-Owner) user — only permitted locations appear.
10. Confirm `sales`, `pos_sales_import`, `pos_daily_summaries` row counts and checksums are unchanged before and after.

## Edge cases and assumptions found

- `get_ingredient_base_cost` returns **0** when no cost is known. The new function wraps it in `NULLIF(...,0)` so unknown stays unknown and is never silently costed at zero.
- Legacy `ingredient_prices.cost_price` is stored against the ingredient's purchase unit, not per base unit — hence the backfill dividing by `unit_factor`. If an ingredient's pack unit differs in dimension from its `unit`, that legacy row's normalised value may be wrong; those rows are marked `source = 'legacy'` so they can be audited, and only 2 such rows exist in your data.
- Seed rows use `effective_date = 1900-01-01` and are excluded from the "genuine history" branch, so they price sales but always report `is_historical = false`.
- `sale_date` is used as the trading date; the operating-day function is not involved because `sales.sale_date` is already the trading date written by the importer.
- Direct-cost dishes and recipe edits remain retroactive (no versioning yet) — the `status` field is the hook for adding it later.
- Unmapped POS sales land on the "Unmapped POS Sale" placeholder dish, which has no recipe, so their revenue correctly falls into the uncosted bucket.
- `p_estimate_pct` defaults to 30 so the existing assumption lives in exactly one place and is overridable later.

Awaiting your approval before running anything.
