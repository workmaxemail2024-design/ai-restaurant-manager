import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { OverheadFrequency } from "./useOverheads";
import { differenceInDays, parseISO } from "date-fns";

export type DateRange = 'today' | '7d' | '30d';

export interface ProfitMetrics {
  revenue: number;
  orders: number;
  aov: number;
  foodCost: number;
  foodCostPct: number | null;
  labourCost: number;
  labourPct: number | null;
  overheadCost: number;
  netProfit: number;
  netProfitPct: number | null;
  hasSales: boolean;
  hasRecipes: boolean;
  hasLabour: boolean;
  hasOverheads: boolean;
}

function allocateOverheadDaily(amount: number, frequency: OverheadFrequency): number {
  switch (frequency) {
    case 'daily':
      return amount;
    case 'weekly':
      return amount / 7;
    case 'monthly':
      return amount / 30;
    default:
      return amount / 30;
  }
}

export function useProfitMetrics(locationId?: string | null) {
  const { currentRestaurant } = useRestaurant();
  const { startDate, endDate } = useDateRange();
  const restaurantId = currentRestaurant?.id;
  const locationScopeKey = locationId ?? "all";

  // Calculate number of days in range
  const days = differenceInDays(parseISO(endDate), parseISO(startDate)) + 1;

  return useQuery({
    queryKey: ["profit-metrics", restaurantId, locationScopeKey, startDate, endDate],
    queryFn: async (): Promise<ProfitMetrics> => {
      if (!restaurantId) {
        return {
          revenue: 0,
          orders: 0,
          aov: 0,
          foodCost: 0,
          foodCostPct: null,
          labourCost: 0,
          labourPct: null,
          overheadCost: 0,
          netProfit: 0,
          netProfitPct: null,
          hasSales: false,
          hasRecipes: false,
          hasLabour: false,
          hasOverheads: false,
        };
      }

      // 1. Fetch sales for date range
      let salesQuery = supabase
        .from("sales")
        .select("id, dish_id, quantity, total_price, sale_date")
        .eq("restaurant_id", restaurantId)
        .gte("sale_date", startDate)
        .lte("sale_date", endDate);

      if (locationId) {
        salesQuery = salesQuery.eq("location_id", locationId);
      }

      const { data: sales } = await salesQuery;
      const hasSales = (sales?.length || 0) > 0;
      
      const revenue = sales?.reduce((sum, sale) => sum + Number(sale.total_price), 0) || 0;
      const orders = sales?.length || 0;
      const aov = orders > 0 ? revenue / orders : 0;

      // 2. Calculate food cost using RPC for each unique dish
      let foodCost = 0;
      let dishesWithCost = 0;
      let totalDishes = 0;

      if (sales && sales.length > 0) {
        // Group sales by dish_id to minimize RPC calls
        const dishQuantities: Record<string, number> = {};
        sales.forEach(sale => {
          dishQuantities[sale.dish_id] = (dishQuantities[sale.dish_id] || 0) + sale.quantity;
        });

        totalDishes = Object.keys(dishQuantities).length;

        // Calculate cost for each dish
        for (const [dishId, quantity] of Object.entries(dishQuantities)) {
          try {
            const { data: costData } = await supabase.rpc("calculate_dish_cost", { 
              p_dish_id: dishId 
            });
            const dishCost = Number(costData) || 0;
            if (dishCost > 0) {
              dishesWithCost++;
              foodCost += dishCost * quantity;
            }
          } catch {
            // RPC failed, skip this dish
          }
        }
      }

      // hasRecipes = at least 50% of dishes have cost data
      const hasRecipes = totalDishes > 0 && dishesWithCost >= totalDishes * 0.5;
      const foodCostPct = revenue > 0 && hasRecipes ? (foodCost / revenue) * 100 : null;

      // 3. Calculate labour cost from attendance
      const startDateTime = `${startDate}T00:00:00`;
      const endDateTime = `${endDate}T23:59:59`;

      let attendanceQuery = supabase
        .from("staff_attendance")
        .select("clock_in, clock_out, staff_id, location_id, staff(hourly_rate)")
        .eq("restaurant_id", restaurantId)
        .gte("clock_in", startDateTime)
        .lte("clock_in", endDateTime)
        .not("clock_out", "is", null);

      if (locationId) {
        attendanceQuery = attendanceQuery.eq("location_id", locationId);
      }

      const { data: attendance } = await attendanceQuery;
      const hasLabour = (attendance?.length || 0) > 0;

      let labourCost = 0;
      if (attendance) {
        for (const record of attendance) {
          if (record.clock_in && record.clock_out && record.staff) {
            const clockIn = new Date(record.clock_in);
            const clockOut = new Date(record.clock_out);
            const hoursWorked = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
            const hourlyRate = Number((record.staff as { hourly_rate: number }).hourly_rate) || 0;
            labourCost += hoursWorked * hourlyRate;
          }
        }
      }

      const labourPct = revenue > 0 && hasLabour ? (labourCost / revenue) * 100 : null;

      // 4. Calculate overhead cost
      let overheadsQuery = supabase
        .from("overheads")
        .select("amount, frequency, is_active, location_id")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true);

      // Get both location-specific and global overheads
      if (locationId) {
        overheadsQuery = overheadsQuery.or(`location_id.eq.${locationId},location_id.is.null`);
      }

      const { data: overheads } = await overheadsQuery;
      const hasOverheads = (overheads?.length || 0) > 0;

      let overheadCost = 0;
      if (overheads) {
        for (const overhead of overheads) {
          const dailyAmount = allocateOverheadDaily(
            Number(overhead.amount), 
            overhead.frequency as OverheadFrequency
          );
          overheadCost += dailyAmount * days;
        }
      }

      // 5. Calculate net profit
      const netProfit = revenue - foodCost - labourCost - overheadCost;
      const netProfitPct = revenue > 0 ? (netProfit / revenue) * 100 : null;

      return {
        revenue,
        orders,
        aov,
        foodCost,
        foodCostPct,
        labourCost,
        labourPct,
        overheadCost,
        netProfit,
        netProfitPct,
        hasSales,
        hasRecipes,
        hasLabour,
        hasOverheads,
      };
    },
    enabled: !!restaurantId,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}
