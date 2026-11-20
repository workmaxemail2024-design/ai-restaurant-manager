import { describe, expect, test } from "bun:test";
import { aggregateReceivedByMonth, pnlMonths } from "@/lib/receivedGross";

const days = (ym: string, n: number, total: number) => {
  const cents = Math.round(total * 100), each = Math.floor(cents / n);
  return Array.from({ length: n }, (_, i) => ({ location_id: "rudys", trading_date: `${ym}-${String(i + 1).padStart(2, "0")}`,
    official_gross: (i === n - 1 ? cents - each * (n - 1) : each) / 100 }));
};

describe("received Captiva gross by month", () => {
  test("Rudy's October 84359.92 over 31 days, September 83570.22 over 30 (kept separate from posted 42176.35)", () => {
    const r = aggregateReceivedByMonth([...days("2026-10", 31, 84359.92), ...days("2026-09", 30, 83570.22)], ["2026-09", "2026-10"], 1, "2026-11-20");
    expect(r[1]).toEqual({ month: "2026-10", gross: 84359.92, coveredDays: 31, expectedDays: 31, partial: false });
    expect(r[0].gross).toBe(83570.22);
    expect(r[0].gross).not.toBe(83570.22 + 42176.35);
  });
  test("absent month is null, not zero; current month partial to today", () => {
    const r = aggregateReceivedByMonth([{ location_id: "a", trading_date: "2026-11-02", official_gross: 10 }], ["2026-08", "2026-11"], 3, "2026-11-20");
    expect(r[0]).toEqual({ month: "2026-08", gross: null, coveredDays: 0, expectedDays: 93, partial: true });
    expect(r[1]).toMatchObject({ gross: 10, coveredDays: 1, expectedDays: 60, partial: true });
  });
  test("duplicate restaurant-day counted once; unknown gross not counted", () => {
    const r = aggregateReceivedByMonth([
      { location_id: "a", trading_date: "2026-10-01", official_gross: 5 },
      { location_id: "a", trading_date: "2026-10-01", official_gross: 5 },
      { location_id: "a", trading_date: "2026-10-02", official_gross: null },
    ], ["2026-10"], 1, "2026-11-20");
    expect(r[0]).toMatchObject({ gross: 5, coveredDays: 1 });
  });
  test("YTD = Jan..Nov 2026; six months retained", () => {
    expect(pnlMonths("ytd", new Date(2026, 10, 20))).toEqual(["2026-01","2026-02","2026-03","2026-04","2026-05","2026-06","2026-07","2026-08","2026-09","2026-10","2026-11"]);
    expect(pnlMonths(6, new Date(2026, 10, 20))).toEqual(["2026-06","2026-07","2026-08","2026-09","2026-10","2026-11"]);
  });
});
