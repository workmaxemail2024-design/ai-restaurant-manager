# Phase 1 — Immutable Stock Movement Ledger and Dated Waste

## What exists today (checked live)

- `stock_levels` (on-hand per item and location): **1 row**. `stock_adjustments`, `stock_counts`, `purchase_orders`, `purchase_order_items`: **0 rows**. So no history needs backfilling, and none will be invented.
- `stock_adjustments` has no effective date (it uses `created_at`), no unit cost, and no reversal link. The Daily Control Centre wastage dialog filters by `created_at`, so late waste is always recorded against today.
- Receiving a delivery (`usePurchaseOrders`) sets status `received`, then updates `stock_levels` **from the browser**, in several separate calls. A database trigger (`update_stock_on_purchase`) also adds stock when status becomes `completed`. Nothing uses `completed` today, so stock is not added twice yet, but that is luck rather than a guarantee.
- Stock counts update `stock_levels` and write `count` adjustments from the browser, in several non-atomic steps.
- `reduce_stock_on_sale` exists but is not attached to `sales`. POS sales do not move physical stock, and Phase 1 keeps it that way.
- Closed-day guards already exist on adjustments, counts and count lines.
- Invoice uploads (`documents`) never touch stock. Phase 1 keeps it that way.

## What Phase 1 delivers

1. **One movement ledger** (`stock_movements`). Every confirmed physical movement gets one append-only row: restaurant, location, item, signed quantity in the item's stock unit, **effective date**, movement type, source reference, unit cost at that date, who recorded it, and when.
   - Movement types: `opening_balance`, `receipt`, `waste`, `spoilage`, `damage`, `staff_meal`, `count_correction`, `manual_correction`, `reversal`.
2. **Stock on hand stays in step with the ledger.** Only ledger writes change `stock_levels`, through one database function, in the same transaction. The browser stops writing `stock_levels` directly.
3. **Dated receiving.** Receiving a delivery records:
   - the physical delivery date (required; can be in the past, for late deliveries);
   - optional supplier invoice number and invoice date;
   - received quantity and unit cost per line.

   The payment date is not part of receiving. It gets a nullable placeholder column only and is used in a later phase.
4. **Duplicate-receipt protection.**
   - A purchase order can be received only once.
   - A supplier, invoice number and location can be received only once, whether it arrives on a purchase order or as a direct delivery.
   - Each receipt line is unique per source.
   - If an invoice is later linked to a delivery that was already received, it is attached as a reference and adds no stock.
