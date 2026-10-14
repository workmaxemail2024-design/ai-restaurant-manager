import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface StockCountLine {
  id: string;
  count_id: string;
  ingredient_id: string;
  location_id: string;
  restaurant_id: string;
  expected_quantity: number;
  counted_quantity: number;
  difference: number;
  created_at: string;
  ingredients?: { name: string; unit: string; item_group: string | null; category: string | null } | null;
}

export interface StockCount {
  id: string;
  restaurant_id: string;
  location_id: string;
  count_date: string;
  scope_type: string;
  scope_value: string | null;
  status: string;
  notes: string | null;
  submitted_by: string;
  submitted_at: string;
  created_at: string;
  updated_at: string;
  locations?: { name: string } | null;
  stock_count_lines?: StockCountLine[];
}

export interface StockCountInput {
  restaurant_id: string;
  location_id: string;
  count_date: string;
  scope_type: "all" | "group" | "category";
  scope_value: string | null;
  notes?: string;
  lines: {
    ingredient_id: string;
    expected_quantity: number;
    counted_quantity: number;
  }[];
}

export function useStockCounts(locationId?: string) {
  return useQuery({
    queryKey: ["stock-counts", locationId],
    queryFn: async () => {
      let query = supabase
        .from("stock_counts")
        .select(
          "*, locations(name), stock_count_lines(*, ingredients(name, unit, item_group, category))"
        )
        .order("submitted_at", { ascending: false })
        .limit(200);

      if (locationId) {
        query = query.eq("location_id", locationId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as StockCount[];
    },
  });
}


export function useCreateStockCount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: StockCountInput) => {
      // One server transaction: count header, lines and ledger corrections.
      // Expected quantities are recalculated server-side from the stock ledger at the count date.
      const { data, error } = await supabase.rpc("submit_stock_count", {
        p_location_id: input.location_id,
        p_count_date: input.count_date,
        p_scope_type: input.scope_type,
        p_scope_value: input.scope_value ?? undefined,
        p_notes: input.notes ?? undefined,
        p_lines: input.lines.map((l) => ({ ingredient_id: l.ingredient_id, counted_quantity: l.counted_quantity })),
      } as any);
      if (error) throw error;
      return { id: data as unknown as string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-counts"] });
      queryClient.invalidateQueries({ queryKey: ["stock-count-latest-lines"] });
      queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
      queryClient.invalidateQueries({ queryKey: ["stock-adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      toast({ title: "Stock count submitted" });
    },
    onError: (error) => {
      toast({
        title: "Error submitting stock count",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
