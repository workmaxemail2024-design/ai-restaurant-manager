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

/**
 * Strict aggregate/roll-up detector used for STORE LABELS (sheet names and the
 * Store column of a tabular Daily Sales Summary). A Captiva roll-up line such as
 * "All Stores" repeats the same revenue as the individual store lines, so it must
 * never be mapped to a location or imported.
 */
function isAggregateLabel(name: string): boolean {
  const s = String(name || "").trim().toLowerCase().replace(/[.*]/g, "").trim();
  if (!s) return false;
  if (/\ball\s*(stores?|locations?|sites?|branches|outlets|shops)\b/.test(s)) return true;
  return /^(grand\s*total|totals?|company\s*total|overall|all)$/.test(s);
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

/** Columns of a Captiva tabular Daily Sales Summary (one row per store/date). */
const SUM_COL = {
  date: /^(date|business\s*date|trading\s*date|sales?\s*date)$/i,
  store: /^store(\s*name)?$/i,
  gross: /^(sales|sales\s*value|gross|gross\s*sales|total\s*sales|turnover)$/i,
  net: /^(net|net\s*sales|net\s*value)$/i,
  vat: /^(vat|vat\s*amount|tax)$/i,
  count: /^(sales\s*count|receipts?|transactions?|orders|no\.?\s*of\s*sales)$/i,
  visitors: /^(visitors?|covers|guests|customers|diners)$/i,
  discount: /^(discount\s*value|discounts?|discount\s*amount)$/i,
};

export type SummaryTableRow = { store: string | null; summary: DailySummaryParsed };

function findSummaryTableHeader(grid: any[][]): number {
  for (let i = 0; i < Math.min(grid.length, 40); i++) {
    const row = (grid[i] || []).map((c) => String(c ?? "").trim());
    if (row.some((c) => SUM_COL.date.test(c)) && row.some((c) => SUM_COL.gross.test(c))) return i;
  }
  return -1;
}

/**
 * Captiva "Daily Sales Summary" workbooks are a TABLE (one row per store/date),
 * not a label/value block. Returns one parsed daily summary per dated row, so a
 * 1–12 Sep report yields 12 separate trading days instead of an aggregate period.
 */
export function parseSummaryTableSheet(grid: any[][]): SummaryTableRow[] {
  if (findHeaderRow(grid) !== -1) return []; // a product table always wins
  const h = findSummaryTableHeader(grid);
  if (h === -1) return [];
  const header = (grid[h] || []).map((c: any) => String(c ?? "").trim());
  const col = (re: RegExp) => header.findIndex((c) => re.test(c));
  const ci = {
    date: col(SUM_COL.date), store: col(SUM_COL.store), gross: col(SUM_COL.gross),
    net: col(SUM_COL.net), vat: col(SUM_COL.vat), count: col(SUM_COL.count),
    visitors: col(SUM_COL.visitors), discount: col(SUM_COL.discount),
  };
  if (ci.date === -1 || ci.gross === -1) return [];
  const out: SummaryTableRow[] = [];
  for (let i = h + 1; i < grid.length; i++) {
    const r = grid[i];
    if (!r) continue;
    if (/^(total|grand)/i.test(String(r[0] ?? "").trim())) continue;
    const date = toISODate(r[ci.date]);
    if (!date) continue;
    const gross = toNullableNumber(r[ci.gross]);
    if (gross == null) continue;
    out.push({
      store: ci.store >= 0 ? (String(r[ci.store] ?? "").trim() || null) : null,
      summary: {
        date,
        gross,
        net: ci.net >= 0 ? toNullableNumber(r[ci.net]) : null,
        vat: ci.vat >= 0 ? toNullableNumber(r[ci.vat]) : null,
        discounts: ci.discount >= 0 ? toNullableNumber(r[ci.discount]) : null,
        receipts: ci.count >= 0 ? toNullableNumber(r[ci.count]) : null,
        visitors: ci.visitors >= 0 ? toNullableNumber(r[ci.visitors]) : null,
      },
    });
  }
  return out;
}

type DetectedStore = {
  /** Unique mapping key (a sheet may contain several stores). */
  key: string;
  sheet: string;
  label: string;
  kind: "products" | "summary";
  rows: ParsedRow[];
  missing: string[];
  summaries: DailySummaryParsed[];
  headerDates: string[];
  rowDates: string[];
  totals: { qty: number; gross: number; net: number; vat: number; disc: number; count: number };
  /** Captiva roll-up line (e.g. "All Stores") — shown, never imported. */
  isAggregate: boolean;
};


/** Per trading date, what this import would do to existing canonical data. */
type DateAction = "add" | "enrich" | "up_to_date" | "review" | "closed";




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

  // Import setup step — an Owner HINT used only to confirm the file, never to
  // override what the workbook actually contains.
  const [intendedType, setIntendedType] = useState<"summary" | "products" | null>(null);
  const [intendedScope, setIntendedScope] = useState<"single" | "range">("single");
  const [intendedDate, setIntendedDate] = useState<Date>(new Date());
  const [intendedStart, setIntendedStart] = useState<Date>(new Date());
  const [intendedEnd, setIntendedEnd] = useState<Date>(new Date());
  const [typeMismatchAck, setTypeMismatchAck] = useState(false);
  const [dateMismatchAck, setDateMismatchAck] = useState(false);
  // Per-date Keep existing / Replace decisions for "Needs review" dates.
  const [reviewDecisions, setReviewDecisions] = useState<Record<string, "keep" | "replace">>({});
  // Sheets the Owner removed from this import with ×. Reversible before Apply.
  const [ignoredStores, setIgnoredStores] = useState<Record<string, boolean>>({});
  // True once the Owner has picked the trading date by hand — a manual choice is
  // never silently replaced by a date detected in the file.
  const [dateManuallySet, setDateManuallySet] = useState(false);

  const sheetNames = workbook?.SheetNames || [];
  const availableSheets = includeInactive
    ? sheetNames
    : sheetNames.filter((n) => !/no\s*activity/i.test(n));

  const clearFile = () => {
    setFile(null); setWorkbook(null); setSheetName(""); setError(null);
    setStoreMappings({}); setNewLocationFor(null); setNewLocationName("");
    setDateConfirmed(false); setTypeMismatchAck(false); setDateMismatchAck(false);
    setReviewDecisions({}); setIgnoredStores({}); setDateManuallySet(false);
  };


  const reset = () => {
    clearFile();
    setMode("stage"); setIncludeInactive(false);
    setOrderCountInput(""); setVisitorCountInput(""); setAovInput("");
    setIntendedType(null); setIntendedScope("single");
  };



  const handleFile = useCallback(async (f: File) => {
    setError(null);
    setFile(f);
    setDateConfirmed(false);
    setTypeMismatchAck(false);
    setDateMismatchAck(false);
    setStoreMappings({});
    setReviewDecisions({});
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
   * Every store found in the workbook, with its own parsed rows and totals.
   * A sheet can be: a Products Sold table, a tabular Daily Sales Summary (one
   * row per store/date — may contain SEVERAL stores), or a label/value summary.
   * Aggregate rollup sheets are never treated as a store.
   */
  const detectedStores = useMemo<DetectedStore[]>(() => {
    if (!workbook) return [];
    const out: DetectedStore[] = [];
    const empty = sumRows([]);
    for (const n of workbook.SheetNames) {
      if (!includeInactive && /no\s*activity/i.test(n)) continue;
      const p = parseSheet(workbook, n) || { rows: [], missing: REQUIRED_COLUMNS, headerDates: [] };
      const ws = workbook.Sheets[n];
      const grid: any[][] = ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) : [];

      if (p.missing.length) {
        // (a) Tabular Daily Sales Summary — one row per store/date.
        const tableRows = parseSummaryTableSheet(grid);
        if (tableRows.length) {
          const groups = new Map<string, DailySummaryParsed[]>();
          for (const tr of tableRows) {
            const k = tr.store || n;
            groups.set(k, [...(groups.get(k) || []), tr.summary]);
          }
          for (const [storeLabel, sums] of groups) {
            const dates = Array.from(new Set(sums.map((s) => s.date).filter(Boolean) as string[])).sort();
            out.push({
              key: `${n}::${storeLabel}`,
              sheet: n,
              label: storeLabel === n ? n : `${storeLabel}`,
              kind: "summary",
              rows: [], missing: [], summaries: sums,
              headerDates: dates, rowDates: dates, totals: empty,
              isAggregate: isAggregateLabel(storeLabel),
            });
          }
          continue;
        }
        // (b) Label/value Daily Sales Summary sheet.
        const single = parseDailySummarySheet(grid);
        if (single) {
          const dates = single.date ? [single.date] : [];
          out.push({
            key: n, sheet: n, label: n, kind: "summary",
            rows: [], missing: [], summaries: [single],
            headerDates: dates.length ? dates : p.headerDates, rowDates: dates, totals: empty,
            isAggregate: isAggregateLabel(n),
          });
          continue;
        }
      }

      const rowDates = Array.from(
        new Set(p.rows.map((r) => r.sale_date).filter(Boolean) as string[])
      ).sort();
      out.push({
        key: n, sheet: n, label: n, kind: "products",
        rows: p.rows, missing: p.missing, summaries: [],
        headerDates: p.headerDates, rowDates, totals: sumRows(p.rows),
        isAggregate: isAggregateSheet(n) || isAggregateLabel(n),
      });

    }
    return out;
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

  // Pre-fill the picker from a detected single date. A date the Owner picked by
  // hand is kept — it is only replaced through "Use detected date".
  useEffect(() => {
    if (dateManuallySet) return;
    if (dateInfo.kind === "detected" && dateInfo.start) {
      setReportDate(new Date(`${dateInfo.start}T00:00:00`));
      setDateConfirmed(true);
    }
  }, [dateInfo.kind, dateInfo.start, dateManuallySet]);


  const classification: "daily" | "multi_day" | "historical" =
    dateInfo.kind === "row_dates" ? "multi_day"
    : dateInfo.kind === "period" ? "historical"
    : "daily";

  /** What the file actually is, compared with the Owner's setup selections. */
  const detectedType: "products" | "summary" | null = useMemo(() => {
    if (!detectedStores.length) return null;
    return detectedStores.some((s) => s.kind === "summary") &&
      !detectedStores.some((s) => s.kind === "products" && !s.missing.length)
      ? "summary"
      : "products";
  }, [detectedStores]);

  const detectedStart = dateInfo.start ?? (classification === "daily" ? format(reportDate, "yyyy-MM-dd") : null);
  const detectedEnd = dateInfo.end ?? detectedStart;

  const typeMismatch = !!(workbook && intendedType && detectedType && intendedType !== detectedType);
  const intendedStartStr = intendedScope === "single"
    ? format(intendedDate, "yyyy-MM-dd")
    : format(intendedStart, "yyyy-MM-dd");
  const intendedEndStr = intendedScope === "single"
    ? format(intendedDate, "yyyy-MM-dd")
    : format(intendedEnd, "yyyy-MM-dd");
  const dateMismatch = !!(
    workbook && detectedStart && detectedEnd &&
    (detectedStart !== intendedStartStr || detectedEnd !== intendedEndStr)
  );
  const blockingMismatch = (typeMismatch && !typeMismatchAck) || (dateMismatch && !dateMismatchAck);

  /** Sheets the Owner has removed from this import (reversible before Apply). */
  const isEligible = useCallback(
    (s: DetectedStore) => !s.isAggregate && !ignoredStores[s.key],
    [ignoredStores],
  );
  const importableStores = detectedStores.filter((s) => {
    if (!isEligible(s)) return false;
    const m = storeMappings[s.key];
    if (!m || m.action !== "existing" || !m.locationId) return false;
    if (s.kind === "summary") return s.summaries.length > 0;
    return s.rows.length > 0 && !s.missing.length;
  });
  const unresolvedStores = detectedStores.filter((s) => {
    if (!isEligible(s)) return false;
    const m = storeMappings[s.key];
    return !m || m.action === "unset";
  });


  const parsed = useMemo(() => {
    if (!workbook || !sheetName) return null;
    return parseSheet(workbook, sheetName);
  }, [workbook, sheetName, parseSheet]);

  const totals = useMemo(() => sumRows(parsed?.rows || []), [parsed]);

  const dateReady = classification === "daily" ? dateConfirmed : true;

  /** Dates this store writes to (never fabricated for summaries). */
  const storeDates = useCallback((s: DetectedStore): string[] => {
    if (s.kind === "summary") {
      const ds = Array.from(new Set(s.summaries.map((x) => x.date).filter(Boolean) as string[])).sort();
      return ds.length ? ds : (dateConfirmed ? [format(reportDate, "yyyy-MM-dd")] : []);
    }
    if (classification === "multi_day") return s.rowDates;
    return dateConfirmed ? [format(reportDate, "yyyy-MM-dd")] : [];
  }, [classification, dateConfirmed, reportDate]);

  /** The (location, trading date) pairs this import would write to. */
  const previewTargets = useMemo(() => {
    if (!currentRestaurant || !dateReady || classification === "historical") {
      return [] as Array<{ locationId: string; date: string }>;
    }
    const targets: Array<{ locationId: string; date: string }> = [];
    for (const s of importableStores) {
      const locId = (storeMappings[s.key] as { locationId: string }).locationId;
      for (const d of storeDates(s)) targets.push({ locationId: locId, date: d });
    }
    return targets;
  }, [currentRestaurant, dateReady, importableStores, classification, storeMappings, storeDates]);

  /** Existing canonical POS day rows + closed days for those targets. */
  const targetKey = previewTargets.map((t) => `${t.locationId}:${t.date}`).sort().join("|");
  const { data: existingData } = useQuery({
    queryKey: ["pos-import-existing", currentRestaurant?.id, targetKey],
    enabled: !!currentRestaurant && previewTargets.length > 0,
    queryFn: async () => {
      const locIds = Array.from(new Set(previewTargets.map((t) => t.locationId)));
      const dates = Array.from(new Set(previewTargets.map((t) => t.date)));
      const [{ data: days }, { data: ledger }] = await Promise.all([
        supabase
          .from("pos_daily_summaries")
          .select("location_id, report_date, pos_provider, has_product_detail, has_summary_report, product_gross_sales, summary_gross_sales, order_count, visitor_count")
          .eq("restaurant_id", currentRestaurant!.id)
          .in("location_id", locIds)
          .in("report_date", dates),
        supabase
          .from("daily_ledger_entries")
          .select("location_id, entry_date, is_closed")
          .eq("restaurant_id", currentRestaurant!.id)
          .in("location_id", locIds)
          .in("entry_date", dates)
          .eq("is_closed", true),
      ]);
      return { days: (days as any[]) ?? [], closed: (ledger as any[]) ?? [] };
    },
  });
  const existingPosDays = existingData?.days ?? [];
  const closedDays = existingData?.closed ?? [];
  const existingFor = useCallback(
    (locationId: string, date: string) =>
      existingPosDays.filter((r: any) => r.location_id === locationId && r.report_date === date),
    [existingPosDays],
  );
  const isClosedDay = useCallback(
    (locationId: string, date: string) =>
      closedDays.some((r: any) => r.location_id === locationId && r.entry_date === date),
    [closedDays],
  );

  const nearlyEqual = (a: number | null, b: number | null) =>
    a != null && b != null && Math.abs(a - b) <= 0.02;

  /**
   * Date-by-date plan. Each trading date is judged independently against the
   * existing canonical data — one problem date never affects the others.
   */
  const datePlan = useMemo(() => {
    if (!dateReady || classification === "historical") return [] as Array<{
      id: string; storeKey: string; label: string; kind: "products" | "summary";
      locationId: string; date: string;
      gross: number | null; count: number | null;
      existingLabel: string; existingGross: number | null;
      action: DateAction;
    }>;
    const plan: Array<any> = [];
    for (const s of importableStores) {
      const locId = (storeMappings[s.key] as { locationId: string }).locationId;
      for (const d of storeDates(s)) {
        const rows = existingFor(locId, d);
        const hasP = rows.some((r: any) => r.has_product_detail);
        const hasS = rows.some((r: any) => r.has_summary_report);
        const existProd = rows.reduce((a: number | null, r: any) => r.product_gross_sales != null ? (a ?? 0) + Number(r.product_gross_sales) : a, null);
        const existSum = rows.reduce((a: number | null, r: any) => r.summary_gross_sales != null ? (a ?? 0) + Number(r.summary_gross_sales) : a, null);

        let gross: number | null = null;
        let count: number | null = null;
        if (s.kind === "summary") {
          const mine = s.summaries.filter((x) => (x.date ?? d) === d);
          gross = mine.reduce((a: number | null, x) => x.gross != null ? (a ?? 0) + x.gross : a, null);
          count = mine.reduce((a: number | null, x) => x.receipts != null ? (a ?? 0) + x.receipts : a, null);
        } else {
          const mine = classification === "multi_day" ? s.rows.filter((r) => r.sale_date === d) : s.rows;
          gross = mine.reduce((a, r) => a + r.gross_sales, 0);
        }

        const sameSideExisting = s.kind === "summary" ? existSum : existProd;
        const sameSideExists = s.kind === "summary" ? hasS : hasP;
        const otherSideGross = s.kind === "summary" ? existProd : existSum;

        let action: DateAction;
        if (isClosedDay(locId, d)) action = "closed";
        else if (!hasP && !hasS) action = "add";
        else if (sameSideExists && nearlyEqual(sameSideExisting, gross)) action = "up_to_date";
        else if (sameSideExists) action = "review";
        else action = "enrich";

        const existingLabel = isClosedDay(locId, d)
          ? "Day closed"
          : !hasP && !hasS
            ? "Missing"
            : [hasP ? `Products ${existProd != null ? formatCurrency(existProd) : "—"}` : null,
               hasS ? `Summary ${existSum != null ? formatCurrency(existSum) : "—"}` : null]
              .filter(Boolean).join(" · ");

        plan.push({
          id: `${s.key}|${locId}|${d}`,
          storeKey: s.key, label: s.label, kind: s.kind,
          locationId: locId, date: d, gross, count,
          existingLabel, existingGross: sameSideExists ? sameSideExisting : otherSideGross,
          action,
        });
      }
    }
    return plan.sort((a, b) => a.label.localeCompare(b.label) || a.date.localeCompare(b.date));
  }, [dateReady, classification, importableStores, storeMappings, storeDates, existingFor, isClosedDay]);

  const pendingReviews = datePlan.filter((p) => p.action === "review" && !reviewDecisions[p.id]);
  const writableDates = datePlan.filter(
    (p) => p.action === "add" || p.action === "enrich" ||
      (p.action === "review" && reviewDecisions[p.id] === "replace"),
  );
  /** Fast lookup used by the importer to skip dates that must not be written. */
  const shouldWriteDate = useCallback(
    (storeKey: string, locationId: string, date: string) =>
      writableDates.some((p) => p.id === `${storeKey}|${locationId}|${date}`),
    [writableDates],
  );

  const canImport = !!(
    currentRestaurant && importableStores.length && !unresolvedStores.length && dateReady &&
    !blockingMismatch && !pendingReviews.length &&
    (classification === "historical" || writableDates.length > 0)
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

      let summaryDays = 0;
      let skipped = 0;

      if (classification === "historical") {
        for (const store of importableStores) {
          if (store.kind === "summary") continue; // daily summaries never go to historical product storage
          const locId = (storeMappings[store.key] as { locationId: string }).locationId;
          products += await importHistoricalStore(locId, store.rows, dateInfo.start!, dateInfo.end!);
          lastLocationId = locId;
        }
        firstDate = dateInfo.start!;
        lastDate = dateInfo.end!;
      } else {
        for (const store of importableStores) {
          const locId = (storeMappings[store.key] as { locationId: string }).locationId;
          // Daily Sales Summary sheets MERGE into the canonical day row via the
          // RPC — one write per trading date, each judged independently.
          if (store.kind === "summary") {
            const byDate = new Map<string, DailySummaryParsed>();
            for (const sum of store.summaries) {
              const d = sum.date ?? format(reportDate, "yyyy-MM-dd");
              byDate.set(d, sum);
            }
            for (const [d, sum] of Array.from(byDate.entries()).sort()) {
              if (!shouldWriteDate(store.key, locId, d)) { skipped++; continue; }
              await importDailySummaryStore(locId, sum, d);
              summaryDays++;
              if (!firstDate || d < firstDate) firstDate = d;
              if (!lastDate || d > lastDate) lastDate = d;
            }
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
            if (!shouldWriteDate(store.key, locId, d)) { skipped++; continue; }
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
          `${importableStores.length} store(s)` +
          (summaryDays ? ` · ${summaryDays} daily summar${summaryDays === 1 ? "y" : "ies"}` : "") +
          (products ? ` · ${products} products` : "") +
          (skipped ? ` · ${skipped} date(s) left unchanged` : "") +
          (classification === "historical"
            ? " · stored as historical product data only."
            : (mode === "apply" && products ? ` · ${applied} product sale rows posted to dashboard.` : ".")),
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
            Import a Captiva Sales Summary or Products Sold report — one day or a date range. Tell us what you are uploading, choose the file, review each trading date, then confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* STEP 1 — what the Owner intends to upload (a confirmation aid only) */}
          <div className="rounded-lg border p-3 space-y-3">
            <div className="text-sm font-medium">1. What are you importing?</div>
            <div>
              <Label className="text-xs">Report type</Label>
              <div className="flex gap-2 mt-1">
                {([["summary", "Sales Summary"], ["products", "Products Sold"]] as const).map(([v, lbl]) => (
                  <Button
                    key={v}
                    type="button"
                    variant={intendedType === v ? "default" : "outline"}
                    className="h-11 flex-1"
                    onClick={() => { setIntendedType(v); setTypeMismatchAck(false); }}
                  >
                    {lbl}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">Date scope</Label>
              <div className="flex gap-2 mt-1">
                {([["single", "Single day"], ["range", "Date range"]] as const).map(([v, lbl]) => (
                  <Button
                    key={v}
                    type="button"
                    variant={intendedScope === v ? "default" : "outline"}
                    className="h-11 flex-1"
                    onClick={() => { setIntendedScope(v); setDateMismatchAck(false); }}
                  >
                    {lbl}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(intendedScope === "single"
                ? [["Trading date", intendedDate, setIntendedDate] as const]
                : [["Start date", intendedStart, setIntendedStart] as const,
                   ["End date", intendedEnd, setIntendedEnd] as const]
              ).map(([lbl, val, set]) => (
                <div key={lbl}>
                  <Label className="text-xs">{lbl}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full h-11 justify-start text-left font-normal mt-1">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(val, "PPP")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={val} onSelect={(d) => { if (d) { set(d); setDateMismatchAck(false); } }} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </div>
              ))}
            </div>
            <div>
              <Label className="text-xs">Captiva XLS file</Label>
              <Input
                className="mt-1 h-11"
                type="file"
                accept=".xls,.xlsx,.xlsm"
                disabled={!intendedType}
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              {!intendedType && <p className="text-xs text-muted-foreground mt-1">Choose a report type first.</p>}
              {file && <p className="text-xs text-muted-foreground mt-1">{file.name}</p>}
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {workbook && (
            <>
              {/* Selected vs detected — never silently continue on a disagreement */}
              <div className="rounded-lg border p-3 space-y-2">
                <div className="text-sm font-medium">
                  {classification === "daily" && (detectedType === "summary" ? "Daily Sales Summary" : "Daily POS data")}
                  {classification === "multi_day" && (detectedType === "summary" ? "Multi-day Daily Sales Summary" : "Multi-day dated POS data")}
                  {classification === "historical" && "Historical aggregated product data"}
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-muted-foreground">Selected by you</div>
                    <div>{intendedType === "summary" ? "Sales Summary" : "Products Sold"} · {intendedStartStr}{intendedEndStr !== intendedStartStr ? ` → ${intendedEndStr}` : ""}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Detected from file</div>
                    <div>
                      {detectedType === "summary" ? "Daily Sales Summary" : "Products Sold"}
                      {detectedStart ? ` · ${detectedStart}${detectedEnd !== detectedStart ? ` → ${detectedEnd}` : ""}` : ""}
                      {dateInfo.dates.length > 1 ? ` · ${dateInfo.dates.length} trading days` : ""}
                    </div>
                  </div>
                </div>
                {typeMismatch && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs space-y-2">
                      <div>This file appears to be a {detectedType === "summary" ? "Sales Summary" : "Products Sold"} report, not a {intendedType === "summary" ? "Sales Summary" : "Products Sold"} report.</div>
                      <div className="flex gap-2">
                        <Button size="sm" className="h-10" onClick={() => { setIntendedType(detectedType); setTypeMismatchAck(true); }}>Use detected report type</Button>
                        <Button size="sm" variant="outline" className="h-10" onClick={clearFile}>Choose another file</Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
                {dateMismatch && !typeMismatch && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs space-y-2">
                      <div>
                        This file contains data for {detectedStart}{detectedEnd !== detectedStart ? ` – ${detectedEnd}` : ""}, which differs from the dates you selected.
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-10"
                          onClick={() => {
                            if (detectedStart) setIntendedStart(new Date(`${detectedStart}T00:00:00`));
                            if (detectedEnd) setIntendedEnd(new Date(`${detectedEnd}T00:00:00`));
                            if (detectedStart && detectedStart === detectedEnd) {
                              setIntendedScope("single");
                              setIntendedDate(new Date(`${detectedStart}T00:00:00`));
                            } else {
                              setIntendedScope("range");
                            }
                            setDateMismatchAck(true);
                          }}
                        >
                          Use detected date range
                        </Button>
                        <Button size="sm" variant="outline" className="h-10" onClick={clearFile}>Choose another file</Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
                <div className="text-xs">
                  <span className="text-muted-foreground">This import will update: </span>
                  {classification === "historical"
                    ? "Product Intelligence (historical periods only)."
                    : detectedType === "summary"
                      ? "Reports, Dashboard and daily analytics (sales count, average order value, discounts)."
                      : (mode === "apply"
                          ? "Dashboard, Reports / daily calendar, Product Intelligence, Menu Performance & Cost Analysis, and theoretical inventory usage for mapped recipes."
                          : "Staged POS rows and the product catalogue only — nothing reaches the Dashboard or Reports until you choose “Apply to dashboard”.")}
                </div>
                {detectedType === "summary" && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">This import will not create: </span>
                    individual product or transaction sales.
                  </div>
                )}
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
                      const m = storeMappings[s.key] || { action: "unset" as const };
                      const value =
                        m.action === "existing" ? m.locationId
                        : m.action === "skip" ? "__skip"
                        : "";
                      const sumGrossTotal = s.summaries.reduce(
                        (a: number | null, x) => x.gross != null ? (a ?? 0) + x.gross : a, null);
                      return (
                        <TableRow key={s.key}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2 flex-wrap">
                              {s.label}
                              <Badge variant="outline" className="text-[10px]">
                                {s.kind === "summary" ? "Daily summary" : "Products sold"}
                              </Badge>
                            </div>
                            {s.missing.length > 0 && s.kind !== "summary" && (
                              <div className="text-xs text-destructive">Missing columns: {s.missing.slice(0, 3).join(", ")}</div>
                            )}
                            {s.kind === "summary" && (
                              <div className="text-xs text-muted-foreground">
                                {s.summaries.length} trading day{s.summaries.length === 1 ? "" : "s"}
                                {sumGrossTotal != null && ` · ${formatCurrency(sumGrossTotal)}`}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {s.rowDates.length > 1
                              ? `${s.rowDates[0]} → ${s.rowDates[s.rowDates.length - 1]}`
                              : s.rowDates.length === 1
                                ? s.rowDates[0]
                                : classification === "daily"
                                  ? (dateConfirmed ? format(reportDate, "yyyy-MM-dd") : "Awaiting confirmation")
                                  : `${dateInfo.start} → ${dateInfo.end}`}
                          </TableCell>
                          <TableCell className="text-right">{s.kind === "summary" ? s.summaries.length : s.totals.count}</TableCell>

                          <TableCell className="text-right">{s.kind === "summary" ? "—" : s.totals.qty}</TableCell>
                          <TableCell className="text-right">
                            {s.kind === "summary"
                              ? (sumGrossTotal != null ? formatCurrency(sumGrossTotal) : "—")
                              : formatCurrency(s.totals.gross)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Select
                                value={value}
                                onValueChange={(v) => {
                                  if (v === "__skip") {
                                    setStoreMappings((prev) => ({ ...prev, [s.key]: { action: "skip" } }));
                                  } else if (v === "__new") {
                                    setNewLocationFor(s.key);
                                    setNewLocationName(s.label);
                                  } else {
                                    setStoreMappings((prev) => ({ ...prev, [s.key]: { action: "existing", locationId: v } }));
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
                            {newLocationFor === s.key && (
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
                                    if (!currentRestaurant || createLocation.isPending) return;
                                    const name = newLocationName.trim();
                                    // Duplicate guard: reuse an identically named location instead
                                    // of creating a second one on a double tap / slow retry.
                                    const existing = locations.find(
                                      (l) => l.name.trim().toLowerCase() === name.toLowerCase(),
                                    );
                                    try {
                                      const locationId =
                                        existing?.id ??
                                        (
                                          await createLocation.mutateAsync({
                                            name,
                                            address: null,
                                            restaurant_id: currentRestaurant.id,
                                          })
                                        ).id;
                                      setStoreMappings((prev) => ({
                                        ...prev,
                                        [s.key]: { action: "existing", locationId },
                                      }));
                                      setNewLocationFor(null);
                                      setNewLocationName("");
                                    } catch {
                                      // useCreateLocation already surfaces the error toast;
                                      // keep the field open so the user can retry.
                                    }
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

              {/* Date-by-date plan: every trading date judged independently */}
              {classification !== "historical" && datePlan.length > 0 && (
                <div className="rounded-lg border">
                  <div className="p-3 border-b">
                    <div className="text-sm font-medium">What will happen to each trading date</div>
                    <p className="text-xs text-muted-foreground">
                      Existing data is merged, never duplicated or silently overwritten. Nothing is written until you confirm.
                    </p>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background">
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Sales</TableHead>
                          <TableHead className="text-right">Sales count</TableHead>
                          <TableHead>Existing data</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {datePlan.map((p) => {
                          const decision = reviewDecisions[p.id];
                          const badge =
                            p.action === "add" ? { label: "Will add", cls: "text-emerald-600 dark:text-emerald-400" }
                            : p.action === "enrich" ? { label: "Will enrich", cls: "text-emerald-600 dark:text-emerald-400" }
                            : p.action === "up_to_date" ? { label: "Already up to date", cls: "text-muted-foreground" }
                            : p.action === "closed" ? { label: "Closed day — protected", cls: "text-amber-600 dark:text-amber-400" }
                            : { label: "Needs review", cls: "text-destructive" };
                          return (
                            <TableRow key={p.id}>
                              <TableCell className="text-xs">
                                <div className="font-medium">{p.date}</div>
                                <div className="text-muted-foreground">{p.label}</div>
                              </TableCell>
                              <TableCell className="text-right text-xs">{p.gross != null ? formatCurrency(p.gross) : "—"}</TableCell>
                              <TableCell className="text-right text-xs">{p.count != null ? p.count : "—"}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{p.existingLabel}</TableCell>
                              <TableCell className="text-xs">
                                <span className={cn("font-medium", badge.cls)}>{badge.label}</span>
                                {p.action === "closed" && (
                                  <div className="text-muted-foreground">Reopen the day before POS data can change.</div>
                                )}
                                {p.action === "review" && (
                                  <div className="mt-1 space-y-1">
                                    <div className="text-muted-foreground">
                                      Existing {p.existingGross != null ? formatCurrency(p.existingGross) : "—"} vs uploaded {p.gross != null ? formatCurrency(p.gross) : "—"}
                                    </div>
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        variant={decision === "keep" ? "default" : "outline"}
                                        className="h-9"
                                        onClick={() => setReviewDecisions((prev) => ({ ...prev, [p.id]: "keep" }))}
                                      >
                                        Keep existing
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant={decision === "replace" ? "default" : "outline"}
                                        className="h-9"
                                        onClick={() => setReviewDecisions((prev) => ({ ...prev, [p.id]: "replace" }))}
                                      >
                                        Replace
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="p-3 border-t text-xs text-muted-foreground">
                    {writableDates.length} date(s) will be written · {datePlan.length - writableDates.length} left unchanged.
                    {pendingReviews.length > 0 && (
                      <span className="ml-1 text-destructive font-medium">
                        {pendingReviews.length} date(s) need a Keep existing / Replace decision.
                      </span>
                    )}
                  </div>
                </div>
              )}



              {detectedType === "summary" ? null : parsed?.missing.length ? (
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
            {busy
              ? "Importing…"
              : classification === "historical"
                ? "Confirm — store as historical"
                : detectedType === "summary"
                  ? `Apply ${writableDates.length} date(s)`
                  : mode === "apply" ? "Confirm Import & Apply" : "Confirm — Stage Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

