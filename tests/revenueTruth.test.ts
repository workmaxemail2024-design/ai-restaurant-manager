import { describe, it, expect } from "bun:test";
import { dedupePosSales, effectiveOrdersAndCovers, recipeFoodCost, sumRevenue } from "../src/lib/revenueTruth";

const day = (locationId: string, orderCount: number | null, visitorCount: number | null = null) =>
  ({ locationId, reportDate: "2026-11-01", orderCount, visitorCount });

describe("per-location manual overrides", () => {
  it("A corrected to 10 and B POS 7 gives 17 in All locations", () => {
    const r = effectiveOrdersAndCovers([day("A", 4), day("B", 7)], [
      { entry_date: "2026-11-01", location_id: "A", manual_orders: 10 },
    ]);
    expect(r.orders).toBe(17);
  });
  it("explicit manual 0 covers overrides POS", () => {
    const r = effectiveOrdersAndCovers([day("A", 5, 40)], [
      { entry_date: "2026-11-01", location_id: "A", covers: 0 },
    ]);
    expect(r.covers).toBe(0);
  });
  it("covers_unknown makes covers Unknown", () => {
    const r = effectiveOrdersAndCovers([day("A", 5, 40)], [
      { entry_date: "2026-11-01", location_id: "A", covers: 0, covers_unknown: true },
    ]);
    expect(r.covers).toBeNull();
  });
});

describe("POS source dedupe", () => {
  it("API and XLS rows for the same location/day count revenue once", () => {
    const rows = [
      { location_id: "A", sale_date: "2026-11-01", source: "captiva", total_price: 100 },
      { location_id: "A", sale_date: "2026-11-01", source: "captiva_xls", total_price: 100 },
      { location_id: "A", sale_date: "2026-11-01", source: "manual", total_price: 5 },
      { location_id: "B", sale_date: "2026-11-01", source: "captiva", total_price: 50 },
    ];
    expect(sumRevenue(dedupePosSales(rows))).toBe(155);
  });
  it("no sales rows is Unknown, not €0", () => {
    expect(sumRevenue([])).toBeNull();
  });
});

describe("food cost quantities", () => {
  it("one row with quantity 3 costs 3x", () => {
    const r = recipeFoodCost([{ dish_id: "d", quantity: 3 }], new Map([["d", 2.5]]));
    expect(r.cost).toBe(7.5);
  });
  it("missing recipe cost is Unknown, never €0", () => {
    const r = recipeFoodCost([{ dish_id: "d", quantity: 2 }], new Map([["d", null]]));
    expect(r.cost).toBeNull();
    expect(r.uncostedDishIds).toEqual(["d"]);
  });
});
