/**
 * Shared food-cost presentation model.
 *
 * The ONLY costing source is the database resolver (`get_daily_food_cost` /
 * `get_period_food_cost`), which prices every sold line at the ingredient cost
 * that applied on the trading date. This module merges that result with the
 * canonical POS revenue (which is resolved elsewhere and is never changed here)
 * and applies the 30% assumption strictly to revenue that cannot be costed.
 */

/** Assumption used ONLY for revenue that genuinely cannot be costed. */
export const FOOD_COST_ESTIMATE_PCT = 30;

/** Raw row shape returned by get_daily_food_cost / get_period_food_cost. */
export interface FoodCostResolverRow {
  sale_date?: string;
  total_revenue: number;
  historical_food_cost: number;
  fallback_food_cost: number;
  actual_food_cost: number;
  estimated_food_cost: number;
  blended_food_cost: number;
  food_cost_pct: number | null;
  recipe_coverage_pct: number | null;
  historical_coverage_pct: number | null;
  historical_revenue: number;
  fallback_revenue: number;
  uncosted_revenue: number;
  historical_quantity: number;
  fallback_quantity: number;
  uncosted_quantity: number;
  missing_cost_dishes: number;
  fallback_priced_dishes: number;
}

export interface FoodCostView {
  /** Canonical revenue the percentages are measured against. */
  revenue: number;
  /** Costs priced from dated ingredient price history. */
  historicalCost: number;
  /** Costs priced from the frozen baseline / direct cost — NOT historical. */
  fallbackCost: number;
  /** 30% assumption on revenue with no usable cost. */
  estimatedCost: number;
  /** historical + fallback + estimated. */
  blendedCost: number;
  foodCostPct: number | null;

  historicalRevenue: number;
  fallbackRevenue: number;
  uncostedRevenue: number;

  recipeCoveragePct: number;
  historicalCoveragePct: number;
  estimatedSharePct: number;

  costedQuantity: number;
  uncostedQuantity: number;

  missingCostDishes: number;
  fallbackPricedDishes: number;

  /** True while any part of the figure relies on the 30% assumption. */
  isEstimated: boolean;
  /** Compact honest description of the figure's quality. */
  qualityLabel: string | null;
}

const n = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const r2 = (v: number) => Math.round(v * 100) / 100;

export function buildFoodCostView(
  row: FoodCostResolverRow | null | undefined,
  canonicalRevenue: number
): FoodCostView {
  const revenue = Math.max(0, n(canonicalRevenue));
  const historicalCost = n(row?.historical_food_cost);
  const fallbackCost = n(row?.fallback_food_cost);
  const historicalRevenue = n(row?.historical_revenue);
  const fallbackRevenue = n(row?.fallback_revenue);
  const pricedRevenue = n(row?.total_revenue);

  // Revenue with no product detail at all (summary-only days) is uncostable too,
  // so it joins the uncosted bucket rather than silently disappearing.
  const uncostedRevenue = Math.max(
    0,
    n(row?.uncosted_revenue) + Math.max(0, revenue - pricedRevenue)
  );
  const estimatedCost = r2((uncostedRevenue * FOOD_COST_ESTIMATE_PCT) / 100);
  const blendedCost = r2(historicalCost + fallbackCost + estimatedCost);

  const pct = (part: number) => (revenue > 0 ? (part / revenue) * 100 : 0);
  const recipeCoveragePct = pct(historicalRevenue + fallbackRevenue);
  const historicalCoveragePct = pct(historicalRevenue);
  const estimatedSharePct = pct(uncostedRevenue);

  const isEstimated = uncostedRevenue > 0 || revenue <= 0;

  let qualityLabel: string | null = null;
  if (revenue > 0) {
    if (historicalCoveragePct >= 99.95) {
      qualityLabel = "100% historically costed";
    } else {
      const parts = [
        `${recipeCoveragePct.toFixed(0)}% recipe costed`,
        `${historicalCoveragePct.toFixed(0)}% historically priced`,
      ];
      if (estimatedSharePct > 0.05) parts.push(`${estimatedSharePct.toFixed(0)}% estimated`);
      qualityLabel = parts.join(" · ");
    }
  }

  return {
    revenue,
    historicalCost: r2(historicalCost),
    fallbackCost: r2(fallbackCost),
    estimatedCost,
    blendedCost,
    foodCostPct: revenue > 0 ? (blendedCost / revenue) * 100 : null,
    historicalRevenue: r2(historicalRevenue),
    fallbackRevenue: r2(fallbackRevenue),
    uncostedRevenue: r2(uncostedRevenue),
    recipeCoveragePct,
    historicalCoveragePct,
    estimatedSharePct,
    costedQuantity: n(row?.historical_quantity) + n(row?.fallback_quantity),
    uncostedQuantity: n(row?.uncosted_quantity),
    missingCostDishes: Math.round(n(row?.missing_cost_dishes)),
    fallbackPricedDishes: Math.round(n(row?.fallback_priced_dishes)),
    isEstimated,
    qualityLabel,
  };
}

/** Sum resolver rows (used when a period needs the same shape as a day). */
export function sumResolverRows(rows: FoodCostResolverRow[]): FoodCostResolverRow | null {
  if (rows.length === 0) return null;
  const acc: FoodCostResolverRow = {
    total_revenue: 0,
    historical_food_cost: 0,
    fallback_food_cost: 0,
    actual_food_cost: 0,
    estimated_food_cost: 0,
    blended_food_cost: 0,
    food_cost_pct: null,
    recipe_coverage_pct: null,
    historical_coverage_pct: null,
    historical_revenue: 0,
    fallback_revenue: 0,
    uncosted_revenue: 0,
    historical_quantity: 0,
    fallback_quantity: 0,
    uncosted_quantity: 0,
    missing_cost_dishes: 0,
    fallback_priced_dishes: 0,
  };
  for (const row of rows) {
    acc.total_revenue += n(row.total_revenue);
    acc.historical_food_cost += n(row.historical_food_cost);
    acc.fallback_food_cost += n(row.fallback_food_cost);
    acc.actual_food_cost += n(row.actual_food_cost);
    acc.estimated_food_cost += n(row.estimated_food_cost);
    acc.blended_food_cost += n(row.blended_food_cost);
    acc.historical_revenue += n(row.historical_revenue);
    acc.fallback_revenue += n(row.fallback_revenue);
    acc.uncosted_revenue += n(row.uncosted_revenue);
    acc.historical_quantity += n(row.historical_quantity);
    acc.fallback_quantity += n(row.fallback_quantity);
    acc.uncosted_quantity += n(row.uncosted_quantity);
    acc.missing_cost_dishes = Math.max(acc.missing_cost_dishes, n(row.missing_cost_dishes));
    acc.fallback_priced_dishes = Math.max(acc.fallback_priced_dishes, n(row.fallback_priced_dishes));
  }
  return acc;
}
