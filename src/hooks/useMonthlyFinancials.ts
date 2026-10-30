import { useMemo } from "react";
import { useLocation } from "@/contexts/LocationContext";
import { useLocations } from "@/hooks/useLocations";
import { useOverheads } from "@/hooks/useOverheads";
import { useActualExpenses, useActualPayroll } from "@/hooks/useExpenseImport";
import { buildMonthFinancials, type MonthFinancials, type OverheadLike } from "@/lib/monthlyFinancials";
import type { ReportsPeriodSummary } from "@/lib/reportsMonthly";

/**
 * Monthly labour/overheads/operating profit for the Monthly Reports view.
 * Inputs are the canonical month totals; confirmed payroll and actual bills are
 * read live (no snapshots), so later imports and corrections recalculate history.
 */
export function useMonthlyFinancials(year: number, months: ReportsPeriodSummary[]) {
  const { selectedLocationId } = useLocation();
  const { data: locations = [], isLoading: locLoading } = useLocations();
  const { data: overheads = [], isLoading: ohLoading } = useOverheads(selectedLocationId);
  const { data: actuals = [], isLoading: aeLoading } = useActualExpenses(`${year}-01-01`, `${year}-12-01`, selectedLocationId);
  const { data: payroll = [], isLoading: prLoading } = useActualPayroll(`${year}-01-01`, `${year}-12-01`, selectedLocationId);

  const map = useMemo(() => {
    const scopeLocationIds = selectedLocationId ? [selectedLocationId] : locations.map((l) => l.id);
    const out = new Map<string, MonthFinancials>();
    for (const m of months) {
      out.set(m.key, buildMonthFinancials({
        monthKey: m.key,
        revenue: m.revenue,
        foodCost: m.costing.blendedCost,
        foodCostEstimated: m.costing.isEstimated,
        additionalExpenses: m.additionalExpenses,
        estimatedLabour: m.totalLabourCost,
        hasEstimatedLabour: m.hasAnyLabour,
        selectedLocationId,
        scopeLocationIds,
        locationCount: locations.length,
        overheads: overheads as unknown as OverheadLike[],
        actuals,
        payroll,
      }));
    }
    return out;
  }, [months, locations, overheads, actuals, payroll, selectedLocationId]);

  return { financials: map, isLoading: locLoading || ohLoading || aeLoading || prLoading };
}
