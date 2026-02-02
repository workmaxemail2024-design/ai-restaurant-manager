import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useLocation } from "@/contexts/LocationContext";
import { startOfMonth, endOfMonth, format, subMonths, differenceInHours } from "date-fns";

export interface ProfitLossData {
  month: string;
  revenue: number;
  foodCost: number;
  labourCost: number;
  overheads: number;
  grossProfit: number;
  netProfit: number;
  grossMargin: number;
  netMargin: number;
}

export interface CashFlowData {
  month: string;
  cashIn: number; // Revenue from sales
  cashOutPayroll: number;
  cashOutOverheads: number;
  cashOutTotal: number;
  netCashFlow: number;
}

// Helper to convert overhead frequency to monthly amount
function toMonthlyAmount(amount: number, frequency: string): number {
  switch (frequency) {
    case "daily":
      return amount * 30;
    case "weekly":
      return amount * 4.33;
    case "monthly":
    default:
      return amount;
  }
}

export function useMonthlyProfitLoss(monthsBack: number = 6) {
  const { currentRestaurant } = useRestaurant();
  const { selectedLocationId } = useLocation();
  const restaurantId = currentRestaurant?.id;

  return useQuery({
    queryKey: ["monthly-pnl", restaurantId, selectedLocationId, monthsBack],
    queryFn: async () => {
      if (!restaurantId) return [];

      const results: ProfitLossData[] = [];
      const now = new Date();

      for (let i = monthsBack - 1; i >= 0; i--) {
        const monthDate = subMonths(now, i);
        const monthStart = startOfMonth(monthDate);
        const monthEnd = endOfMonth(monthDate);
        const monthLabel = format(monthDate, "MMM yyyy");

        // Fetch sales for the month
        let salesQuery = supabase
          .from("sales")
          .select("total_price, dish_id")
          .eq("restaurant_id", restaurantId)
          .gte("sale_date", format(monthStart, "yyyy-MM-dd"))
          .lte("sale_date", format(monthEnd, "yyyy-MM-dd"));

        if (selectedLocationId) {
          salesQuery = salesQuery.eq("location_id", selectedLocationId);
        }

        const { data: sales } = await salesQuery;
        const revenue = sales?.reduce((sum, s) => sum + Number(s.total_price), 0) || 0;

        // Estimate food cost (using dish cost RPC if available, otherwise use 30% estimate)
        let foodCost = 0;
        if (sales && sales.length > 0) {
          // Group sales by dish_id and get costs
          const dishIds = [...new Set(sales.map((s) => s.dish_id))];
          for (const dishId of dishIds) {
            const { data: costData } = await supabase.rpc("calculate_dish_cost", { p_dish_id: dishId });
            const dishSales = sales.filter((s) => s.dish_id === dishId);
            const quantity = dishSales.length;
            foodCost += (costData || 0) * quantity;
          }
        }

        // Fetch labour cost from staff attendance
        let attendanceQuery = supabase
          .from("staff_attendance")
          .select("clock_in, clock_out, staff_id, staff(hourly_rate)")
          .eq("restaurant_id", restaurantId)
          .gte("clock_in", monthStart.toISOString())
          .lte("clock_in", monthEnd.toISOString());

        if (selectedLocationId) {
          attendanceQuery = attendanceQuery.eq("location_id", selectedLocationId);
        }

        const { data: attendance } = await attendanceQuery;
        let labourCost = 0;
        attendance?.forEach((att) => {
          if (att.clock_in && att.clock_out) {
            const hours = differenceInHours(new Date(att.clock_out), new Date(att.clock_in));
            const rate = (att.staff as any)?.hourly_rate || 0;
            labourCost += hours * rate;
          }
        });

        // Fetch overheads
        let overheadsQuery = supabase
          .from("overheads")
          .select("amount, frequency, is_active, start_date, end_date, location_id")
          .eq("restaurant_id", restaurantId)
          .eq("is_active", true);

        const { data: overheadsData } = await overheadsQuery;
        let overheads = 0;
        overheadsData?.forEach((oh) => {
          // Check if overhead applies to selected location
          if (selectedLocationId && oh.location_id && oh.location_id !== selectedLocationId) {
            return;
          }
          // Check date range
          if (oh.start_date && new Date(oh.start_date) > monthEnd) return;
          if (oh.end_date && new Date(oh.end_date) < monthStart) return;

          overheads += toMonthlyAmount(Number(oh.amount), oh.frequency);
        });

        const grossProfit = revenue - foodCost;
        const netProfit = grossProfit - labourCost - overheads;
        const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
        const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

        results.push({
          month: monthLabel,
          revenue,
          foodCost,
          labourCost,
          overheads,
          grossProfit,
          netProfit,
          grossMargin,
          netMargin,
        });
      }

      return results;
    },
    enabled: !!restaurantId,
  });
}

