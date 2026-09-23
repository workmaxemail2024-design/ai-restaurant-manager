import { useMemo, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeft, CalendarDays, CheckCircle2, Clock, Receipt, TrendingUp, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatCurrencyShort } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { ReportsPeriodSummary } from "@/lib/reportsMonthly";

interface MonthlyReportsViewProps {
  year: number;
  years: number[];
  onYearChange: (year: number) => void;
  months: ReportsPeriodSummary[];
  weeksFor: (month: ReportsPeriodSummary) => ReportsPeriodSummary[];
  isLoading: boolean;
  renderDailyRows: (month: ReportsPeriodSummary) => ReactNode;
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card>
      <CardHeader className="px-3 pb-1 pt-3">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="text-xl font-bold">{value}</div>
        {note && <p className="mt-1 text-[10px] text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  );
}

function statusText(month: ReportsPeriodSummary) {
  if (month.relevantDays === 0) return "No recorded days";
  if (month.needsAttentionDays > 0) return `${month.needsAttentionDays} day${month.needsAttentionDays === 1 ? "" : "s"} need attention`;
  if (month.completenessPct === 100) return "Complete";
  return `${Math.round(month.completenessPct ?? 0)}% complete`;
}

export function MonthlyReportsView({
  year,
  years,
  onYearChange,
  months,
  weeksFor,
  isLoading,
  renderDailyRows,
}: MonthlyReportsViewProps) {
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const selectedMonth = months.find((month) => month.key === selectedMonthKey) ?? null;
  const weeks = useMemo(() => selectedMonth ? weeksFor(selectedMonth) : [], [selectedMonth, weeksFor]);

  const changeYear = (nextYear: number) => {
    setSelectedMonthKey(null);
    onYearChange(nextYear);
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading monthly reports…</p>;

  if (!selectedMonth) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{year} monthly overview</h2>
            <p className="text-sm text-muted-foreground">Canonical Reports totals by calendar month.</p>
          </div>
          <Select value={String(year)} onValueChange={(value) => changeYear(Number(value))}>
            <SelectTrigger className="h-11 w-32" aria-label="Reporting year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((availableYear) => (
                <SelectItem key={availableYear} value={String(availableYear)}>{availableYear}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {months.map((month) => {
            const future = month.key > currentMonthKey;
            const inProgress = month.key === currentMonthKey;
            const profitEstimated = month.costing.isEstimated || month.labourMissingDays > 0;
            return (
              <Card key={month.key} className={cn("overflow-hidden", future && "bg-muted/30 opacity-60")}>
                <CardHeader className="flex-row items-center justify-between space-y-0 px-4 pb-2 pt-4">
                  <div>
                    <CardTitle className="text-base">{month.label}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">{month.tradingDays} trading day{month.tradingDays === 1 ? "" : "s"}</p>
                  </div>
                  {inProgress && <Badge variant="secondary">In progress</Badge>}
                  {future && <Badge variant="outline">Upcoming</Badge>}
                </CardHeader>
                <CardContent className="space-y-3 px-4 pb-4">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div><p className="text-xs text-muted-foreground">Revenue</p><p className="font-semibold">{future ? "—" : formatCurrency(month.revenue)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Orders · Covers</p><p className="font-semibold">{future ? "—" : `${month.orders ?? "—"} · ${month.visitors ?? "—"}`}</p></div>
                    <div><p className="text-xs text-muted-foreground">Food cost</p><p className="font-semibold">{future ? "—" : `${formatCurrency(month.costing.blendedCost)} · ${month.costing.foodCostPct?.toFixed(1) ?? "—"}%`}</p></div>
                    <div><p className="text-xs text-muted-foreground">Labour</p><p className="font-semibold">{future || !month.hasAnyLabour ? "—" : `${formatCurrency(month.totalLabourCost)} · ${month.labourPct?.toFixed(1) ?? "—"}%`}</p></div>
                    <div><p className="text-xs text-muted-foreground">Profit</p><p className={cn("font-semibold", !future && month.profit < 0 && "text-destructive")}>{future ? "—" : formatCurrency(month.profit)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Completeness</p><p className="font-semibold">{future ? "—" : statusText(month)}</p></div>
                  </div>

                  {!future && (
                    <div className="flex flex-wrap gap-1.5">
                      {month.costing.qualityLabel && <Badge variant="outline" className="text-[10px]">{month.costing.qualityLabel}</Badge>}
                      {month.labourMissingDays > 0 && <Badge variant="outline" className="text-[10px] text-warning">Labour missing · {month.labourMissingDays} day{month.labourMissingDays === 1 ? "" : "s"}</Badge>}
                      {profitEstimated && month.revenue > 0 && <Badge variant="secondary" className="text-[10px]">Profit estimated</Badge>}
                    </div>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full"
                    disabled={future}
                    onClick={() => setSelectedMonthKey(month.key)}
                  >
                    View month
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  const profitEstimated = selectedMonth.costing.isEstimated || selectedMonth.labourMissingDays > 0;
  const trend = selectedMonth.dailyRevenue.map((day) => ({
    date: format(new Date(`${day.date}T00:00:00`), "d MMM"),
    revenue: day.revenue,
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="icon" className="h-11 w-11" onClick={() => setSelectedMonthKey(null)} aria-label="Back to months">
            <ArrowLeft />
          </Button>
          <div>
            <h2 className="text-lg font-semibold">{selectedMonth.label} {year}</h2>
            <p className="text-sm text-muted-foreground">Monthly recap · {selectedMonth.tradingDays} trading days</p>
          </div>
        </div>
        <Button type="button" variant="ghost" className="h-11" onClick={() => setSelectedMonthKey(null)}>Back to months</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Metric label="Revenue" value={formatCurrency(selectedMonth.revenue)} />
        <Metric label="Orders" value={selectedMonth.orders?.toLocaleString() ?? "—"} note="receipts" />
        <Metric label="Covers" value={selectedMonth.visitors?.toLocaleString() ?? "—"} />
        <Metric label={selectedMonth.costing.isEstimated ? "Food Cost (est.)" : "Food Cost"} value={formatCurrency(selectedMonth.costing.blendedCost)} note={`${selectedMonth.costing.foodCostPct?.toFixed(1) ?? "—"}% · ${selectedMonth.costing.qualityLabel ?? "unknown"}`} />
        <Metric label="Labour" value={selectedMonth.hasAnyLabour ? formatCurrency(selectedMonth.totalLabourCost) : "—"} note={selectedMonth.labourMissingDays > 0 ? `${selectedMonth.labourMissingDays} trading day${selectedMonth.labourMissingDays === 1 ? "" : "s"} missing` : selectedMonth.hasAnyLabour ? `${selectedMonth.labourPct?.toFixed(1) ?? "—"}% of revenue` : "Labour unknown"} />
        <Metric label={profitEstimated ? "Est. Profit" : "Profit"} value={formatCurrency(selectedMonth.profit)} note={profitEstimated ? "Incomplete inputs" : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Daily revenue trend</CardTitle></CardHeader>
          <CardContent className="h-64 px-2 pb-3 sm:px-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="monthlyRevenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} minTickGap={24} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} width={56} tickFormatter={formatCurrencyShort} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <Tooltip formatter={(value: number) => [formatCurrency(value), "Revenue"]} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6 }} />
                <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#monthlyRevenueFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Data coverage</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-success" />Accounted days</span><strong>{selectedMonth.accountedDays} / {selectedMonth.relevantDays}</strong></div>
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-muted-foreground"><Clock className="h-4 w-4 text-warning" />Need attention</span><strong>{selectedMonth.needsAttentionDays}</strong></div>
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-muted-foreground"><Receipt className="h-4 w-4" />Products Sold</span><strong>{selectedMonth.productDays} days</strong></div>
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-muted-foreground"><CalendarDays className="h-4 w-4" />Sales Summary</span><strong>{selectedMonth.summaryDays} days</strong></div>
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-muted-foreground"><TrendingUp className="h-4 w-4" />Both reports</span><strong>{selectedMonth.bothDays} days</strong></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Calendar-week recap</CardTitle></CardHeader>
        <CardContent className="px-0 pb-2 sm:px-3">
          <Table>
            <TableHeader><TableRow><TableHead>Week</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Covers</TableHead><TableHead className="text-right">Food cost</TableHead><TableHead className="text-right">Labour</TableHead><TableHead className="text-right">Profit</TableHead></TableRow></TableHeader>
            <TableBody>
              {weeks.map((week) => (
                <TableRow key={week.key}>
                  <TableCell className="whitespace-nowrap font-medium">{week.label}</TableCell>
                  <TableCell className="text-right">{formatCurrency(week.revenue)}</TableCell>
                  <TableCell className="text-right">{week.orders ?? "—"}</TableCell>
                  <TableCell className="text-right">{week.visitors ?? "—"}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatCurrency(week.costing.blendedCost)} <span className="text-muted-foreground">· {week.costing.foodCostPct?.toFixed(1) ?? "—"}%</span></TableCell>
                  <TableCell className="text-right whitespace-nowrap">{week.hasAnyLabour ? formatCurrency(week.totalLabourCost) : "—"}</TableCell>
                  <TableCell className={cn("text-right font-medium", week.profit < 0 && "text-destructive")}>{formatCurrency(week.profit)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h3 className="text-sm font-medium uppercase text-muted-foreground">Daily Performance</h3>
        {renderDailyRows(selectedMonth)}
      </div>
    </div>
  );
}