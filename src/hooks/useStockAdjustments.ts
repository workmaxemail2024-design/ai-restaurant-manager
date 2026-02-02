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

// Variance report data: expected vs actual stock
export interface VarianceItem {
  ingredient_id: string;
  ingredient_name: string;
  unit: string;
  location_id: string;
  location_name: string;
  expected_quantity: number;
  actual_quantity: number;
  variance: number;
  variance_percent: number;
}

export function useStockVariance(locationId?: string) {
  return useQuery({
    queryKey: ["stock-variance", locationId],
    queryFn: async () => {
      // Get current stock levels
      let stockQuery = supabase
        .from("stock_levels")
        .select("*, ingredients(name, unit), locations(name)");

      if (locationId) {
        stockQuery = stockQuery.eq("location_id", locationId);
      }

      const { data: stockLevels, error: stockError } = await stockQuery;
      if (stockError) throw stockError;

      // Get adjustments to calculate expected (what stock should be without adjustments)
      let adjustmentsQuery = supabase
        .from("stock_adjustments")
        .select("ingredient_id, location_id, quantity");

      if (locationId) {
        adjustmentsQuery = adjustmentsQuery.eq("location_id", locationId);
      }

      const { data: adjustments, error: adjError } = await adjustmentsQuery;
      if (adjError) throw adjError;

      // Build adjustment totals map
      const adjustmentTotals = new Map<string, number>();
      adjustments?.forEach((adj) => {
        const key = `${adj.ingredient_id}-${adj.location_id}`;
        adjustmentTotals.set(key, (adjustmentTotals.get(key) || 0) + Number(adj.quantity));
      });

      // Calculate variance for each stock item
      const varianceItems: VarianceItem[] = (stockLevels || []).map((stock) => {
        const key = `${stock.ingredient_id}-${stock.location_id}`;
        const totalAdjustments = adjustmentTotals.get(key) || 0;
        const actualQuantity = Number(stock.quantity);
        // Expected = actual + adjustments (since adjustments reduced stock)
        const expectedQuantity = actualQuantity + totalAdjustments;
        const variance = actualQuantity - expectedQuantity;
        const variancePercent = expectedQuantity > 0 ? (variance / expectedQuantity) * 100 : 0;

        return {
          ingredient_id: stock.ingredient_id,
          ingredient_name: stock.ingredients?.name || "Unknown",
          unit: stock.ingredients?.unit || "",
          location_id: stock.location_id,
          location_name: stock.locations?.name || "Unknown",
          expected_quantity: expectedQuantity,
          actual_quantity: actualQuantity,
          variance,
          variance_percent: variancePercent,
        };
      });

      // Filter to only show items with variance
      return varianceItems.filter((item) => item.variance !== 0);
    },
  });
}
