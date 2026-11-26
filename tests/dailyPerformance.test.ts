import { describe, expect, test } from "bun:test";
import { buildDailyPerformance, totalDailyPerformance, type OfficialCaptivaDay } from "@/lib/dailyPerformance";
import type { PosDailySummaryRow } from "@/lib/posDailyCanonical";

const gourmet = "ffaff6e1-9438-46f9-ba7f-9788f6ed2dc6";
const max = "461a2edc-108d-4923-89c4-ac7a9f8cb9e1";
const official = (overrides: Partial<OfficialCaptivaDay> = {}): OfficialCaptivaDay => ({
  restaurant_id: "tenant",
  location_id: gourmet,
  trading_date: "2026-11-25",
  official_gross: 4597.81,
  official_orders: 91,
  reconciliation_state: "unverified",
  ...overrides,
});
const summary = (overrides: Partial<PosDailySummaryRow> = {}): PosDailySummaryRow => ({
  report_date: "2026-11-25",
  location_id: gourmet,
  pos_provider: "captiva_xls",
  gross_sales: 120,
  net_sales: 100,
  vat_amount: 20,
  discounts: 0,
  order_count: 8,
  visitor_count: 12,
  average_order_value: 15,
  has_product_detail: true,
  has_summary_report: true,
  ...overrides,
});
const build = (overrides: Partial<Parameters<typeof buildDailyPerformance>[0]> = {}) => buildDailyPerformance({
  restaurantId: "tenant",
  locationIds: [gourmet, max],
  start: "2026-11-25",
  end: "2026-11-25",
  official: [official()],
  summaries: [],
  sales: [],
  ...overrides,
});

describe("Sales daily performance", () => {
  test("Gourmet 25 November uses the actual received 91 orders and €4,597.81", () => {
    const result = build();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ locationId: gourmet, date: "2026-11-25", gross: 4597.81, orders: 91, source: "received" });
  });
  test("received Captiva and posted records for the same day are never added together", () => {
    const result = build({ summaries: [summary()], sales: [{ id: "sale", location_id: gourmet, sale_date: "2026-11-25", source: "captiva_xls", total_price: 120 }] });
    expect(result[0].gross).toBe(4597.81);
    expect(result[0].orders).toBe(91);
    expect(result[0].covers).toBe(12);
  });
  test("posted summary is a fallback only when official values are missing", () => {
    const noOfficial = build({ official: [], summaries: [summary()] });
    expect(noOfficial[0]).toMatchObject({ gross: 120, orders: 8, source: "posted" });
    const missingOrders = build({ official: [official({ official_orders: null })], summaries: [summary()] });
    expect(missingOrders[0]).toMatchObject({ gross: 4597.81, orders: 8, source: "mixed" });
  });
  test("posted product lines supply gross fallback but never invent an order count", () => {
    const result = build({ official: [], sales: [
      { id: "a", location_id: gourmet, sale_date: "2026-11-25", source: "manual", total_price: 10.5 },
      { id: "b", location_id: gourmet, sale_date: "2026-11-25", source: "manual", total_price: 4.5 },
    ] });
    expect(result[0]).toMatchObject({ gross: 15, orders: null, source: "posted" });
  });
  test("API and XLS duplicates have one gross fallback", () => {
    const result = build({ official: [], sales: [
      { id: "xls", location_id: gourmet, sale_date: "2026-11-25", source: "captiva_xls", total_price: 50 },
      { id: "api", location_id: gourmet, sale_date: "2026-11-25", source: "captiva_api", total_price: 50 },
    ] });
    expect(result[0].gross).toBe(50);
  });
  test("selected locations, tenant and inclusive date range are enforced", () => {
    const result = build({
      locationIds: [gourmet],
      start: "2026-11-24",
      end: "2026-11-25",
      official: [official(), official({ location_id: max }), official({ trading_date: "2026-11-26" }), official({ restaurant_id: "other" })],
    });
    expect(result).toHaveLength(1);
    expect(result[0].locationId).toBe(gourmet);
  });
  test("all locations keep separate rows and null totals never become zero", () => {
    const result = build({ official: [official(), official({ location_id: max, official_gross: null, official_orders: null })] });
    expect(result).toHaveLength(2);
    const totals = totalDailyPerformance(result);
    expect(totals.gross).toBe(4597.81);
    expect(totals.orders).toBe(91);
    expect(totals.covers).toBeNull();
    expect(totalDailyPerformance([])).toMatchObject({ gross: null, orders: null, covers: null });
  });
  test("an explicit zero remains zero and repeated official rows are not summed", () => {
    const result = build({ official: [official({ official_gross: 0, official_orders: 0 }), official({ official_gross: 0, official_orders: 0 })] });
    expect(result).toHaveLength(1);
    expect(result[0].gross).toBe(0);
    expect(result[0].orders).toBe(0);
  });
});
