/**
 * Official Captiva gross takings received per month (captiva_location_days).
 * Read-only evidence, never added to posted P&L revenue. Absent days stay
 * absent (coverage), unknown gross stays unknown — never €0.
 */
export interface ReceivedDayRow { location_id: string; trading_date: string; official_gross: number | string | null }
export interface ReceivedMonth {
  month: string; // yyyy-MM
  gross: number | null;
  /** restaurant-days with a known official gross */
  coveredDays: number;
  /** restaurant-days expected = calendar days (capped at today) × locations in scope */
  expectedDays: number;
  partial: boolean;
}

const daysInMonth = (ym: string) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m, 0).getDate(); };

export function aggregateReceivedByMonth(rows: ReceivedDayRow[], months: string[], locationCount: number, today: string): ReceivedMonth[] {
  const seen = new Set<string>();
  const acc = new Map<string, { gross: number | null; covered: number }>();
  for (const r of rows) {
    const key = `${r.location_id}|${r.trading_date}`;
    if (seen.has(key)) continue; // one row per restaurant + trading date
    seen.add(key);
    const ym = r.trading_date.slice(0, 7);
    const a = acc.get(ym) ?? { gross: null, covered: 0 };
    if (r.official_gross != null && Number.isFinite(Number(r.official_gross))) {
      a.gross = (a.gross ?? 0) + Number(r.official_gross);
      a.covered++;
    }
    acc.set(ym, a);
  }
  return months.map((ym) => {
    const a = acc.get(ym);
    const thisMonth = today.slice(0, 7) === ym;
    const dayCount = ym > today.slice(0, 7) ? 0 : thisMonth ? Number(today.slice(8, 10)) : daysInMonth(ym);
    const expectedDays = dayCount * locationCount;
    const coveredDays = a?.covered ?? 0;
    return { month: ym, gross: a?.gross != null ? Math.round(a.gross * 100) / 100 : null, coveredDays, expectedDays, partial: coveredDays < expectedDays };
  });
}

/** yyyy-MM list: Jan..current month (ytd) or the last n months. */
export function pnlMonths(mode: "ytd" | number, now = new Date()): string[] {
  const y = now.getFullYear(), m = now.getMonth();
  const count = mode === "ytd" ? m + 1 : mode;
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) { const d = new Date(y, m - i, 1); out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); }
  return out;
}
