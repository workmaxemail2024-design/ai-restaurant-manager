import { AlertTriangle, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDailyFinancialSummary } from "@/hooks/useDailyFinancialSummary";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "cost" | "profit-positive" | "profit-negative";
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-lg font-semibold mt-1",
          tone === "cost" && "text-foreground/80",
          tone === "profit-positive" && "text-success",
          tone === "profit-negative" && "text-destructive"
        )}
      >
        {value}
      </p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

interface Props {
  startDate: string;
  endDate: string;
  locationId: string | null;
  periodLabel: string;
}

export function DailyFinancialSummary({ startDate, endDate, locationId, periodLabel }: Props) {
  const { data, isLoading } = useDailyFinancialSummary(startDate, endDate, locationId);

  if (isLoading || !data) {
    return (
      <Card className="mt-4">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <Skeleton className="h-4 w-40" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const profitTone = data.operatingProfit >= 0 ? "profit-positive" : "profit-negative";

  return (
    <Card className="mt-4">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Financial Summary · {periodLabel}</h3>
          </div>
          {data.isComplete ? (
            <Badge variant="outline" className="text-[11px]">
              Complete
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[11px]">
              Incomplete / estimated
            </Badge>
          )}
        </div>

        {/* Revenue block */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat
            label="Gross Sales / Revenue"
            value={formatCurrency(data.revenue)}
            sub={data.revenue > 0 ? undefined : "No sales recorded"}
          />
          <Stat
            label="Orders"
            value={data.orders != null ? String(data.orders) : "—"}
            sub={data.aov != null ? `AOV ${formatCurrency(data.aov)}` : "AOV —"}
          />
          <Stat label="Covers" value={data.covers != null ? String(data.covers) : "—"} />
          <Stat
            label="Labour Cost"
            value={data.labourCost > 0 ? formatCurrency(data.labourCost) : "—"}
            tone="cost"
            sub={[
              data.labourHours > 0 ? `${data.labourHours.toFixed(1)}h` : null,
              data.labourPct != null ? `${data.labourPct.toFixed(1)}% of revenue` : null,
              data.labourSource === "manual"
                ? "Manual hours"
                : data.labourSource === "attendance"
                  ? data.labourConfirmed
                    ? "Attendance confirmed"
                    : "Attendance not reviewed"
                  : "No labour data",
            ]
              .filter(Boolean)
              .join(" • ")}
          />
        </div>

        {/* Cost block */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <Stat
            label={data.foodCostIsEstimated ? "Estimated Food Cost" : "Cost of Goods / Food Cost"}
            value={formatCurrency(data.foodCost)}
            tone="cost"
            sub={[
              data.foodCostPct != null ? `${data.foodCostPct.toFixed(1)}% of revenue` : null,
              data.foodCostIsEstimated
                ? "Estimated — recipe data incomplete"
                : data.recipeCoveragePct != null
                  ? `${data.recipeCoveragePct.toFixed(0)}% recipe coverage`
                  : null,
            ]
              .filter(Boolean)
              .join(" • ")}
          />
          <Stat
            label="Supplier Purchases"
            value={data.purchaseOrderCount > 0 ? formatCurrency(data.purchases) : "—"}
            tone="cost"
            sub={
              data.purchaseOrderCount > 0
                ? `${data.purchaseOrderCount} received order${data.purchaseOrderCount > 1 ? "s" : ""} (not in profit)`
                : "No received purchase orders"
            }
          />
          <Stat
            label="Other Daily Expenses"
            value={formatCurrency(data.dailyExpenses)}
            tone="cost"
            sub={
              data.dailyExpenseCount > 0
                ? `${data.dailyExpenseCount} entr${data.dailyExpenseCount === 1 ? "y" : "ies"}`
                : "No detailed entries"
            }
          />
          <Stat
            label="Allocated Overheads"
            value={formatCurrency(data.overheads)}
            tone="cost"
            sub={data.hasOverheads ? "From Overheads system" : "No overheads configured"}
          />
        </div>

        {/* Profit */}
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Stat
            label="Estimated Operating Profit"
            value={formatCurrency(data.operatingProfit)}
            tone={profitTone}
            sub="Revenue − food cost − labour − expenses − overheads"
          />
          <Stat
            label="Operating Margin"
            value={
              data.operatingMarginPct != null ? `${data.operatingMarginPct.toFixed(1)}%` : "—"
            }
            tone={profitTone}
          />
        </div>

        {data.foodCostIsEstimated && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs text-foreground">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <span>
              Margin incomplete — food cost data missing. Showing an estimated food cost at 30% of
              revenue until recipes cover more sold items.
            </span>
          </div>
        )}

        {!data.isComplete && (
          <p className="mt-2 text-xs text-muted-foreground">
            Profit is indicative only. Outstanding: {data.missing.join(", ")}.
          </p>
        )}

        {data.unvaluedSupplierDocs > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {data.unvaluedSupplierDocs} supplier document
            {data.unvaluedSupplierDocs > 1 ? "s" : ""} not linked to a purchase order — excluded from
            costs to avoid double counting.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
