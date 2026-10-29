import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useRestaurant } from "@/contexts/RestaurantContext";
import type { AdjustmentType } from "@/hooks/useStockAdjustments";

/** UI reasons mapped onto the existing stock_adjustments.adjustment_type values. */
export const DAY_STOCK_REASONS: { label: string; type: AdjustmentType }[] = [
  { label: "Wastage", type: "waste" },
  { label: "Spoilage", type: "spoilage" },
  { label: "Breakage", type: "damage" },
  { label: "Staff meal", type: "other" },
  { label: "Stock correction", type: "correction" },
  { label: "Other", type: "other" },
];

export interface DayStockAdjustment {
  id: string;
  ingredient_id: string;
  location_id: string;
  adjustment_type: AdjustmentType;
  quantity: number;
  reason: string | null;
  created_at: string;
  ingredientName: string;
  unit: string;
  isInvalid: boolean;
}

/** Stock adjustments recorded for a single day + location. */
export function useDayStockAdjustments(date: string, locationId: string | null) {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;

  return useQuery({
    queryKey: ["day-stock-adjustments", restaurantId, locationId ?? "all", date, date],
    queryFn: async () => {
      if (!restaurantId) return [] as DayStockAdjustment[];

      let q = supabase
        .from("stock_adjustments")
        .select("*, ingredients(name, unit)")
        .eq("effective_date", date)
        .order("created_at", { ascending: false });

      if (locationId) q = q.eq("location_id", locationId);

      const { data, error } = await q;
      if (error) throw error;

      return (data ?? []).map((row: any) => {
        const qty = Number(row.quantity);
        return {
          id: row.id,
          ingredient_id: row.ingredient_id,
          location_id: row.location_id,
          adjustment_type: row.adjustment_type as AdjustmentType,
          quantity: qty,
          reason: row.reason,
          created_at: row.created_at,
          ingredientName: row.ingredients?.name ?? "Unknown item",
          unit: row.ingredients?.unit ?? "",
          isInvalid: !Number.isFinite(qty) || qty <= 0,
        } as DayStockAdjustment;
      });
    },
    enabled: !!restaurantId && !!date,
  });
}

export interface RecordDayAdjustmentInput {
  ingredientId: string;
  locationId: string;
  quantity: number;
  adjustmentType: AdjustmentType;
  reasonLabel: string;
  note?: string | null;
  /** Absolute spot-count instead of a decrement */
  spotCount?: number | null;
  /** Day the waste/count physically happened (YYYY-MM-DD). */
  effectiveDate: string;
}

/** Record a wastage / correction using the existing stock_adjustments + stock_levels flow. */
export function useRecordDayStockAdjustment() {
  const queryClient = useQueryClient();
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;

  return useMutation({
    mutationFn: async (input: RecordDayAdjustmentInput) => {
      if (!restaurantId) throw new Error("No restaurant selected");
      if (!input.locationId) throw new Error("Select a location first");

      const reason = [input.reasonLabel, input.note?.trim()].filter(Boolean).join(" — ");
      if (input.spotCount != null) {
        // Spot count = a one-line stock count on the chosen day (server computes the correction).
        const { error } = await supabase.rpc("submit_stock_count", {
          p_location_id: input.locationId,
          p_count_date: input.effectiveDate,
          p_scope_type: "all",
          p_notes: reason || undefined,
          p_lines: [{ ingredient_id: input.ingredientId, counted_quantity: Number(input.spotCount) }],
        } as any);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.rpc("record_stock_adjustment", {
        p_ingredient_id: input.ingredientId,
        p_location_id: input.locationId,
        p_adjustment_type: input.adjustmentType,
        p_quantity: input.quantity,
        p_effective_date: input.effectiveDate,
        p_reason: reason || undefined,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["day-stock-adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["stock-adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
      queryClient.invalidateQueries({ queryKey: ["stock-variance"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      queryClient.invalidateQueries({ queryKey: ["stock-counts"] });
      toast({ title: "Stock adjustment recorded" });
    },
    onError: (error: Error) =>
      toast({ title: "Could not record adjustment", description: error.message, variant: "destructive" }),
  });
}
