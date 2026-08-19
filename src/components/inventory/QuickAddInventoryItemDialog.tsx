import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";
import {
  useCreateIngredient,
  INVENTORY_ITEM_TYPES,
  type InventoryItemType,
  type StorageType,
  type UnitType,
} from "@/hooks/useIngredients";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Prefilled name, when the user typed one before creating. */
  initialName?: string;
  /** Locks the item type, e.g. when created from a recipe selector. */
  fixedItemType?: InventoryItemType;
  /** Receives the new inventory item id so the caller can auto-select it. */
  onCreated: (id: string) => void;
}

const UNITS: { value: UnitType; label: string }[] = [
  { value: "g", label: "Grams (g)" },
  { value: "kg", label: "Kilograms (kg)" },
  { value: "ml", label: "Millilitres (ml)" },
  { value: "L", label: "Litres (L)" },
  { value: "oz", label: "Ounces (oz)" },
  { value: "each", label: "Each / unit" },
];

const STORAGE_AREAS: { value: StorageType; label: string }[] = [
  { value: "dry", label: "Dry store" },
  { value: "fridge", label: "Fridge" },
  { value: "freezer", label: "Freezer" },
];

/**
 * Compact "create on the spot" dialog for any inventory item — recipe ingredient,
 * direct-sale product or operational consumable. Uses the existing inventory
 * master, no duplicate stock system.
 */
export function QuickAddInventoryItemDialog({
  open,
  onOpenChange,
  initialName,
  fixedItemType,
  onCreated,
}: Props) {
  const createItem = useCreateIngredient();

  const [name, setName] = useState("");
  const [itemType, setItemType] = useState<InventoryItemType>(fixedItemType || "recipe_ingredient");
  const [unit, setUnit] = useState<UnitType>("each");
  const [storageType, setStorageType] = useState<StorageType>("dry");
  const [supplierId, setSupplierId] = useState<string>("_none");
  const [reorderPoint, setReorderPoint] = useState<string>("");
  const [parLevel, setParLevel] = useState<string>("");
  const [shelfLife, setShelfLife] = useState<string>("");

  useEffect(() => {
    if (open) {
      setName(initialName || "");
      setItemType(fixedItemType || "recipe_ingredient");
      setUnit("each");
      setStorageType("dry");
      setSupplierId("_none");
      setReorderPoint("");
      setParLevel("");
      setShelfLife("");
    }
  }, [open, initialName, fixedItemType]);

  const typeHelp = INVENTORY_ITEM_TYPES.find((t) => t.value === itemType)?.description;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const created = await createItem.mutateAsync({
      name: name.trim(),
      unit,
      storage_type: storageType,
      item_type: itemType,
      default_cost_price: 0,
      supplier_id: supplierId === "_none" ? null : supplierId,
      reorder_point: reorderPoint ? parseFloat(reorderPoint) : null,
      par_level: parLevel ? parseFloat(parLevel) : null,
      shelf_life_days: shelfLife ? parseInt(shelfLife, 10) : null,
    });
    onCreated(created.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add inventory item</DialogTitle>
          <DialogDescription>
            Quick create — you can add pack pricing and costs later on the Inventory Items page.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="qa-inv-name">Name</Label>
            <Input
              id="qa-inv-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bottled lager 330ml"
              required
              autoFocus
            />
          </div>

          <div>
            <Label>Item type</Label>
            <Select
              value={itemType}
              onValueChange={(v: InventoryItemType) => setItemType(v)}
              disabled={!!fixedItemType}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVENTORY_ITEM_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {typeHelp && <p className="text-xs text-muted-foreground mt-1">{typeHelp}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Base unit</Label>
              <Select value={unit} onValueChange={(v: UnitType) => setUnit(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Storage area</Label>
              <Select value={storageType} onValueChange={(v: StorageType) => setStorageType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STORAGE_AREAS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Supplier (optional)</Label>
            <SupplierSelect
              value={supplierId}
              onValueChange={setSupplierId}
              noneOption={{ value: "_none", label: "No supplier" }}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="qa-inv-reorder" className="text-xs">
                Reorder point
              </Label>
              <Input
                id="qa-inv-reorder"
                type="number"
                step="0.01"
                min="0"
                placeholder="Optional"
                value={reorderPoint}
                onChange={(e) => setReorderPoint(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="qa-inv-par" className="text-xs">
                Par level
              </Label>
              <Input
                id="qa-inv-par"
                type="number"
                step="0.01"
                min="0"
                placeholder="Optional"
                value={parLevel}
                onChange={(e) => setParLevel(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="qa-inv-shelf" className="text-xs">
                Shelf life (days)
              </Label>
              <Input
                id="qa-inv-shelf"
                type="number"
                step="1"
                min="0"
                placeholder="Optional"
                value={shelfLife}
                onChange={(e) => setShelfLife(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createItem.isPending || !name.trim()}>
              Create item
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
