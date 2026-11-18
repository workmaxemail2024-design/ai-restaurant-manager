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

  // Share of the month this estimate is active (1 for a whole month).
  let fraction = 1;
  if (o.frequency === "one_time") {
    if (!o.start_date || o.start_date < start || o.start_date > end) return 0;
  } else {
    const from = o.start_date && o.start_date > start ? o.start_date : start;
    const to = o.end_date && o.end_date < end ? o.end_date : end;
    fraction = Math.max(0, dayDiff(from, to) + 1) / days;
  }
  const costOf = (base: number) => (o.frequency === "one_time" ? base : (monthlyEquivalent(base, o.frequency) ?? 0) * fraction);

  if (selectedLocationId && !o.location_id) {
    const locs = Math.max(1, locationCount);
    const mode = o.allocation_mode ?? "equal";
    if (mode === "percentage") return costOf(o.amount) * ((o.allocation_details?.[selectedLocationId] ?? 100 / locs) / 100);
    if (mode === "manual") return costOf(o.allocation_details?.[selectedLocationId] ?? 0);
    return costOf(o.amount) / locs;
  }
  return costOf(o.amount);
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

export type LabourSource = "confirmed" | "mixed" | "estimate" | "none";
/** Per-location labour basis: confirmed payroll > wage-type actual bill > attendance estimate > unknown. */
export type LocationLabourSource = "confirmed" | "bill" | "estimate" | "unknown" | "conflict";

export interface LocationLabour {
  locationId: string;
  source: LocationLabourSource;
  amount: number | null;
  /** Wage-type actual bill ids standing in as this location's labour. */
  billIds: string[];
}

export interface MonthLabour {
  /** confirmed = every location has confirmed payroll; mixed = some confirmed, others estimated/unknown (provisional). */
  source: LabourSource;
  /** Sum of each location's own labour; null when no location's labour is known. */
  amount: number | null;
  estimatedAmount: number | null;
  confirmedAmount: number | null;
  coveredLocations: number;
  totalLocations: number;
  /** Locations whose labour is unknown — amount is then a lower bound, never a verified total. */
  unknownLocations: number;
  /** Locations with more than one active payroll figure (should be impossible; excluded until resolved). */
  conflictLocations: string[];
  locations: LocationLabour[];
  payroll: PayrollLike[];
  provisional: boolean;
  pctOfSales: number | null;
}

/**
 * Labour is resolved independently for each location + month. Confirmed payroll
 * is never discarded because another location is incomplete; locations without
 * it fall back to their own estimate (or Unknown). Any non-confirmed location
 * makes the total provisional.
 */
