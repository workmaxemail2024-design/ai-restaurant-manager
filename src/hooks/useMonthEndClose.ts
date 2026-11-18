import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import type { CloseRecord, ItemStatus } from "@/lib/monthEndClose";

export interface MonthEndCloseRow extends CloseRecord {
  id: string;
  location_id: string;
  period_month: string;
  reopened_reason: string | null;
  updated_at: string;
}

/** Month-end checklist rows for one month (all locations the user can see). */
export function useMonthEndCloses(periodMonth: string) {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;
  return useQuery({
    queryKey: ["month-end-closes", restaurantId, "all", periodMonth, periodMonth],
    enabled: !!restaurantId && !!periodMonth,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("month_end_closes")
        .select("id, location_id, period_month, items, confirmed_at, reopened_reason, updated_at")
        .eq("restaurant_id", restaurantId)
        .eq("period_month", periodMonth);
      if (error) throw error;
      return (data ?? []) as MonthEndCloseRow[];
    },
  });
}

type Action =
  | { action: "save"; itemKey: string; status: ItemStatus; note?: string | null }
  | { action: "confirm" }
  | { action: "reopen"; reason: string };

/** All writes go through save_month_end_close (Owner / Finance Edit, tenant + location checked). */
export function useSaveMonthEndClose() {
  const qc = useQueryClient();
  const { currentRestaurant } = useRestaurant();
  return useMutation({
    mutationFn: async (input: { locationId: string; periodMonth: string } & Action) => {
      if (!currentRestaurant?.id) throw new Error("No restaurant selected");
      const { error } = await (supabase as any).rpc("save_month_end_close", {
        p_restaurant_id: currentRestaurant.id,
        p_location_id: input.locationId,
        p_period_month: input.periodMonth,
        p_action: input.action,
        p_item_key: input.action === "save" ? input.itemKey : null,
        p_item_status: input.action === "save" ? input.status : null,
        p_note: input.action === "save" ? input.note ?? null : null,
        p_reason: input.action === "reopen" ? input.reason : null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["month-end-closes"] });
      if (v.action === "confirm") toast.success("Month confirmed");
      else if (v.action === "reopen") toast.success("Month reopened");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
