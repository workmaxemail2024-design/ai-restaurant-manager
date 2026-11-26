import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLocation } from "@/contexts/LocationContext";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { buildDailyPerformance, totalDailyPerformance, type OfficialCaptivaDay, type PostedSaleDayRow } from "@/lib/dailyPerformance";
import type { PosDailySummaryRow } from "@/lib/posDailyCanonical";
import { readAllProductPages } from "@/lib/productsSold";

export function useDailyPerformance(start: string, end: string) {
  const { currentRestaurant } = useRestaurant();
  const { selectedLocationId } = useLocation();
  const restaurantId = currentRestaurant?.id;

  return useQuery({
    queryKey: ["daily-performance", restaurantId, selectedLocationId ?? "all", start, end],
    enabled: !!restaurantId,
    queryFn: async () => {
      if (!restaurantId) throw new Error("Choose a restaurant");
      const locations = await readAllProductPages(async (offset, size) => {
        let query = supabase.from("locations").select("id,name").eq("restaurant_id", restaurantId)
          .order("id").range(offset, offset + size - 1);
        if (selectedLocationId) query = query.eq("id", selectedLocationId);
        return await query;
      });
      const locationIds = locations.map(location => location.id);
      if (!locationIds.length) return { days: [], locations, totals: totalDailyPerformance([]) };

      const [official, summaries, sales] = await Promise.all([
        readAllProductPages(async (offset, size) => await supabase.from("captiva_location_days")
          .select("restaurant_id,location_id,trading_date,official_gross,official_orders,reconciliation_state")
          .eq("restaurant_id", restaurantId).in("location_id", locationIds)
          .gte("trading_date", start).lte("trading_date", end)
          .order("trading_date").order("location_id").range(offset, offset + size - 1)),
        readAllProductPages(async (offset, size) => await supabase.from("pos_daily_summaries")
          .select("report_date,location_id,pos_provider,gross_sales,net_sales,vat_amount,discounts,order_count,visitor_count,average_order_value,has_product_detail,has_summary_report,product_gross_sales,summary_gross_sales")
          .eq("restaurant_id", restaurantId).in("location_id", locationIds)
          .gte("report_date", start).lte("report_date", end)
          .order("report_date").order("location_id").order("id").range(offset, offset + size - 1)),
        readAllProductPages(async (offset, size) => await supabase.from("sales")
          .select("id,location_id,sale_date,source,total_price")
          .eq("restaurant_id", restaurantId).in("location_id", locationIds)
          .gte("sale_date", start).lte("sale_date", end)
          .order("sale_date").order("location_id").order("id").range(offset, offset + size - 1)),
      ]);

      const days = buildDailyPerformance({
        restaurantId,
        locationIds,
        start,
        end,
        official: official as OfficialCaptivaDay[],
        summaries: summaries as PosDailySummaryRow[],
        sales: sales as PostedSaleDayRow[],
      });
      return { days, locations, totals: totalDailyPerformance(days) };
    },
  });
}
