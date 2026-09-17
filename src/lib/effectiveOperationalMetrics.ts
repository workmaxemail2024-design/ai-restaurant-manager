/**
 * Effective operational metrics (Orders / Receipts and Covers / Visitors).
 *
 * Source of truth:
 *  - POS values live in `pos_daily_summaries` (order_count, visitor_count) and are
 *    NEVER modified by a manual correction — they stay available for audit/reset.
 *  - Manual corrections reuse the existing daily-input fields on
 *    `daily_ledger_entries`: `manual_orders` and `covers` / `covers_unknown`.
 *
 * A manual value, when present, becomes the effective value used by Reports,
 * Dashboard, Daily Summary and analytics until it is reset.
 * Unknown stays null — never 0.
 */

export type MetricSource = "pos" | "manual" | "none";

export interface EffectiveMetric {
  /** Effective value used everywhere; null = genuinely unknown. */
  value: number | null;
  source: MetricSource;
  /** Original POS value, kept even when overridden (null = POS never supplied it). */
  posValue: number | null;
  /** True when a manual value replaces a differing imported POS value. */
  adjusted: boolean;
}

function build(posValue: number | null | undefined, manual: number | null | undefined): EffectiveMetric {
  const pos = posValue == null ? null : Number(posValue);
  const man = manual == null ? null : Number(manual);
  if (man != null) {
    return { value: man, source: "manual", posValue: pos, adjusted: pos != null && pos !== man };
  }
  if (pos != null) return { value: pos, source: "pos", posValue: pos, adjusted: false };
  return { value: null, source: "none", posValue: null, adjusted: false };
}

export interface LedgerOperationalInput {
  manual_orders?: number | null;
  covers?: number | null;
  covers_unknown?: boolean | null;
}

/** Orders / receipts: manual_orders overrides the POS receipt count. */
export function effectiveOrders(posOrders: number | null | undefined, ledger?: LedgerOperationalInput | null): EffectiveMetric {
  return build(posOrders, ledger?.manual_orders ?? null);
}

/**
 * Covers / Visitors: Captiva calls this Visitors. A ledger `covers` value > 0 is a
 * manual correction; 0 / absent means "not corrected" (blank never erases POS data).
 */
export function effectiveVisitors(posVisitors: number | null | undefined, ledger?: LedgerOperationalInput | null): EffectiveMetric {
  const manual = ledger?.covers != null && ledger.covers > 0 ? ledger.covers : null;
  return build(posVisitors, manual);
}

/**
 * AOV = effective gross revenue ÷ effective orders. The POS-provided AOV is only
 * retained when orders are unknown and no manual correction exists.
 */
export function effectiveAov(
  grossRevenue: number | null | undefined,
  orders: EffectiveMetric,
  posAov: number | null | undefined,
): number | null {
  if (orders.value != null && orders.value > 0 && grossRevenue != null) {
    return Number(grossRevenue) / orders.value;
  }
  if (orders.source !== "manual" && posAov != null) return Number(posAov);
  return null;
}
