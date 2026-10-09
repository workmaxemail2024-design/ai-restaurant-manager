import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { InlineConfirmCell } from "@/components/inventory/InlineEditCell";
import { calculateBaseCost, getBaseUnit, useIngredientDependencies, type Ingredient, type UnitType } from "@/hooks/useIngredients";
import { formatCurrency, formatUnitCost } from "@/lib/currency";

const UNITS: UnitType[] = ["kg", "g", "oz", "L", "ml", "each"];
const dim = (u?: string | null) => (u === "kg" || u === "g" || u === "oz" ? "w" : u === "L" || u === "ml" ? "v" : "c");
const hasPack = (i: Ingredient) => !!(i.pack_size && i.pack_size > 0 && i.cost_per_pack && i.cost_per_pack > 0);
const hasCost = (i: Ingredient) => hasPack(i) || Number(i.default_cost_price) > 0;

export function costText(i: Ingredient, base?: number): string {
  const b = base ?? calculateBaseCost(i);
  if (!(b > 0)) return "Missing cost";
  const u = hasPack(i) ? getBaseUnit(i.pack_unit) : i.unit;
  return `${formatUnitCost(b)}/${u}`;
}

function Usage({ id, open }: { id: string; open: boolean }) {
  const { data, isLoading } = useIngredientDependencies(open ? id : null);
  if (!open) return null;
  if (isLoading || !data) return <p className="text-xs text-muted-foreground"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Checking usage…</p>;
  return (
    <p className="text-xs text-muted-foreground">
      Used in {data.recipe_lines} recipe line(s) · {data.stock_on_hand} stock record(s) · {data.price_entries} price entr{data.price_entries === 1 ? "y" : "ies"}.
      Stock quantities and past prices are never changed.
    </p>
  );
}

/** Unit: same-kind changes only; cross-kind only for unused, uncosted items. Never reinterprets a cost. */
export function UnitCell({ item, editable, onSave }: { item: Ingredient; editable: boolean; onSave: (u: UnitType) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState<UnitType>(item.unit);
  const { data: deps } = useIngredientDependencies(open ? item.id : null);
  const unused = !!deps && deps.recipe_lines + deps.stock_on_hand + deps.price_entries + deps.count_lines + deps.adjustments + deps.purchase_lines === 0;
  const costBlocks = !hasPack(item) && hasCost(item); // cost is per unit → changing unit would reinterpret it
  const allowed = (u: UnitType) => !costBlocks && (dim(u) === dim(item.unit) || (unused && !hasCost(item)));
  return (
    <InlineConfirmCell editable={editable} label="unit" display={item.unit}
      onOpen={() => { setOpen(true); setNext(item.unit); }}
      canConfirm={next !== item.unit && allowed(next)}
      onConfirm={async () => { await onSave(next); setOpen(false); }}>
      <Label>Inventory unit</Label>
      <div className="grid grid-cols-3 gap-2">
        {UNITS.map((u) => (
          <button key={u} type="button" disabled={u !== item.unit && !allowed(u)}
            className={cn("min-h-[44px] rounded border text-sm disabled:opacity-40", next === u && "border-primary bg-primary/10 font-medium")}
            onClick={() => setNext(u)}>{u}</button>
        ))}
      </div>
      {costBlocks
        ? <p className="text-xs text-warning">This item's cost is set per {item.unit}. Change the unit in the full editor so the cost is re-entered, not reinterpreted.</p>
        : <p className="text-xs text-muted-foreground">Cost comes from the pack price, so it is unchanged. Switching weight/volume/count is only allowed for unused, uncosted items.</p>}
      <Usage id={item.id} open={open} />
    </InlineConfirmCell>
  );
}

/** Pack size: keeps cost per pack; shows the before → after base cost before saving. */
export function PackSizeCell({ item, editable, onSave }: {
  item: Ingredient; editable: boolean;
  onSave: (patch: { pack_size: number; default_cost_price?: number }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const n = parseFloat(draft.replace(",", "."));
  const valid = Number.isFinite(n) && n > 0 && n < 1_000_000;
  const before = calculateBaseCost(item);
  const after = valid ? calculateBaseCost({ ...item, pack_size: n }) : before;
  const display = item.pack_size && item.cost_per_pack
    ? `${item.pack_size} ${item.pack_unit} @ ${formatCurrency(Number(item.cost_per_pack))}`
    : item.pack_size ? `${item.pack_size} ${item.pack_unit ?? ""}` : "-";
  return (
    <InlineConfirmCell editable={editable} label="pack size" display={display}
      onOpen={() => { setOpen(true); setDraft(item.pack_size ? String(item.pack_size) : ""); }}
      canConfirm={valid && n !== Number(item.pack_size)}
      onConfirm={async () => {
        // Mirror the full editor: with pack pricing the stored unit cost is the pack-derived base cost.
        await onSave(hasPack(item) ? { pack_size: n, default_cost_price: after } : { pack_size: n });
        setOpen(false);
      }}>
      <Label>Pack size {item.pack_unit ? `(${item.pack_unit})` : ""}</Label>
      <Input className="h-11" inputMode="decimal" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} />
      {!valid && draft && <p className="text-xs text-destructive">Enter a pack size above 0.</p>}
      {hasPack(item) ? (
        <p className="text-sm">
          Cost per pack stays {formatCurrency(Number(item.cost_per_pack))}.<br />
          Base cost: {costText(item, before)} → <strong>{costText(item, after)}</strong>
          {valid && after !== before && <span className="block text-xs text-warning">Recorded as a new price from today; past prices and reports stay as they were.</span>}
        </p>
      ) : <p className="text-xs text-muted-foreground">No pack price set, so no cost changes. Add a pack price in the full editor.</p>}
      <Usage id={item.id} open={open} />
    </InlineConfirmCell>
  );
}
