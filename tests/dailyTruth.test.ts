import { describe, it, expect } from "bun:test";
import { canonicalRevenueDays, summarizeRevenue, marginBase } from "../src/lib/revenueTruth";
import { buildAllLocationsReadLedger, ledgerDayRevenue } from "../src/lib/reportsMonthly";

const D = "2026-11-01";
const pos = (locationId: string, gross: number | null, net: number | null = null, vat: number | null = null, orderCount: number | null = null) =>
  ({ locationId, reportDate: D, grossSales: gross, netSales: net, vat, orderCount, visitorCount: null });
const sale = (location_id: string, source: string, total_price: number) => ({ location_id, sale_date: D, source, total_price });
const led = (location_id: string | null, extra: Record<string, unknown>) => ({
  entry_date: D, location_id, covers: 0, labour_hours: 0, additional_expenses: 0, notes: "",
  is_closed: false, manual_revenue: null, manual_orders: null, covers_unknown: false, ...extra,
}) as any;

describe("canonical revenue source per location + day", () => {
  it("POS summary gross wins over product lines for the same location/day", () => {
    const days = canonicalRevenueDays([pos("A", 500, 410, 90)], [sale("A", "captiva_xls", 480)]);
    expect(summarizeRevenue(days).gross).toBe(500);
  });
  it("API + XLS lines without a summary count once", () => {
    const days = canonicalRevenueDays([], [sale("A", "captiva_xls", 300), sale("A", "captiva", 300)]);
    expect(summarizeRevenue(days).gross).toBe(300);
  });
  it("manual revenue counts only where that location has no POS data", () => {
    const days = canonicalRevenueDays([pos("A", 500)], [], [
      { entry_date: D, location_id: "A", manual_revenue: 999 },
      { entry_date: D, location_id: "B", manual_revenue: 120 },
    ]);
    expect(summarizeRevenue(days).gross).toBe(620);
  });
  it("no revenue anywhere is Unknown, not €0", () => {
    expect(summarizeRevenue(canonicalRevenueDays([], [])).gross).toBeNull();
  });
  it("three locations stay separate", () => {
    const days = canonicalRevenueDays([pos("A", 100)], [sale("B", "captiva", 40), sale("C", "captiva_xls", 7)]);
    expect(summarizeRevenue(days).byLocation).toEqual({ A: 100, B: 40, C: 7 });
  });
});

describe("gross vs net (VAT)", () => {
  it("net is used for margins only when every location/day has it", () => {
    const full = summarizeRevenue(canonicalRevenueDays([pos("A", 123, 100, 23), pos("B", 246, 200, 46)], []));
    expect(full.net).toBe(300);
    expect(full.vat).toBe(69);
    expect(marginBase(full)).toEqual({ base: 300, basis: "net" });
  });
  it("mixed coverage never guesses net: falls back to gross", () => {
    const mixed = summarizeRevenue(canonicalRevenueDays([pos("A", 123, 100, 23)], [sale("B", "captiva", 50)]));
    expect(mixed.net).toBeNull();
    expect(mixed.netCoverage).toBe("partial");
    expect(marginBase(mixed)).toEqual({ base: 173, basis: "gross" });
  });
});

describe("Reports All locations reads per-location corrections", () => {
  it("A corrected to 10 orders and B POS 7 gives 17", () => {
    const m = buildAllLocationsReadLedger(new Map(), [led("A", { manual_orders: 10 })],
      [pos("A", 300, null, null, 4), pos("B", 200, null, null, 7)], new Set());
    expect(m.get(D)!.manual_orders).toBe(17);
  });
  it("a location-less All-locations correction still wins", () => {
    const m = buildAllLocationsReadLedger(new Map([[D, led(null, { manual_orders: 50 })]]), [led("A", { manual_orders: 10 })],
      [pos("A", 300, null, null, 4), pos("B", 200, null, null, 7)], new Set());
    expect(m.get(D)!.manual_orders).toBe(50);
  });
  it("manual revenue of a location without POS is added to POS revenue of the others", () => {
    const m = buildAllLocationsReadLedger(new Map(), [led("C", { manual_revenue: 80 })], [pos("A", 300)], new Set(["A|" + D]));
    expect(ledgerDayRevenue({ hasData: true, revenue: 300 }, m.get(D))).toBe(380);
  });
  it("manual revenue is ignored for a location that has POS data", () => {
    const m = buildAllLocationsReadLedger(new Map(), [led("A", { manual_revenue: 80 })], [pos("A", 300)], new Set(["A|" + D]));
    expect(ledgerDayRevenue({ hasData: true, revenue: 300 }, m.get(D))).toBe(300);
  });
  it("per-location expenses and hours are summed into the day", () => {
    const m = buildAllLocationsReadLedger(new Map(), [led("A", { additional_expenses: 20, labour_hours: 5 }), led("B", { additional_expenses: 15, labour_hours: 3 })], [], new Set());
    expect(m.get(D)!.additional_expenses).toBe(35);
    expect(m.get(D)!.labour_hours).toBe(8);
  });
  it("editing map is untouched", () => {
    const edit = new Map([[D, led(null, { manual_orders: 5 })]]);
    buildAllLocationsReadLedger(edit, [led("A", { manual_orders: 10 })], [], new Set());
    expect(edit.get(D)!.manual_orders).toBe(5);
  });
});
