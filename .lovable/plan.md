# Combined Plan — Stock Ledger, Supplier Invoices, Actual Food Cost, Reports Reconciliation

The four phases below are built in order (1 → 4), each reusing the one before it. Once you approve this, everything is built without further approvals unless a genuine security or data-integrity blocker comes up.

## What exists today (checked live)

- Stock: `stock_levels` has 1 row. `stock_adjustments`, `stock_counts`, `purchase_orders`, `purchase_order_items` and `documents` are all empty, so no history has to be backfilled and none will be invented.
- Receiving a delivery updates stock from the browser in several separate steps. A database trigger (`update_stock_on_purchase`, which fires on status `completed`) could also add the same stock. Nothing uses `completed` today, so stock is not added twice yet, but nothing prevents it either.
- Adjustments are dated only by when they were typed in, so late waste always lands on today.
- `supplier_products` (24) and append-only `supplier_product_prices` (24) exist, and the price table already links to documents and purchase orders.
- `documents` already stores OCR output (`extracted_data`) and has a `purchase_order_id` link. Uploading a document never changes stock.
- Reports food cost today is theoretical: recipe cost × POS sales, using dated price history, with unknown kept as unknown.

---

## Phase 1 — Immutable stock movement ledger

### Ledger
- New append-only `stock_movements` table. Each row holds: restaurant, location, item, signed quantity in the stock unit, `effective_at` and `effective_date`, type, source (type, id and line), unit cost (NULL = unknown) with its cost source, who recorded it and when.
- Types: `opening_balance`, `receipt`, `waste`, `spoilage`, `damage`, `staff_meal`, `count_correction`, `count_rebase`, `manual_correction`, `reversal`.
- Movements can never be updated or deleted. Corrections are made by reversal only: an opposite movement linked to the original, with a required reason, logged to `audit_logs`. A movement can be reversed once.
- `stock_levels` changes only through one internal function, in the same transaction as the movement. The browser no longer writes stock directly, and the dormant purchase trigger is removed.

### Negative stock policy (resolved)
- `stock_levels.quantity` = the exact sum of that item's movements at that location. Nothing is clamped at zero.
- A negative balance is allowed and stored as it is. The UI shows it with a "Negative stock — check counts/receipts" warning, and Phase 3 treats it as a data-quality flag.
- A nightly-free reconciliation check (`stock_ledger_drift()`) lists any item and location where the ledger total ≠ `stock_levels`. The tests require this list to be empty.

### Late entries after a count (resolved)
- A count states a fact: on-hand at the count time = the counted quantity. The count writes a `count_correction` = counted − (ledger balance at the count time).
- When a delivery, waste or correction is entered with an `effective_at` before an existing later count for the same item and location, the same transaction also writes a `count_rebase` movement at that count's time, equal to minus the late quantity. This happens once per affected later count; only the most recent later count matters, because earlier ones are already anchored by it.
- Result: the late movement shows up in its own period (its receipts, waste and value), the balance after the count still equals the counted quantity, and today's stock is unchanged. The count's variance moves to the right period. Every rebase is labelled "auto-adjusted due to late entry X" and audited.
- Reversals of late entries follow the same rule.

### Receiving (physical event only)
- `receive_purchase_order` and `receive_direct_delivery` take a required physical `delivery_date` (can be backdated) and per-line received quantity and cost. Everything is written in one transaction.
- Duplicate protection:
  - a purchase order can be received once;
  - a receipt line can be applied once;
  - a receipt can be linked to at most one invoice, and an invoice to at most one receipt (Phase 2).
- Linking an invoice to an existing receipt adds no stock.

### Waste, counts, manual set
- `record_stock_adjustment` gets an `effective_date`. The cost is the item's dated cost, or Unknown, never €0.
- `submit_stock_count` writes the header, lines and corrections atomically.
- The direct "set stock" action becomes a `manual_correction` for the difference.

### Opening balance
- One `opening_balance` movement for each existing `stock_levels` row: dated at migration time, cost marked "pre-ledger, unknown". The fingerprint of `stock_levels` must stay unchanged.

All Phase 1 write functions check `can_edit_inventory()`, location access, the closed-day lock (`assert_day_open`) for the effective date, and that restaurant, location and item all match.

---

## Phase 2 — Supplier invoices, verification, payments (three separate events)

