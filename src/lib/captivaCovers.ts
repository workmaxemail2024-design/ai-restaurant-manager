import { canonicalizePosSummaries, type PosDailySummaryRow } from "@/lib/posDailyCanonical";

/**
 * Covers come ONLY from pos_daily_summaries.visitor_count (Captiva "Visitors"
 * figure), resolved once per location + trading date by the canonical resolver.
 * Never inferred from orders. null = not reported; 0 = a reported zero.
 */
export function coversByLocationDay(rows: PosDailySummaryRow[]): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const d of canonicalizePosSummaries(rows)) out.set(`${d.locationId}|${d.reportDate}`, d.visitorCount);
  return out;
}

export function coversTotal(keys: string[], covers: Map<string, number | null>) {
  let total: number | null = null;
  let known = 0;
  for (const k of keys) {
    const v = covers.get(k);
    if (v == null) continue;
    known++;
    total = (total ?? 0) + v;
  }
  return { total, known, days: keys.length, complete: keys.length > 0 && known === keys.length };
}
