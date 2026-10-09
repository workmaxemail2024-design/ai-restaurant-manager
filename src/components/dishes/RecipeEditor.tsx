import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SegmentedControl } from "@/components/common/SegmentedControl";
import { cn } from "@/lib/utils";
import { formatCurrency, formatUnitCost } from "@/lib/currency";
import {
  type Dish, type DishIngredient, useDishIngredients, useAddDishIngredient, useUpdateDishIngredient,
  useRemoveDishIngredient, useSetDishRecipeLink, useConvertLinkedRecipe, resolveRecipeSource,
} from "@/hooks/useDishes";
import { useIngredients, calculateBaseCost, isRecipeIngredient } from "@/hooks/useIngredients";
import { compatibleUnits, convertRecipeQty, getIngredientCostUnit } from "@/lib/units";
import { QuickAddIngredientDialog } from "@/components/dishes/QuickAddIngredientDialog";
import { BatchRecipeCalculator, type CalculatedLine } from "@/components/dishes/BatchRecipeCalculator";
import { Link2, Trash2 } from "lucide-react";
import { format } from "date-fns";

type LinkNode = Pick<Dish, "id" | "name" | "base_dish_id" | "recipe_multiplier" | "use_direct_cost">;

/** Lightweight dish graph for linking (no cost RPCs). Refreshes with ["dishes"]. */
function useDishLinkGraph() {
  return useQuery({
    queryKey: ["dishes", "link-graph"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dishes")
        .select("id, name, base_dish_id, recipe_multiplier, use_direct_cost")
        .is("archived_at", null)
        .is("merged_into_id", null)
        .order("name");
      if (error) throw error;
      return (data || []) as unknown as LinkNode[];
    },
  });
}

