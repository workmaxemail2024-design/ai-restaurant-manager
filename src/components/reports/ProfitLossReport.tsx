import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMonthlyProfitLoss } from "@/hooks/useFinancialReports";
import { formatCurrency } from "@/lib/currency";
import { Loader2, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProfitLossReport() {
  const { data: pnlData = [], isLoading, isError, error } = useMonthlyProfitLoss(6);
  const estimateMonths = pnlData.filter((r) => (r.estimateReasons?.length ?? 0) > 0);

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

  if (isError) {
    return (
      <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>Profit & Loss could not be loaded, so no figures are shown. {(error as Error)?.message}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {estimateMonths.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning" />
          <span>
            Estimate — profit is not complete for {estimateMonths.map((m) => m.month).join(", ")}:{" "}
            {[...new Set(estimateMonths.flatMap((m) => m.estimateReasons ?? []))].join("; ")}.
          </span>
        </div>
      )}
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totals.revenue)}</div>
            <p className="text-xs text-muted-foreground">Last 6 months · gross incl. VAT</p>
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Operating Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", totals.netProfit >= 0 ? "text-success" : "text-destructive")}>
              {formatCurrency(totals.netProfit)}
            </div>
            <p className="text-xs text-muted-foreground">{avgNetMargin.toFixed(1)}% margin · before daily expenses{estimateMonths.length > 0 ? " · Estimate" : ""}</p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Table */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Profit & Loss</CardTitle>
          <CardDescription>
            Breakdown by month for the last 6 months. Operating Profit = revenue − food cost − labour −
            overheads; ad-hoc daily expenses are not deducted here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pnlData.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No data available</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Revenue (gross)</TableHead>
                  <TableHead className="text-right">Food Cost</TableHead>
                  <TableHead className="text-right">Labour</TableHead>
                  <TableHead className="text-right">Overheads</TableHead>
                  <TableHead className="text-right">Gross Profit</TableHead>
                  <TableHead className="text-right">Operating Profit</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pnlData.map((row) => (
                  <TableRow key={row.month}>
                    <TableCell className="font-medium">{row.month}</TableCell>
                    <TableCell className="text-right">{row.revenueKnown === false ? <span className="text-muted-foreground">No sales</span> : formatCurrency(row.revenue)}</TableCell>
                    <TableCell className="text-right text-destructive">
                      {formatCurrency(row.foodCost)}
                      {(row.uncostedDishCount ?? 0) > 0 && (
                        <div className="text-[10px] text-muted-foreground">+ {row.uncostedDishCount} uncosted dish{row.uncostedDishCount === 1 ? "" : "es"} (unknown)</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-destructive">
                      {formatCurrency(row.labourCost)}
                      {(row.missingPayRateStaff ?? 0) > 0 && (
                        <div className="text-[10px] text-muted-foreground">{row.missingPayRateStaff} staff missing pay rate</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-destructive">{formatCurrency(row.overheads)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.grossProfit)}</TableCell>
                    <TableCell className={cn("text-right font-medium", row.netProfit >= 0 ? "text-success" : "text-destructive")}>
                      {formatCurrency(row.netProfit)}
                      {(row.estimateReasons?.length ?? 0) > 0 && (
                        <div className="text-[10px] font-normal text-muted-foreground" title={row.estimateReasons!.join("; ")}>Estimate</div>
                      )}
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
