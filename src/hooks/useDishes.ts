import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type DishItemType = "food" | "drink" | "alcoholic" | "non_alcoholic" | "modifier" | "other";

export interface Dish {
  id: string;
  name: string;
  category: string | null;
  department: string | null;
  location_id: string | null;
  selling_price: number;
  created_at: string;
  updated_at: string;
  captiva_external_id: string | null;
  item_type: string | null;
  needs_review: boolean | null;
  is_active: boolean | null;
  direct_cost: number | null;
  use_direct_cost: boolean | null;
  /** Set when the dish was archived (hidden from active views, history kept). */
  archived_at: string | null;
  archived_by: string | null;
  /** Set when this dish was merged into a master canonical dish. */
  merged_into_id: string | null;
  /** Linked recipe: this dish uses base_dish_id's recipe × recipe_multiplier. */
  base_dish_id: string | null;
  recipe_multiplier: number | null;
  locations?: { name: string } | null;
  /** Computed cost (recipe or direct). null = no cost configured. */
  dish_cost: number | null;
  /** Computed margin %. null = cost missing. */
  profit_margin: number | null;
  /** True when recipe ingredients or direct cost are configured. */
  has_cost: boolean;
}

export interface DishIngredient {
  id: string;
  dish_id: string;
  ingredient_id: string;
  quantity: number;
  /** Explicit unit for this recipe line (g/kg/oz/ml/L/each). null = unknown. */
  unit: string | null;
  /** True when the legacy unit could not be determined safely. */
  needs_unit_review: boolean;
  /** 'inventory' (calculated) or 'manual' (manual_line_cost for this line). */
  cost_mode: "inventory" | "manual";
  manual_line_cost: number | null;
  manual_cost_effective_from: string | null;
  ingredients?: { name: string; unit: string };
}


export type DishInsert = {
  name: string;
  category?: string | null;
  department?: string | null;
  location_id?: string | null;
  selling_price: number;
  item_type?: string | null;
  needs_review?: boolean | null;
  is_active?: boolean | null;
  direct_cost?: number | null;
  use_direct_cost?: boolean | null;
};

export interface UseDishesOptions {
  /** Include archived / merged dishes (needed by maintenance views). */
  includeArchived?: boolean;
}

export function useDishes(locationId?: string | null, options: UseDishesOptions = {}) {
  const includeArchived = !!options.includeArchived;
  return useQuery({
    queryKey: ["dishes", locationId, includeArchived ? "with-archived" : "active"],
    queryFn: async () => {
      let query = supabase
        .from("dishes")
        .select("*, locations(name)")
        .order("name");

      if (locationId) {
        query = query.eq("location_id", locationId);
      }
      if (!includeArchived) {
        query = query.is("archived_at", null);
      }

      const { data, error } = await query;
      if (error) throw error;

      const dishesWithMetrics = await Promise.all(
        (data || []).map(async (dish: any) => {
          const { data: costData } = await supabase.rpc("calculate_dish_cost", { p_dish_id: dish.id });
          const { data: marginData } = await supabase.rpc("calculate_dish_margin", { p_dish_id: dish.id });
          const cost = costData === null || costData === undefined ? null : Number(costData);
          const margin = marginData === null || marginData === undefined ? null : Number(marginData);
          return {
            ...dish,
            dish_cost: cost,
            profit_margin: margin,
            has_cost: cost !== null,
          } as Dish;
        })
      );

      return dishesWithMetrics;
    },
  });
}

export function useDishIngredients(dishId: string | null) {
  return useQuery({
    queryKey: ["dish-ingredients", dishId],
    queryFn: async () => {
      if (!dishId) return [];
      const { data, error } = await supabase
        .from("dish_ingredients")
        .select("*, ingredients(name, unit)")
        .eq("dish_id", dishId);
      if (error) throw error;
      return (data || []) as unknown as DishIngredient[];
    },
    enabled: !!dishId,
  });
}

