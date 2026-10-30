import { useMemo, useState } from "react";
import { format } from "date-fns";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocations } from "@/hooks/useLocations";
import { useOverheads } from "@/hooks/useOverheads";
import {
  useActualExpenses, useActualPayroll, useApplyExpenseImport, useExpenseImportBatches, useSupplierInvoicesForDuplicates,
} from "@/hooks/useExpenseImport";
import {
  effective, fileHash, findDuplicate, interpretRow, matchLocation, parseAmount, readExpenseWorkbook, rowIssues,
  suggestReplacedEstimate, toPayloadRow, monthStart,
  type ExistingOverhead, type ExistingPayroll, type ReviewRow, type SheetResult, type SourceRow,
} from "@/lib/expenseImport";
import { ExpenseReviewRowCard } from "./ExpenseReviewRowCard";

interface SheetState {
  name: string;
  recognised: boolean;
  rowCount: number;
  locationId: string | null; // null = not chosen
  ignored: boolean;
  confidence: "exact" | "suggested" | "none";
  confirmed: boolean;
}

type Cell = { value: string | null; status: "clear" | "unclear" | "absent"; raw: string | null };

async function fileToPayload(f: File): Promise<{ b64: string; mime: string }> {
  if (f.type.startsWith("image/")) {
    const bmp = await createImageBitmap(f);
    const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return { b64: c.toDataURL("image/jpeg", 0.85).split(",")[1] ?? "", mime: "image/jpeg" };
  }
  if (f.size > 10 * 1024 * 1024) throw new Error("File is larger than 10 MB.");
  const b64 = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(new Error("Could not read the file."));
    r.readAsDataURL(f);
  });
  return { b64, mime: f.type };
}

/** Rows read from a PDF/photo → worksheet-like groups. Unclear cells stay blank and are listed in notes. */
function extractedToSheets(rows: Record<string, Cell>[], fallback: string): SheetResult[] {
  const groups = new Map<string, SourceRow[]>();
  rows.forEach((r, i) => {
    const v = (k: string) => (r[k]?.status === "clear" ? r[k]?.value ?? "" : "");
    const unclear = Object.entries(r).filter(([, c]) => c?.status === "unclear").map(([k, c]) => `${k}${c.raw ? ` (${c.raw})` : ""}`);
    const sheet = v("section") || r.section?.raw || fallback;
    const notes = [v("notes"), unclear.length ? `Unclear in file: ${unclear.join(", ")}` : ""].filter(Boolean).join(" · ");
    const list = groups.get(sheet) ?? [];
    list.push({
      sheet, rowNumber: i + 1, category: v("category"), supplier: v("supplier") || r.supplier?.raw || "",
      monthly: v("monthly"), quarterly: v("quarterly"), annual: v("annual"), type: v("type"), notes,
      invoiceRef: v("invoiceRef"), amount: v("amount"), billDate: v("billDate"), vatAmount: v("vatAmount"),
    });
    groups.set(sheet, list);
  });
  return [...groups.entries()].map(([name, list]) => ({ name, recognised: true, rows: list }));
}

const sourceTypeOf = (f: File): "xlsx" | "csv" | "pdf" | "image" =>
  /\.csv$/i.test(f.name) ? "csv" : f.type === "application/pdf" || /\.pdf$/i.test(f.name) ? "pdf" : f.type.startsWith("image/") ? "image" : "xlsx";

