import { describe, it, expect } from "bun:test";
import { buildMonthFinancials, isLabourCategory, type OverheadLike, type PayrollLike } from "../src/lib/monthlyFinancials";
import { MONTH_END_ITEMS, canConfirm, deriveCloseState, monthEndGuidance, profitStatus, validateItemChange, type SavedItems } from "../src/lib/monthEndClose";

const RUDYS = "loc-rudys", MAX = "loc-max", GPF = "loc-gpf";
const pay = (loc: string, amount: number, status: PayrollLike["status"] = "active"): PayrollLike =>
  ({ id: `${loc}-${amount}-${status}`, location_id: loc, period_month: "2026-10-01", amount, scope: "gross_wages", scope_note: null, source: "manual", status });
const oh = (o: Partial<OverheadLike>): OverheadLike => ({ id: "oh", name: "Rent", category: "rent", location_id: RUDYS, amount: 1000, frequency: "monthly", start_date: null, end_date: null, is_active: true, vat_treatment: "inc_vat", ...o });
const base = { monthKey: "2026-10", revenue: 50000, foodCost: 15000, foodCostEstimated: false, additionalExpenses: 0, selectedLocationId: null, locationCount: 3, actuals: [] as any[] };

describe("monthly wage totals", () => {
  it("confirmed payroll for all three locations is the wage expense: 8000+6000+5000 = 19000", () => {
    const m = buildMonthFinancials({ ...base, estimatedLabour: 12345, hasEstimatedLabour: true, scopeLocationIds: [RUDYS, MAX, GPF], overheads: [], payroll: [pay(RUDYS, 8000), pay(MAX, 6000), pay(GPF, 5000)] });
    expect(m.labour.source).toBe("confirmed");
    expect(m.labour.amount).toBe(19000);
  });
  it("superseded/void corrections are ignored; only the active total counts", () => {
    const m = buildMonthFinancials({ ...base, estimatedLabour: 0, hasEstimatedLabour: false, scopeLocationIds: [RUDYS], overheads: [], payroll: [pay(RUDYS, 7000, "superseded"), pay(RUDYS, 7500), pay(RUDYS, 100, "void")] });
    expect(m.labour.amount).toBe(7500);
  });
});

describe("double-count prevention", () => {
  it("estimated hourly/daily labour is replaced, not added", () => {
    const m = buildMonthFinancials({ ...base, estimatedLabour: 9000, hasEstimatedLabour: true, scopeLocationIds: [RUDYS], overheads: [], payroll: [pay(RUDYS, 8000)] });
    expect(m.profitBeforeOverheads).toBe(50000 - 15000 - 8000);
  });
  it("a recurring 'Wages' overhead is excluded once payroll is confirmed; rent stays", () => {
    const m = buildMonthFinancials({ ...base, estimatedLabour: 0, hasEstimatedLabour: false, scopeLocationIds: [RUDYS], payroll: [pay(RUDYS, 8000)],
      overheads: [oh({ id: "w", name: "Staff wages", category: "wages", amount: 7000 }), oh({ id: "r" })] });
    expect(m.expenses.total).toBe(1000);
    expect(m.expenses.excludedAsPayrollIds).toEqual(["w"]);
  });
  it("without confirmed payroll the wages overhead is still counted", () => {
    const m = buildMonthFinancials({ ...base, estimatedLabour: 0, hasEstimatedLabour: false, scopeLocationIds: [RUDYS], payroll: [],
      overheads: [oh({ id: "w", name: "Staff wages", category: "wages", amount: 7000 })] });
    expect(m.expenses.total).toBe(7000);
  });
  it("labour category detection", () => {
    expect(isLabourCategory("Payroll")).toBe(true);
    expect(isLabourCategory("utilities", "Electricity")).toBe(false);
  });
});

describe("restaurant/location isolation", () => {
  it("payroll for another location never counts toward Rudy's", () => {
    const m = buildMonthFinancials({ ...base, estimatedLabour: 4000, hasEstimatedLabour: true, scopeLocationIds: [RUDYS], overheads: [], payroll: [pay(MAX, 6000)] });
    expect(m.labour.source).toBe("estimate");
    expect(m.labour.amount).toBe(4000);
  });
  it("payroll for 2 of 3 locations is partial: estimate used, never mixed", () => {
    const m = buildMonthFinancials({ ...base, estimatedLabour: 15000, hasEstimatedLabour: true, scopeLocationIds: [RUDYS, MAX, GPF], overheads: [], payroll: [pay(RUDYS, 8000), pay(MAX, 6000)] });
    expect(m.labour.source).toBe("partial");
    expect(m.labour.amount).toBe(15000);
  });
});

describe("missing information", () => {
  it("no payroll and no estimate → labour Unknown and flagged", () => {
    const m = buildMonthFinancials({ ...base, estimatedLabour: 0, hasEstimatedLabour: false, scopeLocationIds: [RUDYS], overheads: [], payroll: [] });
    expect(m.labour.amount).toBeNull();
    expect(m.flags).toContain("Labour unknown");
  });
  it("guidance lists outstanding steps with the existing form to open", () => {
    const g = monthEndGuidance({ items: { sales: { status: "done" }, payroll: { status: "waiting", note: "Accountant sends 5th" } }, confirmed_at: null });
    expect(g[0]).toMatchObject({ key: "payroll", status: "waiting", route: "/settings/financial/overheads", note: "Accountant sends 5th" });
    expect(g.find((s) => s.key === "sales")).toBeUndefined();
  });
});

describe("completion states", () => {
  const all = (status: "done" | "skipped"): SavedItems => Object.fromEntries(MONTH_END_ITEMS.map((d) => [d.key, { status: d.skippable ? status : "done" }]));
  it("Not Started → In Progress → Waiting → Ready for Review → Confirmed", () => {
    expect(deriveCloseState(null)).toBe("not_started");
    expect(deriveCloseState({ items: { sales: { status: "done" } }, confirmed_at: null })).toBe("in_progress");
    expect(deriveCloseState({ items: { payroll: { status: "waiting" } }, confirmed_at: null })).toBe("waiting");
    expect(deriveCloseState({ items: all("skipped"), confirmed_at: null })).toBe("ready_for_review");
    expect(deriveCloseState({ items: all("done"), confirmed_at: "2026-11-05T10:00:00Z" })).toBe("confirmed");
  });
  it("cannot confirm until Ready for Review", () => {
    expect(canConfirm({ items: { sales: { status: "done" } }, confirmed_at: null })).toBe(false);
    expect(canConfirm({ items: all("done"), confirmed_at: null })).toBe(true);
  });
  it("sales cannot be skipped; payroll can", () => {
    expect(validateItemChange("sales", "skipped")).not.toBeNull();
    expect(validateItemChange("payroll", "skipped")).toBeNull();
  });
  it("profit is Confirmed only with a confirmed month and confirmed payroll", () => {
    expect(profitStatus("confirmed", "confirmed")).toBe("confirmed");
    expect(profitStatus("confirmed", "estimate")).toBe("provisional");
    expect(profitStatus("ready_for_review", "confirmed")).toBe("provisional");
  });
});

describe("AI guidance is read-only", () => {
  it("guidance only describes steps and routes; a confirmed month has none", () => {
    const g = monthEndGuidance(null);
    expect(g.length).toBe(MONTH_END_ITEMS.length);
    for (const s of g) expect(Object.keys(s).sort()).toEqual(["formLabel", "key", "label", "note", "route", "status", "why"]);
    expect(monthEndGuidance({ items: {}, confirmed_at: "2026-11-05T00:00:00Z" })).toEqual([]);
  });
});