export function useCreateDish() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dish: DishInsert) => {
      const { data, error } = await supabase
        .from("dishes")
        .insert(dish as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dishes"] });
      toast({ title: "Dish created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error creating dish", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateDish() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...dish }: Partial<DishInsert> & { id: string }) => {
      const { data, error } = await supabase
        .from("dishes")
        .update(dish as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dishes"] });
      toast({ title: "Dish updated" });
    },
    onError: (error) => {
      toast({ title: "Error updating dish", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteDish() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dishes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dishes"] });
      toast({ title: "Dish deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error deleting dish", description: error.message, variant: "destructive" });
    },
  });
}

export function useAddDishIngredient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      dish_id: string;
      ingredient_id: string;
      quantity: number;
      /** Required: recipe quantities are always unit-explicit. */
      unit: string;
      cost_mode?: "inventory" | "manual";
      manual_line_cost?: number | null;
      manual_cost_effective_from?: string | null;
    }) => {
      const { error } = await supabase
        .from("dish_ingredients")
        .insert({ ...data, needs_unit_review: false } as any);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["dish-ingredients", variables.dish_id] });
      queryClient.invalidateQueries({ queryKey: ["dish-recipe-lines"] });
      queryClient.invalidateQueries({ queryKey: ["dishes"] });
      toast({ title: "Ingredient added to dish" });
    },
    onError: (error) => {
      toast({ title: "Error adding ingredient", description: error.message, variant: "destructive" });
    },
  });
}

/** Edit an existing recipe line's quantity / unit (clears the needs-review flag). */
export function useUpdateDishIngredient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      id: string;
      dish_id: string;
      quantity?: number;
      unit?: string;
      cost_mode?: "inventory" | "manual";
      manual_line_cost?: number | null;
      manual_cost_effective_from?: string | null;
    }) => {
      const { id, dish_id: _d, ...rest } = data;
      const patch: Record<string, unknown> = { ...rest };
      if (rest.quantity !== undefined || rest.unit !== undefined) patch.needs_unit_review = false;
      const { error } = await supabase
        .from("dish_ingredients")
        .update(patch as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["dish-ingredients"] });
      queryClient.invalidateQueries({ queryKey: ["dish-recipe-lines"] });
      queryClient.invalidateQueries({ queryKey: ["dishes"] });
      toast({ title: "Recipe line updated" });
    },
    onError: (error) => {
      toast({ title: "Error updating recipe line", description: error.message, variant: "destructive" });
    },
  });
}


export function useRemoveDishIngredient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dish_id }: { id: string; dish_id: string }) => {
      const { error } = await supabase.from("dish_ingredients").delete().eq("id", id);
      if (error) throw error;
      return dish_id;
    },
    onSuccess: (dish_id) => {
      queryClient.invalidateQueries({ queryKey: ["dish-ingredients", dish_id] });
      queryClient.invalidateQueries({ queryKey: ["dish-recipe-lines"] });
      queryClient.invalidateQueries({ queryKey: ["dishes"] });
      toast({ title: "Ingredient removed from dish" });
    },
    onError: (error) => {
      toast({ title: "Error removing ingredient", description: error.message, variant: "destructive" });
    },
  });
}

/** Set / change / clear a dish's linked base recipe. */
export function useSetDishRecipeLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (d: { id: string; base_dish_id: string | null; recipe_multiplier: number | null }) => {
      const { error } = await supabase
        .from("dishes")
        .update({ base_dish_id: d.base_dish_id, recipe_multiplier: d.recipe_multiplier } as any)
        .eq("id", d.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dishes"] });
      queryClient.invalidateQueries({ queryKey: ["dish-recipe-lines"] });
      toast({ title: "Recipe link saved" });
    },
    onError: (error) => toast({ title: "Could not link recipe", description: error.message, variant: "destructive" }),
  });
}

/** Explicit unlink: copies the scaled lines into the dish's own recipe. */
export function useConvertLinkedRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dishId: string) => {
      const { error } = await supabase.rpc("convert_linked_recipe", { p_dish_id: dishId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dishes"] });
      queryClient.invalidateQueries({ queryKey: ["dish-ingredients"] });
      queryClient.invalidateQueries({ queryKey: ["dish-recipe-lines"] });
      toast({ title: "Converted to own recipe" });
    },
    onError: (error) => toast({ title: "Could not convert recipe", description: error.message, variant: "destructive" }),
  });
}

/** Resolve a dish's recipe source by following links (max depth 5, mirrors the DB). */
export function resolveRecipeSource(
  dishId: string,
  byId: Map<string, Pick<Dish, "id" | "base_dish_id" | "recipe_multiplier" | "use_direct_cost">>
): { sourceId: string; factor: number; broken: boolean } {
  let cur = dishId;
  let factor = 1;
  for (let i = 0; i < 6; i++) {
    const d = byId.get(cur);
    if (!d || !d.base_dish_id) {
      const broken = cur !== dishId && !!d?.use_direct_cost;
      return { sourceId: cur, factor, broken };
    }
    if (i === 5 || !d.recipe_multiplier || d.recipe_multiplier <= 0) return { sourceId: cur, factor, broken: true };
    factor *= Number(d.recipe_multiplier);
    cur = d.base_dish_id;
  }
  return { sourceId: cur, factor, broken: true };
}
