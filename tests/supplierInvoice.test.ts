import { describe, expect, it } from "bun:test";
import { matchSupplierProduct, stockQuantityFor, totalsReconcile } from "../src/lib/supplierInvoice";

describe("stockQuantityFor", () => {
  it("converts 3 packs of 5 kg into 15 kg", () => expect(stockQuantityFor(3, 5, "kg", "kg")).toBe(15));
  it("converts 2 packs of 500 g into 1 kg", () => expect(stockQuantityFor(2, 500, "g", "kg")).toBe(1));
  it("refuses kg into litres", () => expect(stockQuantityFor(2, 5, "kg", "L")).toBeNull());
  it("refuses a missing pack for weighed items", () => expect(stockQuantityFor(2, null, null, "kg")).toBeNull());
});

describe("totalsReconcile", () => {
  it("accepts lines within 5 cents of net", () => expect(totalsReconcile([{ line_total: "60" }, { line_total: "40,03" }], 100, 121).ok).toBe(true));
  it("rejects a 1 euro gap", () => expect(totalsReconcile([{ line_total: "99" }], 100, 121).ok).toBe(false));
});

describe("matchSupplierProduct", () => {
  const products = [
    { id: "a", ingredient_id: "i1", product_name: "Beef mince", product_code: "B1", pack_size: 5, pack_unit: "kg" },
    { id: "b", ingredient_id: "i1", product_name: "Beef mince", product_code: null, pack_size: 10, pack_unit: "kg" },
  ];
  it("matches by supplier code", () =>
    expect(matchSupplierProduct({ description: "x", product_code: "b1", pack_size: "", pack_unit: "" }, products)?.id).toBe("a"));
  it("does not match a different pack size by description", () =>
    expect(matchSupplierProduct({ description: "Beef mince", product_code: "", pack_size: "2", pack_unit: "kg" }, products)).toBeNull());
  it("matches description with the same pack", () =>
    expect(matchSupplierProduct({ description: "beef  mince", product_code: "", pack_size: "10", pack_unit: "kg" }, products)?.id).toBe("b"));
});
