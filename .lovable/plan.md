# Photo / PDF input for the existing Stock List Importer

## Findings

- The Daily Control Centre "supplier document" upload calls the `document-extract` function. It returns **free text plus loose key/value pairs** and **writes to the `documents` table** (status, extracted text). It has no notion of rows, pack sizes or "unclear" values, so reusing it directly would give unreliable rows and would create document records as a side effect.
- What *is* worth reusing from it: the same AI service, the same image/PDF handling, and the same sign-in check.
- The Stock List Importer already turns any table of text cells into rows (`SheetGrid` → column mapping → `interpretRow`) and then runs all the safe steps: supplier/item matching, supplier-product preview and conflict checks, explicit confirmations, and the single all-or-nothing `apply_stock_list_import`. A photo/PDF only needs to produce that same table.

## Approach (simplest reliable)

```text
Upload photo/PDF ─► AI reads it (no saving) ─► "Check extracted rows" screen
   (original shown beside editable rows, unclear cells highlighted)
        ─► existing Review screen (matching, conflicts, confirmations)
        ─► existing atomic import
```

1. **Upload step**: same dialog, now also accepts JPG/PNG/WEBP/PDF, with "Take photo" and "Choose file" buttons for iPad. CSV/XLSX keeps working exactly as today.
2. **Reading**: a small new read-only function `stock-list-extract` sends the file to the AI with a strict row format: supplier, item description, product code, pack size, pack unit, pack cost, purchase unit, notes, plus for every field a "clear / unclear / not present" flag and the raw text seen. Instructions: copy exactly what is written, never guess, never fill in missing values, mark anything illegible as unclear. Stock quantities on the page are ignored entirely (not extracted).
3. **Check extracted rows (new screen, inside the same dialog)**: original image/PDF on one side (zoomable, stacks above the rows in portrait iPad), editable rows on the other. Unclear cells are highlighted amber with the raw text shown; the user can edit, clear, or skip a row. **Continue is blocked until every unclear cell is edited, cleared, or its row skipped.** Missing prices stay blank (Unknown), never €0.
4. **Hand-off**: the checked rows become the same table the spreadsheet path produces, with columns already mapped, then go into the **existing** Review screen unchanged: all supplier matching, pack-aware supplier-product preview, code/description conflict confirmations and the final atomic import are reused as-is.
5. Rows from a photo are labelled "From photo/PDF" in the final summary; nothing is written until the existing Apply confirmation.

## What does not change

- No database changes, no new tables, no change to `apply_stock_list_import`, `preview_supplier_products`, permissions or RLS.
- No stock quantities, recipes, historical costs, POS mappings, POs, documents or sales are touched. The uploaded file is not stored.
- Only users who can already open the importer (Inventory Edit/Admin, Owner) can use it; the function also requires sign-in.

## Limits to be aware of

- Very long PDFs: first ~20 pages per upload; larger lists should be split.
- Handwriting quality varies; the safeguard is the mandatory review of unclear cells, not the AI.
- Uses AI credits per upload.

## Technical details

- New edge function `supabase/functions/stock-list-extract` (verify_jwt = true, added to config.toml); validates the caller's JWT, no service-role use, no DB writes. Lovable AI Gateway, default model `openai/gpt-6-astra` via `/v1/responses`, streamed, strict `json_schema` output (per-field `{value, status: clear|unclear|absent, raw}`), image as `input_image`, PDF as `input_file`. 10 MB limit; 402/429/403 surfaced with the gateway's message, no auto-retry.
- `src/lib/stockListImport.ts`: add `extractedToGrid(rows)` producing a `SheetGrid` with canonical headers so `autoMapColumns` maps everything automatically; the map step is skipped for photo input.
- `ImportStockListDialog.tsx`: accept images/PDF, add `"extracted"` step between upload and review with side-by-side preview (object URL) and a blocking unresolved-cells count; rest of the flow unchanged.
- Verification: test with a sample printed list photo and a handwritten-style sample (generated, not your real lists), confirm unclear cells block Continue, rows reach the existing review with correct pack sizes/prices, blank prices stay Unknown, and no database writes occur before Apply.
