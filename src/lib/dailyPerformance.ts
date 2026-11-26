import { canonicalizePosSummaries, sumNullable, type PosDailySummaryRow } from "@/lib/posDailyCanonical";
import { dedupePosSales } from "@/lib/revenueTruth";

export interface OfficialCaptivaDay {
  restaurant_id: string | null;
  location_id: string | null;
  trading_date: string | null;
  official_gross: number | string | null;
  official_orders: number | null;
  reconciliation_state: string | null;
}

export interface PostedSaleDayRow {
  id: string;
  location_id: string | null;
  sale_date: string;
  source?: string | null;
  total_price: number | string | null;
}

export type DailyPerformanceSource = "received" | "posted" | "mixed";

export interface DailyPerformanceDay {
  key: string;
  locationId: string;
  date: string;
  gross: number | null;
  orders: number | null;
  covers: number | null;
  source: DailyPerformanceSource;
  hasOfficialRecord: boolean;
  hasPostedRecord: boolean;
}

const numberOrNull = (value: number | string | null | undefined): number | null => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * One row per location and trading day. Received official Captiva values win;
 * posted summaries/lines fill only missing values and are never added to them.
 */
export function buildDailyPerformance(input: {
  restaurantId: string;
  locationIds: string[];
  start: string;
  end: string;
  official: OfficialCaptivaDay[];
  summaries: PosDailySummaryRow[];
  sales: PostedSaleDayRow[];
}): DailyPerformanceDay[] {
  const locations = new Set(input.locationIds);
  const inScope = (locationId: string | null, date: string | null): date is string =>
    locationId != null && locations.has(locationId) && date != null && date >= input.start && date <= input.end;

  const official = new Map<string, OfficialCaptivaDay>();
  for (const row of input.official) {
    if (row.restaurant_id !== input.restaurantId || !inScope(row.location_id, row.trading_date)) continue;
    // The view is already one current row per location/day. If a malformed
    // response repeats one, never turn that repetition into additional takings.
    official.set(`${row.location_id}|${row.trading_date}`, row);
  }

  const postedSummaries = new Map<string, ReturnType<typeof canonicalizePosSummaries>[number]>();
  for (const day of canonicalizePosSummaries(input.summaries)) {
    if (!inScope(day.locationId, day.reportDate)) continue;
    postedSummaries.set(`${day.locationId}|${day.reportDate}`, day);
  }

  const postedSales = new Map<string, { gross: number | null; count: number }>();
  for (const sale of dedupePosSales(input.sales)) {
    if (!inScope(sale.location_id, sale.sale_date)) continue;
    const key = `${sale.location_id}|${sale.sale_date}`;
    const current = postedSales.get(key) ?? { gross: null, count: 0 };
    const amount = numberOrNull(sale.total_price);
    current.gross = sumNullable([current.gross, amount]);
    current.count += 1;
    postedSales.set(key, current);
  }

  const keys = new Set([...official.keys(), ...postedSummaries.keys(), ...postedSales.keys()]);
  return [...keys].flatMap((key): DailyPerformanceDay[] => {
    const [locationId, date] = key.split("|");
    const received = official.get(key);
    const summary = postedSummaries.get(key);
    const sales = postedSales.get(key);
    const receivedGross = numberOrNull(received?.official_gross);
    const receivedOrders = received?.official_orders ?? null;
    const postedGross = summary?.grossSales ?? sales?.gross ?? null;
    const gross = receivedGross ?? postedGross;
    const orders = receivedOrders ?? summary?.orderCount ?? null;
    const hasOfficialRecord = received != null;
    const hasPostedRecord = summary != null || sales != null;
    const usedPostedFallback = (receivedGross == null && postedGross != null) ||
      (receivedOrders == null && summary?.orderCount != null);
    const source: DailyPerformanceSource = !hasOfficialRecord || (receivedGross == null && receivedOrders == null && hasPostedRecord)
      ? "posted"
      : usedPostedFallback ? "mixed" : "received";

    return [{
      key,
      locationId,
      date,
      gross,
      orders,
      covers: summary?.visitorCount ?? null,
      source,
      hasOfficialRecord,
      hasPostedRecord,
    }];
  }).sort((a, b) => b.date.localeCompare(a.date) || a.locationId.localeCompare(b.locationId));
}

export function totalDailyPerformance(days: DailyPerformanceDay[]) {
  return {
    gross: sumNullable(days.map(day => day.gross)),
    orders: sumNullable(days.map(day => day.orders)),
    covers: sumNullable(days.map(day => day.covers)),
    grossDays: days.filter(day => day.gross != null).length,
    orderDays: days.filter(day => day.orders != null).length,
  };
}
