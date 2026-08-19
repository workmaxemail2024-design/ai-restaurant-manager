import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { normalisePayType, salaryDailyCost, describeLabourDerivation, type PayType } from "@/lib/labour";

export interface DayAttendanceRow {
  id: string;
  staff_id: string;
  location_id: string;
  clock_in: string;
  clock_out: string | null;
  source: string;
  staffName: string;
  hourlyRate: number | null;
  hours: number | null;
  cost: number | null;
  issue: "open" | "negative" | "long" | null;
  payType: PayType;
  annualSalary: number | null;
  derivation: string;
}

/** One salaried employee's allocated cost for the day. */
export interface SalariedLabourRow {
  staffId: string;
  staffName: string;
  annualSalary: number | null;
  cost: number;
  derivation: string;
}

export const LONG_SHIFT_HOURS = 14;

function computeIssue(hours: number | null, clockOut: string | null): DayAttendanceRow["issue"] {
  if (!clockOut) return "open";
  if (hours == null || hours <= 0) return "negative";
  if (hours > LONG_SHIFT_HOURS) return "long";
  return null;
}

/** Attendance + labour cost for a single day / location (dashboard review). */
export function useDayLabour(date: string, locationId: string | null) {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;

  return useQuery({
    queryKey: ["day-labour", restaurantId, locationId ?? "all", date, date],
    queryFn: async () => {
      if (!restaurantId)
        return {
          rows: [] as DayAttendanceRow[],
          salariedRows: [] as SalariedLabourRow[],
          totalHours: 0,
          hourlyCost: 0,
          salaryCost: 0,
          totalCost: 0,
          canSeeRates: false,
        };

      let q = supabase
        .from("staff_attendance")
        .select("id, staff_id, location_id, clock_in, clock_out, source")
        .eq("restaurant_id", restaurantId)
        .gte("clock_in", `${date}T00:00:00`)
        .lte("clock_in", `${date}T23:59:59`)
        .order("clock_in", { ascending: true });

      if (locationId) q = q.eq("location_id", locationId);

      const { data: attendance, error } = await q;
      if (error) throw error;

      const rowsRaw = attendance ?? [];
      const staffIds = Array.from(new Set(rowsRaw.map((r) => r.staff_id)));

      // staff_safe masks hourly_rate for users without permission
      let staffMap = new Map<
        string,
        { name: string; rate: number | null; payType: PayType; annualSalary: number | null }
      >();
      let canSeeRates = false;
      if (staffIds.length > 0) {
        const { data: staff } = await supabase
          .from("staff_safe")
          .select("id, first_name, last_name, hourly_rate, pay_type, annual_salary")
          .in("id", staffIds);
        for (const s of staff ?? []) {
          const rate = (s as any).hourly_rate;
          const salary = (s as any).annual_salary;
          if (rate != null || salary != null) canSeeRates = true;
          staffMap.set((s as any).id, {
            name: `${(s as any).first_name ?? ""} ${(s as any).last_name ?? ""}`.trim() || "Unknown",
            rate: rate != null ? Number(rate) : null,
            payType: normalisePayType((s as any).pay_type),
            annualSalary: salary != null ? Number(salary) : null,
          });
        }
      }

      // Salaried staff are allocated a daily share of salary regardless of attendance.
      let salariedQuery = supabase
        .from("staff_safe")
        .select("id, first_name, last_name, annual_salary, pay_type, location_id")
        .eq("pay_type", "salary")
        .eq("status", "active");
      if (locationId) salariedQuery = salariedQuery.eq("location_id", locationId);
      const { data: salariedStaff } = await salariedQuery;

      const salariedRows: SalariedLabourRow[] = (salariedStaff ?? []).map((s: any) => {
        const annual = s.annual_salary != null ? Number(s.annual_salary) : null;
        if (annual != null) canSeeRates = true;
        return {
          staffId: s.id,
          staffName: `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || "Unknown",
          annualSalary: annual,
          cost: salaryDailyCost(annual),
          derivation: describeLabourDerivation({ payType: "salary", annualSalary: annual, days: 1 }),
        };
      });
      const salaryCost = salariedRows.reduce((sum, r) => sum + r.cost, 0);

      let totalHours = 0;
      let totalCost = 0;

      const rows: DayAttendanceRow[] = rowsRaw.map((r) => {
        const info = staffMap.get(r.staff_id);
        const hours = r.clock_out
          ? (new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime()) / 3_600_000
          : null;
        const payType = info?.payType ?? "hourly";
        const rate = payType === "salary" ? null : info?.rate ?? null;
        // Salaried attendance is kept for visibility but never priced here (no double counting).
        const cost = payType === "salary" ? null : hours != null && hours > 0 && rate != null ? hours * rate : null;
        if (hours != null && hours > 0) totalHours += hours;
        if (cost != null) totalCost += cost;
        return {
          id: r.id,
          staff_id: r.staff_id,
          location_id: r.location_id,
          clock_in: r.clock_in,
          clock_out: r.clock_out,
          source: r.source,
          staffName: info?.name ?? "Unknown",
          hourlyRate: rate,
          hours,
          cost,
          issue: computeIssue(hours, r.clock_out),
          payType,
          annualSalary: info?.annualSalary ?? null,
          derivation: describeLabourDerivation({
            payType,
            hours,
            hourlyRate: rate,
            annualSalary: info?.annualSalary ?? null,
            days: 1,
          }),
        };
      });

      return {
        rows,
        salariedRows,
        totalHours,
        hourlyCost: totalCost,
        salaryCost,
        totalCost: totalCost + salaryCost,
        canSeeRates,
      };
    },
    enabled: !!restaurantId && !!date,
  });
}

/** Correct an existing attendance record (clock-in / clock-out). */
export function useUpdateAttendanceTimes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; clock_in: string; clock_out: string | null }) => {
      const { error } = await supabase
        .from("staff_attendance")
        .update({ clock_in: input.clock_in, clock_out: input.clock_out })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["day-labour"] });
      queryClient.invalidateQueries({ queryKey: ["staff-attendance"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      toast({ title: "Attendance updated" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not update attendance", description: e.message, variant: "destructive" }),
  });
}

/**
 * Record actual worked hours for one staff member on a past day when no POS
 * attendance was imported. Stored as a normal manual attendance record so all
 * existing labour calculations apply unchanged.
 */
export function useAddManualAttendance() {
  const queryClient = useQueryClient();
  const { currentRestaurant } = useRestaurant();
  return useMutation({
    mutationFn: async (input: {
      staff_id: string;
      location_id: string;
      date: string;
      hours: number;
    }) => {
      if (!currentRestaurant?.id) throw new Error("No restaurant selected");
      const clockIn = new Date(`${input.date}T09:00:00`);
      const clockOut = new Date(clockIn.getTime() + input.hours * 3_600_000);
      const { error } = await supabase.from("staff_attendance").insert({
        restaurant_id: currentRestaurant.id,
        staff_id: input.staff_id,
        location_id: input.location_id,
        clock_in: clockIn.toISOString(),
        clock_out: clockOut.toISOString(),
        source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["day-labour"] });
      queryClient.invalidateQueries({ queryKey: ["staff-attendance"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      toast({ title: "Labour hours recorded" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not record hours", description: e.message, variant: "destructive" }),
  });
}

