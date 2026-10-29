/** Pure helpers for the Supplier Invoice review (no I/O). */

export type Cell = { value: string | null; status: "clear" | "unclear" | "absent"; raw: string | null };

const FACTOR: Record<string, { base: string; f: number }> = {
  g: { base: "g", f: 1 }, kg: { base: "g", f: 1000 },
  ml: { base: "ml", f: 1 }, L: { base: "ml", f: 1000 },
  each: { base: "each", f: 1 },
};

export interface InvoiceLineDraft {
  key: string;
  description: string;
  product_code: string;
  quantity: string;
  pack_size: string;
  pack_unit: string;
  unit_price: string;
  line_total: string;
  vat_rate: string;
  is_stock: boolean;
  ingredient_id: string | null;
  supplier_product_id: string | null;
  stock_quantity: string;
  match_status: "exact" | "confirmed" | "non_stock" | "unresolved";
  /** Fields the reader could not read clearly; must be checked by the user. */
  unclear: string[];
}

export const num = (s: string | null | undefined): number | null => {
  if (s == null) return null;
  const t = String(s).replace(/€/g, "").replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * Stock quantity in the inventory item's own unit: quantity × pack size, converted.
 * Returns null when units are incompatible or information is missing (never guessed).
 */
export function stockQuantityFor(
  quantity: number | null,
  packSize: number | null,
  packUnit: string | null,
  itemUnit: string | null,
): number | null {
  if (quantity == null || quantity < 0 || !itemUnit) return null;
  if (packSize == null || !packUnit) return itemUnit === "each" ? quantity : null;
  const from = FACTOR[packUnit];
  const to = FACTOR[itemUnit];
  if (!from || !to || from.base !== to.base) return null;
  return Math.round(((quantity * packSize * from.f) / to.f) * 1e6) / 1e6;
}

/** Same rule the server applies before verifying: lines must add up to net (or gross) within 5 cents. */
export function totalsReconcile(lines: { line_total: string }[], net: number | null, gross: number | null): { ok: boolean; sum: number } {
  const sum = Math.round(lines.reduce((t, l) => t + (num(l.line_total) ?? 0), 0) * 100) / 100;
  const target = net ?? gross;
  if (target == null) return { ok: false, sum };
  return { ok: Math.abs(sum - target) <= 0.05 || (gross != null && Math.abs(sum - gross) <= 0.05), sum };
}

export interface SupplierProductRef {
  id: string;
  ingredient_id: string;
  product_name: string;
  product_code: string | null;
  pack_size: number | null;
  pack_unit: string | null;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Exact match only: same supplier code, or same description AND same pack.
 * Anything else stays unresolved for the user to confirm (never a silent remap).
 */
export function matchSupplierProduct(
  line: { description: string; product_code: string; pack_size: string; pack_unit: string },
  products: SupplierProductRef[],
): SupplierProductRef | null {
  const code = line.product_code.trim().toLowerCase();
  if (code) {
    const byCode = products.filter((p) => (p.product_code ?? "").trim().toLowerCase() === code);
    if (byCode.length === 1) return byCode[0];
    if (byCode.length > 1) return null;
  }
  const d = norm(line.description);
  const size = num(line.pack_size);
  const hits = products.filter(
    (p) => norm(p.product_name) === d && (p.pack_size ?? null) === size && (p.pack_unit ?? "") === (line.pack_unit || ""),
  );
  return hits.length === 1 ? hits[0] : null;
}

export function lineIsReady(l: InvoiceLineDraft): boolean {
  if (l.unclear.length > 0) return false;
  if (num(l.line_total) == null) return false;
  if (!l.is_stock) return true;
  return !!l.ingredient_id && num(l.stock_quantity) != null;
}
