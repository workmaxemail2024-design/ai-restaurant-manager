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
        .gte("created_at", `${date}T00:00:00`)
        .lte("created_at", `${date}T23:59:59`)
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

      const { data: existing } = await supabase
        .from("stock_levels")
        .select("quantity")
        .eq("ingredient_id", input.ingredientId)
        .eq("location_id", input.locationId)
        .maybeSingle();

      const current = existing ? Number(existing.quantity) : 0;
      const isSpotCount = input.spotCount != null;
      // Spot count: adjustment quantity is the difference vs the counted amount
      const quantity = isSpotCount ? current - Number(input.spotCount) : input.quantity;

      const reason = [input.reasonLabel, input.note?.trim()].filter(Boolean).join(" — ");

      const { error } = await supabase.from("stock_adjustments").insert({
        restaurant_id: restaurantId,
        ingredient_id: input.ingredientId,
        location_id: input.locationId,
        adjustment_type: input.adjustmentType,
        quantity,
        reason,
      });
      if (error) throw error;

      const newQuantity = isSpotCount
        ? Math.max(0, Number(input.spotCount))
        : Math.max(0, current - input.quantity);

      const { error: stockError } = await supabase
        .from("stock_levels")
        .upsert(
          {
            restaurant_id: restaurantId,
            ingredient_id: input.ingredientId,
            location_id: input.locationId,
            quantity: newQuantity,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "ingredient_id,location_id" }
        );
      if (stockError) throw stockError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["day-stock-adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["stock-adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
      queryClient.invalidateQueries({ queryKey: ["stock-variance"] });
      toast({ title: "Stock adjustment recorded" });
    },
    onError: (error: Error) =>
      toast({ title: "Could not record adjustment", description: error.message, variant: "destructive" }),
  });
}
