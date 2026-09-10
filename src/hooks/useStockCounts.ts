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
      const changedLines = input.lines.filter(
        (line) => Math.abs(line.counted_quantity - line.expected_quantity) > 0.0001
      );

      const { data: count, error: countError } = await supabase
        .from("stock_counts")
        .insert({
          restaurant_id: input.restaurant_id,
          location_id: input.location_id,
          count_date: input.count_date,
          scope_type: input.scope_type,
          scope_value: input.scope_value,
          status: "submitted",
          notes: input.notes ?? null,
        })
        .select()
        .single();

      if (countError) throw countError;

      if (input.lines.length > 0) {
        const { error: linesError } = await supabase.from("stock_count_lines").insert(
          input.lines.map((line) => ({
            count_id: count.id,
            ingredient_id: line.ingredient_id,
            expected_quantity: line.expected_quantity,
            counted_quantity: line.counted_quantity,
            location_id: input.location_id,
            restaurant_id: input.restaurant_id,
          }))
        );
        if (linesError) throw linesError;
      }

      // Apply physical stock corrections for every line (even unchanged lines refresh the timestamp).
      for (const line of input.lines) {
        const { error: upsertError } = await supabase.from("stock_levels").upsert(
          {
            ingredient_id: line.ingredient_id,
            location_id: input.location_id,
            quantity: line.counted_quantity,
          },
          { onConflict: "ingredient_id,location_id" }
        );
        if (upsertError) throw upsertError;
      }

      // Record count-specific audit adjustments for changed lines so the adjustment log
      // shows a traceable correction tied to this count session.
      if (changedLines.length > 0) {
        const { error: adjError } = await supabase.from("stock_adjustments").insert(
          changedLines.map((line) => ({
            ingredient_id: line.ingredient_id,
            location_id: input.location_id,
            restaurant_id: input.restaurant_id,
            adjustment_type: "count" as const,
            quantity: Math.abs(line.counted_quantity - line.expected_quantity),
            reason: `Stock count ${input.count_date}${input.notes ? " — " + input.notes : ""}`,
            count_id: count.id,
          }))
        );
        if (adjError) throw adjError;
      }

      return count;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-counts"] });
      queryClient.invalidateQueries({ queryKey: ["stock-count-latest-lines"] });
      queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
      queryClient.invalidateQueries({ queryKey: ["stock-adjustments"] });
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
