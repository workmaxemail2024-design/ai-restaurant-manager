import { useState } from "react";
import { ChevronDown, ChevronRight, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { FoodCostView } from "@/lib/foodCosting";

interface Props {
  view: FoodCostView;
  /** Opens the missing-cost item list. */
  onViewMissing?: () => void;
  className?: string;
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium tabular-nums", muted && "text-muted-foreground")}>{value}</span>
    </div>
  );
}

/**
 * Food Cost figure plus an honest, compact statement of its quality.
 * Detail is collapsed by default to keep Reports clean.
 */
export function FoodCostBlock({ view, onViewMissing, className }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("space-y-1", className)}>
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
        Food Cost
      </div>
      <div className="text-base font-semibold tabular-nums">
        {formatCurrency(view.blendedCost)}
        <span className="text-muted-foreground font-normal">
          {" · "}
          {view.foodCostPct != null ? `${view.foodCostPct.toFixed(1)}%` : "—"}
        </span>
      </div>
      {view.qualityLabel && (
        <div className={cn("text-[11px]", view.isEstimated ? "text-warning" : "text-muted-foreground")}>
          {view.qualityLabel}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground min-h-[44px] sm:min-h-0 sm:py-1"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Costing details
      </button>

      {open && (
        <div className="rounded-md border border-border/60 bg-muted/30 p-2.5 space-y-1 text-[11px]">
          <Row label="Historical cost" value={formatCurrency(view.historicalCost)} />
          <Row label="Fallback cost (current baseline)" value={formatCurrency(view.fallbackCost)} />
          <Row
            label={`Estimated / un-costed (30%)`}
            value={formatCurrency(view.estimatedCost)}
            muted={view.estimatedCost === 0}
          />
          <div className="border-t border-border/60 my-1" />
          <Row label="Historically priced revenue" value={formatCurrency(view.historicalRevenue)} />
          <Row label="Fallback-priced revenue" value={formatCurrency(view.fallbackRevenue)} />
          <Row label="Uncosted revenue" value={formatCurrency(view.uncostedRevenue)} />
          <div className="border-t border-border/60 my-1" />
          <Row label="Recipe coverage" value={`${view.recipeCoveragePct.toFixed(1)}%`} />
          <Row label="Historical pricing coverage" value={`${view.historicalCoveragePct.toFixed(1)}%`} />
          <Row label="Costed quantity" value={String(Math.round(view.costedQuantity))} />
          <Row label="Uncosted quantity" value={String(Math.round(view.uncostedQuantity))} />
          <Row label="Items missing cost" value={String(view.missingCostDishes)} />
          {onViewMissing && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full mt-1 h-9"
              onClick={onViewMissing}
            >
              <ListChecks className="h-3.5 w-3.5 mr-1.5" /> View missing costs
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
