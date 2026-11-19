/**
 * Shared revenue/orders/covers rules used by the Dashboard, Daily Financial
 * Summary, Location cards and Monthly P&L so they agree with Reports.
 *
 *  - The same location + trading day imported from more than one POS path
 *    (Captiva API and Captiva XLS) is counted ONCE: one POS source is kept per
 *    location/day (product-detail XLS first, matching canonicalizePosSummaries).
 *    Non-POS rows (e.g. manual sales) are always kept.
 *  - Manual order/cover corrections apply per location AND day, replacing only
 *    that location's POS figure. An explicit 0 is a real value; covers_unknown
 *    makes that location/day Unknown (null).
 *  - Unknown stays null, never 0.
 */
import type { CanonicalPosDay } from "@/lib/posDailyCanonical";
import { sumNullable } from "@/lib/posDailyCanonical";

export const POS_SOURCE_PRIORITY = ["captiva_xls", "captiva", "captiva_api"] as const;
const POS_SOURCES = new Set<string>(POS_SOURCE_PRIORITY);

export const isPosSource = (s: string | null | undefined): boolean => !!s && POS_SOURCES.has(s);

export interface SaleLike {
  location_id: string | null;
  sale_date: string;
  source?: string | null;
}

/** Keep exactly one POS source per location + day; non-POS rows pass through. */
export function dedupePosSales<T extends SaleLike>(rows: T[]): T[] {
  const chosen = new Map<string, string>();
  for (const r of rows) {
    if (!isPosSource(r.source)) continue;
    const key = `${r.location_id ?? "null"}|${r.sale_date}`;
    const prev = chosen.get(key);
    if (!prev || POS_SOURCE_PRIORITY.indexOf(r.source as any) < POS_SOURCE_PRIORITY.indexOf(prev as any)) {
      chosen.set(key, r.source as string);
    }
  }
  return rows.filter((r) => {
    if (!isPosSource(r.source)) return true;
    return chosen.get(`${r.location_id ?? "null"}|${r.sale_date}`) === r.source;
  });
}

/** Revenue total; null when there are no sales rows at all (unknown, not €0). */
export function sumRevenue(rows: Array<{ total_price: number | string | null }>): number | null {
  if (rows.length === 0) return null;
  return rows.reduce((s, r) => s + Number(r.total_price ?? 0), 0);
}

export interface LedgerOverrideRow {
  entry_date: string;
  location_id: string | null;
  manual_orders?: number | null;
  covers?: number | null;
  covers_unknown?: boolean | null;
}

/**
 * Effective orders/covers per location+day: a manual figure (including 0)
 * replaces that location's POS figure only; covers_unknown → null.
 */
export function effectiveOrdersAndCovers(
  posDays: Pick<CanonicalPosDay, "locationId" | "reportDate" | "orderCount" | "visitorCount">[],
  ledger: LedgerOverrideRow[],
): { orders: number | null; covers: number | null } {
  type Cell = { orders: number | null; covers: number | null };
  const cells = new Map<string, Cell & { manOrders?: number; manCovers?: number; coversUnknown?: boolean }>();
  const key = (loc: string | null, d: string) => `${loc ?? "null"}|${d}`;
  for (const d of posDays) {
    const k = key(d.locationId, d.reportDate);
    const prev = cells.get(k) ?? { orders: null, covers: null };
    prev.orders = sumNullable([prev.orders, d.orderCount]);
    prev.covers = sumNullable([prev.covers, d.visitorCount]);
    cells.set(k, prev);
  }
  for (const r of ledger) {
    const k = key(r.location_id, r.entry_date);
    const prev = cells.get(k) ?? { orders: null, covers: null };
    if (r.manual_orders != null) prev.manOrders = (prev.manOrders ?? 0) + Number(r.manual_orders);
    if (r.covers_unknown) prev.coversUnknown = true;
    else if (r.covers != null) prev.manCovers = (prev.manCovers ?? 0) + Number(r.covers);
    cells.set(k, prev);
  }
  const orders: (number | null)[] = [];
  const covers: (number | null)[] = [];
  for (const c of cells.values()) {
    orders.push(c.manOrders != null ? c.manOrders : c.orders);
    covers.push(c.coversUnknown ? null : c.manCovers != null ? c.manCovers : c.covers);
  }
  return { orders: sumNullable(orders), covers: sumNullable(covers) };
}

