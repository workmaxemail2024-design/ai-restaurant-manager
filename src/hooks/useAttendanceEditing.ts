import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useRestaurant } from "@/contexts/RestaurantContext";

export interface AttendanceRecordLike {
  id: string;
  staff_id: string;
  location_id: string;
  clock_in: string;
  clock_out: string | null;
  source: string;
  is_corrected?: boolean | null;
  original_clock_in?: string | null;
  original_clock_out?: string | null;
  original_source?: string | null;
}

export interface AttendanceCorrection {
  staff_id: string;
  location_id: string;
  clock_in: string;
  clock_out: string | null;
}

/** Every surface that shows labour hours / cost. */
const LABOUR_QUERY_KEYS = [
  ["staff-attendance"],
  ["day-labour"],
  ["dashboard-overview"],
  ["daily-financial-summary"],
  ["daily-ledger"],
  ["profit-metrics"],
  ["financial-reports"],
  ["data-coverage"],
  ["audit-logs"],
];

function useLabourRefresh() {
  const queryClient = useQueryClient();
  return () => LABOUR_QUERY_KEYS.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
}

/**
 * Correct an attendance record. Imported (POS/Captiva) records keep their
 * original values and source so the import remains auditable — the record is
 * flagged as an override instead of being overwritten silently.
 */
export function useCorrectAttendance() {
  const refresh = useLabourRefresh();
  const { currentRestaurant } = useRestaurant();

  return useMutation({
    mutationFn: async ({
      record,
      changes,
      reason,
    }: {
      record: AttendanceRecordLike;
      changes: AttendanceCorrection;
      reason?: string;
    }) => {
      const { data: userData } = await supabase.auth.getUser();

      const update: Record<string, unknown> = {
        staff_id: changes.staff_id,
        location_id: changes.location_id,
        clock_in: changes.clock_in,
        clock_out: changes.clock_out,
        is_corrected: true,
        corrected_at: new Date().toISOString(),
        corrected_by: userData.user?.id ?? null,
      };

      // Preserve the first-seen imported values only once.
      if (!record.is_corrected) {
        update.original_clock_in = record.clock_in;
        update.original_clock_out = record.clock_out;
        update.original_source = record.source;
      }

      const { error } = await supabase.from("staff_attendance").update(update).eq("id", record.id);
      if (error) throw error;

      if (currentRestaurant?.id) {
        await supabase.rpc("log_audit_event", {
          p_restaurant_id: currentRestaurant.id,
          p_event_type: "attendance_correction",
          p_description: `Attendance record corrected${reason ? `: ${reason}` : ""}`,
          p_data: {
            attendance_id: record.id,
            reason: reason ?? null,
            old_values: {
              staff_id: record.staff_id,
              location_id: record.location_id,
              clock_in: record.clock_in,
              clock_out: record.clock_out,
              source: record.source,
            },
            new_values: { ...changes },
          },
        });
      }
    },
    onSuccess: () => {
      refresh();
      toast({ title: "Attendance corrected", description: "Labour hours and costs have been recalculated." });
    },
    onError: (error: Error) =>
      toast({ title: "Could not correct attendance", description: error.message, variant: "destructive" }),
  });
}

/** Delete an attendance record. Only allowed for non-imported records. */
export function useDeleteAttendance() {
  const refresh = useLabourRefresh();
  const { currentRestaurant } = useRestaurant();

  return useMutation({
    mutationFn: async ({ record, reason }: { record: AttendanceRecordLike; reason?: string }) => {
      const originSource = (record.original_source ?? record.source ?? "").toLowerCase();
      if (originSource === "pos") {
        throw new Error("POS-imported attendance cannot be deleted. Correct the record instead.");
      }

      const { error } = await supabase.from("staff_attendance").delete().eq("id", record.id);
      if (error) throw error;

      if (currentRestaurant?.id) {
        await supabase.rpc("log_audit_event", {
          p_restaurant_id: currentRestaurant.id,
          p_event_type: "attendance_deleted",
          p_description: `Attendance record deleted${reason ? `: ${reason}` : ""}`,
          p_data: {
            attendance_id: record.id,
            reason: reason ?? null,
            old_values: {
              staff_id: record.staff_id,
              location_id: record.location_id,
              clock_in: record.clock_in,
              clock_out: record.clock_out,
              source: record.source,
            },
            new_values: null,
          },
        });
      }
    },
    onSuccess: () => {
      refresh();
      toast({ title: "Attendance record removed", description: "Labour hours and costs have been recalculated." });
    },
    onError: (error: Error) =>
      toast({ title: "Could not remove record", description: error.message, variant: "destructive" }),
  });
}
