# Inventory improvements 1–6

Reuses the existing inventory items, stock levels and stock-adjustment engine. No new costing or stock maths.

## Schema change required (needs your approval before it runs)

**1. Two new optional fields on existing inventory items** (`ingredients` table)
- `item_group` — Food / Beverage / Operational (free of any effect on costing)
- `category` — Meat, Fish & Seafood, Dairy, Fruit, Vegetables, Dry Goods, Bakery, Frozen, Beer, Wine, Spirits, Soft Drinks, Packaging, Cleaning, Other

Both blank on existing items; used only for grouping and filtering.

**2. A record of genuine physical counts** — so "Last counted" is accurate and never confused with wastage
- New table `stock_counts`: restaurant, location, count date, scope (all / group / category), status, who submitted, when submitted, notes
- New table `stock_count_lines`: the count, the inventory item, expected quantity at count time, counted quantity, difference
- New optional column `count_id` on the existing `stock_adjustments` table, linking a correction back to the count that produced it

Both new tables get the same access rules as existing stock data: scoped to the restaurant, restricted to locations the user is allowed to see, and blocked on closed days.

**3. One extra adjustment reason**
- The existing adjustment type list gains `count`, so a count correction is distinguishable from wastage / staff meal / breakage / manual correction.

Nothing is dropped or renamed. No existing data changes.

## What gets built after the migration

**Groups and categories**
- Group + Category selectors added to the existing inventory item form and quick-add dialog
- Group/Category filters and collapsible grouping on Inventory Items and on Stock on Hand

**Stock page terminology**
- Tabs renamed: Stock on Hand / Adjustments & Wastage / Expected Usage / Variance
- Primary "Count Stock" button
- Short plain-English note: deliveries add stock, wastage removes stock, POS sales only drive expected usage, counts reconcile reality

**Count Stock workflow (iPad-first)**
1. Choose scope: everything, or one group/category, plus location
2. Enter counted quantity per item on a large-tap list, with current on-hand shown
3. Review screen listing only the differences
4. Submit once — creates the count record, and one `count`-type stock adjustment per changed item through the existing correction path, which updates stock levels exactly as today
- Items left blank are skipped; unchanged items create no adjustment but are still recorded as counted

**Last counted / Count due**
- "Last counted" date per item, taken only from submitted counts
- Amber "Count due" badge when older than 7 days or never counted

**Variance view (read-only)**
- Per item: last counted quantity → expected now (last count + deliveries received − expected usage from sales/recipes − adjustments recorded since the count) → current on hand → difference and value
- Reuses the existing theoretical-usage function, purchase-order receipts and adjustment log; count corrections are excluded from the adjustment side so nothing is double-counted

## Rules preserved
POS sales never touch physical stock; received purchase orders still increase it; wastage/staff meals/spoilage/breakage still reduce it via existing adjustments; closed-day locks, location permissions, RLS and all costing stay unchanged.
