/**
 * Rate used ONLY to price manually entered labour hours (Reports ledger) when no
 * attendance cost exists. There is no built-in default: without a valid rate set
 * by the user, manual-hour labour cost is Unknown (null), never an assumed €.
 * Stored per restaurant in this browser (no database column).
 */
const KEY = (restaurantId: string) => `manualLabourRate_${restaurantId}`;

export function parseLabourRate(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n < 1000 ? n : null;
}

export function getManualLabourRate(restaurantId: string | null | undefined): number | null {
  if (!restaurantId || typeof localStorage === "undefined") return null;
  return parseLabourRate(localStorage.getItem(KEY(restaurantId)));
}

export function setManualLabourRate(restaurantId: string, rate: number | null): void {
  if (rate == null) localStorage.removeItem(KEY(restaurantId));
  else localStorage.setItem(KEY(restaurantId), String(rate));
}

/** Cost of manual hours; null (Unknown) when the rate is missing/invalid. */
export function manualLabourCost(hours: number, rate: number | null): number | null {
  if (!(hours > 0)) return 0;
  const r = parseLabourRate(rate);
  return r == null ? null : hours * r;
}
