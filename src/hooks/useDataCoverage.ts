import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { eachDayOfInterval, parseISO, format } from "date-fns";

export type CoverageLevel = "complete" | "partial" | "missing";

export interface DayCoverage {
  date: string;
  hasSales: boolean;
  hasLabour: boolean; // attendance OR manual ledger
  hasAttendance: boolean;
  hasManualLabour: boolean;
  hasInventory: boolean;
  hasReservations: boolean;
  hasFinancial: boolean; // ledger entry OR overhead exists
  level: CoverageLevel;
}

export interface CoverageSummary {
  totalDays: number;
  salesCoverage: { covered: number; missing: number; level: CoverageLevel };
  labourCoverage: { covered: number; missing: number; level: CoverageLevel };
  inventoryCoverage: { covered: number; missing: number; level: CoverageLevel };
  reservationsCoverage: { covered: number; missing: number; level: CoverageLevel };
  financialCoverage: { covered: number; missing: number; level: CoverageLevel };
  dailyCoverage: Map<string, DayCoverage>;
  overallLevel: CoverageLevel;
  warnings: DataWarning[];
}

export interface DataWarning {
  type: "missing_labour" | "missing_recipes" | "unallocated_overheads" | "missing_sales" | "no_attendance";
  message: string;
  severity: "info" | "warning" | "error";
  page?: string;
  route?: string;
}

function getLevel(covered: number, total: number): CoverageLevel {
  if (total === 0) return "complete";
  if (covered >= total) return "complete";
  if (covered > 0) return "partial";
  return "missing";
}

