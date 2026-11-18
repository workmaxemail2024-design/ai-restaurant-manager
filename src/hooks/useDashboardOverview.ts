import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { format, subDays, startOfDay, endOfDay, parseISO } from "date-fns";
import { fetchSalaryAllocation, isSalariedStaffRow } from "@/hooks/useLabourCost";
import { canonicalizePosSummaries } from "@/lib/posDailyCanonical";
import { dedupePosSales, effectiveOrdersAndCovers, sumRevenue } from "@/lib/revenueTruth";

interface HourlyRevenue {
  time: string;
  revenue: number;
  orders: number;
}

interface DashboardOverview {
  revenueToday: number;
  /** False when no sales rows exist for the range (revenue is Unknown, not €0). */
  hasRevenueData: boolean;
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

      // Fetch sales for selected date range
      let rangeQuery = supabase
        .from("sales")
        .select("total_price, quantity, created_at, sale_date, location_id, source")
        .eq("restaurant_id", restaurantId)
        .gte("sale_date", startDate)
        .lte("sale_date", endDate);

      if (locationId) {
        rangeQuery = rangeQuery.eq("location_id", locationId);
      }

      const { data: rawRangeSales } = await rangeQuery;
      // One POS source per location/day — API + XLS imports of the same day are never added together.
      const rangeSales = dedupePosSales((rawRangeSales as any[]) || []);

      // Fetch yesterday's sales (for comparison)
      let yesterdayQuery = supabase
        .from("sales")
        .select("total_price, location_id, sale_date, source")
        .eq("restaurant_id", restaurantId)
        .eq("sale_date", yesterday);

      if (locationId) {
        yesterdayQuery = yesterdayQuery.eq("location_id", locationId);
      }

      const { data: yesterdaySales } = await yesterdayQuery;

      // Fetch same weekday last week sales
      let lastWeekQuery = supabase
        .from("sales")
        .select("total_price, location_id, sale_date, source")
        .eq("restaurant_id", restaurantId)
        .eq("sale_date", sameWeekdayLastWeek);

      if (locationId) {
        lastWeekQuery = lastWeekQuery.eq("location_id", locationId);
      }

      const { data: lastWeekSales } = await lastWeekQuery;

      // Calculate revenue totals for the selected range
      const revenueKnown = sumRevenue(rangeSales);
      const hasRevenueData = revenueKnown != null;
      const revenueToday = revenueKnown ?? 0;
      const revenueYesterday = sumRevenue(dedupePosSales((yesterdaySales as any[]) || [])) ?? 0;
      const revenueSameWeekdayLastWeek = sumRevenue(dedupePosSales((lastWeekSales as any[]) || [])) ?? 0;

      // Prefer authoritative order/visitor/AOV counts from pos_daily_summaries.
      // Product-row counts (sales.length) are NOT receipts, so we don't fall back to them.
      // Canonicalize per location+date first so multiple POS providers for the
      // same day are never added together as separate counts.
      let summaryQuery = supabase
        .from("pos_daily_summaries")
        .select("report_date, location_id, pos_provider, order_count, visitor_count, average_order_value, gross_sales, has_product_detail, has_summary_report")
        .eq("restaurant_id", restaurantId)
        .gte("report_date", startDate)
        .lte("report_date", endDate);
      if (locationId) summaryQuery = summaryQuery.eq("location_id", locationId);
      const { data: summaries } = await summaryQuery;

      const canonicalDays = canonicalizePosSummaries((summaries as any[]) || []);

      // Manual corrections (Reports → Daily Performance) replace only that
      // location's POS figure for that day. Explicit 0 counts; covers_unknown → Unknown.
      let ledgerQuery = supabase
        .from("daily_ledger_entries")
        .select("entry_date, location_id, manual_orders, covers, covers_unknown")
        .eq("restaurant_id", restaurantId)
        .gte("entry_date", startDate)
        .lte("entry_date", endDate);
      if (locationId) ledgerQuery = ledgerQuery.eq("location_id", locationId);
      const { data: ledgerRows } = await ledgerQuery;
      const eff = effectiveOrdersAndCovers(canonicalDays, (ledgerRows as any[]) || []);
      const ordersToday = eff.orders;
      const visitorsToday = eff.covers;
      const aovToday = ordersToday != null && ordersToday > 0 ? revenueToday / ordersToday : null;


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

      const { data: attendanceData } = await attendanceQuery;

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
