import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ChevronsUpDown, Check } from "lucide-react";
import { compatibleUnits, getIngredientCostUnit } from "@/lib/units";
import { batchToPortion, cleanDecimal, parseDecimal } from "@/lib/batchRecipe";
import { cn } from "@/lib/utils";
import { QuickAddIngredientDialog } from "@/components/dishes/QuickAddIngredientDialog";

export interface CalculatedLine { ingredient_id: string; quantity: number; unit: string }
type Ingredient = { id: string; name: string; archived_at?: string | null; pack_size?: number | null; cost_per_pack?: number | null; pack_unit?: string | null; unit?: string | null };
type Row = { key: number; ingredient_id: string; qty: string; unit: string };

const ALL_UNITS = ["g", "kg", "oz", "ml", "L", "each"];
let seq = 0;
const blankRow = (): Row => ({ key: ++seq, ingredient_id: "", qty: "", unit: "" });

export function BatchRecipeCalculator({
  open, onOpenChange, ingredients, onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ingredients: Ingredient[];
  onApply: (lines: CalculatedLine[]) => void;
}) {
  const [portions, setPortions] = useState("");
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  useEffect(() => { if (open) { setPortions(""); setRows([blankRow()]); } }, [open]);

  const p = parseDecimal(portions);
  const portionsValid = p !== null && p > 0;
  const nameOf = (id: string) => ingredients.find((i) => i.id === id)?.name ?? "";
  const unitsFor = (id: string) => {
    const o = compatibleUnits(getIngredientCostUnit(ingredients.find((i) => i.id === id)));
    return o.length ? o : ALL_UNITS;
  };
  const upd = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const results = rows.map((r) => ({ r, out: portionsValid ? batchToPortion(parseDecimal(r.qty), r.unit, p) : null }));
  const counts = new Map<string, number>();
  rows.forEach((r) => r.ingredient_id && counts.set(r.ingredient_id, (counts.get(r.ingredient_id) || 0) + 1));
  const duplicates = [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => nameOf(id));
  const filled = results.filter(({ r }) => r.ingredient_id || r.qty);
  const allComplete = filled.length > 0 && filled.every(({ r, out }) => r.ingredient_id && r.unit && out);
  const canApply = portionsValid && allComplete && duplicates.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[calc(100vw-2rem)] max-h-[90vh] supports-[height:100dvh]:max-h-[90dvh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Batch Recipe Calculator</DialogTitle>
          <DialogDescription>Enter the kitchen recipe as supplied. Nothing is saved from here.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch] space-y-4 pr-1">
          <div className="space-y-1">
            <Label htmlFor="batch-portions" className="text-base">How many portions does this kitchen recipe make?</Label>
            <Input id="batch-portions" inputMode="decimal" placeholder="e.g. 20" className="h-12 text-lg w-40"
              value={portions} onChange={(e) => setPortions(cleanDecimal(e.target.value))} />
            {portions !== "" && !portionsValid && <p className="text-sm text-destructive">Enter a number greater than 0.</p>}
          </div>

          <div className="space-y-3">
            {results.map(({ r, out }) => (
              <div key={r.key} className="rounded-lg border p-3 grid gap-2 sm:grid-cols-12 items-end">
                <div className="sm:col-span-5">
                  <Label>Ingredient</Label>
                  <IngredientPicker
                    valueId={r.ingredient_id}
                    valueName={nameOf(r.ingredient_id)}
                    ingredients={ingredients}
                    onPick={(v) => upd(r.key, { ingredient_id: v, unit: unitsFor(v).includes(r.unit) ? r.unit : "" })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Batch qty</Label>
                  <Input inputMode="decimal" placeholder="e.g. 6.4" className="h-12 text-right"
                    value={r.qty} onChange={(e) => upd(r.key, { qty: cleanDecimal(e.target.value) })} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Unit</Label>
                  <Select value={r.unit || undefined} onValueChange={(v) => upd(r.key, { unit: v })}>
                    <SelectTrigger className="h-12"><SelectValue placeholder="Unit" /></SelectTrigger>
                    <SelectContent>{unitsFor(r.ingredient_id).map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label>Per portion</Label>
                  <div className={cn("h-12 rounded-md bg-muted/50 flex items-center justify-end px-3 text-lg font-semibold",
                    !out && "text-muted-foreground font-normal text-sm")}>
                    {out ? `${out.quantity} ${out.unit}` : "—"}
                  </div>
                </div>
                <div className="sm:col-span-1 flex justify-end">
                  <Button variant="ghost" size="icon" className="h-12 w-12 text-destructive" aria-label="Remove row"
                    onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [blankRow()]))}>
                    <Trash2 className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="outline" className="h-12" onClick={() => setRows((rs) => [...rs, blankRow()])}>
              <Plus className="h-4 w-4 mr-2" /> Add ingredient
            </Button>
          </div>

          {duplicates.length > 0 && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
              {duplicates.join(", ")} appears more than once. Combine the quantities into one row before applying.
            </div>
          )}
        </div>

        <div className="rounded-md bg-muted/40 p-3 text-sm">
          Batch recipe: <strong>{portionsValid ? p : "—"} portions</strong> → Recipe saved per <strong>1 portion</strong>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="h-12" disabled={!canApply}
            onClick={() => onApply(filled.map(({ r, out }) => ({ ingredient_id: r.ingredient_id, quantity: out!.quantity, unit: out!.unit })))}>
            Apply to Recipe
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Ingredient picker: the field opens its own small dialog with a search box and a
 * scrollable list of plain buttons. Each button calls onPick(ingredient.id) and then
 * explicitly closes the dialog — no popover, no outside-pointer listener, no inline
 * expansion inside the parent scroll area.
 */
function IngredientPicker({
  valueId, valueName, ingredients, onPick,
}: { valueId: string; valueName: string; ingredients: Ingredient[]; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const list = ingredients.filter((i) => !i.archived_at && i.name.toLowerCase().includes(q.trim().toLowerCase()));
  const term = q.trim();
  const exact = term !== "" && ingredients.some((i) => !i.archived_at && i.name.trim().toLowerCase() === term.toLowerCase());
  const startAdd = (name: string) => { setAddName(name); setOpen(false); setAddOpen(true); };
  return (
    <>
      <Button type="button" variant="outline" aria-label="Select ingredient"
        className="h-12 w-full justify-between font-normal" onClick={() => { setQ(""); setOpen(true); }}>
        <span className={cn("truncate", !valueId && "text-muted-foreground")}>{valueId ? valueName || "Selected ingredient" : "Select ingredient"}</span>
        <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[80vh] flex flex-col gap-3"
          onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Select ingredient</DialogTitle>
            <DialogDescription className="sr-only">Search and tap an ingredient</DialogDescription>
          </DialogHeader>
          <Input placeholder="Search ingredients..." value={q} onChange={(e) => setQ(e.target.value)} className="h-12" />
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] border rounded-md divide-y" role="listbox">
            {term !== "" && !exact && (
              <button type="button" className="w-full flex items-center gap-2 text-left px-3 min-h-12 text-base font-medium text-primary active:bg-accent"
                onClick={() => startAdd(term)}>
                <Plus className="h-4 w-4 shrink-0" /> Add "{term}" as new ingredient
              </button>
            )}
            {list.length === 0 && <p className="p-3 text-sm text-muted-foreground">No ingredients found</p>}
            {list.map((i) => (
              <button key={i.id} type="button" role="option" aria-selected={i.id === valueId}
                data-ingredient-id={i.id}
                className="w-full flex items-center gap-2 text-left px-3 min-h-12 text-base active:bg-accent focus:outline-none"
                onClick={() => { onPick(i.id); setOpen(false); }}>
                <Check className={cn("h-4 w-4 shrink-0", i.id === valueId ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{i.name}</span>
              </button>
            ))}
          </div>
          <Button type="button" variant="outline" className="h-12 shrink-0" onClick={() => startAdd(term)}>
            <Plus className="h-4 w-4 mr-2" /> Add new ingredient
          </Button>
        </DialogContent>
      </Dialog>
      <QuickAddIngredientDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        initialName={addName}
        onCreated={(id) => onPick(id)}
      />
    </>
  );
}
