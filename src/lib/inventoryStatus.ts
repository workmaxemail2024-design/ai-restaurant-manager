/**
 * Shared inventory state rules.
 *
 * Principles:
 * - A stock item is only Low/Critical when a genuine reorder threshold exists.
 * - Days-until-stockout is only computed when there is enough usage history.
 * - Wastage risk is only assessed when shelf-life data AND usage history exist.
 * - Physical stock (stock_levels + adjustments) stays separate from theoretical
 *   usage recalculated from sales × recipes.
 */

/** Minimum number of days with recorded sales data before usage is trustworthy. */
export const MIN_USAGE_DAYS = 7;
/** Days of coverage required before we call the forecast high confidence. */
export const STRONG_USAGE_DAYS = 21;

export type StockState = "critical" | "low" | "ok" | "no_threshold";

export interface StockStatus {
  state: StockState;
  label: string;
  /** Short explanation of why this state was shown. */
  reason: string;
}

export function getStockStatus(
  quantity: number,
  reorderPoint?: number | null,
): StockStatus {
  if (reorderPoint === null || reorderPoint === undefined || Number(reorderPoint) <= 0) {
    return {
      state: "no_threshold",
      label: "No threshold set",
      reason: "Set a reorder point on this ingredient to enable low-stock alerts.",
    };
  }
  const rp = Number(reorderPoint);
  if (quantity <= rp * 0.5) {
    return {
      state: "critical",
      label: "Critical",
      reason: `At or below half the reorder point (${rp}).`,
    };
  }
  if (quantity <= rp) {
    return { state: "low", label: "Low", reason: `At or below the reorder point (${rp}).` };
  }
  return { state: "ok", label: "OK", reason: `Above the reorder point (${rp}).` };
}

export type UsageConfidence = "none" | "low" | "medium" | "high";

export const confidenceLabel: Record<UsageConfidence, string> = {
  none: "Insufficient usage data",
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
};

export function getUsageConfidence(params: {
  daysWithData: number;
  quantityUsed: number;
}): UsageConfidence {
  const { daysWithData, quantityUsed } = params;
  if (daysWithData < MIN_USAGE_DAYS || quantityUsed <= 0) return "none";
  if (daysWithData >= STRONG_USAGE_DAYS) return "high";
  if (daysWithData >= 14) return "medium";
  return "low";
}

export type WastageRisk = "high" | "medium" | "low" | "not_assessed";

export const wastageLabel: Record<WastageRisk, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  not_assessed: "Not assessed",
};

/**
 * Wastage risk requires BOTH a shelf life and enough usage history.
 * Slow or zero turnover on its own is never treated as wastage risk.
 */
export function getWastageRisk(params: {
  shelfLifeDays?: number | null;
  daysOfSupply: number | null;
  confidence: UsageConfidence;
}): { risk: WastageRisk; reason: string } {
  const { shelfLifeDays, daysOfSupply, confidence } = params;
  if (!shelfLifeDays || shelfLifeDays <= 0) {
    return { risk: "not_assessed", reason: "No shelf-life recorded for this ingredient." };
  }
  if (confidence === "none" || daysOfSupply === null) {
    return { risk: "not_assessed", reason: "Not enough usage history to judge turnover." };
  }
  if (daysOfSupply > shelfLifeDays) {
    return {
      risk: "high",
      reason: `Stock on hand lasts ${Math.round(daysOfSupply)} days but shelf life is ${shelfLifeDays} days.`,
    };
  }
  if (daysOfSupply > shelfLifeDays * 0.6) {
    return {
      risk: "medium",
      reason: `Stock on hand lasts ${Math.round(daysOfSupply)} days, close to the ${shelfLifeDays}-day shelf life.`,
    };
  }
  return { risk: "low", reason: "Turnover is well inside shelf life." };
}
