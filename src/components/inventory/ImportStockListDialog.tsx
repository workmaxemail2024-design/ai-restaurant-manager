import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useIngredients, calculateBaseCost, getBaseUnit, categoryLabel, groupLabel, itemTypeLabel } from "@/hooks/useIngredients";
import { useSuppliers } from "@/hooks/useSuppliers";
import { formatCurrency } from "@/lib/currency";
import { toast } from "@/hooks/use-toast";
import {
  parseStockFile, interpretRow, normalizeName, isNearMatch, defaultStorage, type ParsedItem,
} from "@/lib/stockListImport";

type Choice = string | "new" | null; // existing id, "new", or undecided

interface RowPlan {
  p: ParsedItem;
  duplicateOf: number | null; // row number of earlier identical item in the file
  exactId: string | null;
  candidates: string[];
}

interface SupplierPlan {
  key: string;
  name: string;
  exactId: string | null;
  candidates: string[];
}

const fmtBase = (v: number | null, u: string | null) =>
  v == null || !u ? <span className="text-warning">Missing cost</span> : `${formatCurrency(v)}/${u}`;

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

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedItem[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [itemChoice, setItemChoice] = useState<Record<number, Choice>>({});
  const [supplierChoice, setSupplierChoice] = useState<Record<string, Choice>>({});
  const [filter, setFilter] = useState("all");
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<null | { created: number; matched: number; priced: number; suppliers: number; skipped: number; errors: string[] }>(null);

  const reset = () => {
    setFileName(null); setParsed(null); setParseError(null); setItemChoice({}); setSupplierChoice({});
    setFilter("all"); setResult(null);
  };

  const handleFile = async (f: File) => {
    reset();
    setFileName(f.name);
    try {
      const rows = await parseStockFile(f);
      setParsed(rows.map(interpretRow));
    } catch (e) {
      setParseError((e as Error).message);
    }
  };

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const supplierById = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);

  const supplierPlans = useMemo(() => {
    const map = new Map<string, SupplierPlan>();
    for (const p of parsed ?? []) {
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
    const seen = new Map<string, number>();
    return (parsed ?? []).map((p) => {
      const dup = p.normalized ? seen.get(p.normalized) ?? null : null;
      if (p.normalized && dup == null) seen.set(p.normalized, p.raw.rowNumber);
      const exact = items.filter((i) => normalizeName(i.name) === p.normalized);
      const active = exact.find((i) => !i.archived_at);
      return {
        p, duplicateOf: dup,
        exactId: active?.id ?? null,
        candidates: active ? [] : [
          ...exact.map((i) => i.id),
          ...items.filter((i) => normalizeName(i.name) !== p.normalized && isNearMatch(i.name, p.name)).map((i) => i.id),
        ].slice(0, 5),
      };
    });
  }, [parsed, items]);

  const resolveItem = (r: RowPlan): Choice =>
    r.exactId ?? (r.candidates.length ? itemChoice[r.p.raw.rowNumber] ?? null : "new");
  const resolveSupplier = (key: string): Choice => {
    const s = supplierPlans.get(key);
    if (!s) return null;
    return s.exactId ?? (s.candidates.length ? supplierChoice[key] ?? null : "new");
  };

  const status = (r: RowPlan) => {
    const tags: { label: string; tone: "ok" | "warn" | "bad" | "info" }[] = [];
    const choice = resolveItem(r);
    if (r.p.blocking.length) tags.push({ label: "Missing information — skipped", tone: "bad" });
    else if (r.duplicateOf) tags.push({ label: `Conflict — duplicate of row ${r.duplicateOf}`, tone: "bad" });
    else if (r.exactId) tags.push({ label: "Existing exact match", tone: "ok" });
    else if (r.candidates.length) tags.push({ label: choice ? (choice === "new" ? "Review: create new" : "Review: use existing") : "Possible match — review", tone: "warn" });
    else tags.push({ label: "New inventory item", tone: "info" });
    if (r.p.supplierName) {
      const sp = supplierPlans.get(normalizeName(r.p.supplierName));
      if (sp?.exactId) tags.push({ label: "Existing supplier", tone: "ok" });
      else if (sp?.candidates.length) tags.push({ label: "Possible supplier match — review", tone: "warn" });
      else tags.push({ label: "New supplier", tone: "info" });
    }
    if (r.p.missing.length && !r.p.blocking.length) tags.push({ label: "Missing information", tone: "warn" });
    if (r.p.issues.length) tags.push({ label: "Conflict", tone: "bad" });
    return tags;
  };

  /** What will happen to the price on Apply. */
  const priceAction = (r: RowPlan): string => {
    const choice = resolveItem(r);
    if (r.p.costPerPack == null) return "No price — stays unknown";
    if (!choice || choice === "new") return "Record as starting price";
    if (pricedIds?.has(choice)) {
      const ex = itemById.get(choice);
      const exBase = ex ? calculateBaseCost(ex) : 0;
      if (r.p.baseCost != null && exBase > 0 && Math.abs(exBase - r.p.baseCost) / exBase < 0.005) return "Same as existing price";
      return `Not changed — existing ${exBase > 0 ? `${formatCurrency(exBase)}/${getBaseUnit(ex?.pack_unit)}` : "price history"} kept`;
    }
    return "Record as starting price";
  };

  const unresolved = rowPlans.filter((r) => !r.p.blocking.length && !r.duplicateOf && resolveItem(r) === null).length
    + [...supplierPlans.values()].filter((s) => resolveSupplier(s.key) === null).length;

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    rowPlans.forEach((r) => status(r).forEach((t) => (c[t.label] = (c[t.label] ?? 0) + 1)));
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowPlans, itemChoice, supplierChoice, supplierPlans]);

  const visible = rowPlans.filter((r) => filter === "all" || status(r).some((t) => t.label === filter));

  const apply = async () => {
    if (!currentRestaurant?.id || unresolved > 0) return;
    setApplying(true);
    const res = { created: 0, matched: 0, priced: 0, suppliers: 0, skipped: 0, errors: [] as string[] };
    try {
      // 1. Suppliers (once per normalised name)
      const supplierIds = new Map<string, string>();
      for (const s of supplierPlans.values()) {
        const ch = resolveSupplier(s.key);
        if (ch && ch !== "new") { supplierIds.set(s.key, ch); continue; }
        const { data, error } = await supabase.from("suppliers")
          .insert({ name: s.name.replace(/\s+/g, " ").trim(), restaurant_id: currentRestaurant.id } as never)
          .select("id").single();
        if (error) { res.errors.push(`Supplier ${s.name}: ${error.message}`); continue; }
        supplierIds.set(s.key, data.id); res.suppliers++;
      }

      // 2. Items
      for (const r of rowPlans) {
        const p = r.p;
        if (p.blocking.length || r.duplicateOf) { res.skipped++; continue; }
        const choice = resolveItem(r)!;
        const supplierId = p.supplierName ? supplierIds.get(normalizeName(p.supplierName)) ?? null : null;
        try {
          let id: string;
          if (choice === "new") {
            const { data, error } = await supabase.from("ingredients").insert({
              name: p.name,
              restaurant_id: currentRestaurant.id,
              unit: p.packUnit!,
              storage_type: defaultStorage(p.category, p.group),
              item_type: p.itemType ?? "recipe_ingredient",
              item_group: p.group,
              category: p.category,
              supplier_id: supplierId,
              purchase_unit: p.purchaseUnit,
              pack_size: p.packSize,
              pack_unit: p.packUnit,
              cost_per_pack: null,
              default_cost_price: null,
            } as never).select("id").single();
            if (error) throw error;
            id = (data as { id: string }).id; res.created++;
          } else {
            id = choice; res.matched++;
            const ex = itemById.get(id);
            const patch: Record<string, unknown> = {};
            if (ex && !ex.supplier_id && supplierId) patch.supplier_id = supplierId;
            if (ex && !ex.category && p.category) patch.category = p.category;
            if (ex && !ex.item_group && p.group) patch.item_group = p.group;
            if (Object.keys(patch).length) {
              const { error } = await supabase.from("ingredients").update(patch as never).eq("id", id);
              if (error) throw error;
            }
            if (pricedIds?.has(id)) continue;
          }
          if (p.costPerPack != null && p.packSize && p.packUnit) {
            const { error } = await (supabase as any).rpc("set_initial_import_price", {
              p_ingredient_id: id, p_cost_per_pack: p.costPerPack, p_pack_size: p.packSize,
              p_pack_unit: p.packUnit, p_unit_cost: null,
            });
            if (error) throw error;
            res.priced++;
          }
        } catch (e) {
          res.errors.push(`Row ${p.raw.rowNumber} ${p.name}: ${(e as Error).message}`);
        }
      }
    } finally {
      qc.invalidateQueries({ queryKey: ["ingredients"] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["ingredient-priced-ids"] });
      setApplying(false);
      setResult(res);
      toast({ title: "Stock list imported", description: `${res.created} new, ${res.matched} matched, ${res.priced} prices recorded.` });
    }
  };

  const toneClass = { ok: "bg-primary/15 text-primary", warn: "bg-warning/15 text-warning", bad: "bg-destructive/15 text-destructive", info: "bg-secondary text-secondary-foreground" };
  const supplierReview = [...supplierPlans.values()].filter((s) => !s.exactId && s.candidates.length);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!applying) { onOpenChange(o); if (!o) reset(); } }}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-[min(96vw,1400px)] flex-col gap-4 overflow-hidden p-6">
        <DialogHeader className="shrink-0 pr-10">
          <DialogTitle>Import Stock List</DialogTitle>
          <DialogDescription>
            Setup catalogue only: suppliers, inventory items, pack sizes and starting prices. Stock quantities,
            purchase orders, documents, expenses, sales and selling prices are never changed. Nothing is saved until you press Apply.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain touch-pan-y">
          {!parsed && !result && (
            <label className="flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-muted-foreground">
              <Upload className="h-6 w-6" />
              <span className="text-sm">Choose a CSV or XLSX stock list</span>
              <Input type="file" accept=".csv,.xlsx,.xls" className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
              {parseError && <span className="text-sm text-destructive">{parseError}</span>}
            </label>
          )}

          {result && (
            <div className="space-y-2 rounded-lg border p-4 text-sm">
              <p className="font-medium">Import complete</p>
              <p>{result.created} new items · {result.matched} matched existing · {result.priced} starting prices · {result.suppliers} new suppliers · {result.skipped} skipped</p>
              {result.errors.length > 0 && (
                <ul className="list-disc pl-5 text-destructive">{result.errors.map((e) => <li key={e}>{e}</li>)}</ul>
              )}
            </div>
          )}

          {parsed && !result && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">{fileName} · {parsed.length} rows</span>
                <Select value={filter} onValueChange={setFilter}>
                  <SelectTrigger className="h-11 w-72"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All rows ({rowPlans.length})</SelectItem>
                    {Object.entries(counts).map(([k, v]) => <SelectItem key={k} value={k}>{k} ({v})</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" className="h-11" onClick={reset}>Choose another file</Button>
              </div>

              {supplierReview.length > 0 && (
                <div className="space-y-2 rounded-lg border p-3">
                  <p className="text-sm font-medium">Possible supplier matches — choose for each</p>
                  {supplierReview.map((s) => (
                    <div key={s.key} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="min-w-40 font-medium">{s.name}</span>
                      <Select value={supplierChoice[s.key] ?? "_undecided"} onValueChange={(v) => setSupplierChoice({ ...supplierChoice, [s.key]: v === "_undecided" ? null : v })}>
                        <SelectTrigger className="h-11 w-72"><SelectValue /></SelectTrigger>
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
                      <TableHead>Match</TableHead><TableHead>Supplier</TableHead><TableHead>Type / Group / Category</TableHead>
                      <TableHead>Pack</TableHead><TableHead>Pack cost</TableHead><TableHead>Base cost</TableHead>
                      <TableHead>Price action</TableHead><TableHead>Ref. selling</TableHead><TableHead>Notes / issues</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((r) => {
                      const p = r.p;
                      const sp = p.supplierName ? supplierPlans.get(normalizeName(p.supplierName)) : null;
                      const supChoice = sp ? resolveSupplier(sp.key) : null;
                      return (
                        <TableRow key={p.raw.rowNumber} className="align-top">
                          <TableCell>{p.raw.rowNumber}</TableCell>
                          <TableCell className="font-medium">{p.name || <span className="text-destructive">—</span>}</TableCell>
                          <TableCell><div className="flex flex-col gap-1">{status(r).map((t) => <Badge key={t.label} variant="secondary" className={toneClass[t.tone]}>{t.label}</Badge>)}</div></TableCell>
                          <TableCell className="min-w-52">
                            {r.exactId ? itemById.get(r.exactId)?.name
                              : r.candidates.length && !r.duplicateOf && !p.blocking.length ? (
                                <Select value={itemChoice[p.raw.rowNumber] ?? "_undecided"} onValueChange={(v) => setItemChoice({ ...itemChoice, [p.raw.rowNumber]: v === "_undecided" ? null : v })}>
                                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="_undecided">Choose…</SelectItem>
                                    {r.candidates.map((id) => {
                                      const ex = itemById.get(id);
                                      return <SelectItem key={id} value={id}>Use existing: {ex?.name}{ex?.archived_at ? " (archived)" : ""}</SelectItem>;
                                    })}
                                    <SelectItem value="new">Create new item</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : "—"}
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
                          <TableCell className="whitespace-nowrap">{fmtBase(p.baseCost, p.baseUnit)}{p.baseUnit === "g" && p.baseCost != null && <div className="text-xs text-muted-foreground">{formatCurrency(p.baseCost * 1000)}/kg</div>}{p.baseUnit === "ml" && p.baseCost != null && <div className="text-xs text-muted-foreground">{formatCurrency(p.baseCost * 1000)}/L</div>}</TableCell>
                          <TableCell className="text-xs">{priceAction(r)}</TableCell>
                          <TableCell>{p.sellingPrice != null ? formatCurrency(p.sellingPrice) : "—"}</TableCell>
                          <TableCell className="min-w-56 text-xs">
                            {p.raw.notes && <div>{p.raw.notes}</div>}
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

        {parsed && !result && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {unresolved > 0 && <span className="mr-auto text-sm text-warning">{unresolved} possible match(es) need a decision before Apply.</span>}
            <Button variant="outline" className="h-11" onClick={() => { onOpenChange(false); reset(); }} disabled={applying}>Cancel</Button>
            <Button className="h-11" onClick={apply} disabled={applying || unresolved > 0 || !pricedIds}>
              {applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Apply import
            </Button>
          </div>
        )}
        {result && (
          <div className="flex shrink-0 justify-end"><Button className="h-11" onClick={() => { onOpenChange(false); reset(); }}>Done</Button></div>
        )}
      </DialogContent>
    </Dialog>
  );
}
