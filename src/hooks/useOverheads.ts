import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { toast } from "sonner";

export const OVERHEAD_CATEGORIES = ['Rent', 'Utilities', 'Insurance', 'Marketing', 'Software', 'Other'] as const;
export const OVERHEAD_FREQUENCIES = ['daily', 'weekly', 'monthly'] as const;

export type OverheadCategory = typeof OVERHEAD_CATEGORIES[number];
export type OverheadFrequency = typeof OVERHEAD_FREQUENCIES[number];

export interface Overhead {
  id: string;
  restaurant_id: string;
  location_id: string | null;
  name: string;
  category: OverheadCategory;
  amount: number;
  frequency: OverheadFrequency;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  locations?: { name: string } | null;
}

export interface OverheadInsert {
  name: string;
  category: OverheadCategory;
  amount: number;
  frequency: OverheadFrequency;
  location_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_active?: boolean;
}

export interface OverheadUpdate extends Partial<OverheadInsert> {
  id: string;
}

export function useOverheads(locationId?: string | null) {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;

  return useQuery({
    queryKey: ["overheads", restaurantId, locationId],
    queryFn: async () => {
      if (!restaurantId) return [];
      
      // Build query - get all overheads for restaurant
      let query = supabase
        .from("overheads")
        .select("*, locations(name)")
        .eq("restaurant_id", restaurantId)
        .order("name", { ascending: true });
      
      // If specific location selected, get both:
      // - overheads with that location_id
      // - overheads with location_id = null (global)
      if (locationId) {
        query = query.or(`location_id.eq.${locationId},location_id.is.null`);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as Overhead[];
    },
    enabled: !!restaurantId,
  });
}

export function useCreateOverhead() {
  const queryClient = useQueryClient();
  const { currentRestaurant } = useRestaurant();

  return useMutation({
    mutationFn: async (overhead: OverheadInsert) => {
      if (!currentRestaurant?.id) throw new Error("No restaurant selected");

      const { data, error } = await supabase
        .from("overheads")
        .insert({
          ...overhead,
          restaurant_id: currentRestaurant.id,
          location_id: overhead.location_id || null,
        })
        .select("*, locations(name)")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overheads"] });
      queryClient.invalidateQueries({ queryKey: ["profit-metrics"] });
      toast.success("Overhead created successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to create overhead: ${error.message}`);
    },
  });
}

export function useUpdateOverhead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: OverheadUpdate) => {
      const { data, error } = await supabase
        .from("overheads")
        .update(updates)
        .eq("id", id)
        .select("*, locations(name)")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overheads"] });
      queryClient.invalidateQueries({ queryKey: ["profit-metrics"] });
      toast.success("Overhead updated successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update overhead: ${error.message}`);
    },
  });
}

export function useDeleteOverhead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("overheads")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overheads"] });
      queryClient.invalidateQueries({ queryKey: ["profit-metrics"] });
      toast.success("Overhead deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete overhead: ${error.message}`);
    },
  });
}
