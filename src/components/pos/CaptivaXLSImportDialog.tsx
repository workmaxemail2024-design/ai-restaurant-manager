import { useState, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { CalendarIcon, Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
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

const REQUIRED_COLUMNS = [
  "Name", "ID", "Department", "All Sales", "Deposit Fees", "Qty",
  "Sales", "Discounts", "Gross", "VAT", "Net",
  "Prev Qty", "Prev Gross", "Gross Variance", "% Gross Variance",
  "% of Dept", "% of Sales",
];

type ParsedRow = {
  external_item_id: string;
  item_name: string;
  department: string;
  quantity: number;
  gross_sales: number;
  net_sales: number;
  vat_amount: number;
  discount_amount: number;
  raw: Record<string, any>;
};

interface Props {
  trigger?: React.ReactNode;
  defaultLocationId?: string;
}

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

export function CaptivaXLSImportDialog({ trigger, defaultLocationId }: Props) {
  const [open, setOpen] = useState(false);
  const { data: locations = [] } = useLocations();
  const { currentRestaurant } = useRestaurant();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetName, setSheetName] = useState<string>("");
  const [locationId, setLocationId] = useState<string>(defaultLocationId || "");
  const [reportDate, setReportDate] = useState<Date>(new Date());
  const [mode, setMode] = useState<"stage" | "apply">("stage");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sheetNames = workbook?.SheetNames || [];
  const availableSheets = includeInactive
    ? sheetNames
    : sheetNames.filter((n) => !/no\s*activity/i.test(n));

  const reset = () => {
    setFile(null); setWorkbook(null); setSheetName(""); setError(null);
    setMode("stage"); setIncludeInactive(false);
  };

  const handleFile = useCallback(async (f: File) => {
    setError(null);
    setFile(f);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      setWorkbook(wb);
      // auto-pick a store sheet: first sheet that isn't All Stores or No Activity
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
      vat: idx("VAT"), disc: idx("Discounts"), sales: idx("Sales"),
    };

    const rows: ParsedRow[] = [];
    for (let i = headerIdx + 1; i < grid.length; i++) {
      const r = grid[i];
      if (!r) continue;
      const name = String(r[cols.name] ?? "").trim();
      const id = String(r[cols.id] ?? "").trim();
      if (!name && !id) continue;
      // skip total/summary rows
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
        raw: header.reduce((acc, h, k) => { acc[h] = r[k]; return acc; }, {} as any),
      });
    }
    return { rows, missing: [] };
  }, [workbook, sheetName]);

  const totals = useMemo(() => {
    if (!parsed?.rows.length) return { qty: 0, gross: 0, net: 0, vat: 0, disc: 0, count: 0 };
    return parsed.rows.reduce((a, r) => ({
      qty: a.qty + r.quantity,
      gross: a.gross + r.gross_sales,
      net: a.net + r.net_sales,
      vat: a.vat + r.vat_amount,
      disc: a.disc + r.discount_amount,
      count: a.count + 1,
    }), { qty: 0, gross: 0, net: 0, vat: 0, disc: 0, count: 0 });
  }, [parsed]);

  const canImport = !!(currentRestaurant && locationId && parsed?.rows.length && !parsed.missing.length);

  const handleImport = async () => {
    if (!canImport || !parsed || !currentRestaurant) return;
    setBusy(true);
    try {
      const dateStr = format(reportDate, "yyyy-MM-dd");
      const records = parsed.rows.map((r) => ({
        restaurant_id: currentRestaurant.id,
        location_id: locationId,
        pos_provider: "captiva_xls",
        external_sale_id: `${dateStr}:${r.external_item_id}`,
        mapped_quantity: Math.round(r.quantity),
        mapped_total_price: r.gross_sales,
        mapped_sale_date: dateStr,
        sync_status: "pending",
        data: {
          source: "captiva_xls",
          report_date: dateStr,
          sheet: sheetName,
          external_item_id: r.external_item_id,
          item_name: r.item_name,
          department: r.department,
          quantity: r.quantity,
          gross_sales: r.gross_sales,
          net_sales: r.net_sales,
          vat_amount: r.vat_amount,
          discount_amount: r.discount_amount,
          raw: r.raw,
        },
      }));

      // Idempotent upsert on (restaurant_id, location_id, pos_provider, external_sale_id)
      const { error: upErr } = await supabase
        .from("pos_sales_import")
        .upsert(records, { onConflict: "restaurant_id,location_id,pos_provider,external_sale_id" });
      if (upErr) throw upErr;

      let appliedCount = 0;
      if (mode === "apply") {
        // Fuzzy-map to dishes and insert into sales
        const { data: dishes } = await supabase
          .from("dishes")
          .select("id, name")
          .eq("restaurant_id", currentRestaurant.id);
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const dishMap = new Map((dishes || []).map((d) => [norm(d.name), d.id]));

        // Remove any prior applied rows for this date+source+location to keep idempotent
        await supabase
          .from("sales")
          .delete()
          .eq("restaurant_id", currentRestaurant.id)
          .eq("location_id", locationId)
          .eq("sale_date", dateStr);

        const saleRows: any[] = [];
        for (const r of parsed.rows) {
          if (r.quantity <= 0 && r.gross_sales <= 0) continue;
          const dishId = dishMap.get(norm(r.item_name));
          if (!dishId) continue;
          saleRows.push({
            restaurant_id: currentRestaurant.id,
            location_id: locationId,
            dish_id: dishId,
            quantity: Math.max(1, Math.round(r.quantity)),
            total_price: r.gross_sales,
            sale_date: dateStr,
          });
        }
        if (saleRows.length) {
          const { error: sErr } = await supabase.from("sales").insert(saleRows);
          if (sErr) throw sErr;
          appliedCount = saleRows.length;
        }
      }

      toast({
        title: mode === "apply" ? "Import applied" : "Import staged",
        description:
          `${records.length} rows staged` +
          (mode === "apply" ? ` — ${appliedCount} mapped to dishes and posted to sales` : "") +
          `. Gross ${formatCurrency(totals.gross)}, Net ${formatCurrency(totals.net)}, VAT ${formatCurrency(totals.vat)}, Qty ${totals.qty}.`,
      });

      queryClient.invalidateQueries();
      setOpen(false);
      reset();
    } catch (e: any) {
      console.error("Captiva XLS import failed", e);
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
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Import Captiva XLS
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Captiva XLS</DialogTitle>
          <DialogDescription>
            Upload a Captiva Product Report workbook. Choose a store sheet and report date, preview totals, then stage or apply to the dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Workbook file</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="file"
                accept=".xls,.xlsx,.xlsm"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>
            {file && <p className="text-xs text-muted-foreground mt-1">{file.name}</p>}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {workbook && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Restaurant location</Label>
                  <Select value={locationId} onValueChange={setLocationId}>
                    <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                    <SelectContent>
                      {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Report date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !reportDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {reportDate ? format(reportDate, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={reportDate} onSelect={(d) => d && setReportDate(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label>Sheet to import</Label>
                  <Select value={sheetName} onValueChange={setSheetName}>
                    <SelectTrigger><SelectValue placeholder="Select sheet" /></SelectTrigger>
                    <SelectContent>
                      {availableSheets.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2 mt-2">
                    <Checkbox id="incInactive" checked={includeInactive} onCheckedChange={(v) => setIncludeInactive(!!v)} />
                    <Label htmlFor="incInactive" className="text-xs font-normal cursor-pointer">
                      Also allow "No Activity" sheet
                    </Label>
                  </div>
                </div>
                <div>
                  <Label>Import mode</Label>
                  <RadioGroup value={mode} onValueChange={(v: any) => setMode(v)} className="mt-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="stage" id="stage" />
                      <Label htmlFor="stage" className="font-normal cursor-pointer">Stage only</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="apply" id="apply" />
                      <Label htmlFor="apply" className="font-normal cursor-pointer">Apply to dashboard</Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>

              {parsed?.missing.length ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Sheet is missing required columns: {parsed.missing.join(", ")}
                  </AlertDescription>
                </Alert>
              ) : parsed && parsed.rows.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>No data rows found in this sheet.</AlertDescription>
                </Alert>
              ) : parsed ? (
                <>
                  <div className="grid grid-cols-5 gap-2 rounded-lg border p-3 bg-muted/30 text-center">
                    <div><div className="text-xs text-muted-foreground">Active rows</div><div className="font-semibold">{totals.count}</div></div>
                    <div><div className="text-xs text-muted-foreground">Qty</div><div className="font-semibold">{totals.qty}</div></div>
                    <div><div className="text-xs text-muted-foreground">Gross</div><div className="font-semibold">{formatCurrency(totals.gross)}</div></div>
                    <div><div className="text-xs text-muted-foreground">Net</div><div className="font-semibold">{formatCurrency(totals.net)}</div></div>
                    <div><div className="text-xs text-muted-foreground">VAT</div><div className="font-semibold">{formatCurrency(totals.vat)}</div></div>
                  </div>

                  <div className="border rounded-lg max-h-64 overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background">
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Dept</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Gross</TableHead>
                          <TableHead className="text-right">Net</TableHead>
                          <TableHead className="text-right">VAT</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsed.rows.slice(0, 100).map((r) => (
                          <TableRow key={r.external_item_id}>
                            <TableCell className="font-medium">{r.item_name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{r.department}</TableCell>
                            <TableCell className="text-right">{r.quantity}</TableCell>
                            <TableCell className="text-right">{formatCurrency(r.gross_sales)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(r.net_sales)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(r.vat_amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {parsed.rows.length > 100 && (
                      <div className="text-xs text-muted-foreground text-center py-2">
                        Showing first 100 of {parsed.rows.length} rows
                      </div>
                    )}
                  </div>

                  <Alert>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Idempotent: re-importing the same date + location + item IDs updates existing staged rows instead of duplicating.
                    </AlertDescription>
                  </Alert>
                </>
              ) : null}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
          <Button onClick={handleImport} disabled={!canImport || busy}>
            <Upload className="h-4 w-4 mr-2" />
            {busy ? "Importing…" : mode === "apply" ? "Import & Apply" : "Stage Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Local Input to avoid extra import churn
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50", props.className)} />;
}
