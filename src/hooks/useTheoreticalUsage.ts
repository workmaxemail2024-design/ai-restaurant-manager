import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";

/**
 * Theoretical consumption derived from recorded sales.

 * - Recipe ingredients: dish sales × recipe quantity.
 * - Direct sale items: POS quantity sold (1 bottle sold = 1 bottle consumed).
 * - Operational consumables: no sales source; they move via adjustments/counts only.
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
  /** null = unknown (recipe line has a missing/incompatible unit). Never coerced to 0. */
  quantity_used: number | null;
  cost: number | null;
  dishes_sold: number;
  /** 'recipe' = dish sales × recipe qty; 'direct_sale' = POS units sold; 'recipe_needs_review' = unit unknown. */
  usage_source: "recipe" | "direct_sale" | "recipe_needs_review";
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
        quantity_used: r.quantity_used === null || r.quantity_used === undefined ? null : Number(r.quantity_used),
        cost: r.cost === null || r.cost === undefined ? null : Number(r.cost),
        dishes_sold: Number(r.dishes_sold || 0),
        usage_source: (r.usage_source || "recipe") as TheoreticalUsageRow["usage_source"],
      })) as TheoreticalUsageRow[];
    },
  });
}