/** Recipe food cost from summed quantities; dishes with unknown cost are reported, not €0. */
export function recipeFoodCost(
  sales: Array<{ dish_id: string | null; quantity: number | string | null }>,
  costByDish: Map<string, number | null>,
): { cost: number | null; uncostedDishIds: string[]; qtyByDish: Record<string, number> } {
  const qtyByDish: Record<string, number> = {};
  for (const s of sales) {
    if (!s.dish_id) continue;
    qtyByDish[s.dish_id] = (qtyByDish[s.dish_id] ?? 0) + Number(s.quantity ?? 0);
  }
  let cost: number | null = null;
  const uncosted: string[] = [];
  for (const [id, qty] of Object.entries(qtyByDish)) {
    const c = costByDish.get(id);
    if (c == null || !Number.isFinite(c) || c <= 0) { uncosted.push(id); continue; }
    cost = (cost ?? 0) + c * qty;
  }
  return { cost, uncostedDishIds: uncosted, qtyByDish };
}

/**
 * Why a profit figure is only an estimate. Empty reasons = every input was known.
 * Revenue is gross (as stored in sales.total_price), so margins are not VAT-exclusive.
 */
export function profitEstimateReasons(input: {
  revenue: number | null;
  uncostedDishCount?: number;
  missingPayRateStaff?: number;
  foodCost?: number | null;
}): string[] {
  const reasons: string[] = [];
  if (input.revenue == null) reasons.push("No sales recorded");
  if ((input.uncostedDishCount ?? 0) > 0) reasons.push(`${input.uncostedDishCount} dish(es) without recipe cost`);
  if (input.foodCost === null && input.revenue != null && input.revenue > 0) reasons.push("Food cost unknown");
  if ((input.missingPayRateStaff ?? 0) > 0) reasons.push(`${input.missingPayRateStaff} staff without pay rate`);
  return reasons;
}

