import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { calculateOverheadForRange, type Overhead, type OverheadFrequency } from "./useOverheads";
import { differenceInDays, parseISO } from "date-fns";
import { fetchSalaryAllocation, isSalariedStaffRow } from "@/hooks/useLabourCost";

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

export function useProfitMetrics(locationId?: string | null) {
  const { currentRestaurant } = useRestaurant();
  const { startDate, endDate } = useDateRange();
  const restaurantId = currentRestaurant?.id;
  const locationScopeKey = locationId ?? "all";

  return useQuery({
    queryKey: ["profit-metrics", restaurantId, locationScopeKey, startDate, endDate],
    queryFn: async (): Promise<ProfitMetrics> => {
      if (!restaurantId) {
        return {
          revenue: 0, orders: 0, aov: 0, foodCost: 0, foodCostPct: null,
          labourCost: 0, labourPct: null, overheadCost: 0, netProfit: 0,
          netProfitPct: null, hasSales: false, hasRecipes: false,
          hasLabour: false, hasOverheads: false,
        };
      }

      // 1. Fetch sales
      let salesQuery = supabase
        .from("sales")
        .select("id, dish_id, quantity, total_price, sale_date")
        .eq("restaurant_id", restaurantId)
        .gte("sale_date", startDate)
        .lte("sale_date", endDate);
      if (locationId) salesQuery = salesQuery.eq("location_id", locationId);

      const { data: sales } = await salesQuery;
      const hasSales = (sales?.length || 0) > 0;
      const revenue = sales?.reduce((sum, s) => sum + Number(s.total_price), 0) || 0;
      const orders = sales?.length || 0;
      const aov = orders > 0 ? revenue / orders : 0;

      // 2. Food cost
      let foodCost = 0;
      let dishesWithCost = 0;
      let totalDishes = 0;

      if (sales && sales.length > 0) {
        const dishQuantities: Record<string, number> = {};
        sales.forEach(s => {
          dishQuantities[s.dish_id] = (dishQuantities[s.dish_id] || 0) + s.quantity;
        });
        totalDishes = Object.keys(dishQuantities).length;

        for (const [dishId, quantity] of Object.entries(dishQuantities)) {
          try {
            const { data: costData } = await supabase.rpc("calculate_dish_cost", { p_dish_id: dishId });
            const dishCost = Number(costData) || 0;
            if (dishCost > 0) {
              dishesWithCost++;
              foodCost += dishCost * quantity;
            }
          } catch { /* skip */ }
        }
      }

      const hasRecipes = totalDishes > 0 && dishesWithCost >= totalDishes * 0.5;
      const foodCostPct = revenue > 0 && hasRecipes ? (foodCost / revenue) * 100 : null;

      // 3. Labour cost
      const startDateTime = `${startDate}T00:00:00`;
      const endDateTime = `${endDate}T23:59:59`;

      let attendanceQuery = supabase
        .from("staff_attendance")
        .select("clock_in, clock_out, staff_id, location_id, staff(hourly_rate, pay_type, annual_salary)")
        .eq("restaurant_id", restaurantId)
        .gte("clock_in", startDateTime)
        .lte("clock_in", endDateTime)
        .not("clock_out", "is", null);
      if (locationId) attendanceQuery = attendanceQuery.eq("location_id", locationId);

      const { data: attendance } = await attendanceQuery;
      const hasLabour = (attendance?.length || 0) > 0;

      let labourCost = 0;
      if (attendance) {
        for (const record of attendance) {
          if (record.clock_in && record.clock_out && record.staff && !isSalariedStaffRow(record.staff)) {
            const hours = (new Date(record.clock_out).getTime() - new Date(record.clock_in).getTime()) / (1000 * 60 * 60);
            const rate = Number((record.staff as { hourly_rate: number }).hourly_rate) || 0;
            labourCost += hours * rate;
          }
        }
      }

      // Salaried staff: allocated from salary, not from attendance hours.
      const salaryAlloc = await fetchSalaryAllocation(restaurantId, locationId ?? null, startDate, endDate);
      labourCost += salaryAlloc.total;

      const labourPct = revenue > 0 && (hasLabour || salaryAlloc.total > 0) ? (labourCost / revenue) * 100 : null;

      // 4. Overhead cost - using the new calculation engine
      let overheadsQuery = supabase
        .from("overheads")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true);
      if (locationId) {
        overheadsQuery = overheadsQuery.or(`location_id.eq.${locationId},location_id.is.null`);
      }

      const { data: overheadsRaw } = await overheadsQuery;
      const hasOverheads = (overheadsRaw?.length || 0) > 0;

      // Get location count for allocation
      let locationCount = 1;
      if (!locationId) {
        const { count } = await supabase
          .from("locations")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId);
        locationCount = count || 1;
      }

      const overheads = (overheadsRaw || []).map(o => ({
        ...o,
        allocation_mode: o.allocation_mode || 'equal',
        allocation_details: (o.allocation_details as Record<string, number>) || {},
      })) as Overhead[];

      const overheadCost = calculateOverheadForRange(
        overheads, startDate, endDate, locationId, locationCount
      );

      // 5. Net profit
      const netProfit = revenue - foodCost - labourCost - overheadCost;
      const netProfitPct = revenue > 0 ? (netProfit / revenue) * 100 : null;

      return {
        revenue, orders, aov, foodCost, foodCostPct,
        labourCost, labourPct, overheadCost, netProfit, netProfitPct,
        hasSales, hasRecipes, hasLabour, hasOverheads,
      };
    },
    enabled: !!restaurantId,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}
