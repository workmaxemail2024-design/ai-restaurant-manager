import { useState, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { CalendarIcon, Upload, FileSpreadsheet, AlertCircle, History } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogDescription, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLocations } from "@/hooks/useLocations";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

const REQUIRED_COLUMNS = ["Name", "ID", "Department", "Qty", "Gross", "Net", "VAT", "Discounts"];

type ParsedRow = {
  external_item_id: string;
  item_name: string;
  department: string;
  quantity: number;
  gross_sales: number;
  net_sales: number;
  vat_amount: number;
  discount_amount: number;
};

function toNumber(v: any): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[€$,\s]/g, "").replace(/[()]/g, "-");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function findHeaderRow(rows: any[][]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = (rows[i] || []).map((c) => String(c ?? "").trim());
    if (row.includes("Name") && row.includes("ID") && row.includes("Gross")) return i;
  }
  return -1;
}

interface Props {
  trigger?: React.ReactNode;
  defaultLocationId?: string;
}

export function HistoricalCaptivaImportDialog({ trigger, defaultLocationId }: Props) {
  const [open, setOpen] = useState(false);
  const { data: locations = [] } = useLocations();
  const { currentRestaurant } = useRestaurant();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetName, setSheetName] = useState<string>("");
  const [locationId, setLocationId] = useState<string>(defaultLocationId || "");
  const [periodStart, setPeriodStart] = useState<Date>(new Date(new Date().getFullYear(), 0, 1));
  const [periodEnd, setPeriodEnd] = useState<Date>(new Date(new Date().getFullYear(), 11, 31));
  const [periodLabel, setPeriodLabel] = useState<string>(`${new Date().getFullYear()} Full Year`);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFile(null); setWorkbook(null); setSheetName(""); setError(null);
  };

  const handleFile = useCallback(async (f: File) => {
    setError(null);
    setFile(f);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      setWorkbook(wb);
      const preferred = wb.SheetNames.find(
        (n) => !/all\s*stores/i.test(n) && !/no\s*activity/i.test(n)
      );
      setSheetName(preferred || wb.SheetNames[0] || "");
    } catch (e: any) {
      setError(`Failed to parse file: ${e.message}`);
    }
  }, []);

  const parsed = useMemo<{ rows: ParsedRow[]; missing: string[] } | null>(() => {
    if (!workbook || !sheetName) return null;
    const ws = workbook.Sheets[sheetName];
    if (!ws) return null;
    const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    const headerIdx = findHeaderRow(grid);
    if (headerIdx === -1) return { rows: [], missing: REQUIRED_COLUMNS };
    const header = (grid[headerIdx] || []).map((c: any) => String(c ?? "").trim());
    const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
    if (missing.length) return { rows: [], missing };

    const idx = (name: string) => header.indexOf(name);
    const cols = {
      name: idx("Name"), id: idx("ID"), dept: idx("Department"),
      qty: idx("Qty"), gross: idx("Gross"), net: idx("Net"),
      vat: idx("VAT"), disc: idx("Discounts"),
    };
    const rows: ParsedRow[] = [];
    for (let i = headerIdx + 1; i < grid.length; i++) {
      const r = grid[i];
      if (!r) continue;
      const name = String(r[cols.name] ?? "").trim();
      const id = String(r[cols.id] ?? "").trim();
      if (!name && !id) continue;
      if (/^total/i.test(name) || /^grand/i.test(name)) continue;
      const qty = toNumber(r[cols.qty]);
      const gross = toNumber(r[cols.gross]);
      if (!id && !qty && !gross) continue;
      rows.push({
        external_item_id: id || `NAME:${name}`,
        item_name: name,
        department: String(r[cols.dept] ?? "").trim(),
        quantity: qty,
        gross_sales: gross,
        net_sales: toNumber(r[cols.net]),
        vat_amount: toNumber(r[cols.vat]),
        discount_amount: toNumber(r[cols.disc]),
      });
    }
    return { rows, missing: [] };
  }, [workbook, sheetName]);

  const totals = useMemo(() => {
    if (!parsed?.rows.length) return { qty: 0, gross: 0, net: 0, count: 0 };
    return parsed.rows.reduce((a, r) => ({
      qty: a.qty + r.quantity,
      gross: a.gross + r.gross_sales,
      net: a.net + r.net_sales,
      count: a.count + 1,
    }), { qty: 0, gross: 0, net: 0, count: 0 });
  }, [parsed]);

  const canImport = !!(currentRestaurant && locationId && parsed?.rows.length && !parsed.missing.length
    && periodStart && periodEnd && periodStart <= periodEnd);

  const handleImport = async () => {
    if (!canImport || !parsed || !currentRestaurant) return;
    setBusy(true);
    try {
      const ps = format(periodStart, "yyyy-MM-dd");
      const pe = format(periodEnd, "yyyy-MM-dd");
      const provider = "captiva";

      // 1. Upsert historical summaries (idempotent per period + product)
      const histRows = parsed.rows.map((r) => ({
        restaurant_id: currentRestaurant.id,
        location_id: locationId,
        pos_provider: provider,
        external_item_id: r.external_item_id,
        item_name: r.item_name,
        department: r.department || null,
        period_start: ps,
        period_end: pe,
        period_label: periodLabel || null,
        quantity_sold: r.quantity,
        gross_sales: r.gross_sales,
        net_sales: r.net_sales,
        vat_amount: r.vat_amount,
        discount_amount: r.discount_amount,
        source_file_name: file?.name || null,
        imported_at: new Date().toISOString(),
      }));
      const { error: hErr } = await supabase
        .from("historical_pos_product_summaries")
        .upsert(histRows, {
          onConflict: "restaurant_id,location_id,pos_provider,external_item_id,period_start,period_end",
        });
      if (hErr) throw hErr;

      // 2. Ensure external_pos_items exists for each product (do NOT overwrite manual settings).
      //    Fetch what already exists and only insert new rows.
      const { data: existing } = await supabase
        .from("external_pos_items")
        .select("external_item_id")
        .eq("restaurant_id", currentRestaurant.id)
        .eq("location_id", locationId)
        .in("external_item_id", parsed.rows.map((r) => r.external_item_id));
      const known = new Set((existing || []).map((e: any) => e.external_item_id));
      const newRows = parsed.rows
        .filter((r) => !known.has(r.external_item_id))
        .map((r) => ({
          restaurant_id: currentRestaurant.id,
          location_id: locationId,
          pos_provider: provider,
          external_item_id: r.external_item_id,
          external_item_name: r.item_name,
          department: r.department || null,
          needs_review: true,
          source: "captiva_historical",
        }));
      if (newRows.length) {
        const { error: eErr } = await supabase
          .from("external_pos_items")
          .insert(newRows);
        if (eErr) throw eErr;
      }

      toast({
        title: "Historical report imported",
        description:
          `${histRows.length} products · ${newRows.length} new POS products discovered. ` +
          `Gross ${formatCurrency(totals.gross)}, Qty ${totals.qty}. ` +
          `Daily dashboard & reports unchanged.`,
      });

      queryClient.invalidateQueries({ queryKey: ["historical-pos-periods"] });
      queryClient.invalidateQueries({ queryKey: ["historical-pos-rows"] });
      queryClient.invalidateQueries({ queryKey: ["external-pos-items"] });
      setOpen(false);
      reset();
    } catch (e: any) {
      console.error("Historical import failed", e);
      toast({ title: "Import failed", description: e.message || String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline">
            <History className="h-4 w-4 mr-2" />
            Import Historical Product Report
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Historical Product Report</DialogTitle>
          <DialogDescription>
            Yearly / period-aggregate Captiva product totals. Feeds Product Intelligence only —
            <strong> does not affect daily dashboard, daily reports, or profit calculations.</strong>
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Use this for reports like "2026 Full Year" that have no daily transaction dates.
            For a per-day export use the standard "Import Captiva XLS" instead.
          </AlertDescription>
        </Alert>

        <div className="space-y-4 mt-2">
          <div>
            <Label>File</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              {file && <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />}
            </div>
          </div>

          {workbook && (
            <div>
              <Label>Sheet</Label>
              <Select value={sheetName} onValueChange={setSheetName}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {workbook.SheetNames.map((n) => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Location</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                <SelectContent>
                  {locations.map((l: any) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Period label</Label>
              <Input value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="e.g. 2026 Full Year" />
            </div>
            <div>
              <Label>Period start</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start font-normal", !periodStart && "text-muted-foreground")}>
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {periodStart ? format(periodStart, "PP") : "Pick"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={periodStart} onSelect={(d) => d && setPeriodStart(d)} /></PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Period end</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start font-normal", !periodEnd && "text-muted-foreground")}>
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {periodEnd ? format(periodEnd, "PP") : "Pick"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={periodEnd} onSelect={(d) => d && setPeriodEnd(d)} /></PopoverContent>
              </Popover>
            </div>
          </div>

          {parsed?.missing?.length ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>Missing required columns: {parsed.missing.join(", ")}</AlertDescription>
            </Alert>
          ) : null}

          {parsed?.rows.length ? (
            <div className="border rounded">
              <div className="p-3 bg-muted/40 text-sm grid grid-cols-4 gap-2">
                <div><span className="text-muted-foreground">Products: </span><strong>{totals.count}</strong></div>
                <div><span className="text-muted-foreground">Qty: </span><strong>{totals.qty}</strong></div>
                <div><span className="text-muted-foreground">Gross: </span><strong>{formatCurrency(totals.gross)}</strong></div>
                <div><span className="text-muted-foreground">Net: </span><strong>{formatCurrency(totals.net)}</strong></div>
              </div>
              <div className="max-h-64 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Dept</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.rows.slice(0, 25).map((r) => (
                      <TableRow key={r.external_item_id}>
                        <TableCell>{r.item_name}</TableCell>
                        <TableCell>{r.department}</TableCell>
                        <TableCell className="text-right">{r.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.gross_sales)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {parsed.rows.length > 25 && (
                  <div className="p-2 text-xs text-center text-muted-foreground">…and {parsed.rows.length - 25} more rows</div>
                )}
              </div>
            </div>
          ) : null}

          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleImport} disabled={!canImport || busy}>
            <Upload className="h-4 w-4 mr-2" />
            {busy ? "Importing…" : "Import historical report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
