import { supabase } from "@/integrations/supabase/client";
import { allocateSalaryCost, salaryDailyCost, calendarDaysInRange } from "@/lib/labour";

export interface SalaryAllocation {
  /** Total salaried cost allocated across the whole period. */
  total: number;
  /** Salaried cost attributable to a single calendar day. */
  perDay: number;
  days: number;
  staffCount: number;
}

/**
 * Salaried labour allocated for a period, scoped to restaurant + optional location.
 * Method: annual_salary / 365 x calendar days in the period.
 */
export async function fetchSalaryAllocation(
  restaurantId: string,
  locationId: string | null,
  startDate: string,
  endDate: string
): Promise<SalaryAllocation> {
  let q = supabase
    .from("staff_safe")
    .select("id, annual_salary, pay_type, status, location_id")
    .eq("pay_type", "salary")
    .eq("status", "active");
  if (locationId) q = q.eq("location_id", locationId);

  const { data } = await q;
  const rows = (data ?? []).map((s: any) => ({
    id: s.id,
    annual_salary: s.annual_salary != null ? Number(s.annual_salary) : null,
  }));

  return {
    total: allocateSalaryCost(rows, startDate, endDate),
    perDay: rows.reduce((sum, r) => sum + salaryDailyCost(r.annual_salary), 0),
    days: calendarDaysInRange(startDate, endDate),
    staffCount: rows.length,
  };
}

/** True when an attendance-joined staff row is salaried (never priced hourly). */
export function isSalariedStaffRow(staff: unknown): boolean {
  return (staff as { pay_type?: string } | null)?.pay_type === "salary";
}
