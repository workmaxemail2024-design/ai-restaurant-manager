import { useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { DataTable } from "@/components/common/DataTable";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useIngredients, useCreateIngredient, useUpdateIngredient, useDeleteIngredient, Ingredient, IngredientInsert, UnitType, StorageType } from "@/hooks/useIngredients";
import { useSuppliers } from "@/hooks/useSuppliers";

const unitOptions: UnitType[] = ["kg", "g", "L", "ml", "oz", "each"];
const storageOptions: StorageType[] = ["freezer", "fridge", "dry"];

export default function IngredientsPage() {
  const { data: ingredients = [], isLoading } = useIngredients();
  const { data: suppliers = [] } = useSuppliers();
  const createIngredient = useCreateIngredient();
  const updateIngredient = useUpdateIngredient();
  const deleteIngredient = useDeleteIngredient();
  
  const [isOpen, setIsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Ingredient | null>(null);
  const [formData, setFormData] = useState<IngredientInsert>({ 
    name: "", 
    unit: "each", 
    storage_type: "dry", 
    default_cost_price: 0 
  });

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
      key: "default_cost_price", 
      header: "Cost Price",
      render: (item: Ingredient) => `$${Number(item.default_cost_price).toFixed(2)}`
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem) {
      await updateIngredient.mutateAsync({ id: editingItem.id, ...formData });
    } else {
      await createIngredient.mutateAsync(formData);
    }
    handleClose();
  };

  const handleEdit = (item: Ingredient) => {
    setEditingItem(item);
    setFormData({ 
      name: item.name, 
      unit: item.unit, 
      storage_type: item.storage_type,
      supplier_id: item.supplier_id,
      default_cost_price: Number(item.default_cost_price)
    });
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    setEditingItem(null);
    setFormData({ name: "", unit: "each", storage_type: "dry", default_cost_price: 0 });
  };

  return (
    <PageLayout title="Ingredients" subtitle="Manage your inventory ingredients">
      <div className="flex justify-end mb-4">
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
          <DialogTrigger asChild>
            <Button onClick={() => setIsOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add Ingredient
            </Button>
          </DialogTrigger>
          <DialogContent>
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
                  <Label>Unit</Label>
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
                <Label>Supplier</Label>
                <Select value={formData.supplier_id || ""} onValueChange={(v) => setFormData({ ...formData, supplier_id: v || null })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="price">Cost Price</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.default_cost_price}
                  onChange={(e) => setFormData({ ...formData, default_cost_price: parseFloat(e.target.value) || 0 })}
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                <Button type="submit" disabled={createIngredient.isPending || updateIngredient.isPending}>
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
