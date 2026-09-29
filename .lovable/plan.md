# Linked recipes + manual recipe-line costs: combined proposal (not applied)

Nothing has been applied. The earlier migration was cancelled before it ran.

## 1. Schema (adds only; existing rows unchanged)

`dishes` (linked recipes, as agreed before)
- `base_dish_id uuid NULL` references `dishes(id)`, `ON DELETE RESTRICT`
- `recipe_multiplier numeric NULL`. Required and greater than 0 when a base dish is set; empty otherwise.
- Checks: same restaurant, not the dish itself, no loops, depth of 5 or less, base not archived or merged. A linked dish can't have its own lines.

`dish_ingredients` (manual line cost)
- `cost_mode text NOT NULL DEFAULT 'inventory'`, either `'inventory'` or `'manual'`. Every existing line stays `inventory`, so today's costs don't change.
- `manual_line_cost numeric NULL`: the euro cost of this whole line at its stored quantity (for example €1.85 for 320g). It's never written back to the ingredient's price.
- `manual_cost_effective_from date NULL`: set to the operating day the manual cost was entered.
- `manual_cost_set_by uuid NULL` and `manual_cost_set_at timestamptz NULL` record who set it and when.
- Checks: `manual` mode requires a manual cost of 0 or more. The line keeps its quantity and unit, so stock use and scaling still work.
- Changing the quantity on a manual line doesn't adjust the cost silently. The screen asks you to confirm or re-enter the cost.

## 2. Cost precedence

Dish level:
```text
1. use_direct_cost = true   -> direct_cost                       (unchanged)
2. base_dish_id set         -> base dish's effective lines x multiplier
                               (a base on direct cost cannot be inherited -> unknown)
3. own lines                -> sum of line costs (below)
4. no lines                 -> unknown (never EUR 0)
```

Line level (for the current cost and for past dates):
```text
cost_mode = 'manual'
   date >= manual_cost_effective_from  -> manual_line_cost x multiplier   status: manual
   date <  manual_cost_effective_from  -> previous behaviour (inventory history/fallback, else unknown)
cost_mode = 'inventory'               -> today's logic: converted qty x dated ingredient cost
                                          status: historical / fallback / unknown
```
- The dish's status is its weakest line: unknown, then manual or fallback, then historical. Reports count manual-costed sales in the existing "fallback" (costed, not historical) group. That keeps the 30% estimate only for revenue with no cost at all.
- Past Reports stay as they are. A manual cost only applies from the day it was entered, so earlier days keep their current cost or estimate.
- Scaling example: Large Wings = Small × 2. 320g at €1.85 becomes 640g at €3.70. If the line later switches to inventory costing, the calculated cost is multiplied by 2 the same way.

## 3. Switching manual to calculated (always explicit)
- The recipe line shows "Manual €1.85". Once the ingredient can be priced, it also shows "Calculated from inventory: €X".
- A "Use calculated cost" button sets `cost_mode = 'inventory'`. The manual value is kept for reference and can be switched back.
- Adding inventory pricing never changes a manual line by itself.
- On a linked dish, the switch is made on the base dish's line, so every linked portion follows it.

## 4. Stock reduction on sale: unit issue confirmed
- Today `reduce_stock_on_sale()` subtracts the raw recipe quantity (e.g. 320) from stock, whatever unit the stock is in. It's already wrong whenever a recipe unit differs from the ingredient's stock unit (320g against stock kept in kg). My cancelled draft copied that bug, and it's fixed here.
- New rule: stock is held in the ingredient's `unit` (kg, g, L, ml, oz or each). For each effective line (including linked lines times the multiplier):
  1. Convert the recipe quantity to base g, ml or each with the standard `normalize_unit` and `unit_factor` rules.
  2. Divide by `unit_factor(ingredient.unit)` to get the stock unit. 320g against stock in kg removes 0.32.
  3. If the recipe unit can't be converted to the stock unit (missing unit, or a different kind of measure), don't subtract anything and record a `pos_sync_logs` warning. Never subtract a raw number.
- Existing stock levels, sales and past movements aren't touched. The fix only affects sales recorded after it goes live.

## 5. Keeping restaurants separate
- `recipe_lines_for_dish()` runs with elevated rights, so it gets the same guard as `calculate_dish_cost_at_date`. Unless the call comes from the trusted backend, it raises "not authorized" when the dish's restaurant differs from `get_user_restaurant_id()`. It's also closed to anonymous users.
- The other functions that use it (`calculate_dish_cost`, cost on a date, theoretical usage, stock reduction) already work within the user's own restaurant or run inside a trusted trigger.
- One existing gap found: `calculate_dish_cost(p_dish_id)` and `calculate_dish_margin` don't check the restaurant today. They only return a number, but I'd add the same guard to both.
- `convert_linked_recipe()` runs with the caller's own access rights, so the normal edit rules apply.

## 6. Other behaviour (unchanged from the previous plan)
- Explicit "Convert to own recipe" copies the scaled lines into the dish. That includes the manual cost times the multiplier, with its effective date set to today. The link is then cleared, all in one step.
- Merging dishes moves linked portions over to the master dish.
- Screen: a "Recipe setup" choice between own recipe and based on another dish, a read-only scaled preview with line costs and a manual/calculated badge, the label "Based on X · 2×", a manual cost box on each recipe line, and the manual-versus-calculated comparison with a switch button.

## Technical details
- Migration: new columns on `dishes` and `dish_ingredients`; the link-check trigger; the linked-lines guard; `recipe_lines_for_dish` returning `ingredient_id, quantity, unit, cost_mode, manual_line_cost, manual_cost_effective_from, factor`, with the restaurant guard.
- Rewrite `calculate_dish_cost`, `calculate_dish_cost_at_date` (manual line gives status 'fallback' from its effective date), `get_theoretical_usage_impl` and `reduce_stock_on_sale` (converted units, skip and log when they can't be converted). Add guards to the cost and margin functions. Add `convert_linked_recipe` and the relink-on-merge trigger.
- `get_daily_food_cost` and `get_period_food_cost` don't change. They call `calculate_dish_cost_at_date`.
- Front end: `useDishes`, `useDishCostStatus` (a manual line counts as costed), `DishDetailDialog` and `src/lib/units.ts` (a stock conversion helper that matches the database).

## Please confirm
1. Stock is held in each ingredient's own unit (for example kg). I'll check this against the stock screens before applying.
2. Manual costs apply only from the day they're entered, so past Reports stay the same.
3. Approve applying the combined migration.
