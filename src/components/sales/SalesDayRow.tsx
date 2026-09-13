import { useState } from "react";
import { ChevronDown, ChevronRight, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { useSales } from "@/hooks/useSales";
import { reconcileGross, type CanonicalPosDay } from "@/lib/posDailyCanonical";
import type { DailyMetrics } from "@/hooks/useDailyBreakdown";
import { CaptivaXLSImportDialog } from "@/components/pos/CaptivaXLSImportDialog";

interface SalesDayRowProps {
  day: DailyMetrics;
  locationId: string | null;
}

/**
 * One trading day in the Sales range view.
 * Totals come from the canonical daily resolver (via useDailyBreakdown);
 * product rows are fetched lazily only when the day is expanded.
 */
/** Detailed product rows for one date — mounted only when the day is expanded. */
function SalesDayDetail({ date, locationId }: { date: string; locationId: string | null }) {
  const { data: sales = [], isLoading } = useSales(date, date, locationId);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading sales…</p>;

  return (
    <div className="divide-y divide-border rounded-md border border-border bg-background overflow-x-auto">
      <div className="grid grid-cols-[minmax(10rem,1fr)_minmax(8rem,1fr)_80px_110px] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/40">
        <span>Item</span>
        <span>Location</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Revenue</span>
      </div>
      {sales.map((sale) => (
        <div
          key={sale.id}
          className="grid grid-cols-[minmax(10rem,1fr)_minmax(8rem,1fr)_80px_110px] gap-2 px-3 py-2.5 items-center text-sm"
        >
          <span className="truncate">{sale.dishes?.name || "—"}</span>
          <span className="truncate text-muted-foreground">{sale.locations?.name || "—"}</span>
          <span className="text-right tabular-nums">{sale.quantity}</span>
          <span className="text-right font-medium tabular-nums">
            {formatCurrency(Number(sale.total_price))}
          </span>
        </div>
      ))}
    </div>
  );
}

export function SalesDayRow({ day, locationId }: SalesDayRowProps) {
  const [open, setOpen] = useState(false);

  const reconciliation = day.summary
    ? reconcileGross({
        productGross: day.summary.productGross,
        summaryGross: day.summary.summaryGross,
      } as CanonicalPosDay)
    : null;

  const detailLabel = day.hasProductDetail
    ? "Product detail available"
    : day.hasSummary
      ? "Summary only"
      : "No data";

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 min-h-[48px] text-left hover:bg-secondary/40 transition-colors"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}

        <span className="text-sm font-medium min-w-[9rem]">
          {format(parseISO(day.date), "EEE dd MMM yyyy")}
        </span>

        <span className="text-sm font-semibold tabular-nums min-w-[6rem]">
          {day.hasData ? formatCurrency(day.revenue) : "—"}
        </span>

        <span className="text-sm text-muted-foreground tabular-nums min-w-[5rem]">
          {day.orders != null ? `${day.orders} orders` : "— orders"}
        </span>

        <span className="flex flex-wrap items-center gap-2 ml-auto">
          <Badge
            variant={day.hasProductDetail ? "secondary" : day.hasSummary ? "outline" : "outline"}
            className={cn("text-[10px]", !day.hasData && "text-muted-foreground")}
          >
            {detailLabel}
          </Badge>

          {reconciliation && (
            <Badge
              variant="outline"
              className={cn(
                "text-[10px]",
                reconciliation.status === "matched" && "border-success/40 text-success",
                reconciliation.status === "small_variance" && "border-warning/40 text-warning",
                reconciliation.status === "needs_review" && "border-destructive/40 text-destructive"
              )}
            >
              {reconciliation.status === "matched"
                ? "Matched"
                : reconciliation.status === "small_variance"
                  ? "Small variance"
                  : "Needs review"}
            </Badge>
          )}

          <span className="text-xs text-muted-foreground">
            {open ? "Hide details" : "View details"}
          </span>
        </span>
      </button>

      {open && (
        <div className="border-t border-border bg-muted/20 px-4 py-3">
          {!day.hasProductDetail ? (
            day.hasSummary ? (
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span>
                  Sales summary available. Product-level sales have not yet been imported for this day.
                </span>
                <CaptivaXLSImportDialog
                  trigger={
                    <Button size="sm" variant="outline" className="h-9 gap-1 text-xs">
                      <Upload className="h-3.5 w-3.5" /> Import POS Data
                    </Button>
                  }
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No sales recorded for this day.</p>
            )
          ) : (
            <SalesDayDetail date={day.date} locationId={locationId} />
          )}
        </div>
      )}
    </div>
  );
}