/** Parse a decimal typed by the user; keeps "" as empty and strips leading zeros. */
function parseQty(v: string): number | null {
  const t = v.replace(",", ".").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function cleanNumeric(v: string) {
  // Prevent values like "0320": drop leading zeros unless followed by a decimal point.
  return v.replace(",", ".").replace(/[^0-9.]/g, "").replace(/^0+(?=\d)/, "");
}

const today = () => format(new Date(), "yyyy-MM-dd");

interface Props {
  dish: Dish;
  onRecipeCost: (cost: number | null, hasLines: boolean) => void;
}

export function RecipeEditor({ dish, onRecipeCost }: Props) {
  const { data: graph = [] } = useDishLinkGraph();
  // Include archived so existing recipe lines keep resolving and costing.
  const { data: ingredients = [] } = useIngredients({ includeArchived: true });
  const byId = useMemo(() => new Map(graph.map((d) => [d.id, d])), [graph]);
  const self = byId.get(dish.id);
  const baseDishId = self ? self.base_dish_id : dish.base_dish_id;
  const multiplier = self ? self.recipe_multiplier : dish.recipe_multiplier;
  const isLinked = !!baseDishId;
  const source = isLinked
    ? resolveRecipeSource(dish.id, byId)
    : { sourceId: dish.id, factor: 1, broken: false };

  const { data: rawLines = [] } = useDishIngredients(source.sourceId);
  const setLink = useSetDishRecipeLink();
  const convert = useConvertLinkedRecipe();

  const [mode, setMode] = useState<"own" | "linked">(isLinked ? "linked" : "own");
  const [baseDraft, setBaseDraft] = useState<string>(baseDishId || "");
  const [multDraft, setMultDraft] = useState<string>(multiplier ? String(multiplier) : "2");
  const [confirmConvert, setConfirmConvert] = useState(false);
  useEffect(() => {
    setMode(isLinked ? "linked" : "own");
    setBaseDraft(baseDishId || "");
    setMultDraft(multiplier ? String(multiplier) : "2");
  }, [dish.id, baseDishId, multiplier, isLinked]);

  const factor = source.broken ? 1 : source.factor;
  const lines = (source.broken ? [] : rawLines).map((item) => {
    const ing = ingredients.find((i) => i.id === item.ingredient_id);
    const costUnit = getIngredientCostUnit(ing);
    const unitCost = ing ? calculateBaseCost(ing) : 0;
    const qty = Number(item.quantity) * factor;
    const converted = convertRecipeQty(ing, qty, item.unit);
    const calculated = converted === null || unitCost <= 0 ? null : converted * unitCost;
    const manual = item.manual_line_cost == null ? null : Number(item.manual_line_cost) * factor;
    const isManual = item.cost_mode === "manual" && manual !== null;
    const lineCost = isManual ? manual : calculated;
    return { item, ing, costUnit, unitCost, qty, calculated, manual, isManual, lineCost, invalid: lineCost === null };
  });
  const hasInvalid = lines.some((l) => l.invalid);
  const recipeCost = lines.length === 0 || hasInvalid ? null : lines.reduce((s, l) => s + (l.lineCost || 0), 0);

  useEffect(() => {
    onRecipeCost(recipeCost, lines.length > 0);
  }, [recipeCost, lines.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Candidate bases: not itself, and not any dish whose chain already reaches this dish.
  const candidates = graph.filter((d) => {
    if (d.id === dish.id) return false;
    let cur: string | null = d.id;
    for (let i = 0; i < 6 && cur; i++) {
      if (cur === dish.id) return false;
      cur = byId.get(cur)?.base_dish_id ?? null;
    }
    return true;
  });
  const linkedChildren = graph.filter((d) => d.base_dish_id === dish.id);
  const baseName = baseDishId ? byId.get(baseDishId)?.name : null;
  const ownLineCount = isLinked ? 0 : rawLines.length;

  const saveLink = () => {
    const m = parseQty(multDraft);
    if (!baseDraft || !m || m <= 0) return;
    setLink.mutate({ id: dish.id, base_dish_id: baseDraft, recipe_multiplier: m });
  };

  return (
    <div className="space-y-4">
      {/* Recipe setup */}
      <div className="space-y-2">
        <Label>Recipe setup</Label>
        {isLinked ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="bg-primary/10 text-primary text-sm py-1">
              <Link2 className="h-3.5 w-3.5 mr-1" />
              Based on {baseName || "another dish"} · {Number(multiplier)}×
            </Badge>
            <Button variant="outline" className="h-11" onClick={() => setConfirmConvert(true)}>
              Unlink / Convert to own recipe
            </Button>
          </div>
        ) : (
          <SegmentedControl
            value={mode}
            onChange={(v) => setMode(v as "own" | "linked")}
            options={[
              { value: "own", label: "Own recipe" },
              { value: "linked", label: "Based on another dish" },
            ]}
          />
        )}
      </div>

      {(mode === "linked" || isLinked) && (
        <div className="rounded-lg border p-3 space-y-3">
          {!isLinked && ownLineCount > 0 ? (
            <p className="text-sm text-warning">
              This dish already has {ownLineCount} recipe line{ownLineCount === 1 ? "" : "s"}. Remove them first
              to link it to another dish — nothing is removed automatically.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[200px]">
                <Label>Base dish</Label>
                <Select value={baseDraft || undefined} onValueChange={setBaseDraft}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Select base dish" /></SelectTrigger>
                  <SelectContent>
                    {candidates.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-32">
                <Label>Multiplier</Label>
                <Input
                  className="h-11 text-right"
                  inputMode="decimal"
                  value={multDraft}
                  onChange={(e) => setMultDraft(cleanNumeric(e.target.value))}
                />
              </div>
              <Button
                className="h-11"
                onClick={saveLink}
                disabled={
                  setLink.isPending || !baseDraft || !(parseQty(multDraft)! > 0) ||
                  (baseDraft === baseDishId && parseQty(multDraft) === Number(multiplier))
                }
              >
                {isLinked ? "Update link" : "Link recipe"}
              </Button>
            </div>
          )}
          {source.broken && isLinked && (
            <p className="text-sm text-warning">
              The base recipe uses a direct product cost or an invalid link, so this dish's cost is unknown.
            </p>
          )}
        </div>
      )}

      {linkedChildren.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Linked portions using this recipe:{" "}
          {linkedChildren.map((c) => `${c.name} (${Number(c.recipe_multiplier)}×)`).join(", ")}. Changes here update them too.
        </p>
      )}

      {isLinked ? (
        <>
          <p className="text-sm text-muted-foreground">
            Batch Recipe Calculator isn't available for a linked recipe. Use "Convert to own recipe" first.
          </p>
          <LinesTable lines={lines} readOnly recipeCost={recipeCost} hasInvalid={hasInvalid} dishId={dish.id} caption="Scaled preview (read-only)" />
        </>
      ) : mode === "own" ? (
        <OwnRecipe dish={dish} ingredients={ingredients} lines={lines} recipeCost={recipeCost} hasInvalid={hasInvalid} />
      ) : null}

      <AlertDialog open={confirmConvert} onOpenChange={setConfirmConvert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert to own recipe?</AlertDialogTitle>
            <AlertDialogDescription>
              The current scaled lines ({lines.length}) are copied into this dish as its own recipe, and it will no
              longer follow changes to {baseName || "the base dish"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction className="h-11" onClick={() => convert.mutate(dish.id)}>Convert</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type Line = {
  item: DishIngredient;
  ing: ReturnType<typeof useIngredients>["data"] extends (infer T)[] | undefined ? T | undefined : never;
  costUnit: string | null;
  unitCost: number;
  qty: number;
  calculated: number | null;
  manual: number | null;
  isManual: boolean;
  lineCost: number | null;
  invalid: boolean;
};

function OwnRecipe({
  dish, ingredients, lines, recipeCost, hasInvalid,
}: {
  dish: Dish;
  ingredients: NonNullable<ReturnType<typeof useIngredients>["data"]>;
  lines: Line[];
  recipeCost: number | null;
  hasInvalid: boolean;
}) {
  const addIngredient = useAddDishIngredient();
  const updateLine = useUpdateDishIngredient();
  const removeLine = useRemoveDishIngredient();
  const [form, setForm] = useState({ ingredient_id: "", quantity: "", unit: "", manualCost: "", effectiveFrom: today() });
  const [search, setSearch] = useState("");
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState<CalculatedLine[] | null>(null);
  const [pending, setPending] = useState<CalculatedLine[] | null>(null);
  const [savingPending, setSavingPending] = useState(false);
  useEffect(() => setPending(null), [dish.id]);
  const filtered = ingredients.filter(
    (i) => !i.archived_at && isRecipeIngredient(i) && i.name.toLowerCase().includes(search.trim().toLowerCase())
  );
  const selected = ingredients.find((i) => i.id === form.ingredient_id);
  const unitOptions = compatibleUnits(getIngredientCostUnit(selected));
  // Items without pricing may still use any unit when a manual line cost is given.
  const allUnits = ["g", "kg", "oz", "ml", "L", "each"];
  const opts = unitOptions.length > 0 ? unitOptions : allUnits;
  const qty = parseQty(form.quantity);
  const manual = parseQty(form.manualCost);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ingredient_id || !qty || qty <= 0 || !form.unit) return;
    await addIngredient.mutateAsync({
      dish_id: dish.id,
      ingredient_id: form.ingredient_id,
      quantity: qty,
      unit: form.unit,
      ...(manual !== null
        ? { cost_mode: "manual" as const, manual_line_cost: manual, manual_cost_effective_from: form.effectiveFrom || today() }
        : {}),
    });
    setForm({ ingredient_id: "", quantity: "", unit: "", manualCost: "", effectiveFrom: today() });
  };

  const applyBatch = (calc: CalculatedLine[]) => {
    if (lines.length > 0) { setConfirmReplace(calc); return; }
    setPending(calc); setBatchOpen(false);
  };

  // Writes happen only here, when the user presses Save recipe.
  // Existing lines for the same ingredient are updated in place so their costing settings are preserved.
  const savePending = async () => {
    if (!pending) return;
    setSavingPending(true);
    try {
      const existing = new Map(lines.map((l) => [l.item.ingredient_id, l.item]));
      for (const p of pending) {
        const ex = existing.get(p.ingredient_id);
        if (ex) {
          await updateLine.mutateAsync({
            id: ex.id, dish_id: dish.id, quantity: p.quantity, unit: p.unit,
            ...(p.manual_line_cost !== null
              ? { cost_mode: "manual" as const, manual_line_cost: p.manual_line_cost, manual_cost_effective_from: today() }
              : { cost_mode: "inventory" as const }),
          });
          existing.delete(p.ingredient_id);
        } else {
          await addIngredient.mutateAsync({
            dish_id: dish.id, ingredient_id: p.ingredient_id, quantity: p.quantity, unit: p.unit,
            ...(p.manual_line_cost !== null
              ? { cost_mode: "manual" as const, manual_line_cost: p.manual_line_cost, manual_cost_effective_from: today() }
              : {}),
          });
        }
      }
      for (const ex of existing.values()) await removeLine.mutateAsync({ id: ex.id, dish_id: dish.id });
      setPending(null);
    } finally {
      setSavingPending(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground flex-1 min-w-[220px]">
          Quantities are the amount consumed when <strong>one</strong> unit of this dish is sold. A manual line cost is
          optional — use it when the inventory item has no price yet.
        </p>
        <Button type="button" variant="outline" className="h-11" onClick={() => setBatchOpen(true)} disabled={!!pending}>
          Enter Batch Recipe
        </Button>
      </div>
      <BatchRecipeCalculator open={batchOpen} onOpenChange={setBatchOpen}
        ingredients={ingredients.filter(isRecipeIngredient)} onApply={applyBatch} />
      <AlertDialog open={!!confirmReplace} onOpenChange={(o) => !o && setConfirmReplace(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace current recipe?</AlertDialogTitle>
            <AlertDialogDescription>
              This dish already has a recipe. Do you want to replace the current recipe with the calculated batch recipe?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction className="h-11" onClick={() => { setPending(confirmReplace); setConfirmReplace(null); setBatchOpen(false); }}>
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {pending && (
        <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3 space-y-2">
          <p className="font-medium">Calculated recipe per 1 portion — not saved yet</p>
          {lines.length > 0 && (
            <p className="text-sm text-muted-foreground">Saving replaces the {lines.length} current line{lines.length === 1 ? "" : "s"} below.</p>
          )}
          <div className="divide-y rounded-md border bg-background">
            {pending.map((p) => (
              <div key={p.ingredient_id} className="flex items-center gap-2 p-2 text-sm">
                <span className="flex-1 font-medium">{ingredients.find((x) => x.id === p.ingredient_id)?.name}</span>
                <span className="text-base font-semibold">{p.quantity} {p.unit}</span>
                <span className="w-28 text-right text-muted-foreground">
                  {p.manual_line_cost !== null ? `Manual ${formatCurrency(p.manual_line_cost)}` : "Inventory cost"}
                </span>

              </div>
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" className="h-11" onClick={() => setPending(null)} disabled={savingPending}>Discard</Button>
            <Button className="h-11" onClick={savePending} disabled={savingPending || pending.some((p) => !(p.quantity > 0))}>
              {savingPending ? "Saving…" : "Save recipe"}
            </Button>
          </div>
        </div>
      )}
      <form onSubmit={submit} className="grid gap-2 sm:grid-cols-12 items-end">
        <div className="sm:col-span-4">
          <Label>Ingredient</Label>
          <Select
            value={form.ingredient_id || undefined}
            onValueChange={(v) => {
              if (v === "_new") { setQuickAddOpen(true); return; }
              const ing = ingredients.find((i) => i.id === v);
              const o = compatibleUnits(getIngredientCostUnit(ing));
              setForm({ ...form, ingredient_id: v, unit: o[0] || "" });
            }}
          >
            <SelectTrigger className="h-11"><SelectValue placeholder="Select ingredient" /></SelectTrigger>
            <SelectContent>
              <div className="p-1 sticky top-0 bg-popover z-10">
                <Input placeholder="Search ingredients..." value={search}
                  onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.stopPropagation()} className="h-10" />
              </div>
              <SelectItem value="_new">+ Add new ingredient</SelectItem>
              {filtered.map((ing) => {
                const cu = getIngredientCostUnit(ing);
                return (
                  <SelectItem key={ing.id} value={ing.id}>
                    {ing.name} — {cu && calculateBaseCost(ing) > 0 ? `${formatUnitCost(calculateBaseCost(ing))}/${cu}` : "Missing cost"}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label>Quantity</Label>
          <Input className="h-11 text-right" inputMode="decimal" placeholder="0" value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: cleanNumeric(e.target.value) })} />
        </div>
        <div className="sm:col-span-2">
          <Label>Unit</Label>
          <Select value={form.unit || undefined} onValueChange={(v) => setForm({ ...form, unit: v })}>
            <SelectTrigger className="h-11"><SelectValue placeholder="Unit" /></SelectTrigger>
            <SelectContent>{opts.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label>Manual cost €</Label>
          <Input className="h-11 text-right" inputMode="decimal" placeholder="optional" value={form.manualCost}
            onChange={(e) => setForm({ ...form, manualCost: cleanNumeric(e.target.value) })} />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" className="h-11 w-full"
            disabled={addIngredient.isPending || !form.ingredient_id || !form.unit || !qty}>Add</Button>
        </div>
        {manual !== null && (
          <div className="sm:col-span-4">
            <Label>Manual cost effective from</Label>
            <Input type="date" className="h-11" max={today()} value={form.effectiveFrom}
              onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value || today() })} />
          </div>
        )}
      </form>
      {form.ingredient_id && unitOptions.length === 0 && manual === null && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          This inventory item has no price yet. Enter a manual line cost, or set its pack size and cost first.
        </div>
      )}
      <QuickAddIngredientDialog
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        initialName={search}
        onCreated={(id) => {
          const ing = ingredients.find((i) => i.id === id);
          const o = compatibleUnits(getIngredientCostUnit(ing));
          setForm({ ...form, ingredient_id: id, quantity: "", unit: o[0] || "" });
          setSearch("");
        }}
      />
      <LinesTable lines={lines} recipeCost={recipeCost} hasInvalid={hasInvalid} dishId={dish.id} />
    </>
  );
}

function LinesTable({
  lines, readOnly, recipeCost, hasInvalid, dishId, caption,
}: {
  lines: Line[];
  readOnly?: boolean;
  recipeCost: number | null;
  hasInvalid: boolean;
  dishId: string;
  caption?: string;
}) {
  return (
    <div className="border rounded-lg divide-y">
      {caption && <p className="p-3 text-xs font-medium text-muted-foreground uppercase">{caption}</p>}
      {lines.length === 0 ? (
        <p className="p-4 text-muted-foreground text-center text-sm">No ingredients yet. Cost will show as "Missing".</p>
      ) : (
        lines.map((l) => <LineRow key={l.item.id} line={l} readOnly={readOnly} dishId={dishId} />)
      )}
      {lines.length > 0 && (
        <div className="flex items-center justify-between p-3 bg-muted/30 border-t-2">
          <span className="font-semibold">Total recipe cost</span>
          <span className={cn("font-semibold", recipeCost === null && "text-warning")}>
            {recipeCost === null ? "Unknown" : formatCurrency(recipeCost)}
          </span>
        </div>
      )}
      {hasInvalid && (
        <p className="p-3 text-sm text-warning">
          One or more lines have no usable cost (missing price, or a missing/incompatible unit). The total stays
          unknown — never zero — until corrected.
        </p>
      )}
    </div>
  );
}

function LineRow({ line, readOnly, dishId }: { line: Line; readOnly?: boolean; dishId: string }) {
  const update = useUpdateDishIngredient();
  const remove = useRemoveDishIngredient();
  const { item, ing, costUnit, unitCost, qty, calculated, manual, isManual, lineCost, invalid } = line;
  const [q, setQ] = useState(String(Number(item.quantity)));
  const [u, setU] = useState(item.unit || "");
  const [mc, setMc] = useState(item.manual_line_cost != null ? String(Number(item.manual_line_cost)) : "");
  const [eff, setEff] = useState(item.manual_cost_effective_from || today());
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    setQ(String(Number(item.quantity)));
    setU(item.unit || "");
    setMc(item.manual_line_cost != null ? String(Number(item.manual_line_cost)) : "");
    setEff(item.manual_cost_effective_from || today());
  }, [item.quantity, item.unit, item.manual_line_cost, item.manual_cost_effective_from]);

  const opts = compatibleUnits(getIngredientCostUnit(ing));
  const unitOpts = opts.length > 0 ? opts : ["g", "kg", "oz", "ml", "L", "each"];
  const qn = parseQty(q);
  const mcn = parseQty(mc);
  const qtyDirty = qn !== null && (qn !== Number(item.quantity) || u !== (item.unit || ""));
  const manualDirty =
    mcn !== null && (mcn !== (item.manual_line_cost == null ? null : Number(item.manual_line_cost)) ||
      eff !== (item.manual_cost_effective_from || today()));

  if (readOnly) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 text-sm items-center">
        <span className="font-medium">{item.ingredients?.name}</span>
        <span className="text-right">{Number(qty.toFixed(3))} {item.unit}</span>
        <span className="text-right text-muted-foreground">{isManual ? "Manual" : costUnit && unitCost > 0 ? `${formatCurrency(unitCost)}/${costUnit}` : "Missing cost"}</span>
        <span className={cn("text-right font-medium", invalid && "text-warning")}>
          {lineCost === null ? "Unknown" : formatCurrency(lineCost)}
        </span>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium flex-1 min-w-[140px]">{item.ingredients?.name}</span>
        {item.needs_unit_review && <Badge variant="secondary" className="bg-warning/15 text-warning">Needs review</Badge>}
        <Badge variant="outline">{isManual ? "Manual cost" : "Calculated"}</Badge>
        <span className={cn("font-semibold w-24 text-right", invalid && "text-warning")}>
          {lineCost === null ? "Unknown" : formatCurrency(lineCost)}
        </span>
        <Button variant="ghost" size="icon" className="h-11 w-11 text-destructive" aria-label="Remove ingredient"
          onClick={() => setConfirmDelete(true)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-28">
          <Label className="text-xs">Qty</Label>
          <Input className="h-11 text-right" inputMode="decimal" value={q} onChange={(e) => setQ(cleanNumeric(e.target.value))} />
        </div>
        <div className="w-24">
          <Label className="text-xs">Unit</Label>
          <Select value={u || undefined} onValueChange={setU}>
            <SelectTrigger className="h-11"><SelectValue placeholder="Unit" /></SelectTrigger>
            <SelectContent>{unitOpts.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {qtyDirty && u && (
          <Button className="h-11" onClick={() => update.mutate({ id: item.id, dish_id: dishId, quantity: qn!, unit: u })}>
            Save qty
          </Button>
        )}
        <div className="w-28">
          <Label className="text-xs">Manual cost €</Label>
          <Input className="h-11 text-right" inputMode="decimal" placeholder="—" value={mc} onChange={(e) => setMc(cleanNumeric(e.target.value))} />
        </div>
        {(mc !== "" || item.manual_line_cost != null) && (
          <div className="w-40">
            <Label className="text-xs">Effective from</Label>
            <Input type="date" className="h-11" max={today()} value={eff} onChange={(e) => setEff(e.target.value || today())} />
          </div>
        )}
        {manualDirty && (
          <Button className="h-11" onClick={() =>
            update.mutate({ id: item.id, dish_id: dishId, cost_mode: "manual", manual_line_cost: mcn, manual_cost_effective_from: eff })
          }>
            Save manual cost
          </Button>
        )}
      </div>
      {qtyDirty && isManual && (
        <p className="text-xs text-warning">
          Quantity changed — the manual cost isn't adjusted automatically. Check the manual cost and save it too.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {manual !== null && <span>Manual recipe cost: <strong className="text-foreground">{formatCurrency(manual)}</strong></span>}
        <span>
          Calculated inventory cost:{" "}
          <strong className="text-foreground">{calculated === null ? "not available" : formatCurrency(calculated)}</strong>
        </span>
        {isManual && calculated !== null && (
          <Button variant="outline" className="h-11" onClick={() => update.mutate({ id: item.id, dish_id: dishId, cost_mode: "inventory" })}>
            Use calculated cost
          </Button>
        )}
        {!isManual && item.manual_line_cost != null && !manualDirty && (
          <Button variant="outline" className="h-11" onClick={() => update.mutate({ id: item.id, dish_id: dishId, cost_mode: "manual" })}>
            Use manual cost
          </Button>
        )}
      </div>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {item.ingredients?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This removes the line from this recipe and any portions linked to it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction className="h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => remove.mutate({ id: item.id, dish_id: dishId })}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
