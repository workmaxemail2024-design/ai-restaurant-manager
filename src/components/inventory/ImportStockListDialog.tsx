import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Camera, Loader2, Pencil, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useIngredients, calculateBaseCost, getBaseUnit, categoryLabel, groupLabel, itemTypeLabel } from "@/hooks/useIngredients";
import { useSuppliers } from "@/hooks/useSuppliers";
import { formatCurrency, formatUnitCost } from "@/lib/currency";
import { getIngredientCostUnit } from "@/lib/units";
import { toast } from "@/hooks/use-toast";
import {
  readStockGrid, autoMapColumns, buildRows, IMPORT_FIELDS, interpretRow, normalizeName, isNearMatch,
  similarity, defaultStorage, type ParsedItem, type SheetGrid, type ColumnMapping, type FieldKey,
  toEditable, extractedToGrid, unresolvedCells, type EditableRow,
  compareSupplierPrice, type SupplierPriceRow, type PriceCompare,
} from "@/lib/stockListImport";
import { PriceChangePanel } from "@/components/inventory/PriceChangePanel";
import { ExtractedRowsReview } from "@/components/inventory/ExtractedRowsReview";
import { EditImportRowSheet, type StorageType } from "@/components/inventory/EditImportRowSheet";
import type { RawRow } from "@/lib/stockListImport";

const DOC_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** existing id | "new" | "skip" | null (undecided) */
type Choice = string | null;

interface RowPlan {
  p: ParsedItem;
  /** Row number of the first row in this file with the same item name. */
  sameAsRow: number | null;
  exactId: string | null;
  candidates: { id: string; score: number }[];
}

interface SupplierPlan { key: string; name: string; exactId: string | null; candidates: string[] }

type Status = { label: string; tone: "ok" | "warn" | "bad" | "info" };

type SpPreviewStatus = "new" | "new_pack_variant" | "exact" | "code_differs" | "description_differs" | "pack_differs" | "linked_to_other_item";
type SpKind = SpPreviewStatus | "none" | "pending" | "dup";
interface SpPreviewRow {
  row_no: number; status: SpPreviewStatus; supplier_product_id: string | null; existing_ingredient_id: string | null;
  existing_code: string | null; existing_name: string | null; existing_pack_size: number | null; existing_pack_unit: string | null;
}
interface ImportResult {
  suppliers_created: number; items_created: number; items_matched: number; rows_skipped: number; starting_prices: number;
  supplier_products_created: number; supplier_products_linked: number; supplier_prices_added: number; supplier_prices_unchanged: number;
  supplier_prices_kept?: number; master_costs_updated?: number; master_history_added?: number;
}

/** Mirrors the database supplier_name_key(): lower-case, punctuation to spaces. */
const spNameKey = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const SP_TAG: Partial<Record<SpKind, Status>> = {
  new: { label: "New supplier product", tone: "info" },
  new_pack_variant: { label: "New pack size for supplier product", tone: "info" },
  exact: { label: "Supplier product already linked", tone: "ok" },
  dup: { label: "Same supplier product as earlier row", tone: "info" },
  pending: { label: "Checking supplier product…", tone: "info" },
  code_differs: { label: "Supplier code differs — confirm", tone: "warn" },
  description_differs: { label: "Supplier description differs — confirm", tone: "warn" },
  pack_differs: { label: "Supplier pack differs — conflict", tone: "bad" },
  linked_to_other_item: { label: "Supplier product linked to another item — conflict", tone: "bad" },
};

const toneClass = {
  ok: "bg-primary/15 text-primary",
  warn: "bg-warning/15 text-warning",
  bad: "bg-destructive/15 text-destructive",
  info: "bg-secondary text-secondary-foreground",
};