export function ImportExpensesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: locations = [] } = useLocations();
  const { data: overheads = [] } = useOverheads(null);
  const { data: actuals = [] } = useActualExpenses("2000-01-01", "2100-12-01");
  const { data: payroll = [] } = useActualPayroll("2000-01-01", "2100-12-01");
  const { data: batches = [] } = useExpenseImportBatches();
  const { data: supplierInvoices = [] } = useSupplierInvoicesForDuplicates(open);
  const apply = useApplyExpenseImport();

  const [file, setFile] = useState<File | null>(null);
  const [hash, setHash] = useState("");
  const [fileKind, setFileKind] = useState<"estimate" | "actual">("estimate");
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SheetState[]>([]);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [importStart, setImportStart] = useState("");
  const [importPeriod, setImportPeriod] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const currentMonth = format(new Date(), "yyyy-MM");
  const locName = (id: string | null) => locations.find((l) => l.id === id)?.name ?? "";

  const reset = () => {
    setFile(null); setHash(""); setSheets([]); setRows([]); setReadError(null); setApplyError(null);
    setImportStart(""); setImportPeriod("");
  };

  const read = async (f: File) => {
    setReading(true); setReadError(null); setApplyError(null);
    try {
      const h = await fileHash(f);
      const type = sourceTypeOf(f);
      let result: SheetResult[];
      if (type === "xlsx" || type === "csv") {
        result = await readExpenseWorkbook(f);
      } else {
        const { b64, mime } = await fileToPayload(f);
        const { data, error } = await supabase.functions.invoke("expense-sheet-extract", { body: { fileBase64: b64, mimeType: mime, fileName: f.name } });
        if (error) {
          let msg = error.message;
          try { msg = (await (error as { context?: Response }).context?.json())?.error ?? msg; } catch { /* keep */ }
          throw new Error(msg);
        }
        if (data?.error) throw new Error(data.error);
        result = extractedToSheets((data?.rows ?? []) as Record<string, Cell>[], f.name.replace(/\.[^.]+$/, ""));
      }
      if (!result.some((s) => s.rows.length)) throw new Error("No expense rows were found. Check the file has Category / Expense / Monthly Cost columns.");
      setFile(f); setHash(h);
      setSheets(result.map((s) => {
        const m = matchLocation(s.name, locations);
        return { name: s.name, recognised: s.recognised, rowCount: s.rows.length, locationId: m.locationId, ignored: !s.recognised, confidence: m.confidence, confirmed: m.confidence === "exact" };
      }));
      setRows(result.flatMap((s) => s.rows.map((r) => interpretRow(r, fileKind, h))));
    } catch (e) {
      setReadError(e instanceof Error ? e.message : "Could not read this file.");
    } finally {
      setReading(false);
    }
  };

  const sheetByName = useMemo(() => new Map(sheets.map((s) => [s.name, s])), [sheets]);
  const overheadRefs: ExistingOverhead[] = useMemo(() => overheads.map((o) => ({
    id: o.id, location_id: o.location_id, name: o.name, supplier_name: (o as { supplier_name?: string | null }).supplier_name ?? null,
    category: o.category, amount: Number(o.amount), frequency: o.frequency, is_active: o.is_active, start_date: o.start_date, end_date: o.end_date,
  })), [overheads]);

  /** Per-row effective location/month, duplicate finding and blocking issues. */
  const evaluated = useMemo(() => {
    const earlier: { locationId: string | null; periodMonth: string; supplier: string; name: string; amount: number | null; invoiceRef: string }[] = [];
    return rows.map((row) => {
      const sheet = sheetByName.get(row.sheet);
      const sheetLoc = sheet && !sheet.ignored ? sheet.locationId : null;
      const eff = effective(row, sheetLoc, importStart, importPeriod);
      const ignored = !!sheet?.ignored;
      const amount = parseAmount(row.amount);
      const duplicate = ignored || row.kind === "skip" ? null : findDuplicate(
        { kind: row.kind, locationId: eff.locationId, periodMonth: eff.periodMonth, supplier: row.supplier, name: row.name, amount, invoiceRef: row.invoiceRef, sourceRef: row.sourceRef, frequency: row.frequency, startMonth: eff.startMonth },
        { actuals, supplierInvoices, overheads: overheadRefs, earlierRows: earlier },
      );
      const existingPayroll: ExistingPayroll | null = row.kind === "payroll" && eff.locationId && eff.periodMonth
        ? (payroll.find((p) => p.status === "active" && p.location_id === eff.locationId && p.period_month === monthStart(eff.periodMonth)) as ExistingPayroll | undefined) ?? null
        : null;
      const ctx = { ...eff, duplicate, existingPayroll, currentMonth };
      const issues = ignored ? [] : rowIssues(row, ctx);
      if (!ignored && row.kind !== "skip") earlier.push({ locationId: eff.locationId, periodMonth: eff.periodMonth, supplier: row.supplier, name: row.name, amount, invoiceRef: row.invoiceRef });
      const suggestion = row.kind === "actual" && !row.replacesOverheadId ? suggestReplacedEstimate({ locationId: eff.locationId, name: row.name, supplier: row.supplier, category: row.category }, overheadRefs) : null;
      return { row, ctx, issues, ignored, sheetLoc, suggestion };
    });
  }, [rows, sheetByName, importStart, importPeriod, actuals, supplierInvoices, overheadRefs, payroll, currentMonth]);

  const included = evaluated.filter((e) => !e.ignored && e.row.kind !== "skip");
  const blocking = included.filter((e) => e.issues.length > 0).length;
  const unconfirmedSheets = sheets.filter((s) => !s.ignored && (!s.locationId || !s.confirmed));
  const counts = {
    estimate: included.filter((e) => e.row.kind === "estimate").length,
    actual: included.filter((e) => e.row.kind === "actual").length,
    payroll: included.filter((e) => e.row.kind === "payroll").length,
    skipped: evaluated.length - included.length,
  };
  const sameFile = hash ? batches.find((b) => b.file_hash === hash) : undefined;
  const needsStart = included.some((e) => e.row.kind === "estimate");
  const needsPeriod = included.some((e) => e.row.kind !== "estimate");
  const canApply = included.length > 0 && blocking === 0 && unconfirmedSheets.length === 0 && !apply.isPending;

  const patchRow = (key: string, patch: Partial<ReviewRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const patchSheet = (name: string, patch: Partial<SheetState>) =>
    setSheets((ss) => ss.map((s) => (s.name === name ? { ...s, ...patch } : s)));
  const setAllKind = (kind: "estimate" | "actual") =>
    setRows((rs) => rs.map((r) => (r.kind === "estimate" || r.kind === "actual" ? { ...r, kind } : r)));

  const doApply = async () => {
    setApplyError(null);
    const payloadRows = included.map((e) => toPayloadRow(e.row, e.ctx, locName(e.ctx.locationId)));
    const usedLocations = [...new Set(included.map((e) => e.ctx.locationId))];
    try {
      await apply.mutateAsync({
        file, filename: file?.name ?? "Expense import", fileHash: hash, sourceType: file ? sourceTypeOf(file) : "manual",
        documentLocationId: usedLocations.length === 1 ? usedLocations[0] : null,
        skippedRows: counts.skipped,
        summary: {
          kind: fileKind,
          sheets: sheets.map((s) => ({ name: s.name, location_id: s.ignored ? null : s.locationId, location: s.ignored ? "ignored" : locName(s.locationId), rows: s.rowCount })),
          estimates_from: importStart || null, accounting_month: importPeriod || null,
        },
        rows: payloadRows,
      });
      setConfirmOpen(false);
      reset();
      onOpenChange(false);
    } catch (e) {
      setConfirmOpen(false);
      setApplyError(e instanceof Error ? e.message : "Nothing was saved.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-5xl flex-col gap-0 p-0">
        <DialogHeader className="border-b p-5">
          <DialogTitle>Import expenses</DialogTitle>
          <DialogDescription>
            Accountant workbook (one worksheet per restaurant), CSV, PDF or photo. Nothing is saved until you review and confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain p-5">
          {!file && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>This file contains</Label>
                <RadioGroup value={fileKind} onValueChange={(v) => setFileKind(v as "estimate" | "actual")} className="grid gap-2 sm:grid-cols-2">
                  <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-md border p-3">
                    <RadioGroupItem value="estimate" className="mt-1" />
                    <span><strong>Recurring budget estimates</strong><br /><span className="text-sm text-muted-foreground">Monthly / quarterly / annual costs, e.g. the accountant's cost schedule</span></span>
                  </label>
                  <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-md border p-3">
                    <RadioGroupItem value="actual" className="mt-1" />
                    <span><strong>Actual bills for a month</strong><br /><span className="text-sm text-muted-foreground">Real amounts charged in a specific accounting month</span></span>
                  </label>
                </RadioGroup>
                <p className="text-xs text-muted-foreground">Payroll rows are always routed to confirmed monthly payroll; food & drink purchases are skipped (they come from supplier invoices and stock).</p>
              </div>
              <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center">
                {reading ? <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /> : <Upload className="h-8 w-8 text-muted-foreground" />}
                <span className="font-medium">{reading ? "Reading…" : "Choose XLSX, CSV, PDF or photo"}</span>
                <input type="file" className="sr-only" disabled={reading}
                  accept=".xlsx,.xls,.csv,.pdf,image/jpeg,image/png,image/webp"
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void read(f); }} />
              </label>
              {readError && <Alert variant="destructive"><AlertDescription>{readError}</AlertDescription></Alert>}
            </div>
          )}

          {file && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                <strong>{file.name}</strong>
                <Button type="button" variant="ghost" className="h-10" onClick={reset}>Choose another file</Button>
              </div>
              {sameFile && (
                <Alert><AlertDescription>
                  This exact file was imported on {format(new Date(sameFile.created_at), "d MMM yyyy")}. Rows already saved from it are marked as duplicates.
                </AlertDescription></Alert>
              )}

              <section className="space-y-2">
                <h3 className="font-semibold">1. Worksheets → locations</h3>
                <div className="space-y-2">
                  {sheets.map((s) => (
                    <div key={s.name} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
                      <div className="min-w-[8rem] flex-1">
                        <p className="font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.recognised ? `${s.rowCount} row${s.rowCount === 1 ? "" : "s"}` : "No expense columns found — skipped"}</p>
                      </div>
                      {s.recognised && (
                        <>
                          <Select value={s.ignored ? "_ignore" : s.locationId ?? "_none"}
                            onValueChange={(v) => patchSheet(s.name, v === "_ignore" ? { ignored: true } : { ignored: false, locationId: v === "_none" ? null : v, confirmed: v !== "_none" })}>
                            <SelectTrigger className="h-11 w-64" aria-label={`Location for ${s.name}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">Choose location…</SelectItem>
                              {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                              <SelectItem value="_ignore">Don't import this worksheet</SelectItem>
                            </SelectContent>
                          </Select>
                          {!s.ignored && s.locationId && !s.confirmed && (
                            <label className="flex min-h-11 items-center gap-2 text-sm">
                              <Checkbox className="h-5 w-5" checked={s.confirmed} onCheckedChange={(c) => patchSheet(s.name, { confirmed: !!c })} />
                              Suggested match — confirm
                            </label>
                          )}
                          {!s.ignored && s.confirmed && s.locationId && <Badge variant="secondary">Confirmed</Badge>}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="font-semibold">2. Accounting period</h3>
                <p className="text-sm text-muted-foreground">Not assumed from the file. You can override per row.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {needsStart && (
                    <div className="space-y-1.5">
                      <Label>Recurring estimates apply from</Label>
                      <Input type="month" className="h-11" value={importStart} onChange={(e) => setImportStart(e.target.value)} />
                    </div>
                  )}
                  {needsPeriod && (
                    <div className="space-y-1.5">
                      <Label>Accounting month for bills and payroll</Label>
                      <Input type="month" className="h-11" max={currentMonth} value={importPeriod} onChange={(e) => setImportPeriod(e.target.value)} />
                    </div>
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">3. Review rows</h3>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" className="h-10" onClick={() => setAllKind("estimate")}>Mark costs as estimates</Button>
                    <Button type="button" variant="outline" className="h-10" onClick={() => setAllKind("actual")}>Mark costs as actual bills</Button>
                  </div>
                </div>
                {sheets.filter((s) => s.recognised && !s.ignored).map((s) => (
                  <div key={s.name} className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">{s.name}{s.locationId ? ` → ${locName(s.locationId)}` : ""}</p>
                    {evaluated.filter((e) => e.row.sheet === s.name).map((e) => (
                      <ExpenseReviewRowCard
                        key={e.row.key}
                        row={e.row}
                        issues={e.issues}
                        duplicate={e.ctx.duplicate}
                        existingPayroll={e.ctx.existingPayroll}
                        locationName={locName(e.ctx.locationId)}
                        locations={locations}
                        sheetLocationId={e.sheetLoc}
                        estimatesForLocation={overheadRefs.filter((o) => o.is_active && o.location_id === e.ctx.locationId)}
                        suggestedEstimateId={e.suggestion}
                        effectivePeriod={e.ctx.periodMonth}
                        effectiveStart={e.ctx.startMonth}
                        onChange={(p) => patchRow(e.row.key, p)}
                      />
                    ))}
                  </div>
                ))}
              </section>
              {applyError && <Alert variant="destructive"><AlertDescription>Nothing was saved. {applyError}</AlertDescription></Alert>}
            </>
          )}
        </div>

        {file && (
          <DialogFooter className="flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {counts.estimate} estimate{counts.estimate === 1 ? "" : "s"} · {counts.actual} bill{counts.actual === 1 ? "" : "s"} · {counts.payroll} payroll · {counts.skipped} skipped
              {unconfirmedSheets.length > 0 && <> · <span className="text-warning">{unconfirmedSheets.length} worksheet location{unconfirmedSheets.length === 1 ? "" : "s"} to confirm</span></>}
              {blocking > 0 && <> · <span className="text-warning">{blocking} row{blocking === 1 ? "" : "s"} to fix</span></>}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="h-11" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
              <Button type="button" className="h-11" disabled={!canApply} onClick={() => setConfirmOpen(true)}>Review & save</Button>
            </div>
          </DialogFooter>
        )}

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Save this import?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <p>Everything below is saved together, or nothing is.</p>
                  <ul className="list-disc space-y-1 pl-5">
                    {counts.estimate > 0 && <li>{counts.estimate} recurring estimate{counts.estimate === 1 ? "" : "s"} added to Overheads</li>}
                    {counts.actual > 0 && <li>{counts.actual} actual bill{counts.actual === 1 ? "" : "s"}</li>}
                    {counts.payroll > 0 && <li>{counts.payroll} confirmed payroll total{counts.payroll === 1 ? "" : "s"} — replacing estimated labour for {counts.payroll === 1 ? "that month" : "those months"}</li>}
                    <li>Locations: {[...new Set(included.map((e) => locName(e.ctx.locationId)))].join(", ")}</li>
                    <li>The original file is kept in Documents</li>
                  </ul>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-11">Back</AlertDialogCancel>
              <AlertDialogAction className="h-11" disabled={apply.isPending} onClick={(e) => { e.preventDefault(); void doApply(); }}>
                {apply.isPending ? "Saving…" : "Save"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
