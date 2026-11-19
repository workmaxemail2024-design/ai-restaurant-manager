import { unwrapQuery } from "@/lib/revenueTruth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { dedupePosSales } from "@/lib/revenueTruth";

/**
 * Per-location revenue for the currently selected date range.
 * Uses the SAME source and scoping as the dashboard revenue truth
 * (public.sales, scoped by restaurant_id + sale_date range) so Location Status
 * cards can never disagree with the Financial Summary / Operational Snapshot.
 */
export function useLocationRevenue(startDate: string, endDate: string) {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;

  return useQuery({
    queryKey: ["location-revenue", restaurantId, "all", startDate, endDate],
    queryFn: async (): Promise<Record<string, number>> => {
      if (!restaurantId) return {};
      const data = unwrapQuery(await supabase
        .from("sales")
        .select("location_id, total_price, sale_date, source")
        .eq("restaurant_id", restaurantId)
        .gte("sale_date", startDate)
        .lte("sale_date", endDate), "sales");

      const totals: Record<string, number> = {};
      for (const row of dedupePosSales((data as any[]) ?? [])) {
        if (!row.location_id) continue;
        totals[row.location_id] =
          (totals[row.location_id] || 0) + Number(row.total_price || 0);
      }
      return totals;
    },
    enabled: !!restaurantId && !!startDate && !!endDate,
    staleTime: 30_000,
  });
}
