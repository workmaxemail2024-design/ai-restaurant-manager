import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateIngredient, type PackUnit, type StorageType, type UnitType } from "@/hooks/useIngredients";
import { useSuppliers } from "@/hooks/useSuppliers";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Prefilled name typed in the recipe search. */
  initialName?: string;
  /** Called with the new ingredient id so the recipe can auto-select it. */
  onCreated: (ingredientId: string) => void;
}

const PACK_UNITS: { value: PackUnit; label: string }[] = [
  { value: "g", label: "Grams (g)" },
  { value: "kg", label: "Kilograms (kg)" },
  { value: "ml", label: "Millilitres (ml)" },
  { value: "L", label: "Litres (L)" },
  { value: "each", label: "Each / unit" },
];

const STORAGE_TYPES: { value: StorageType; label: string }[] = [
  { value: "dry", label: "Dry store" },
  { value: "fridge", label: "Fridge" },
  { value: "freezer", label: "Freezer" },
];

/** Uses the existing ingredients architecture — no separate ingredient system. */
export function QuickAddIngredientDialog({ open, onOpenChange, initialName, onCreated }: Props) {
  const createIngredient = useCreateIngredient();
  const { data: suppliers = [] } = useSuppliers();

  const [name, setName] = useState("");
  const [packUnit, setPackUnit] = useState<PackUnit>("g");
  const [packSize, setPackSize] = useState<number>(1);
  const [costPerPack, setCostPerPack] = useState<number>(0);
  const [supplierId, setSupplierId] = useState<string>("_none");
  const [storageType, setStorageType] = useState<StorageType>("dry");

  useEffect(() => {
    if (open) {
      setName(initialName || "");
      setPackUnit("g");
      setPackSize(1);
      setCostPerPack(0);
      setSupplierId("_none");
      setStorageType("dry");
    }
  }, [open, initialName]);

  const baseUnit = packUnit === "kg" ? "g" : packUnit === "L" ? "ml" : packUnit;
  const baseCost =
    packSize > 0 && costPerPack > 0
      ? costPerPack / (packSize * (packUnit === "kg" || packUnit === "L" ? 1000 : 1))
      : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const created = await createIngredient.mutateAsync({
      name: name.trim(),
      unit: packUnit as UnitType,
      storage_type: storageType,
      default_cost_price: baseCost,
      purchase_unit: packUnit,
      pack_size: packSize || null,
      pack_unit: packUnit,
      cost_per_pack: costPerPack || null,
      supplier_id: supplierId === "_none" ? null : supplierId,
    });
    if (created?.id) onCreated(created.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Quick add ingredient</DialogTitle>
          <DialogDescription>
            Creates the ingredient in your existing Ingredients library and selects it in this recipe.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="qa-name">Ingredient name</Label>
            <Input id="qa-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Unit of measure</Label>
              <Select value={packUnit} onValueChange={(v) => setPackUnit(v as PackUnit)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PACK_UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Storage</Label>
              <Select value={storageType} onValueChange={(v) => setStorageType(v as StorageType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STORAGE_TYPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="qa-pack">Pack size ({packUnit})</Label>
              <Input id="qa-pack" type="number" step="0.01" min="0" value={packSize}
                onChange={(e) => setPackSize(parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <Label htmlFor="qa-cost">Cost per pack (€)</Label>
              <Input id="qa-cost" type="number" step="0.01" min="0" value={costPerPack}
                onChange={(e) => setCostPerPack(parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Cost per {baseUnit}: €{baseCost.toFixed(4)} — leave cost blank if unknown, the dish will stay marked incomplete.
          </p>
          <div>
            <Label>Supplier (optional)</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger><SelectValue placeholder="No supplier" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">No supplier</SelectItem>
                {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createIngredient.isPending || !name.trim()}>
              Create &amp; use
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
