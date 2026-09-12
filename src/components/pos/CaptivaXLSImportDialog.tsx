import { useState, useMemo, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { CalendarIcon, Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLocations, useCreateLocation } from "@/hooks/useLocations";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useLocation } from "@/contexts/LocationContext";

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
  sale_date: string | null;
  raw: Record<string, any>;
};

interface Props {
  trigger?: React.ReactNode;
  defaultLocationId?: string;
  /** Optional external control (used by Reports "Import POS Data"). */
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}

function toNumber(v: any): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[€$,\s]/g, "").replace(/[()]/g, "-");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** Excel serial / Date / dd-mm-yyyy or yyyy-mm-dd text → yyyy-MM-dd, else null. Never guesses. */
function toISODate(v: any): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return format(v, "yyyy-MM-dd");
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return isNaN(d.getTime()) ? null : format(d, "yyyy-MM-dd");
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    if (Number(mm) > 12) return null;
    return `${m[3]}-${mm}-${dd}`;
  }
  return null;
}

/** Scan the sheet header block for one date or a date range. Returns [] when nothing reliable. */
function detectSheetDates(grid: any[][], headerIdx: number): string[] {
  const found: string[] = [];
  const limit = headerIdx === -1 ? Math.min(grid.length, 15) : headerIdx;
  for (let i = 0; i < limit; i++) {
    for (const cell of grid[i] || []) {
      if (cell == null) continue;
      const s = String(cell);
      const matches = s.match(/\d{1,2}[/.-]\d{1,2}[/.-]\d{4}|\d{4}-\d{2}-\d{2}/g);
      if (matches) {
        for (const mm of matches) {
          const iso = toISODate(mm);
          if (iso && !found.includes(iso)) found.push(iso);
        }
      } else if (cell instanceof Date) {
        const iso = toISODate(cell);
        if (iso && !found.includes(iso)) found.push(iso);
      }
    }
  }
  return found.sort();
}

/** Aggregate/rollup sheets are never a store and must never be imported as a location. */
function isAggregateSheet(name: string): boolean {
  return /all\s*stores|summary|totals?$|grand/i.test(name.trim());
}

type StoreMapping =
  | { action: "unset" }
  | { action: "existing"; locationId: string }
  | { action: "skip" };

function findHeaderRow(rows: any[][]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = (rows[i] || []).map((c) => String(c ?? "").trim());
    if (row.includes("Name") && row.includes("ID") && row.includes("Gross")) return i;
  }
  return -1;
}

/** Blank → null (blank is NOT zero); numbers & formatted strings → number. */
function toNullableNumber(v: any): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[€$,\s]/g, "").replace(/[()]/g, "-");
  if (s === "" || s === "-") return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export type DailySummaryParsed = {
  date: string | null;
  gross: number | null;
  net: number | null;
  vat: number | null;
  discounts: number | null;
  receipts: number | null;
  visitors: number | null;
};

const SUMMARY_LABELS: Array<{ key: keyof Omit<DailySummaryParsed, "date">; re: RegExp }> = [
  { key: "gross", re: /^(gross(\s*(sales|revenue|turnover))?|total\s*gross)$/ },
  { key: "net", re: /^(net\s*(sales|revenue|turnover)|total\s*net)$/ },
  { key: "vat", re: /^((total\s*)?vat|tax)(\s*(amount|payable))?$/ },
  { key: "discounts", re: /^(total\s*)?discounts?$/ },
  { key: "receipts", re: /^(no\.?\s*of\s*)?(receipts?|orders|transactions|bills|sales\s*count)$/ },
  { key: "visitors", re: /^(no\.?\s*of\s*)?(visitors?|covers|guests|customers|diners)$/ },
];

/**
 * Detects a Daily Sales Summary sheet: a label/value layout with no product
 * table. Returns null unless a gross figure and at least one other figure are
 * found — a sheet we cannot read is never treated as a summary.
 */
function parseDailySummarySheet(grid: any[][]): DailySummaryParsed | null {
  if (findHeaderRow(grid) !== -1) return null; // has a product table → products sheet
  const out: DailySummaryParsed = { date: null, gross: null, net: null, vat: null, discounts: null, receipts: null, visitors: null };
  let matched = 0;
  for (let i = 0; i < grid.length; i++) {
    const row = grid[i] || [];
    for (let j = 0; j < row.length; j++) {
      const cell = row[j];
      if (typeof cell !== "string") continue;
      const label = cell.trim().toLowerCase().replace(/:$/, "");
      if (!label) continue;
      // Trading/business date label
      if (/^(business|trading|sales?)?\s*date$/.test(label)) {
        for (let k = j + 1; k < row.length; k++) {
          const d = toISODate(row[k]);
          if (d) { out.date = d; break; }
        }
        continue;
      }
      const spec = SUMMARY_LABELS.find((s) => s.re.test(label));
      if (!spec || out[spec.key] != null) continue;
      // Value = first usable cell to the right, else the cell directly below.
      let val: number | null = null;
      for (let k = j + 1; k < row.length; k++) {
        val = toNullableNumber(row[k]);
        if (val != null) break;
      }
      if (val == null && grid[i + 1]) val = toNullableNumber(grid[i + 1][j]);
      if (val != null) { (out as any)[spec.key] = val; matched++; }
    }
  }
  if (out.gross == null || matched < 2) return null;
  if (!out.date) {
    const dates = detectSheetDates(grid, -1);
    if (dates.length === 1) out.date = dates[0];
  }
  return out;
}


