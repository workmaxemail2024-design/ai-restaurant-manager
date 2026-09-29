# Linked / scaled recipes — proposed schema change (not applied)

## What I found
- A dish's cost today comes from its own recipe lines (`dish_ingredients`) or a flat direct cost (`use_direct_cost`). Nothing lets one dish point at another's recipe.
- **Manual recipe-line costs don't exist in the database yet.** Your note says "the manual recipe-line costing requested above", but that request wasn't in this message. Recipe lines only store ingredient, quantity and unit. Every cost comes from the ingredient's price history or pack price. The design below leaves room for manual line costs. Please send that requirement so both can go in one migration.
- Four places calculate recipe cost, and all four would need to follow the link: the current dish cost, cost on a given date (used by Reports food cost), theoretical stock usage, and stock reduction on sale.

## Proposed schema change (small, adds only)
Two new optional columns on `dishes`:
- `base_dish_id uuid NULL` references `dishes(id)`, `ON DELETE RESTRICT`. A base dish can't be deleted while other dishes link to it.
- `recipe_multiplier numeric NULL`. Required and greater than 0 when `base_dish_id` is set; must be empty otherwise.

Rules enforced by a check trigger (not by the screen):
- The base dish must belong to the same restaurant, can't be the dish itself, and can't be archived or merged.
- No loops: walk up the chain of base dishes and refuse the save if it comes back to this dish. Maximum depth is 5.
- A linked dish can't also have its own recipe lines. Adding a line to a linked dish is refused, so the link is never broken silently.
- Unlinking is only possible through an explicit "Convert to own recipe" action. That action copies the scaled lines into the dish's own recipe and then clears the link, all in one step.

No new tables, no row copies, no RLS or permission changes. Existing dishes aren't affected.

## Cost precedence (per dish)
```text
1. use_direct_cost = true      -> direct_cost (unchanged)
2. base_dish_id set            -> multiplier x base dish's recipe cost,
                                  worked out line by line on the same date
                                  (base's own direct cost is NOT inherited;
                                   a base using direct cost -> linked dish reads "unknown")
3. own recipe lines            -> today's behaviour
4. nothing                     -> no cost
```
- Line cost: each base line's cost (from price history or pack price, or a manual line cost once that exists) is multiplied, so €1.85 at 320g becomes €3.70 at 640g.
- Unknown stays unknown: if any base line is unknown, the linked dish is unknown too, never €0. It keeps the base's status (historical, fallback or unknown).
- Reports on past dates price the base recipe at that date's ingredient prices and multiply. Nothing is stored as a snapshot.
- Theoretical usage and stock reduction use base quantities times the multiplier, so the Large portion uses 640g of wings.

## Screen changes (after approval)
- A new "Recipe setup" choice in Recipe/Ingredients: Own recipe or Based on another dish.
- Base dish picker (same restaurant, excluding itself and any dish that would create a loop) and a multiplier box.
- Read-only preview of the scaled ingredients, line costs and total.
- Label on the dish: "Based on Sml BBQ Crispy Wings · 2×".
- Unlink / Convert to own recipe button with a confirmation.
- On the base dish, a note listing the dishes linked to it.
- Dish cost status and Cost & Margin use the linked calculation.

## Technical details
- Migration: add the two columns, the check trigger, a guard on `dish_ingredients` inserts, and a `convert_linked_recipe(p_dish_id)` function that runs with elevated rights and checks restaurant access first.
- Update `calculate_dish_cost`, `calculate_dish_cost_at_date`, `get_theoretical_usage_impl` and `reduce_stock_on_sale` to resolve the chain up to depth 5.
- `merge_dishes`: when the duplicate is someone's base, move those links to the master.
- Front end: `useDishes`, `useDishCostStatus` and `DishDetailDialog`.

## Waiting on you
1. Approve this schema change and cost precedence.
2. Send the manual recipe-line costing requirement so it's part of the same migration.
