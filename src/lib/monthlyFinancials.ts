/**
 * Monthly financials on top of canonical Reports totals:
 * - confirmed payroll REPLACES estimated (attendance) labour, never adds to it;
 * - an actual bill that replaces a recurring estimate removes that estimate for
 *   that location and month, so the cost is counted once;
 * - unknown inputs stay flagged instead of becoming €0.
 * Pure functions — no fetching — so the rules are unit-tested.
 */

export type Frequency = "one_time" | "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
export type VatTreatment = "unknown" | "inc_vat" | "ex_vat" | "no_vat";
export type PayrollScope = "gross_wages" | "gross_wages_employer_prsi" | "total_employment_cost" | "other";

export const PAYROLL_SCOPE_LABELS: Record<PayrollScope, string> = {
  gross_wages: "Gross wages",
  gross_wages_employer_prsi: "Gross wages + employer PRSI",
  total_employment_cost: "Total employment cost",
  other: "Other (described)",
};

export const VAT_LABELS: Record<VatTreatment, string> = {
  unknown: "VAT unknown",
  inc_vat: "Includes VAT",
  ex_vat: "Excludes VAT",
  no_vat: "No VAT",
};

export interface OverheadLike {
  id: string;
  name: string;
  category: string;
  location_id: string | null;
  amount: number;
  frequency: Frequency;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  allocation_mode?: string | null;
  allocation_details?: Record<string, number> | null;
  vat_treatment?: VatTreatment | null;
}

export interface ActualExpenseLike {
  id: string;
  location_id: string;
  period_month: string; // YYYY-MM-01
  description: string;
  category: string;
  amount: number;
  vat_treatment: VatTreatment;
  vat_amount: number | null;
  replaces_overhead_id: string | null;
  status: "active" | "void";
}

export interface PayrollLike {
  id: string;
  location_id: string;
  period_month: string;
  amount: number;
  scope: PayrollScope;
  scope_note: string | null;
  source: "accountant_import" | "manual";
  status: "active" | "superseded" | "void";
}

/** Exact monthly equivalent (quarterly ÷ 3, annual ÷ 12, weekly × 52 ÷ 12, daily × 365 ÷ 12). One-time has none. */
export function monthlyEquivalent(amount: number, frequency: Frequency): number | null {
  switch (frequency) {
    case "monthly": return amount;
    case "quarterly": return amount / 3;
    case "yearly": return amount / 12;
    case "weekly": return (amount * 52) / 12;
    case "daily": return (amount * 365) / 12;
    case "one_time": return null;
    default: return null;
  }
}

