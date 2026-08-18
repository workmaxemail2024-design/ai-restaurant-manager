import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useRestaurant } from "@/contexts/RestaurantContext";

export const DAILY_EXPENSE_CATEGORIES = [
  "Emergency Purchase",
  "Repairs / Maintenance",
  "Cleaning",
  "Delivery / Taxi",
  "Petty Cash",
  "Staff / Meals",
  "Other",
] as const;

export type DailyExpenseCategory = typeof DAILY_EXPENSE_CATEGORIES[number];

export interface DailyExpense {
  id: string;
  restaurant_id: string;
  location_id: string;
  entry_date: string;
  amount: number;
  category: string;
  note: string | null;
  document_id: string | null;
  created_at: string;
}

/** Detailed expense rows for a single day + location.
 *  daily_ledger_entries.additional_expenses stays as the derived total (DB trigger). */
export function useDailyExpenses(date: string, locationId: string | null) {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;

  return useQuery({
    queryKey: ["daily-expenses", restaurantId, locationId ?? "all", date],
    queryFn: async () => {
      if (!restaurantId) return [] as DailyExpense[];
      let query = supabase
        .from("daily_expenses")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("entry_date", date)
        .order("created_at", { ascending: false });

      if (locationId) query = query.eq("location_id", locationId);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as DailyExpense[];
    },
    enabled: !!restaurantId && !!date,
  });
}

export interface CreateDailyExpenseInput {
  locationId: string;
  entryDate: string;
  amount: number;
  category: string;
  note: string | null;
  documentId?: string | null;
}

export function useCreateDailyExpense() {
  const queryClient = useQueryClient();
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;

  return useMutation({
    mutationFn: async (input: CreateDailyExpenseInput) => {
      if (!restaurantId) throw new Error("No restaurant selected");
      const { data, error } = await supabase
        .from("daily_expenses")
        .insert({
          restaurant_id: restaurantId,
          location_id: input.locationId,
          entry_date: input.entryDate,
          amount: input.amount,
          category: input.category,
          note: input.note,
          document_id: input.documentId ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as DailyExpense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["daily-ledger"] });
      toast({ title: "Expense recorded" });
    },
    onError: (error: Error) => {
      toast({ title: "Could not save expense", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteDailyExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("daily_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["daily-ledger"] });
    },
  });
}
