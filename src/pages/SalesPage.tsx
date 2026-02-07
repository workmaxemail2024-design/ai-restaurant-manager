import { useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { DataTable } from "@/components/common/DataTable";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useSales, useCreateSale, useDeleteSale, Sale, SaleInsert } from "@/hooks/useSales";
import { useDishes } from "@/hooks/useDishes";
import { useLocations } from "@/hooks/useLocations";
import { useLocation } from "@/contexts/LocationContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { formatCurrency } from "@/lib/currency";

export default function SalesPage() {
  const { selectedLocationId } = useLocation();
  const { startDate, endDate, presetLabel } = useDateRange();
  const { data: sales = [], isLoading } = useSales(startDate, endDate, selectedLocationId);
  const { data: dishes = [] } = useDishes(selectedLocationId);
  const { data: locations = [] } = useLocations();
  const createSale = useCreateSale();
  const deleteSale = useDeleteSale();
  
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState<SaleInsert>({ 
    location_id: "", 
    dish_id: "", 
    quantity: 1, 
    total_price: 0 
  });

  const columns = [
    { 
      key: "sale_date", 
      header: "Date",
      render: (item: Sale) => new Date(item.sale_date).toLocaleDateString()
    },
    { key: "dishes", header: "Dish", render: (item: Sale) => item.dishes?.name || "-" },
    { key: "locations", header: "Location", render: (item: Sale) => item.locations?.name || "-" },
    { key: "quantity", header: "Qty" },
    { 
      key: "total_price", 
      header: "Total",
      render: (item: Sale) => formatCurrency(Number(item.total_price))
    },
    { 
      key: "created_at", 
      header: "Time",
      render: (item: Sale) => new Date(item.created_at).toLocaleTimeString()
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createSale.mutateAsync(formData);
    handleClose();
  };

  const handleClose = () => {
    setIsOpen(false);
    setFormData({ location_id: "", dish_id: "", quantity: 1, total_price: 0 });
  };

  const handleDishChange = (dishId: string) => {
    const dish = dishes.find(d => d.id === dishId);
    const newTotal = dish ? Number(dish.selling_price) * formData.quantity : 0;
    setFormData({ ...formData, dish_id: dishId, total_price: newTotal });
  };

  const handleQuantityChange = (qty: number) => {
    const dish = dishes.find(d => d.id === formData.dish_id);
    const newTotal = dish ? Number(dish.selling_price) * qty : 0;
    setFormData({ ...formData, quantity: qty, total_price: newTotal });
  };

  return (
    <PageLayout title="Sales" subtitle="Record and track sales">
      {/* Period indicator */}
      <div className="text-sm text-muted-foreground mb-4">
        Showing data for: <span className="font-medium text-foreground">{presetLabel}</span>
        {startDate !== endDate && (
          <span> ({startDate} → {endDate})</span>
        )}
      </div>
      
      <div className="flex justify-end mb-4">
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
          <DialogTrigger asChild>
            <Button onClick={() => setIsOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Record Sale
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Sale</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Location</Label>
                <Select value={formData.location_id} onValueChange={(v) => setFormData({ ...formData, location_id: v })} required>
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
                <Label>Dish</Label>
                <Select value={formData.dish_id} onValueChange={handleDishChange} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select dish" />
                  </SelectTrigger>
                  <SelectContent>
                    {dishes.map((dish) => (
                      <SelectItem key={dish.id} value={dish.id}>
                        {dish.name} - {formatCurrency(Number(dish.selling_price))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={formData.quantity}
                  onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 1)}
                  required
                />
              </div>
              <div>
                <Label>Total Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.total_price}
                  onChange={(e) => setFormData({ ...formData, total_price: parseFloat(e.target.value) || 0 })}
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                <Button type="submit" disabled={createSale.isPending || !formData.location_id || !formData.dish_id}>
                  Record Sale
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <DataTable
        data={sales}
        columns={columns}
        isLoading={isLoading}
        onDelete={(item) => deleteSale.mutate(item.id)}
      />
    </PageLayout>
  );
}
