import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface StockLevel {
  id: string;
  ingredient_id: string;
  location_id: string;
  quantity: number;
  updated_at: string;
  ingredients?: { name: string; unit: string; reorder_point: number | null; par_level: number | null };
  locations?: { name: string };
}

export function useStockLevels(locationId?: string) {
  return useQuery({
    queryKey: ["stock-levels", locationId],
    queryFn: async () => {
      let query = supabase
        .from("stock_levels")
        .select("*, ingredients(name, unit, reorder_point, par_level), locations(name)")
        .order("updated_at", { ascending: false });
      
      if (locationId) {
        query = query.eq("location_id", locationId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as StockLevel[];
    },
  });
}

// Alias for backward compatibility
export const useStock = useStockLevels;

export function useUpdateStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ingredient_id, location_id, quantity }: { ingredient_id: string; location_id: string; quantity: number }) => {
      const { data, error } = await supabase
        .from("stock_levels")
        .upsert({ ingredient_id, location_id, quantity }, { onConflict: "ingredient_id,location_id" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
      toast({ title: "Stock updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Error updating stock", description: error.message, variant: "destructive" });
    },
  });
}
