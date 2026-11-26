import { describe, expect, test } from "bun:test";
import { buildProductsSold, currentProductSnapshots, explicitSourceChannel, readAllProductPages, type ProductSnapshot, type ProductObservation } from "@/lib/productsSold";

const snapshot = (id = "new", location = "rudys", date = "2026-11-25", observed = "2026-11-26T06:30:00Z"): ProductSnapshot => ({
  id, restaurant_id: "tenant", location_id: location, trading_date: date, observed_at: observed, journal_coverage: "complete",
});
const observation = (id = "item", source = "new", location = "rudys", qty: number | null = 5, type = "combo"): ProductObservation => ({
  id, source_id: source, restaurant_id: "tenant", location_id: location, trading_date: "2026-11-25", product_id: id,
  description: "Caesar Salad", product_type: type, quantity: qty,
});
const build = (overrides: Partial<Parameters<typeof buildProductsSold>[0]> = {}) => buildProductsSold({
  restaurantId: "tenant", locationIds: ["rudys", "max", "pizza"], start: "2026-11-25", end: "2026-11-25",
  snapshots: [snapshot()], observations: [observation()], posted: [], catalogue: [], ...overrides,
});
describe("shared scoped Products sold", () => {
  test("latest snapshot by observed time then ID, never sums historical snapshots", () => {
    const old = snapshot("old", "rudys", "2026-11-25", "2026-11-25T06:00:00Z");
    const r = build({ snapshots: [old, snapshot()], observations: [observation("item", "old", "rudys", 99), observation()] });
    expect(r.products).toHaveLength(1); expect(r.products[0].quantity).toBe(5);
    expect(currentProductSnapshots([snapshot("a"), snapshot("b")])[0].id).toBe("b");
  });
  test("current dashboard-only snapshot cannot fall back to old product observations", () => {
    const r = build({ snapshots: [snapshot("old", "rudys", "2026-11-25", "2026-11-25T06:00:00Z"), { ...snapshot(), journal_coverage: "dashboard_only" }], observations: [observation("x", "old")] });
    expect(r.products).toHaveLength(0); expect(r.snapshots).toHaveLength(1);
  });
  test("three bindings' locations stay separate, pizza missing products never becomes zero", () => {
    const r = build({ snapshots: [snapshot(), snapshot("m", "max"), { ...snapshot("p", "pizza"), journal_coverage: "dashboard_only" }], observations: [observation(), observation("b", "m", "max", 3)] });
    expect(r.products.map(p => p.quantity)).toEqual([5, 3]); expect(r.observationDays).toBe(2);
    expect(r.products.some(p => p.locationId === "pizza")).toBe(false);
  });
  test("location change, tenant and date ranges exclude other scope", () => {
    const otherTenant = { ...observation("bad"), restaurant_id: "other" };
    expect(build({ locationIds: ["pizza"], observations: [observation(), otherTenant] }).products).toHaveLength(0);
    expect(build({ start: "2026-11-24", end: "2026-11-24" }).products).toHaveLength(0);
    expect(build({ locationIds: ["rudys"], observations: [observation(), otherTenant] }).products).toHaveLength(1);
  });
  test("daily, weekly and monthly periods select the same in-range current detail", () => {
    for (const start of ["2026-11-25", "2026-11-19", "2026-11-01"]) expect(build({ start }).products[0].quantity).toBe(5);
  });
  test("posted POS replaces that day's journal detail, API/XLS is counted once", () => {
    const sale = { id: "s", location_id: "rudys", sale_date: "2026-11-25", source: "captiva_xls", dish_id: "d", quantity: 7, name: "Pizza", department: "Pizza" };
    const r = build({ posted: [sale, { ...sale, id: "api", source: "captiva", quantity: 100 }] });
    expect(r.products).toHaveLength(1); expect(r.products[0].quantity).toBe(7); expect(r.products[0].source).toBe("Posted"); expect(r.suppressedDays).toBe(1);
  });
  test("unknown quantity stays null, explicit zero remains zero and neither ranks", () => {
    const r = build({ observations: [observation("null", "new", "rudys", null), observation("zero", "new", "rudys", 0)] });
    expect(r.products.map(p => p.quantity)).toEqual([null, 0]); expect(r.products.every(p => !p.rankable)).toBe(true);
  });
  test("identified voids, refunds, modifiers, sides excluded from dish ranking", () => {
    const r = build({ observations: [observation("v", "new", "rudys", 1, "void"), observation("r", "new", "rudys", -1, "refund"), observation("m", "new", "rudys", 3, "modifier"), observation("s")], catalogue: [{ location_id: "rudys", external_item_id: "s", manual_type: "side", manual_drink_type: null, department: "Main" }] });
    expect(r.products.every(p => !p.rankable)).toBe(true);
  });
  test("same product in distinct journal types remains separate, never adds representations", () => {
    const r = build({ observations: [observation("x"), observation("x", "new", "rudys", 7, "cookbook")] });
    expect(r.products).toHaveLength(2); expect(r.products.map(p => p.quantity)).toEqual([5, 7]);
  });
  test("canonical manual drink classification wins over a journal dish-type suggestion", () => {
    const r = build({ catalogue: [{ location_id: "rudys", external_item_id: "item", manual_type: "drink", manual_drink_type: "alcoholic", department: "Main" }] });
    expect(r.products[0].classification).toBe("drink_alcoholic"); expect(r.products[0].category).toBe("dish_drink");
  });
  test("channels require explicit evidence; missing never means dine-in", () => {
    expect(explicitSourceChannel()).toBe("Unknown"); expect(explicitSourceChannel("table 4")).toBe("Unknown");
    expect(explicitSourceChannel("dine_in")).toBe("Dine-in"); expect(explicitSourceChannel("Takeaway")).toBe("Takeaway");
    expect(explicitSourceChannel("Collection")).toBe("Collection"); expect(explicitSourceChannel("Delivery")).toBe("Delivery");
    expect(build().products[0].channel).toBe("Unknown");
  });
  test("stable pagination reads beyond 1000 records", async () => {
    const values = Array.from({ length: 2105 }, (_, i) => i);
    const offsets: number[] = [];
    const r = await readAllProductPages(async (offset, size) => { offsets.push(offset); return { data: values.slice(offset, offset + size), error: null }; });
    expect(r).toHaveLength(2105); expect(offsets).toEqual([0, 1000, 2000]); expect(r[2104]).toBe(2104);
  });
  test("failed page throws rather than returning missing or zero detail", async () => {
    await expect(readAllProductPages(async () => ({ data: null, error: { message: "permission denied" } }))).rejects.toThrow("permission denied");
    await expect(readAllProductPages(async () => ({ data: null, error: null }))).rejects.toThrow("no result");
  });
  test("generic ID reused for many descriptions is never grouped; NO CRUTTON stays 19 and hidden from dishes", () => {
    const descs = ["NO CRUTTON", "NO BUN", "skinny", "WELL DONE", "ASAP", "no sauce"];
    const obs = descs.map((d, i) => ({ ...observation(`g${i}`), product_id: "10000171", product_type: "untyped", description: d, quantity: d === "NO CRUTTON" ? 19 : 10 }));
    const r = build({ observations: [...obs, observation()] });
    const crut = r.products.filter(p => p.productId === "10000171" && p.name === "NO CRUTTON");
    expect(crut).toHaveLength(1); expect(crut[0].quantity).toBe(19); expect(crut[0].category).toBe("kitchen_note");
    expect(r.products.filter(p => p.productId === "10000171")).toHaveLength(6);
    expect(r.products.find(p => p.name === "Caesar Salad")?.category).toBe("dish_drink");
  });
  test("journal rows never carry gross; posted gross and difference vs received are separate", () => {
    const sale = { id: "s", location_id: "rudys", sale_date: "2026-11-25", source: "captiva_xls", dish_id: "d", quantity: 2, name: "Pizza", department: "Pizza", gross: 24, discount: 1 };
    const r = build({ snapshots: [{ ...snapshot(), official_gross: 30, official_orders: 3 }], posted: [sale] });
    expect(r.revenue.postedGross).toBe(24); expect(r.revenue.difference).toBe(6); expect(r.revenue.postedDiscounts).toBe(1);
    expect(build().products[0].gross).toBeNull(); expect(build().revenue.postedGross).toBeNull();
  });
  test("negative quantities count as refunds/adjustments, not dishes", () => {
    expect(build({ observations: [observation("x", "new", "rudys", -2, "combo")] }).products[0].category).toBe("adjustment");
  });
});

