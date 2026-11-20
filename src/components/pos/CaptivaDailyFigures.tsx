import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@/contexts/LocationContext";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useLocations } from "@/hooks/useLocations";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/currency";
import type { Database } from "@/integrations/supabase/types";
import { coversByLocationDay, coversTotal } from "@/lib/captivaCovers";
import { formatOrdinalDate, formatOrdinalRange } from "@/lib/ordinalDate";

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
  const coversQ = useQuery({
    queryKey: ["captiva-daily-covers", restaurantId, selectedLocationId ?? "all", start, end],
    enabled: !!restaurantId,
    queryFn: async () => {
      const rows: any[] = [];
      for (let offset = 0; ; offset += 1000) {
        let page = supabase.from("pos_daily_summaries")
          .select("report_date, location_id, pos_provider, gross_sales, net_sales, vat_amount, discounts, order_count, visitor_count, average_order_value, has_product_detail, has_summary_report")
          .eq("restaurant_id", restaurantId!).gte("report_date", start).lte("report_date", end)
          .order("report_date").order("id").range(offset, offset + 999);
        if (selectedLocationId) page = page.eq("location_id", selectedLocationId);
        const { data, error } = await page;
        if (error) throw error;
        rows.push(...(data ?? []));
        if ((data ?? []).length < 1000) return coversByLocationDay(rows);
      }
    },
  });
  const days = query.data ?? [];
  const coverMap = coversQ.data ?? new Map<string, number | null>();
  const covers = coversTotal(days.map(d => `${d.location_id}|${d.trading_date}`), coverMap);
  const coverCell = (d: Day) => {
    if (coversQ.isError) return "Unavailable";
    const v = coverMap.get(`${d.location_id}|${d.trading_date}`);
    return v == null ? "Not reported" : String(v);
  };
  const total = (field: "official_gross" | "official_orders") => days.every(day => day[field] != null)
    ? days.reduce((sum, day) => sum + Number(day[field]), 0) : null;
  const gross = total("official_gross");
  const orders = total("official_orders");
  return <section className="rounded-lg border p-4 space-y-2 mb-4" aria-label="Captiva daily totals">
    <h2 className="font-semibold">Captiva daily totals</h2>
    {query.isError ? <p role="alert">Could not load Captiva totals for this period.</p> :
      query.isLoading ? <p>Loading Captiva totals…</p> : !days.length ? <p>No Captiva totals received for these dates.</p> : <>
        <p><strong>{gross == null ? "—" : formatCurrency(gross)}</strong> gross · {orders ?? "—"} orders · {coversQ.isError ? "covers unavailable" : coversQ.isLoading ? "covers loading…" : covers.total == null ? "covers not reported" : `${covers.total} covers`}</p>
        {!coversQ.isLoading && !coversQ.isError && !covers.complete && (
          <p className="text-sm text-muted-foreground">Covers reported for {covers.known} of {covers.days} restaurant-days{covers.total != null ? " — total is partial" : ""}. Missing days are not counted as zero and are never estimated from orders.</p>
        )}
        <p className="text-sm text-muted-foreground">Received figures for {formatOrdinalRange(start, end)}. Covers are Captiva visitor counts from imported daily summaries, counted once per restaurant and trading date. Posted sales and financial reports below use separately applied records.</p>
        <details><summary className="cursor-pointer">Daily figures by restaurant ({days.length})</summary>
          <div className="max-h-72 overflow-auto"><table className="w-full min-w-[560px] text-left text-sm">
            <thead><tr>{["Trading date", "Restaurant", "Gross", "Orders", "Covers", "Reconciliation"].map(label => <th key={label}>{label}</th>)}</tr></thead>
            <tbody>{days.map(day => <tr key={day.location_id + day.trading_date}>
              <td>{formatOrdinalDate(day.trading_date, true)}</td><td>{locations.find(l => l.id === day.location_id)?.name ?? "Location"}</td>
              <td>{day.official_gross == null ? "—" : formatCurrency(day.official_gross)}</td>
              <td>{day.official_orders ?? "—"}</td><td>{coverCell(day)}</td><td>{day.reconciliation_state}</td>
            </tr>)}</tbody>
          </table></div>
        </details>
      </>}
  </section>;
}
