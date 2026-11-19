import { useQuery } from "@tanstack/react-query";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { loadCanonicalRevenue } from "@/lib/canonicalRevenueLoader";

/**
 * Per-location gross revenue for the selected range, from the SAME canonical
 * per-location/day rule as the Dashboard headline and Reports. A location with
 * no recorded revenue is absent (shown as "—", not €0).
 */
export function useLocationRevenue(startDate: string, endDate: string) {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;

  return useQuery({
    queryKey: ["location-revenue", restaurantId, "all", startDate, endDate],
    queryFn: async (): Promise<Record<string, number>> => {
      if (!restaurantId) return {};
      const r = await loadCanonicalRevenue(restaurantId, null, startDate, endDate);
      return r.revenue.byLocation;
    },
    enabled: !!restaurantId && !!startDate && !!endDate,
    staleTime: 30_000,
  });
}
