import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMonthlyProfitLoss, useReceivedGrossByMonth } from "@/hooks/useFinancialReports";
import { usePersistentState } from "@/hooks/usePersistentState";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import { Loader2, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProfitLossReport() {
  const { currentRestaurant } = useRestaurant();
  const [range, setRange] = usePersistentState<"ytd" | 6>(`reports:pnl-range:${currentRestaurant?.id ?? "none"}`, "ytd");
  const { data: pnlData = [], isLoading, isError, error } = useMonthlyProfitLoss(range);
  const received = useReceivedGrossByMonth(range);
  const receivedByMonth = new Map((received.data ?? []).map((r) => [r.month, r]));
  const rangeLabel = range === "ytd" ? "Year to date" : "Last 6 months";
  const postedMonths = pnlData.filter((r) => r.revenueKnown !== false).length;
  const hasPosted = postedMonths > 0;
  const receivedTotal = (received.data ?? []).reduce<number | null>((a, r) => (r.gross == null ? a : (a ?? 0) + r.gross), null);
  const receivedCovered = (received.data ?? []).reduce((a, r) => a + r.coveredDays, 0);
  const receivedExpected = (received.data ?? []).reduce((a, r) => a + r.expectedDays, 0);
  const pct = (v: number) => `${v.toFixed(1)}%`;
  const receivedCell = (key?: string) => {
    if (received.isError) return <span className="text-muted-foreground">Unavailable</span>;
    if (received.isLoading) return <span className="text-muted-foreground">…</span>;
    const r = key ? receivedByMonth.get(key) : undefined;
    if (!r || r.gross == null) return <span className="text-muted-foreground">Not received</span>;
    return <>{formatCurrency(r.gross)}<div className="text-[10px] text-muted-foreground">{r.coveredDays}/{r.expectedDays} days{r.partial ? " · partial" : ""}</div></>;
  };
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
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="h-10" variant={range === "ytd" ? "default" : "outline"} onClick={() => setRange("ytd")}>Year to date</Button>
        <Button size="sm" className="h-10" variant={range === 6 ? "default" : "outline"} onClick={() => setRange(6)}>Last 6 months</Button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Captiva gross received</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{received.isError ? "Unavailable" : received.isLoading ? "…" : receivedTotal == null ? "Not received" : formatCurrency(receivedTotal)}</div>
            <p className="text-xs text-muted-foreground">{rangeLabel} · official till takings · {receivedCovered}/{receivedExpected} restaurant-days{receivedCovered < receivedExpected ? " · partial" : ""} · not posted to P&L</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Posted P&L revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hasPosted ? formatCurrency(totals.revenue) : "No revenue posted"}</div>
            <p className="text-xs text-muted-foreground">{rangeLabel} · applied sales, gross incl. VAT · {postedMonths}/{pnlData.length} months with posted sales</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Gross profit (posted)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hasPosted ? formatCurrency(totals.grossProfit) : "—"}</div>
            <p className="text-xs text-muted-foreground">{hasPosted ? `${pct(avgGrossMargin)} margin on posted revenue${estimateMonths.length ? " · Estimate" : ""}` : "No revenue posted"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recorded expenses</CardTitle>
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Operating profit (posted)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", !hasPosted ? "" : totals.netProfit >= 0 ? "text-success" : "text-destructive")}>
              {hasPosted ? formatCurrency(totals.netProfit) : "—"}
            </div>
            <p className="text-xs text-muted-foreground">{hasPosted ? `${pct(avgNetMargin)} margin on posted revenue · before daily expenses${estimateMonths.length > 0 ? " · Estimate" : ""}` : "No revenue posted — profit not shown"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Table */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Profit & Loss</CardTitle>
          <CardDescription>
            {rangeLabel}, by month. Captiva gross received is the official till total from your Captiva backend and is shown for comparison only — it is never added to posted revenue. Profit uses posted revenue only: Operating Profit = posted revenue − food cost − labour − overheads; ad-hoc daily expenses are not deducted here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pnlData.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No data available</p>
          ) : (
            <div className="overflow-x-auto"><Table className="min-w-[860px] text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Captiva gross received</TableHead>
                  <TableHead className="text-right">Posted revenue</TableHead>
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
                    <TableCell className="text-right">{receivedCell(row.monthKey)}</TableCell>
                    <TableCell className="text-right">{row.revenueKnown === false ? <span className="text-muted-foreground">No revenue posted</span> : formatCurrency(row.revenue)}</TableCell>
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
                    <TableCell className="text-right">{row.revenueKnown === false ? "—" : formatCurrency(row.grossProfit)}</TableCell>
                    <TableCell className={cn("text-right font-medium", row.revenueKnown === false ? "text-muted-foreground" : row.netProfit >= 0 ? "text-success" : "text-destructive")}>
                      {row.revenueKnown === false ? "—" : formatCurrency(row.netProfit)}
                      {(row.estimateReasons?.length ?? 0) > 0 && (
                        <div className="text-[10px] font-normal text-muted-foreground" title={row.estimateReasons!.join("; ")}>Estimate</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.revenueKnown === false ? <span className="text-muted-foreground">—</span> : <div className="flex items-center justify-end gap-1">
                        {row.netMargin >= 0 ? (
                          <TrendingUp className="h-3 w-3 text-success" />
                        ) : (
                          <TrendingDown className="h-3 w-3 text-destructive" />
                        )}
                        <span className={row.netMargin >= 0 ? "text-success" : "text-destructive"}>
                          {row.netMargin.toFixed(1)}%
                        </span>
                      </div>}
                    </TableCell>
                  </TableRow>
                ))}
                {/* Totals Row */}
                <TableRow className="bg-muted/50 font-medium">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{received.isError ? "Unavailable" : receivedTotal == null ? "Not received" : formatCurrency(receivedTotal)}</TableCell>
                  <TableCell className="text-right">{hasPosted ? formatCurrency(totals.revenue) : "No revenue posted"}</TableCell>
                  <TableCell className="text-right text-destructive">{formatCurrency(totals.foodCost)}</TableCell>
                  <TableCell className="text-right text-destructive">{formatCurrency(totals.labourCost)}</TableCell>
                  <TableCell className="text-right text-destructive">{formatCurrency(totals.overheads)}</TableCell>
                  <TableCell className="text-right">{hasPosted ? formatCurrency(totals.grossProfit) : "—"}</TableCell>
                  <TableCell className={cn("text-right", !hasPosted ? "" : totals.netProfit >= 0 ? "text-success" : "text-destructive")}>
                    {hasPosted ? formatCurrency(totals.netProfit) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {hasPosted ? <span className={avgNetMargin >= 0 ? "text-success" : "text-destructive"}>
                      {avgNetMargin.toFixed(1)}%
                    </span> : "—"}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table></div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
