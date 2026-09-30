/**
 * Batch → per-portion recipe conversion (input helper only).
 * Stays within the entered unit's dimension; never converts weight ↔ volume ↔ each.
 */
export type BatchUnit = "g" | "kg" | "oz" | "ml" | "L" | "each";

const round = (n: number) => Math.round(n * 1000) / 1000;

export function batchToPortion(
  batchQty: number | null,
  unit: string,
  portions: number | null
): { quantity: number; unit: BatchUnit } | null {
  if (batchQty == null || !(batchQty > 0) || portions == null || !(portions > 0)) return null;
  const per = batchQty / portions;
  switch (unit) {
    case "kg": return per < 1 ? { quantity: round(per * 1000), unit: "g" } : { quantity: round(per), unit: "kg" };
    case "L": return per < 1 ? { quantity: round(per * 1000), unit: "ml" } : { quantity: round(per), unit: "L" };
    case "g": case "oz": case "ml": case "each":
      return { quantity: round(per), unit: unit as BatchUnit };
    default: return null;
  }
}

/** Accepts "6.4", "6,4"; strips leading zeros so "06.4" never appears. */
export function cleanDecimal(v: string) {
  return v.replace(",", ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1").replace(/^0+(?=\d)/, "");
}
export function parseDecimal(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
