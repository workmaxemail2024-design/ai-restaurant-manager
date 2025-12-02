import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface Location {
  id: string;
  name: string;
  address: string | null;
  created_at: string;
  updated_at: string;
}

export type LocationInsert = Omit<Location, "id" | "created_at" | "updated_at">;

export function useLocations() {
  return useQuery({
    queryKey: ["locations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Location[];
    },
  });
}

export function useCreateLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (location: LocationInsert) => {
      const { data, error } = await supabase
        .from("locations")
        .insert(location)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      toast({ title: "Location created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error creating location", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...location }: Partial<Location> & { id: string }) => {
      const { data, error } = await supabase
        .from("locations")
        .update(location)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      toast({ title: "Location updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Error updating location", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("locations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      toast({ title: "Location deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error deleting location", description: error.message, variant: "destructive" });
    },
  });
}
