# Implementation proposal: blended, date-aware historical food costing

Nothing is implemented yet. This is the exact change set for review.

## 1. Existing tables/columns reused (no new price table)

- `sales` — `dish_id`, `quantity`, `total_price`, `sale_date`, `location_id`, `restaurant_id`. Read only, never modified.
- `dishes` — `selling_price`, `direct_cost`, `use_direct_cost`.
- `dish_ingredients` — `ingredient_id`, `quantity`, `unit`.
- `ingredients` — `pack_size`, `pack_unit`, `cost_per_pack`, `default_cost_price`, `unit`, `item_type`, `linked_dish_id`.
- `ingredient_prices` — **reused as the history table.** Today it has `id, ingredient_id, cost_price, created_at, restaurant_id` and is written on ingredient create/update (`src/hooks/useIngredients.ts:185, 216`) but never read by the costing engine. Two gaps: no explicit effective date (only `created_at`), and `cost_price` stores the raw default cost, not the pack-derived cost per base unit that `get_ingredient_base_cost` actually uses — so pack-cost changes leave no history at all.

`pos_sales_import`, `pos_daily_summaries`, reconciliation, canonical revenue, duplicate protection, closed-day and location security are untouched.

## 2. Exact migration

One migration, additive only, no drops:

```sql
ALTER TABLE public.ingredient_prices
  ADD COLUMN effective_date date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN cost_per_base_unit numeric,
  ADD COLUMN base_unit text,
  ADD COLUMN pack_size numeric,
  ADD COLUMN pack_unit text,
  ADD COLUMN cost_per_pack numeric,
  ADD COLUMN source text NOT NULL DEFAULT 'manual';

UPDATE public.ingredient_prices SET effective_date = created_at::date;

CREATE INDEX idx_ingredient_prices_lookup
  ON public.ingredient_prices (ingredient_id, effective_date DESC, created_at DESC);
```

Plus a seeding step (section 7) and the functions in section 3. No `GRANT`/RLS change needed — the table already exists with policies; new functions are `SECURITY DEFINER STABLE`.

## 3. Proposed SQL functions

