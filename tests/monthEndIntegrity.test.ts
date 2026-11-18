import { describe, it, expect } from "bun:test";
import { buildMonthFinancials, resolveMonthLabour, type ActualExpenseLike, type OverheadLike, type PayrollLike } from "../src/lib/monthlyFinancials";
import { MONTH_END_ITEMS, canConfirm, confirmationReview, deriveCloseState, itemStatus, salesCoverageText, validateConfirmation, type SavedItems } from "../src/lib/monthEndClose";

const RUDYS = "loc-rudys", MAX = "loc-max", GPF = "loc-gpf";
const ALL = [RUDYS, MAX, GPF];
const pay = (loc: string, amount: number, status: PayrollLike["status"] = "active", id = `${loc}-${amount}-${status}`): PayrollLike =>
  ({ id, location_id: loc, period_month: "2026-10-01", amount, scope: "gross_wages", scope_note: null, source: "manual", status });
const bill = (e: Partial<ActualExpenseLike>): ActualExpenseLike => ({ id: "b1", location_id: GPF, period_month: "2026-10-01", description: "Wages October", category: "wages",
  amount: 4200, vat_treatment: "no_vat", vat_amount: null, replaces_overhead_id: null, status: "active", ...e });
const oh = (o: Partial<OverheadLike>): OverheadLike => ({ id: "oh", name: "Staff wages", category: "wages", location_id: GPF, amount: 3000, frequency: "monthly",
  start_date: null, end_date: null, is_active: true, vat_treatment: "no_vat", ...o });
const base = { monthKey: "2026-10", revenue: 100000, foodCost: 30000, foodCostEstimated: false, additionalExpenses: 0, selectedLocationId: null, locationCount: 3 };
const est = { [RUDYS]: 7000, [MAX]: 5500, [GPF]: 4500 };

describe("payroll per location and month", () => {
  it("Rudy's alone: confirmed €8,000", () => {
    const l = resolveMonthLabour({ monthKey: "2026-10", scopeLocationIds: [RUDYS], payroll: [pay(RUDYS, 8000), pay(MAX, 6000)], estimatedLabour: 7000, hasEstimatedLabour: true, revenue: 1 });
    expect(l.amount).toBe(8000);
    expect(l.source).toBe("confirmed");
  });
  it("GPF alone without payroll: its €4,500 estimate", () => {
    const l = resolveMonthLabour({ monthKey: "2026-10", scopeLocationIds: [GPF], payroll: [pay(RUDYS, 8000)], estimatedLabour: 4500, hasEstimatedLabour: true, revenue: 1 });
    expect(l.amount).toBe(4500);
    expect(l.source).toBe("estimate");
  });
  it("All Locations: €8,000 + €6,000 confirmed + €4,500 GPF estimate = €18,500, provisional", () => {
    const m = buildMonthFinancials({ ...base, estimatedLabour: 17000, hasEstimatedLabour: true, scopeLocationIds: ALL, overheads: [], actuals: [], payroll: [pay(RUDYS, 8000), pay(MAX, 6000)], estimatedLabourByLocation: est });
    expect(m.labour.amount).toBe(18500);
    expect(m.labour.source).toBe("mixed");
    expect(m.labour.provisional).toBe(true);
    expect(m.flags.some((f) => f.startsWith("Provisional"))).toBe(true);
  });
  it("All Locations sum equals the three single-location figures", () => {
    const pr = [pay(RUDYS, 8000), pay(MAX, 6000)];
    const one = (loc: string) => resolveMonthLabour({ monthKey: "2026-10", scopeLocationIds: [loc], payroll: pr, estimatedLabour: est[loc as keyof typeof est], hasEstimatedLabour: true, revenue: 1 }).amount!;
    const all = resolveMonthLabour({ monthKey: "2026-10", scopeLocationIds: ALL, payroll: pr, estimatedLabour: 17000, hasEstimatedLabour: true, estimatedLabourByLocation: est, revenue: 1 }).amount;
    expect(all).toBe(one(RUDYS) + one(MAX) + one(GPF));
  });
  it("all three confirmed: €19,000 confirmed (not provisional)", () => {
    const l = resolveMonthLabour({ monthKey: "2026-10", scopeLocationIds: ALL, payroll: [pay(RUDYS, 8000), pay(MAX, 6000), pay(GPF, 5000)], estimatedLabour: 17000, hasEstimatedLabour: true, estimatedLabourByLocation: est, revenue: 1 });
    expect(l.amount).toBe(19000);
    expect(l.provisional).toBe(false);
  });
  it("no confirmed payroll anywhere keeps the existing aggregate estimate", () => {
    const l = resolveMonthLabour({ monthKey: "2026-10", scopeLocationIds: ALL, payroll: [], estimatedLabour: 17200, hasEstimatedLabour: true, estimatedLabourByLocation: est, revenue: 1 });
    expect(l.amount).toBe(17200);
    expect(l.source).toBe("estimate");
  });
});

describe("missing data", () => {
  it("a location with no payroll and no estimate is Unknown, not €0; total flagged incomplete", () => {
    const m = buildMonthFinancials({ ...base, estimatedLabour: 0, hasEstimatedLabour: true, scopeLocationIds: ALL, overheads: [], actuals: [], payroll: [pay(RUDYS, 8000)], estimatedLabourByLocation: { [MAX]: 5500 } });
    expect(m.labour.locations.find((l) => l.locationId === GPF)).toMatchObject({ source: "unknown", amount: null });
    expect(m.labour.unknownLocations).toBe(1);
    expect(m.labour.amount).toBe(13500);
    expect(m.flags).toContain("Labour unknown for 1 location — total is incomplete");
  });
});