export function useCashFlowSummary(monthsBack: number = 6) {
  const { currentRestaurant } = useRestaurant();
  const { selectedLocationId } = useLocation();
  const restaurantId = currentRestaurant?.id;

  return useQuery({
    queryKey: ["cash-flow", restaurantId, selectedLocationId, monthsBack],
    queryFn: async () => {
      if (!restaurantId) return [];

      const results: CashFlowData[] = [];
      const now = new Date();

      for (let i = monthsBack - 1; i >= 0; i--) {
        const monthDate = subMonths(now, i);
        const monthStart = startOfMonth(monthDate);
        const monthEnd = endOfMonth(monthDate);
        const monthLabel = format(monthDate, "MMM yyyy");

        // Cash In: Sales revenue
        let salesQuery = supabase
          .from("sales")
          .select("total_price")
          .eq("restaurant_id", restaurantId)
          .gte("sale_date", format(monthStart, "yyyy-MM-dd"))
          .lte("sale_date", format(monthEnd, "yyyy-MM-dd"));

        if (selectedLocationId) {
          salesQuery = salesQuery.eq("location_id", selectedLocationId);
        }

        const { data: sales } = await salesQuery;
        const cashIn = sales?.reduce((sum, s) => sum + Number(s.total_price), 0) || 0;

        // Cash Out: Payroll from attendance
        let attendanceQuery = supabase
          .from("staff_attendance")
          .select("clock_in, clock_out, staff(hourly_rate)")
          .eq("restaurant_id", restaurantId)
          .gte("clock_in", monthStart.toISOString())
          .lte("clock_in", monthEnd.toISOString());

        if (selectedLocationId) {
          attendanceQuery = attendanceQuery.eq("location_id", selectedLocationId);
        }

        const { data: attendance } = await attendanceQuery;
        let cashOutPayroll = 0;
        attendance?.forEach((att) => {
          if (att.clock_in && att.clock_out) {
            const hours = differenceInHours(new Date(att.clock_out), new Date(att.clock_in));
            const rate = (att.staff as any)?.hourly_rate || 0;
            cashOutPayroll += hours * rate;
          }
        });

        // Cash Out: Overheads
        let overheadsQuery = supabase
          .from("overheads")
          .select("amount, frequency, is_active, start_date, end_date, location_id")
          .eq("restaurant_id", restaurantId)
          .eq("is_active", true);

        const { data: overheadsData } = await overheadsQuery;
        let cashOutOverheads = 0;
        overheadsData?.forEach((oh) => {
          if (selectedLocationId && oh.location_id && oh.location_id !== selectedLocationId) {
            return;
          }
          if (oh.start_date && new Date(oh.start_date) > monthEnd) return;
          if (oh.end_date && new Date(oh.end_date) < monthStart) return;

          cashOutOverheads += toMonthlyAmount(Number(oh.amount), oh.frequency);
        });

        const cashOutTotal = cashOutPayroll + cashOutOverheads;
        const netCashFlow = cashIn - cashOutTotal;

        results.push({
          month: monthLabel,
          cashIn,
          cashOutPayroll,
          cashOutOverheads,
          cashOutTotal,
          netCashFlow,
        });
      }

      return results;
    },
    enabled: !!restaurantId,
  });
}