| Function | Responsibility |
|---|---|
| `get_ingredient_cost_at_date(p_ingredient_id uuid, p_date date)` returns `(cost numeric, is_historical boolean)` | Latest `ingredient_prices` row with `effective_date <= p_date` (tie-break `created_at DESC`), returning `cost_per_base_unit` and `is_historical = true`. If none exists, return today's `get_ingredient_base_cost(id)` with `is_historical = false`. Never looks forward in time. |
| `calculate_dish_cost_at_date(p_dish_id uuid, p_date date)` returns `(cost numeric, status text)` | Same rules as today's `calculate_dish_cost`: direct cost wins; otherwise sum `convert_recipe_qty(...) × get_ingredient_cost_at_date(...)`. `status` is `'historical'` (every line priced from history), `'fallback'` (at least one line priced from today's cost), or `NULL` cost with `'unknown'` (no recipe, or a line that can't be converted/priced). |
| `get_period_food_cost(p_location_id uuid, p_start date, p_end date)` returns one row | **The single shared resolver.** Joins `sales` in range, prices each row with `calculate_dish_cost_at_date(dish_id, sale_date)`, and returns: `actual_cost`, `costed_revenue`, `uncosted_revenue`, `uncosted_quantity`, `uncosted_item_count`, `fallback_cost` (portion priced at today's cost), `coverage_pct` (revenue-weighted), `total_revenue`. Location scoping honours the existing `user_can_access_location` rules; all reads go through RLS-scoped `sales`. |
| `get_daily_food_cost(p_location_id uuid, p_start date, p_end date)` returns a row **per sale_date** | Same shape as above, grouped by trading day, for the Reports daily cards. |

Blending stays in one place: `food_cost = actual_cost + uncosted_revenue × 0.30`. The 30% assumption applies only to the uncosted revenue portion.

`calculate_dish_cost` and `calculate_dish_margin` stay exactly as they are (Dishes page, Menu Engineering, AI). `calculate_dish_cost(id)` becomes a thin wrapper over `calculate_dish_cost_at_date(id, CURRENT_DATE)` so there is one body of logic.

## 4. Calculations being replaced

- `src/hooks/useDailyBreakdown.ts:303-307` — the hard-coded `foodCost = revenue × 30%`, `profit = revenue − foodCost`. Replaced by one `get_daily_food_cost` call for the range, merged per date.
- `src/hooks/useDailyFinancialSummary.ts:180-211` — the per-dish RPC loop and the 50% `RECIPE_COVERAGE_THRESHOLD` all-or-nothing switch. Replaced by `get_period_food_cost`.
- `src/pages/ReportsPage.tsx:575` — `effectiveRevenue * 0.3`, and the period roll-up at ~1409 which sums daily food cost and flags "any day estimated". Replaced by summing the resolver's actual / uncosted components.
- `src/hooks/useFinancialReports.ts:82` and `src/hooks/useOwnerIntelligence.ts:74` — switched to the shared resolver so P&L and insights agree with Reports.
- `supabase/functions/ai-daily-summary` and `ai-assistant` — use `get_period_food_cost` for day/range food cost, keeping their per-dish `calculate_dish_cost` use for dish-level margin.
- Menu Engineering keeps per-dish current costing (it is a current-menu tool, not a historical report), but will read via the same wrapper.

## 5. Cost coverage

Headline coverage is **revenue-weighted**: `costed_revenue ÷ total_revenue × 100`. Item counts are retained alongside: number of distinct sold products missing a cost, and total quantity sold uncosted. Both come from the same resolver so the UI never recomputes them.

## 6. Fallback when no historical price exists

Priority per recipe line: (1) price with `effective_date <= sale_date` → historical; (2) no such row → today's `get_ingredient_base_cost`, flagged `fallback`; (3) no usable cost or unconvertible unit → the dish is `unknown` and its sales revenue goes into the uncosted bucket at 30%. A future-dated price is never used for an earlier day. Any day containing fallback-priced lines is labelled "partly estimated", never "Actual".

## 7. Seeding existing costs into history safely

For every ingredient with no `ingredient_prices` row at or before the earliest trading day, insert one seed row at `effective_date = '1900-01-01'` carrying the current `cost_per_base_unit`, pack fields and `source = 'seed_current'`. This makes today's behaviour the baseline for all past days (no figure moves on day one) while marking those components as seeded rather than genuinely historical. Existing rows are backfilled with `cost_per_base_unit` derived from their pack/default data. No existing row is deleted or overwritten.

Going forward, `useIngredients` writes a dated history row whenever `default_cost_price`, `cost_per_pack`, `pack_size` or `pack_unit` changes, storing the computed cost per base unit — so pack-cost edits create history too. The previous value is always preserved.

## 8. Recipe changes and future versioning

Ingredient price history fixes prices, but editing a recipe still re-prices the past, because `dish_ingredients` has no history. Full recipe versioning is **not** proposed now. The future-safe minimum built in this change: `calculate_dish_cost_at_date` takes the date as its only time input and resolves recipe lines through a single internal step, so a later `dish_ingredients_versions` table (with `valid_from`/`valid_to`) can be slotted into that one step without touching the resolver, the hooks or the UI. Until then, the UI will note that recipe edits apply retroactively.

## 9. Reports UI

Daily card and period KPI:

```
Food Cost  28.8%
75% actual coverage (revenue-weighted)
€510 actual + €180 estimated
21 sold items missing cost   ->
```

At full coverage with no fallback pricing: `Food Cost 27.4% · Actual`. Partial history: `· Partly estimated`. The missing-cost line is a link that opens the Dishes page filtered to "No usable cost" (that filter already exists). Est. Profit keeps its existing formula but consumes the blended food cost, and is labelled "Est." whenever any estimated or fallback component remains.

## 10. Testing September, before and after

Current state confirmed in your database: September has Products Sold on 1, 11 and 16 Sep (1 Sep = 85 product lines, 235 items, €2,398.45), and **0 of 416 dishes have a recipe or direct cost**. So coverage today is 0% and every day is fully estimated.

1. Record 1 Sep before: Food Cost €, %, coverage, actual/estimated split, missing item count.
2. On scratch data only, add a recipe (or direct cost) to a handful of dishes sold on 1 Sep, with ingredient prices dated before 1 Sep.
3. Reload Reports — no POS re-import — and confirm coverage rises, actual grows, estimated shrinks, revenue is unchanged, and the day is still labelled partly estimated.
4. Change one ingredient price today with an effective date of today; confirm 1 Sep does **not** move and the current month does.
5. Backdate a price to 20 Aug; confirm 1 Sep moves and August days before that date do not.
6. Confirm Reports, Dashboard/financial summary, P&L and the AI summary all report the same food cost for the same range.

## 11. Rollback

The migration is additive, so rollback is: revert the frontend and function code to the current commit, and optionally drop the seven added columns and the four new functions. `calculate_dish_cost` retains its current signature and behaviour throughout, so every existing consumer keeps working at any point. No sales, POS or reconciliation data is written at any stage.
