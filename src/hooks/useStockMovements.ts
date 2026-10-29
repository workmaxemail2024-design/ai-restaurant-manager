import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useRestaurant } from "@/contexts/RestaurantContext";

export interface StockMovement {
  id: string;
  ingredient_id: string;
  location_id: string;
  movement_type: string;
  quantity: number;
  effective_at: string;
  effective_date: string;
  unit_cost: number | null;
  cost_source: string;
  source_type: string;
  source_id: string | null;
  reverses_movement_id: string | null;
  rebase_of_movement_id: string | null;
  reason: string | null;
  created_at: string;
  ingredients?: { name: string; unit: string } | null;
  locations?: { name: string } | null;
}

export const MOVEMENT_LABEL: Record<string, string> = {
  opening_balance: "Opening balance",
  receipt: "Delivery",
  waste: "Waste",
  spoilage: "Spoilage",
  damage: "Breakage",
  theft: "Theft",
  staff_meal: "Staff meal",
  other: "Other",
  count_correction: "Count correction",
  count_rebase: "Auto-adjusted (late entry)",
  manual_correction: "Manual correction",
  reversal: "Reversal",
};

/** Types a user may reverse. Counts are corrected by a new count, never reversed. */
export const REVERSIBLE = new Set(["receipt", "waste", "spoilage", "damage", "theft", "staff_meal", "other", "manual_correction"]);

/** Immutable stock movement history (newest effective date first). */
export function useStockMovements(locationId?: string | null) {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;
  return useQuery({
    queryKey: ["stock-movements", restaurantId, locationId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("stock_movements")
        .select("*, ingredients(name, unit), locations(name)")
        .eq("restaurant_id", restaurantId!)
        .order("effective_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(300);
      if (locationId) q = q.eq("location_id", locationId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as StockMovement[];
    },
    enabled: !!restaurantId,
  });
}

export function useReverseStockMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc("reverse_stock_movement", { p_movement_id: id, p_reason: reason } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      qc.invalidateQueries({ queryKey: ["stock-levels"] });
      qc.invalidateQueries({ queryKey: ["stock-adjustments"] });
      toast({ title: "Entry reversed", description: "A reversing entry was added; the original stays in the history." });
    },
    onError: (e: Error) => toast({ title: "Could not reverse", description: e.message, variant: "destructive" }),
  });
}
