import { unwrapQuery } from "@/lib/revenueTruth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { format, subDays, startOfDay, endOfDay, parseISO } from "date-fns";
import { fetchSalaryAllocation, isSalariedStaffRow } from "@/hooks/useLabourCost";
import { effectiveOrdersAndCovers } from "@/lib/revenueTruth";
import { loadCanonicalRevenue } from "@/lib/canonicalRevenueLoader";

interface HourlyRevenue {
  time: string;
  revenue: number;
  orders: number;
}

interface DashboardOverview {
  /** Gross takings incl. VAT (canonical per location/day). */
  revenueToday: number;
  /** False when no revenue is recorded for the range (Unknown, not €0). */
  hasRevenueData: boolean;
  /** Net of VAT only when every location/day has a known net; never derived. */
  revenueNet?: number | null;
  netCoverage?: "full" | "partial" | "none";
  ordersToday: number | null;
  aovToday: number | null;
  visitorsToday: number | null;
  revenueYesterday: number;
  revenueSameWeekdayLastWeek: number;
  labourTodayCost: number;
  labourTodayPct: number | null;
  hasLabourToday: boolean;
  revenueSeries: HourlyRevenue[];
  /** Always false until real transaction timestamps exist. */
  hourlyAvailable: boolean;
  isLoadingRevenue: boolean;
}

export function useDashboardOverview(locationId?: string | null) {
  const { currentRestaurant } = useRestaurant();
  const { startDate, endDate } = useDateRange();
  const restaurantId = currentRestaurant?.id;
  const locationScopeKey = locationId ?? "all";

  // For comparisons, calculate yesterday and same weekday last week relative to endDate
  const endDateObj = parseISO(endDate);
  const yesterday = format(subDays(endDateObj, 1), "yyyy-MM-dd");
  const sameWeekdayLastWeek = format(subDays(endDateObj, 7), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["dashboard-overview", restaurantId, locationScopeKey, startDate, endDate],
    queryFn: async (): Promise<DashboardOverview> => {
      if (!restaurantId) {
        return {
          revenueToday: 0,
          hasRevenueData: false,
          ordersToday: null,
          aovToday: null,
          visitorsToday: null,
          revenueYesterday: 0,
          revenueSameWeekdayLastWeek: 0,
          labourTodayCost: 0,
          labourTodayPct: null,
          hasLabourToday: false,
          revenueSeries: [],
          hourlyAvailable: false,
          isLoadingRevenue: false,
        };

      }

      // One canonical revenue figure per location + day (same rule as Reports):
      // POS daily summary gross > deduplicated sales lines > that location's manual revenue.
      const range = await loadCanonicalRevenue(restaurantId, locationId ?? null, startDate, endDate);
      const yest = await loadCanonicalRevenue(restaurantId, locationId ?? null, yesterday, yesterday);
      const lastWk = await loadCanonicalRevenue(restaurantId, locationId ?? null, sameWeekdayLastWeek, sameWeekdayLastWeek);

      const hasRevenueData = range.revenue.gross != null;
      const revenueToday = range.revenue.gross ?? 0;
      const revenueNet = range.revenue.net;
      const netCoverage = range.revenue.netCoverage;
      const revenueYesterday = yest.revenue.gross ?? 0;
      const revenueSameWeekdayLastWeek = lastWk.revenue.gross ?? 0;

      // Manual corrections replace only that location's POS figure for that day.
      const eff = effectiveOrdersAndCovers(range.posDays, range.ledger);
      const ordersToday = eff.orders;
      const visitorsToday = eff.covers;
      const aovToday = ordersToday != null && ordersToday > 0 && hasRevenueData ? revenueToday / ordersToday : null;

      // Hourly revenue is NOT available: sales rows carry only a trading date and
      // an import timestamp (created_at), not the real transaction time. Bucketing
      // by import time would be misleading, so no hourly series is produced.
      const revenueSeries: HourlyRevenue[] = [];
      const hourlyAvailable = false;

      // Fetch labour data for the date range
      const rangeStartDateTime = `${startDate}T00:00:00`;
      const rangeEndDateTime = `${endDate}T23:59:59`;

      let attendanceQuery = supabase
        .from("staff_attendance")
        .select("clock_in, clock_out, staff_id, staff!inner(hourly_rate, pay_type, annual_salary)")
        .eq("restaurant_id", restaurantId)
        .gte("clock_in", rangeStartDateTime)
        .lte("clock_in", rangeEndDateTime);

      if (locationId) {
        attendanceQuery = attendanceQuery.eq("location_id", locationId);
      }

      const attendanceData = unwrapQuery(await attendanceQuery, "attendanceData");

      let labourTodayCost = 0;
      const hasLabourToday = (attendanceData?.length || 0) > 0;

      if (attendanceData) {
        for (const record of attendanceData) {
          if (isSalariedStaffRow(record.staff)) continue;
          const clockIn = new Date(record.clock_in);
          const clockOut = record.clock_out ? new Date(record.clock_out) : new Date();
          const hoursWorked = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
          const hourlyRate = (record.staff as { hourly_rate: number })?.hourly_rate || 0;
          labourTodayCost += hoursWorked * hourlyRate;
        }
      }

      labourTodayCost += (
        await fetchSalaryAllocation(restaurantId, locationId ?? null, startDate, endDate)
      ).total;

      const labourTodayPct = hasLabourToday && revenueToday > 0 
        ? (labourTodayCost / revenueToday) * 100 
        : null;

      return {
        revenueToday,
        hasRevenueData,
        revenueNet,
        netCoverage,
        ordersToday,
        aovToday,
        visitorsToday,
        revenueYesterday,
        revenueSameWeekdayLastWeek,
        labourTodayCost,
        labourTodayPct,
        hasLabourToday,
        revenueSeries,
        hourlyAvailable,
        isLoadingRevenue: false,
      };

    },
    enabled: !!restaurantId,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}
