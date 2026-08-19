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

/**
 * Variance report data.
 *
 * Physical (counted) stock and theoretical stock are kept strictly separate:
 *   theoretical = last counted quantity
 *               + deliveries received since the count
 *               - theoretical recipe consumption since the count
 *               - adjustments / waste since the count
 * Imported sales are never permanently deducted from physical stock.
 */
export interface VarianceItem {
  ingredient_id: string;
  ingredient_name: string;
  unit: string;
  location_id: string;
  location_name: string;
  counted_at: string;
  counted_quantity: number;
  deliveries: number;
  consumption: number;
  adjustments: number;
  theoretical_quantity: number;
  variance: number;
  variance_percent: number;
}

export function useStockVariance(locationId?: string) {
  return useQuery({
    queryKey: ["stock-variance", locationId],
    queryFn: async () => {
      // Physical counts (authoritative actual stock)
      let stockQuery = supabase
        .from("stock_levels")
        .select("*, ingredients(name, unit), locations(name)");
      if (locationId) stockQuery = stockQuery.eq("location_id", locationId);
      const { data: stockLevels, error: stockError } = await stockQuery;
      if (stockError) throw stockError;

      const stocks = stockLevels || [];
      if (stocks.length === 0) return [] as VarianceItem[];

      // Earliest count date bounds every "since last count" window.
      const earliestCount = stocks.reduce(
        (min, s) => (s.updated_at < min ? s.updated_at : min),
        stocks[0].updated_at as string,
      );

      // Adjustments / waste recorded since the earliest count
      let adjustmentsQuery = supabase
        .from("stock_adjustments")
        .select("ingredient_id, location_id, quantity, created_at")
        .gte("created_at", earliestCount);
      if (locationId) adjustmentsQuery = adjustmentsQuery.eq("location_id", locationId);
      const { data: adjustments, error: adjError } = await adjustmentsQuery;
      if (adjError) throw adjError;

      // Deliveries received since the earliest count
      let deliveriesQuery = supabase
        .from("purchase_order_items")
        .select(
          "ingredient_id, quantity, purchase_orders!inner(location_id, status, received_at)",
        )
        .gte("purchase_orders.received_at", earliestCount);
      if (locationId) deliveriesQuery = deliveriesQuery.eq("purchase_orders.location_id", locationId);
      const { data: deliveries } = await deliveriesQuery;

      // Theoretical consumption, always recalculated from sales × recipes.
      const { data: usage } = await supabase.rpc("get_theoretical_usage", {
        p_location_id: locationId ?? null,
        p_start: earliestCount.split("T")[0],
        p_end: null,
      });
      const usageTotals = new Map<string, number>();
      ((usage || []) as any[]).forEach((u) => {
        usageTotals.set(
          u.ingredient_id,
          (usageTotals.get(u.ingredient_id) || 0) + Number(u.quantity_used || 0),
        );
      });

      const items: VarianceItem[] = stocks.map((stock) => {
        const countedAt = stock.updated_at as string;
        const countedQuantity = Number(stock.quantity);

        const adjustmentTotal = (adjustments || [])
          .filter(
            (a) =>
              a.ingredient_id === stock.ingredient_id &&
              a.location_id === stock.location_id &&
              a.created_at >= countedAt,
          )
          .reduce((sum, a) => sum + Number(a.quantity || 0), 0);

        const deliveryTotal = ((deliveries || []) as any[])
          .filter(
            (d) =>
              d.ingredient_id === stock.ingredient_id &&
              d.purchase_orders?.received_at &&
              d.purchase_orders.received_at >= countedAt,
          )
          .reduce((sum, d) => sum + Number(d.quantity || 0), 0);

        const consumption = usageTotals.get(stock.ingredient_id) || 0;

        const theoreticalQuantity = Math.max(
          0,
          countedQuantity + deliveryTotal - consumption - adjustmentTotal,
        );
        const variance = countedQuantity - theoreticalQuantity;
        const variancePercent =
          theoreticalQuantity > 0 ? (variance / theoreticalQuantity) * 100 : 0;

        return {
          ingredient_id: stock.ingredient_id,
          ingredient_name: stock.ingredients?.name || "Unknown",
          unit: stock.ingredients?.unit || "",
          location_id: stock.location_id,
          location_name: stock.locations?.name || "Unknown",
          counted_at: countedAt,
          counted_quantity: countedQuantity,
          deliveries: deliveryTotal,
          consumption,
          adjustments: adjustmentTotal,
          theoretical_quantity: theoreticalQuantity,
          variance,
          variance_percent: variancePercent,
        };
      });

      // Only rows where theoretical movement has occurred since the count.
      return items.filter(
        (i) => i.deliveries > 0 || i.consumption > 0 || i.adjustments > 0,
      );
    },
  });
}

