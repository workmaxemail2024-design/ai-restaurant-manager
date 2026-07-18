import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";

export interface HistoricalPOSRow {
  id: string;
  restaurant_id: string;
  location_id: string;
  pos_provider: string;
  external_item_id: string;
  item_name: string | null;
  department: string | null;
  period_start: string;
  period_end: string;
  period_label: string | null;
  quantity_sold: number;
  gross_sales: number;
  net_sales: number;
  vat_amount: number;
  discount_amount: number;
  source_file_name: string | null;
  imported_at: string;
}

export interface HistoricalPeriod {
  period_start: string;
  period_end: string;
  period_label: string | null;
  location_id: string;
  row_count: number;
  total_gross: number;
}

/** Distinct imported periods (per location). Used for the period selector. */
export function useHistoricalPeriods(locationId?: string | null) {
  const { currentRestaurant } = useRestaurant();
  return useQuery({
    queryKey: ["historical-pos-periods", currentRestaurant?.id, locationId ?? "all"],
    enabled: !!currentRestaurant,
    queryFn: async () => {
      let q = supabase
        .from("historical_pos_product_summaries")
        .select("period_start, period_end, period_label, location_id, gross_sales")
        .eq("restaurant_id", currentRestaurant!.id);
      if (locationId) q = q.eq("location_id", locationId);
      const { data, error } = await q;
      if (error) throw error;
      const map = new Map<string, HistoricalPeriod>();
      for (const r of data || []) {
        const key = `${r.location_id}|${r.period_start}|${r.period_end}`;
        const cur = map.get(key) || {
          period_start: r.period_start,
          period_end: r.period_end,
          period_label: r.period_label,
          location_id: r.location_id,
          row_count: 0,
          total_gross: 0,
        };
        cur.row_count += 1;
        cur.total_gross += Number(r.gross_sales || 0);
        map.set(key, cur);
      }
      return Array.from(map.values()).sort((a, b) => b.period_start.localeCompare(a.period_start));
    },
  });
}

export function useHistoricalPOSRows(params: {
  locationId?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}) {
  const { currentRestaurant } = useRestaurant();
  const { locationId, periodStart, periodEnd } = params;
  return useQuery({
    queryKey: [
      "historical-pos-rows",
      currentRestaurant?.id,
      locationId ?? "all",
      periodStart ?? "any",
      periodEnd ?? "any",
    ],
    enabled: !!currentRestaurant && !!periodStart && !!periodEnd,
    queryFn: async () => {
      let q = supabase
        .from("historical_pos_product_summaries")
        .select("*")
        .eq("restaurant_id", currentRestaurant!.id)
        .eq("period_start", periodStart!)
        .eq("period_end", periodEnd!);
      if (locationId) q = q.eq("location_id", locationId);
      const { data, error } = await q.order("gross_sales", { ascending: false });
      if (error) throw error;
      return (data || []) as HistoricalPOSRow[];
    },
  });
}
