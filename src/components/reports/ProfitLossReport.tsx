import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMonthlyProfitLoss } from "@/hooks/useFinancialReports";
import { formatCurrency } from "@/lib/currency";
import { Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProfitLossReport() {
  const { data: pnlData = [], isLoading } = useMonthlyProfitLoss(6);

  // Calculate totals
  const totals = pnlData.reduce(
    (acc, row) => ({
      revenue: acc.revenue + row.revenue,
      foodCost: acc.foodCost + row.foodCost,
      labourCost: acc.labourCost + row.labourCost,
      overheads: acc.overheads + row.overheads,
      grossProfit: acc.grossProfit + row.grossProfit,
      netProfit: acc.netProfit + row.netProfit,
    }),
    { revenue: 0, foodCost: 0, labourCost: 0, overheads: 0, grossProfit: 0, netProfit: 0 }
  );

  const avgGrossMargin = totals.revenue > 0 ? (totals.grossProfit / totals.revenue) * 100 : 0;
  const avgNetMargin = totals.revenue > 0 ? (totals.netProfit / totals.revenue) * 100 : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totals.revenue)}</div>
            <p className="text-xs text-muted-foreground">Last 6 months</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Gross Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totals.grossProfit)}</div>
            <p className="text-xs text-muted-foreground">{avgGrossMargin.toFixed(1)}% margin</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {formatCurrency(totals.foodCost + totals.labourCost + totals.overheads)}
            </div>
            <p className="text-xs text-muted-foreground">Food + Labour + Overheads</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", totals.netProfit >= 0 ? "text-success" : "text-destructive")}>
              {formatCurrency(totals.netProfit)}
            </div>
            <p className="text-xs text-muted-foreground">{avgNetMargin.toFixed(1)}% margin</p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Table */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Profit & Loss</CardTitle>
          <CardDescription>Breakdown by month for the last 6 months</CardDescription>
        </CardHeader>
        <CardContent>
          {pnlData.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No data available</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Food Cost</TableHead>
                  <TableHead className="text-right">Labour</TableHead>
                  <TableHead className="text-right">Overheads</TableHead>
                  <TableHead className="text-right">Gross Profit</TableHead>
                  <TableHead className="text-right">Net Profit</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pnlData.map((row) => (
                  <TableRow key={row.month}>
                    <TableCell className="font-medium">{row.month}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                    <TableCell className="text-right text-destructive">{formatCurrency(row.foodCost)}</TableCell>
                    <TableCell className="text-right text-destructive">{formatCurrency(row.labourCost)}</TableCell>
                    <TableCell className="text-right text-destructive">{formatCurrency(row.overheads)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.grossProfit)}</TableCell>
                    <TableCell className={cn("text-right font-medium", row.netProfit >= 0 ? "text-success" : "text-destructive")}>
                      {formatCurrency(row.netProfit)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {row.netMargin >= 0 ? (
                          <TrendingUp className="h-3 w-3 text-success" />
                        ) : (
                          <TrendingDown className="h-3 w-3 text-destructive" />
                        )}
                        <span className={row.netMargin >= 0 ? "text-success" : "text-destructive"}>
                          {row.netMargin.toFixed(1)}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {/* Totals Row */}
                <TableRow className="bg-muted/50 font-medium">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{formatCurrency(totals.revenue)}</TableCell>
                  <TableCell className="text-right text-destructive">{formatCurrency(totals.foodCost)}</TableCell>
                  <TableCell className="text-right text-destructive">{formatCurrency(totals.labourCost)}</TableCell>
                  <TableCell className="text-right text-destructive">{formatCurrency(totals.overheads)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totals.grossProfit)}</TableCell>
                  <TableCell className={cn("text-right", totals.netProfit >= 0 ? "text-success" : "text-destructive")}>
                    {formatCurrency(totals.netProfit)}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={avgNetMargin >= 0 ? "text-success" : "text-destructive"}>
                      {avgNetMargin.toFixed(1)}%
                    </span>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
