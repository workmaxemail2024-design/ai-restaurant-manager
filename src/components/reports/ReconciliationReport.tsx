import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  XCircle,
  FileEdit,
  Clock,
} from "lucide-react";
import { useDailyBreakdown, type DailyMetrics } from "@/hooks/useDailyBreakdown";
import { useDailyLedger, type LedgerEntry, evaluateMissing } from "@/hooks/useDailyLedger";
import { useLocation } from "@/contexts/LocationContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { formatCurrency } from "@/lib/currency";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

const AVG_HOURLY_RATE = 12.5;

interface ReconRow {
  date: string;
  label: string;
  revenue: number;
  cogs: number;
  cogsPartial: boolean;
  labourCost: number;
  expenses: number;
  profit: number;
  profitPct: number;
  topDishes: { name: string; revenue: number }[];
  overrides: string[];
  missing: string[];
  isClosed: boolean;
}

function buildRow(
  day: DailyMetrics,
  ledger: LedgerEntry | undefined
): ReconRow {
  const isClosed = ledger?.is_closed ?? false;
  const revenue = day.hasData
    ? day.revenue
    : (ledger?.manual_revenue ?? 0);
  // COGS: use actual food cost from breakdown (estimated at 30% if recipes incomplete)
  const cogs = day.hasData ? day.foodCost : revenue * 0.3;
  const cogsPartial = day.hasData && day.foodCostPercent === 30; // heuristic: 30% is estimated
  const labourHours = ledger?.labour_hours ?? 0;
  const labourCost = labourHours * AVG_HOURLY_RATE;
  const expenses = ledger?.additional_expenses ?? 0;
  const profit = revenue - cogs - labourCost - expenses;
  const profitPct = revenue > 0 ? (profit / revenue) * 100 : 0;

  const topDishes = day.topDishes.slice(0, 3).map((d) => ({
    name: d.name,
    revenue: d.revenue,
  }));

  const overrides: string[] = [];
  if (isClosed) overrides.push("Closed day");
  if (!day.hasData && ledger?.manual_revenue != null)
    overrides.push("Manual sales override");
  if ((ledger?.labour_hours ?? 0) > 0)
    overrides.push("Manual labour entry");
  if ((ledger?.additional_expenses ?? 0) > 0)
    overrides.push("Extra expenses added");
  if (ledger?.covers_unknown) overrides.push("Covers marked unknown");

  const { missing } = evaluateMissing(day.hasData, ledger);
  const missingLabels = missing.map((m) =>
    m === "SALES" ? "Sales" : m === "LABOUR_HOURS" ? "Labour" : "Covers"
  );

  return {
    date: day.date,
    label: format(parseISO(day.date), "EEE dd MMM"),
    revenue,
    cogs,
    cogsPartial,
    labourCost,
    expenses,
    profit,
    profitPct,
    topDishes,
    overrides,
    missing: isClosed ? [] : missingLabels,
    isClosed,
  };
}

// ─── Waterfall line ───
function WaterfallLine({
  label,
  value,
  isSubtract,
  suffix,
}: {
  label: string;
  value: number;
  isSubtract?: boolean;
  suffix?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-muted-foreground flex items-center gap-1.5">
        {isSubtract && <span className="text-destructive">−</span>}
        {label}
        {suffix}
      </span>
      <span className={cn("font-medium", isSubtract && value > 0 && "text-destructive")}>
        {isSubtract ? `(${formatCurrency(value)})` : formatCurrency(value)}
      </span>
    </div>
  );
}

