import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INVENTORY_CATEGORIES } from "@/hooks/useIngredients";
import { formatCurrency } from "@/lib/currency";
import { interpretRow, parseCategory, parseItemType, parseGroup, type RawRow } from "@/lib/stockListImport";

export type StorageType = "freezer" | "fridge" | "dry";

interface Props {
  raw: RawRow | null;
  storage: StorageType;
  edited: boolean;
  onSave: (raw: RawRow, storage: StorageType) => void;
  onRevert: () => void;
  onClose: () => void;
}

const NONE = "_none";
const UNITS = ["each", "g", "kg", "ml", "L"];
const PURCHASE = ["each", "g", "kg", "ml", "L", "case", "box", "pack", "bag", "crate", "tray"];

/** Compact editor for one review row. Edits only the in-memory row; nothing is saved here. */
export function EditImportRowSheet({ raw, storage, edited, onSave, onRevert, onClose }: Props) {
  const [d, setD] = useState<RawRow | null>(raw);
  const [st, setSt] = useState<StorageType>(storage);
  useEffect(() => {
    if (!raw) return;
    // Normalise free-text values to the canonical ones the dropdowns offer.
    setD({
      ...raw,
      category: parseCategory(raw.category) ?? raw.category,
      itemType: parseItemType(raw.itemType) ?? raw.itemType,
      group: parseGroup(raw.group) ?? raw.group,
    });
    setSt(storage);
  }, [raw, storage]);

  if (!d) return <Sheet open={false} />;
  const set = (k: keyof RawRow, v: string) => setD({ ...d, [k]: v });
  const preview = interpretRow(d);
  const baseLabel = preview.baseUnit;

  const sel = (k: keyof RawRow, label: string, opts: { value: string; label: string }[]) => {
    const v = String(d[k] ?? "");
    const known = opts.some((o) => o.value === v);
    return (
      <div className="space-y-1">
        <Label>{label}</Label>
        <Select value={v ? v : NONE} onValueChange={(x) => set(k, x === NONE ? "" : x)}>
          <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={NONE}>Not set</SelectItem>
            {!known && v && <SelectItem value={v}>{v} (from file)</SelectItem>}
            {opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    );
  };
  const txt = (k: keyof RawRow, label: string, numeric = false, placeholder = "") => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input className="h-11" value={String(d[k] ?? "")} inputMode={numeric ? "decimal" : undefined}
        placeholder={placeholder} onChange={(e) => set(k, e.target.value)} />
    </div>
  );

  return (
    <Sheet open={!!raw} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="z-[60] flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b p-4 text-left">
          <SheetTitle>Edit row {d.rowNumber}</SheetTitle>
          <SheetDescription>Changes apply to this review only. Nothing is saved until you confirm the import.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 touch-pan-y">
          {txt("itemName", "Product name *")}
          <div className="grid gap-3 sm:grid-cols-2">
            {txt("supplier", "Supplier")}
            {txt("productCode", "Supplier product code")}
            {sel("group", "Group", [{ value: "food", label: "Food" }, { value: "beverage", label: "Beverage" }, { value: "operational", label: "Operational" }])}
            {sel("category", "Category", INVENTORY_CATEGORIES.map((c) => ({ value: c.value, label: c.label })))}
            {sel("itemType", "Item type", [
              { value: "recipe_ingredient", label: "Recipe ingredient" },
              { value: "direct_sale", label: "Direct sale" },
              { value: "operational", label: "Operational stock" },
            ])}
            <div className="space-y-1">
              <Label>Storage</Label>
              <Select value={st} onValueChange={(v) => setSt(v as StorageType)}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dry">Dry store</SelectItem>
                  <SelectItem value="fridge">Fridge</SelectItem>
                  <SelectItem value="freezer">Freezer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {sel("purchaseUnit", "Purchase unit", PURCHASE.map((u) => ({ value: u, label: u })))}
            {txt("purchaseQty", "Purchase quantity", true, "1")}
            {txt("packSize", "Pack size", true, "e.g. 5")}
            {sel("packUnit", "Pack / inventory unit", UNITS.map((u) => ({ value: u, label: u })))}
            {txt("packCost", "Cost per pack (€)", true, "Leave blank if unknown")}
          </div>

          <div className="space-y-1 rounded-lg border p-3 text-sm">
            <div>
              Calculated cost:{" "}
              {preview.baseCost != null && baseLabel
                ? <strong>{formatCurrency(preview.baseCost)}/{baseLabel}{baseLabel !== "each" ? ` · ${formatCurrency(preview.baseCost * 1000)}/${baseLabel === "g" ? "kg" : "L"}` : ""}</strong>
                : <span className="text-warning">Missing cost (stays unknown, never €0)</span>}
            </div>
            {preview.blocking.length > 0 && <div className="text-destructive">Cannot import: {preview.blocking.join("; ")}</div>}
            {preview.missing.length > 0 && <div className="text-warning">Still unknown: {preview.missing.join(", ")}</div>}
            {preview.issues.map((i) => <div key={i} className="text-warning">{i}</div>)}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t p-4">
          {edited && <Button variant="ghost" className="mr-auto h-11" onClick={onRevert}>Revert to original</Button>}
          <Button variant="outline" className="h-11" onClick={onClose}>Cancel</Button>
          <Button className="h-11" onClick={() => onSave({ ...d, unitCost: d.packCost !== raw?.packCost ? "" : d.unitCost }, st)}>Save row</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
