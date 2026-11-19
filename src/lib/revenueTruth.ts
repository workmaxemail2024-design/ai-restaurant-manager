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