// ─── Per-day row ───
function ReconDayRow({ row }: { row: ReconRow }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="border-b border-border last:border-0">
        <CollapsibleTrigger asChild>
          <button className="w-full grid grid-cols-[1fr_repeat(5,minmax(0,1fr))] gap-2 items-center text-sm py-2.5 px-3 hover:bg-secondary/40 transition-colors text-left">
            <span className="flex items-center gap-1.5 font-medium">
              {open ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
              {row.label}
              {row.isClosed && (
                <Badge variant="outline" className="text-[9px] px-1 py-0">
                  Closed
                </Badge>
              )}
              {row.missing.length > 0 && (
                <AlertTriangle className="h-3 w-3 text-warning shrink-0" />
              )}
            </span>
            <span className="text-right">{formatCurrency(row.revenue)}</span>
            <span className="text-right text-destructive">
              ({formatCurrency(row.cogs)})
              {row.cogsPartial && <span className="text-[9px] ml-0.5">~</span>}
            </span>
            <span className="text-right text-destructive">
              ({formatCurrency(row.labourCost)})
            </span>
            <span className="text-right text-destructive">
              ({formatCurrency(row.expenses)})
            </span>
            <span
              className={cn(
                "text-right font-medium",
                row.profit >= 0 ? "text-success" : "text-destructive"
              )}
            >
              {formatCurrency(row.profit)}
              <span className="text-muted-foreground text-[10px] ml-1">
                {row.profitPct.toFixed(0)}%
              </span>
            </span>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 pb-3 pl-8 space-y-2">
            {/* Top revenue dishes */}
            {row.topDishes.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  Top Revenue Dishes
                </span>
                {row.topDishes.map((d, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="truncate mr-2">{d.name}</span>
                    <span className="shrink-0 font-medium">
                      {formatCurrency(d.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Overrides */}
            {row.overrides.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {row.overrides.map((o, i) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 gap-1"
                  >
                    <FileEdit className="h-2.5 w-2.5" />
                    {o}
                  </Badge>
                ))}
              </div>
            )}

            {/* Missing warnings */}
            {row.missing.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-warning">
                <AlertTriangle className="h-3 w-3" />
                Missing: {row.missing.join(", ")}
              </div>
            )}

            {row.topDishes.length === 0 &&
              row.overrides.length === 0 &&
              row.missing.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  No additional details.
                </span>
              )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// ─── Main ───
export function ReconciliationReport() {
  const { selectedLocationId } = useLocation();
  const { startDate, endDate } = useDateRange();
  const { data: dailyData, isLoading: dailyLoading } = useDailyBreakdown(
    startDate,
    endDate,
    selectedLocationId
  );
  const { entries: ledgerEntries, isLoading: ledgerLoading } = useDailyLedger(
    startDate,
    endDate,
    selectedLocationId
  );

  const isLoading = dailyLoading || ledgerLoading;

  const rows = useMemo(
    () =>
      (dailyData || []).map((day) =>
        buildRow(day, ledgerEntries.get(day.date))
      ),
    [dailyData, ledgerEntries]
  );

  const totals = useMemo(() => {
    const t = { revenue: 0, cogs: 0, labour: 0, expenses: 0, profit: 0, anyCogsPartial: false };
    for (const r of rows) {
      t.revenue += r.revenue;
      t.cogs += r.cogs;
      t.labour += r.labourCost;
      t.expenses += r.expenses;
      t.profit += r.profit;
      if (r.cogsPartial) t.anyCogsPartial = true;
    }
    return t;
  }, [rows]);

  const profitPct = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading reconciliation…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Period-level waterfall */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Period Reconciliation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0 divide-y divide-border">
          <WaterfallLine label="Revenue" value={totals.revenue} />
          <WaterfallLine
            label="COGS"
            value={totals.cogs}
            isSubtract
            suffix={
              totals.anyCogsPartial ? (
                <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1">
                  partial
                </Badge>
              ) : null
            }
          />
          <WaterfallLine label="Labour" value={totals.labour} isSubtract />
          <WaterfallLine label="Expenses" value={totals.expenses} isSubtract />
          <div className="flex items-center justify-between text-sm py-2 font-semibold">
            <span>Profit</span>
            <span className={cn(totals.profit >= 0 ? "text-success" : "text-destructive")}>
              {formatCurrency(totals.profit)}
              <span className="text-muted-foreground text-xs font-normal ml-1.5">
                ({profitPct.toFixed(1)}%)
              </span>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Per-day table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Daily Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Header */}
          <div className="grid grid-cols-[1fr_repeat(5,minmax(0,1fr))] gap-2 text-[10px] uppercase tracking-wide text-muted-foreground font-medium px-3 py-2 border-b border-border bg-muted/30">
            <span>Day</span>
            <span className="text-right">Revenue</span>
            <span className="text-right">COGS</span>
            <span className="text-right">Labour</span>
            <span className="text-right">Expenses</span>
            <span className="text-right">Profit</span>
          </div>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">No data in selected range.</p>
          ) : (
            rows.map((row) => <ReconDayRow key={row.date} row={row} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
