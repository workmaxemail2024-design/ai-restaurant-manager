import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useLocation } from "@/contexts/LocationContext";
import { buildProductsSold, readAllProductPages } from "@/lib/productsSold";

export function useProductsSold(start: string, end: string) {
  const { currentRestaurant } = useRestaurant();
  const { selectedLocationId } = useLocation();
  const restaurantId = currentRestaurant?.id;
  return useQuery({
    queryKey: ["products-sold", restaurantId, selectedLocationId ?? "all", start, end],
    enabled: !!restaurantId,
    queryFn: async () => {
      if (!restaurantId) throw new Error("Choose a restaurant");
      // Every read uses the caller's existing RLS; no raw journal payload / PII / admin client.
      const locations = await readAllProductPages(async (offset, size) => {
        let q = supabase.from("locations").select("id,name").eq("restaurant_id", restaurantId).order("id").range(offset, offset + size - 1);
        if (selectedLocationId) q = q.eq("id", selectedLocationId);
        return await q;
      });
      const ids = locations.map(l => l.id);
      if (!ids.length) return { ...buildProductsSold({ restaurantId, locationIds: [], start, end, snapshots: [], observations: [], posted: [], catalogue: [] }), locations };
      const [snapshots, observations, sales, catalogue] = await Promise.all([
        readAllProductPages(async (offset, size) => await supabase.from("pos_captiva_daily_sources")
          .select("id,restaurant_id,location_id,trading_date,observed_at,journal_coverage")
          .eq("restaurant_id", restaurantId).in("location_id", ids).gte("trading_date", start).lte("trading_date", end)
          .order("trading_date").order("location_id").order("observed_at").order("id").range(offset, offset + size - 1)),
        readAllProductPages(async (offset, size) => await supabase.from("pos_captiva_product_observations")
          .select("id,source_id,restaurant_id,location_id,trading_date,product_id,description,product_type,quantity")
          .eq("restaurant_id", restaurantId).in("location_id", ids).gte("trading_date", start).lte("trading_date", end)
          .order("trading_date").order("location_id").order("source_id").order("id").range(offset, offset + size - 1)),
        readAllProductPages(async (offset, size) => await supabase.from("sales")
          .select("id,location_id,sale_date,source,dish_id,quantity,pos_import_id,dishes(name)")
          .eq("restaurant_id", restaurantId).in("location_id", ids).gte("sale_date", start).lte("sale_date", end)
          .order("sale_date").order("location_id").order("id").range(offset, offset + size - 1)),
        readAllProductPages(async (offset, size) => await supabase.from("external_pos_items")
          .select("location_id,external_item_id,manual_type,manual_drink_type,department")
          .eq("restaurant_id", restaurantId).in("location_id", ids).order("id").range(offset, offset + size - 1)),
      ]);
      // The generated schema has no sales→import relationship. Resolve exact import IDs
      // separately rather than relying on an unsupported PostgREST embed.
      const importIds = [...new Set(sales.flatMap(s => s.pos_import_id ? [s.pos_import_id] : []))];
      const imports = new Map<string, { external_item_id: string | null; item_name: string | null; department: string | null }>();
      for (let offset = 0; offset < importIds.length; offset += 200) {
        const { data, error } = await supabase.from("pos_sales_import")
          .select("id,external_item_id,item_name,department").eq("restaurant_id", restaurantId)
          .in("location_id", ids).in("id", importIds.slice(offset, offset + 200));
        if (error) throw error;
        for (const row of data ?? []) imports.set(row.id, row);
      }
      const posted = sales.map(s => {
        const imported = s.pos_import_id ? imports.get(s.pos_import_id) : undefined;
        return { ...s, name: imported?.item_name ?? s.dishes?.name ?? "Unmapped product",
          productId: imported?.external_item_id, department: imported?.department };
      });
      return { ...buildProductsSold({ restaurantId, locationIds: ids, start, end, snapshots, observations, posted, catalogue }), locations };
    },
  });
}