const pad = (n: number) => String(n).padStart(2, "0");
export function monthBounds(monthKey: string): { start: string; end: string; days: number } {
  const [y, m] = monthKey.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(days)}`, days };
}

const dayDiff = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * Cost of one recurring estimate in a month (prorated when it starts/ends mid-month),
 * for the scope: one selected location (global overheads use their allocation) or all locations.
 */
export function overheadCostForMonth(
  o: OverheadLike,
  monthKey: string,
  selectedLocationId: string | null,
  locationCount: number,
): number {
  if (!o.is_active) return 0;
  if (selectedLocationId && o.location_id && o.location_id !== selectedLocationId) return 0;
  const { start, end, days } = monthBounds(monthKey);
  if (o.start_date && o.start_date > end) return 0;
  if (o.end_date && o.end_date < start) return 0;

  let amount: number;
  if (o.frequency === "one_time") {
    if (!o.start_date || o.start_date < start || o.start_date > end) return 0;
    amount = o.amount;
  } else {
    const monthly = monthlyEquivalent(o.amount, o.frequency) ?? 0;
    const from = o.start_date && o.start_date > start ? o.start_date : start;
    const to = o.end_date && o.end_date < end ? o.end_date : end;
    const activeDays = Math.max(0, dayDiff(from, to) + 1);
    amount = monthly * (activeDays / days);
  }

  if (selectedLocationId && !o.location_id) {
    const locs = Math.max(1, locationCount);
    const mode = o.allocation_mode ?? "equal";
    if (mode === "percentage") {
      const pct = o.allocation_details?.[selectedLocationId] ?? 100 / locs;
      amount = amount * (pct / 100);
    } else if (mode === "manual") {
      const manual = o.allocation_details?.[selectedLocationId] ?? 0;
      amount = o.frequency === "one_time" ? manual : (monthlyEquivalent(manual, o.frequency) ?? 0) * (amount / ((monthlyEquivalent(o.amount, o.frequency) || 1)));
    } else {
      amount = amount / locs;
    }
  }
  return amount;
}

/** Cost recognised for an actual bill: net of VAT when the VAT is known; flagged otherwise. */
export function actualExpenseCost(e: ActualExpenseLike): { cost: number; vatFlag: "unknown" | "not_separated" | null } {
  if (e.vat_treatment === "inc_vat") {
    if (e.vat_amount != null) return { cost: e.amount - e.vat_amount, vatFlag: null };
    return { cost: e.amount, vatFlag: "not_separated" };
  }
  if (e.vat_treatment === "unknown") return { cost: e.amount, vatFlag: "unknown" };
  return { cost: e.amount, vatFlag: null };
}

export type LabourSource = "confirmed" | "partial" | "estimate" | "none";

export interface MonthLabour {
  source: LabourSource;
  /** Labour used in profit (confirmed payroll when it covers every location in view, else the estimate). */
  amount: number | null;
  estimatedAmount: number | null;
  confirmedAmount: number | null;
  coveredLocations: number;
  totalLocations: number;
  payroll: PayrollLike[];
  pctOfSales: number | null;
}

export function resolveMonthLabour(input: {
  monthKey: string;
  scopeLocationIds: string[];
  payroll: PayrollLike[];
  estimatedLabour: number;
  hasEstimatedLabour: boolean;
  revenue: number;
}): MonthLabour {
  const { start } = monthBounds(input.monthKey);
  const scope = new Set(input.scopeLocationIds);
  const rows = input.payroll.filter((p) => p.status === "active" && p.period_month === start && scope.has(p.location_id));
  const covered = new Set(rows.map((p) => p.location_id)).size;
  const confirmedAmount = rows.length ? rows.reduce((s, p) => s + Number(p.amount), 0) : null;
  const estimatedAmount = input.hasEstimatedLabour ? input.estimatedLabour : null;
  const total = scope.size;

  let source: LabourSource;
  let amount: number | null;
  if (total > 0 && covered === total) {
    source = "confirmed";
    amount = confirmedAmount; // replaces the estimate — never added to it
  } else if (covered > 0) {
    source = "partial";
    amount = estimatedAmount; // never mix confirmed for some locations with estimates for others
  } else if (estimatedAmount != null) {
    source = "estimate";
    amount = estimatedAmount;
  } else {
    source = "none";
    amount = null;
  }
  return {
    source,
    amount,
    estimatedAmount,
    confirmedAmount,
    coveredLocations: covered,
    totalLocations: total,
    payroll: rows,
    pctOfSales: amount != null && input.revenue > 0 ? (amount / input.revenue) * 100 : null,
  };
}

export interface ExpenseLine {
  id: string;
  label: string;
  category: string;
  amount: number;
  kind: "actual" | "estimate";
  vatFlag: "unknown" | "not_separated" | null;
}

export interface MonthExpenses {
  lines: ExpenseLine[];
  actualTotal: number;
  estimateTotal: number;
  total: number;
  replacedEstimateIds: string[];
  vatUnknown: number;
  vatNotSeparated: number;
  recorded: boolean;
}

export function monthExpenses(input: {
  monthKey: string;
  selectedLocationId: string | null;
  scopeLocationIds: string[];
  locationCount: number;
  overheads: OverheadLike[];
  actuals: ActualExpenseLike[];
}): MonthExpenses {
  const { start } = monthBounds(input.monthKey);
  const scope = new Set(input.scopeLocationIds);
  const actuals = input.actuals.filter((e) => e.status === "active" && e.period_month === start && scope.has(e.location_id));
  const replaced = new Set(actuals.map((e) => e.replaces_overhead_id).filter((id): id is string => !!id));

  const lines: ExpenseLine[] = [];
  let vatUnknown = 0;
  let vatNotSeparated = 0;
  for (const e of actuals) {
    const { cost, vatFlag } = actualExpenseCost(e);
    if (vatFlag === "unknown") vatUnknown += 1;
    if (vatFlag === "not_separated") vatNotSeparated += 1;
    lines.push({ id: e.id, label: e.description, category: e.category, amount: cost, kind: "actual", vatFlag });
  }
  for (const o of input.overheads) {
    if (replaced.has(o.id)) continue; // the actual bill stands in for this estimate this month
    if (o.location_id && !scope.has(o.location_id)) continue;
    const amount = overheadCostForMonth(o, input.monthKey, input.selectedLocationId, input.locationCount);
    if (amount <= 0) continue;
    const vatFlag = (o.vat_treatment ?? "unknown") === "unknown" ? "unknown" : null;
    if (vatFlag) vatUnknown += 1;
    lines.push({ id: o.id, label: o.name, category: o.category, amount, kind: "estimate", vatFlag });
  }
  const actualTotal = lines.filter((l) => l.kind === "actual").reduce((s, l) => s + l.amount, 0);
  const estimateTotal = lines.filter((l) => l.kind === "estimate").reduce((s, l) => s + l.amount, 0);
  return {
    lines,
    actualTotal,
    estimateTotal,
    total: actualTotal + estimateTotal,
    replacedEstimateIds: [...replaced],
    vatUnknown,
    vatNotSeparated,
    recorded: lines.length > 0,
  };
}

export interface MonthFinancials {
  monthKey: string;
  labour: MonthLabour;
  expenses: MonthExpenses;
  /** Revenue − food cost − labour used − daily additional expenses. */
  profitBeforeOverheads: number;
  /** Profit before overheads − overheads & expenses; null when no overheads/expenses are recorded at all. */
  operatingProfit: number | null;
  operatingMarginPct: number | null;
  flags: string[];
}

export function buildMonthFinancials(input: {
  monthKey: string;
  revenue: number;
  foodCost: number;
  foodCostEstimated: boolean;
  additionalExpenses: number;
  estimatedLabour: number;
  hasEstimatedLabour: boolean;
  selectedLocationId: string | null;
  scopeLocationIds: string[];
  locationCount: number;
  overheads: OverheadLike[];
  actuals: ActualExpenseLike[];
  payroll: PayrollLike[];
}): MonthFinancials {
  const labour = resolveMonthLabour({
    monthKey: input.monthKey,
    scopeLocationIds: input.scopeLocationIds,
    payroll: input.payroll,
    estimatedLabour: input.estimatedLabour,
    hasEstimatedLabour: input.hasEstimatedLabour,
    revenue: input.revenue,
  });
  const expenses = monthExpenses(input);
  const profitBeforeOverheads = input.revenue - input.foodCost - (labour.amount ?? 0) - input.additionalExpenses;
  const operatingProfit = expenses.recorded ? profitBeforeOverheads - expenses.total : null;

  const flags: string[] = [];
  if (input.foodCostEstimated) flags.push("Food cost is estimated");
  if (labour.source === "estimate") flags.push("Labour is estimated from attendance");
  if (labour.source === "partial") flags.push(`Confirmed payroll covers ${labour.coveredLocations} of ${labour.totalLocations} locations — estimate used`);
  if (labour.source === "none") flags.push("Labour unknown");
  if (!expenses.recorded) flags.push("No overheads or expenses recorded");
  if (expenses.estimateTotal > 0) flags.push("Includes recurring estimates");
  if (expenses.vatUnknown > 0) flags.push(`${expenses.vatUnknown} cost${expenses.vatUnknown === 1 ? "" : "s"} with unknown VAT`);
  if (expenses.vatNotSeparated > 0) flags.push(`${expenses.vatNotSeparated} bill${expenses.vatNotSeparated === 1 ? "" : "s"} include VAT not separated`);

  return {
    monthKey: input.monthKey,
    labour,
    expenses,
    profitBeforeOverheads,
    operatingProfit,
    operatingMarginPct: operatingProfit != null && input.revenue > 0 ? (operatingProfit / input.revenue) * 100 : null,
    flags,
  };
}
