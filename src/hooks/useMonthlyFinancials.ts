import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { isSalariedStaffRow } from "@/hooks/useLabourCost";
import { salaryDailyCost } from "@/lib/labour";
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

  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;
  // All Locations only: each location's own attendance + salary estimate per month, so a
  // location without confirmed payroll uses ITS estimate while others keep confirmed payroll.
  const { data: perLocEstimates, isLoading: estLoading } = useQuery({
    queryKey: ["monthly-labour-estimates-by-location", restaurantId, "all", `${year}-01-01`, `${year}-12-31`],
    enabled: !!restaurantId && !selectedLocationId,
    queryFn: () => fetchLocationLabourEstimates(restaurantId!, year),
  });

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
        estimatedLabourByLocation: selectedLocationId ? undefined : perLocEstimates?.get(m.key),
      }));
    }
    return out;
  }, [months, locations, overheads, actuals, payroll, selectedLocationId, perLocEstimates]);

  return { financials: map, isLoading: locLoading || ohLoading || aeLoading || prLoading || (!selectedLocationId && estLoading) };
}

/**
 * month key → location id → estimated labour (hourly attendance + salaried daily share).
 * A location with neither attendance nor salaried staff in a month is left out (= Unknown).
 * Manual ledger hours are not location-split here, so such locations read as Unknown, never €0.
 */
async function fetchLocationLabourEstimates(restaurantId: string, year: number) {
  const out = new Map<string, Record<string, number>>();
  const add = (month: string, loc: string, v: number) => {
    const m = out.get(month) ?? {};
    m[loc] = (m[loc] ?? 0) + v;
    out.set(month, m);
  };
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("staff_attendance")
      .select("clock_in, clock_out, location_id, staff(hourly_rate, pay_type)")
      .eq("restaurant_id", restaurantId)
      .gte("clock_in", `${year}-01-01T00:00:00`)
      .lte("clock_in", `${year}-12-31T23:59:59`)
      .not("clock_out", "is", null)
      .order("clock_in")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    for (const r of data ?? []) {
      if (!r.clock_in || !r.clock_out || !r.location_id || isSalariedStaffRow(r.staff)) continue;
      const hours = (new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime()) / 3_600_000;
      add(r.clock_in.slice(0, 7), r.location_id, hours * (Number((r.staff as any)?.hourly_rate) || 0));
    }
    if (!data || data.length < pageSize) break;
  }
  const { data: salaried, error } = await supabase
    .from("staff_safe")
    .select("annual_salary, location_id")
    .eq("pay_type", "salary")
    .eq("status", "active");
  if (error) throw error;
  for (let mo = 1; mo <= 12; mo++) {
    const key = `${year}-${String(mo).padStart(2, "0")}`;
    const days = new Date(year, mo, 0).getDate();
    for (const s of salaried ?? []) {
      if (!s.location_id) continue;
      const v = salaryDailyCost(s.annual_salary != null ? Number(s.annual_salary) : null) * days;
      if (v > 0) add(key, s.location_id, v);
    }
  }
  return out;
}