/** Return query data, or throw so the screen shows an error instead of a silent €0 / empty result. */
export function unwrapQuery<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Could not load ${what}: ${res.error.message}`);
  return res.data;
}

// ─── Canonical daily revenue (one figure per location + trading day) ───────────
//
// Precedence per location+day, identical to Reports (useDailyBreakdown):
//   1. canonical POS daily summary gross (pos_daily_summaries, already one row
//      per location/day via canonicalizePosSummaries) — carries net/VAT when known
//   2. else product lines in `sales` (one POS source per location/day; gross only)
//   3. else the manual revenue entered for THAT location/day in the ledger
// Staged Captiva sources (pos_captiva_*) are never read here: only applied/approved
// data in sales / pos_daily_summaries counts as booked revenue.
// Net and VAT are never derived from gross: unknown stays null.

export type RevenueSource = "pos_summary" | "sales" | "manual";

export interface CanonicalRevenueDay {
  locationId: string | null;
  date: string;
  gross: number;
  net: number | null;
  vat: number | null;
  source: RevenueSource;
}

export interface RevenueLedgerRow {
  entry_date: string;
  location_id: string | null;
  manual_revenue?: number | string | null;
}

export function canonicalRevenueDays(
  posDays: Pick<CanonicalPosDay, "locationId" | "reportDate" | "grossSales" | "netSales" | "vat">[],
  sales: Array<SaleLike & { total_price: number | string | null }>,
  ledger: RevenueLedgerRow[] = [],
): CanonicalRevenueDay[] {
  const key = (loc: string | null, d: string) => `${loc ?? "null"}|${d}`;
  const out = new Map<string, CanonicalRevenueDay>();
  for (const d of posDays) {
    if (d.grossSales == null) continue;
    out.set(key(d.locationId, d.reportDate), {
      locationId: d.locationId, date: d.reportDate, gross: Number(d.grossSales),
      net: d.netSales ?? null, vat: d.vat ?? null, source: "pos_summary",
    });
  }
  const salesSum = new Map<string, CanonicalRevenueDay>();
  for (const s of dedupePosSales(sales)) {
    const k = key(s.location_id, s.sale_date);
    if (out.has(k)) continue;
    const prev = salesSum.get(k) ?? { locationId: s.location_id, date: s.sale_date, gross: 0, net: null, vat: null, source: "sales" as const };
    prev.gross += Number(s.total_price ?? 0);
    salesSum.set(k, prev);
  }
  for (const [k, v] of salesSum) out.set(k, v);
  for (const r of ledger) {
    if (r.manual_revenue == null || r.manual_revenue === "") continue;
    const k = key(r.location_id, r.entry_date);
    if (out.has(k)) continue; // POS data for that location/day always wins
    out.set(k, { locationId: r.location_id, date: r.entry_date, gross: Number(r.manual_revenue), net: null, vat: null, source: "manual" });
  }
  return [...out.values()];
}

export interface RevenueSummary {
  /** Gross takings incl. VAT; null = no revenue recorded (Unknown, not €0). */
  gross: number | null;
  /** Net of VAT — only when EVERY location/day with revenue has a known net. */
  net: number | null;
  vat: number | null;
  netCoverage: "full" | "partial" | "none";
  byLocation: Record<string, number>;
  sources: Record<RevenueSource, number>;
}

export function summarizeRevenue(days: CanonicalRevenueDay[]): RevenueSummary {
  const sources: Record<RevenueSource, number> = { pos_summary: 0, sales: 0, manual: 0 };
  const byLocation: Record<string, number> = {};
  let gross: number | null = null;
  let netSum = 0, vatSum = 0, netKnown = 0, vatKnown = 0;
  for (const d of days) {
    gross = (gross ?? 0) + d.gross;
    sources[d.source] += 1;
    if (d.locationId) byLocation[d.locationId] = (byLocation[d.locationId] ?? 0) + d.gross;
    if (d.net != null) { netSum += d.net; netKnown += 1; }
    if (d.vat != null) { vatSum += d.vat; vatKnown += 1; }
  }
  const n = days.length;
  const netCoverage = n === 0 || netKnown === 0 ? "none" : netKnown === n ? "full" : "partial";
  return {
    gross, sources, byLocation, netCoverage,
    net: netCoverage === "full" ? netSum : null,
    vat: n > 0 && vatKnown === n ? vatSum : null,
  };
}

/** Margin base: net sales when fully known, otherwise gross (labelled). */
export function marginBase(r: RevenueSummary): { base: number | null; basis: "net" | "gross" } {
  if (r.net != null && r.netCoverage === "full") return { base: r.net, basis: "net" };
  return { base: r.gross, basis: "gross" };
}

// ─── Reports "All locations": fold per-location ledger corrections in ───────────
//
// Editing/upserting is unchanged: the All-locations day card still edits the
// location-less row. For READ totals, corrections entered on individual
// locations are applied per location+day:
//   - a location-less manual figure (legacy All-locations entry) wins for that day
//   - otherwise manual orders/covers replace only that location's POS figure
//   - manual revenue counts only for locations with no POS data that day
//   - labour hours and additional expenses are summed

export interface AllViewLedgerInput {
  entry_date: string;
  location_id: string | null;
  manual_orders?: number | null;
  manual_revenue?: number | null;
  covers?: number | null;
  covers_unknown?: boolean | null;
  labour_hours?: number | null;
  additional_expenses?: number | null;
}

export interface AllViewDayCorrection {
  manual_orders: number | null;
  covers: number | null;
  covers_unknown: boolean;
  /** Manual revenue from locations with no POS data that day (added to POS revenue). */
  location_manual_revenue: number;
  labour_hours: number;
  additional_expenses: number;
  locationCorrectionCount: number;
}

export function foldLocationCorrections(
  date: string,
  posDays: Pick<CanonicalPosDay, "locationId" | "reportDate" | "orderCount" | "visitorCount" | "grossSales">[],
  locationsWithSales: Set<string>,
  nullRow: AllViewLedgerInput | undefined,
  locationRows: AllViewLedgerInput[],
): AllViewDayCorrection | null {
  const rows = locationRows.filter((r) => r.entry_date === date && r.location_id != null);
  if (rows.length === 0) return null;
  const dayPos = posDays.filter((d) => d.reportDate === date);
  const hasOrderCorr = rows.some((r) => r.manual_orders != null);
  const hasCoverCorr = rows.some((r) => r.covers_unknown || (r.covers != null && r.covers > 0));
  const eff = effectiveOrdersAndCovers(dayPos, rows.map((r) => ({
    entry_date: r.entry_date, location_id: r.location_id, manual_orders: r.manual_orders ?? null,
    covers: r.covers != null && r.covers > 0 ? r.covers : null, covers_unknown: false,
  })));
  const withPos = new Set<string>(locationsWithSales);
  for (const d of dayPos) if (d.locationId && d.grossSales != null) withPos.add(d.locationId);
  let manualRev = 0;
  for (const r of rows) {
    if (r.manual_revenue != null && !withPos.has(r.location_id as string)) manualRev += Number(r.manual_revenue);
  }
  const anyUnknownCovers = rows.some((r) => r.covers_unknown);
  return {
    manual_orders: nullRow?.manual_orders != null ? nullRow.manual_orders : hasOrderCorr ? eff.orders : null,
    covers: hasCoverCorr ? (anyUnknownCovers ? null : eff.covers) : null,
    covers_unknown: hasCoverCorr && anyUnknownCovers,
    location_manual_revenue: nullRow?.manual_revenue != null ? 0 : manualRev,
    labour_hours: rows.reduce((s, r) => s + Number(r.labour_hours ?? 0), 0),
    additional_expenses: rows.reduce((s, r) => s + Number(r.additional_expenses ?? 0), 0),
    locationCorrectionCount: rows.length,
  };
}
