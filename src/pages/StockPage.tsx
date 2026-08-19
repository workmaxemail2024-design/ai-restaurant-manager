import { useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { DataTable } from "@/components/common/DataTable";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Package, ClipboardList, BarChart3, Calculator } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { useStockLevels, useUpdateStock, StockLevel } from "@/hooks/useStock";
import { useIngredients } from "@/hooks/useIngredients";
import { useLocations } from "@/hooks/useLocations";
import { useLocation } from "@/contexts/LocationContext";
import { StockAdjustmentLog } from "@/components/inventory/StockAdjustmentLog";
import { VarianceReport } from "@/components/inventory/VarianceReport";
import { DataWarningBanner } from "@/components/common/DataWarningBanner";

export default function StockPage() {
  const { selectedLocationId } = useLocation();
  const { data: stockLevels = [], isLoading } = useStockLevels(selectedLocationId);
  const { data: ingredients = [] } = useIngredients();
  const { data: locations = [] } = useLocations();
  const updateStock = useUpdateStock();
  
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({ ingredient_id: "", location_id: "", quantity: 0 });

  const columns = [
    { 
      key: "ingredients", 
      header: "Ingredient",
      render: (item: StockLevel) => item.ingredients?.name || "-"
    },
    { 
      key: "locations", 
      header: "Location",
      render: (item: StockLevel) => item.locations?.name || "-"
    },
    { 
      key: "quantity", 
      header: "Quantity",
      render: (item: StockLevel) => {
        const isLow = Number(item.quantity) < 10;
        return (
          <div className="flex items-center gap-2">
            <span>{Number(item.quantity).toFixed(2)}</span>
            <span className="text-muted-foreground text-sm">{item.ingredients?.unit}</span>
            {isLow && <Badge variant="destructive">Low</Badge>}
          </div>
        );
      }
    },
    { 
      key: "updated_at", 
      header: "Last Updated",
      render: (item: StockLevel) => new Date(item.updated_at).toLocaleString()
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateStock.mutateAsync(formData);
    handleClose();
  };

  const handleEdit = (item: StockLevel) => {
    setFormData({ 
      ingredient_id: item.ingredient_id, 
      location_id: item.location_id, 
      quantity: Number(item.quantity)
    });
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    setFormData({ ingredient_id: "", location_id: "", quantity: 0 });
  };

  return (
    <PageLayout title="Inventory / Stock" subtitle="Monitor stock levels, adjustments, and variances">
      <DataWarningBanner locationId={selectedLocationId} filterTypes={["missing_recipes"]} className="mb-4" />
      <Tabs defaultValue="levels" className="space-y-4">
        <TabsList>
          <TabsTrigger value="levels" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Stock Levels
          </TabsTrigger>
          <TabsTrigger value="adjustments" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Adjustments
          </TabsTrigger>
          <TabsTrigger value="usage" className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Theoretical Usage
          </TabsTrigger>
          <TabsTrigger value="variance" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Variance Report
          </TabsTrigger>
        </TabsList>

        <TabsContent value="levels" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
              <DialogTrigger asChild>
                <Button onClick={() => setIsOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" /> Update Stock
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Update Stock Level</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label>Ingredient</Label>
                    <Select value={formData.ingredient_id} onValueChange={(v) => setFormData({ ...formData, ingredient_id: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select ingredient" />
                      </SelectTrigger>
                      <SelectContent>
                        {ingredients.map((ing) => (
                          <SelectItem key={ing.id} value={ing.id}>{ing.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Location</Label>
                    <Select value={formData.location_id} onValueChange={(v) => setFormData({ ...formData, location_id: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select location" />
                      </SelectTrigger>
                      <SelectContent>
                        {locations.map((loc) => (
                          <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input
                      id="quantity"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
                      required
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                    <Button type="submit" disabled={updateStock.isPending}>Update</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <DataTable
            data={stockLevels}
            columns={columns}
            isLoading={isLoading}
            onEdit={handleEdit}
          />
        </TabsContent>

        <TabsContent value="adjustments">
          <StockAdjustmentLog />
        </TabsContent>

        <TabsContent value="usage">
          <TheoreticalUsageReport />
        </TabsContent>

        <TabsContent value="variance">
          <VarianceReport />
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}