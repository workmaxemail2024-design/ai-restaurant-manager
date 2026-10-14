import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type AdjustmentType = "waste" | "spoilage" | "theft" | "damage" | "correction" | "other" | "count";

export interface StockAdjustment {
  id: string;
  ingredient_id: string;
  location_id: string;
  restaurant_id: string | null;
  adjustment_type: AdjustmentType;
  quantity: number;
  reason: string | null;
  adjusted_by: string | null;
  count_id: string | null;
  effective_date?: string | null;
  created_at: string;
  ingredients?: { name: string; unit: string };
  locations?: { name: string };
  stock_counts?: { stock_count_lines?: { difference: number }[] } | null;
}

export interface StockAdjustmentInsert {
  ingredient_id: string;
  location_id: string;
  adjustment_type: AdjustmentType;
  quantity: number;
  reason?: string;
  adjusted_by?: string;
  count_id?: string;
  /** Date the waste/adjustment physically happened (defaults to today). */
  effective_date?: string;
}

export function useStockAdjustments(locationId?: string) {
  return useQuery({
    queryKey: ["stock-adjustments", locationId],
    queryFn: async () => {
      let query = supabase
        .from("stock_adjustments")
        .select("*, ingredients(name, unit), locations(name), stock_counts!count_id(stock_count_lines(difference))")
        .order("created_at", { ascending: false })
        .limit(200);

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
      if (adjustment.adjustment_type === "count") throw new Error("Use a stock count to record counted quantities");
      // One server transaction: adjustment record + ledger movement + stock on hand.
      const { data, error } = await supabase.rpc("record_stock_adjustment", {
        p_ingredient_id: adjustment.ingredient_id,
        p_location_id: adjustment.location_id,
        p_adjustment_type: adjustment.adjustment_type,
        p_quantity: adjustment.quantity,
        p_effective_date: adjustment.effective_date ?? new Date().toISOString().slice(0, 10),
        p_reason: [adjustment.reason, adjustment.adjusted_by ? `by ${adjustment.adjusted_by}` : null].filter(Boolean).join(" — ") || undefined,
      } as any);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
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
