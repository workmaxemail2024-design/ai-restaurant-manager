// Real (imported/entered) monthly bills for an arbitrary date range, read-only.
// Each active bill is prorated by the share of its month inside the range.
// Wage-type bills are left out (daily labour already comes from attendance) and
// a bill that replaces a recurring estimate removes that estimate for its month.
import { actualExpenseCost, isLabourCategory, monthBounds, type ActualExpenseLike } from "./monthlyFinancials";

export interface RangeMonth { monthStart: string; start: string; end: string; fraction: number; replacedOverheadIds: Set<string> }
export interface RangeActuals {
  amount: number;
  count: number;
  wageBillsExcluded: number;
  vatUnclear: number;
  byCategory: Record<string, number>;
  months: RangeMonth[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;

export function monthsInRange(startDate: string, endDate: string): Omit<RangeMonth, "replacedOverheadIds">[] {
  const out: Omit<RangeMonth, "replacedOverheadIds">[] = [];
  let [y, m] = startDate.split("-").map(Number);
  for (;;) {
    const mb = monthBounds(`${y}-${pad(m)}`);
    if (mb.start > endDate) break;
    const s = startDate > mb.start ? startDate : mb.start;
    const e = endDate < mb.end ? endDate : mb.end;
    out.push({ monthStart: mb.start, start: s, end: e, fraction: days(s, e) / mb.days });
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export function rangeActualExpenses(input: { startDate: string; endDate: string; scopeLocationIds: string[]; actuals: ActualExpenseLike[] }): RangeActuals {
  const scope = new Set(input.scopeLocationIds);
  const res: RangeActuals = { amount: 0, count: 0, wageBillsExcluded: 0, vatUnclear: 0, byCategory: {}, months: [] };
  for (const mo of monthsInRange(input.startDate, input.endDate)) {
    const bills = input.actuals.filter((e) => e.status === "active" && e.period_month === mo.monthStart && scope.has(e.location_id));
    const replaced = new Set<string>();
    for (const e of bills) {
      if (e.replaces_overhead_id) replaced.add(e.replaces_overhead_id);
      if (isLabourCategory(e.category, e.description)) { res.wageBillsExcluded += 1; continue; }
      const { cost, vatFlag } = actualExpenseCost(e);
      if (vatFlag) res.vatUnclear += 1;
      const part = cost * mo.fraction;
      res.amount += part;
      res.count += 1;
      const cat = e.category || "Other";
      res.byCategory[cat] = (res.byCategory[cat] ?? 0) + part;
    }
    res.months.push({ ...mo, replacedOverheadIds: replaced });
  }
  return res;
}
