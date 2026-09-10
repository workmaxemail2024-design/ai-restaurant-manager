import { useEffect, useMemo, useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { DataTable } from "@/components/common/DataTable";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Package, ClipboardList, Calculator, Scale, AlertCircle, ClipboardCheck } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { useStockLevels, useUpdateStock, StockLevel } from "@/hooks/useStock";
import {
  useIngredients,
  itemTypeLabel,
  INVENTORY_ITEM_GROUPS,
  INVENTORY_CATEGORIES,
  groupLabel,
  categoryLabel,
} from "@/hooks/useIngredients";
import { useStockCounts } from "@/hooks/useStockCounts";
import { InventoryItemSelect } from "@/components/inventory/InventoryItemSelect";
import { useLocations } from "@/hooks/useLocations";
import { useLocation } from "@/contexts/LocationContext";
import { StockAdjustmentLog } from "@/components/inventory/StockAdjustmentLog";
import { TheoreticalUsageReport } from "@/components/inventory/TheoreticalUsageReport";
import { StockCountDialog } from "@/components/inventory/StockCountDialog";
import { VarianceReport } from "@/components/inventory/VarianceReport";
import { DataWarningBanner } from "@/components/common/DataWarningBanner";
import { getStockStatus } from "@/lib/inventoryStatus";
import { formatDistanceToNow } from "date-fns";