5. **Dated waste.** The wastage dialog gets an "occurred on" date (defaults to the dialog's day, can be backdated). The cost used is the item's dated cost (`get_ingredient_cost_at_date`), or **unknown** (NULL) when there is no price, never €0.
6. **Counts reconcile through the ledger.** On submit, each counted line writes one `count_correction` movement for (counted − expected on hand at the count's date and time), plus the count lines themselves. Lines with no difference write nothing. This happens in one transaction through `submit_stock_count`.
7. **Corrections by reversal only.** You cannot edit or delete a movement. "Reverse" creates an opposite movement that links back to the original, with a required reason, and logs it to `audit_logs`. A replacement entry can then be recorded.
8. **Opening balance for existing on-hand stock.** The existing `stock_levels` row(s) get one `opening_balance` movement each, dated at migration time and marked "pre-ledger, unknown cost". No earlier history is invented.

Out of scope for Phase 1: Reports, profit and food-cost calculations, POS sales depletion, invoice line extraction, payments.

## Technical details

### Database (one migration, needs your approval)

- New table `public.stock_movements`:
  - Columns: id, restaurant_id, location_id, ingredient_id, movement_type, quantity (numeric, signed, non-zero), effective_date (date), effective_at (timestamptz), unit_cost (numeric, nullable = unknown), cost_source (`dated_history` / `receipt_line` / `unknown` / `pre_ledger`), source_type (`purchase_order` / `direct_delivery` / `adjustment` / `stock_count` / `reversal` / `opening`), source_id, source_line_id, reverses_movement_id (unique, nullable), reason, created_by, created_at.
  - Grants: SELECT to authenticated; ALL to service_role. No INSERT/UPDATE/DELETE for authenticated.
  - RLS: read only within the user's restaurant and locations they can access. Writes only through SECURITY DEFINER functions.
  - Triggers: block UPDATE and DELETE for everyone except a trusted backend session; check that restaurant, location and item all belong to the same restaurant.
  - Unique indexes:
    - (source_type, source_line_id) where source_line_id is not null — stops a receipt or count line from being applied twice;
    - reverses_movement_id — stops the same movement from being reversed twice.
  - Foreign keys use ON DELETE RESTRICT (archived items keep their history).
- Changes to `purchase_orders`:
  - add `delivery_date` date, `invoice_number` text, `invoice_date` date, `payment_date` date (nullable, not used yet), `received_by` uuid, `document_id` uuid (nullable, same-restaurant check);
  - unique partial index on (restaurant_id, supplier_id, location_id, lower(invoice_number)) where invoice_number is not null and status = 'received'.
- Changes to `purchase_order_items`: add `received_quantity` numeric, `received_unit_cost` numeric (nullable).
- Changes to `stock_adjustments`: add `effective_date` date (backfill not needed, since the table has 0 rows; default `operating_day(now())`), `movement_id` uuid. The existing table stays the place for reason and context; the ledger row holds the quantity.
- New SECURITY DEFINER functions (search_path pinned; each checks `can_edit_inventory()`, location access and closed-day lock via `assert_day_open` for the effective date; EXECUTE revoked from public and anon, granted to authenticated):
  - `record_stock_movement_internal(...)` — inserts the ledger row and upserts `stock_levels` in one place (not callable by users).
  - `receive_purchase_order(po_id, delivery_date, invoice_number, invoice_date, lines jsonb)` — refuses a PO that is already received or a duplicate invoice number; writes receipt movements at the line cost; sets status `received` and `received_at`; all in one transaction.
  - `receive_direct_delivery(supplier_id, location_id, delivery_date, invoice_number, invoice_date, lines jsonb)` — same duplicate rules; creates a received PO record so every receipt has a source.
  - `record_stock_adjustment(ingredient, location, type, qty, effective_date, reason)` — writes the adjustment and a negative movement with its dated cost.
  - `submit_stock_count(header, lines jsonb)` — writes the count, its lines and the correction movements atomically.
  - `reverse_stock_movement(movement_id, reason)` — writes the opposite movement, updates on-hand stock and writes an audit log entry.
- Retire the dormant `update_stock_on_purchase` trigger (drop the trigger, keep the function), so receipts can only enter through the ledger. Status `completed` is unused, so behaviour does not change.
- Backfill: one `opening_balance` movement per existing `stock_levels` row, with quantity equal to the current quantity (skipped if 0) and unknown cost. Before and after fingerprints of `stock_levels` must match.
- On-hand quantity stays clamped at no less than zero, as it is now. If a movement would take stock below zero, it is stored as entered and a warning flag is recorded, so differences are not hidden.

### Frontend (rewire to the new functions; no new screens)

- `src/hooks/usePurchaseOrders.ts`: receiving calls `receive_purchase_order`; direct `stock_levels` writes removed.
- `src/components/purchase-orders/ReceiveDeliveryModal.tsx`: adds delivery date (required, can be backdated), invoice number and invoice date, plus received quantity and cost per line; shows a clear "already received" / "duplicate invoice" error.
- `src/hooks/useStockAdjustments.ts`, `src/hooks/useDayStock.ts`: writes go through `record_stock_adjustment`; the day view filters on `effective_date`.
- `src/components/dashboard/StockWastageDialog.tsx`: adds an "Occurred on" date; spot counts go through the count function.
- `src/hooks/useStockCounts.ts`, `StockCountDialog.tsx`: submit through `submit_stock_count`.
- `src/hooks/useStock.ts`: the direct "set stock" upsert is replaced by a `manual_correction` movement for the difference.
- `src/components/inventory/StockAdjustmentLog.tsx`: lists movements (date, type, quantity, cost or Unknown, source) and adds a Reverse action with a required reason, shown only to users with Inventory Edit.
- Reports, profit and food-cost code: untouched.
- `AGENTS.md`: add one rule — physical stock changes only through `stock_movements` functions.

### Tests (inside a transaction that is rolled back, plus a production fingerprint check)

1. Migration: `stock_levels`, prices, recipes, sales, POs and documents fingerprints unchanged; one opening-balance row created; a second run creates no duplicates.
2. Receive a PO with a backdated delivery date → correct quantity, date and cost; on-hand stock increases once; receiving again is refused; the same invoice number on a direct delivery is refused; nothing is left half-written.
3. Linking an invoice document to a received PO adds no stock.
4. Waste backdated to an open day → dated cost or unknown; refused on a closed day.
5. Stock count → correction movements equal to the differences; on-hand stock equals the counted quantity; unchanged lines write nothing.
6. Reversal → net zero; reversing twice refused; audit log written; editing or deleting a movement refused.
7. Permissions: a read-only user is refused on every write; a Manager with Inventory Edit is allowed; a user from another restaurant cannot read or write; a direct table insert is refused.
8. Check that the sum of movements equals `stock_levels` for every item and location.
9. Typecheck/build; Reports output unchanged.

### Rollback

All changes add new things except dropping the dormant trigger (it can be re-created verbatim). Rolling back means dropping the new functions, table and columns and re-creating the trigger. Existing data is never rewritten.