export function resolveMonthLabour(input: {
  monthKey: string;
  scopeLocationIds: string[];
  payroll: PayrollLike[];
  estimatedLabour: number;
  hasEstimatedLabour: boolean;
  /** Attendance/salary estimate per location (All Locations view). Missing key = unknown. */
  estimatedLabourByLocation?: Record<string, number | null | undefined>;
  /** Active actual bills, used only for wage-type bills at locations without confirmed payroll. */
  actuals?: ActualExpenseLike[];
  revenue: number;
}): MonthLabour {
  const { start } = monthBounds(input.monthKey);
  const scopeIds = [...new Set(input.scopeLocationIds)];
  const scope = new Set(scopeIds);
  const rows = input.payroll.filter((p) => p.status === "active" && p.period_month === start && scope.has(p.location_id));
  const wageBills = (input.actuals ?? []).filter((e) => e.status === "active" && e.period_month === start && scope.has(e.location_id) && isLabourCategory(e.category, e.description));
  const estimatedAmount = input.hasEstimatedLabour ? input.estimatedLabour : null;
  const single = scopeIds.length === 1;

  const locations: LocationLabour[] = scopeIds.map((loc) => {
    const pr = rows.filter((p) => p.location_id === loc);
    if (pr.length > 1) return { locationId: loc, source: "conflict", amount: null, billIds: [] };
    if (pr.length === 1) return { locationId: loc, source: "confirmed", amount: Number(pr[0].amount), billIds: [] };
    const bills = wageBills.filter((e) => e.location_id === loc);
    if (bills.length) return { locationId: loc, source: "bill", amount: bills.reduce((s, e) => s + actualExpenseCost(e).cost, 0), billIds: bills.map((b) => b.id) };
    const byLoc = input.estimatedLabourByLocation?.[loc];
    const est = byLoc != null ? Number(byLoc) : single ? estimatedAmount : null;
    return est != null ? { locationId: loc, source: "estimate", amount: est, billIds: [] } : { locationId: loc, source: "unknown", amount: null, billIds: [] };
  });

  const confirmedLocs = locations.filter((l) => l.source === "confirmed");
  const nonEstimate = locations.filter((l) => l.source === "confirmed" || l.source === "bill").length;
  const known = locations.filter((l) => l.amount != null);
  const total = scopeIds.length;

  let amount: number | null;
  let unknownLocations: number;
  if (nonEstimate === 0) {
    // Nothing actual anywhere: keep the canonical aggregate estimate unchanged.
    amount = estimatedAmount;
    unknownLocations = estimatedAmount == null ? total : 0;
  } else {
    amount = known.length ? known.reduce((s, l) => s + (l.amount as number), 0) : null;
    unknownLocations = locations.filter((l) => l.amount == null).length;
  }

  let source: LabourSource;
  if (total > 0 && confirmedLocs.length === total) source = "confirmed";
  else if (confirmedLocs.length > 0) source = "mixed";
  else if (amount != null) source = "estimate";
  else source = "none";

  return {
    source,
    amount,
    estimatedAmount,
    confirmedAmount: confirmedLocs.length ? confirmedLocs.reduce((s, l) => s + (l.amount as number), 0) : null,
    coveredLocations: confirmedLocs.length,
    totalLocations: total,
    unknownLocations,
    conflictLocations: locations.filter((l) => l.source === "conflict").map((l) => l.locationId),
    locations,
    payroll: rows,
    provisional: source !== "confirmed",
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
  /** Wage-type bills/estimates left out because confirmed payroll covers them. */
  excludedAsPayrollIds: string[];
  vatUnknown: number;
  vatNotSeparated: number;
  recorded: boolean;
}

/** Wage/salary costs — replaced by confirmed payroll, never added on top of it. */
export function isLabourCategory(category: string | null | undefined, label?: string | null): boolean {
  const t = `${category ?? ""} ${label ?? ""}`.toLowerCase();
  return /\b(wage|wages|payroll|salary|salaries|staff cost|staff costs|labour|labor|prsi)\b/.test(t);
}

export function monthExpenses(input: {
  /** Locations whose labour figure already represents wages: wage-type bills/estimates there are excluded. */
  payrollConfirmedLocationIds?: string[];
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

  const payrollCovered = new Set(input.payrollConfirmedLocationIds ?? []);
  const payrollCoversAll = scope.size > 0 && [...scope].every((id) => payrollCovered.has(id));
  const excludedAsPayroll: string[] = [];
  const lines: ExpenseLine[] = [];
  let vatUnknown = 0;
  let vatNotSeparated = 0;
  for (const e of actuals) {
    if (payrollCovered.has(e.location_id) && isLabourCategory(e.category, e.description)) { excludedAsPayroll.push(e.id); continue; }
    const { cost, vatFlag } = actualExpenseCost(e);
    if (vatFlag === "unknown") vatUnknown += 1;
    if (vatFlag === "not_separated") vatNotSeparated += 1;
    lines.push({ id: e.id, label: e.description, category: e.category, amount: cost, kind: "actual", vatFlag });
  }
  for (const o of input.overheads) {
    if (replaced.has(o.id)) continue; // the actual bill stands in for this estimate this month
    if (o.location_id && !scope.has(o.location_id)) continue;
    if (isLabourCategory(o.category, o.name) && (o.location_id ? payrollCovered.has(o.location_id) : payrollCoversAll)) { excludedAsPayroll.push(o.id); continue; }
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
    excludedAsPayrollIds: excludedAsPayroll,
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
  estimatedLabourByLocation?: Record<string, number | null | undefined>;
}): MonthFinancials {
  const labour = resolveMonthLabour({
    monthKey: input.monthKey,
    scopeLocationIds: input.scopeLocationIds,
    payroll: input.payroll,
    estimatedLabour: input.estimatedLabour,
    hasEstimatedLabour: input.hasEstimatedLabour,
    estimatedLabourByLocation: input.estimatedLabourByLocation,
    actuals: input.actuals,
    revenue: input.revenue,
  });
  const expenses = monthExpenses({
    ...input,
    // Wage-type bills/estimates at a location are excluded whenever that location's labour is known
    // (confirmed payroll, the wage bill itself, or its own estimate) — counted once, never twice.
    payrollConfirmedLocationIds: labour.locations.filter((l) => l.amount != null).map((l) => l.locationId),
  });
  const profitBeforeOverheads = input.revenue - input.foodCost - (labour.amount ?? 0) - input.additionalExpenses;
  const operatingProfit = expenses.recorded ? profitBeforeOverheads - expenses.total : null;

  const flags: string[] = [];
  if (input.foodCostEstimated) flags.push("Food cost is estimated");
  if (labour.source === "estimate") flags.push("Labour is estimated from attendance");
  if (labour.source === "mixed") flags.push(`Provisional: confirmed payroll for ${labour.coveredLocations} of ${labour.totalLocations} locations, estimates for the rest`);
  if (labour.locations.some((l) => l.source === "bill")) flags.push("Labour for some locations comes from wage bills, not confirmed payroll");
  if (labour.unknownLocations > 0 && labour.amount != null) flags.push(`Labour unknown for ${labour.unknownLocations} location${labour.unknownLocations === 1 ? "" : "s"} — total is incomplete`);
  if (labour.conflictLocations.length) flags.push(`${labour.conflictLocations.length} location${labour.conflictLocations.length === 1 ? " has" : "s have"} more than one active payroll figure — excluded until corrected`);
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
