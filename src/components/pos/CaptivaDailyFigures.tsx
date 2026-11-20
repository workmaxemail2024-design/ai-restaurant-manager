import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@/contexts/LocationContext";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useLocations } from "@/hooks/useLocations";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/currency";
import type { Database } from "@/integrations/supabase/types";

type Day = Database["public"]["Views"]["captiva_location_days"]["Row"];

export function CaptivaDailyFigures({ start, end }: { start: string; end: string }) {
  const { currentRestaurant } = useRestaurant();
  const { selectedLocationId } = useLocation();
  const { data: locations = [] } = useLocations();
  const restaurantId = currentRestaurant?.id;
  const query = useQuery({
    queryKey: ["captiva-daily-figures", restaurantId, selectedLocationId, start, end],
    enabled: !!restaurantId,
    queryFn: async () => {
      const rows: Day[] = [];
      for (let offset = 0; ; offset += 500) {
        let page = supabase.from("captiva_location_days").select("*")
          .eq("restaurant_id", restaurantId!).gte("trading_date", start).lte("trading_date", end)
          .order("trading_date", { ascending: false }).order("location_id").range(offset, offset + 499);
        if (selectedLocationId) page = page.eq("location_id", selectedLocationId);
        const { data, error } = await page;
        if (error) throw error;
        rows.push(...data);
        if (data.length < 500) return rows;
      }
    },
  });
  const days = query.data ?? [];
  const total = (field: "official_gross" | "official_orders") => days.every(day => day[field] != null)
    ? days.reduce((sum, day) => sum + Number(day[field]), 0) : null;
  const gross = total("official_gross");
  const orders = total("official_orders");
  return <section className="rounded-lg border p-4 space-y-2 mb-4" aria-label="Captiva daily totals">
    <h2 className="font-semibold">Captiva daily totals</h2>
    {query.isError ? <p role="alert">Could not load Captiva totals for this period.</p> :
      query.isLoading ? <p>Loading Captiva totals…</p> : !days.length ? <p>No Captiva totals received for these dates.</p> : <>
        <p><strong>{gross == null ? "—" : formatCurrency(gross)}</strong> gross · {orders ?? "—"} orders</p>
        <p className="text-sm text-muted-foreground">Received figures for {start} to {end}. Posted sales and financial reports below use separately applied records.</p>
        <details><summary className="cursor-pointer">Daily figures by restaurant ({days.length})</summary>
          <div className="max-h-72 overflow-auto"><table className="w-full text-left text-sm">
            <thead><tr>{["Trading date", "Restaurant", "Gross", "Orders", "Reconciliation"].map(label => <th key={label}>{label}</th>)}</tr></thead>
            <tbody>{days.map(day => <tr key={day.location_id + day.trading_date}>
              <td>{day.trading_date}</td><td>{locations.find(l => l.id === day.location_id)?.name ?? "Location"}</td>
              <td>{day.official_gross == null ? "—" : formatCurrency(day.official_gross)}</td>
              <td>{day.official_orders ?? "—"}</td><td>{day.reconciliation_state}</td>
            </tr>)}</tbody>
          </table></div>
        </details>
      </>}
  </section>;
}
