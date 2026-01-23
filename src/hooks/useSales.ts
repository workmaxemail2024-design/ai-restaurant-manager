import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { format } from "date-fns";

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
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;
  const locationScopeKey = locationId ?? "all";

  return useQuery({
    queryKey: ["sales", restaurantId, locationScopeKey, startDate, endDate],
    queryFn: async () => {
      if (!restaurantId) return [] as Sale[];

      let query = supabase
        .from("sales")
        .select("*, dishes(name, selling_price), locations(name)")
        .eq("restaurant_id", restaurantId)
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
    enabled: !!restaurantId,
  });
}

export function useCreateSale() {
  const queryClient = useQueryClient();
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;

  return useMutation({
    mutationFn: async (sale: SaleInsert) => {
      if (!restaurantId) {
        throw new Error("No active restaurant selected");
      }

      // Enforce business reporting consistency: always write sale_date (YYYY-MM-DD) + restaurant_id.
      const todayLocal = format(new Date(), "yyyy-MM-dd");
      const payload = {
        ...sale,
        restaurant_id: restaurantId,
        sale_date: sale.sale_date ?? todayLocal,
      };

      const { data, error } = await supabase
        .from("sales")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (createdSale) => {
      const createdLocationId = (createdSale as { location_id?: string }).location_id;

      // Scoped invalidation (preferred): refresh the active restaurant and both "all" + this location scope.
      if (restaurantId) {
        queryClient.invalidateQueries({
          predicate: (q) => {
            const root = String(q.queryKey[0] ?? "");
            if (!root) return false;

            const isTargetRoot = ["sales", "dashboard-overview", "profit-metrics"].includes(root);
            if (!isTargetRoot) return false;

            // Normalized keys: [root, restaurantId, locationScopeKey, ...]
            if (q.queryKey[1] !== restaurantId) return false;

            const locKey = q.queryKey[2];
            if (!createdLocationId) return true;
            return locKey === "all" || locKey === createdLocationId;
          },
        });
      }

      // Safety net for any legacy/unscoped keys still used elsewhere.
      queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      queryClient.invalidateQueries({ queryKey: ["profit-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
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