describe("no duplicate payroll across sources", () => {
  it("corrections: superseded €7,000 ignored, active €7,500 counts; void excluded", () => {
    const l = resolveMonthLabour({ monthKey: "2026-10", scopeLocationIds: [RUDYS], payroll: [pay(RUDYS, 7000, "superseded"), pay(RUDYS, 7500), pay(RUDYS, 300, "void")], estimatedLabour: 0, hasEstimatedLabour: false, revenue: 1 });
    expect(l.amount).toBe(7500);
  });
  it("two active payroll rows for one location are excluded and flagged, never summed", () => {
    const m = buildMonthFinancials({ ...base, estimatedLabour: 0, hasEstimatedLabour: false, scopeLocationIds: [RUDYS], overheads: [], actuals: [], payroll: [pay(RUDYS, 8000, "active", "a"), pay(RUDYS, 8000, "active", "b")] });
    expect(m.labour.amount).toBeNull();
    expect(m.labour.conflictLocations).toEqual([RUDYS]);
  });
  it("a wage bill replaces GPF's attendance estimate and is not also counted as an expense", () => {
    const m = buildMonthFinancials({ ...base, estimatedLabour: 17000, hasEstimatedLabour: true, scopeLocationIds: ALL, overheads: [], actuals: [bill({})], payroll: [pay(RUDYS, 8000), pay(MAX, 6000)], estimatedLabourByLocation: est });
    expect(m.labour.amount).toBe(8000 + 6000 + 4200);
    expect(m.expenses.total).toBe(0);
    expect(m.expenses.excludedAsPayrollIds).toEqual(["b1"]);
  });
  it("a voided wage bill no longer counts; GPF falls back to its estimate", () => {
    const m = buildMonthFinancials({ ...base, estimatedLabour: 17000, hasEstimatedLabour: true, scopeLocationIds: ALL, overheads: [], actuals: [bill({ status: "void" })], payroll: [pay(RUDYS, 8000), pay(MAX, 6000)], estimatedLabourByLocation: est });
    expect(m.labour.amount).toBe(18500);
  });
  it("a recurring wages estimate at GPF is not added on top of GPF's labour estimate", () => {
    const m = buildMonthFinancials({ ...base, estimatedLabour: 17000, hasEstimatedLabour: true, scopeLocationIds: ALL, overheads: [oh({})], actuals: [], payroll: [pay(RUDYS, 8000)], estimatedLabourByLocation: est });
    expect(m.expenses.excludedAsPayrollIds).toEqual(["oh"]);
    expect(m.labour.amount).toBe(8000 + 5500 + 4500);
  });
  it("payroll at Rudy's never excludes Maximilian's wage bill", () => {
    const m = buildMonthFinancials({ ...base, estimatedLabour: 0, hasEstimatedLabour: false, scopeLocationIds: [RUDYS, MAX], overheads: [], actuals: [bill({ location_id: MAX })], payroll: [pay(RUDYS, 8000)] });
    expect(m.labour.amount).toBe(12200);
    expect(m.expenses.total).toBe(0);
  });
});

describe("month confirmation", () => {
  const ready = (skip: string[] = []): SavedItems => Object.fromEntries(MONTH_END_ITEMS.map((d) => [d.key, { status: skip.includes(d.key) ? "skipped" : "done" }]));
  it("imported sales are shown as coverage, never ticked automatically", () => {
    const facts = { salesDays: 31, tradingDaysExpected: 31, fullDetailDays: 28, payrollConfirmed: true, expensesRecorded: true };
    expect(itemStatus("sales", {}, facts)).toBe("todo");
    expect(deriveCloseState(null, facts)).toBe("not_started");
    expect(salesCoverageText(facts)).toContain("31 of 31 days (28 with both summary and product detail)");
  });
  it("users without Owner/Finance Edit cannot confirm", () => {
    expect(validateConfirmation({ items: ready(), confirmed_at: null }, { canEdit: false, acknowledged: true, limitations: "x" })).not.toBeNull();
  });
  it("skipped stock count needs acknowledgement and a limitations note", () => {
    const rec = { items: ready(["stock_count"]), confirmed_at: null };
    expect(confirmationReview(rec)).toEqual({ skipped: ["stock_count"], financialSkipped: ["stock_count"], needsAcknowledgement: true });
    expect(validateConfirmation(rec, { canEdit: true, acknowledged: false, limitations: "" })).not.toBeNull();
    expect(validateConfirmation(rec, { canEdit: true, acknowledged: true, limitations: "" })).not.toBeNull();
    expect(validateConfirmation(rec, { canEdit: true, acknowledged: true, limitations: "No closing count" })).toBeNull();
  });
  it("skipping only the daily review needs no acknowledgement", () => {
    expect(validateConfirmation({ items: ready(["daily_review"]), confirmed_at: null }, { canEdit: true, acknowledged: false, limitations: "" })).toBeNull();
  });
  it("cannot confirm with an item still To do", () => {
    const items = ready(); delete items.stock_count;
    expect(canConfirm({ items, confirmed_at: null })).toBe(false);
  });
});
