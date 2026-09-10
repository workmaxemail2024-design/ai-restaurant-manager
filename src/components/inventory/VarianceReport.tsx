import { useMemo } from "react";
import { DataTable } from "@/components/common/DataTable";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useInventoryForecast } from "@/hooks/useInventoryForecast";
import { useStockCounts } from "@/hooks/useStockCounts";
import { useLocation } from "@/contexts/LocationContext";
import { groupLabel, categoryLabel } from "@/hooks/useIngredients";
import { formatDistanceToNow } from "date-fns";

interface VarianceRow {
  id: string;
  name: string;
  group: string | null;
  category: string | null;
  unit: string;
  physicalStock: number;
  expectedUsage: number;
  variance: number;
  lastCounted: { date: string; daysAgo: number } | null;
}

export function VarianceReport() {
  const { selectedLocationId } = useLocation();
  const { data: forecast, isLoading: forecastLoading } = useInventoryForecast(selectedLocationId);
  const { data: counts = [], isLoading: countsLoading } = useStockCounts(selectedLocationId);

  const latestCountByIngredient = useMemo(() => {
    const map = new Map<string, { date: string; daysAgo: number }>();
    const now = new Date();
    for (const count of counts) {
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
  }, [counts]);

  const rows: VarianceRow[] = useMemo(() => {
    return (forecast?.rows || []).map((f) => ({
      id: f.id,
      name: f.name,
      group: f.itemGroup,
      category: f.category,
      unit: f.unit,
      physicalStock: f.currentStock,
      expectedUsage: f.usageInWindow,
      variance: f.currentStock - f.usageInWindow,
      lastCounted: latestCountByIngredient.get(f.id) || null,
    }));
  }, [forecast, latestCountByIngredient]);

  const isLoading = forecastLoading || countsLoading;

  const columns = [
    { key: "name", header: "Item", render: (row: VarianceRow) => row.name },
    { key: "group", header: "Group", render: (row: VarianceRow) => <Badge variant="outline">{groupLabel(row.group)}</Badge> },
    { key: "category", header: "Category", render: (row: VarianceRow) => categoryLabel(row.category) },
    {
      key: "physical",
      header: "Stock on Hand",
      render: (row: VarianceRow) => `${row.physicalStock.toFixed(2)} ${row.unit}`,
    },
    {
      key: "usage",
      header: "Expected Usage (30d)",
      render: (row: VarianceRow) => `${row.expectedUsage.toFixed(2)} ${row.unit}`,
    },
    {
      key: "variance",
      header: "Variance",
      render: (row: VarianceRow) => {
        const v = row.variance;
        if (Math.abs(v) < 0.001) return <span className="text-muted-foreground">0.00 {row.unit}</span>;
        const label = v > 0 ? `+${v.toFixed(2)} ${row.unit}` : `${v.toFixed(2)} ${row.unit}`;
        return (
          <Badge variant={v > 0 ? "default" : "destructive"}>
            {label}
          </Badge>
        );
      },
    },
    {
      key: "last_counted",
      header: "Last Counted",
      render: (row: VarianceRow) => {
        if (!row.lastCounted) return <span className="text-muted-foreground text-sm">Never</span>;
        const due = row.lastCounted.daysAgo > 7;
        return (
          <div className="flex items-center gap-2">
            <span className="text-sm">{formatDistanceToNow(new Date(row.lastCounted.date), { addSuffix: true })}</span>
            {due && <Badge variant="destructive" className="text-xs">Count due</Badge>}
          </div>
        );
      },
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-64" />
        <div className="rounded-md border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-4 border-b">
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
        This read-only view compares <strong>Stock on Hand</strong> (physical count) against
        <strong> Expected Usage</strong> calculated from POS sales and recipes over the last 30 days.
        A positive variance means more stock than expected; a negative variance means usage exceeded
        the physical count. Receipts and wastage are already reflected in the current physical stock.
      </div>

      <DataTable data={rows} columns={columns} isLoading={false} />
    </div>
  );
}
