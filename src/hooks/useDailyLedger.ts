import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";

export interface LedgerEntry {
  id?: string;
  entry_date: string;
  location_id: string | null;
  covers: number;
  labour_hours: number;
  additional_expenses: number;
  notes: string;
  is_closed: boolean;
  manual_revenue: number | null;
  manual_orders: number | null;
  covers_unknown: boolean;
  /** Manager explicitly confirmed expenses for the day (incl. "no expenses") */
  expenses_confirmed?: boolean;
}

export type MissingField = "SALES" | "LABOUR_HOURS" | "COVERS" | "EXPENSES" | "BOOKINGS";

export type DayStatus = "accounted" | "partial" | "needs_attention" | "no_data";

export interface DayCompleteness {
  missing: MissingField[];
  isComplete: boolean;
  status: DayStatus;
  /** Which checklist items are present */
  checklist: Record<MissingField, boolean>;
}

/** Evaluate which fields are missing for a day.
 *  Sales & Labour are critical (red if missing).
 *  Covers, Expenses, Bookings are optional (yellow if missing). */
export function evaluateMissing(
  hasSalesData: boolean,
  ledger?: LedgerEntry,
  hasBookings?: boolean,
  /** Covers imported from Captiva (visitor_count from pos_daily_summaries) */
  captivaVisitors?: number | null,
  /** Actual attendance hours already logged for the day (bypasses ledger.labour_hours) */
  actualLabourHours?: number,
): DayCompleteness {
  const missing: MissingField[] = [];

  // Sales: present if actual sales exist, OR day marked closed, OR manual override provided
  const salesOk =
    hasSalesData ||
    ledger?.is_closed ||
    (ledger?.manual_revenue != null && ledger.manual_revenue > 0);
  if (!salesOk) missing.push("SALES");

  // Labour hours: present if ledger has labour_hours > 0 OR actual attendance recorded
  const labourOk = (ledger?.labour_hours ?? 0) > 0 || (actualLabourHours ?? 0) > 0;
  if (!labourOk) missing.push("LABOUR_HOURS");

  // Covers: present if Captiva imported visitors, ledger has covers > 0, OR explicitly marked unknown
  const coversOk =
    (captivaVisitors != null && captivaVisitors > 0) ||
    (ledger?.covers ?? 0) > 0 ||
    ledger?.covers_unknown === true;
  if (!coversOk) missing.push("COVERS");

  // Expenses: present if ledger has additional_expenses entered (even 0 counts if ledger exists)
  const expensesOk = ledger != null;
  if (!expensesOk) missing.push("EXPENSES");

  // Bookings: OPTIONAL. Only relevant if the location uses the booking module.
  // We treat as non-missing so it never triggers "Needs Attention" or Quick Fix.
  const bookingsOk = hasBookings ?? false;
  // NOTE: intentionally not pushed to `missing` — bookings are optional.


  const checklist: Record<MissingField, boolean> = {
    SALES: salesOk,
    LABOUR_HOURS: labourOk,
    COVERS: coversOk,
    EXPENSES: expensesOk,
    BOOKINGS: bookingsOk,
  };

  // Critical fields: SALES and LABOUR_HOURS
  const hasCriticalMissing = missing.includes("SALES") || missing.includes("LABOUR_HOURS");
  const hasAnyData = hasSalesData || ledger != null || hasBookings;

  let status: DayStatus;
  if (ledger?.is_closed) {
    status = "accounted";
  } else if (!hasAnyData) {
    status = "no_data";
  } else if (hasCriticalMissing) {
    status = "needs_attention";
  } else if (missing.length > 0) {
    status = "partial";
  } else {
    status = "accounted";
  }

  return { missing, isComplete: missing.length === 0, status, checklist };
}

export function useDailyLedger(
  startDate: string,
  endDate: string,
  locationId?: string | null
) {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;
  const queryClient = useQueryClient();
  const locationKey = locationId ?? "all";

  const query = useQuery({
    queryKey: ["daily-ledger", restaurantId, locationKey, startDate, endDate],
    queryFn: async () => {
      if (!restaurantId) return new Map<string, LedgerEntry>();

      let q = supabase
        .from("daily_ledger_entries")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .gte("entry_date", startDate)
        .lte("entry_date", endDate);

      if (locationId) {
        q = q.eq("location_id", locationId);
      } else {
        q = q.is("location_id", null);
      }

      const { data, error } = await q;
      if (error) throw error;

      const map = new Map<string, LedgerEntry>();
      for (const row of data || []) {
        map.set(row.entry_date, {
          id: row.id,
          entry_date: row.entry_date,
          location_id: row.location_id,
          covers: row.covers ?? 0,
          labour_hours: Number(row.labour_hours) || 0,
          additional_expenses: Number(row.additional_expenses) || 0,
          notes: row.notes ?? "",
          is_closed: (row as any).is_closed ?? false,
          manual_revenue: (row as any).manual_revenue != null ? Number((row as any).manual_revenue) : null,
          manual_orders: (row as any).manual_orders != null ? Number((row as any).manual_orders) : null,
          covers_unknown: (row as any).covers_unknown ?? false,
          expenses_confirmed: (row as any).expenses_confirmed ?? false,
        });
      }
      return map;
    },
    enabled: !!restaurantId,
  });

  const upsertMutation = useMutation({
    mutationFn: async (entry: LedgerEntry) => {
      if (!restaurantId) throw new Error("No restaurant");

      const payload = {
        restaurant_id: restaurantId,
        location_id: locationId || null,
        entry_date: entry.entry_date,
        covers: entry.covers,
        labour_hours: entry.labour_hours,
        additional_expenses: entry.additional_expenses,
        notes: entry.notes,
        is_closed: entry.is_closed,
        manual_revenue: entry.manual_revenue,
        manual_orders: entry.manual_orders,
        covers_unknown: entry.covers_unknown,
        expenses_confirmed: entry.expenses_confirmed ?? false,
      };

      const { error } = await supabase
        .from("daily_ledger_entries")
        .upsert(payload, { onConflict: "restaurant_id,location_id,entry_date" });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["daily-ledger", restaurantId, locationKey, startDate, endDate],
      });
    },
  });

  return {
    entries: query.data || new Map<string, LedgerEntry>(),
    isLoading: query.isLoading,
    upsert: upsertMutation.mutate,
    isSaving: upsertMutation.isPending,
  };
}
