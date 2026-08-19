/**
 * Shared labour-cost logic for hourly and salaried staff.
 *
 * Documented allocation method
 * ----------------------------
 * Hourly staff : cost = valid worked hours x hourly_rate
 * Salary staff : cost = (annual_salary / 365) x number of calendar days in the
 *                reporting period. Salaried attendance hours are retained for
 *                operational visibility but never priced, so a salaried person
 *                can never be counted twice.
 */

export type PayType = "hourly" | "salary";

/** Calendar days used to spread an annual salary. */
export const SALARY_DAYS_PER_YEAR = 365;

export const SALARY_METHOD_LABEL = `Annual salary ÷ ${SALARY_DAYS_PER_YEAR} days × days in period`;

export function normalisePayType(value: unknown): PayType {
  return value === "salary" ? "salary" : "hourly";
}

/** Daily allocation for one salaried employee. */
export function salaryDailyCost(annualSalary: number | null | undefined): number {
  const annual = Number(annualSalary);
  if (!Number.isFinite(annual) || annual <= 0) return 0;
  return annual / SALARY_DAYS_PER_YEAR;
}

/** Inclusive calendar-day count between two yyyy-MM-dd dates. */
export function calendarDaysInRange(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`).getTime();
  const end = new Date(`${endDate}T00:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 1;
  return Math.round((end - start) / 86_400_000) + 1;
}

export interface SalariedStaffRow {
  id: string;
  annual_salary: number | null;
}

/** Total salaried labour allocated across a reporting period. */
export function allocateSalaryCost(
  staff: SalariedStaffRow[],
  startDate: string,
  endDate: string
): number {
  const days = calendarDaysInRange(startDate, endDate);
  return staff.reduce((sum, s) => sum + salaryDailyCost(s.annual_salary) * days, 0);
}

/** Human-readable explanation of how a cost line was derived. */
export function describeLabourDerivation(input: {
  payType: PayType;
  hours?: number | null;
  hourlyRate?: number | null;
  annualSalary?: number | null;
  days?: number;
}): string {
  if (input.payType === "salary") {
    const days = input.days ?? 1;
    return `Salary allocation: annual salary ÷ ${SALARY_DAYS_PER_YEAR}${days > 1 ? ` × ${days} days` : " (1 day)"}`;
  }
  if (input.hours == null || input.hourlyRate == null) return "Worked hours × hourly rate";
  return `${input.hours.toFixed(2)} h × hourly rate`;
}