export default function StockPage() {
  const { selectedLocationId } = useLocation();
  const { data: stockLevels = [], isLoading } = useStockLevels(selectedLocationId);
  const { data: ingredients = [] } = useIngredients();
  const { data: locations = [] } = useLocations();
  const { data: stockCounts = [] } = useStockCounts(selectedLocationId);
  const updateStock = useUpdateStock();

  const [isOpen, setIsOpen] = useState(false);
  const [countOpen, setCountOpen] = useState(false);
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [formData, setFormData] = useState({ ingredient_id: "", location_id: "", quantity: 0 });

  const latestCountByIngredient = useMemo(() => {
    const map = new Map<string, { date: string; daysAgo: number }>();
    const now = new Date();
    for (const count of stockCounts) {
      if (count.status !== "submitted") continue;
      const countDate = new Date(count.count_date);
      const daysAgo = Math.floor((now.getTime() - countDate.getTime()) / (1000 * 60 * 60 * 24));
      for (const line of count.stock_count_lines || []) {
        const existing = map.get(line.ingredient_id);
        if (!existing || countDate > new Date(existing.date)) {
          map.set(line.ingredient_id, { date: count.count_date, daysAgo });
        }
      }
    }
    return map;
  }, [stockCounts]);

  const availableCategoryOptions = useMemo(
    () => INVENTORY_CATEGORIES.filter((c) => groupFilter === "all" || !c.group || c.group === groupFilter),
    [groupFilter]
  );

  const filteredStockLevels = useMemo(() => {
    return stockLevels.filter((item) => {
      const ingredient = ingredients.find((i) => i.id === item.ingredient_id);
      if (groupFilter !== "all" && ingredient?.item_group !== groupFilter) return false;
      if (categoryFilter !== "all" && ingredient?.category !== categoryFilter) return false;
      return true;
    });
  }, [stockLevels, ingredients, groupFilter, categoryFilter]);

  const columns = [
    { 
      key: "ingredients", 
      header: "Item",
      render: (item: StockLevel) => item.ingredients?.name || "-"
    },
    {
      key: "group",
      header: "Group",
      render: (item: StockLevel) => (
        <Badge variant="outline">{groupLabel(item.ingredients?.item_group)}</Badge>
      ),
    },
    { key: "category", header: "Category", render: (item: StockLevel) => categoryLabel(item.ingredients?.category) },
    {
      key: "item_type",
      header: "Type",
      render: (item: StockLevel) => (
        <Badge variant="secondary">{itemTypeLabel(item.ingredients?.item_type)}</Badge>
      ),
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
        // Low/Critical is only shown when a genuine reorder threshold is configured.
        const status = getStockStatus(Number(item.quantity), item.ingredients?.reorder_point);
        return (
          <div className="flex items-center gap-2">
            <span>{Number(item.quantity).toFixed(2)}</span>
            <span className="text-muted-foreground text-sm">{item.ingredients?.unit}</span>
            {status.state === "critical" && (
              <Badge variant="destructive" title={status.reason}>Critical</Badge>
            )}
            {status.state === "low" && (
              <Badge variant="outline" className="border-amber-500 text-amber-600" title={status.reason}>
                Low
              </Badge>
            )}
          </div>
        );
      }
    },
    {
      key: "last_counted",
      header: "Last Counted",
      render: (item: StockLevel) => {
        const counted = latestCountByIngredient.get(item.ingredient_id);
        if (!counted) return <span className="text-muted-foreground text-sm">Never</span>;
        const due = counted.daysAgo > 7;
        return (
          <div className="flex items-center gap-2">
            <span className="text-sm">{formatDistanceToNow(new Date(counted.date), { addSuffix: true })}</span>
            {due && (
              <Badge variant="destructive" className="text-xs">
                Count due
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: "reorder_point",
      header: "Reorder point",
      render: (item: StockLevel) =>
        item.ingredients?.reorder_point != null ? (
          <span className="font-mono text-sm">
            {Number(item.ingredients.reorder_point).toFixed(2)} {item.ingredients?.unit}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Not set</span>
        ),
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
    <PageLayout title="Inventory / Stock" subtitle="Track physical stock on hand, count sessions, adjustments and expected usage.">
      <DataWarningBanner locationId={selectedLocationId} filterTypes={["missing_recipes"]} className="mb-4" />
      <Tabs defaultValue="levels" className="space-y-4">
        <TabsList>
          <TabsTrigger value="levels" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Stock on Hand
          </TabsTrigger>
          <TabsTrigger value="adjustments" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Adjustments & Wastage
          </TabsTrigger>
          <TabsTrigger value="usage" className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Expected Usage
          </TabsTrigger>
          <TabsTrigger value="variance" className="flex items-center gap-2">
            <Scale className="h-4 w-4" />
            Variance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="levels" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="flex flex-col sm:flex-row gap-3">
              <Select value={groupFilter} onValueChange={(v) => setGroupFilter(v)}>
                <SelectTrigger className="w-full sm:w-[160px] min-h-[44px]">
                  <SelectValue placeholder="All groups" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All groups</SelectItem>
                  {INVENTORY_ITEM_GROUPS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v)}>
                <SelectTrigger className="w-full sm:w-[180px] min-h-[44px]">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {availableCategoryOptions.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setCountOpen(true)} variant="default" className="min-h-[44px]">
                <ClipboardCheck className="h-4 w-4 mr-2" /> Count Stock
              </Button>
              <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
                <DialogTrigger asChild>
                  <Button onClick={() => setIsOpen(true)} variant="outline" className="min-h-[44px]">
                    <Plus className="h-4 w-4 mr-2" /> Update Stock
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Update Stock Level</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <Label>Inventory item</Label>
                      <InventoryItemSelect
                        value={formData.ingredient_id || undefined}
                        onValueChange={(v) => setFormData({ ...formData, ingredient_id: v })}
                        placeholder="Select inventory item"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Includes recipe ingredients, direct-sale products and operational consumables.
                      </p>
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
          </div>

          <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            <strong>How stock works here:</strong> Stock on Hand is physical quantity in your kitchen or bar.
            Count Stock starts a real count session and updates physical quantities. Adjustments & Wastage
            records manual movements such as waste, spoilage or breakage. Expected Usage is the theoretical
            consumption calculated from POS sales and recipes — it does not change physical stock.
            Received deliveries increase Stock on Hand; sales do not.
          </div>

          <DataTable
            data={filteredStockLevels}
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

      <StockCountDialog open={countOpen} onOpenChange={setCountOpen} locationId={selectedLocationId} />
    </PageLayout>
  );
}