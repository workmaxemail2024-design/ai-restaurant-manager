import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { classifyLocationActivity, type LocationActivity, type LocationActivityCounts } from "@/lib/locationActivity";

const countFor = async (table: string, locationId: string) => {
  const { count, error } = await (supabase.from(table as any) as any)
    .select("id", { count: "exact", head: true })
    .eq("location_id", locationId);
  if (error) throw error;
  return count ?? 0;
};

/** Per-location record counts (read-only). Failed reads surface as an error, never as "no activity". */
export function useLocationActivity(locationIds: string[]) {
  const { currentRestaurant } = useRestaurant();
  return useQuery({
    queryKey: ["location-activity", currentRestaurant?.id, locationIds.join(",")],
    enabled: !!currentRestaurant?.id && locationIds.length > 0,
    queryFn: async () => {
      const out: Record<string, LocationActivityCounts & { activity: LocationActivity }> = {};
      for (const id of locationIds) {
        const [sales, summaries, staged, integrations] = await Promise.all([
          countFor("sales", id), countFor("pos_daily_summaries", id),
          countFor("pos_captiva_daily_sources", id), countFor("pos_integrations", id),
        ]);
        const c = { sales, summaries, staged, integrations };
        out[id] = { ...c, activity: classifyLocationActivity(c) };
      }
      return out;
    },
  });
}
