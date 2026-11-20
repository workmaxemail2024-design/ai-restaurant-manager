/** English ordinal date labels used across Reports and Voids. */
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

const parts = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
};

/** "1st November 2026"; withWeekday → "Sun 1st November 2026". */
export function formatOrdinalDate(iso: string, withWeekday = false): string {
  const { y, m, d, wd } = parts(iso);
  return `${withWeekday ? WEEKDAYS[wd] + " " : ""}${ordinal(d)} ${MONTHS[m - 1]} ${y}`;
}

/** "1st–11th November 2026", "28th October – 3rd November 2026", "30th December 2026 – 2nd January 2027". */
export function formatOrdinalRange(start: string, end: string): string {
  if (start === end) return formatOrdinalDate(start);
  const a = parts(start), b = parts(end);
  if (a.y !== b.y) return `${formatOrdinalDate(start)} – ${formatOrdinalDate(end)}`;
  if (a.m !== b.m) return `${ordinal(a.d)} ${MONTHS[a.m - 1]} – ${ordinal(b.d)} ${MONTHS[b.m - 1]} ${b.y}`;
  return `${ordinal(a.d)}–${ordinal(b.d)} ${MONTHS[a.m - 1]} ${a.y}`;
}

export const monthLabel = (y: number, m0: number) => `${MONTHS[m0]} ${y}`;
