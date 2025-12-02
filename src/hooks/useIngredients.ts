import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type UnitType = "kg" | "g" | "L" | "ml" | "oz" | "each";
export type StorageType = "freezer" | "fridge" | "dry";

export interface Ingredient {
  id: string;
  name: string;
  unit: UnitType;
  supplier_id: string | null;
  storage_type: StorageType;
  default_cost_price: number;
  created_at: string;
  updated_at: string;
  suppliers?: { name: string } | null;
}

export type IngredientInsert = {
  name: string;
  unit: UnitType;
  supplier_id?: string | null;
  storage_type: StorageType;
  default_cost_price: number;
};

export function useIngredients() {
  return useQuery({
    queryKey: ["ingredients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ingredients")
        .select("*, suppliers(name)")
        .order("name");
      if (error) throw error;
      return data as Ingredient[];
    },
  });
}

export function useCreateIngredient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ingredient: IngredientInsert) => {
      const { data, error } = await supabase
        .from("ingredients")
        .insert(ingredient)
        .select()
        .single();
      if (error) throw error;
      
      // Create initial price record
      await supabase.from("ingredient_prices").insert({
        ingredient_id: data.id,
        cost_price: ingredient.default_cost_price,
      });
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      toast({ title: "Ingredient created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error creating ingredient", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateIngredient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...ingredient }: Partial<IngredientInsert> & { id: string }) => {
      const { data, error } = await supabase
        .from("ingredients")
        .update(ingredient)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      
      // If price changed, create new price record
      if (ingredient.default_cost_price !== undefined) {
        await supabase.from("ingredient_prices").insert({
          ingredient_id: id,
          cost_price: ingredient.default_cost_price,
        });
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      toast({ title: "Ingredient updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Error updating ingredient", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteIngredient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ingredients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      toast({ title: "Ingredient deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error deleting ingredient", description: error.message, variant: "destructive" });
    },
  });
}
