import { format, parseISO } from "date-fns";
import { AlertTriangle, BadgeCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { PAYROLL_SCOPE_LABELS, type MonthFinancials } from "@/lib/monthlyFinancials";
import type { ReportsPeriodSummary } from "@/lib/reportsMonthly";

const pct = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)}%`);

/** Actual Labour Cost + overheads/expenses + operating profit for one month. */
export function MonthlyFinancialsBlock({ month, fin }: { month: ReportsPeriodSummary; fin: MonthFinancials }) {
  const { labour, expenses } = fin;
  const monthName = format(parseISO(`${fin.monthKey}-01`), "MMMM yyyy");
  const byCategory = new Map<string, { actual: number; estimate: number }>();
  for (const l of expenses.lines) {
    const c = byCategory.get(l.category) ?? { actual: 0, estimate: 0 };
    c[l.kind] += l.amount;
    byCategory.set(l.category, c);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card className={cn(labour.source === "confirmed" && "border-primary/50")}>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" />Actual Labour Cost</CardTitle>
          {labour.source === "confirmed"
            ? <Badge className="gap-1"><BadgeCheck className="h-3.5 w-3.5" />Accountant-confirmed</Badge>
            : <Badge variant="outline">Estimated from attendance</Badge>}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-1">
            <div>
              <p className="text-3xl font-bold">{labour.amount == null ? "Unknown" : formatCurrency(labour.amount)}</p>
              <p className="text-sm text-muted-foreground">{monthName}</p>
            </div>
            <div>
              <p className="text-2xl font-semibold">{pct(labour.pctOfSales)}</p>
              <p className="text-sm text-muted-foreground">of sales</p>
            </div>
          </div>
          {labour.source === "confirmed" && (
            <ul className="space-y-1 text-sm">
              {labour.payroll.map((p) => (
                <li key={p.id} className="flex flex-wrap justify-between gap-2">
                  <span>{PAYROLL_SCOPE_LABELS[p.scope]}{p.scope_note ? ` — ${p.scope_note}` : ""} · {p.source === "accountant_import" ? "accountant import" : "entered"}</span>
                  {labour.payroll.length > 1 && <span className="font-mono">{formatCurrency(p.amount)}</span>}
                </li>
              ))}
              {labour.estimatedAmount != null && (
                <li className="text-muted-foreground">Replaces the attendance estimate of {formatCurrency(labour.estimatedAmount)} (not added to it).</li>
              )}
            </ul>
          )}
          {labour.source === "partial" && (
            <p className="flex items-start gap-2 text-sm text-warning"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Confirmed payroll covers {labour.coveredLocations} of {labour.totalLocations} locations, so this view keeps the estimate. Select a single location to see its confirmed payroll.</p>
          )}
          {(labour.source === "estimate" || labour.source === "none") && (
            <p className="text-sm text-muted-foreground">No confirmed payroll for this month. Add it from Overheads → Import Expenses or Confirmed payroll.</p>
          )}
          {month.labourMissingDays > 0 && labour.source !== "confirmed" && (
            <p className="text-xs text-warning">{month.labourMissingDays} trading day{month.labourMissingDays === 1 ? "" : "s"} without labour data.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Overheads & operating profit</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-1.5">
            <Row label="Revenue" value={formatCurrency(month.revenue)} />
            <Row label={month.costing.isEstimated ? "Food cost (est.)" : "Food cost"} value={`− ${formatCurrency(month.costing.blendedCost)}`} />
            <Row label={labour.source === "confirmed" ? "Labour (confirmed payroll)" : "Labour (estimated)"} value={labour.amount == null ? "Unknown" : `− ${formatCurrency(labour.amount)}`} />
            {month.additionalExpenses > 0 && <Row label="Daily additional expenses" value={`− ${formatCurrency(month.additionalExpenses)}`} />}
            <Row label="Profit before overheads" value={formatCurrency(fin.profitBeforeOverheads)} strong />
            {expenses.recorded ? (
              <>
                {[...byCategory.entries()].map(([cat, v]) => (
                  <Row key={cat} label={`${cat}${v.actual > 0 && v.estimate > 0 ? " (actual + estimate)" : v.actual > 0 ? " (actual)" : " (estimate)"}`} value={`− ${formatCurrency(v.actual + v.estimate)}`} muted />
                ))}
                <Row label="Operating profit" value={formatCurrency(fin.operatingProfit ?? 0)} strong negative={(fin.operatingProfit ?? 0) < 0} />
                <Row label="Operating margin" value={pct(fin.operatingMarginPct)} />
              </>
            ) : (
              <p className="text-muted-foreground">Overheads not recorded for this month — operating profit unknown.</p>
            )}
          </div>
          {expenses.replacedEstimateIds.length > 0 && (
            <p className="text-xs text-muted-foreground">{expenses.replacedEstimateIds.length} recurring estimate{expenses.replacedEstimateIds.length === 1 ? " was" : "s were"} replaced by actual bills this month (counted once).</p>
          )}
          {fin.flags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {fin.flags.map((f) => <Badge key={f} variant="outline" className="text-[10px]">{f}</Badge>)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, strong, muted, negative }: { label: string; value: string; strong?: boolean; muted?: boolean; negative?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-3", strong && "border-t pt-1.5 font-semibold", muted && "text-muted-foreground")}>
      <span>{label}</span>
      <span className={cn("font-mono", negative && "text-destructive")}>{value}</span>
    </div>
  );
}
