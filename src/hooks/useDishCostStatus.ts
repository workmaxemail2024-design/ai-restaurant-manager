import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { convertRecipeQty } from "@/lib/units";
import type { Dish } from "@/hooks/useDishes";

/**
 * Costing setup status for a dish. Derived from the SAME canonical inputs the
 * rest of the app uses: the `dish_ingredients` recipe relationships, the
 * ingredient pack/price fields (mirrored by `src/lib/units.ts`, which matches
 * the database costing functions) and the canonical `calculate_dish_cost`
 * result already loaded on each dish (`dish.dish_cost`).
 *
 * Buckets are mutually exclusive and evaluated in this order:
 *  1. no_recipe        – no recipe lines at all (and not using a direct cost)
 *  2. no_usable_cost   – canonical calculation returns no cost
 *  3. missing_costs    – a cost is produced but one or more ingredients have no price
 *  4. fully_costed     – complete, usable canonical cost
 */
export type DishCostStatus = "no_recipe" | "no_usable_cost" | "missing_costs" | "fully_costed";

export type DishCostFilter = "all" | DishCostStatus;

export const DISH_COST_FILTERS: { value: DishCostFilter; label: string }[] = [
  { value: "all", label: "All dishes" },
  { value: "no_recipe", label: "No recipe" },
  { value: "missing_costs", label: "Missing ingredient costs" },
  { value: "no_usable_cost", label: "No usable cost" },
  { value: "fully_costed", label: "Fully costed" },
];

interface RecipeLine {
  dish_id: string;
  quantity: number | null;
  unit: string | null;
  ingredients: {
    unit: string | null;
    pack_size: number | null;
    pack_unit: string | null;
    cost_per_pack: number | null;
    default_cost_price: number | null;
  } | null;
}

/** Recipe lines for the current restaurant (RLS scoped), used for costing status. */
export function useRecipeLines() {
  return useQuery({
    queryKey: ["dish-recipe-lines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dish_ingredients")
        .select(
          "dish_id, quantity, unit, ingredients(unit, pack_size, pack_unit, cost_per_pack, default_cost_price)"
        );
      if (error) throw error;
      return (data || []) as unknown as RecipeLine[];
    },
  });
}

/** Mirrors `get_ingredient_base_cost`: pack price per base unit, else default price. */
function ingredientBaseCost(ing: RecipeLine["ingredients"]): number {
  if (!ing) return 0;
  const { pack_size, pack_unit, cost_per_pack, default_cost_price } = ing;
  if (!pack_size || pack_size <= 0 || !cost_per_pack || cost_per_pack <= 0) {
    return Number(default_cost_price) || 0;
  }
  const multiplier = pack_unit === "kg" || pack_unit === "L" ? 1000 : 1;
  return cost_per_pack / (pack_size * multiplier);
}

export function useDishCostStatuses(dishes: Dish[]) {
  const { data: lines = [] } = useRecipeLines();

  return useMemo(() => {
    const byDish = new Map<string, RecipeLine[]>();
    for (const line of lines) {
      const list = byDish.get(line.dish_id);
      if (list) list.push(line);
      else byDish.set(line.dish_id, [line]);
    }

    const statuses = new Map<string, DishCostStatus>();
    const counts: Record<DishCostStatus, number> = {
      no_recipe: 0,
      no_usable_cost: 0,
      missing_costs: 0,
      fully_costed: 0,
    };

    for (const dish of dishes) {
      const recipe = byDish.get(dish.id) || [];
      const usesDirectCost = !!dish.use_direct_cost;
      let status: DishCostStatus;

      if (!usesDirectCost && recipe.length === 0) {
        status = "no_recipe";
      } else if (dish.dish_cost === null || dish.dish_cost === undefined) {
        status = "no_usable_cost";
      } else if (
        !usesDirectCost &&
        recipe.some(
          (l) =>
            ingredientBaseCost(l.ingredients) <= 0 ||
            convertRecipeQty(l.ingredients, Number(l.quantity), l.unit) === null
        )
      ) {
        status = "missing_costs";
      } else {
        status = "fully_costed";
      }

      statuses.set(dish.id, status);
      counts[status] += 1;
    }

    return { statuses, counts };
  }, [dishes, lines]);
}
