import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface Sale {
  id: string;
  location_id: string;
  dish_id: string;
  quantity: number;
  total_price: number;
  sale_date: string;
  created_at: string;
  dishes?: { name: string; selling_price: number };
  locations?: { name: string };
}

export type SaleInsert = {
  location_id: string;
  dish_id: string;
  quantity: number;
  total_price: number;
  sale_date?: string;
};

export function useSales(startDate?: string, endDate?: string, locationId?: string | null) {
  return useQuery({
    queryKey: ["sales", startDate, endDate, locationId],
    queryFn: async () => {
      let query = supabase
        .from("sales")
        .select("*, dishes(name, selling_price), locations(name)")
        .order("sale_date", { ascending: false });
      
      if (startDate) {
        query = query.gte("sale_date", startDate);
      }
      if (endDate) {
        query = query.lte("sale_date", endDate);
      }
      if (locationId) {
        query = query.eq("location_id", locationId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as Sale[];
    },
  });
}

export function useCreateSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sale: SaleInsert) => {
      const { data, error } = await supabase
        .from("sales")
        .insert(sale)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // Broad invalidation to catch all dashboard/sales related queries regardless of scope
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["profit-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["dish-costs"] });
      queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
      toast({ title: "Sale recorded successfully" });
    },
    onError: (error) => {
      toast({ title: "Error recording sale", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sales").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      // Broad invalidation to catch all dashboard/sales related queries
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["profit-metrics"] });
      toast({ title: "Sale deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error deleting sale", description: error.message, variant: "destructive" });
    },
  });
}
