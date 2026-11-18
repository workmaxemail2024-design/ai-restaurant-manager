import { describe, it, expect } from "bun:test";
import { manualLabourCost, parseLabourRate } from "../src/lib/labourRate";
import { resolveAuthorisedLocation } from "../src/lib/locationScope";
// reportsMonthly pulls in modules that touch localStorage at import time.
const mem = new Map<string, string>();
(globalThis as any).localStorage ??= { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) };
const { buildReportsPeriod } = await import("../src/lib/reportsMonthly");

describe("manual labour rate (no €12.50 default)", () => {
  it("no rate set → manual hours cost Unknown", () => {
    expect(manualLabourCost(8, null)).toBeNull();
  });
  it("invalid rates are rejected", () => {
    expect(parseLabourRate("0")).toBeNull();
    expect(parseLabourRate("-3")).toBeNull();
    expect(parseLabourRate("abc")).toBeNull();
  });
  it("explicit rate prices hours: 8h × €14 = €112", () => {
    expect(manualLabourCost(8, 14)).toBe(112);
  });
});

describe("remembered location", () => {
  it("authorised location is kept", () => {
    expect(resolveAuthorisedLocation("A", ["A", "B"])).toBe("A");
  });
  it("foreign or stale location is cleared", () => {
    expect(resolveAuthorisedLocation("X", ["A", "B"])).toBeNull();
  });
});

describe("monthly period labour without a rate", () => {
  const base = {
    key: "2026-11", label: "Nov",
    days: [{ date: "2026-11-01", hasData: true, revenue: 1000, orders: 10, visitors: null, qtySold: 20 } as any],
    attendanceMap: new Map(), bookingDays: new Set<string>(), costMap: new Map(),
  };
  const ledger = new Map([["2026-11-01", { labour_hours: 10, additional_expenses: 0 } as any]]);
  it("manual hours with no rate add €0 cost but flag the day as labour missing", () => {
    const r = buildReportsPeriod({ ...base, ledgerEntries: ledger, avgHourlyRate: null });
    expect(r.totalLabourCost).toBe(0);
    expect(r.labourMissingDays).toBe(1);
  });
  it("with a €15 rate the same day costs €150", () => {
    const r = buildReportsPeriod({ ...base, ledgerEntries: ledger, avgHourlyRate: 15 });
    expect(r.totalLabourCost).toBe(150);
    expect(r.labourMissingDays).toBe(0);
  });
});

describe("reservations", () => {
  it("an inquiry booking has next actions (Confirm / Pending / Decline)", async () => {
    const { getNextActions } = await import("../src/hooks/useReservations");
    expect(getNextActions("inquiry").map((a) => a.status)).toEqual(["confirmed", "pending", "declined"]);
  });
});
