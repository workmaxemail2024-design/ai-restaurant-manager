# Audit: historical food cost, margin and profit recalculation

No code or data was changed. Findings below come from reading the live database functions, the Reports code and your actual September rows.

## How it works today

**Where sold products live.** Each POS product line becomes a row in `sales` (date, location, dish, quantity, total price), created by the Captiva import/apply step. Raw import rows stay in `pos_sales_import`, and day totals in `pos_daily_summaries`. Aggregated period sheets go to the historical product summaries table instead.

**How a sold product becomes a dish.** The POS item list (`external_pos_items`) holds a `mapped_dish_id`; the apply step uses that mapping to write `sales.dish_id`. Unmapped items fall back to a placeholder dish.

**Dish to recipe to cost.** `dish_ingredients` lists ingredient + quantity + unit per dish. `calculate_dish_cost` either returns the dish's direct cost (when "use direct cost" is on) or sums each recipe line: quantity converted to base units × `get_ingredient_base_cost`, which reads the ingredient's **current** pack size / pack cost, falling back to the current default cost price. If any line can't be converted, or the dish has no recipe lines, the function returns "unknown" (null).

**Ingredient price history.** There is an `ingredient_prices` table with timestamps, but the cost engine never uses it — `get_latest_ingredient_price` is only a "latest" lookup and `calculate_dish_cost` doesn't call it at all. Effectively there is **one current cost per ingredient, with no effective dates**.

**Where the Reports figures come from.** Nothing about cost is stored per day. Every figure is computed live each time Reports loads:
- Daily cards (`useDailyBreakdown`) do **not** use recipes at all — food cost is hard-coded at 30% of revenue and Est. Profit is revenue − that 30%. Food Cost % therefore always reads 30.0% and is flagged with an asterisk/"estimated".
- The Daily Financial Summary / dashboard path does use recipes: it sums `calculate_dish_cost` × quantity for the dishes sold, but only trusts it when at least 50% of the sold dishes have a cost; below that it falls back to the same 30% estimate.
- The period KPIs on Reports sum the daily values, so they inherit the 30% estimate.

## Answers to your scenario

- **Add a missing recipe in October → does September improve?** Yes in principle, no in practice today. Because costs are computed live, no re-import is needed. But the Reports daily cards ignore recipes entirely, so September's Food Cost % and Est. Profit stay at 30% no matter how many recipes you complete. Only the financial-summary/dashboard path would improve, and only once recipe coverage passes 50%.
- **Change an ingredient price today → does September change?** Yes, wherever recipe costs are actually used, and incorrectly so. September would be re-costed at today's price, because cost lookup has no date awareness and price history is never consulted. This is a genuine correctness risk once recipes exist.

## Tested against your real September data

September has Products Sold on 1, 11 and 16 Sep (e.g. 1 Sep: 85 product lines, 235 items, €2,398.45). Checked across the whole database: **416 dishes, 0 with a recipe, 0 using a direct cost, 0 recipe lines, 2 ingredients.** So every sold product on 1 Sep is currently missing a cost.

If you completed those recipes now: `sales` rows already carry dish IDs, so the cost engine would immediately see them — no re-import. The daily financial summary would switch from 30% estimated to real recipe cost once over half the sold dishes are costed. The Reports daily cards and the period Food Cost % / Est. Profit would **not** change, because that path never calls the cost engine.

## Audit report

**Already works correctly**
- Sales are stored per dish per day, so historical recalculation is possible without re-importing.
- Costs are computed on read, not snapshotted — completing a recipe can improve the past.
- Dish cost correctly returns "unknown" instead of a misleading zero when a recipe or conversion is missing.

**Works but has limitations**
- Recipe costing only applies in the financial-summary/dashboard path, and is discarded entirely below 50% dish coverage — an all-or-nothing switch rather than "costed part + estimated remainder".
- No per-day record of how complete the costing was at the time.

**Missing functionality**
- Reports daily cards and period KPIs never use recipe costs at all (fixed 30%).
- No dated ingredient cost — `ingredient_prices` exists with timestamps but is unused by the cost engine.
- No per-day "items missing cost" coverage figure driven by real recipe data.

**Risk of historical figures changing incorrectly**
- High, once recipes exist: any ingredient price edit silently re-prices every past month. September margins would move because of an October price change.
- Editing a dish's recipe (not just its price) has the same retroactive effect.

**Minimum changes for reliable historical recalculation**
1. Make Reports use the real cost engine instead of the 30% constant, with a blended result: sum actual cost for costed items, mark the rest as uncosted, and show coverage ("62% of items costed") rather than a silent estimate.
2. Add a date-aware cost lookup: a dish-cost function that takes the trading date and picks the ingredient price effective on that date from the existing price history, falling back to the current cost when no earlier price exists. This stops today's price edits from rewriting September.
3. Ensure ingredient price changes write a dated row into the price history rather than only overwriting the current cost.
4. Keep everything computed on read (no stored snapshots), so completing recipes later still improves the past — with the day's own prices, not today's.

Nothing above has been implemented. Approve and I'll propose the exact migration and code changes for review before running anything.
