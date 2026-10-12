# Stock List Importer: compare against catalogue and supplier price history

## What exists today (audited)

- **Item matching** (client, `stockListImport.ts`): finds exact and possible matches, flags duplicates within the file, and asks you to confirm before creating a separate item. Reused as-is.
- **Supplier-product matching** (`preview_supplier_products`): matches on product code first, then description plus pack. It returns exact, new, new pack variant, pack differs, code differs, description differs, or linked to another item. Reused as-is.
- **Import** (`apply_stock_list_import`, one transaction): when a linked supplier product's price changed, it always adds a new supplier price. You can't currently choose "leave unchanged". It never changes the master cost of items that already have price history.
- **Missing today:** the review screen never shows the *previous supplier price*. The "Price differs" tag only compares against the master item cost. "Supplied by a different supplier" appears as a small note, not as a status.

## What you will get

**Clear status for every row.** Badges for: New item, Existing item, Supplier price unchanged, Price up, Price down, Different supplier for an existing item, and Needs confirmation (uncertain match or different pack). Price up/down badges are prominent (colour plus arrow and %).

**Price comparison panel** on changed rows. It shows the supplier, previous pack price (with its date), new pack price, previous and new cost per kg, L or each, the difference in €, and the % change.
- A % is only shown when both prices use the same kind of unit (weight, volume or count) and the same pack.
- A different pack size or format is flagged as "Different pack — not directly comparable". Only the per-kg/L/each figures are shown for information, with no %.
- Missing prices show "No previous price" or "Unknown", never €0.

**Two separate explicit choices per changed row:**
1. **Supplier price:** "Record new supplier price" or "Leave unchanged". It must be chosen; there is no default. Import stays blocked until every changed row is decided, the same way conflicts work today.
2. **Recipe costing price (optional):** "Also update the master cost used in recipes". It is off by default and only shown to users with Inventory Edit permission. It is never applied automatically. It adds a new dated price entry (effective on the import date) and never edits past prices.

**Filters:** a "Changed prices only" quick filter, plus the existing tag filters for the new statuses. The summary adds counts for price up, price down and unchanged.

**Unchanged:** the one all-or-nothing import, duplicate prevention, existing product mappings, conflict confirmations, tenant isolation, past prices and effective dates. Stock quantities, recipes and POS selling prices are not touched.

## One database change needs your approval

The master-cost option must be saved in the same transaction as the import, and checked on the server. Today's separate price function only checks Manager/Owner, not Inventory Edit. The smallest safe change is to add one optional flag per row (`update_master_price`) to `apply_stock_list_import`. When it is set:
- the server re-checks `can_edit_inventory()`;
- it records a new dated master price through the existing `insert_ingredient_price_row` path, with the same normalisation as `add_ingredient_price`;
- it refuses if the units are not comparable.

Rows without the flag behave exactly as today.

## Backdated lists and master-cost safeguards

- **Import date chosen on the review screen** (defaults to today, cannot be in the future). The comparison uses the supplier price that was effective on that date. If a newer price exists after that date, the row shows "Historical list — a newer price from [date] exists".
- **An older list never replaces the current price.** A backdated supplier price is saved as history only on its own date. The latest price stays the current one, because "current" is always the latest effective date. Master-cost updates on a backdated list are refused when a newer master price already exists.
- **Master-cost update safeguards (checked on the server):**
  - The pack cost is converted into the item's own costing unit (g, ml or each) using the existing unit rules.
  - It is refused if the item's unit and the list's unit are different kinds (for example kg vs each), or if the pack size or unit is missing or unclear.
  - It is dated on the chosen import date and only ever adds a new price row; past prices are never edited.
- Neither "record supplier price" nor "update master cost" is preselected on changed-price rows.

## Technical details

- Previous supplier price: one read-only client query on `supplier_product_prices` (allowed by existing RLS) for the matched `supplier_product_id`s. It takes the latest by `effective_date desc, created_at desc`, the same ordering the import uses for its "unchanged" check. No change to `preview_supplier_products`.
- Comparability: compare `cost_per_base_unit` only when `base_unit` matches (g/ml/each). Display ×1000 for per kg/L. The % is shown only for `exact`, code-differs or description-differs links with the same pack. `pack_differs` and `new_pack_variant` show per-unit figures for information only.
- "Leave unchanged" = send `price: null` for that row. The supplier link is still saved and no supplier price is added. This path is only offered when the item already has price history, so starting prices are unaffected.
- Different-supplier status: reuses the existing `matchNotes` logic (file supplier ≠ item's regular supplier), promoted to a tag. The regular supplier is still never changed.
- Files: `ImportStockListDialog.tsx` (statuses, choices, filter, payload), a new small `PriceChangePanel.tsx`, and helpers in `stockListImport.ts`. Migration: only the `apply_stock_list_import` addition above.
- Tests (rolled back): unchanged / up / down / different pack / different unit; "leave unchanged" adds no supplier price; master update off leaves `ingredient_prices` untouched; master update on adds exactly one dated row; read-only role is refused; another restaurant is refused; fingerprints for stock, recipes and sales are unchanged.
