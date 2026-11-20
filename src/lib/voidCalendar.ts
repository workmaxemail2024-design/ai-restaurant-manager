/** Void register calendar: Monday-first month grid and per-day review status. */
export type VoidDayStatus = "open" | "clear" | "resolved" | "unknown" | "future";

export const VOID_STATUS_LABEL: Record<VoidDayStatus, string> = {
  open: "Needs review",
  clear: "No voids",
  resolved: "All resolved",
  unknown: "Not confirmed",
  future: "Future",
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Weeks (Mon..Sun) covering the month; days outside the month are null. */
export function monthGrid(year: number, month0: number): (string | null)[][] {
  const first = new Date(year, month0, 1);
  const days = new Date(year, month0 + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(iso(new Date(year, month0, d)));
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export interface DayInputs {
  date: string;
  today: string;
  /** location ids in scope */
  locationIds: string[];
  /** location ids with a confirmed complete journal for this date */
  completeLocationIds: Set<string>;
  /** review_status per void event on this date (null = never reviewed) */
  eventStatuses: Array<string | null>;
}

export function voidDayStatus(i: DayInputs): { status: VoidDayStatus; open: number; total: number } {
  const total = i.eventStatuses.length;
  const open = i.eventStatuses.filter((s) => s !== "resolved").length;
  if (open > 0) return { status: "open", open, total };
  if (i.date > i.today) return { status: "future", open, total };
  const complete = i.locationIds.length > 0 && i.locationIds.every((l) => i.completeLocationIds.has(l));
  if (!complete) return { status: "unknown", open, total };
  return { status: total === 0 ? "clear" : "resolved", open, total };
}
