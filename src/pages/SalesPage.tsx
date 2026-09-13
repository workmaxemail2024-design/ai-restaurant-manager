import { useState, useMemo } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Euro, ShoppingBag, TrendingUp, Calendar, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { useSales, useCreateSale, useDeleteSale, SaleInsert } from "@/hooks/useSales";
import { useDailyBreakdown } from "@/hooks/useDailyBreakdown";
import { useDishes } from "@/hooks/useDishes";
import { useLocations } from "@/hooks/useLocations";
import { useLocation } from "@/contexts/LocationContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { formatCurrency } from "@/lib/currency";
import { format, parseISO } from "date-fns";
import { DataWarningBanner } from "@/components/common/DataWarningBanner";
import { DateRangeSelector } from "@/components/DateRangeSelector";
import { SalesDayRow } from "@/components/sales/SalesDayRow";

export default function SalesPage() {
  const { selectedLocationId } = useLocation();
  const { startDate, endDate, presetLabel } = useDateRange();
  const isSingleDay = startDate === endDate;

  // Canonical per-day figures (daily-summary resolver + product rows).
  const { data: dailyData = [], isLoading } = useDailyBreakdown(startDate, endDate, selectedLocationId);
  // Detailed product rows — only loaded up-front for the single-day view.
  const { data: daySales = [] } = useSales(
    isSingleDay ? startDate : undefined,
    isSingleDay ? endDate : undefined,
    selectedLocationId
  );

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

  // KPI totals across the WHOLE selected range, from canonical daily figures.
  // Never restricted to dates that happen to have product-level detail.
  const summary = useMemo(() => {
    let totalRevenue = 0;
    let totalOrders: number | null = null;
    let daysWithData = 0;

    for (const day of dailyData) {
      if (!day.hasData) continue;
      daysWithData++;
      totalRevenue += day.revenue;
      if (day.orders != null) totalOrders = (totalOrders ?? 0) + day.orders;
    }

    const aov = totalOrders && totalOrders > 0 ? totalRevenue / totalOrders : null;
    return { totalRevenue, totalOrders, aov, daysWithData };
  }, [dailyData]);

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

  const singleDay = isSingleDay ? dailyData[0] : undefined;

  return (
    <PageLayout title="Sales" subtitle="View the individual sales transactions imported from your POS.">
      {/* Data Warnings */}
      <DataWarningBanner
        locationId={selectedLocationId}
        filterTypes={["missing_recipes", "missing_sales", "missing_product_detail"]}
        className="mb-4"
      />

      {/* Selected period — date picker + prominent range banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 rounded-lg border border-border bg-secondary/40 px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold">{presetLabel}</span>
          <span className="text-muted-foreground">
            {isSingleDay
              ? format(parseISO(startDate), "EEE dd MMM yyyy")
              : `${format(parseISO(startDate), "dd MMM yyyy")} → ${format(parseISO(endDate), "dd MMM yyyy")}`}
          </span>
          {!isSingleDay && (
            <Badge variant="secondary" className="text-[10px]">
              {dailyData.length} days
            </Badge>
          )}
        </div>
        <DateRangeSelector />
      </div>

      {/* Summary Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <Euro className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Revenue</p>
              <p className="text-xl font-bold">{formatCurrency(summary.totalRevenue)}</p>
              <p className="text-[11px] text-muted-foreground">
                {summary.daysWithData} day{summary.daysWithData === 1 ? "" : "s"} with sales data
              </p>
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
              <p className="text-xl font-bold">
                {summary.totalOrders != null ? summary.totalOrders : "—"}
              </p>
              <p className="text-[11px] text-muted-foreground">From daily sales summaries</p>
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
              <p className="text-xl font-bold">
                {summary.aov != null ? formatCurrency(summary.aov) : "—"}
              </p>
              <p className="text-[11px] text-muted-foreground">Revenue ÷ known orders</p>
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

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading sales data…</div>
      ) : isSingleDay ? (
        /* ---------- Single day: detailed transactions straight away ---------- */
        daySales.length === 0 ? (
          singleDay?.hasSummary ? (
            <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
              Sales summary available. Product-level sales have not yet been imported for this day.
            </div>
          ) : (
            <EmptyState
              icon={ShoppingBag}
              title="No sales found for this day"
              description="There are no recorded sales on this date."
              suggestion="Try importing POS data, recording a manual sale, or expanding the date range."
            />
          )
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="divide-y divide-border overflow-x-auto">
              <div className="grid grid-cols-[90px_minmax(9rem,1fr)_minmax(9rem,1fr)_80px_110px_56px] gap-2 px-4 py-2 text-xs text-muted-foreground font-medium bg-muted/30">
                <span>Time</span>
                <span>Location</span>
                <span>Item</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Revenue</span>
                <span></span>
              </div>
              {daySales.map((sale) => (
                <div
                  key={sale.id}
                  className="grid grid-cols-[90px_minmax(9rem,1fr)_minmax(9rem,1fr)_80px_110px_56px] gap-2 px-4 py-2.5 items-center text-sm hover:bg-secondary/30 transition-colors"
                >
                  <span className="text-muted-foreground">
                    {new Date(sale.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="truncate">{sale.locations?.name || "—"}</span>
                  <span className="truncate">{sale.dishes?.name || "—"}</span>
                  <span className="text-right tabular-nums">{sale.quantity}</span>
                  <span className="text-right font-medium tabular-nums">
                    {formatCurrency(Number(sale.total_price))}
                  </span>
                  <span className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteSale.mutate(sale.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      ) : dailyData.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="No sales found for this period"
          description="There are no recorded sales in the selected date range."
          suggestion="Try importing POS data, recording a manual sale, or expanding the date range."
        />
      ) : (
        /* ---------- Range: one compact row per trading day ---------- */
        <div className="space-y-2">
          {[...dailyData]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((day) => (
              <SalesDayRow key={day.date} day={day} locationId={selectedLocationId} />
            ))}
        </div>
      )}
    </PageLayout>
  );
}
