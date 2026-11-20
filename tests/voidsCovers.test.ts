import { describe, expect, test } from "bun:test";
import { formatOrdinalDate, formatOrdinalRange, ordinal } from "@/lib/ordinalDate";
import { monthGrid, voidDayStatus } from "@/lib/voidCalendar";
import { coversByLocationDay, coversTotal } from "@/lib/captivaCovers";

describe("ordinal dates", () => {
  test("suffixes", () => expect([1,2,3,4,11,12,13,21,22,23,31].map(ordinal)).toEqual(["1st","2nd","3rd","4th","11th","12th","13th","21st","22nd","23rd","31st"]));
  test("same month", () => expect(formatOrdinalRange("2026-11-01","2026-11-11")).toBe("1st–11th November 2026"));
  test("cross month", () => expect(formatOrdinalRange("2026-10-28","2026-11-03")).toBe("28th October – 3rd November 2026"));
  test("cross year", () => expect(formatOrdinalRange("2026-12-30","2027-01-02")).toBe("30th December 2026 – 2nd January 2027"));
  test("weekday", () => expect(formatOrdinalDate("2026-11-01", true)).toBe("Sun 1st November 2026"));
});

describe("void calendar", () => {
  test("Monday-first: 1 Nov 2026 is Sunday", () => {
    const g = monthGrid(2026, 10);
    expect(g[0].slice(0, 6).every((c) => c === null)).toBe(true);
    expect(g[0][6]).toBe("2026-11-01");
    expect(g.flat().filter(Boolean).length).toBe(30);
  });
  const base = { date: "2026-11-10", today: "2026-11-20", locationIds: ["a", "b"], completeLocationIds: new Set(["a", "b"]) };
  test("any unresolved case among several → open", () => {
    expect(voidDayStatus({ ...base, eventStatuses: ["resolved", null, "reviewing"] })).toEqual({ status: "open", open: 2, total: 3 });
  });
  test("all resolved with complete journals → resolved", () => expect(voidDayStatus({ ...base, eventStatuses: ["resolved", "resolved"] }).status).toBe("resolved"));
  test("complete journal, no voids → clear", () => expect(voidDayStatus({ ...base, eventStatuses: [] }).status).toBe("clear"));
  test("partial coverage → unknown, never green", () => expect(voidDayStatus({ ...base, completeLocationIds: new Set(["a"]), eventStatuses: [] }).status).toBe("unknown"));
  test("changing location narrows scope", () => expect(voidDayStatus({ ...base, locationIds: ["a"], completeLocationIds: new Set(["a"]), eventStatuses: [] }).status).toBe("clear"));
  test("future → neutral", () => expect(voidDayStatus({ ...base, date: "2026-11-25", eventStatuses: [] }).status).toBe("future"));
});

describe("covers", () => {
  const row = (loc: string, date: string, provider: string, v: number | null, orders = 20) => ({
    report_date: date, location_id: loc, pos_provider: provider, gross_sales: 100, net_sales: null, vat_amount: null,
    discounts: null, order_count: orders, visitor_count: v, average_order_value: null,
  });
  test("counted once per restaurant/day even with two reports", () => {
    const m = coversByLocationDay([row("a", "2026-11-01", "captiva_xls", 87), row("a", "2026-11-01", "captiva", 87)]);
    expect(m.get("a|2026-11-01")).toBe(87);
  });
  test("missing stays unknown, real zero counts, never uses orders", () => {
    const m = coversByLocationDay([row("a", "2026-11-01", "captiva_xls", null, 33), row("b", "2026-11-01", "captiva_xls", 0)]);
    expect(m.get("a|2026-11-01")).toBeNull();
    expect(m.get("b|2026-11-01")).toBe(0);
    expect(coversTotal(["a|2026-11-01", "b|2026-11-01"], m)).toEqual({ total: 0, known: 1, days: 2, complete: false });
  });
  test("no reports → null total", () => expect(coversTotal(["x|d"], new Map()).total).toBeNull());
});
