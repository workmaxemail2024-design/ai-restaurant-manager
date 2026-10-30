import { describe, expect, it } from "bun:test";
import {
  buildMonthFinancials,
  monthlyEquivalent,
  overheadCostForMonth,
  resolveMonthLabour,
  type ActualExpenseLike,
  type OverheadLike,
  type PayrollLike,
} from "../src/lib/monthlyFinancials";

const RUDY = "loc-rudy";
const MAX = "loc-max";

const overhead = (o: Partial<OverheadLike>): OverheadLike => ({
  id: "o1", name: "Insurance", category: "Insurance", location_id: RUDY, amount: 900, frequency: "quarterly",
  start_date: "2026-01-01", end_date: null, is_active: true, allocation_mode: "single", allocation_details: {}, vat_treatment: "no_vat", ...o,
});
const actual = (e: Partial<ActualExpenseLike>): ActualExpenseLike => ({
  id: "a1", location_id: RUDY, period_month: "2026-09-01", description: "Insurance bill", category: "Insurance",
  amount: 310, vat_treatment: "no_vat", vat_amount: null, replaces_overhead_id: null, status: "active", ...e,
});
const payroll = (p: Partial<PayrollLike>): PayrollLike => ({
  id: "p1", location_id: RUDY, period_month: "2026-09-01", amount: 37382.65, scope: "gross_wages_employer_prsi",
  scope_note: null, source: "accountant_import", status: "active", ...p,
});

describe("monthly equivalents", () => {
  it("quarterly €900 is €300 a month", () => expect(monthlyEquivalent(900, "quarterly")).toBe(300));
  it("annual €3,600 is €300 a month", () => expect(monthlyEquivalent(3600, "yearly")).toBe(300));
  it("monthly stays monthly", () => expect(monthlyEquivalent(450, "monthly")).toBe(450));
  it("weekly €100 is €433.33 a month", () => expect(monthlyEquivalent(100, "weekly")!).toBeCloseTo(433.333, 2));
  it("an estimate starting mid-month is prorated (16 of 30 days)", () =>
    expect(overheadCostForMonth(overhead({ frequency: "monthly", amount: 300, start_date: "2026-09-15" }), "2026-09", null, 2)).toBeCloseTo(160, 5));
  it("an estimate starting after the month costs nothing", () =>
    expect(overheadCostForMonth(overhead({ start_date: "2026-10-01" }), "2026-09", null, 2)).toBe(0));
});

describe("actual bill replacing an estimate is counted once", () => {
  const base = {
    monthKey: "2026-09", revenue: 100000, foodCost: 30000, foodCostEstimated: false, additionalExpenses: 0,
    estimatedLabour: 30000, hasEstimatedLabour: true, selectedLocationId: RUDY, scopeLocationIds: [RUDY], locationCount: 2,
    payroll: [] as PayrollLike[],
  };
  it("without the bill the €300 monthly estimate counts", () => {
    const f = buildMonthFinancials({ ...base, overheads: [overhead({})], actuals: [] });
    expect(f.expenses.total).toBeCloseTo(300, 5);
  });
  it("with a replacing bill only the €310 bill counts (not €610)", () => {
    const f = buildMonthFinancials({ ...base, overheads: [overhead({})], actuals: [actual({ replaces_overhead_id: "o1" })] });
    expect(f.expenses.total).toBe(310);
    expect(f.expenses.estimateTotal).toBe(0);
  });
  it("the replacement applies only to that month", () => {
    const f = buildMonthFinancials({ ...base, monthKey: "2026-08", overheads: [overhead({})], actuals: [actual({ replaces_overhead_id: "o1" })] });
    expect(f.expenses.total).toBeCloseTo(300, 5);
  });
  it("a bill that does not replace the estimate is added to it", () => {
    const f = buildMonthFinancials({ ...base, overheads: [overhead({})], actuals: [actual({ description: "Extra cover" })] });
    expect(f.expenses.total).toBeCloseTo(610, 5);
  });
  it("a voided bill brings the estimate back", () => {
    const f = buildMonthFinancials({ ...base, overheads: [overhead({})], actuals: [actual({ replaces_overhead_id: "o1", status: "void" })] });
    expect(f.expenses.total).toBeCloseTo(300, 5);
  });
  it("VAT is removed when the bill states it", () => {
    const f = buildMonthFinancials({ ...base, overheads: [], actuals: [actual({ amount: 123, vat_treatment: "inc_vat", vat_amount: 23 })] });
    expect(f.expenses.total).toBe(100);
  });
});

describe("confirmed payroll replaces estimated labour", () => {
  it("uses €37,382.65 confirmed instead of the €30,000 estimate (never €67,382.65)", () => {
    const l = resolveMonthLabour({ monthKey: "2026-09", scopeLocationIds: [RUDY], payroll: [payroll({})], estimatedLabour: 30000, hasEstimatedLabour: true, revenue: 100000 });
    expect(l.source).toBe("confirmed");
    expect(l.amount).toBe(37382.65);
    expect(l.pctOfSales).toBeCloseTo(37.38265, 4);
  });
  it("operating profit uses the confirmed payroll once", () => {
    const f = buildMonthFinancials({
      monthKey: "2026-09", revenue: 100000, foodCost: 30000, foodCostEstimated: false, additionalExpenses: 500,
      estimatedLabour: 30000, hasEstimatedLabour: true, selectedLocationId: RUDY, scopeLocationIds: [RUDY], locationCount: 2,
      overheads: [overhead({})], actuals: [], payroll: [payroll({})],
    });
    expect(f.profitBeforeOverheads).toBeCloseTo(100000 - 30000 - 37382.65 - 500, 5);
    expect(f.operatingProfit!).toBeCloseTo(100000 - 30000 - 37382.65 - 500 - 300, 5);
  });
  it("a superseded figure is ignored after a correction", () => {
    const l = resolveMonthLabour({ monthKey: "2026-09", scopeLocationIds: [RUDY], payroll: [payroll({ status: "superseded" }), payroll({ id: "p2", amount: 37400.1 })], estimatedLabour: 0, hasEstimatedLabour: false, revenue: 1 });
    expect(l.amount).toBe(37400.1);
  });
  it("all locations with payroll for only one keeps the estimate (no mixing)", () => {
    const l = resolveMonthLabour({ monthKey: "2026-09", scopeLocationIds: [RUDY, MAX], payroll: [payroll({})], estimatedLabour: 50000, hasEstimatedLabour: true, revenue: 1 });
    expect(l.source).toBe("partial");
    expect(l.amount).toBe(50000);
  });
  it("other months keep the estimate", () => {
    const l = resolveMonthLabour({ monthKey: "2026-08", scopeLocationIds: [RUDY], payroll: [payroll({})], estimatedLabour: 28000, hasEstimatedLabour: true, revenue: 1 });
    expect(l.source).toBe("estimate");
    expect(l.amount).toBe(28000);
  });
});

describe("unknown stays unknown", () => {
  it("no overheads recorded gives no operating profit rather than treating them as €0", () => {
    const f = buildMonthFinancials({
      monthKey: "2026-09", revenue: 1000, foodCost: 300, foodCostEstimated: false, additionalExpenses: 0, estimatedLabour: 200,
      hasEstimatedLabour: true, selectedLocationId: null, scopeLocationIds: [RUDY], locationCount: 1, overheads: [], actuals: [], payroll: [],
    });
    expect(f.operatingProfit).toBeNull();
    expect(f.flags).toContain("No overheads or expenses recorded");
  });
});
