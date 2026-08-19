import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { subDays, format } from "date-fns";
import {
  getStockStatus,
  getUsageConfidence,
  getWastageRisk,
  MIN_USAGE_DAYS,
  StockStatus,
  UsageConfidence,
  WastageRisk,
} from "@/lib/inventoryStatus";

export interface ForecastRow {
  id: string;
  name: string;
  unit: string;
  /** Physical stock on hand (stock_levels only — never reduced by imported sales). */
  currentStock: number;
  reorderPoint: number | null;
  parLevel: number | null;
  shelfLifeDays: number | null;
  status: StockStatus;
  /** Theoretical usage from sales × recipes over the window. */
  usageInWindow: number;
  avgDailyUsage: number | null;
  daysUntilStockout: number | null;
  confidence: UsageConfidence;
  wastageRisk: WastageRisk;
  wastageReason: string;
  reorderQty: number | null;
  hasRecipeLink: boolean;
}

export interface ForecastResult {
  rows: ForecastRow[];
  /** Number of distinct days in the window that have sales data. */
  daysWithData: number;
  windowDays: number;
  /** Prerequisites that are missing platform-wide. */
  prerequisites: { key: string; label: string; ok: boolean; detail: string }[];
}

const WINDOW_DAYS = 30;

export function useInventoryForecast(locationId?: string | null) {
  const { currentRestaurant } = useRestaurant();

  return useQuery<ForecastResult>({
    queryKey: ["inventory-forecast", currentRestaurant?.id, locationId ?? "all", WINDOW_DAYS],
    enabled: !!currentRestaurant,
    queryFn: async () => {
      const end = format(new Date(), "yyyy-MM-dd");
      const start = format(subDays(new Date(), WINDOW_DAYS - 1), "yyyy-MM-dd");

      const [ingredientsRes, stockRes, usageRes, posDaysRes, recipeRes] = await Promise.all([
        supabase
          .from("ingredients")
          .select("id, name, unit, reorder_point, par_level, shelf_life_days")
          .order("name"),
        supabase.from("stock_levels").select("ingredient_id, location_id, quantity"),
        supabase.rpc("get_theoretical_usage", {
          p_location_id: locationId ?? null,
          p_start: start,
          p_end: end,
        }),
        supabase
          .from("pos_daily_summaries")
          .select("report_date")
          .gte("report_date", start)
          .lte("report_date", end),
        supabase.from("dish_ingredients").select("ingredient_id"),
      ]);

      if (ingredientsRes.error) throw ingredientsRes.error;
      if (stockRes.error) throw stockRes.error;
      if (usageRes.error) throw usageRes.error;

      const ingredients = ingredientsRes.data || [];

      // Physical stock on hand, optionally scoped to the selected location.
      const stockByIngredient = new Map<string, number>();
      (stockRes.data || [])
        .filter((s) => !locationId || s.location_id === locationId)
        .forEach((s) => {
          stockByIngredient.set(
            s.ingredient_id,
            (stockByIngredient.get(s.ingredient_id) || 0) + Number(s.quantity || 0),
          );
        });

      // Theoretical usage recalculated from sales × recipes (never a stored deduction).
      const usageByIngredient = new Map<string, number>();
      ((usageRes.data || []) as any[]).forEach((u) => {
        usageByIngredient.set(u.ingredient_id, Number(u.quantity_used || 0));
      });

      const recipeIngredientIds = new Set(
        ((recipeRes.data || []) as any[]).map((r) => r.ingredient_id),
      );

      const daysWithData = new Set(
        ((posDaysRes.data || []) as any[]).map((d) => d.report_date),
      ).size;

      const rows: ForecastRow[] = ingredients.map((ing: any) => {
        const currentStock = stockByIngredient.get(ing.id) || 0;
        const usageInWindow = usageByIngredient.get(ing.id) || 0;
        const confidence = getUsageConfidence({ daysWithData, quantityUsed: usageInWindow });

        const avgDailyUsage =
          confidence === "none" ? null : usageInWindow / Math.max(daysWithData, 1);
        const daysUntilStockout =
          avgDailyUsage && avgDailyUsage > 0 ? currentStock / avgDailyUsage : null;

        const reorderPoint = ing.reorder_point === null ? null : Number(ing.reorder_point);
        const parLevel = ing.par_level === null ? null : Number(ing.par_level);
        const shelfLifeDays = ing.shelf_life_days ?? null;

        const { risk, reason } = getWastageRisk({
          shelfLifeDays,
          daysOfSupply: daysUntilStockout,
          confidence,
        });

        // Reorder quantity only when a par level exists — never guessed from usage.
        const reorderQty =
          parLevel && parLevel > currentStock ? parLevel - currentStock : null;

        return {
          id: ing.id,
          name: ing.name,
          unit: ing.unit,
          currentStock,
          reorderPoint,
          parLevel,
          shelfLifeDays,
          status: getStockStatus(currentStock, reorderPoint),
          usageInWindow,
          avgDailyUsage,
          daysUntilStockout,
          confidence,
          wastageRisk: risk,
          wastageReason: reason,
          reorderQty,
          hasRecipeLink: recipeIngredientIds.has(ing.id),
        };
      });

      const withThreshold = rows.filter((r) => r.reorderPoint !== null).length;
      const withShelfLife = rows.filter((r) => r.shelfLifeDays !== null).length;
      const withStock = rows.filter((r) => r.currentStock > 0).length;

      const prerequisites = [
        {
          key: "sales_history",
          label: "Sales history",
          ok: daysWithData >= MIN_USAGE_DAYS,
          detail: `${daysWithData} of the last ${WINDOW_DAYS} days have sales data (need at least ${MIN_USAGE_DAYS}).`,
        },
        {
          key: "recipes",
          label: "Recipes linked to ingredients",
          ok: recipeIngredientIds.size > 0,
          detail:
            recipeIngredientIds.size > 0
              ? `${recipeIngredientIds.size} ingredients are used in dish recipes.`
              : "No dish recipes reference ingredients, so usage cannot be derived.",
        },
        {
          key: "counts",
          label: "Physical stock counts",
          ok: withStock > 0,
          detail: `${withStock} of ${rows.length} ingredients have a recorded stock level.`,
        },
        {
          key: "thresholds",
          label: "Reorder points",
          ok: withThreshold > 0,
          detail: `${withThreshold} of ${rows.length} ingredients have a reorder point. Items without one are never flagged Low.`,
        },
        {
          key: "shelf_life",
          label: "Shelf life",
          ok: withShelfLife > 0,
          detail: `${withShelfLife} of ${rows.length} ingredients have a shelf life. Wastage risk is only assessed for those.`,
        },
      ];

      return { rows, daysWithData, windowDays: WINDOW_DAYS, prerequisites };
    },
  });
}
