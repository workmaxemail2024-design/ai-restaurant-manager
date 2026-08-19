import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";

/**
 * Theoretical ingredient consumption derived from recorded sales × recipe quantities.
 *
 * This is ALWAYS recalculated from the authoritative `sales` rows — it never writes
 * stock deductions — so re-importing / re-syncing the same Captiva sales data can
 * never double-deduct ingredients. Wastage/adjustments, purchases and physical
 * counts stay separate concepts.
 */
export interface TheoreticalUsageRow {
  ingredient_id: string;
  ingredient_name: string;
  base_unit: string;
  quantity_used: number;
  cost: number;
  dishes_sold: number;
}

export function useTheoreticalUsage(params: {
  locationId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}) {
  const { currentRestaurant } = useRestaurant();
  const { locationId, startDate, endDate } = params;

  return useQuery({
    queryKey: [
      "theoretical-usage",
      currentRestaurant?.id,
      locationId ?? "all",
      startDate ?? "any",
      endDate ?? "any",
    ],
    enabled: !!currentRestaurant,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_theoretical_usage", {
        p_location_id: locationId ?? null,
        p_start: startDate ?? null,
        p_end: endDate ?? null,
      });
      if (error) throw error;
      return ((data || []) as any[]).map((r) => ({
        ingredient_id: r.ingredient_id,
        ingredient_name: r.ingredient_name,
        base_unit: r.base_unit,
        quantity_used: Number(r.quantity_used || 0),
        cost: Number(r.cost || 0),
        dishes_sold: Number(r.dishes_sold || 0),
      })) as TheoreticalUsageRow[];
    },
  });
}
