# Edit rows on the Stock List Importer review screen

## What you will get

- An **Edit** button on every row of the final review (including skipped rows).
- It opens a compact panel, prefilled with what was read from the file/photo: product name, supplier, product code, category, item type, storage type, purchase unit, purchase quantity, pack size, pack unit (also the inventory unit) and cost per pack.
- **Save** immediately re-checks the row: status tags, missing info, calculated cost per g/ml/each, and whether it can be imported. A row skipped for missing information becomes importable once its unit and name are filled in.
- Cost per pack can stay blank, and the row then shows Missing cost (never €0). Entering 0 is treated as unknown, as it is today.
- After an edit, the existing item matching and supplier-product checks run again for that row (pack-aware, code/description conflicts). If the name, supplier, code or pack changed, any decision you already made for that row is cleared. That way an old "link to existing" choice is never silently reused. Other rows keep their decisions.
- An "Edited" tag marks changed rows. **Revert** restores the original values.
- Nothing is saved until the existing final Import confirmation, and the same single all-or-nothing import is used.

## One point to note

The existing import stores the item's inventory unit as its pack unit, because the master cost is per pack unit. Allowing them to differ would change the import's costing, so the panel shows one "Pack / inventory unit" choice (each, g, kg, ml, L). The base costing unit (g/ml/each) is shown next to it.

## iPad layout

Side panel on landscape, full-height sheet on portrait. Large fields and buttons (44px+), dropdowns for category/item type/storage/units, decimal keypad for numbers. Save/Cancel stay visible at the bottom.

## Not changing

No database or schema changes. Matching, conflict rules, permissions, the import function and stock quantities are untouched.

## Technical details

- Edits modify the row's `RawRow` and re-run the existing `interpretRow`, replacing that entry in `parsed`. All downstream memos (`rowPlans`, `supplierPlans`, `previewRows` → `preview_supplier_products` query) recompute automatically, so no matching logic is duplicated.
- Category/item type are written as canonical values that `parseCategory`/`parseItemType` already accept. Editing cost clears the file's `unitCost` column for that row, so no stale mismatch warning is left behind.
- Storage type: a new per-row `storageOverride` map. In `apply()`, `storage_type` becomes `storageOverride[row] ?? defaultStorage(...)`, which is the only change to the payload builder.
- On identity-relevant changes, clear `itemChoice[row]` and `spChoice[row]` for that row. Keep `originalRaw` per row for Revert/"Edited".
- New component `src/components/inventory/EditImportRowSheet.tsx` (Sheet). Wire-up goes in `ImportStockListDialog.tsx`.
- Verification: Playwright with a small CSV whose row has no unit (skipped). Edit it to add pack size, unit and cost, then confirm the tags, calculated cost and eligibility update. Confirm that a blank cost shows Missing cost and that no network writes happen before Import. A signed-in run isn't available here, so the item lists will be empty in testing.
