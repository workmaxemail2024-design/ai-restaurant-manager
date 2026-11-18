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

import { canonicalizePosSummaries, sumNullable } from "../src/lib/posDailyCanonical";

const row = (loc: string, provider: string, gross: number | null, extra: Record<string, unknown> = {}) => ({
  report_date: "2026-11-01", location_id: loc, pos_provider: provider,
  gross_sales: gross, net_sales: gross != null ? gross / 1.135 : null, vat_amount: gross != null ? gross - gross / 1.135 : null,
  discounts: null, order_count: null, visitor_count: null, average_order_value: null, ...extra,
});

describe("canonical KPIs", () => {
  it("mixed POS sources for one location/day are never added (gross, net, VAT)", () => {
    const days = canonicalizePosSummaries([
      row("A", "captiva_xls", 1135, { has_product_detail: true }),
      row("A", "captiva", 1135, { has_summary_report: true, order_count: 40 }),
    ] as any);
    expect(days).toHaveLength(1);
    expect(days[0].grossSales).toBe(1135);
    expect(days[0].netSales).toBeCloseTo(1000, 6);
    expect(days[0].vat).toBeCloseTo(135, 6);
    expect(days[0].orderCount).toBe(40);
  });
  it("all-location totals sum each location once; AOV = gross / orders", () => {
    const days = canonicalizePosSummaries([
      row("A", "captiva_xls", 500, { order_count: 20 }),
      row("B", "captiva_xls", 300, { order_count: 10 }),
    ] as any);
    const gross = sumNullable(days.map((d) => d.grossSales));
    const orders = sumNullable(days.map((d) => d.orderCount));
    expect(gross).toBe(800);
    expect(orders).toBe(30);
    expect(gross! / orders!).toBeCloseTo(26.667, 3);
  });
  it("a location with no gross is Unknown, not €0", () => {
    const days = canonicalizePosSummaries([row("A", "captiva", null)] as any);
    expect(days[0].grossSales).toBeNull();
    expect(sumNullable(days.map((d) => d.grossSales))).toBeNull();
  });
  it("orders unknown at every location stays Unknown in All locations", () => {
    expect(effectiveOrdersAndCovers([day("A", null), day("B", null)], []).orders).toBeNull();
  });
  it("gross profit uses known cost only and flags uncosted dishes", () => {
    const fc = recipeFoodCost(
      [{ dish_id: "a", quantity: 2 }, { dish_id: "b", quantity: 1 }],
      new Map([["a", 4], ["b", null]]),
    );
    expect(fc.cost).toBe(8);
    expect(fc.uncostedDishIds).toEqual(["b"]);
    expect(100 - (fc.cost ?? 0)).toBe(92);
  });
});
