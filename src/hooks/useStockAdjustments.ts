import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type AdjustmentType = "waste" | "spoilage" | "theft" | "damage" | "correction" | "other";

export interface StockAdjustment {
  id: string;
  ingredient_id: string;
  location_id: string;
  restaurant_id: string | null;
  adjustment_type: AdjustmentType;
  quantity: number;
  reason: string | null;
  adjusted_by: string | null;
  created_at: string;
  ingredients?: { name: string; unit: string };
  locations?: { name: string };
}

export interface StockAdjustmentInsert {
  ingredient_id: string;
  location_id: string;
  adjustment_type: AdjustmentType;
  quantity: number;
  reason?: string;
  adjusted_by?: string;
}

export function useStockAdjustments(locationId?: string) {
  return useQuery({
    queryKey: ["stock-adjustments", locationId],
    queryFn: async () => {
      let query = supabase
        .from("stock_adjustments")
        .select("*, ingredients(name, unit), locations(name)")
        .order("created_at", { ascending: false })
        .limit(100);

      if (locationId) {
        query = query.eq("location_id", locationId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as StockAdjustment[];
    },
  });
}

export function useCreateStockAdjustment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (adjustment: StockAdjustmentInsert) => {
      // Insert the adjustment record
      const { data, error } = await supabase
        .from("stock_adjustments")
        .insert(adjustment)
        .select()
        .single();

      if (error) throw error;

      // Also update the stock level (reduce by the adjustment quantity)
      const { data: existingStock } = await supabase
        .from("stock_levels")
        .select("quantity")
        .eq("ingredient_id", adjustment.ingredient_id)
        .eq("location_id", adjustment.location_id)
        .single();

      if (existingStock) {
        const newQuantity = Math.max(0, Number(existingStock.quantity) - adjustment.quantity);
        await supabase
          .from("stock_levels")
          .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
          .eq("ingredient_id", adjustment.ingredient_id)
          .eq("location_id", adjustment.location_id);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
      toast({ title: "Stock adjustment recorded" });
    },
    onError: (error) => {
      toast({
        title: "Error recording adjustment",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