export function useDataCoverage(locationId?: string | null) {
  const { currentRestaurant } = useRestaurant();
  const { startDate, endDate } = useDateRange();
  const restaurantId = currentRestaurant?.id;
  const locationKey = locationId ?? "all";

  return useQuery({
    queryKey: ["data-coverage", restaurantId, locationKey, startDate, endDate],
    queryFn: async (): Promise<CoverageSummary> => {
      const days = eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) });
      const totalDays = days.length;
      const dateStrings = days.map(d => format(d, "yyyy-MM-dd"));

      // Parallel fetches
      const salesPromise = (async () => {
        let q = supabase
          .from("sales")
          .select("sale_date")
          .eq("restaurant_id", restaurantId!)
          .gte("sale_date", startDate)
          .lte("sale_date", endDate);
        if (locationId) q = q.eq("location_id", locationId);
        const { data } = await q;
        const set = new Set<string>();
        (data || []).forEach(r => set.add(r.sale_date));
        return set;
      })();

      const attendancePromise = (async () => {
        let q = supabase
          .from("staff_attendance")
          .select("clock_in")
          .eq("restaurant_id", restaurantId!)
          .gte("clock_in", `${startDate}T00:00:00`)
          .lte("clock_in", `${endDate}T23:59:59`);
        if (locationId) q = q.eq("location_id", locationId);
        const { data } = await q;
        const set = new Set<string>();
        (data || []).forEach(r => { if (r.clock_in) set.add(r.clock_in.split("T")[0]); });
        return set;
      })();

      const ledgerPromise = (async () => {
        let q = supabase
          .from("daily_ledger_entries")
          .select("entry_date, labour_hours, additional_expenses, is_closed, manual_revenue")
          .eq("restaurant_id", restaurantId!)
          .gte("entry_date", startDate)
          .lte("entry_date", endDate);
        if (locationId) q = q.eq("location_id", locationId);
        else q = q.is("location_id", null);
        const { data } = await q;
        const map = new Map<string, { labour_hours: number; has_entry: boolean; is_closed: boolean }>();
        (data || []).forEach(r => {
          map.set(r.entry_date, {
            labour_hours: Number(r.labour_hours) || 0,
            has_entry: true,
            is_closed: (r as any).is_closed ?? false,
          });
        });
        return map;
      })();

      const inventoryPromise = (async () => {
        let q = supabase
          .from("stock_adjustments")
          .select("created_at")
          .eq("restaurant_id", restaurantId!)
          .gte("created_at", `${startDate}T00:00:00`)
          .lte("created_at", `${endDate}T23:59:59`);
        if (locationId) q = q.eq("location_id", locationId);
        const { data } = await q;
        const set = new Set<string>();
        (data || []).forEach(r => { if (r.created_at) set.add(r.created_at.split("T")[0]); });
        return set;
      })();

      const reservationsPromise = (async () => {
        let q = supabase
          .from("reservations")
          .select("start_at")
          .eq("restaurant_id", restaurantId!)
          .gte("start_at", `${startDate}T00:00:00`)
          .lte("start_at", `${endDate}T23:59:59`);
        if (locationId) q = q.eq("location_id", locationId);
        const { data } = await q;
        const set = new Set<string>();
        (data || []).forEach(r => { if (r.start_at) set.add(r.start_at.split("T")[0]); });
        return set;
      })();

      const overheadsPromise = (async () => {
        let q = supabase
          .from("overheads")
          .select("id")
          .eq("restaurant_id", restaurantId!)
          .eq("is_active", true);
        if (locationId) q = q.or(`location_id.eq.${locationId},location_id.is.null`);
        const { data } = await q;
        return (data?.length || 0) > 0;
      })();

      // Check recipe coverage
      const recipesPromise = (async () => {
        const { count: dishCount } = await supabase
          .from("dishes")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId!);
        const { count: recipedCount } = await supabase
          .from("dish_ingredients")
          .select("dish_id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId!);
        return { total: dishCount || 0, withRecipes: recipedCount || 0 };
      })();

      const [salesDays, attendanceDays, ledgerMap, inventoryDays, reservationDays, hasOverheads, recipes] =
        await Promise.all([salesPromise, attendancePromise, ledgerPromise, inventoryPromise, reservationsPromise, overheadsPromise, recipesPromise]);

      // Build daily coverage
      const dailyCoverage = new Map<string, DayCoverage>();
      let salesCovered = 0, labourCovered = 0, inventoryCovered = 0, resCovered = 0, finCovered = 0;

      for (const dateStr of dateStrings) {
        const hasSales = salesDays.has(dateStr);
        const hasAttendance = attendanceDays.has(dateStr);
        const ledger = ledgerMap.get(dateStr);
        const hasManualLabour = (ledger?.labour_hours ?? 0) > 0;
        const hasLabour = hasAttendance || hasManualLabour;
        const hasInventory = inventoryDays.has(dateStr);
        const hasReservations = reservationDays.has(dateStr);
        const hasFinancial = (ledger?.has_entry ?? false) || hasOverheads;
        const isClosed = ledger?.is_closed ?? false;

        const criticalPresent = (hasSales || isClosed) && hasLabour;
        const anyPresent = hasSales || hasLabour || hasInventory || hasReservations || hasFinancial;
        const level: CoverageLevel = criticalPresent ? "complete" : anyPresent ? "partial" : "missing";

        dailyCoverage.set(dateStr, { date: dateStr, hasSales: hasSales || isClosed, hasLabour, hasAttendance, hasManualLabour, hasInventory, hasReservations, hasFinancial, level });

        if (hasSales || isClosed) salesCovered++;
        if (hasLabour) labourCovered++;
        if (hasInventory) inventoryCovered++;
        if (hasReservations) resCovered++;
        if (hasFinancial) finCovered++;
      }

      // Build warnings
      const warnings: DataWarning[] = [];
      const labourMissing = totalDays - labourCovered;
      const salesMissing = totalDays - salesCovered;

      if (salesCovered > 0 && labourMissing > 0) {
        warnings.push({
          type: "missing_labour",
          message: `Labour data missing for ${labourMissing} day${labourMissing > 1 ? "s" : ""} — labour % may be inaccurate.`,
          severity: "warning",
          page: "Staff",
          route: "/attendance",
        });
      }

      if (salesMissing > 0) {
        warnings.push({
          type: "missing_sales",
          message: `Sales data missing for ${salesMissing} day${salesMissing > 1 ? "s" : ""}.`,
          severity: salesMissing === totalDays ? "error" : "warning",
          page: "Sales",
          route: "/sales",
        });
      }

      if (recipes.total > 0 && recipes.withRecipes < recipes.total * 0.5) {
        warnings.push({
          type: "missing_recipes",
          message: "Some dishes have no recipe — food cost calculations are partial.",
          severity: "warning",
          page: "Dishes",
          route: "/dishes",
        });
      }

      if (hasOverheads && locationId) {
        // Check if any overheads are global without allocation
        warnings.push({
          type: "unallocated_overheads",
          message: "Some operating costs may not be fully allocated to this location.",
          severity: "info",
          page: "Overheads",
          route: "/settings/financial/overheads",
        });
      }

      if (salesCovered > 0 && attendanceDays.size === 0 && labourCovered > 0) {
        warnings.push({
          type: "no_attendance",
          message: "Labour is based on manual entries — consider using attendance tracking for accuracy.",
          severity: "info",
          page: "Attendance",
          route: "/attendance",
        });
      }

      const salesLevel = getLevel(salesCovered, totalDays);
      const labourLevel = getLevel(labourCovered, totalDays);
      const inventoryLevel = getLevel(inventoryCovered, totalDays);
      const resLevel = getLevel(resCovered, totalDays);
      const finLevel = getLevel(finCovered, totalDays);

      const levels = [salesLevel, labourLevel, finLevel];
      const overallLevel: CoverageLevel = levels.every(l => l === "complete") ? "complete"
        : levels.some(l => l === "missing") ? "missing" : "partial";

      return {
        totalDays,
        salesCoverage: { covered: salesCovered, missing: totalDays - salesCovered, level: salesLevel },
        labourCoverage: { covered: labourCovered, missing: labourMissing, level: labourLevel },
        inventoryCoverage: { covered: inventoryCovered, missing: totalDays - inventoryCovered, level: inventoryLevel },
        reservationsCoverage: { covered: resCovered, missing: totalDays - resCovered, level: resLevel },
        financialCoverage: { covered: finCovered, missing: totalDays - finCovered, level: finLevel },
        dailyCoverage,
        overallLevel,
        warnings,
      };
    },
    enabled: !!restaurantId,
    staleTime: 30000,
  });
}
