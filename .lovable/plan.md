# Inventory item delete: archive with history, delete only when unused

## Cause
- Delete currently runs a plain delete on the ingredient row.
- The ingredient links to 6 tables that all use "cascade delete": price history, recipe lines, stock levels, purchase order lines, stock adjustments, stock count lines. So one delete would also wipe recipes, purchase history, counts and price history.
- Every ingredient automatically gets a price-history row when it is created (and on each cost change). The price-history protection blocks deleting that row, so the whole delete fails — for every item, even brand-new test items.
- The protection is doing its job: without it, deleting an item would silently erase historical costs and recipes.
- Inventory items have no archive option today (unlike dishes and POS products, which do).

## Proposed database change (needs your approval)
1. Add `archived_at` and `archived_by` to inventory items (empty for all existing items, so nothing changes).
2. Add a safe function `delete_or_archive_ingredient(id)` that checks access and restaurant, then:
   - **Permanent delete** only when the item is completely unused: no recipe lines, no linked dish, no purchase order lines, no stock adjustments or counts, stock is zero or missing, and its only price history is the automatic starting entry (no later price changes). It removes just that automatic entry and the item, using the existing trusted pathway. The general protection stays on for everything else.
   - **Archive** in every other case: sets `archived_at`. No history, recipes, stock or purchase records are touched.
3. Add a read-only dependency check (counts per type) for the confirmation dialog.
4. Add a restore function, or allow clearing `archived_at` with an ordinary update.

Costing and report functions look up ingredients by ID and do not filter on archive status, so past reports and historical dish costs stay the same.

## Frontend
- Delete button opens a confirmation that loads the dependency check and says either:
  - "Permanently delete — this item has never been used", or
  - "Archive — used in X recipes / Y purchase lines / price history. It will be hidden but past reports and costs stay intact."
- Active Inventory Items list and all selectors (recipes, stock, counts, purchase orders, quick-add) hide archived items. A "Show archived" toggle on Inventory Items lets you see and restore them.
- Existing recipe lines that use an archived item still show and cost normally, marked "Archived".

## Not changed
Price-history protection, costing functions, reports, RLS, permissions, existing data.
