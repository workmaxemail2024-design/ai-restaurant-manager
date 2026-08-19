import { useState, useMemo } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { DataTable } from "@/components/common/DataTable";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { 
  useIngredients, 
  useCreateIngredient, 
  useUpdateIngredient, 
  useDeleteIngredient, 
  Ingredient, 
  IngredientInsert, 
  UnitType, 
  StorageType,
  PackUnit,
  PurchaseUnit,
  calculateBaseCost,
  getBaseUnit
} from "@/hooks/useIngredients";
import { useSuppliers } from "@/hooks/useSuppliers";
import { formatCurrency } from "@/lib/currency";

const unitOptions: UnitType[] = ["kg", "g", "L", "ml", "oz", "each"];
const storageOptions: StorageType[] = ["freezer", "fridge", "dry"];
const packUnitOptions: PackUnit[] = ["each", "g", "kg", "ml", "L"];
const purchaseUnitOptions: PurchaseUnit[] = ["each", "g", "kg", "ml", "L", "case"];

interface FormData extends IngredientInsert {
  use_pack_pricing: boolean;
}

export default function IngredientsPage() {
  const { data: ingredients = [], isLoading } = useIngredients();
  const { data: suppliers = [] } = useSuppliers();
  const createIngredient = useCreateIngredient();
  const updateIngredient = useUpdateIngredient();
  const deleteIngredient = useDeleteIngredient();
  
  const [isOpen, setIsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Ingredient | null>(null);
  const [formData, setFormData] = useState<FormData>({ 
    name: "", 
    unit: "each", 
    storage_type: "dry", 
    default_cost_price: 0,
    use_pack_pricing: false,
    pack_size: null,
    pack_unit: "kg",
    cost_per_pack: null,
    purchase_unit: "each"
  });

  // Calculate base cost from form data for preview
  const calculatedBaseCost = useMemo(() => {
    if (!formData.use_pack_pricing || !formData.pack_size || !formData.cost_per_pack) {
      return formData.default_cost_price;
    }
    const mockIngredient = {
      pack_size: formData.pack_size,
      pack_unit: formData.pack_unit,
      cost_per_pack: formData.cost_per_pack,
      default_cost_price: formData.default_cost_price
    } as Ingredient;
    return calculateBaseCost(mockIngredient);
  }, [formData.use_pack_pricing, formData.pack_size, formData.pack_unit, formData.cost_per_pack, formData.default_cost_price]);

  const baseUnitLabel = getBaseUnit(formData.pack_unit);

  const columns = [
    { key: "name", header: "Name" },
    { key: "unit", header: "Unit" },
    { 
      key: "storage_type", 
      header: "Storage",
      render: (item: Ingredient) => (
        <Badge variant="secondary" className="capitalize">{item.storage_type}</Badge>
      )
    },
    { 
      key: "suppliers", 
      header: "Supplier",
      render: (item: Ingredient) => item.suppliers?.name || "-"
    },
    { 
      key: "pack_info", 
      header: "Pack Size",
      render: (item: Ingredient) => {
        if (!item.pack_size || !item.cost_per_pack) return "-";
        return `${item.pack_size} ${item.pack_unit} @ ${formatCurrency(Number(item.cost_per_pack))}`;
      }
    },
    { 
      key: "base_cost", 
      header: "Base Cost",
      render: (item: Ingredient) => {
        const baseCost = calculateBaseCost(item);
        const unit = getBaseUnit(item.pack_unit);
        return `${formatCurrency(baseCost)}/${unit}`;
      }
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prepare data - if not using pack pricing, set base cost as default
    const submitData: IngredientInsert = {
      name: formData.name,
      unit: formData.unit,
      storage_type: formData.storage_type,
      supplier_id: formData.supplier_id,
      default_cost_price: formData.use_pack_pricing ? calculatedBaseCost : formData.default_cost_price,
      pack_size: formData.use_pack_pricing ? formData.pack_size : null,
      pack_unit: formData.use_pack_pricing ? formData.pack_unit : null,
      cost_per_pack: formData.use_pack_pricing ? formData.cost_per_pack : null,
      purchase_unit: formData.purchase_unit
    };
    
    if (editingItem) {
      await updateIngredient.mutateAsync({ id: editingItem.id, ...submitData });
    } else {
      await createIngredient.mutateAsync(submitData);
    }
    handleClose();
  };

  const handleEdit = (item: Ingredient) => {
    setEditingItem(item);
    const hasPackPricing = Boolean(item.pack_size && item.cost_per_pack);
    setFormData({ 
      name: item.name, 
      unit: item.unit, 
      storage_type: item.storage_type,
      supplier_id: item.supplier_id,
      default_cost_price: Number(item.default_cost_price),
      use_pack_pricing: hasPackPricing,
      pack_size: item.pack_size ? Number(item.pack_size) : null,
      pack_unit: (item.pack_unit as PackUnit) || "kg",
      cost_per_pack: item.cost_per_pack ? Number(item.cost_per_pack) : null,
      purchase_unit: (item.purchase_unit as PurchaseUnit) || "each"
    });
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    setEditingItem(null);
    setFormData({ 
      name: "", 
      unit: "each", 
      storage_type: "dry", 
      default_cost_price: 0,
      use_pack_pricing: false,
      pack_size: null,
      pack_unit: "kg",
      cost_per_pack: null,
      purchase_unit: "each"
    });
  };

  const packSizeError = formData.use_pack_pricing && formData.pack_size !== null && formData.pack_size <= 0;
  const costError = formData.use_pack_pricing && formData.cost_per_pack !== null && formData.cost_per_pack < 0;

  return (
    <PageLayout title="Ingredients" subtitle="Manage your inventory ingredients">
      <div className="flex justify-end mb-4">
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
          <DialogTrigger asChild>
            <Button onClick={() => setIsOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add Ingredient
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingItem ? "Edit Ingredient" : "Add Ingredient"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Recipe Unit</Label>
                  <Select value={formData.unit} onValueChange={(v: UnitType) => setFormData({ ...formData, unit: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {unitOptions.map((unit) => (
                        <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Storage Type</Label>
                  <Select value={formData.storage_type} onValueChange={(v: StorageType) => setFormData({ ...formData, storage_type: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {storageOptions.map((type) => (
                        <SelectItem key={type} value={type} className="capitalize">{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Supplier (optional)</Label>
                <SupplierSelect
                  value={formData.supplier_id || "_none"}
                  onValueChange={(v) => setFormData({ ...formData, supplier_id: v === "_none" ? null : v })}
                  noneOption={{ value: "_none", label: "None" }}
                />
              </div>

              {/* Pack Pricing Toggle */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="use_pack_pricing"
                  checked={formData.use_pack_pricing}
                  onChange={(e) => setFormData({ ...formData, use_pack_pricing: e.target.checked })}
                  className="h-4 w-4 rounded border-border"
                />
                <Label htmlFor="use_pack_pricing" className="text-sm font-normal cursor-pointer">
                  Use pack pricing (recommended)
                </Label>
              </div>

              {formData.use_pack_pricing ? (
                <>
                  {/* Pack Size & Unit */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="pack_size">Pack Size</Label>
                      <Input
                        id="pack_size"
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={formData.pack_size ?? ""}
                        onChange={(e) => setFormData({ ...formData, pack_size: e.target.value ? parseFloat(e.target.value) : null })}
                        placeholder="e.g. 2"
                        className={packSizeError ? "border-destructive" : ""}
                      />
                      {packSizeError && (
                        <p className="text-xs text-destructive mt-1">Pack size must be greater than 0</p>
                      )}
                    </div>
                    <div>
                      <Label>Pack Unit</Label>
                      <Select value={formData.pack_unit || "kg"} onValueChange={(v: PackUnit) => setFormData({ ...formData, pack_unit: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {packUnitOptions.map((unit) => (
                            <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Cost per Pack */}
                  <div>
                    <Label htmlFor="cost_per_pack">Cost per Pack (€)</Label>
                    <Input
                      id="cost_per_pack"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.cost_per_pack ?? ""}
                      onChange={(e) => setFormData({ ...formData, cost_per_pack: e.target.value ? parseFloat(e.target.value) : null })}
                      placeholder="e.g. 20.00"
                      className={costError ? "border-destructive" : ""}
                    />
                    {costError && (
                      <p className="text-xs text-destructive mt-1">Cost must be 0 or greater</p>
                    )}
                  </div>

                  {/* Calculated Base Cost Display */}
                  {formData.pack_size && formData.pack_size > 0 && formData.cost_per_pack !== null && formData.cost_per_pack >= 0 && (
                    <div className="bg-muted/50 border border-border rounded-md px-3 py-2">
                      <p className="text-sm text-muted-foreground">
                        Calculated cost: <span className="font-medium text-foreground">{formatCurrency(calculatedBaseCost)} per {baseUnitLabel}</span>
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <Label htmlFor="price">Cost per Unit (€)</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.default_cost_price}
                    onChange={(e) => setFormData({ ...formData, default_cost_price: parseFloat(e.target.value) || 0 })}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">Direct cost per {formData.unit}</p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                <Button 
                  type="submit" 
                  disabled={createIngredient.isPending || updateIngredient.isPending || packSizeError || costError}
                >
                  {editingItem ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <DataTable
        data={ingredients}
        columns={columns}
        isLoading={isLoading}
        onEdit={handleEdit}
        onDelete={(item) => deleteIngredient.mutate(item.id)}
      />
    </PageLayout>
  );
}
