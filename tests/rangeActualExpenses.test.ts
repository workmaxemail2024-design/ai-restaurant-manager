import { describe, it, expect } from "bun:test";
import { rangeActualExpenses, monthsInRange } from "../src/lib/rangeActualExpenses";

const bill = (o: any) => ({ id: "b", location_id: "L1", period_month: "2026-11-01", description: "Electricity", category: "Utilities", amount: 300, vat_treatment: "ex_vat", vat_amount: null, replaces_overhead_id: null, status: "active", ...o });

describe("rangeActualExpenses", () => {
  it("prorates a monthly bill to one day (300 / 30)", () => {
    const r = rangeActualExpenses({ startDate: "2026-11-10", endDate: "2026-11-10", scopeLocationIds: ["L1"], actuals: [bill({})] });
    expect(r.amount).toBeCloseTo(10, 6);
  });
  it("ignores other locations and void bills", () => {
    const r = rangeActualExpenses({ startDate: "2026-11-01", endDate: "2026-11-30", scopeLocationIds: ["L1"], actuals: [bill({ location_id: "L2" }), bill({ status: "void" })] });
    expect(r.amount).toBe(0);
  });
  it("excludes wage bills so labour is not counted twice", () => {
    const r = rangeActualExpenses({ startDate: "2026-11-01", endDate: "2026-11-30", scopeLocationIds: ["L1"], actuals: [bill({ category: "Wages" })] });
    expect(r.amount).toBe(0);
    expect(r.wageBillsExcluded).toBe(1);
  });
  it("records the replaced estimate for that month only", () => {
    const r = rangeActualExpenses({ startDate: "2026-10-31", endDate: "2026-11-01", scopeLocationIds: ["L1"], actuals: [bill({ replaces_overhead_id: "OH1" })] });
    expect([...r.months[0].replacedOverheadIds]).toEqual([]);
    expect([...r.months[1].replacedOverheadIds]).toEqual(["OH1"]);
  });
  it("splits ranges by month", () => {
    expect(monthsInRange("2026-10-30", "2026-11-02").map((m) => m.monthStart)).toEqual(["2026-10-01", "2026-11-01"]);
  });
});
