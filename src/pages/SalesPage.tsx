import { useState, useMemo } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Euro, ShoppingBag, TrendingUp, Lock, Trash2 } from "lucide-react";
import { useSales, useCreateSale, useDeleteSale, Sale, SaleInsert } from "@/hooks/useSales";
import { useDishes } from "@/hooks/useDishes";
import { useLocations } from "@/hooks/useLocations";
import { useLocation } from "@/contexts/LocationContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { DataWarningBanner } from "@/components/common/DataWarningBanner";

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

  // Summary totals
  const summary = useMemo(() => {
    const totalRevenue = sales.reduce((s, sale) => s + Number(sale.total_price), 0);
    const totalOrders = sales.reduce((s, sale) => s + sale.quantity, 0);
    const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    return { totalRevenue, totalOrders, aov };
  }, [sales]);

  // Group sales by day
  const groupedSales = useMemo(() => {
    const groups: Record<string, { sales: Sale[]; revenue: number; orders: number }> = {};
    for (const sale of sales) {
      const day = sale.sale_date;
      if (!groups[day]) groups[day] = { sales: [], revenue: 0, orders: 0 };
      groups[day].sales.push(sale);
      groups[day].revenue += Number(sale.total_price);
      groups[day].orders += sale.quantity;
    }
    // Sort days descending
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [sales]);

  // Determine if a sale is from POS (created_at is very close to sale_date or has no manual indicator)
  // For now, check if sale was created programmatically (created_at timestamp matches sale_date pattern)
  const isPOSSale = (sale: Sale): boolean => {
    // Simple heuristic: if the sale has a created_at that's on a different day than the sale_date,
    // it was likely imported. This is a reasonable proxy without a dedicated source column.
    return false; // Default to manual until POS source tracking is added
  };

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
    <PageLayout title="Sales" subtitle="Raw sales transaction ledger">
      {/* Data Warnings */}
      <DataWarningBanner locationId={selectedLocationId} filterTypes={["missing_recipes", "missing_sales"]} className="mb-4" />

      {/* Period indicator */}
      <div className="text-sm text-muted-foreground mb-4">
        Showing data for: <span className="font-medium text-foreground">{presetLabel}</span>
        {startDate !== endDate && (
          <span> ({startDate} → {endDate})</span>
        )}
      </div>

      {/* Summary Totals */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <Euro className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Revenue</p>
              <p className="text-xl font-bold">{formatCurrency(summary.totalRevenue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <ShoppingBag className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Orders</p>
              <p className="text-xl font-bold">{summary.totalOrders}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Average Order Value</p>
              <p className="text-xl font-bold">{formatCurrency(summary.aov)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add Sale Button */}
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

      {/* Grouped Sales Table */}
      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading sales data…</div>
      ) : groupedSales.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No sales data for this period.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedSales.map(([day, group]) => (
            <div key={day} className="rounded-lg border border-border overflow-hidden">
              {/* Day Header */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-secondary/50 border-b border-border">
                <span className="text-sm font-medium">
                  {format(parseISO(day), "EEE dd MMM yyyy")}
                </span>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{group.orders} orders</span>
                  <span className="font-medium text-foreground">{formatCurrency(group.revenue)}</span>
                </div>
              </div>

              {/* Sale Rows */}
              <div className="divide-y divide-border">
                {/* Table Header */}
                <div className="grid grid-cols-[1fr_1fr_1fr_80px_100px_80px_50px] gap-2 px-4 py-2 text-xs text-muted-foreground font-medium bg-muted/30">
                  <span>Date</span>
                  <span>Location</span>
                  <span>Dish</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Revenue</span>
                  <span className="text-center">Source</span>
                  <span></span>
                </div>
                {group.sales.map((sale) => {
                  const isPos = isPOSSale(sale);
                  return (
                    <div
                      key={sale.id}
                      className="grid grid-cols-[1fr_1fr_1fr_80px_100px_80px_50px] gap-2 px-4 py-2.5 items-center text-sm hover:bg-secondary/30 transition-colors"
                    >
                      <span className="text-muted-foreground">
                        {new Date(sale.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span>{sale.locations?.name || "—"}</span>
                      <span>{sale.dishes?.name || "—"}</span>
                      <span className="text-right">{sale.quantity}</span>
                      <span className="text-right font-medium">{formatCurrency(Number(sale.total_price))}</span>
                      <span className="text-center">
                        {isPos ? (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                            <Lock className="h-2.5 w-2.5" /> POS
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            Manual
                          </Badge>
                        )}
                      </span>
                      <span className="text-right">
                        {!isPos && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteSale.mutate(sale.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageLayout>
  );
}
