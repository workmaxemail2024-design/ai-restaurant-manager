import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calculator, Info } from "lucide-react";
import { useTheoreticalUsage } from "@/hooks/useTheoreticalUsage";
import { useLocation } from "@/contexts/LocationContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { formatCurrency } from "@/lib/currency";

/**
 * Theoretical usage = dish quantity sold × recipe quantity per one dish.
 * Recalculated on read from sales records; never written as a stock adjustment.
 */
export function TheoreticalUsageReport() {
  const { selectedLocationId } = useLocation();
  const { startDate, endDate, presetLabel } = useDateRange();
  const { data: rows = [], isLoading } = useTheoreticalUsage({
    locationId: selectedLocationId,
    startDate,
    endDate,
  });

  const totalCost = rows.reduce((s, r) => s + r.cost, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Calculator className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold">Theoretical Usage from Sales</h3>
        <span className="text-sm text-muted-foreground">({presetLabel})</span>
      </div>

      <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground flex gap-2">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          Calculated live from recorded POS sales and dish recipes (quantity sold × recipe quantity per
          one dish). This is not wastage and is not a stock adjustment — re-importing or re-syncing the
          same sales never double-deducts.
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ingredients Consumed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rows.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Theoretical Food Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalCost)}</div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading theoretical usage...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 border rounded-md bg-muted/30">
          <p className="text-muted-foreground">No theoretical usage for this period</p>
          <p className="text-sm text-muted-foreground">
            Sales must be mapped to dishes that have recipe ingredients configured.
          </p>
        </div>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ingredient</TableHead>
                <TableHead className="text-right">Dishes sold</TableHead>
                <TableHead className="text-right">Qty used</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.ingredient_id}>
                  <TableCell className="font-medium">{r.ingredient_name}</TableCell>
                  <TableCell className="text-right font-mono">{r.dishes_sold.toFixed(0)}</TableCell>
                  <TableCell className="text-right font-mono">
                    {r.quantity_used.toFixed(2)} {r.base_unit}
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(r.cost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