import { defaultTradingDay, clampTradingDay, shiftTradingDay, rankProducts } from "../src/lib/productsSold";
describe("trading day selection", () => {
  test("defaults to latest received day in range", () => {
    expect(defaultTradingDay(["2026-11-03", "2026-11-20", "2026-12-01"], "2026-11-01", "2026-11-30", "2026-11-26")).toBe("2026-11-20");
  });
  test("falls back to today capped to range when nothing received", () => {
    expect(defaultTradingDay([], "2026-11-01", "2026-11-30", "2026-11-26")).toBe("2026-11-26");
    expect(defaultTradingDay([], "2026-10-01", "2026-10-31", "2026-11-26")).toBe("2026-10-31");
  });
  test("clamps and shifts across month end", () => {
    expect(clampTradingDay("2026-12-05", "2026-11-01", "2026-11-30")).toBe("2026-11-30");
    expect(shiftTradingDay("2026-10-31", 1)).toBe("2026-11-01");
  });
  test("food/drinks rankings exclude notes and unknown quantities", () => {
    const base = { locationId: "l", productId: "x", source: "Posted" as const, channel: "Unknown" as const, gross: null, discount: null };
    const ps = [
      { ...base, key: "a", name: "Pizza", quantity: 5, classification: "food" as const, rankable: true, category: "dish_drink" as const },
      { ...base, key: "b", name: "Beer", quantity: 9, classification: "drink_alcoholic" as const, rankable: true, category: "dish_drink" as const },
      { ...base, key: "c", name: "NO BUN", quantity: 50, classification: "modifier" as const, rankable: false, category: "kitchen_note" as const },
    ];
    expect(rankProducts(ps, "food", "top").map(p => p.name)).toEqual(["Pizza"]);
    expect(rankProducts(ps, "drinks", "top").map(p => p.name)).toEqual(["Beer"]);
    expect(rankProducts(ps, "both", "bottom").map(p => p.name)).toEqual(["Pizza", "Beer"]);
  });
});
