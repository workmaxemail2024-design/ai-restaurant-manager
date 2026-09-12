/**
 * Canonical POS daily summary resolver.
 *
 * pos_daily_summaries can hold more than one row per restaurant + location +
 * trading date (e.g. a Captiva XLS product import AND a Captiva API summary).
 * Those rows are complementary, never additive. This resolver reduces the raw
 * rows to ONE canonical result per location/date with this precedence:
 *
 *  - a product-detail row (XLS products report) is the preferred revenue basis
 *  - a summary/API row is a reconciliation/control source and supplies
 *    receipts/visitors where the product row does not
 *  - multiple providers for the same day are NEVER added together as revenue
 *
 * Unknown figures stay null (unknown), never become 0. Summing canonical days
 * across locations (Owner "All locations" view) is done afterwards by the
 * caller, per date.
 */

export interface PosDailySummaryRow {
  report_date: string;
  location_id: string | null;
  pos_provider: string;
  gross_sales: number | string | null;
  net_sales: number | string | null;
  vat_amount: number | string | null;
  discounts: number | string | null;
  order_count: number | null;
  visitor_count: number | null;
  average_order_value: number | string | null;
  has_product_detail?: boolean | null;
  has_summary_report?: boolean | null;
  product_gross_sales?: number | string | null;
  summary_gross_sales?: number | string | null;
}

export interface CanonicalPosDay {
  locationId: string | null;
  reportDate: string;
  grossSales: number | null;
  netSales: number | null;
  vat: number | null;
  discounts: number | null;
  orderCount: number | null;
  visitorCount: number | null;
  aov: number | null;
  hasProductDetail: boolean;
  hasSummaryReport: boolean;
  /** Gross reported by the product-lines report, when present (control vs detail). */
  productGross: number | null;
  /** Gross reported by the daily summary report, when present. */
  summaryGross: number | null;
  providers: string[];
}

const num = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const isProductRow = (r: PosDailySummaryRow): boolean =>
  r.has_product_detail === true ||
  (r.has_product_detail == null && r.pos_provider === "captiva_xls");

const isSummaryRow = (r: PosDailySummaryRow): boolean =>
  r.has_summary_report === true ||
  (r.has_summary_report == null && r.has_product_detail == null &&
    (r.pos_provider === "captiva" || r.pos_provider === "captiva_api"));

/** Sum where every-null means null (unknown), not 0. */
export function sumNullable(values: Array<number | null>): number | null {
  let acc: number | null = null;
  for (const v of values) {
    if (v == null) continue;
    acc = (acc ?? 0) + v;
  }
  return acc;
}

export function canonicalizePosSummaries(rows: PosDailySummaryRow[]): CanonicalPosDay[] {
  const groups = new Map<string, PosDailySummaryRow[]>();
  for (const r of rows) {
    const key = `${r.location_id ?? "null"}|${r.report_date}`;
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }

  const out: CanonicalPosDay[] = [];
  for (const g of groups.values()) {
    const first = g[0];
    const productRows = g.filter(isProductRow);
    const summaryRows = g.filter((r) => !isProductRow(r) && isSummaryRow(r));

    // Revenue basis: product-detail row first; otherwise a summary/API row.
    const pickRevenue = (rs: PosDailySummaryRow[]): PosDailySummaryRow | undefined =>
      rs.find((r) => num(r.gross_sales) != null) ?? rs[0];
    const revenueRow = pickRevenue(productRows) ?? pickRevenue(summaryRows) ?? pickRevenue(g);

    // Receipts/visitors: the summary/API report is the authoritative source;
    // fall back to any row that supplies a value. Never sum across providers.
    const pickCount = (field: "order_count" | "visitor_count"): number | null => {
      for (const rs of [summaryRows, productRows, g]) {
        for (const r of rs) {
          if (r[field] != null) return Number(r[field]);
        }
      }
      return null;
    };

    const gross = num(revenueRow?.gross_sales);
    const orderCount = pickCount("order_count");
    const visitorCount = pickCount("visitor_count");

    const productGross = sumNullable(productRows.map((r) => num(r.product_gross_sales ?? r.gross_sales)));
    const summaryGross = sumNullable(summaryRows.map((r) => num(r.summary_gross_sales ?? r.gross_sales)));

    out.push({
      locationId: first.location_id ?? null,
      reportDate: first.report_date,
      grossSales: gross,
      netSales: num(revenueRow?.net_sales),
      vat: num(revenueRow?.vat_amount),
      discounts: num(revenueRow?.discounts),
      orderCount,
      visitorCount,
      aov:
        orderCount != null && orderCount > 0 && gross != null
          ? gross / orderCount
          : num(revenueRow?.average_order_value),
      hasProductDetail: productRows.length > 0,
      hasSummaryReport: summaryRows.length > 0,
      productGross,
      summaryGross,
      providers: Array.from(new Set(g.map((r) => r.pos_provider))),
    });
  }
  return out.sort((a, b) => a.reportDate.localeCompare(b.reportDate));
}

/**
 * Reconciliation between the product-lines gross and the daily-summary gross
 * for one canonical day. null when only one report type exists.
 */
export function reconcileGross(day: CanonicalPosDay): {
  productGross: number;
  summaryGross: number;
  diff: number;
  pct: number;
  status: "matched" | "small_variance" | "needs_review";
} | null {
  if (day.productGross == null || day.summaryGross == null) return null;
  const diff = day.productGross - day.summaryGross;
  const base = day.summaryGross !== 0 ? Math.abs(day.summaryGross) : Math.abs(day.productGross);
  const pct = base > 0 ? (Math.abs(diff) / base) * 100 : diff === 0 ? 0 : 100;
  return {
    productGross: day.productGross,
    summaryGross: day.summaryGross,
    diff,
    pct,
    status: pct < 0.5 ? "matched" : pct < 2 ? "small_variance" : "needs_review",
  };
}
