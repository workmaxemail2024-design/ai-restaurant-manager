import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type UnitType = "kg" | "g" | "L" | "ml" | "oz" | "each";
export type StorageType = "freezer" | "fridge" | "dry";
export type PackUnit = "each" | "g" | "kg" | "ml" | "L";
export type PurchaseUnit = "each" | "g" | "kg" | "ml" | "L" | "case";

/**
 * Inventory item classification. The inventory master holds ALL restaurant stock,
 * not just food used in recipes. Existing records default to `recipe_ingredient`
 * so current recipes and theoretical usage keep working unchanged.
 */
export type InventoryItemType = "recipe_ingredient" | "direct_sale" | "operational";

export const INVENTORY_ITEM_TYPES: {
  value: InventoryItemType;
  label: string;
  description: string;
}[] = [
  {
    value: "recipe_ingredient",
    label: "Recipe ingredient",
    description: "Used inside dish recipes (chicken breast, cream, potatoes). Usage = dish sales × recipe quantity.",
  },
  {
    value: "direct_sale",
    label: "Direct sale item",
    description: "Sold as-is (bottled beer, wine, cans). Usage = quantity sold on the POS — no recipe needed.",
  },
  {
    value: "operational",
    label: "Operational / consumable",
    description: "Napkins, takeaway boxes, cleaning chemicals. Usage comes from manual adjustments and counts.",
  },
];

export function itemTypeLabel(t?: InventoryItemType | string | null): string {
  return INVENTORY_ITEM_TYPES.find((i) => i.value === t)?.label || "Recipe ingredient";
}

/** Only recipe ingredients may be added to a dish recipe. */
export function isRecipeIngredient(item: { item_type?: string | null }): boolean {
  return (item.item_type ?? "recipe_ingredient") === "recipe_ingredient";
}

export interface Ingredient {
  id: string;
  name: string;
  unit: UnitType;
  supplier_id: string | null;
  storage_type: StorageType;
  default_cost_price: number;
  item_type: InventoryItemType;
  linked_dish_id: string | null;
  purchase_unit: PurchaseUnit | null;
  pack_size: number | null;
  pack_unit: PackUnit | null;
  cost_per_pack: number | null;
  reorder_point: number | null;
  par_level: number | null;
  shelf_life_days: number | null;
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
  item_type?: InventoryItemType;
  linked_dish_id?: string | null;
  purchase_unit?: PurchaseUnit | null;
  pack_size?: number | null;
  pack_unit?: PackUnit | null;
  cost_per_pack?: number | null;
  reorder_point?: number | null;
  par_level?: number | null;
  shelf_life_days?: number | null;
};


// Calculate cost per base unit (g for weight, ml for volume, each for count)
export function calculateBaseCost(ingredient: Ingredient): number {
  const { pack_size, pack_unit, cost_per_pack, default_cost_price } = ingredient;
  
  // Fallback to default_cost_price if pack data not set (backward compatibility)
  if (!pack_size || pack_size <= 0 || !cost_per_pack || cost_per_pack <= 0) {
    return Number(default_cost_price) || 0;
  }
  
  // Calculate multiplier to convert to base units
  let multiplier = 1;
  switch (pack_unit) {
    case "kg": multiplier = 1000; break; // 1kg = 1000g
    case "L": multiplier = 1000; break;  // 1L = 1000ml
    case "g":
    case "ml":
    case "each":
    default: multiplier = 1;
  }
  
  return cost_per_pack / (pack_size * multiplier);
}

// Get display unit for base cost (g, ml, or each)
export function getBaseUnit(packUnit: PackUnit | null | undefined): string {
  if (!packUnit) return "unit";
  switch (packUnit) {
    case "kg":
    case "g": return "g";
    case "L":
    case "ml": return "ml";
    case "each":
    default: return "each";
  }
}

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

/**
 * Inventory master alias. Same data as `useIngredients`, named for the wider
 * model (recipe ingredients + direct-sale products + operational consumables).
 */
export const useInventoryItems = useIngredients;