- **Invoice** (a financial document): new `supplier_invoices` table.
  - Columns: supplier, `doc_type` (invoice or credit note), invoice number, invoice date, due date, net, VAT, gross, status (`draft` → `verified` → `void`), `document_id`, `receipt_id` (nullable), `credits_invoice_id` for credit notes.
  - Unique on (restaurant, supplier, lower(invoice_number), doc_type) excluding void, so the same invoice cannot be entered twice.
- **Invoice lines**: new `supplier_invoice_lines` table with description, code, quantity, pack size and unit, unit price, line total, VAT rate, `supplier_product_id`, `ingredient_id`, and a match status (`exact` / `confirmed` / `new` / `non_stock` / `unresolved`).
- **OCR**:
  - Reuse the existing upload and `document-extract` storage path.
  - Add an `invoice-extract` mode that only reads, with the same compact schema as `stock-list-extract`: unclear values are marked `?` and never guessed.
  - Line matching reuses `preview_supplier_products` (pack-aware, conflicts confirmed explicitly).
- **Verification screen**:
  - The original document sits beside editable lines.
  - Line totals and the invoice total are checked; a mismatch blocks verification.
  - Verifying writes `supplier_product_prices` with source `invoice` (append-only, using the existing function) and never changes the master recipe cost unless you explicitly tick that option, as in the importer.
- **Receipt link**: from a verified invoice the user can either:
  - link it to an existing receipt (quantities compared and differences shown), or
  - "Receive goods" with its own physical delivery date (pre-filled, editable), using the Phase 1 functions.

  An invoice on its own never moves stock.
- **Payments**: new `supplier_payments` table (payment date, amount, method, reference) and `supplier_payment_allocations` (payment → invoice or credit note, amount). The payment date lives only here.
- Permissions: invoices and payments need Inventory Edit or Owner, and a new Role Builder permission key `suppliers.finance` for payments. Everything is restaurant-scoped through RLS plus same-restaurant triggers.

---

## Phase 3 — Actual vs theoretical food cost

Read-only SQL functions, calculated on demand with no snapshots:

- `stock_valuation_at(restaurant, location, at)` — sum of quantity × dated cost per item. Items with unknown cost are counted and listed, never valued at €0.
- `get_period_actual_food_cost(restaurant, location, start, end)` returns:
  - opening and closing value (from the counts at or nearest the period boundaries, otherwise the ledger balance);
  - receipts value;
  - waste value by type;
  - **actual COGS** = opening + receipts − closing;
  - theoretical COGS (the existing `get_period_food_cost`, unchanged);
  - **unexplained variance** = actual − theoretical − waste;
  - completeness: a count at both boundaries, every receipt costed, no unknown-cost items, no unverified or unlinked invoices, no negative balances.
  - Status: `complete` when every check passes, otherwise `estimate` with the list of reasons.

---

## Phase 4 — Reports integration and reconciliation

- **Reports**:
  - The existing daily and monthly figures stay unchanged.
  - A new "Actual vs Theoretical" section is added to the monthly view, plus a weekly period option. It shows actual COGS, theoretical, waste, variance, stock value and a Complete / Estimate badge with reasons.
  - Missing data shows as Unknown, never €0.
- **Retrospective recalculation**: automatic, because every figure is calculated live from dated, immutable records. A late delivery or waste entry changes the period it belongs to the next time Reports loads. There are no stored snapshots to go stale.
- **Supplier statements**: new `supplier_statements` table (supplier, statement date, period, closing balance, document) and `supplier_statement_lines` (reference, date, amount, type).
  - Lines are automatically matched to invoices, credit notes and payments by number and amount; you confirm any uncertain match.
  - The screen shows matched, missing from our records, missing from the statement, and amount differences, plus the computed vs the stated balance.
- **Cash Flow**: verified invoices and payments show as a separate "Supplier invoices / payments" line. They do not replace existing expense logic.

---

## Technical details

### Database (one migration per phase, applied in order; each in a transaction)
- **P1**:
  - `stock_movements` with grants (SELECT for authenticated, ALL for service_role), RLS, block-update/delete trigger, tenant trigger, and unique indexes on (source_type, source_line_id) and on reverses_movement_id;
  - new columns on `purchase_orders` (delivery_date, received_by) and `purchase_order_items` (received_quantity, received_unit_cost), and `effective_date` / `movement_id` on `stock_adjustments`;
  - functions: `apply_movement_internal`, `receive_purchase_order`, `receive_direct_delivery`, `record_stock_adjustment`, `submit_stock_count`, `reverse_stock_movement`, `stock_ledger_drift`;
  - drop trigger `trigger_update_stock_on_purchase` (keep its function);
  - opening-balance backfill.
