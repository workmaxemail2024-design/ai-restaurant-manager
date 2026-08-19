import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { format, subDays, startOfDay, endOfDay, parseISO } from "date-fns";
import { fetchSalaryAllocation, isSalariedStaffRow } from "@/hooks/useLabourCost";

interface HourlyRevenue {
  time: string;
  revenue: number;
  orders: number;
}

interface DashboardOverview {
  revenueToday: number;
  ordersToday: number | null;
  aovToday: number | null;
  visitorsToday: number | null;
  revenueYesterday: number;
  revenueSameWeekdayLastWeek: number;
  labourTodayCost: number;
  labourTodayPct: number | null;
  hasLabourToday: boolean;
  revenueSeries: HourlyRevenue[];
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
          ordersToday: null,
          aovToday: null,
          visitorsToday: null,
          revenueYesterday: 0,
          revenueSameWeekdayLastWeek: 0,
          labourTodayCost: 0,
          labourTodayPct: null,
          hasLabourToday: false,
          revenueSeries: [],
          isLoadingRevenue: false,
        };

      }

      // Fetch sales for selected date range
      let rangeQuery = supabase
        .from("sales")
        .select("total_price, quantity, created_at, sale_date")
        .eq("restaurant_id", restaurantId)
        .gte("sale_date", startDate)
        .lte("sale_date", endDate);

      if (locationId) {
        rangeQuery = rangeQuery.eq("location_id", locationId);
      }

      const { data: rangeSales } = await rangeQuery;

      // Fetch yesterday's sales (for comparison)
      let yesterdayQuery = supabase
        .from("sales")
        .select("total_price")
        .eq("restaurant_id", restaurantId)
        .eq("sale_date", yesterday);

      if (locationId) {
        yesterdayQuery = yesterdayQuery.eq("location_id", locationId);
      }

      const { data: yesterdaySales } = await yesterdayQuery;

      // Fetch same weekday last week sales
      let lastWeekQuery = supabase
        .from("sales")
        .select("total_price")
        .eq("restaurant_id", restaurantId)
        .eq("sale_date", sameWeekdayLastWeek);

      if (locationId) {
        lastWeekQuery = lastWeekQuery.eq("location_id", locationId);
      }

      const { data: lastWeekSales } = await lastWeekQuery;

      // Calculate revenue totals for the selected range
      const revenueToday = rangeSales?.reduce((sum, s) => sum + Number(s.total_price), 0) || 0;
      const revenueYesterday = yesterdaySales?.reduce((sum, s) => sum + Number(s.total_price), 0) || 0;
      const revenueSameWeekdayLastWeek = lastWeekSales?.reduce((sum, s) => sum + Number(s.total_price), 0) || 0;

      // Prefer authoritative order/visitor/AOV counts from pos_daily_summaries.
      // Product-row counts (sales.length) are NOT receipts, so we don't fall back to them.
      let summaryQuery = supabase
        .from("pos_daily_summaries")
        .select("order_count, visitor_count, average_order_value, gross_sales")
        .eq("restaurant_id", restaurantId)
        .gte("report_date", startDate)
        .lte("report_date", endDate);
      if (locationId) summaryQuery = summaryQuery.eq("location_id", locationId);
      const { data: summaries } = await summaryQuery;

      let ordersToday: number | null = null;
      let visitorsToday: number | null = null;
      let aovToday: number | null = null;
      if (summaries && summaries.length) {
        const orderSum = summaries.reduce<number | null>((acc, r: any) => {
          if (r.order_count == null) return acc;
          return (acc ?? 0) + Number(r.order_count);
        }, null);
        const visitorSum = summaries.reduce<number | null>((acc, r: any) => {
          if (r.visitor_count == null) return acc;
          return (acc ?? 0) + Number(r.visitor_count);
        }, null);
        ordersToday = orderSum;
        visitorsToday = visitorSum;
        if (orderSum != null && orderSum > 0) {
          aovToday = revenueToday / orderSum;
        }
      }


      // Build hourly revenue series for the end date (most recent day in range)
      const hourlyMap: Record<string, { revenue: number; orders: number }> = {};
      const hours = ["6AM", "7AM", "8AM", "9AM", "10AM", "11AM", "12PM", "1PM", "2PM", "3PM", "4PM", "5PM", "6PM", "7PM", "8PM", "9PM", "10PM", "11PM"];
      hours.forEach((h) => {
        hourlyMap[h] = { revenue: 0, orders: 0 };
      });

      // Filter sales for the end date only for hourly chart
      const endDateSales = rangeSales?.filter(s => s.sale_date === endDate) || [];
      
      endDateSales.forEach((sale) => {
        const saleDate = new Date(sale.created_at);
        const hour = saleDate.getHours();
        let label: string;

        if (hour < 6) {
          label = "6AM";
        } else if (hour >= 23) {
          label = "11PM";
        } else if (hour === 12) {
          label = "12PM";
        } else if (hour > 12) {
          label = `${hour - 12}PM`;
        } else {
          label = `${hour}AM`;
        }

        if (hourlyMap[label]) {
          hourlyMap[label].revenue += Number(sale.total_price);
          hourlyMap[label].orders += 1;
        }
      });

      const revenueSeries: HourlyRevenue[] = hours.map((h) => ({
        time: h,
        revenue: hourlyMap[h].revenue,
        orders: hourlyMap[h].orders,
      }));

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
        ordersToday,
        aovToday,
        visitorsToday,
        revenueYesterday,
        revenueSameWeekdayLastWeek,
        labourTodayCost,
        labourTodayPct,
        hasLabourToday,
        revenueSeries,
        isLoadingRevenue: false,
      };

    },
    enabled: !!restaurantId,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}
