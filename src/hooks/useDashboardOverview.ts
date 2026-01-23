import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

interface HourlyRevenue {
  time: string;
  revenue: number;
  orders: number;
}

interface DashboardOverview {
  revenueToday: number;
  ordersToday: number;
  aovToday: number;
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
  const restaurantId = currentRestaurant?.id;

  const today = format(new Date(), "yyyy-MM-dd");
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
  const sameWeekdayLastWeek = format(subDays(new Date(), 7), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["dashboard-overview", restaurantId, locationId, today],
    queryFn: async (): Promise<DashboardOverview> => {
      if (!restaurantId) {
        return {
          revenueToday: 0,
          ordersToday: 0,
          aovToday: 0,
          revenueYesterday: 0,
          revenueSameWeekdayLastWeek: 0,
          labourTodayCost: 0,
          labourTodayPct: null,
          hasLabourToday: false,
          revenueSeries: [],
          isLoadingRevenue: false,
        };
      }

      // Fetch today's sales
      let todayQuery = supabase
        .from("sales")
        .select("total_price, quantity, created_at")
        .eq("restaurant_id", restaurantId)
        .eq("sale_date", today);

      if (locationId) {
        todayQuery = todayQuery.eq("location_id", locationId);
      }

      const { data: todaySales } = await todayQuery;

      // Fetch yesterday's sales
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

      // Calculate revenue totals
      const revenueToday = todaySales?.reduce((sum, s) => sum + Number(s.total_price), 0) || 0;
      const ordersToday = todaySales?.length || 0;
      const aovToday = ordersToday > 0 ? revenueToday / ordersToday : 0;
      const revenueYesterday = yesterdaySales?.reduce((sum, s) => sum + Number(s.total_price), 0) || 0;
      const revenueSameWeekdayLastWeek = lastWeekSales?.reduce((sum, s) => sum + Number(s.total_price), 0) || 0;

      // Build hourly revenue series for today (6AM to 11PM)
      const hourlyMap: Record<string, { revenue: number; orders: number }> = {};
      const hours = ["6AM", "7AM", "8AM", "9AM", "10AM", "11AM", "12PM", "1PM", "2PM", "3PM", "4PM", "5PM", "6PM", "7PM", "8PM", "9PM", "10PM", "11PM"];
      hours.forEach((h) => {
        hourlyMap[h] = { revenue: 0, orders: 0 };
      });

      todaySales?.forEach((sale) => {
        const saleDate = new Date(sale.created_at);
        const hour = saleDate.getHours();
        let label: string;

        if (hour < 6) {
          label = "6AM"; // Group early hours into 6AM
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

      // Fetch labour data for today
      const todayStart = startOfDay(new Date()).toISOString();
      const todayEnd = endOfDay(new Date()).toISOString();

      let attendanceQuery = supabase
        .from("staff_attendance")
        .select("clock_in, clock_out, staff_id, staff!inner(hourly_rate)")
        .eq("restaurant_id", restaurantId)
        .gte("clock_in", todayStart)
        .lte("clock_in", todayEnd);

      if (locationId) {
        attendanceQuery = attendanceQuery.eq("location_id", locationId);
      }

      const { data: attendanceData } = await attendanceQuery;

      let labourTodayCost = 0;
      const hasLabourToday = (attendanceData?.length || 0) > 0;

      if (attendanceData) {
        for (const record of attendanceData) {
          const clockIn = new Date(record.clock_in);
          const clockOut = record.clock_out ? new Date(record.clock_out) : new Date();
          const hoursWorked = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
          const hourlyRate = (record.staff as { hourly_rate: number })?.hourly_rate || 0;
          labourTodayCost += hoursWorked * hourlyRate;
        }
      }

      const labourTodayPct = hasLabourToday && revenueToday > 0 
        ? (labourTodayCost / revenueToday) * 100 
        : null;

      return {
        revenueToday,
        ordersToday,
        aovToday,
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
  });
}
