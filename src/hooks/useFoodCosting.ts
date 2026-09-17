import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import {
  FOOD_COST_ESTIMATE_PCT,
  type FoodCostResolverRow,
} from "@/lib/foodCosting";

/**
 * Single costing source for Reports.
 *
 * `get_daily_food_cost` / `get_period_food_cost` are SECURITY DEFINER resolvers
 * that enforce the caller's restaurant and location access server-side. They
 * read sales + dated ingredient price history only — no POS data is touched.
 */

/** Per-day resolver rows keyed by YYYY-MM-DD. */
export function useDailyFoodCosting(
  startDate: string,
  endDate: string,
  locationId: string | null
) {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;

  return useQuery({
    queryKey: ["food-costing-daily", restaurantId, locationId ?? "all", startDate, endDate],
    queryFn: async (): Promise<Map<string, FoodCostResolverRow>> => {
      const map = new Map<string, FoodCostResolverRow>();
      if (!restaurantId) return map;
      const { data, error } = await supabase.rpc("get_daily_food_cost", {
        p_location_id: locationId as unknown as string,
        p_start: startDate,
        p_end: endDate,
        p_estimate_pct: FOOD_COST_ESTIMATE_PCT,
      });
      if (error) throw error;
      for (const row of (data as unknown as FoodCostResolverRow[]) || []) {
        if (row.sale_date) map.set(String(row.sale_date), row);
      }
      return map;
    },
    enabled: !!restaurantId && !!startDate && !!endDate,
    staleTime: 30_000,
  });
}

/**
 * Whole-period costing. Percentages come from period totals — daily percentages
 * are never averaged.
 */
export function usePeriodFoodCosting(
  startDate: string,
  endDate: string,
  locationId: string | null
) {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;

  return useQuery({
    queryKey: ["food-costing-period", restaurantId, locationId ?? "all", startDate, endDate],
    queryFn: async (): Promise<FoodCostResolverRow | null> => {
      if (!restaurantId) return null;
      const { data, error } = await supabase.rpc("get_period_food_cost", {
        p_location_id: locationId as unknown as string,
        p_start: startDate,
        p_end: endDate,
        p_estimate_pct: FOOD_COST_ESTIMATE_PCT,
      });
      if (error) throw error;
      const rows = (data as unknown as FoodCostResolverRow[]) || [];
      return rows[0] ?? null;
    },
    enabled: !!restaurantId && !!startDate && !!endDate,
    staleTime: 30_000,
  });
}

export interface MissingCostDish {
  id: string;
  name: string;
  quantity: number;
  revenue: number;
  reason: "no_recipe" | "no_cost";
}

/**
 * Sold items with no usable cost setup for a date range, derived from the same
 * canonical inputs the resolver uses (recipe lines + direct cost). Used only to
 * name the dishes behind `missing_cost_dishes` — it is not a second cost engine.
 */
export function useMissingCostDishes(
  startDate: string,
  endDate: string,
  locationId: string | null,
  enabled: boolean
) {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;

  return useQuery({
    queryKey: ["food-costing-missing", restaurantId, locationId ?? "all", startDate, endDate],
    queryFn: async (): Promise<MissingCostDish[]> => {
      if (!restaurantId) return [];
      let q = supabase
        .from("sales")
        .select("dish_id, quantity, total_price, dishes(name, use_direct_cost, direct_cost)")
        .eq("restaurant_id", restaurantId)
        .gte("sale_date", startDate)
        .lte("sale_date", endDate);
      if (locationId) q = q.eq("location_id", locationId);
      const { data: sales, error } = await q;
      if (error) throw error;

      const agg = new Map<string, MissingCostDish>();
      for (const s of (sales as any[]) || []) {
        if (!s.dish_id) continue;
        const existing = agg.get(s.dish_id) ?? {
          id: s.dish_id,
          name: s.dishes?.name || "Unknown item",
          quantity: 0,
          revenue: 0,
          reason: "no_recipe" as const,
        };
        existing.quantity += Number(s.quantity || 0);
        existing.revenue += Number(s.total_price || 0);
        agg.set(s.dish_id, existing);
      }
      if (agg.size === 0) return [];

      const dishIds = Array.from(agg.keys());
      const withDirectCost = new Set<string>();
      for (const s of (sales as any[]) || []) {
        if (s.dishes?.use_direct_cost && Number(s.dishes?.direct_cost || 0) > 0) {
          withDirectCost.add(s.dish_id);
        }
      }

      const withRecipe = new Set<string>();
      for (let i = 0; i < dishIds.length; i += 200) {
        const { data: lines } = await supabase
          .from("dish_ingredients")
          .select("dish_id")
          .in("dish_id", dishIds.slice(i, i + 200));
        for (const l of (lines as any[]) || []) withRecipe.add(l.dish_id);
      }

      return Array.from(agg.values())
        .filter((d) => !withDirectCost.has(d.id) && !withRecipe.has(d.id))
        .map((d) => ({ ...d, reason: "no_recipe" as const }))
        .sort((a, b) => b.revenue - a.revenue);
    },
    enabled: enabled && !!restaurantId && !!startDate && !!endDate,
    staleTime: 30_000,
  });
}
