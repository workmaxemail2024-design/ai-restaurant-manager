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
