import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface Dish {
  id: string;
  name: string;
  category: string | null;
  location_id: string | null;
  selling_price: number;
  created_at: string;
  updated_at: string;
  locations?: { name: string } | null;
  dish_cost?: number;
  profit_margin?: number;
}

export interface DishIngredient {
  id: string;
  dish_id: string;
  ingredient_id: string;
  quantity: number;
  ingredients?: { name: string; unit: string };
}

export type DishInsert = {
  name: string;
  category?: string | null;
  location_id?: string | null;
  selling_price: number;
};

export function useDishes() {
  return useQuery({
    queryKey: ["dishes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dishes")
        .select("*, locations(name)")
        .order("name");
      if (error) throw error;
      
      // Calculate cost and margin for each dish
      const dishesWithMetrics = await Promise.all(
        data.map(async (dish) => {
          const { data: costData } = await supabase.rpc("calculate_dish_cost", { p_dish_id: dish.id });
          const { data: marginData } = await supabase.rpc("calculate_dish_margin", { p_dish_id: dish.id });
          return {
            ...dish,
            dish_cost: costData || 0,
            profit_margin: marginData || 0,
          };
        })
      );
      
      return dishesWithMetrics as Dish[];
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
      return data as DishIngredient[];
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
        .insert(dish)
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
        .update(dish)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dishes"] });
      toast({ title: "Dish updated successfully" });
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
    mutationFn: async (data: { dish_id: string; ingredient_id: string; quantity: number }) => {
      const { error } = await supabase.from("dish_ingredients").insert(data);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["dish-ingredients", variables.dish_id] });
      queryClient.invalidateQueries({ queryKey: ["dishes"] });
      toast({ title: "Ingredient added to dish" });
    },
    onError: (error) => {
      toast({ title: "Error adding ingredient", description: error.message, variant: "destructive" });
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
      queryClient.invalidateQueries({ queryKey: ["dishes"] });
      toast({ title: "Ingredient removed from dish" });
    },
    onError: (error) => {
      toast({ title: "Error removing ingredient", description: error.message, variant: "destructive" });
    },
  });
}
