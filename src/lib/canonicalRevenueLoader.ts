/**
 * Loads the inputs for canonical daily revenue (see revenueTruth.canonicalRevenueDays)
 * for one restaurant, optional location and date range: applied POS daily
 * summaries, `sales` product lines (all pages), and ledger manual revenue.
 * Staged/unapproved Captiva sources are intentionally NOT read.
 * Any failed query throws so screens show an error instead of €0.
 */
import { supabase } from "@/integrations/supabase/client";
import { canonicalizePosSummaries, type CanonicalPosDay } from "@/lib/posDailyCanonical";
import { canonicalRevenueDays, dedupePosSales, summarizeRevenue, unwrapQuery, type CanonicalRevenueDay, type RevenueSummary } from "@/lib/revenueTruth";

const PAGE = 1000;

export async function fetchSalesPaged(
  restaurantId: string, locationId: string | null, start: string, end: string, columns: string,
): Promise<any[]> {
  const all: any[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from("sales").select(columns).eq("restaurant_id", restaurantId)
      .gte("sale_date", start).lte("sale_date", end).order("id", { ascending: true }).range(from, from + PAGE - 1);
    if (locationId) q = q.eq("location_id", locationId);
    const data = unwrapQuery(await q, "sales") as any[] | null;
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return all;
}

export interface CanonicalRevenueLoad {
  /** Deduplicated sales rows (one POS source per location/day). */
  sales: any[];
  posDays: CanonicalPosDay[];
  ledger: any[];
  days: CanonicalRevenueDay[];
  revenue: RevenueSummary;
}

export async function loadCanonicalRevenue(
  restaurantId: string, locationId: string | null, start: string, end: string,
  opts: { salesColumns?: string; ledgerColumns?: string } = {},
): Promise<CanonicalRevenueLoad> {
  const salesCols = opts.salesColumns ?? "total_price, location_id, sale_date, source";
  const rawSales = await fetchSalesPaged(restaurantId, locationId, start, end, salesCols);

  let sumQ = supabase
    .from("pos_daily_summaries")
    .select("report_date, location_id, pos_provider, gross_sales, net_sales, vat_amount, discounts, order_count, visitor_count, average_order_value, has_product_detail, has_summary_report, product_gross_sales, summary_gross_sales")
    .eq("restaurant_id", restaurantId).gte("report_date", start).lte("report_date", end);
  if (locationId) sumQ = sumQ.eq("location_id", locationId);
  const summaries = unwrapQuery(await sumQ, "POS daily summaries");
  const posDays = canonicalizePosSummaries((summaries as any[]) ?? []);

  let ledQ = supabase
    .from("daily_ledger_entries")
    .select(opts.ledgerColumns ?? "entry_date, location_id, manual_revenue, manual_orders, covers, covers_unknown")
    .eq("restaurant_id", restaurantId).gte("entry_date", start).lte("entry_date", end);
  if (locationId) ledQ = ledQ.eq("location_id", locationId);
  const ledger = (unwrapQuery(await ledQ, "daily ledger") as any[]) ?? [];

  const days = canonicalRevenueDays(posDays, rawSales, ledger);
  return { sales: dedupePosSales(rawSales), posDays, ledger, days, revenue: summarizeRevenue(days) };
}
