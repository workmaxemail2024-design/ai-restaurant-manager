# Apple Pages (.pages) in the Stock List Importer

## Findings

- A modern .pages file is a zip bundle. Its content lives in `Index/*.iwa` files, which are Apple's own undocumented format (Snappy-compressed protobuf), reverse-engineered by the community [1](https://github.com/obriensp/iWorkFileFormat/blob/master/Docs/index.md) [2](https://den-frie-vilje.github.io/cupertino-files/FORMAT.html).
- The bundle also holds `preview.jpg` images, but these show **the first page only**, at low resolution. Using them would silently miss pages and rows, so they are not reliable.
- The AI reader we already use accepts images and PDFs only. It cannot read .pages, and none of our existing tools (the spreadsheet reader, the server reader) can either.
- Reading tables properly would mean adding a third-party reverse-engineered parser. Table cells in Pages are spread across several internal records, and handwritten annotations (Apple Pencil drawings) are stored as drawing data, not text. Library support for Pages tables and drawings is partial and unverified. Apple can add fields at any time, so parsing could break without warning, which is not acceptable for prices.

**Conclusion:** .pages cannot be read reliably with our current setup. I don't recommend building a parser.

## Recommended approach (small, reliable)

Use Apple's own PDF export, which keeps every page, table and handwritten annotation exactly as displayed. Then use the importer's existing PDF path: AI reading, the Check extracted rows screen with the original visible, unclear-value flags, row editing, supplier/item matching and the single all-or-nothing import.

What I'd build:
1. The file picker also accepts .pages files, so the user isn't left with a greyed-out file.
2. Choosing a .pages file **does not import anything**. It shows a clear message with the steps:
   - iPad/iPhone: in Pages, tap ••• → Export → PDF → Save to Files, then choose that PDF here.
   - Mac: File → Export To → PDF.
   - A "Choose the PDF" button opens the picker again.
3. Old-style Pages files ('09 and earlier) get the same guidance.

Your file is never partly read or guessed. It is either a PDF read in full, or a clear request to export one.

## Not changing

No database changes. The AI reader, review screens, matching, permissions and the import process stay as they are.

## If you still want direct .pages reading later

It would need a separate trial first: run a parser library on 3–5 of your real Pages stock lists, compare every row against the PDF export, and adopt it only if they match exactly. Even then, handwriting would still need the PDF route.

## Technical details

- `ImportStockListDialog.tsx`: add `.pages` to `accept`. In `handleFile`, detect by extension (MIME is often empty or `application/x-iwork-pages-sffpages`) before any parsing, and set a dedicated guidance state instead of `parseError`. The guidance renders on the upload step.
- No new dependencies, no server changes.
- Verification: Playwright on the upload step with a dummy `.pages` file confirms the guidance appears, no network request is sent, and PDF/CSV/XLSX/photo uploads behave as before.
