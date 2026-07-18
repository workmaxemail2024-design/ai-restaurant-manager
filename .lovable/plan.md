## Historical Product Report / Product Intelligence

Add a separate flow for Captiva yearly / aggregate product reports that gives business intelligence without touching daily sales, dashboard, or reports.

### 1. Database (migration)

New table `historical_pos_product_summaries`:
- `id`, `restaurant_id`, `location_id`, `pos_provider` (default `captiva`)
- `external_item_id`, `item_name`, `department`
- `period_start`, `period_end`, `period_label`
- `quantity_sold`, `gross_sales`, `net_sales`, `vat_amount`, `discount_amount`
- `source_file_name`, `imported_at`, `created_at`, `updated_at`
- Unique key: `(restaurant_id, location_id, pos_provider, external_item_id, period_start, period_end)` → re-import updates, no duplicates.
- GRANTs + RLS scoped by `restaurant_id` (owner/manager write, viewers read).
- Add column `external_pos_items.source` (nullable text) so new rows created from the historical import can be marked `captiva_historical`.

Nothing writes into `sales`, `pos_daily_summaries`, or any daily table.

### 2. Import UI

New component `HistoricalCaptivaImportDialog.tsx` (separate from `CaptivaXLSImportDialog`):
- Upload XLS/XLSX, pick sheet, map columns (ID, Name, Department, Qty, Gross, Net, VAT, Discount).
- User enters `period_label` (e.g. "2026 Full Year"), `period_start`, `period_end`, location.
- Preview totals and row count.
- On confirm:
  - upsert rows into `historical_pos_product_summaries`
  - upsert into `external_pos_items` for any new `external_item_id` (keep POS id, name, department, `needs_review=true`, `source='captiva_historical'`) — never touches existing mapped items' type/cost.
- Prominent banner: "Historical aggregate data — does not affect daily dashboard or reports."

### 3. Product Intelligence page

New route `/analytics/product-intelligence` (added to sidebar under Analytics, existing daily Menu Performance stays untouched):
- Period selector (choose imported period) + location selector.
- KPI cards: Total gross, total qty, item count, new products, needs review, missing cost.
- Revenue-by-type breakdown: Food / Alcoholic / Non-alcoholic / Modifiers / Other.
- Tables: Top by revenue, Top by quantity, Low sellers, New POS products, Products needing review, "Worth costing first" (high revenue AND missing cost).
- Every card labelled "Historical aggregate data — not daily transaction data".

### 4. Review workflow (inline on Product Intelligence page)

For rows in "Needs review", quick actions using existing `external_pos_items.manual_type` + `manual_drink_type`:
- Classify: Food dish / Drink / Alcoholic / Non-alcoholic / Modifier / Ingredient-stock / Ignore.
- "Create/link master dish" — matches by POS id first, then normalised name against existing `dishes`; only creates if no match.
- "Create stock item / ingredient" — opens ingredient create with prefilled name; only runs on explicit click.
- "Mark reviewed" clears `needs_review`.

No auto-creation of dishes or ingredients on import — only on user action.

### 5. Cost Analysis integration (read-only signal)

On the existing Cost Analysis page, add a small "Priority costing (from historical)" panel:
- Lists dishes/POS items with missing cost, ranked by historical revenue/qty.
- Purely advisory — does NOT feed margin calculations, averages, or coverage %.

### 6. Menu Performance mode toggle

Small toggle on existing `ChainMenuPerformancePage`: "Daily sales" (default, current behaviour untouched) / "Historical aggregate". Historical mode reads only from `historical_pos_product_summaries` and shows a persistent banner. No mixing.

### 7. Files touched

New:
- migration
- `src/hooks/useHistoricalPOS.ts`
- `src/components/pos/HistoricalCaptivaImportDialog.tsx`
- `src/pages/ProductIntelligencePage.tsx`

Edited (small, additive):
- `src/App.tsx` — add route
- `src/components/dashboard/PermissionFilteredSidebar.tsx` — add nav link
- `src/pages/POSIntegrationsPage.tsx` — add "Import historical product report" button next to daily import
- `src/pages/CostAnalysisPage.tsx` — add priority costing panel
- `src/pages/ChainMenuPerformancePage.tsx` — add mode toggle

### 8. What will NOT change

Daily Captiva XLS import, `sales`, `pos_daily_summaries`, dashboard, Reports page, daily labour/AOV/profit, existing POS mappings, Dishes page core, Ingredients page core, existing missing-cost logic.

### Technical notes

- Column mapping in the historical importer mirrors the daily importer for consistency (ID / Name / Department / Qty / Gross / Net / VAT / Discount).
- `external_pos_items` upsert uses `onConflict: 'restaurant_id,pos_provider,external_id'` (existing unique index) — will not overwrite `manual_type`, `manual_drink_type`, or existing links.
- Historical hook keys: `['historical-pos', restaurantId, locationId, periodStart, periodEnd]` per project convention.