- **P2**: `supplier_invoices`, `supplier_invoice_lines`, `supplier_payments`, `supplier_payment_allocations` (grants, RLS, tenant and duplicate constraints, verified invoices are immutable apart from voiding); `verify_supplier_invoice`, `link_invoice_receipt`, `record_supplier_payment`; add `invoice` to the allowed sources for supplier prices; `suppliers.finance` permission.
- **P3**: `stock_valuation_at`, `get_period_actual_food_cost` (security invoker, so RLS applies).
- **P4**: `supplier_statements`, `supplier_statement_lines`, `reconcile_supplier_statement`.
- Every SECURITY DEFINER function pins search_path, revokes access from public and anon, and validates its JSON input.

### Frontend
- **P1**:
  - `usePurchaseOrders.ts` and `ReceiveDeliveryModal.tsx` (delivery date, per-line quantity and cost, duplicate errors);
  - `useStockAdjustments.ts`, `useDayStock.ts`, `StockWastageDialog.tsx` ("Occurred on");
  - `useStockCounts.ts`, `StockCountDialog.tsx`, `useStock.ts`;
  - `StockAdjustmentLog.tsx` becomes the movement history with Reverse, rebase labels and negative-stock badges.
- **P2**: `supplier-invoice-extract` edge function (read-only); new `SupplierInvoiceReview` dialog launched from the Documents page and `QuickSupplierDocDialog`; an invoice tab and payments on the Suppliers page; invoice link on purchase orders.
- **P3/P4**: `useActualFoodCost` hook; `ActualVsTheoreticalBlock` in `MonthlyReportsView` with a weekly option; `SupplierStatementReconciliation` on the Suppliers page; a line in `CashFlowReport`.
- `AGENTS.md` rules: stock changes only through ledger functions; invoices, receipts and payments are separate records; actual cost is computed live, without snapshots.
- `roadmap.md`: the four phases are added as tasks when the Build starts.

### Dependencies
P1 ledger → P2 receipt linking → P3 valuation and COGS → P4 Reports and statements. The Lovable AI Gateway is used for invoice OCR (already in use).

### End-to-end acceptance tests (inside rolled-back transactions; production fingerprints compared before and after)
1. **Migrations**: existing stock, prices, recipes, sales, POS, supplier products and documents are unchanged; one opening balance per stock row; re-running the migration creates nothing new.
2. **Receiving**: a backdated receipt adds stock once; receiving again or a duplicate line is refused; a half-failed receipt leaves nothing behind.
3. **Late entries**: count on day 10 = 20 kg; waste of 2 kg entered for day 8 → day-8 waste is recorded, a rebase is written, stock after the count stays 20, today's stock is unchanged, and the drift check is empty.
4. **Negative stock**: waste larger than on-hand → the balance goes negative, the ledger sum equals `stock_levels`, and a warning flag is shown.
5. **Reversal**: nets to zero; a second reversal is refused; an update or delete of a movement is refused.
6. **Invoices**: a duplicate invoice number is refused; verifying does not change stock; "Receive goods" posts a receipt on its delivery date; an invoice cannot be linked to two receipts; a credit note reduces the supplier balance; the payment date stays separate.
7. **OCR**: an unclear line blocks verification until fixed; a total mismatch blocks verification.
8. **Food cost**: a seeded period gives the expected actual, theoretical, waste and variance; an unknown-cost item gives an Estimate with a reason; a late receipt changes only its own period.
9. **Statement**: missing invoice, unmatched payment and amount differences are each detected.
10. **Security**: read-only users are refused on every write; a Manager with Inventory Edit is allowed; payments need `suppliers.finance`; another restaurant cannot read or write; direct table inserts are refused.
11. **Existing figures**: Reports' existing daily and monthly figures are identical before and after; typecheck and build pass.

### Rollback
Each phase only adds things, apart from dropping the dormant trigger, which can be re-created verbatim. A phase rolls back by dropping its new functions, tables and columns. Existing data is never rewritten.