export function ImportStockListDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { currentRestaurant } = useRestaurant();
  const qc = useQueryClient();
  const { data: items = [] } = useIngredients({ includeArchived: true });
  const { data: suppliers = [] } = useSuppliers();
  const { data: pricedIds } = useQuery({
    queryKey: ["ingredient-priced-ids", currentRestaurant?.id],
    enabled: open && !!currentRestaurant?.id,
    queryFn: async () => {
      const ids = new Set<string>();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from("ingredient_prices").select("ingredient_id").range(from, from + 999);
        if (error) throw error;
        data.forEach((r) => ids.add(r.ingredient_id));
        if (data.length < 1000) break;
      }
      return ids;
    },
  });

  const [step, setStep] = useState<"upload" | "map" | "extracted" | "review" | "done">("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [grid, setGrid] = useState<SheetGrid | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [parsed, setParsed] = useState<ParsedItem[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [itemChoice, setItemChoice] = useState<Record<number, Choice>>({});
  const [supplierChoice, setSupplierChoice] = useState<Record<string, Choice>>({});
  const [confirmSeparate, setConfirmSeparate] = useState<{ row: number; name: string; matches: string[] } | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
  const [filter, setFilter] = useState("all");
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  /** Per-row supplier-product decision for flagged rows. */
  const [spChoice, setSpChoice] = useState<Record<number, "link" | "none" | "skiprow">>({});
  /** Photo/PDF source: original preview + editable extracted rows. */
  const [doc, setDoc] = useState<{ url: string; mime: string } | null>(null);
  const [extracted, setExtracted] = useState<EditableRow[]>([]);
  const [reading, setReading] = useState(false);
  /** Review-screen edits (in memory only): original raw rows, storage overrides, row being edited. */
  const [originalRaw, setOriginalRaw] = useState<Record<number, RawRow>>({});
  const [storageOverride, setStorageOverride] = useState<Record<number, StorageType>>({});
  const [editingRow, setEditingRow] = useState<number | null>(null);
  /** Import (effective) date; comparisons use the supplier price in force on this date. */
  const todayIso = new Date().toISOString().slice(0, 10);
  const [effDate, setEffDate] = useState(todayIso);
  /** Explicit, separate decisions for changed-price rows. Never preselected. */
  const [priceChoice, setPriceChoice] = useState<Record<number, "record" | "keep">>({});
  const [masterChoice, setMasterChoice] = useState<Record<number, boolean>>({});

  const IDENTITY: (keyof RawRow)[] = ["itemName", "supplier", "productCode", "packSize", "packUnit", "purchaseUnit", "purchaseQty"];
  const applyRowEdit = (row: number, next: RawRow, storage: StorageType | null) => {
    const cur = parsed.find((x) => x.raw.rowNumber === row);
    if (!cur) return;
    if (!originalRaw[row]) setOriginalRaw((o) => ({ ...o, [row]: cur.raw }));
    if (IDENTITY.some((k) => (cur.raw[k] ?? "") !== (next[k] ?? ""))) {
      // Identity changed: earlier decisions for this row are no longer valid.
      setItemChoice((c) => { const n = { ...c }; delete n[row]; return n; });
      setSpChoice((c) => { const n = { ...c }; delete n[row]; return n; });
      setPriceChoice((c) => { const n = { ...c }; delete n[row]; return n; });
      setMasterChoice((c) => { const n = { ...c }; delete n[row]; return n; });
    }
    setStorageOverride((o) => { const n = { ...o }; if (storage) n[row] = storage; else delete n[row]; return n; });
    setParsed((ps) => ps.map((x) => (x.raw.rowNumber === row ? interpretRow(next) : x)));
  };
  const isEdited = (row: number) => !!originalRaw[row] &&
    (JSON.stringify(originalRaw[row]) !== JSON.stringify(parsed.find((x) => x.raw.rowNumber === row)?.raw) || !!storageOverride[row]);

  const reset = () => {
    setStep("upload"); setFileName(null); setGrid(null); setMapping(null); setParsed([]); setParseError(null);
    setItemChoice({}); setSupplierChoice({}); setFilter("all"); setResult(null); setApplyError(null); setSpChoice({});
    setDoc((d) => { if (d) URL.revokeObjectURL(d.url); return null; }); setExtracted([]);
    setOriginalRaw({}); setStorageOverride({}); setEditingRow(null);
    setPriceChoice({}); setMasterChoice({}); setEffDate(new Date().toISOString().slice(0, 10));
  };

  // Downscale photos (keeps handwriting legible, avoids oversized uploads that exhaust the extractor).
  const shrinkImage = async (f: File): Promise<{ b64: string; mime: string }> => {
    const bmp = await createImageBitmap(f);
    const MAX = 2400;
    const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    const url = canvas.toDataURL("image/jpeg", 0.85);
    return { b64: url.split(",")[1] ?? "", mime: "image/jpeg" };
  };

  const readDocument = async (f: File) => {
    if (f.size > 10 * 1024 * 1024 && f.type === "application/pdf") throw new Error("File is larger than 10 MB. Please split or compress it.");
    let b64: string; let mime = f.type;
    if (f.type.startsWith("image/")) {
      ({ b64, mime } = await shrinkImage(f).catch(() => { throw new Error("Could not read this photo. Try a JPG or PNG."); }));
    } else {
      b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(",")[1] ?? "");
        r.onerror = () => rej(new Error("Could not read the file."));
        r.readAsDataURL(f);
      });
    }
    const { data, error } = await supabase.functions.invoke("stock-list-extract", {
      body: { fileBase64: b64, mimeType: mime, fileName: f.name },
    });
    if (error) {
      let msg = error.message;
      try { msg = (await (error as { context?: Response }).context?.json())?.error ?? msg; } catch { /* keep */ }
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    const rows = toEditable(data?.rows ?? []);
    if (!rows.length) throw new Error("No product lines could be read from this document.");
    setDoc({ url: URL.createObjectURL(f), mime: f.type });
    setExtracted(rows);
    setStep("extracted");
  };

  const handleFile = async (f: File) => {
    reset();
    setFileName(f.name);
    try {
      if (DOC_TYPES.includes(f.type)) {
        setReading(true);
        await readDocument(f);
        return;
      }
      const g = await readStockGrid(f);
      setGrid(g);
      setMapping(autoMapColumns(g.headers));
      setStep("map");
    } catch (e) {
      setParseError((e as Error).message);
    } finally {
      setReading(false);
    }
  };

  const continueToReview = () => {
    if (!grid || !mapping) return;
    setParsed(buildRows(grid, mapping).map(interpretRow));
    setItemChoice({}); setSupplierChoice({}); setOriginalRaw({}); setStorageOverride({});
    setStep("review");
  };

  const continueFromExtracted = () => {
    const g = extractedToGrid(extracted);
    setGrid(g);
    const m = autoMapColumns(g.headers);
    setMapping(m);
    setParsed(buildRows(g, m).map(interpretRow));
    setItemChoice({}); setSupplierChoice({}); setOriginalRaw({}); setStorageOverride({});
    setStep("review");
  };

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const supplierById = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);

  const supplierPlans = useMemo(() => {
    const map = new Map<string, SupplierPlan>();
    for (const p of parsed) {
      if (!p.supplierName) continue;
      const key = normalizeName(p.supplierName);
      if (!key || map.has(key)) continue;
      const exact = suppliers.find((s) => normalizeName(s.name) === key);
      map.set(key, {
        key, name: p.supplierName, exactId: exact?.id ?? null,
        candidates: exact ? [] : suppliers.filter((s) => isNearMatch(s.name, p.supplierName!)).map((s) => s.id),
      });
    }
    return map;
  }, [parsed, suppliers]);

  const rowPlans: RowPlan[] = useMemo(() => {
    const firstRow = new Map<string, number>();
    return parsed.map((p) => {
      const sameAs = p.normalized ? firstRow.get(p.normalized) ?? null : null;
      if (p.normalized && sameAs == null) firstRow.set(p.normalized, p.raw.rowNumber);
      const exact = items.filter((i) => normalizeName(i.name) === p.normalized);
      const active = exact.find((i) => !i.archived_at);
      const near = items
        .filter((i) => normalizeName(i.name) !== p.normalized && isNearMatch(i.name, p.name))
        .map((i) => ({ id: i.id, score: similarity(i.name, p.name) }))
        .sort((a, b) => b.score - a.score);
      return {
        p, sameAsRow: sameAs,
        exactId: active?.id ?? null,
        candidates: active ? [] : [...exact.map((i) => ({ id: i.id, score: 1 })), ...near].slice(0, 5),
      };
    });
  }, [parsed, items]);

  const planByRow = useMemo(() => new Map(rowPlans.map((r) => [r.p.raw.rowNumber, r])), [rowPlans]);

  /** Decision for a row's first occurrence (duplicates in the file follow it). */
  const decide = (r: RowPlan): Choice => {
    const explicit = itemChoice[r.p.raw.rowNumber];
    if (explicit === "skip") return "skip";
    if (r.p.blocking.length) return "skip";
    if (r.sameAsRow != null) return explicit ?? "follow";
    if (explicit) return explicit;
    if (r.exactId) return r.exactId;
    return r.candidates.length ? null : "new";
  };
  const effective = (r: RowPlan): Choice => {
    if (spChoice[r.p.raw.rowNumber] === "skiprow") return "skip";
    const d = decide(r);
    if (d !== "follow") return d;
    const first = planByRow.get(r.sameAsRow!)!;
    const fd = decide(first);
    return fd === "skip" || spChoice[first.p.raw.rowNumber] === "skiprow" ? "skip" : fd;
  };

  const resolveSupplier = (key: string): Choice => {
    const s = supplierPlans.get(key);
    if (!s) return null;
    return s.exactId ?? (s.candidates.length ? supplierChoice[key] ?? null : "new");
  };

  /** Master item this row maps to: id, null = new item, undefined = not decided/skipped. */
  const itemIdFor = (r: RowPlan): string | null | undefined => {
    const ch = effective(r);
    if (ch === "skip" || ch === null) return undefined;
    return ch === "new" ? null : ch;
  };

  // Supplier-product preview (read-only database check) + in-file duplicate detection.
  const { previewRows, spDupOf } = useMemo(() => {
    const out: Record<string, unknown>[] = [];
    const dup = new Map<number, number>();
    const first = new Map<string, number>();
    if (step !== "review") return { previewRows: out, spDupOf: dup };
    for (const r of rowPlans) {
      if (!r.p.supplierName) continue;
      const iid = itemIdFor(r);
      if (iid === undefined) continue;
      const supKey = normalizeName(r.p.supplierName);
      const sup = resolveSupplier(supKey);
      if (!sup) continue;
      const k = `${supKey}|${normalizeName(r.p.name)}|${r.p.packSize ?? ""}|${r.p.packUnit ?? ""}|${(r.p.productCode ?? "").toLowerCase()}`;
      const f = first.get(k);
      if (f != null) { dup.set(r.p.raw.rowNumber, f); continue; }
      first.set(k, r.p.raw.rowNumber);
      if (sup === "new") continue;
      out.push({
        row: r.p.raw.rowNumber, supplier_id: sup, ingredient_id: iid, product_name: r.p.name,
        product_code: r.p.productCode, pack_size: r.p.packSize, pack_unit: r.p.packUnit,
      });
    }
    return { previewRows: out, spDupOf: dup };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, rowPlans, itemChoice, supplierChoice, supplierPlans, spChoice]);

  const previewKey = JSON.stringify(previewRows);
  const { data: spPreview, isFetching: previewLoading, error: previewError } = useQuery({
    queryKey: ["sp-preview", currentRestaurant?.id, previewKey],
    enabled: open && step === "review" && previewRows.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("preview_supplier_products", { p_rows: previewRows });
      if (error) throw error;
      return new Map((data as SpPreviewRow[]).map((d) => [d.row_no, d]));
    },
  });

  const spStatus = (r: RowPlan): { kind: SpKind; preview?: SpPreviewRow; dupOf?: number } => {
    if (!r.p.supplierName || itemIdFor(r) === undefined) return { kind: "none" };
    const sup = resolveSupplier(normalizeName(r.p.supplierName));
    if (!sup) return { kind: "none" };
    const d = spDupOf.get(r.p.raw.rowNumber);
    if (d != null) return { kind: "dup", dupOf: d };
    if (sup === "new") return { kind: "new" };
    const pv = spPreview?.get(r.p.raw.rowNumber);
    if (!pv) return { kind: "pending" };
    return { kind: pv.status, preview: pv };
  };

  // Supplier price history for matched supplier products (read-only).
  const spIds = useMemo(() => [...new Set([...(spPreview?.values() ?? [])].map((v) => v.supplier_product_id).filter(Boolean) as string[])].sort(), [spPreview]);
  const { data: spHistory, isFetching: historyLoading } = useQuery({
    queryKey: ["sp-price-history", currentRestaurant?.id, spIds.join(",")],
    enabled: open && step === "review" && spIds.length > 0,
    queryFn: async () => {
      const out = new Map<string, SupplierPriceRow[]>();
      for (let i = 0; i < spIds.length; i += 200) {
        const { data, error } = await (supabase as any).from("supplier_product_prices")
          .select("supplier_product_id, effective_date, created_at, cost_per_pack, pack_size, pack_unit, base_unit, cost_per_base_unit")
          .in("supplier_product_id", spIds.slice(i, i + 200)).limit(5000);
        if (error) throw error;
        (data as SupplierPriceRow[]).forEach((h) => out.set(h.supplier_product_id, [...(out.get(h.supplier_product_id) ?? []), h]));
      }
      return out;
    },
  });

  /** Comparison against the supplier price in force on the import date (linked supplier products only). */
  const priceCmp = (r: RowPlan): PriceCompare | null => {
    if (effective(r) === "skip") return null;
    const st = spStatus(r);
    const linked = st.kind === "exact" || ((st.kind === "code_differs" || st.kind === "description_differs") && spChoice[r.p.raw.rowNumber] === "link");
    if (st.kind === "pack_differs" && st.preview?.supplier_product_id) {
      return compareSupplierPrice(spHistory?.get(st.preview.supplier_product_id) ?? [], effDate, { ...r.p, costPerPack: r.p.costPerPack, baseCost: r.p.baseCost, baseUnit: r.p.baseUnit });
    }
    if (!linked || !st.preview?.supplier_product_id || spChoice[r.p.raw.rowNumber] === "none") return null;
    return compareSupplierPrice(spHistory?.get(st.preview.supplier_product_id) ?? [], effDate, r.p);
  };
  const isChanged = (c: PriceCompare | null) => !!c && (c.kind === "up" || c.kind === "down");

  /** Whether an explicit master-cost update can be offered for this row. */
  const masterOffer = (r: RowPlan): { allowed: true } | { allowed: false; reason: string } | null => {
    const ch = effective(r);
    if (!ch || ch === "new" || ch === "skip" || ch === "follow") return null;
    const ex = itemById.get(ch);
    if (!ex || r.p.costPerPack == null) return null;
    if (!ex.pack_size || ex.pack_size <= 0 || !ex.pack_unit) return { allowed: false, reason: "item pack format unknown — update in the item editor" };
    const exUnit = getIngredientCostUnit(ex);
    if (!exUnit || exUnit !== r.p.baseUnit) return { allowed: false, reason: `units not comparable (item per ${exUnit ?? "?"}, list per ${r.p.baseUnit ?? "?"})` };
    return { allowed: true };
  };

  const spNeedsDecision = (r: RowPlan): boolean => {
    const st = spStatus(r);
    const pick = spChoice[r.p.raw.rowNumber];
    if (st.kind === "pending") return true;
    if (st.kind === "code_differs" || st.kind === "description_differs") return !pick;
    if (st.kind === "pack_differs" || st.kind === "linked_to_other_item") return !pick || pick === "link";
    return false;
  };

  const priceInfo = (r: RowPlan): { text: string; differs: boolean } => {
    const ch = effective(r);
    if (ch === "skip") return { text: "—", differs: false };
    if (r.sameAsRow != null && decide(r) === "follow") {
      return { text: r.p.costPerPack == null ? "No price" : "Not recorded (first row's price used)", differs: false };
    }
    if (r.p.costPerPack == null) return { text: "No price — stays unknown", differs: false };
    if (!ch || ch === "new") return { text: "Record as starting price", differs: false };
    if (pricedIds?.has(ch)) {
      const ex = itemById.get(ch);
      const exBase = ex ? calculateBaseCost(ex) : 0;
      if (r.p.baseCost != null && exBase > 0 && Math.abs(exBase - r.p.baseCost) / exBase < 0.005) return { text: "Same as existing price", differs: false };
      return { text: `Price differs — existing ${exBase > 0 ? `${formatCurrency(exBase)}/${getBaseUnit(ex?.pack_unit)}` : "history"} kept, not overwritten`, differs: true };
    }
    return { text: "Record as starting price (item has no price yet)", differs: false };
  };

  const statusOf = (r: RowPlan): Status[] => {
    const tags: Status[] = [];
    const ch = effective(r);
    if (ch === "skip") tags.push({ label: r.p.blocking.length ? "Skipped — missing information" : "Skipped", tone: "bad" });
    else if (r.sameAsRow != null && decide(r) === "follow") tags.push({ label: `Duplicate in file — same item as row ${r.sameAsRow}`, tone: "warn" });
    else if (r.exactId && ch === r.exactId) tags.push({ label: "Existing exact match", tone: "ok" });
    else if (ch === null) tags.push({ label: "Possible match — review", tone: "warn" });
    else if (ch === "new") tags.push({ label: r.candidates.length ? "Create separate item (confirmed)" : "New inventory item", tone: "info" });
    else tags.push({ label: "Matched existing (chosen)", tone: "ok" });

    if (r.p.supplierName && ch !== "skip") {
      const sp = supplierPlans.get(normalizeName(r.p.supplierName));
      if (sp?.exactId) tags.push({ label: "Existing supplier", tone: "ok" });
      else if (sp?.candidates.length && resolveSupplier(sp.key) === null) tags.push({ label: "Possible supplier match — review", tone: "warn" });
      else if (resolveSupplier(sp!.key) === "new") tags.push({ label: "New supplier", tone: "info" });
      else tags.push({ label: "Existing supplier", tone: "ok" });
    }
    if (ch !== "skip" && r.p.missing.length) tags.push({ label: "Missing information", tone: "warn" });
    if (ch !== "skip" && r.p.issues.length) tags.push({ label: "Conflict", tone: "bad" });
    if (priceInfo(r).differs) tags.push({ label: "Price differs", tone: "warn" });
    if (ch !== "skip") {
      const st = spStatus(r);
      const t = SP_TAG[st.kind];
      if (t && spChoice[r.p.raw.rowNumber] !== "none") tags.push(t);
      else if (t && spChoice[r.p.raw.rowNumber] === "none") tags.push({ label: "Supplier link not saved", tone: "info" });
      const c = priceCmp(r);
      if (c?.kind === "up") tags.push({ label: "Supplier price up", tone: "bad" });
      else if (c?.kind === "down") tags.push({ label: "Supplier price down", tone: "ok" });
      else if (c?.kind === "same") tags.push({ label: "Supplier price unchanged", tone: "ok" });
      else if (c?.kind === "not_comparable" && c.prev) tags.push({ label: "Price not comparable — check pack", tone: "warn" });
      if (c?.newer) tags.push({ label: "Historical list — newer price exists", tone: "warn" });
      const ex = ch && ch !== "new" && ch !== "follow" ? itemById.get(ch) : undefined;
      if (ex?.supplier_id && r.p.supplierName) {
        const fs = resolveSupplier(normalizeName(r.p.supplierName));
        if (fs && fs !== ex.supplier_id) tags.push({ label: "Existing item, different supplier", tone: "info" });
      }
    }
    return tags;
  };

  /** Notes about associating this row with an existing master item. */
  const matchNotes = (r: RowPlan): string[] => {
    const ch = effective(r);
    if (!ch || ch === "new" || ch === "skip" || ch === "follow") return [];
    const ex = itemById.get(ch);
    if (!ex) return [];
    const notes: string[] = [];
    if (normalizeName(ex.name) !== r.p.normalized) notes.push(`File name "${r.p.name}" kept as reference; item stays "${ex.name}"`);
    const exUnit = getIngredientCostUnit(ex);
    if (exUnit && r.p.baseUnit && exUnit !== r.p.baseUnit) notes.push(`Unit differs: existing costs per ${exUnit}, file per ${r.p.baseUnit} — check this is the same product`);
    if (r.p.supplierName && ex.supplier_id) {
      const fileSup = resolveSupplier(normalizeName(r.p.supplierName));
      if (fileSup && fileSup !== "new" && fileSup !== ex.supplier_id) notes.push(`Also supplied by ${supplierById.get(fileSup)?.name}; normal supplier stays ${ex.suppliers?.name ?? "unchanged"}`);
      if (fileSup === "new") notes.push(`Also supplied by ${r.p.supplierName}; normal supplier stays ${ex.suppliers?.name ?? "unchanged"}`);
    }
    if (ex.archived_at) notes.push("Existing item is archived — it stays archived");
    return notes;
  };

  const unresolvedItems = rowPlans.filter((r) => effective(r) === null).length;
  const unresolvedSuppliers = [...supplierPlans.values()].filter((s) => resolveSupplier(s.key) === null).length;
  const unresolvedSp = rowPlans.filter((r) => spNeedsDecision(r)).length;
  const unresolvedPrice = rowPlans.filter((r) => isChanged(priceCmp(r)) && !priceChoice[r.p.raw.rowNumber]).length;
  const unresolved = unresolvedItems + unresolvedSuppliers + unresolvedSp + unresolvedPrice;

  const summary = useMemo(() => {
    let created = 0, matched = 0, possible = 0, dupes = 0, missing = 0, skipped = 0, priceDiff = 0, newSup = 0, up = 0, down = 0, same = 0;
    for (const r of rowPlans) {
      const ch = effective(r);
      if (ch === "skip") { skipped++; continue; }
      if (r.sameAsRow != null && decide(r) === "follow") dupes++;
      else if (ch === null) possible++;
      else if (ch === "new") created++;
      else matched++;
      if (r.p.missing.length) missing++;
      if (priceInfo(r).differs) priceDiff++;
      const c = priceCmp(r);
      if (c?.kind === "up") up++; else if (c?.kind === "down") down++; else if (c?.kind === "same") same++;
    }
    for (const s of supplierPlans.values()) if (resolveSupplier(s.key) === "new") newSup++;
    return { created, matched, possible, dupes, missing, skipped, priceDiff, newSup, up, down, same };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowPlans, itemChoice, supplierChoice, supplierPlans, pricedIds, spPreview, spHistory, spChoice, effDate]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    rowPlans.forEach((r) => statusOf(r).forEach((t) => (c[t.label] = (c[t.label] ?? 0) + 1)));
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowPlans, itemChoice, supplierChoice, supplierPlans, pricedIds, spPreview, spHistory, spChoice, effDate]);

  const visible = rowPlans.filter((r) => filter === "all" || (filter === "_changed" ? isChanged(priceCmp(r)) : statusOf(r).some((t) => t.label === filter)));

  const onRowChoice = (r: RowPlan, v: string) => {
    const row = r.p.raw.rowNumber;
    if (v === "_undecided") { setItemChoice({ ...itemChoice, [row]: null }); return; }
    if (v === "new" && (r.candidates.length > 0 || r.exactId)) {
      const ids = r.exactId ? [r.exactId] : r.candidates.map((c) => c.id);
      setConfirmSeparate({ row, name: r.p.name, matches: ids.map((id) => itemById.get(id)?.name ?? "") });
      return;
    }
    setItemChoice({ ...itemChoice, [row]: v });
  };

  /** One payload, one database call — all rows are saved together or not at all. */
  const buildPayload = () => {
    const newSuppliers = new Map<string, string>();
    const rows: Record<string, unknown>[] = [];
    for (const r of rowPlans) {
      const p = r.p;
      const row = p.raw.rowNumber;
      const ch = effective(r);
      if (ch === "skip" || ch === null) { rows.push({ row, skip: true }); continue; }
      const isFollow = r.sameAsRow != null && decide(r) === "follow";
      const supKey = p.supplierName ? normalizeName(p.supplierName) : null;
      const supC = supKey ? resolveSupplier(supKey) : null;
      let supplier: Record<string, string> | null = null;
      if (supC === "new" && supKey) { newSuppliers.set(supKey, p.supplierName!.replace(/\s+/g, " ").trim()); supplier = { ref: `sup:${supKey}` }; }
      else if (supC) supplier = { id: supC };

      let item: Record<string, unknown>;
      let setMaster = !isFollow;
      if (isFollow) item = { follow_ref: `r${r.sameAsRow}` };
      else if (ch === "new") {
        item = {
          ref: `r${row}`, name: p.name, unit: p.packUnit, storage_type: storageOverride[row] ?? defaultStorage(p.category, p.group),
          item_type: p.itemType ?? "recipe_ingredient", item_group: p.group, category: p.category,
          purchase_unit: p.purchaseUnit, pack_size: p.packSize, pack_unit: p.packUnit,
        };
      } else {
        item = { id: ch, ref: `r${row}`, category: p.category, item_group: p.group };
        const ex = itemById.get(ch);
        const exUnit = ex ? getIngredientCostUnit(ex) : null;
        if (pricedIds?.has(ch) || (exUnit && p.baseUnit && exUnit !== p.baseUnit)) setMaster = false;
      }
      const price = p.costPerPack != null && p.packSize && p.packUnit
        ? { cost_per_pack: p.costPerPack, pack_size: p.packSize, pack_unit: p.packUnit } : null;

      let supplier_product: Record<string, unknown> | null = null;
      const st = spStatus(r);
      const pick = spChoice[row];
      const base = { product_name: p.name, product_code: p.productCode, pack_size: p.packSize, pack_unit: p.packUnit, purchase_unit: p.purchaseUnit };
      if (supplier && pick !== "none") {
        if (st.kind === "new" || st.kind === "new_pack_variant") supplier_product = { ...base, resolution: "new" };
        else if (st.kind === "exact") supplier_product = { ...base, resolution: "link_existing", supplier_product_id: st.preview!.supplier_product_id };
        else if ((st.kind === "code_differs" || st.kind === "description_differs") && pick === "link") {
          supplier_product = {
            ...base, resolution: "link_existing", supplier_product_id: st.preview!.supplier_product_id,
            reviewed: [st.kind === "code_differs" ? "code" : "description",
              ...(st.kind === "code_differs" && spNameKey(st.preview!.existing_name) !== spNameKey(p.name) ? ["description"] : [])],
          };
        }
      }
      const changed = isChanged(priceCmp(r));
      const mo = masterOffer(r);
      rows.push({
        row, supplier, item, price, set_master_price: setMaster, supplier_product,
        // Explicit decisions only: changed prices are recorded only when chosen; master cost only when ticked.
        record_supplier_price: changed ? priceChoice[row] === "record" : true,
        update_master_price: !!(price && changed && mo?.allowed && masterChoice[row]),
      });
    }
    return {
      effective_date: effDate,
      suppliers: [...newSuppliers].map(([key, name]) => ({ ref: `sup:${key}`, name })),
      rows,
    };
  };

  const apply = async () => {
    if (!currentRestaurant?.id || unresolved > 0) return;
    setApplying(true); setApplyError(null);
    try {
      const { data, error } = await (supabase as any).rpc("apply_stock_list_import", { p_payload: buildPayload() });
      if (error) throw error;
      setResult(data as ImportResult);
      setStep("done");
      toast({ title: "Stock list imported", description: "All reviewed rows were saved together." });
    } catch (e) {
      const msg = (e as Error).message;
      setApplyError(msg);
      toast({ title: "Import not saved", description: `Nothing was saved. ${msg}`, variant: "destructive" });
    } finally {
      qc.invalidateQueries({ queryKey: ["ingredients"] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["ingredient-priced-ids"] });
      qc.invalidateQueries({ queryKey: ["sp-preview"] });
      qc.invalidateQueries({ queryKey: ["sp-price-history"] });
      qc.invalidateQueries({ queryKey: ["food-costing-daily"] });
      qc.invalidateQueries({ queryKey: ["food-costing-period"] });
      setApplying(false);
    }
  };

  const supplierReview = [...supplierPlans.values()].filter((s) => !s.exactId && s.candidates.length);
  const mapOk = mapping?.itemName != null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!applying) { onOpenChange(o); if (!o) reset(); } }}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-[min(96vw,1400px)] flex-col gap-4 overflow-hidden p-6">
        <DialogHeader className="shrink-0 pr-10">
          <DialogTitle>Import Stock List</DialogTitle>
          <DialogDescription>
            Setup catalogue only: suppliers, inventory items, pack sizes and starting prices. Stock quantities, recipes,
            POS mappings, sales, purchase orders, invoices and documents are never changed. Nothing is saved until you confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]">
          {step === "upload" && (
            reading ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-sm">Reading {fileName}… this can take up to a minute. Nothing is saved.</span>
              </div>
            ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 text-center text-muted-foreground">
                  <Upload className="h-6 w-6" />
                  <span className="text-sm">Choose a file: CSV, XLSX, PDF or photo</span>
                  <Input type="file" accept=".csv,.xlsx,.xls,.pdf,image/jpeg,image/png,image/webp" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) handleFile(f); }} />
                </label>
                <label className="flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 text-center text-muted-foreground">
                  <Camera className="h-6 w-6" />
                  <span className="text-sm">Take a photo of a printed or handwritten list</span>
                  <Input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) handleFile(f); }} />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">Photos and PDFs are read by AI, then shown beside the original for you to check. Unclear values are flagged, never guessed. Stock quantities are not read.</p>
              {parseError && <p className="text-sm text-destructive">{parseError}</p>}
            </div>
            )
          )}

          {step === "map" && grid && mapping && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{fileName} · {grid.rows.length} rows. Check which column holds each field.</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {IMPORT_FIELDS.map((f) => (
                  <div key={f.key}>
                    <Label>{f.label}{f.required ? " *" : ""}</Label>
                    <Select
                      value={mapping[f.key] == null ? "_none" : String(mapping[f.key])}
                      onValueChange={(v) => setMapping({ ...mapping, [f.key as FieldKey]: v === "_none" ? null : Number(v) })}
                    >
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        <SelectItem value="_none">Not in file</SelectItem>
                        {grid.headers.map((h, i) => (
                          <SelectItem key={i} value={String(i)}>{h || `Column ${i + 1}`}{grid.rows[0]?.[i] ? ` — e.g. ${grid.rows[0][i].slice(0, 24)}` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === "extracted" && doc && (
            <ExtractedRowsReview rows={extracted} onChange={setExtracted} previewUrl={doc.url} mimeType={doc.mime} fileName={fileName ?? ""} />
          )}

          {step === "done" && result && (
            <div className="space-y-2 rounded-lg border p-4 text-sm">
              <p className="font-medium">Import complete — all rows saved together{doc ? " (from photo/PDF)" : ""}</p>
              <p>{result.items_created} new items · {result.items_matched} matched existing · {result.starting_prices} starting prices · {result.suppliers_created} new suppliers · {result.rows_skipped} skipped</p>
              <p>{result.supplier_products_created} new supplier products · {result.supplier_products_linked} linked to existing · {result.supplier_prices_added} supplier prices recorded · {result.supplier_prices_unchanged} unchanged prices not repeated{result.supplier_prices_kept ? ` · ${result.supplier_prices_kept} changed prices left unchanged` : ""}</p>
              <p>{result.master_costs_updated ?? 0} master recipe costs updated · {result.master_history_added ?? 0} backdated master price entries added (current cost unchanged)</p>
            </div>
          )}

          {step === "review" && (
            <>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11">
                {[
                  ["New items", summary.created], ["Matched", summary.matched], ["Need review", summary.possible],
                  ["Duplicates in file", summary.dupes], ["Missing info", summary.missing], ["Price differs", summary.priceDiff],
                  ["New suppliers", summary.newSup], ["Skipped", summary.skipped],
                  ["Supplier price up", summary.up], ["Supplier price down", summary.down], ["Supplier price unchanged", summary.same],
                ].map(([l, v]) => (
                  <div key={l as string} className="rounded-lg border p-2">
                    <div className="text-xs text-muted-foreground">{l}</div>
                    <div className="text-lg font-semibold">{v}</div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">{fileName} · {parsed.length} rows</span>
                <Select value={filter} onValueChange={setFilter}>
                  <SelectTrigger className="h-11 w-80"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All rows ({rowPlans.length})</SelectItem>
                    <SelectItem value="_changed">Changed prices only ({summary.up + summary.down})</SelectItem>
                    {Object.entries(counts).map(([k, v]) => <SelectItem key={k} value={k}>{k} ({v})</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant={filter === "_changed" ? "default" : "outline"} className="h-11" onClick={() => setFilter(filter === "_changed" ? "all" : "_changed")}>
                  Changed prices only
                </Button>
                <label className="flex items-center gap-2">
                  <span className="text-muted-foreground">Prices effective</span>
                  <Input type="date" className="h-11 w-44" value={effDate} max={todayIso}
                    onChange={(e) => { const v = e.target.value; if (v && v <= todayIso) { setEffDate(v); setPriceChoice({}); setMasterChoice({}); } }} />
                </label>
                {effDate < todayIso && <Badge variant="secondary" className={toneClass.warn}>Backdated list — saved as history, never replaces newer prices</Badge>}
                <Button variant="outline" className="h-11" onClick={() => setStep(doc ? "extracted" : "map")}>{doc ? "Back to extracted rows" : "Back to columns"}</Button>
                <Button variant="outline" className="h-11" onClick={reset}>Choose another file</Button>
              </div>

              {supplierReview.length > 0 && (
                <div className="space-y-2 rounded-lg border p-3">
                  <p className="text-sm font-medium">Possible supplier matches — choose for each</p>
                  {supplierReview.map((s) => (
                    <div key={s.key} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="min-w-40 font-medium">{s.name}</span>
                      <Select value={supplierChoice[s.key] ?? "_undecided"} onValueChange={(v) => setSupplierChoice({ ...supplierChoice, [s.key]: v === "_undecided" ? null : v })}>
                        <SelectTrigger className="h-11 w-80"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_undecided">Choose…</SelectItem>
                          {s.candidates.map((id) => <SelectItem key={id} value={id}>Use existing: {supplierById.get(id)?.name}</SelectItem>)}
                          <SelectItem value="new">Create new supplier "{s.name}"</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}

              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead><TableHead>Item</TableHead><TableHead>Status</TableHead>
                      <TableHead>Decision</TableHead><TableHead>Supplier</TableHead><TableHead>Type / Group / Category</TableHead>
                      <TableHead>Pack</TableHead><TableHead>Pack cost</TableHead><TableHead>Base cost</TableHead>
                      <TableHead>Price</TableHead><TableHead>Ref. selling</TableHead><TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((r) => {
                      const p = r.p;
                      const sp = p.supplierName ? supplierPlans.get(normalizeName(p.supplierName)) : null;
                      const supChoice = sp ? resolveSupplier(sp.key) : null;
                      const d = decide(r);
                      const selectValue = d === null ? "_undecided" : d === "follow" ? "_follow" : d;
                      const opts = r.exactId ? [{ id: r.exactId, score: 1 }, ...r.candidates] : r.candidates;
                      return (
                        <TableRow key={p.raw.rowNumber} className="align-top">
                          <TableCell>{p.raw.rowNumber}</TableCell>
                          <TableCell className="font-medium">
                            <div>{p.name || <span className="text-destructive">—</span>}</div>
                            <Button variant="outline" size="sm" className="mt-1 h-11 min-w-[72px]" onClick={() => setEditingRow(p.raw.rowNumber)}>
                              <Pencil className="mr-1 h-4 w-4" /> Edit
                            </Button>
                            {isEdited(p.raw.rowNumber) && <Badge variant="secondary" className="ml-1 mt-1 bg-secondary text-secondary-foreground">Edited</Badge>}
                          </TableCell>
                          <TableCell><div className="flex flex-col gap-1">{statusOf(r).map((t) => <Badge key={t.label} variant="secondary" className={toneClass[t.tone]}>{t.label}</Badge>)}</div></TableCell>
                          <TableCell className="min-w-64">
                            {p.blocking.length ? <span className="text-muted-foreground">Cannot import</span> : (
                              <Select value={selectValue} onValueChange={(v) => onRowChoice(r, v === "_follow" ? "_undecided" : v)}>
                                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                                <SelectContent className="max-h-72">
                                  {d === null && <SelectItem value="_undecided">Choose…</SelectItem>}
                                  {r.sameAsRow != null && <SelectItem value="_follow">Same item as row {r.sameAsRow}</SelectItem>}
                                  {opts.map((c) => {
                                    const ex = itemById.get(c.id);
                                    return (
                                      <SelectItem key={c.id} value={c.id}>
                                        Use existing: {ex?.name}{ex?.archived_at ? " (archived)" : ""}{c.score < 1 ? ` · ${Math.round(c.score * 100)}%` : ""}
                                      </SelectItem>
                                    );
                                  })}
                                  <SelectItem value="new">{opts.length ? "Create separate item" : "Create new item"}</SelectItem>
                                  <SelectItem value="skip">Skip this row</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                            {(() => {
                              const st = spStatus(r);
                              const conflictKinds: SpKind[] = ["code_differs", "description_differs", "pack_differs", "linked_to_other_item"];
                              if (!conflictKinds.includes(st.kind)) return null;
                              const canLink = st.kind === "code_differs" || st.kind === "description_differs";
                              const row = p.raw.rowNumber;
                              return (
                                <Select value={spChoice[row] ?? "_undecided"} onValueChange={(v) => {
                                  const next = { ...spChoice };
                                  if (v === "_undecided") delete next[row]; else next[row] = v as "link" | "none" | "skiprow";
                                  setSpChoice(next);
                                }}>
                                  <SelectTrigger className="mt-2 h-11"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="_undecided">Supplier product: choose…</SelectItem>
                                    {canLink && <SelectItem value="link">Same product — link (I confirm the {st.kind === "code_differs" ? "code" : "description"} difference)</SelectItem>}
                                    <SelectItem value="none">Don't save a supplier link for this row</SelectItem>
                                    <SelectItem value="skiprow">Skip this row</SelectItem>
                                  </SelectContent>
                                </Select>
                              );
                            })()}
                          </TableCell>
                          <TableCell>
                            {!p.supplierName ? <span className="text-muted-foreground">Unassigned</span>
                              : supChoice && supChoice !== "new" ? supplierById.get(supChoice)?.name
                              : supChoice === "new" ? `${p.supplierName} (new)` : `${p.supplierName} (choose above)`}
                          </TableCell>
                          <TableCell className="text-xs">
                            {p.itemType ? itemTypeLabel(p.itemType) : <span className="text-warning">Type missing → Recipe ingredient</span>}<br />
                            {groupLabel(p.group)} · {categoryLabel(p.category)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{p.packSize && p.packUnit ? `${p.packSize} ${p.packUnit}` : p.packUnit ? <span className="text-warning">? {p.packUnit}</span> : <span className="text-warning">Unknown</span>}</TableCell>
                          <TableCell>{p.costPerPack != null ? formatCurrency(p.costPerPack) : <span className="text-warning">Unknown</span>}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {p.baseCost == null || !p.baseUnit ? <span className="text-warning">Missing cost</span> : `${formatUnitCost(p.baseCost)}/${p.baseUnit}`}
                            {p.baseCost != null && p.baseUnit === "g" && <div className="text-xs text-muted-foreground">{formatCurrency(p.baseCost * 1000)}/kg</div>}
                            {p.baseCost != null && p.baseUnit === "ml" && <div className="text-xs text-muted-foreground">{formatCurrency(p.baseCost * 1000)}/L</div>}
                          </TableCell>
                          <TableCell className="min-w-64 text-xs">
                            <div>{priceInfo(r).text}</div>
                            {(() => {
                              const c = priceCmp(r);
                              if (!c) return null;
                              const row = p.raw.rowNumber;
                              return (
                                <div className="mt-2">
                                  <PriceChangePanel
                                    cmp={c}
                                    supplierName={supChoice && supChoice !== "new" ? supplierById.get(supChoice)?.name ?? "" : p.supplierName ?? ""}
                                    newPackCost={p.costPerPack} baseUnit={p.baseUnit}
                                    recordChoice={priceChoice[row]}
                                    onRecordChoice={(v) => setPriceChoice((o) => { const n = { ...o }; if (v) n[row] = v; else delete n[row]; return n; })}
                                    masterOffer={masterOffer(r)}
                                    masterChecked={!!masterChoice[row]}
                                    onMasterChecked={(v) => setMasterChoice((o) => ({ ...o, [row]: v }))}
                                  />
                                </div>
                              );
                            })()}
                          </TableCell>
                          <TableCell>{p.sellingPrice != null ? formatCurrency(p.sellingPrice) : "—"}</TableCell>
                          <TableCell className="min-w-64 text-xs">
                            {p.raw.notes && <div>{p.raw.notes}</div>}
                            {matchNotes(r).map((n) => <div key={n} className="text-muted-foreground">{n}</div>)}
                            {(() => {
                              const st = spStatus(r);
                              if (st.kind === "dup") return <div className="text-muted-foreground">Supplier product saved once, from row {st.dupOf}</div>;
                              const pv = st.preview;
                              if (!pv || st.kind === "exact") return null;
                              return (
                                <div className="text-warning">
                                  Existing supplier product: "{pv.existing_name}"{pv.existing_code ? ` · code ${pv.existing_code}` : " · no code"}
                                  {pv.existing_pack_size ? ` · ${pv.existing_pack_size} ${pv.existing_pack_unit ?? ""}` : ""}
                                  {st.kind === "linked_to_other_item" && ` · linked to ${itemById.get(pv.existing_ingredient_id ?? "")?.name ?? "another item"}`}
                                  <br />File: "{p.name}"{p.productCode ? ` · code ${p.productCode}` : " · no code"}{p.packSize ? ` · ${p.packSize} ${p.packUnit ?? ""}` : ""}
                                </div>
                              );
                            })()}
                            {[...p.blocking, ...p.issues].map((i) => <div key={i} className="text-destructive">{i}</div>)}
                            {p.missing.length > 0 && <div className="text-warning">Unknown: {p.missing.join(", ")}</div>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {step === "map" && (
            <>
              {!mapOk && <span className="mr-auto text-sm text-warning">Choose the Item Name column to continue.</span>}
              <Button variant="outline" className="h-11" onClick={reset}>Back</Button>
              <Button className="h-11" disabled={!mapOk} onClick={continueToReview}>Review rows</Button>
            </>
          )}
          {step === "extracted" && (
            <>
              {unresolvedCells(extracted) > 0 && <span className="mr-auto text-sm text-warning">{unresolvedCells(extracted)} unclear value(s) to check first.</span>}
              <Button variant="outline" className="h-11" onClick={reset}>Back</Button>
              <Button className="h-11" disabled={unresolvedCells(extracted) > 0 || extracted.every((r) => r.skip)} onClick={continueFromExtracted}>Continue to matching</Button>
            </>
          )}
          {step === "review" && (
            <>
              {applyError && <span className="mr-auto text-sm text-destructive">Nothing was saved: {applyError}</span>}
              {!applyError && previewError && <span className="mr-auto text-sm text-destructive">Supplier product check failed: {(previewError as Error).message}</span>}
              {!applyError && !previewError && unresolved > 0 && <span className="mr-auto text-sm text-warning">{unresolved} decision(s) needed before import{previewLoading ? " (checking supplier products…)" : ""}.</span>}
              <Button variant="outline" className="h-11" onClick={() => { onOpenChange(false); reset(); }} disabled={applying}>Cancel</Button>
              <Button className="h-11" onClick={() => setConfirmApply(true)} disabled={applying || unresolved > 0 || !pricedIds || previewLoading || historyLoading || !!previewError}>
                {applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Import reviewed rows
              </Button>
            </>
          )}
          {step === "done" && <Button className="h-11" onClick={() => { onOpenChange(false); reset(); }}>Done</Button>}
        </div>

        {(() => {
          const er = editingRow == null ? null : parsed.find((x) => x.raw.rowNumber === editingRow) ?? null;
          return (
            <EditImportRowSheet
              raw={er?.raw ?? null}
              storage={er ? storageOverride[er.raw.rowNumber] ?? defaultStorage(er.category, er.group) : "dry"}
              edited={er ? isEdited(er.raw.rowNumber) : false}
              onClose={() => setEditingRow(null)}
              onSave={(next, st) => {
                if (!er) return;
                const np = interpretRow(next);
                const auto = defaultStorage(np.category, np.group);
                applyRowEdit(er.raw.rowNumber, next, st === auto && !storageOverride[er.raw.rowNumber] ? null : st);
                setEditingRow(null);
              }}
              onRevert={() => {
                if (!er) return;
                const orig = originalRaw[er.raw.rowNumber];
                if (orig) applyRowEdit(er.raw.rowNumber, orig, null);
                setEditingRow(null);
              }}
            />
          );
        })()}

        <AlertDialog open={!!confirmSeparate} onOpenChange={(o) => !o && setConfirmSeparate(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Create a separate item?</AlertDialogTitle>
              <AlertDialogDescription>
                "{confirmSeparate?.name}" looks like an existing item: {confirmSeparate?.matches.join(", ")}.
                Only create a separate item if it is genuinely a different product (cut, brand, grade or size).
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-11">Keep reviewing</AlertDialogCancel>
              <AlertDialogAction className="h-11" onClick={() => {
                if (confirmSeparate) setItemChoice({ ...itemChoice, [confirmSeparate.row]: "new" });
                setConfirmSeparate(null);
              }}>Yes, create separate item</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={confirmApply} onOpenChange={setConfirmApply}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Import reviewed stock list?</AlertDialogTitle>
              <AlertDialogDescription>
                {summary.created} new items, {summary.matched} matched existing, {summary.dupes} duplicate rows linked,
                {" "}{summary.newSup} new suppliers, {summary.skipped} skipped. {summary.missing} rows have missing information
                (kept unknown). Supplier prices: {Object.values(priceChoice).filter((v) => v === "record").length} changed recorded, {Object.values(priceChoice).filter((v) => v === "keep").length} left unchanged. Master recipe costs updated: {Object.values(masterChoice).filter(Boolean).length}. Prices effective {effDate}. Stock quantities do not change.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-11">Back</AlertDialogCancel>
              <AlertDialogAction className="h-11" onClick={() => { setConfirmApply(false); apply(); }}>Import</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
