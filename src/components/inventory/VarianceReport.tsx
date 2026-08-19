import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, TrendingDown, TrendingUp, CheckCircle } from "lucide-react";
import { useStockVariance } from "@/hooks/useStockAdjustments";
import { useLocation } from "@/contexts/LocationContext";

export function VarianceReport() {
  const { selectedLocationId } = useLocation();
  const { data: varianceItems = [], isLoading } = useStockVariance(selectedLocationId);

  // Calculate summary stats
  const totalNegativeVariance = varianceItems
    .filter((v) => v.variance < 0)
    .reduce((sum, v) => sum + Math.abs(v.variance), 0);

  const itemsWithVariance = varianceItems.length;
  const significantVariances = varianceItems.filter((v) => Math.abs(v.variance_percent) > 5).length;

  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">Loading variance report...</div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold">Stock Variance Report</h3>
      </div>

      <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
        Theoretical stock = last counted quantity + deliveries received − recipe consumption −
        adjustments/waste, all measured since the last count. It is compared against the counted
        (physical) figure, which imported sales never reduce. Record a fresh count to clear a variance.
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Items with Variance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{itemsWithVariance}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Significant (&gt;5%)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{significantVariances}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unexplained shortfall
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {totalNegativeVariance.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Variance Table */}
      {varianceItems.length === 0 ? (
        <div className="text-center py-8 border rounded-md bg-muted/30">
          <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
          <p className="text-muted-foreground">No stock movement since the last count</p>
          <p className="text-sm text-muted-foreground">
            Theoretical stock matches the counted figures
          </p>
        </div>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ingredient</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Counted</TableHead>
                <TableHead className="text-right">Counted qty</TableHead>
                <TableHead className="text-right">Deliveries</TableHead>
                <TableHead className="text-right">Consumption</TableHead>
                <TableHead className="text-right">Adjustments</TableHead>
                <TableHead className="text-right">Theoretical</TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {varianceItems.map((item) => {
                const isNegative = item.variance < 0;
                const isSignificant = Math.abs(item.variance_percent) > 5;

                return (
                  <TableRow key={`${item.ingredient_id}-${item.location_id}`}>
                    <TableCell className="font-medium">{item.ingredient_name}</TableCell>
                    <TableCell>{item.location_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(item.counted_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {item.counted_quantity.toFixed(2)} {item.unit}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {item.deliveries.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {item.consumption.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {item.adjustments.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {item.theoretical_quantity.toFixed(2)} {item.unit}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isNegative ? (
                          <TrendingDown className="h-4 w-4 text-red-500" />
                        ) : (
                          <TrendingUp className="h-4 w-4 text-green-500" />
                        )}
                        <span
                          className={`font-mono ${isNegative ? "text-red-600" : "text-green-600"}`}
                        >
                          {item.variance > 0 ? "+" : ""}
                          {item.variance.toFixed(2)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={isSignificant ? "destructive" : "secondary"}
                        className={
                          isSignificant
                            ? ""
                            : isNegative
                            ? "bg-amber-100 text-amber-800"
                            : "bg-green-100 text-green-800"
                        }
                      >
                        {item.variance_percent > 0 ? "+" : ""}
                        {item.variance_percent.toFixed(1)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
