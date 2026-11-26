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
    expect(r.products[0].classification).toBe("drink_alcoholic"); expect(r.products[0].rankable).toBe(false);
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
});