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
        .select("id, location_id, period_month, items, confirmed_at, confirmed_by, confirmation_skipped, confirmation_limitations, reopened_reason, updated_at")
        .eq("restaurant_id", restaurantId)
        .eq("period_month", periodMonth);
      if (error) throw error;
      return (data ?? []) as MonthEndCloseRow[];
    },
  });
}

type Action =
  | { action: "save"; itemKey: string; status: ItemStatus; note?: string | null }
  | { action: "confirm"; acknowledgeSkipped: boolean; limitations: string }
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
        p_acknowledge_skipped: input.action === "confirm" ? input.acknowledgeSkipped : false,
        p_limitations: input.action === "confirm" ? input.limitations || null : null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["month-end-closes"] });
      qc.invalidateQueries({ queryKey: ["month-end-close-events"] });
      if (v.action === "confirm") toast.success("Month confirmed");
      else if (v.action === "reopen") toast.success("Month reopened");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export interface MonthEndCloseEvent {
  id: string; location_id: string; action: "save" | "confirm" | "reopen"; item_key: string | null; item_status: string | null;
  skipped_items: string[] | null; limitations: string | null; reason: string | null; actor: string | null; created_at: string;
  actor_name?: string | null;
}

/** Append-only confirm/reopen history for one month (who, when, skipped items, limitations). */
export function useMonthEndCloseEvents(periodMonth: string) {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;
  return useQuery({
    queryKey: ["month-end-close-events", restaurantId, "all", periodMonth, periodMonth],
    enabled: !!restaurantId && !!periodMonth,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("month_end_close_events")
        .select("id, location_id, action, item_key, item_status, skipped_items, limitations, reason, actor, created_at")
        .eq("restaurant_id", restaurantId)
        .eq("period_month", periodMonth)
        .in("action", ["confirm", "reopen"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as MonthEndCloseEvent[];
      const ids = [...new Set(rows.map((r) => r.actor).filter(Boolean))] as string[];
      if (ids.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        const names = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]));
        for (const r of rows) r.actor_name = r.actor ? names.get(r.actor) ?? null : null;
      }
      return rows;
    },
  });
}

export interface LocationSalesCoverage { salesDays: number; fullDetailDays: number }

/** Days with POS data per location for one month (deduplicated by date across providers). */
export function useMonthSalesCoverage(periodMonth: string) {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;
  const end = (() => { const d = new Date(`${periodMonth}T00:00:00`); d.setMonth(d.getMonth() + 1); d.setDate(0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
  return useQuery({
    queryKey: ["month-sales-coverage", restaurantId, "all", periodMonth, end],
    enabled: !!restaurantId && !!periodMonth,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_daily_summaries")
        .select("location_id, report_date, has_product_detail, has_summary_report")
        .eq("restaurant_id", restaurantId!)
        .gte("report_date", periodMonth)
        .lte("report_date", end);
      if (error) throw error;
      const byLoc = new Map<string, Map<string, { p: boolean; s: boolean }>>();
      for (const r of data ?? []) {
        if (!r.location_id) continue;
        const days = byLoc.get(r.location_id) ?? new Map();
        const d = days.get(r.report_date) ?? { p: false, s: false };
        days.set(r.report_date, { p: d.p || r.has_product_detail, s: d.s || r.has_summary_report });
        byLoc.set(r.location_id, days);
      }
      const out: Record<string, LocationSalesCoverage> = {};
      for (const [loc, days] of byLoc) out[loc] = { salesDays: days.size, fullDetailDays: [...days.values()].filter((d) => d.p && d.s).length };
      return out;
    },
  });
}
