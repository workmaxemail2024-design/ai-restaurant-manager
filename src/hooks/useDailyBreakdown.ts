import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { format, eachDayOfInterval, parseISO } from "date-fns";

interface DishMetric {
  name: string;
  quantity: number;
  revenue: number;
}

interface LocationMetric {
  name: string;
  revenue: number;
  orders: number;
}

export interface DailyMetrics {
  date: string; // YYYY-MM-DD
  revenue: number;
  orders: number;
  foodCost: number;
  profit: number;
  foodCostPercent: number;
  topDishes: DishMetric[];
  worstDishes: DishMetric[];
  locationPerformance: LocationMetric[];
  hasData: boolean;
  hasImported: boolean;
  hasApplied: boolean;
}

interface SaleRow {
  dish_id: string;
  quantity: number;
  total_price: number;
  sale_date: string;
  location_id: string;
  dishes: { name: string; selling_price: number } | null;
  locations: { name: string } | null;
}

export function useDailyBreakdown(
  startDate?: string,
  endDate?: string,
  locationId?: string | null
) {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;
  const targetStart = startDate || format(new Date(), "yyyy-MM-dd");
  const targetEnd = endDate || targetStart;
  const locationKey = locationId ?? "all";

  // Fetch all sales in the range (single query)
  const salesQuery = useQuery({
    queryKey: ["daily-breakdown-sales", restaurantId, locationKey, targetStart, targetEnd],
    queryFn: async () => {
      if (!restaurantId) return [] as SaleRow[];
      let q = supabase
        .from("sales")
        .select("dish_id, quantity, total_price, sale_date, location_id, dishes(name, selling_price), locations(name)")
        .eq("restaurant_id", restaurantId)
        .gte("sale_date", targetStart)
        .lte("sale_date", targetEnd)
        .order("sale_date", { ascending: true });

      if (locationId) q = q.eq("location_id", locationId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as SaleRow[];
    },
    enabled: !!restaurantId,
  });

  // Fetch POS import coverage
  const coverageQuery = useQuery({
    queryKey: ["daily-breakdown-coverage", restaurantId, locationKey, targetStart, targetEnd],
    queryFn: async () => {
      if (!restaurantId) return new Map<string, { imported: boolean; applied: boolean }>();
      let q = supabase
        .from("pos_sales_import")
        .select("mapped_sale_date, sync_status")
        .eq("restaurant_id", restaurantId)
        .gte("mapped_sale_date", targetStart)
        .lte("mapped_sale_date", targetEnd);
      if (locationId) q = q.eq("location_id", locationId);
      const { data } = await q;
      const map = new Map<string, { imported: boolean; applied: boolean }>();
      for (const row of data || []) {
        if (!row.mapped_sale_date) continue;
        const existing = map.get(row.mapped_sale_date) || { imported: false, applied: false };
        existing.imported = true;
        if (row.sync_status === "applied") existing.applied = true;
        map.set(row.mapped_sale_date, existing);
      }
      return map;
    },
    enabled: !!restaurantId,
  });

  // Group sales by day and compute metrics
  const dailyMetrics = useMemo((): DailyMetrics[] => {
    const days = eachDayOfInterval({
      start: parseISO(targetStart),
      end: parseISO(targetEnd),
    });
    const sales = salesQuery.data || [];
    const coverage = coverageQuery.data || new Map();

    // Group sales by date
    const byDate = new Map<string, SaleRow[]>();
    for (const s of sales) {
      const arr = byDate.get(s.sale_date) || [];
      arr.push(s);
      byDate.set(s.sale_date, arr);
    }

    return days.map((day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      const daySales = byDate.get(dateStr) || [];
      const hasData = daySales.length > 0;

      const revenue = daySales.reduce((s, r) => s + Number(r.total_price), 0);
      const orders = daySales.reduce((s, r) => s + r.quantity, 0);

      // Dish aggregation
      const dishMap: Record<string, DishMetric> = {};
      for (const s of daySales) {
        const key = s.dish_id;
        if (!dishMap[key]) {
          dishMap[key] = {
            name: s.dishes?.name || "Unknown",
            quantity: 0,
            revenue: 0,
          };
        }
        dishMap[key].quantity += s.quantity;
        dishMap[key].revenue += Number(s.total_price);
      }
      const sorted = Object.values(dishMap).sort((a, b) => b.quantity - a.quantity);

      // Location aggregation
      const locMap: Record<string, LocationMetric> = {};
      for (const s of daySales) {
        const key = s.location_id;
        if (!locMap[key]) {
          locMap[key] = { name: s.locations?.name || "Unknown", revenue: 0, orders: 0 };
        }
        locMap[key].revenue += Number(s.total_price);
        locMap[key].orders += s.quantity;
      }

      // Approximate food cost as 30% if no RPC available per-row
      // (Calling RPC per dish per day would be too slow)
      const estimatedFoodCostPercent = hasData ? 30 : 0;
      const foodCost = revenue * (estimatedFoodCostPercent / 100);
      const profit = revenue - foodCost;

      const cov = coverage.get(dateStr);

      return {
        date: dateStr,
        revenue,
        orders,
        foodCost,
        profit,
        foodCostPercent: hasData
          ? revenue > 0
            ? (foodCost / revenue) * 100
            : 0
          : 0,
        topDishes: sorted.slice(0, 5),
        worstDishes: sorted.length > 5 ? sorted.slice(-5).reverse() : sorted.slice().reverse().slice(0, 5),
        locationPerformance: Object.values(locMap).sort((a, b) => b.revenue - a.revenue),
        hasData,
        hasImported: cov?.imported || false,
        hasApplied: cov?.applied || false,
      };
    });
  }, [salesQuery.data, coverageQuery.data, targetStart, targetEnd]);

  return {
    data: dailyMetrics,
    isLoading: salesQuery.isLoading || coverageQuery.isLoading,
  };
}