export function CaptivaXLSImportDialog({ trigger, defaultLocationId, open: openProp, onOpenChange }: Props) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (o: boolean) => { onOpenChange ? onOpenChange(o) : setOpenState(o); };
  const { data: locations = [] } = useLocations();
  const { currentRestaurant } = useRestaurant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { setCustomRange } = useDateRange();
  const { setSelectedLocationId } = useLocation();

  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetName, setSheetName] = useState<string>("");
  const [locationId, setLocationId] = useState<string>(defaultLocationId || "");
  const [reportDate, setReportDate] = useState<Date>(new Date());
  const [dateConfirmed, setDateConfirmed] = useState(false);
  const [mode, setMode] = useState<"stage" | "apply">("stage");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [storeMappings, setStoreMappings] = useState<Record<string, StoreMapping>>({});
  const [newLocationFor, setNewLocationFor] = useState<string | null>(null);
  const [newLocationName, setNewLocationName] = useState("");
  const createLocation = useCreateLocation();

  // Optional daily summary fields (from Captiva journal, not product XLS rows)
  const [orderCountInput, setOrderCountInput] = useState<string>("");
  const [visitorCountInput, setVisitorCountInput] = useState<string>("");
  const [aovInput, setAovInput] = useState<string>("");

  const sheetNames = workbook?.SheetNames || [];
  const availableSheets = includeInactive
    ? sheetNames
    : sheetNames.filter((n) => !/no\s*activity/i.test(n));

  const reset = () => {
    setFile(null); setWorkbook(null); setSheetName(""); setError(null);
    setMode("stage"); setIncludeInactive(false);
    setOrderCountInput(""); setVisitorCountInput(""); setAovInput("");
    setStoreMappings({}); setNewLocationFor(null); setNewLocationName("");
    setDateConfirmed(false);
  };


  const handleFile = useCallback(async (f: File) => {
    setError(null);
    setFile(f);
    setDateConfirmed(false);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
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

  const parseSheet = useCallback(
    (wb: XLSX.WorkBook, name: string):
      { rows: ParsedRow[]; missing: string[]; headerDates: string[] } | null => {
      const ws = wb.Sheets[name];
      if (!ws) return null;
      const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      const headerIdx = findHeaderRow(grid);
      const headerDates = detectSheetDates(grid, headerIdx);
      if (headerIdx === -1) return { rows: [], missing: REQUIRED_COLUMNS, headerDates };
      const header = (grid[headerIdx] || []).map((c: any) => String(c ?? "").trim());
      const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
      if (missing.length) return { rows: [], missing, headerDates };

      const idx = (n: string) => header.indexOf(n);
      const dateColIdx = header.findIndex((h) =>
        /^(date|business date|trading date|sale date)$/i.test(h));
      const cols = {
        name: idx("Name"), id: idx("ID"), dept: idx("Department"),
        qty: idx("Qty"), gross: idx("Gross"), net: idx("Net"),
        vat: idx("VAT"), disc: idx("Discounts"), sales: idx("Sales"),
      };

      const rows: ParsedRow[] = [];
      for (let i = headerIdx + 1; i < grid.length; i++) {
        const r = grid[i];
        if (!r) continue;
        const nm = String(r[cols.name] ?? "").trim();
        const id = String(r[cols.id] ?? "").trim();
        if (!nm && !id) continue;
        if (/^total/i.test(nm) || /^grand/i.test(nm)) continue;
        const qty = toNumber(r[cols.qty]);
        const gross = toNumber(r[cols.gross]);
        if (!id && !qty && !gross) continue;
        rows.push({
          external_item_id: id || `NAME:${nm}`,
          item_name: nm,
          department: String(r[cols.dept] ?? "").trim(),
          quantity: qty,
          gross_sales: gross,
          net_sales: toNumber(r[cols.net]),
          vat_amount: toNumber(r[cols.vat]),
          discount_amount: toNumber(r[cols.disc]),
          sale_date: dateColIdx >= 0 ? toISODate(r[dateColIdx]) : null,
          raw: header.reduce((acc, h, k) => { acc[h] = r[k]; return acc; }, {} as any),
        });
      }
      return { rows, missing: [], headerDates };
    },
    [],
  );

  const sumRows = (rows: ParsedRow[]) =>
    rows.reduce((a, r) => ({
      qty: a.qty + r.quantity,
      gross: a.gross + r.gross_sales,
      net: a.net + r.net_sales,
      vat: a.vat + r.vat_amount,
      disc: a.disc + r.discount_amount,
      count: a.count + 1,
    }), { qty: 0, gross: 0, net: 0, vat: 0, disc: 0, count: 0 });

  /**
   * Every store sheet found in the workbook, with its own parsed rows and totals.
   * Aggregate sheets ("All Stores"/summary) are never treated as a store, and
   * "No Activity" sheets are excluded unless explicitly allowed.
   */
  const detectedStores = useMemo(() => {
    if (!workbook) return [] as Array<{
      sheet: string;
      kind: "products" | "summary";
      rows: ParsedRow[];
      missing: string[];
      summary: DailySummaryParsed | null;
      headerDates: string[];
      rowDates: string[];
      totals: ReturnType<typeof sumRows>;
    }>;
    return workbook.SheetNames
      .filter((n) => (includeInactive ? true : !/no\s*activity/i.test(n)))
      .map((n) => {
        const p = parseSheet(workbook, n) || { rows: [], missing: REQUIRED_COLUMNS, headerDates: [] };
        // A sheet without a product table may be a Daily Sales Summary sheet.
        const ws = workbook.Sheets[n];
        const grid: any[][] = ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) : [];
        const summary = p.missing.length ? parseDailySummarySheet(grid) : null;
        const rowDates = Array.from(
          new Set(p.rows.map((r) => r.sale_date).filter(Boolean) as string[])
        ).sort();
        const headerDates = summary?.date && !p.headerDates.includes(summary.date)
          ? [...p.headerDates, summary.date].sort()
          : p.headerDates;
        return {
          sheet: n,
          kind: (summary ? "summary" : "products") as "products" | "summary",
          rows: p.rows, missing: p.missing, summary,
          headerDates, rowDates, totals: sumRows(p.rows),
        };
      })
      // Aggregate rollup sheets are never a store — but a recognisable Daily
      // Sales Summary sheet IS importable even when its name says "Summary".
      .filter((s) => !isAggregateSheet(s.sheet) || s.kind === "summary");
  }, [workbook, includeInactive, parseSheet]);

  /**
   * Trading-date resolution. Never fabricates a date.
   *  - row_dates : every row carries its own real date → import each date separately
   *  - detected  : one date found in the report header → pre-filled, Owner may correct
   *  - period    : only an aggregated range is known → daily import is refused,
   *                the upload is routed to historical Product Intelligence storage
   *  - owner     : nothing reliable in the file → Owner must confirm a trading date
   */
  const dateInfo = useMemo(() => {
    const rowDates = Array.from(new Set(detectedStores.flatMap((s) => s.rowDates))).sort();
    if (rowDates.length > 1) {
      return { kind: "row_dates" as const, dates: rowDates, start: rowDates[0], end: rowDates[rowDates.length - 1] };
    }
    if (rowDates.length === 1) {
      return { kind: "detected" as const, dates: rowDates, start: rowDates[0], end: rowDates[0] };
    }
    const headerDates = Array.from(new Set(detectedStores.flatMap((s) => s.headerDates))).sort();
    if (headerDates.length === 1) {
      return { kind: "detected" as const, dates: headerDates, start: headerDates[0], end: headerDates[0] };
    }
    if (headerDates.length > 1) {
      const start = headerDates[0];
      const end = headerDates[headerDates.length - 1];
      if (start === end) return { kind: "detected" as const, dates: [start], start, end };
      return { kind: "period" as const, dates: headerDates, start, end };
    }
    return { kind: "owner" as const, dates: [] as string[], start: null, end: null };
  }, [detectedStores]);

  // Pre-fill the picker from a detected single date (Owner can still correct it).
  useEffect(() => {
    if (dateInfo.kind === "detected" && dateInfo.start) {
      setReportDate(new Date(`${dateInfo.start}T00:00:00`));
      setDateConfirmed(true);
    }
  }, [dateInfo.kind, dateInfo.start]);

  const classification: "daily" | "multi_day" | "historical" =
    dateInfo.kind === "row_dates" ? "multi_day"
    : dateInfo.kind === "period" ? "historical"
    : "daily";

  const importableStores = detectedStores.filter((s) => {
    const m = storeMappings[s.sheet];
    if (!m || m.action !== "existing" || !m.locationId) return false;
    if (s.kind === "summary") return !!s.summary;
    return s.rows.length > 0 && !s.missing.length;
  });
  const unresolvedStores = detectedStores.filter((s) => {
    const m = storeMappings[s.sheet];
    return !m || m.action === "unset";
  });

  const parsed = useMemo(() => {
    if (!workbook || !sheetName) return null;
    return parseSheet(workbook, sheetName);
  }, [workbook, sheetName, parseSheet]);

  const totals = useMemo(() => sumRows(parsed?.rows || []), [parsed]);

  const dateReady = classification === "daily" ? dateConfirmed : true;
  const canImport = !!(currentRestaurant && importableStores.length && !unresolvedStores.length && dateReady);

  /** The (location, trading date) pairs this import would write to. */
  const previewTargets = useMemo(() => {
    if (!currentRestaurant || !dateReady) return [] as Array<{ locationId: string; date: string }>;
    const targets: Array<{ locationId: string; date: string }> = [];
    for (const s of importableStores) {
      const locId = (storeMappings[s.sheet] as { locationId: string }).locationId;
      if (classification === "daily") {
        targets.push({ locationId: locId, date: format(reportDate, "yyyy-MM-dd") });
      } else if (classification === "multi_day") {
        const dates = s.kind === "summary"
          ? (s.summary?.date ? [s.summary.date] : [])
          : s.rowDates;
        for (const d of dates) targets.push({ locationId: locId, date: d });
      }
    }
    return targets;
  }, [currentRestaurant, dateReady, importableStores, classification, reportDate, storeMappings]);

  /** Existing canonical POS day rows for those targets — powers the
   *  "existing data found" notice and the reconciliation estimate. */
  const targetKey = previewTargets.map((t) => `${t.locationId}:${t.date}`).sort().join("|");
  const { data: existingPosDays = [] } = useQuery({
    queryKey: ["pos-import-existing", currentRestaurant?.id, targetKey],
    enabled: !!currentRestaurant && previewTargets.length > 0,
    queryFn: async () => {
      const locIds = Array.from(new Set(previewTargets.map((t) => t.locationId)));
      const dates = Array.from(new Set(previewTargets.map((t) => t.date)));
      const { data } = await supabase
        .from("pos_daily_summaries")
        .select("location_id, report_date, pos_provider, has_product_detail, has_summary_report, product_gross_sales, summary_gross_sales")
        .eq("restaurant_id", currentRestaurant!.id)
        .in("location_id", locIds)
        .in("report_date", dates);
      return (data as any[]) ?? [];
    },
  });
  const existingFor = useCallback(
    (locationId: string, date: string) =>
      existingPosDays.filter((r: any) => r.location_id === locationId && r.report_date === date),
    [existingPosDays],
  );


  /**
   * Imports ONE store sheet into ONE location using the existing idempotent path.
   * Called once per confirmed store mapping.
   */
  const importStore = async (
    sheetName: string,
    locationId: string,
    rows: ParsedRow[],
    allowManualSummary: boolean,
    dateStr: string,
  ) => {
    if (!currentRestaurant) return { products: 0, applied: 0 };
    const parsed = { rows, missing: [] as string[] };
    const totals = sumRows(rows);
    {
      const provider = "captiva_xls";



      // C5 PRE-CHECK: a closed operating day rejects the whole import BEFORE any
      // delete/upsert runs, so a rejected import leaves the data untouched.
      const { data: closed, error: closedErr } = await supabase.rpc("day_is_closed", {
        _restaurant_id: currentRestaurant.id,
        _location_id: locationId,
        _date: dateStr,
      });
      if (closedErr) throw closedErr;
      if (closed) {
        throw new Error(
          `409 — Day ${dateStr} is closed. Reopen the day before importing.`
        );
      }

      const inferItemType = (dept: string): string => {
        const d = (dept || "").toLowerCase();
        if (/wine|beer|cocktail|spirit|drink|water|soft|coffee|tea|cappuccino|juice|bar|beverage/.test(d)) return "beverage";
        if (!d) return "other";
        return "food";
      };


      // 1) Upsert external POS items (Captiva product catalogue for this location)
      const catalogueRows = parsed.rows.map((r) => ({
        restaurant_id: currentRestaurant.id,
        location_id: locationId,
        pos_provider: provider,
        external_item_id: r.external_item_id,
        external_item_name: r.item_name,
        department: r.department || null,
        last_seen_at: new Date().toISOString(),
        last_qty: r.quantity,
        last_gross: r.gross_sales,
      }));
      const { error: catErr } = await supabase
        .from("external_pos_items")
        .upsert(catalogueRows, {
          onConflict: "restaurant_id,location_id,pos_provider,external_item_id",
          ignoreDuplicates: false,
        });
      if (catErr) throw catErr;

      // 2) Auto-create master dishes for products that don't already have a mapped dish
      const { data: catalogue } = await supabase
        .from("external_pos_items")
        .select("id, external_item_id, external_item_name, department, mapped_dish_id, needs_review")
        .eq("restaurant_id", currentRestaurant.id)
        .eq("location_id", locationId)
        .eq("pos_provider", provider)
        .in("external_item_id", parsed.rows.map((r) => r.external_item_id));
      const catByExt = new Map((catalogue || []).map((c: any) => [c.external_item_id, c]));

      // Find already-existing captiva-linked dishes for this restaurant so we don't duplicate
      const externalIds = parsed.rows.map((r) => r.external_item_id);
      const { data: existingDishes } = await supabase
        .from("dishes")
        .select("id, captiva_external_id")
        .eq("restaurant_id", currentRestaurant.id)
        .in("captiva_external_id", externalIds);
      const dishByExt = new Map<string, string>(
        (existingDishes || []).map((d: any) => [d.captiva_external_id, d.id])
      );

      // Rows needing a new auto-created master dish
      const rowsNeedingDish = parsed.rows.filter((r) => {
        const cat = catByExt.get(r.external_item_id);
        if (cat?.mapped_dish_id) return false; // already mapped
        if (dishByExt.has(r.external_item_id)) return false; // dish exists, we'll re-link
        return true;
      });
      if (rowsNeedingDish.length) {
        const dishInserts = rowsNeedingDish.map((r) => ({
          restaurant_id: currentRestaurant.id,
          location_id: locationId,
          name: r.item_name || `Captiva ${r.external_item_id}`,
          category: r.department || null,
          department: r.department || null,
          selling_price: r.quantity > 0 ? Number((r.gross_sales / r.quantity).toFixed(2)) : 0,
          item_type: inferItemType(r.department),
          source: "captiva_xls",
          needs_review: true,
          is_active: true,
          captiva_external_id: r.external_item_id,
        }));
        const { data: created, error: dErr } = await supabase
          .from("dishes")
          .insert(dishInserts)
          .select("id, captiva_external_id");
        if (dErr) throw dErr;
        for (const d of created || []) {
          if (d.captiva_external_id) dishByExt.set(d.captiva_external_id, d.id);
        }
      }

      // 3) Persist mapped_dish_id on external_pos_items rows that were previously null
      const linkRows = parsed.rows
        .map((r) => {
          const cat = catByExt.get(r.external_item_id);
          if (!cat) return null;
          if (cat.mapped_dish_id) return null; // user has already mapped
          const dishId = dishByExt.get(r.external_item_id);
          if (!dishId) return null;
          return {
            restaurant_id: currentRestaurant.id,
            location_id: locationId,
            pos_provider: provider,
            external_item_id: r.external_item_id,
            external_item_name: r.item_name,
            department: r.department || null,
            mapped_dish_id: dishId,
            needs_review: true,
          };
        })
        .filter(Boolean) as any[];
      if (linkRows.length) {
        const { error: linkErr } = await supabase
          .from("external_pos_items")
          .upsert(linkRows, {
            onConflict: "restaurant_id,location_id,pos_provider,external_item_id",
            ignoreDuplicates: false,
          });
        if (linkErr) throw linkErr;
      }

      // Build final external -> dish map (either user-mapped or auto-created)
      const finalDishByExt = new Map<string, string>();
      for (const r of parsed.rows) {
        const dishId = catByExt.get(r.external_item_id)?.mapped_dish_id
          || dishByExt.get(r.external_item_id)
          || null;
        if (dishId) finalDishByExt.set(r.external_item_id, dishId);
      }

      // 4) Stage every product row in pos_sales_import (idempotent per date+product)
      const importRows = parsed.rows.map((r) => ({
        restaurant_id: currentRestaurant.id,
        location_id: locationId,
        pos_provider: provider,
        external_sale_id: `${dateStr}:${r.external_item_id}`,
        mapped_quantity: Math.round(r.quantity),
        mapped_total_price: r.gross_sales,
        mapped_sale_date: dateStr,
        mapped_dish_id: finalDishByExt.get(r.external_item_id) ?? null,
        external_item_id: r.external_item_id,
        item_name: r.item_name,
        department: r.department || null,
        gross_sales: r.gross_sales,
        net_sales: r.net_sales,
        vat_amount: r.vat_amount,
        discount_amount: r.discount_amount,
        sync_status: finalDishByExt.get(r.external_item_id) ? "mapped" : "pending",
        data: {
          source: provider,
          report_date: dateStr,
          sheet: sheetName,
          raw: r.raw,
        },
      }));
      const { data: stagedRows, error: upErr } = await supabase
        .from("pos_sales_import")
        .upsert(importRows, {
          onConflict: "restaurant_id,location_id,pos_provider,external_sale_id",
        })
        .select("id, external_item_id, mapped_dish_id, mapped_quantity, mapped_total_price");
      if (upErr) throw upErr;

      let appliedCount = 0;
      if (mode === "apply") {
        // IDEMPOTENCY (B3): each sale row is keyed to its staged pos_sales_import
        // row (pos_import_id, partial-unique in the database), so re-importing the
        // same day UPDATES the same sale rows in place instead of adding copies.
        // Re-importing a corrected file therefore yields corrected — not additive —
        // totals, and an interrupted import can simply be re-run.
        const saleRows = (stagedRows || [])
          .filter((s: any) => s.mapped_dish_id && ((s.mapped_quantity ?? 0) > 0 || (s.mapped_total_price ?? 0) > 0))
          .map((s: any) => ({
            restaurant_id: currentRestaurant.id,
            location_id: locationId,
            dish_id: s.mapped_dish_id,
            quantity: Math.max(1, Math.round(s.mapped_quantity || 1)),
            total_price: Number(s.mapped_total_price || 0),
            sale_date: dateStr,
            source: provider,
            pos_import_id: s.id,
          }));

        if (saleRows.length) {
          const { error: insErr } = await supabase
            .from("sales")
            .upsert(saleRows, { onConflict: "pos_import_id" });
          if (insErr) throw insErr;
          appliedCount = saleRows.length;
        }

        // Remove sales for this day/location that the corrected file no longer
        // contains (e.g. a product was dropped). Done AFTER the upsert so there is
        // never a window where the day has no revenue.
        const keepIds = saleRows.map((r) => r.pos_import_id);
        let staleQuery = supabase
          .from("sales")
          .delete()
          .eq("restaurant_id", currentRestaurant.id)
          .eq("location_id", locationId)
          .eq("sale_date", dateStr)
          .eq("source", provider);
        if (keepIds.length) {
          staleQuery = staleQuery.not("pos_import_id", "in", `(${keepIds.join(",")})`);
        }
        const { error: staleErr } = await staleQuery;
        if (staleErr) throw staleErr;
      }


      // 5) Upsert daily summary row (orders/visitors/AOV are OPTIONAL manual inputs,
      //    only meaningful when a single store is being imported)
      const parsedOrders = allowManualSummary && orderCountInput.trim() ? parseInt(orderCountInput, 10) : null;
      const parsedVisitors = allowManualSummary && visitorCountInput.trim() ? parseInt(visitorCountInput, 10) : null;
      let parsedAOV: number | null = allowManualSummary && aovInput.trim() ? Number(aovInput.replace(",", ".")) : null;
      if (parsedAOV == null && parsedOrders && parsedOrders > 0) {
        parsedAOV = Number((totals.gross / parsedOrders).toFixed(2));
      }

      // MERGE, never replace: the canonical upsert keeps any figures a Daily
      // Sales Summary report already supplied (receipts/visitors stay when the
      // manual inputs are blank — blank is not zero).
      const { error: sumErr } = await supabase.rpc("upsert_pos_daily_summary", {
        p_restaurant_id: currentRestaurant.id,
        p_location_id: locationId,
        p_pos_provider: provider,
        p_report_date: dateStr,
        p_report_kind: "products",
        p_gross: Number(totals.gross.toFixed(2)),
        p_net: Number(totals.net.toFixed(2)),
        p_vat: Number(totals.vat.toFixed(2)),
        p_discounts: Number(totals.disc.toFixed(2)),
        p_order_count: Number.isFinite(parsedOrders as any) ? parsedOrders : null,
        p_visitor_count: Number.isFinite(parsedVisitors as any) ? parsedVisitors : null,
        p_average_order_value: Number.isFinite(parsedAOV as any) ? parsedAOV : null,
        p_source_file: file?.name || null,
      });
      if (sumErr) throw sumErr;

      return { products: importRows.length, applied: appliedCount };
    }
  };

  /**
   * Imports a Daily Sales Summary sheet (no product lines): MERGES control
   * totals and receipts/visitors into the canonical day row via the RPC.
   * Blank figures are sent as NULL so existing values are never wiped.
   * Closed-day and permission checks run inside the RPC.
   */
  const importDailySummaryStore = async (
    locationId: string,
    sum: DailySummaryParsed,
    dateStr: string,
  ) => {
    if (!currentRestaurant) return;
    const { error } = await supabase.rpc("upsert_pos_daily_summary", {
      p_restaurant_id: currentRestaurant.id,
      p_location_id: locationId,
      p_pos_provider: "captiva_xls",
      p_report_date: dateStr,
      p_report_kind: "summary",
      p_gross: sum.gross,
      p_net: sum.net,
      p_vat: sum.vat,
      p_discounts: sum.discounts,
      p_order_count: sum.receipts != null ? Math.round(sum.receipts) : null,
      p_visitor_count: sum.visitors != null ? Math.round(sum.visitors) : null,
      p_source_file: file?.name || null,
    });
    if (error) throw error;
  };

  /**
   * Aggregated period reports have no individual trading dates, so they must NEVER be
   * posted to a single invented day. They go to the existing historical Product
   * Intelligence storage instead, keeping daily reporting untouched.
   */
  const importHistoricalStore = async (
    locationId: string,
    rows: ParsedRow[],
    periodStart: string,
    periodEnd: string,
  ) => {
    if (!currentRestaurant) return 0;
    const provider = "captiva";
    const histRows = rows.map((r) => ({
      restaurant_id: currentRestaurant.id,
      location_id: locationId,
      pos_provider: provider,
      external_item_id: r.external_item_id,
      item_name: r.item_name,
      department: r.department || null,
      period_start: periodStart,
      period_end: periodEnd,
      period_label: `${periodStart} → ${periodEnd}`,
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

    // Keep the POS product catalogue in step without touching manual settings.
    const { data: existing } = await supabase
      .from("external_pos_items")
      .select("external_item_id")
      .eq("restaurant_id", currentRestaurant.id)
      .eq("location_id", locationId)
      .in("external_item_id", rows.map((r) => r.external_item_id));
    const known = new Set((existing || []).map((e: any) => e.external_item_id));
    const newRows = rows.filter((r) => !known.has(r.external_item_id)).map((r) => ({
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
      const { error: eErr } = await supabase.from("external_pos_items").insert(newRows);
      if (eErr) throw eErr;
    }
    return histRows.length;
  };

  const handleImport = async () => {
    if (!canImport || !currentRestaurant) return;
    setBusy(true);
    try {
      const single = importableStores.length === 1;
      let products = 0;
      let applied = 0;
      let lastLocationId = "";
      let firstDate = "";
      let lastDate = "";

      if (classification === "historical") {
        for (const store of importableStores) {
          if (store.kind === "summary") continue; // daily summaries never go to historical product storage
          const locId = (storeMappings[store.sheet] as { locationId: string }).locationId;
          products += await importHistoricalStore(locId, store.rows, dateInfo.start!, dateInfo.end!);
          lastLocationId = locId;
        }
        firstDate = dateInfo.start!;
        lastDate = dateInfo.end!;
      } else {
        for (const store of importableStores) {
          const locId = (storeMappings[store.sheet] as { locationId: string }).locationId;
          // Daily Sales Summary sheets MERGE into the canonical day row via the RPC.
          if (store.kind === "summary" && store.summary) {
            const d = classification === "multi_day" && store.summary.date
              ? store.summary.date
              : format(reportDate, "yyyy-MM-dd");
            await importDailySummaryStore(locId, store.summary, d);
            if (!firstDate || d < firstDate) firstDate = d;
            if (!lastDate || d > lastDate) lastDate = d;
            lastLocationId = locId;
            continue;
          }
          // Multi-day files import each row under its own real date.
          const groups = new Map<string, ParsedRow[]>();
          if (classification === "multi_day") {
            for (const r of store.rows) {
              if (!r.sale_date) continue;
              groups.set(r.sale_date, [...(groups.get(r.sale_date) || []), r]);
            }
          } else {
            groups.set(format(reportDate, "yyyy-MM-dd"), store.rows);
          }
          for (const [d, rows] of Array.from(groups.entries()).sort()) {
            const res = await importStore(store.sheet, locId, rows, single && groups.size === 1, d);
            products += res?.products || 0;
            applied += res?.applied || 0;
            if (!firstDate || d < firstDate) firstDate = d;
            if (!lastDate || d > lastDate) lastDate = d;
          }
          lastLocationId = locId;
        }
      }

      toast({
        title: classification === "historical"
          ? "Historical report imported"
          : mode === "apply" ? "Import applied" : "Import staged",
        description:
          `${importableStores.length} store(s) · ${products} products` +
          (classification === "historical"
            ? " · stored as historical product data only."
            : (mode === "apply" ? ` · ${applied} product sale rows posted to dashboard.` : ".")),
      });

      // Persist import context so Menu Performance / Dashboard immediately
      // reflect the imported report date + location instead of jumping to today.
      try {
        if (classification !== "historical" && firstDate) setCustomRange(firstDate, lastDate || firstDate);
        if (single && lastLocationId) setSelectedLocationId(lastLocationId);
      } catch { /* non-blocking */ }

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
              {/* What kind of upload this is, and what it will update */}
              <div className="rounded-lg border p-3 space-y-2">
                <div className="text-sm font-medium">
                  {classification === "daily" && "Daily POS data"}
                  {classification === "multi_day" && "Multi-day dated POS data"}
                  {classification === "historical" && "Historical aggregated product data"}
                </div>
                <p className="text-xs text-muted-foreground">
                  {classification === "daily" && "One trading day of product sales for the matched location(s)."}
                  {classification === "multi_day" && `Rows carry their own dates (${dateInfo.start} → ${dateInfo.end}); each date is imported separately.`}
                  {classification === "historical" && `Only an aggregated period (${dateInfo.start} → ${dateInfo.end}) is known, so this cannot be posted to a single trading day. It will be stored as historical product data.`}
                </p>
                <div className="text-xs">
                  <span className="text-muted-foreground">This import will update: </span>
                  {classification === "historical"
                    ? "Product Intelligence (historical periods only)."
                    : (mode === "apply"
                        ? "Dashboard, Reports / daily calendar, Product Intelligence, Menu Performance & Cost Analysis, and theoretical inventory usage for mapped recipes."
                        : "Staged POS rows and the product catalogue only — nothing reaches the Dashboard or Reports until you choose “Apply to dashboard”.")}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Stores detected in file</Label>
                  <div className="mt-2 text-sm text-muted-foreground">
                    {detectedStores.length} store sheet(s) found. Aggregate sheets are ignored.
                  </div>
                </div>
                <div>
                  <Label>Trading date</Label>
                  {classification === "daily" ? (
                    <>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !reportDate && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {reportDate ? format(reportDate, "PPP") : "Pick a date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={reportDate} onSelect={(d) => { if (d) { setReportDate(d); setDateConfirmed(true); } }} initialFocus className={cn("p-3 pointer-events-auto")} />
                        </PopoverContent>
                      </Popover>
                      <p className={cn("text-xs mt-1", dateConfirmed ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400")}>
                        {dateInfo.kind === "detected"
                          ? "Detected from report — correct it if it is wrong."
                          : dateConfirmed
                            ? "Entered by Owner"
                            : "Date not found in report — please confirm."}
                      </p>
                      {!dateConfirmed && (
                        <Button size="sm" variant="secondary" className="mt-2 h-9" onClick={() => setDateConfirmed(true)}>
                          Confirm {format(reportDate, "PPP")}
                        </Button>
                      )}
                    </>
                  ) : (
                    <div className="mt-2 text-sm">
                      {dateInfo.start} → {dateInfo.end}
                      <p className="text-xs text-muted-foreground">
                        {classification === "multi_day" ? "Taken from the rows themselves" : "Aggregated period from the report"}
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <Label>Preview rows from</Label>
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

              <div className="rounded-lg border">
                <div className="p-3 border-b">
                  <div className="text-sm font-medium">Stores in this file</div>
                  <p className="text-xs text-muted-foreground">
                    Each store must be matched to a restaurant location, or skipped. Nothing is created or guessed automatically.
                  </p>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Store sheet</TableHead>
                      <TableHead>Trading date</TableHead>

                      <TableHead className="text-right">Rows</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="min-w-[220px]">Import to</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detectedStores.map((s) => {
                      const m = storeMappings[s.sheet] || { action: "unset" as const };
                      const value =
                        m.action === "existing" ? m.locationId
                        : m.action === "skip" ? "__skip"
                        : "";
                      return (
                        <TableRow key={s.sheet}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2 flex-wrap">
                              {s.sheet}
                              <Badge variant="outline" className="text-[10px]">
                                {s.kind === "summary" ? "Daily summary" : "Products sold"}
                              </Badge>
                            </div>
                            {s.missing.length > 0 && s.kind !== "summary" && (
                              <div className="text-xs text-destructive">Missing columns: {s.missing.slice(0, 3).join(", ")}</div>
                            )}
                            {s.kind === "summary" && s.summary && (
                              <div className="text-xs text-muted-foreground">
                                Gross {formatCurrency(s.summary.gross ?? 0)}
                                {s.summary.receipts != null && ` · ${s.summary.receipts} receipts`}
                                {s.summary.visitors != null && ` · ${s.summary.visitors} visitors`}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {classification === "daily"
                              ? (dateConfirmed ? format(reportDate, "yyyy-MM-dd") : "Awaiting confirmation")
                              : s.rowDates.length > 1
                                ? `${s.rowDates[0]} → ${s.rowDates[s.rowDates.length - 1]}`
                                : `${dateInfo.start} → ${dateInfo.end}`}
                          </TableCell>
                          <TableCell className="text-right">{s.totals.count}</TableCell>

                          <TableCell className="text-right">{s.totals.qty}</TableCell>
                          <TableCell className="text-right">{formatCurrency(s.totals.gross)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Select
                                value={value}
                                onValueChange={(v) => {
                                  if (v === "__skip") {
                                    setStoreMappings((prev) => ({ ...prev, [s.sheet]: { action: "skip" } }));
                                  } else if (v === "__new") {
                                    setNewLocationFor(s.sheet);
                                    setNewLocationName(s.sheet);
                                  } else {
                                    setStoreMappings((prev) => ({ ...prev, [s.sheet]: { action: "existing", locationId: v } }));
                                  }
                                }}
                              >
                                <SelectTrigger className="h-11"><SelectValue placeholder="Choose…" /></SelectTrigger>
                                <SelectContent>
                                  {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                                  <SelectItem value="__new">+ Add as new location</SelectItem>
                                  <SelectItem value="__skip">Skip this store</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {/* Existing canonical data + reconciliation estimate */}
                            {m.action === "existing" && dateReady && classification !== "historical" && (() => {
                              const dates = classification === "multi_day"
                                ? (s.kind === "summary" ? (s.summary?.date ? [s.summary.date] : []) : s.rowDates)
                                : [format(reportDate, "yyyy-MM-dd")];
                              const notes: React.ReactNode[] = [];
                              for (const d of dates) {
                                const rows = existingFor(m.locationId, d);
                                if (!rows.length) continue;
                                const hasP = rows.some((r: any) => r.has_product_detail);
                                const hasS = rows.some((r: any) => r.has_summary_report);
                                if (!hasP && !hasS) continue;
                                // Reconciliation: incoming kind fills one side, existing data the other.
                                const prodGross = s.kind === "products"
                                  ? (classification === "multi_day"
                                      ? s.rows.filter((r) => r.sale_date === d).reduce((a, r) => a + r.gross_sales, 0)
                                      : s.totals.gross)
                                  : rows.reduce((a: number | null, r: any) => r.product_gross_sales != null ? (a ?? 0) + Number(r.product_gross_sales) : a, null);
                                const sumGross = s.kind === "summary"
                                  ? s.summary?.gross ?? null
                                  : rows.reduce((a: number | null, r: any) => r.summary_gross_sales != null ? (a ?? 0) + Number(r.summary_gross_sales) : a, null);
                                notes.push(
                                  <div key={d} className="mt-1 text-[11px] text-muted-foreground">
                                    Existing data found for {d}: {hasP ? "products report" : ""}{hasP && hasS ? " + " : ""}{hasS ? "daily summary" : ""} — this import will merge, not duplicate.
                                    {prodGross != null && sumGross != null && (() => {
                                      const diff = Math.abs(prodGross - sumGross);
                                      const pct = sumGross !== 0 ? (diff / Math.abs(sumGross)) * 100 : (diff === 0 ? 0 : 100);
                                      const status = diff <= 0.02 ? "matched" : pct < 2 ? "small" : "review";
                                      return (
                                        <span className={cn("ml-1 font-medium", status === "review" ? "text-destructive" : status === "small" ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>
                                          {status === "matched" ? "Matched" : status === "small" ? "Small variance" : "Needs review"}
                                          {status !== "matched" && ` (Δ ${formatCurrency(diff)}${Number.isFinite(pct) ? `, ${pct.toFixed(1)}%` : ""})`}
                                        </span>
                                      );
                                    })()}
                                  </div>
                                );
                              }
                              return notes.length ? <>{notes}</> : null;
                            })()}
                            {newLocationFor === s.sheet && (
                              <div className="mt-2 flex items-center gap-2">
                                <Input
                                  className="h-11"
                                  value={newLocationName}
                                  onChange={(e) => setNewLocationName(e.target.value)}
                                  placeholder="New location name"
                                />
                                <Button
                                  size="sm"
                                  className="h-11"
                                  disabled={!newLocationName.trim() || createLocation.isPending || !currentRestaurant}
                                  onClick={async () => {
                                    if (!currentRestaurant) return;
                                    const created = await createLocation.mutateAsync({
                                      name: newLocationName.trim(),
                                      restaurant_id: currentRestaurant.id,
                                    } as any);
                                    setStoreMappings((prev) => ({
                                      ...prev,
                                      [s.sheet]: { action: "existing", locationId: created.id },
                                    }));
                                    setNewLocationFor(null);
                                    setNewLocationName("");
                                  }}
                                >
                                  Create
                                </Button>
                                <Button size="sm" variant="ghost" className="h-11" onClick={() => setNewLocationFor(null)}>
                                  Cancel
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {unresolvedStores.length > 0 && (
                  <div className="p-3 border-t text-xs text-amber-600 dark:text-amber-400">
                    {unresolvedStores.length} store(s) still need a decision before importing.
                  </div>
                )}
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

                  {importableStores.length === 1 && (
                  <div className="rounded-lg border p-3 space-y-2">
                    <div className="text-sm font-medium">Daily summary (optional)</div>
                    <p className="text-xs text-muted-foreground">
                      Product rows are not receipts. Enter true order/visitor counts from the Captiva journal summary if available. Leave blank if unknown.
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">Orders</Label>
                        <Input type="number" min="0" placeholder="e.g. 26" value={orderCountInput} onChange={(e) => setOrderCountInput(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">Visitors</Label>
                        <Input type="number" min="0" placeholder="e.g. 106" value={visitorCountInput} onChange={(e) => setVisitorCountInput(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">Avg order value</Label>
                        <Input type="number" min="0" step="0.01" placeholder="auto" value={aovInput} onChange={(e) => setAovInput(e.target.value)} />
                      </div>
                    </div>
                  </div>
                  )}

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
            {busy ? "Importing…" : classification === "historical" ? "Confirm — store as historical" : mode === "apply" ? "Confirm Import & Apply" : "Confirm — Stage Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

